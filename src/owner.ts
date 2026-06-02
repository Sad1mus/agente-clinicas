import OpenAI from 'openai';
import type { Clinic } from './types.js';
import { config } from './config.js';
import { supabase } from './db.js';
import { generarReporteSemanal } from './reports.js';
import { planIncluye } from './plans.js';

// Cliente LLM para interpretar los cambios de /editar (mismo OpenRouter del cerebro).
const llm = new OpenAI({
  apiKey: config.openrouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
});

/**
 * Comandos del dueño: el dueño de la clínica observa su agente... hablándole
 * al agente. Escribe al número de su propia clínica y el bot lo reconoce
 * (por ser el telefono_humano o por usar el chat "tú mismo") y le responde
 * con sus números en vez de atenderlo como cliente.
 *
 * Comandos: /hoy · /semana · /panel · /ayuda
 * (también sin "/" cuando escribe desde un número distinto al del bot)
 */

/** ¿Este número (solo dígitos) es el dueño/humano de la clínica? */
export function esDuenio(clinic: Clinic, jidDigits: string): boolean {
  if (!clinic.telefono_humano) return false;
  return clinic.telefono_humano.replace(/\D/g, '') === jidDigits;
}

/** Stats del día de hoy (en la TZ de la clínica). */
async function statsHoy(clinic: Clinic) {
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const desde = `${hoy}T00:00:00`;
  const conteo = (tabla: string, filtros: Record<string, unknown> = {}) => {
    let q = supabase
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .gte('created_at', desde);
    for (const [col, val] of Object.entries(filtros)) q = q.eq(col, val);
    return q;
  };

  const [citasAgendadasHoy, citasParaHoy, mensajes, clientes, escalados] = await Promise.all([
    conteo('appointments'),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .eq('fecha', hoy)
      .neq('estado', 'cancelada'),
    conteo('messages', { role: 'user' }),
    conteo('contacts'),
    conteo('leads', { escalado: true }),
  ]);

  return {
    citasAgendadasHoy: citasAgendadasHoy.count ?? 0,
    citasParaHoy: citasParaHoy.count ?? 0,
    mensajes: mensajes.count ?? 0,
    clientesNuevos: clientes.count ?? 0,
    escalamientos: escalados.count ?? 0,
  };
}

function linkPanel(clinic: Clinic): string {
  return clinic.dashboard_token
    ? `${config.dashboardUrl}/d/${clinic.dashboard_token}`
    : '(panel no configurado)';
}

const AYUDA = [
  '🤖 *Comandos del dueño*',
  '',
  '*/hoy* — resumen de hoy (citas, mensajes, clientes)',
  '*/semana* — reporte semanal completo',
  '*/panel* — link de tu panel de clientas',
  '*/info* — ver la información de tu negocio',
  '*/editar <cambio>* — actualizar tu información',
  '   _ej: /editar ahora cerramos a las 5pm los sábados_',
  '*/ayuda* — este menú',
].join('\n');

// ====================== /info y /editar (autoservicio) ======================

/** Campos de la clínica que el dueño SÍ puede editar por /editar. */
const CAMPOS_EDITABLES = new Set([
  'direccion',
  'ciudad',
  'servicios',
  'horario',
  'tono',
  'info_extra',
  'valor_cita_promedio',
  'google_review_url',
]);

/** Campos que JAMÁS se tocan por /editar (solo la agencia, vía SQL). */
const CAMPOS_PROHIBIDOS = new Set(['plan', 'session_id', 'telefono_humano', 'dashboard_token', 'id', 'activo', 'nombre', 'vertical']);

