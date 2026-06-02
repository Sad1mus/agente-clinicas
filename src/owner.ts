import type { Clinic } from './types.js';
import { config } from './config.js';
import { supabase } from './db.js';
import { generarReporteSemanal } from './reports.js';
import { planIncluye } from './plans.js';

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
  '*/ayuda* — este menú',
].join('\n');

/**
 * Procesa un mensaje del dueño. Devuelve la respuesta a enviar, o null si el
 * texto no es un comando reconocible (en ese caso quien llama decide qué hacer).
 */
export async function handleOwnerCommand(clinic: Clinic, texto: string): Promise<string | null> {
  // Normaliza: minúsculas, sin tildes, sin "/" inicial.
  const cmd = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^\//, '');

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
