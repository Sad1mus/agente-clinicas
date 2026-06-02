import type { Clinic } from './types.js';
import { config } from './config.js';
import { supabase, estaPausada } from './db.js';
import { notifyHuman } from './notifier.js';
import { planIncluye } from './plans.js';

/**
 * Reporte semanal al dueño (plan Growth/Scale): cada lunes a las 8:00 am (TZ de
 * config) el asistente le escribe por WhatsApp al telefono_humano con el resumen
 * de la semana y la comparativa contra la semana anterior. El dueño SIENTE el
 * valor del servicio sin abrir nada.
 */

interface Stats {
  citas: number;
  confirmadas: number;
  canceladas: number;
  clientesNuevos: number;
  mensajes: number;
  escalamientos: number;
}

/** Conteos de actividad de una clínica en un rango [desde, hasta). */
async function statsRango(clinicId: string, desde: Date, hasta: Date): Promise<Stats> {
  const d = desde.toISOString();
  const h = hasta.toISOString();
  const conteo = (tabla: string, filtros: Record<string, unknown> = {}) => {
    let q = supabase
      .from(tabla)
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('created_at', d)
      .lt('created_at', h);
    for (const [col, val] of Object.entries(filtros)) q = q.eq(col, val);
    return q;
  };

  const [citas, confirmadas, canceladas, clientes, mensajes, escalamientos] = await Promise.all([
    conteo('appointments'),
    conteo('appointments', { estado: 'confirmada' }),
    conteo('appointments', { estado: 'cancelada' }),
    conteo('contacts'),
    conteo('messages', { role: 'user' }),
    conteo('leads', { escalado: true }),
  ]);

  return {
    citas: citas.count ?? 0,
    confirmadas: confirmadas.count ?? 0,
    canceladas: canceladas.count ?? 0,
    clientesNuevos: clientes.count ?? 0,
    mensajes: mensajes.count ?? 0,
    escalamientos: escalamientos.count ?? 0,
  };
}

function comparativa(actual: number, anterior: number): string {
  if (actual > anterior) return `📈 +${actual - anterior}`;
  if (actual < anterior) return `📉 ${actual - anterior}`;
  return '➡️ igual';
}

/** Genera el texto del reporte semanal (semana que termina hoy vs la anterior). */
export async function generarReporteSemanal(clinic: Clinic): Promise<string> {
  const ahora = new Date();
  const hace7 = new Date(ahora.getTime() - 7 * 24 * 3600 * 1000);
  const hace14 = new Date(ahora.getTime() - 14 * 24 * 3600 * 1000);

  const [semana, anterior] = await Promise.all([
    statsRango(clinic.id, hace7, ahora),
    statsRango(clinic.id, hace14, hace7),
  ]);

  return [
    `📊 *Reporte semanal — ${clinic.nombre}*`,
    '',
    `🗓️ Citas agendadas: *${semana.citas}* (${comparativa(semana.citas, anterior.citas)} vs semana pasada)`,
    `✅ Citas confirmadas: *${semana.confirmadas}*`,
    `❌ Canceladas: *${semana.canceladas}*`,
    `👥 Clientes nuevos: *${semana.clientesNuevos}* (${comparativa(semana.clientesNuevos, anterior.clientesNuevos)})`,
    `💬 Mensajes atendidos: *${semana.mensajes}* (${comparativa(semana.mensajes, anterior.mensajes)})`,
    `🔔 Escalamientos a tu equipo: *${semana.escalamientos}*`,
    '',
    'Todo esto lo atendió tu asistente solo, 24/7 🤖',
    'El detalle completo está en tu panel de clientas.',
  ].join('\n');
}

/** Envía el reporte semanal a una clínica si su plan lo incluye. */
export async function enviarReporteSemanal(clinic: Clinic): Promise<boolean> {
  if (!planIncluye(clinic, 'reporte_semanal')) return false;
  const texto = await generarReporteSemanal(clinic);
  const enviado = await notifyHuman(clinic, texto);
  if (enviado) {
    await supabase
      .from('clinics')
      .update({ ultimo_reporte: new Date().toISOString() })
      .eq('id', clinic.id);
  }
  return enviado;
}

/** Partes de fecha/hora actuales en la TZ configurada. */
function ahoraEnTZ(): { diaSemana: string; hora: number; fecha: string } {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: config.tz,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => partes.find((p) => p.type === t)?.value ?? '';
  return {
    diaSemana: get('weekday'),
    hora: Number(get('hour')),
    fecha: `${get('year')}-${get('month')}-${get('day')}`,
  };
}

/** ¿Ya se envió el reporte de esta semana? (mira ultimo_reporte en DB). */
async function reporteYaEnviado(clinic: Clinic): Promise<boolean> {
  const { data } = await supabase
    .from('clinics')
    .select('ultimo_reporte')
    .eq('id', clinic.id)
    .single();
  if (!data?.ultimo_reporte) return false;
  const hace6dias = Date.now() - 6 * 24 * 3600 * 1000;
  return new Date(data.ultimo_reporte as string).getTime() > hace6dias;
}

const INTERVALO_MIN = 30;

/** Scheduler: lunes 8:00-9:59 am (TZ), una vez por semana por clínica. */
export function startWeeklyReports(clinics: Clinic[]): NodeJS.Timeout {
  const revisar = async () => {
    const { diaSemana, hora } = ahoraEnTZ();
    if (diaSemana !== 'Mon' || hora < 8 || hora >= 10) return;

    for (const clinic of clinics) {
      try {
        if (!planIncluye(clinic, 'reporte_semanal')) continue;
        if (await estaPausada(clinic.id)) continue; // pausada por el dueño
        if (await reporteYaEnviado(clinic)) continue;
        const enviado = await enviarReporteSemanal(clinic);
        if (enviado) console.log(`[reportes] reporte semanal enviado a ${clinic.nombre}`);
      } catch (err) {
        console.error(`[reportes] error en ${clinic.nombre}:`, err);
      }
    }
  };

  void revisar();
  const timer = setInterval(revisar, INTERVALO_MIN * 60 * 1000);
  console.log('📈 Reportes semanales activos (lunes 8:00 am, planes Growth/Scale).');
  return timer;
}