/** Ficha completa formateada para el dueño (/info). */
export function formatearFicha(clinic: Clinic): string {
  const faqs = Object.entries(clinic.info_extra ?? {})
    .map(([k, v]) => `  • ${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');
  return [
    `ℹ️ *Información de ${clinic.nombre}*`,
    '',
    `📍 Dirección: ${clinic.direccion ?? '(sin configurar)'}`,
    `🏙️ Ciudad: ${clinic.ciudad ?? '(sin configurar)'}`,
    `🩺 Servicios: ${clinic.servicios.join(', ')}`,
    `🕐 Horario: ${clinic.horario.inicio} a ${clinic.horario.fin}, días ${clinic.horario.dias.join(',')} (1=lun..7=dom)${clinic.horario.almuerzo ? `, almuerzo ${clinic.horario.almuerzo[0]}-${clinic.horario.almuerzo[1]}` : ''}`,
    `💵 Valor promedio de cita: $${Number(clinic.valor_cita_promedio ?? 0).toLocaleString('es-CO')} COP`,
    `⭐ Link de reseñas: ${clinic.google_review_url ?? '(sin configurar)'}`,
    `📦 Plan: ${clinic.plan}`,
    '',
    '*Información adicional (FAQs):*',
    faqs || '  (ninguna)',
    '',
    'Para cambiar algo: */editar <lo que quieras cambiar>*',
  ].join('\n');
}

interface PendingEdit {
  patch: Record<string, unknown>;
  resumen: string;
  expira: number;
}

/** Ediciones pendientes de confirmación, por clínica+chat. Expiran a los 5 min. */
const pendingEdits = new Map<string, PendingEdit>();
const EXPIRACION_MS = 5 * 60 * 1000;

/** Visible para tests. */
export function limpiarEdicionesPendientes(): void {
  pendingEdits.clear();
}

/** Interpreta el cambio en lenguaje natural → patch JSON sobre campos editables. */
async function parsearCambio(
  clinic: Clinic,
  texto: string,
): Promise<{ patch: Record<string, unknown>; resumen: string } | { error: string }> {
  const fichaEditable = {
    direccion: clinic.direccion,
    ciudad: clinic.ciudad,
    servicios: clinic.servicios,
    horario: clinic.horario,
    tono: clinic.tono,
    info_extra: clinic.info_extra,
    valor_cita_promedio: clinic.valor_cita_promedio,
    google_review_url: clinic.google_review_url,
  };

  const prompt = `Eres el asistente de configuración de una clínica. El dueño quiere hacer este cambio a la información de su negocio:

"${texto}"

INFORMACIÓN ACTUAL (campos editables):
${JSON.stringify(fichaEditable, null, 2)}

CAMPOS QUE NO SE PUEDEN EDITAR (si el cambio los toca, recházalo): plan, session_id, telefono_humano, dashboard_token, nombre, vertical, activo.

Responde SOLO con JSON válido, en uno de estos dos formatos:
1. Si el cambio es válido: {"patch": {<solo los campos que cambian, con su valor NUEVO COMPLETO>}, "resumen": "<descripción corta y clara del cambio en español>"}
   - Para info_extra devuelve el objeto COMPLETO actualizado (lo existente + lo nuevo/modificado).
   - Para servicios devuelve la lista COMPLETA actualizada.
   - Para horario devuelve el objeto COMPLETO actualizado.
2. Si el cambio toca campos prohibidos o no se entiende: {"error": "<explicación corta de por qué no se puede>"}`;

  const resp = await llm.chat.completions.create({
    model: config.model,
    models: [config.model, config.modelFallback],
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 800,
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);

  try {
    const parsed = JSON.parse(resp.choices[0]?.message?.content ?? '{}') as {
      patch?: Record<string, unknown>;
      resumen?: string;
      error?: string;
    };
    if (parsed.error) return { error: parsed.error };
    if (!parsed.patch || Object.keys(parsed.patch).length === 0) {
      return { error: 'No entendí qué quieres cambiar. Intenta ser más específico.' };
    }

    // Whitelist dura: descarta cualquier campo no editable que el modelo haya colado.
    const patch: Record<string, unknown> = {};
    const rechazados: string[] = [];
    for (const [campo, valor] of Object.entries(parsed.patch)) {
      if (CAMPOS_EDITABLES.has(campo)) patch[campo] = valor;
      else rechazados.push(campo);
    }
    if (Object.keys(patch).length === 0) {
      const detalle = rechazados.filter((c) => CAMPOS_PROHIBIDOS.has(c));
      return {
        error: detalle.length
          ? `Ese cambio toca campos que solo maneja la agencia (${detalle.join(', ')}). Escríbeles directamente para eso.`
          : 'No entendí qué quieres cambiar. Intenta ser más específico.',
      };
    }
    return { patch, resumen: parsed.resumen ?? 'Cambio en la información del negocio' };
  } catch {
    return { error: 'No pude interpretar el cambio. Intenta de nuevo con otras palabras.' };
  }
}

/** Aplica un patch confirmado a la clínica en Supabase. */
async function aplicarPatch(clinic: Clinic, patch: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabase.from('clinics').update(patch).eq('id', clinic.id);
  if (error) {
    console.error('[owner] error aplicando edición:', error);
    return false;
  }
  return true;
}

/**
 * Procesa un mensaje del dueño. Devuelve la respuesta a enviar, o null si el
 * texto no es un comando reconocible (en ese caso quien llama decide qué hacer).
 * `jid` identifica el chat del dueño (para las confirmaciones de /editar).
 */
export async function handleOwnerCommand(
  clinic: Clinic,
  texto: string,
  jid = 'sin-jid',
): Promise<string | null> {
  // Normaliza: minúsculas, sin tildes, sin "/" inicial.
  const cmd = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^\//, '');

  const claveEdicion = `${clinic.id}:${jid}`;

  // ── Confirmación de una edición pendiente (/editar) ──────────────────────
  const pendiente = pendingEdits.get(claveEdicion);
  if (pendiente) {
    if (Date.now() > pendiente.expira) {
      pendingEdits.delete(claveEdicion);
      // sigue al flujo normal de comandos (la edición expiró)
    } else if (['si', 'sí', 'confirmo', 'dale', 'ok'].includes(cmd)) {
      pendingEdits.delete(claveEdicion);
      const ok = await aplicarPatch(clinic, pendiente.patch);
      return ok
        ? `✅ Listo. ${pendiente.resumen}\n\nEl asistente ya responde con la información actualizada. Revisa con */info*`
        : '❌ Hubo un error guardando el cambio. Inténtalo de nuevo en un momento.';
    } else if (['no', 'cancelar', 'cancela'].includes(cmd)) {
      pendingEdits.delete(claveEdicion);
      return 'Cambio descartado. Tu información queda como estaba. 👍';
    }
    // Cualquier otro texto: la edición sigue pendiente y se procesa el comando normal.
  }

  // ── /info: ver la ficha del negocio ──────────────────────────────────────
  if (['info', 'informacion', 'mi negocio', 'ficha'].includes(cmd)) {
    return formatearFicha(clinic);
  }

  // ── /editar <cambio>: actualizar la ficha con confirmación ───────────────
  if (cmd.startsWith('editar')) {
    const cambio = texto.trim().replace(/^\/?editar\s*/i, '').trim();
    if (!cambio) {
      return 'Dime qué quieres cambiar. Ejemplo:\n*/editar ahora también atendemos los domingos de 9 a 1*';
    }
    const resultado = await parsearCambio(clinic, cambio);
    if ('error' in resultado) {
      return `⚠️ ${resultado.error}`;
    }
    pendingEdits.set(claveEdicion, {
      patch: resultado.patch,
      resumen: resultado.resumen,
      expira: Date.now() + EXPIRACION_MS,
    });
    return [
      `📝 *Voy a hacer este cambio:*`,
      '',
      resultado.resumen,
      '',
      `¿Confirmas? Responde */si* para aplicar o */no* para cancelar.`,
      `_(esta propuesta expira en 5 minutos)_`,
    ].join('\n');
  }

  if (['hoy', 'resumen', 'como vamos', 'como vamos hoy', 'estado'].includes(cmd)) {
    const s = await statsHoy(clinic);
    return [
      `📊 *Hoy en ${clinic.nombre}:*`,
      '',
      `🗓️ Citas para hoy: *${s.citasParaHoy}*`,
      `✍️ Citas agendadas hoy: *${s.citasAgendadasHoy}*`,
      `💬 Mensajes atendidos: *${s.mensajes}*`,
      `👥 Clientes nuevos: *${s.clientesNuevos}*`,
      `🔔 Escalamientos: *${s.escalamientos}*`,
      '',
      `Panel completo: ${linkPanel(clinic)}`,
    ].join('\n');
  }

  if (['semana', 'reporte', 'semanal'].includes(cmd)) {
    if (!planIncluye(clinic, 'reporte_semanal')) {
      return `El reporte semanal está disponible en los planes Growth y Scale. Tu panel: ${linkPanel(clinic)}`;
    }
    return generarReporteSemanal(clinic);
  }

  if (['panel', 'dashboard', 'link'].includes(cmd)) {
    return `📊 Tu panel de clientas (ábrelo desde el celular y agrégalo a la pantalla de inicio):\n${linkPanel(clinic)}`;
  }

  if (['ayuda', 'help', 'comandos', 'menu'].includes(cmd)) {
    return AYUDA;
  }

  // No es un comando conocido.
  return null;
}

export { AYUDA as ayudaDuenio };
