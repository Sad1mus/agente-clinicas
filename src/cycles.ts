import type { Ciclo, Clinic } from './types.js';
import { config } from './config.js';
import { saveMessage, estaPausada } from './db.js';
import { forClinic } from './scope.js';
import { sendToContact } from './notifier.js';
import { planIncluye } from './plans.js';

/**
 * Recordatorios de ciclos de salud (plan Growth/Scale, veterinarias):
 * refuerzos de vacuna, desparasitación y controles.
 *
 * La promesa verbatim de las campañas: "recordatorios de vacunas en fecha exacta".
 * El bot programa los ciclos con la tool programar_refuerzo; este scheduler revisa
 * a diario y avisa al cliente cuando la fecha se acerca (hoy+3 días), ofreciendo
 * agendar la cita de una vez.
 */

type EnviarFn = (clinic: Clinic, jid: string, texto: string) => Promise<boolean>;

const NOMBRE_TIPO: Record<Ciclo['tipo'], string> = {
  vacuna: 'el refuerzo de vacuna',
  desparasitacion: 'la desparasitación',
  control: 'el control',
  limpieza: 'la limpieza dental',
  sesion: 'la próxima sesión de tu tratamiento',
};

/** Fecha YYYY-MM-DD en la TZ de la clínica, con días extra. */
function fechaLocalISO(diasExtra = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + diasExtra * 24 * 3600 * 1000));
}

/** Mensaje de recordatorio de ciclo. */
export function generarMensajeCiclo(clinic: Clinic, ciclo: Ciclo): string {
  const quien = ciclo.mascota ? `a ${ciclo.mascota} le` : 'te';
  const detalle = ciclo.descripcion ? ` (${ciclo.descripcion})` : '';
  const emoji = clinic.vertical === 'veterinaria' ? '🐾' : clinic.vertical === 'dental' ? '🦷' : '✨';
  return (
    `¡Hola! Te escribimos de ${clinic.nombre} ${emoji}\n\n` +
    `Se acerca ${NOMBRE_TIPO[ciclo.tipo]}${detalle}: ${quien} toca el *${ciclo.fecha_proxima}*.\n\n` +
    `¿Quieres que te agendemos la cita de una vez? Dime qué día te queda bien y te paso los horarios disponibles. 📅`
  );
}

/** Ciclos pendientes de aviso (fecha_proxima <= hoy+3 días, sin enviar). */
export async function ciclosPendientes(clinic: Clinic): Promise<Ciclo[]> {
  const limite = fechaLocalISO(3);
  const { data, error } = await forClinic(clinic.id)
    .select('ciclos', '*')
    .is('enviado', null)
    .lte('fecha_proxima', limite);
  if (error) throw error;
  return (data ?? []) as Ciclo[];
}

/** Revisa y envía los recordatorios de ciclos de una clínica. Devuelve cuántos envió. */
export async function revisarCiclos(
  clinic: Clinic,
  enviar: EnviarFn = sendToContact,
): Promise<number> {
  if (!planIncluye(clinic, 'recordatorios_vacunas')) return 0;
  if (await estaPausada(clinic.id)) return 0; // pausada por el dueño

  const pendientes = await ciclosPendientes(clinic);
  let enviados = 0;

  for (const ciclo of pendientes) {
    const texto = generarMensajeCiclo(clinic, ciclo);
    const ok = await enviar(clinic, ciclo.jid, texto);
    if (ok) {
      await forClinic(clinic.id)
        .update('ciclos', { enviado: new Date().toISOString() })
        .eq('id', ciclo.id);
      // Entra al historial para que el cerebro tenga contexto cuando el cliente responda.
      await saveMessage(clinic.id, ciclo.jid, 'assistant', texto);
      enviados++;
      console.log(`[ciclos] recordatorio de ${ciclo.tipo} enviado (${clinic.nombre})`);
    }
  }

  return enviados;
}

const INTERVALO_HORAS = 12;

/** Scheduler: revisa los ciclos de todas las clínicas cada 12 horas. */
export function startCycles(clinics: Clinic[]): NodeJS.Timeout {
  const revisar = async () => {
    for (const clinic of clinics) {
      try {
        await revisarCiclos(clinic);
      } catch (err) {
        console.error(`[ciclos] error en ${clinic.nombre}:`, err);
      }
    }
  };

  void revisar();
  const timer = setInterval(revisar, INTERVALO_HORAS * 3600 * 1000);
  console.log('💉 Recordatorios de vacunas/ciclos activos (planes Growth/Scale).');
  return timer;
}
