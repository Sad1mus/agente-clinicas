import type { Clinic } from './types.js';
import { config } from './config.js';
import { getActiveAppointmentsForDate, markReminderSent, saveMessage, estaPausada } from './db.js';
import { sendToContact } from './notifier.js';

/**
 * Recordatorios anti no-show — la promesa "recordatorios para reducir
 * inasistencias" de las campañas, ahora real.
 *
 * Cada 10 minutos revisa las citas activas y envía por WhatsApp:
 *   - Recordatorio 24h antes (ventana: falta entre 20 y 28 horas)
 *   - Recordatorio  2h antes (ventana: falta entre 1 y 3 horas)
 * Cada recordatorio se marca en la cita para no repetirlo. El cliente puede
 * responder al recordatorio y el cerebro (brain.ts) confirma o reagenda con
 * sus herramientas.
 */

const INTERVALO_MIN = 10;

/** Fecha YYYY-MM-DD en la zona horaria configurada, con offset de días. */
function fechaISO(diasExtra = 0): string {
  const d = new Date(Date.now() + diasExtra * 24 * 3600 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Horas que faltan para una cita (fecha YYYY-MM-DD + hora HH:MM:SS), en la TZ local. */
function horasParaCita(fecha: string, hora: string): number {
  // Construye el timestamp de la cita interpretándolo en la TZ configurada.
  const ahora = new Date();
  const enTZ = new Date(ahora.toLocaleString('en-US', { timeZone: config.tz }));
  const offsetMs = ahora.getTime() - enTZ.getTime();
  const cita = new Date(`${fecha}T${hora.slice(0, 8) || hora}`);
  return (cita.getTime() + offsetMs - ahora.getTime()) / 3_600_000;
}

function mensajeRecordatorio(clinic: Clinic, nombre: string | null, servicio: string | null, fecha: string, hora: string, mascota: string | null, esHoy: boolean): string {
  const saludo = nombre ? `¡Hola ${nombre}!` : '¡Hola!';
  const svc = servicio ? ` de *${servicio.toLowerCase()}*` : '';
  const pet = mascota ? ` para ${mascota}` : '';
  const cuando = esHoy ? `*hoy a las ${hora.slice(0, 5)}*` : `*mañana a las ${hora.slice(0, 5)}*`;
  return `${saludo} Te recordamos tu cita${svc}${pet} ${cuando} en ${clinic.nombre} 🗓️\n\n¿Nos confirmas que asistes? Responde *SÍ* para confirmar o *REAGENDAR* si necesitas cambiarla.`;
}

async function revisarClinica(clinic: Clinic): Promise<void> {
  // Clínica pausada por el dueño: no enviar nada.
  if (await estaPausada(clinic.id)) return;

  // Citas de hoy y de mañana (cubren ambas ventanas de recordatorio).
  const citas = [
    ...(await getActiveAppointmentsForDate(clinic.id, fechaISO(0))),
    ...(await getActiveAppointmentsForDate(clinic.id, fechaISO(1))),
  ];

  for (const cita of citas) {
    if (!cita.jid) continue; // sin chat asociado, no hay a quién recordar
    const faltan = horasParaCita(cita.fecha, cita.hora);
    if (faltan <= 0) continue; // ya pasó

    let tipo: 'recordatorio_24h' | 'recordatorio_2h' | null = null;
    if (faltan <= 3 && !cita.recordatorio_2h) tipo = 'recordatorio_2h';
    else if (faltan >= 20 && faltan <= 28 && !cita.recordatorio_24h) tipo = 'recordatorio_24h';
    if (!tipo) continue;

    const texto = mensajeRecordatorio(
      clinic, cita.nombre, cita.servicio, cita.fecha, cita.hora, cita.mascota,
      tipo === 'recordatorio_2h',
    );

    const enviado = await sendToContact(clinic, cita.jid, texto);
    if (enviado) {
      await markReminderSent(clinic.id, cita.id, tipo);
      // El recordatorio entra al historial para que el cerebro tenga contexto
      // cuando el cliente responda "sí" o "reagendar".
      await saveMessage(clinic.id, cita.jid, 'assistant', texto);
      console.log(`[recordatorios] ${clinic.nombre}: ${tipo} enviado a ${cita.nombre ?? cita.jid}`);
    }
  }
}

/** Arranca el ciclo de recordatorios para todas las clínicas. */
export function startReminders(clinics: Clinic[]): NodeJS.Timeout {
  const correr = async () => {
    for (const clinic of clinics) {
      try {
        await revisarClinica(clinic);
      } catch (err) {
        console.error(`[recordatorios] error en ${clinic.nombre}:`, err);
      }
    }
  };

  // Primera pasada al arrancar (por si el proceso estuvo caído) y luego cada 10 min.
  void correr();
  const timer = setInterval(correr, INTERVALO_MIN * 60 * 1000);
  console.log(`⏰ Recordatorios anti no-show activos (cada ${INTERVALO_MIN} min).`);
  return timer;
}
