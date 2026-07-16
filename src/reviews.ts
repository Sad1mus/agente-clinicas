import type { Appointment, Clinic } from './types.js';
import { config } from './config.js';
import { estaPausada } from './db.js';
import { forClinic } from './scope.js';
import { sendToContact } from './notifier.js';
import { planIncluye } from './plans.js';

/**
 * Pedido de reseñas de Google post-cita (plan Growth/Scale).
 *
 * Cada hora revisa las citas (agendadas/confirmadas) cuya fecha+hora pasó hace
 * entre 2 y 26 horas y aún no tienen reseña pedida → envía un mensaje cálido con
 * el link de Google Reviews de la clínica → marca la cita (resena_pedida) para
 * no insistir nunca dos veces.
 */

type EnviarFn = (clinic: Clinic, jid: string, texto: string) => Promise<boolean>;

/** Mensaje que se le envía al cliente pidiendo la reseña. */
export function generarMensajeResena(clinic: Clinic, cita: Appointment): string {
  const saludo = cita.nombre ? `¡Hola ${cita.nombre}!` : '¡Hola!';
  const pet = cita.mascota ? ` con ${cita.mascota}` : '';
  return (
    `${saludo} ¿Cómo les fue ayer${pet} en ${clinic.nombre}? 🐾\n\n` +
    `Si quedaste contento con la atención, nos ayudarías muchísimo dejándonos una reseña en Google (toma 1 minuto):\n` +
    `${clinic.google_review_url}\n\n` +
    `¡Gracias por confiar en nosotros! 💚`
  );
}

/** Fecha YYYY-MM-DD en la zona horaria de la clínica (config.tz). */
function fechaLocalISO(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Horas transcurridas DESDE una cita (fecha/hora guardadas en la TZ de config).
 *  Positivo = la cita ya pasó. Mismo patrón de offset que reminders.ts. */
function horasDesdeCita(fecha: string, hora: string): number {
  const ahora = new Date();
  const enTZ = new Date(ahora.toLocaleString('en-US', { timeZone: config.tz }));
  const offsetMs = ahora.getTime() - enTZ.getTime();
  const cita = new Date(`${fecha}T${hora.slice(0, 8)}`);
  return (ahora.getTime() - (cita.getTime() + offsetMs)) / 3_600_000;
}

/** Citas de la clínica elegibles para pedir reseña (pasaron hace 2-26 horas, sin pedir). */
export async function citasPendientesDeResena(clinic: Clinic): Promise<Appointment[]> {
  // Prefiltro por fecha (en la TZ de la clínica, con margen) y filtro exacto en código
  // (fecha y hora son columnas separadas en la tabla).
  const fechaDesde = fechaLocalISO(new Date(Date.now() - 30 * 3600 * 1000));
  const { data, error } = await forClinic(clinic.id)
    .select('appointments', '*')
    .neq('estado', 'cancelada')
    .is('resena_pedida', null)
    .gte('fecha', fechaDesde)
    .not('jid', 'is', null);
  if (error) throw error;

  return ((data ?? []) as Appointment[]).filter((cita) => {
    const horas = horasDesdeCita(cita.fecha, cita.hora);
    return horas >= 2 && horas <= 26;
  });
}

/** Revisa y envía los pedidos de reseña de una clínica. Devuelve cuántos envió. */
export async function revisarResenas(
  clinic: Clinic,
  enviar: EnviarFn = sendToContact,
): Promise<number> {
  if (!planIncluye(clinic, 'resenas_google')) return 0;
  if (!clinic.google_review_url) return 0;
  if (await estaPausada(clinic.id)) return 0; // pausada por el dueño

  const pendientes = await citasPendientesDeResena(clinic);
  let enviadas = 0;

  for (const cita of pendientes) {
    if (!cita.jid) continue;
    const texto = generarMensajeResena(clinic, cita);
    const ok = await enviar(clinic, cita.jid, texto);
    if (ok) {
      await forClinic(clinic.id)
        .update('appointments', { resena_pedida: new Date().toISOString() })
        .eq('id', cita.id);
      enviadas++;
      console.log(`[reseñas] pedido enviado a ${cita.nombre ?? cita.jid} (${clinic.nombre})`);
    }
  }

  return enviadas;
}

const INTERVALO_MIN = 60;

/** Scheduler: revisa cada hora todas las clínicas. */
export function startReviews(clinics: Clinic[]): NodeJS.Timeout {
  const revisar = async () => {
    for (const clinic of clinics) {
      try {
        await revisarResenas(clinic);
      } catch (err) {
        console.error(`[reseñas] error en ${clinic.nombre}:`, err);
      }
    }
  };

  void revisar();
  const timer = setInterval(revisar, INTERVALO_MIN * 60 * 1000);
  console.log('⭐ Pedido de reseñas Google post-cita activo (planes Growth/Scale).');
  return timer;
}
