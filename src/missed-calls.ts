import type { Clinic } from './types.js';
import { saveLead, saveMessage } from './db.js';
import { planIncluye } from './plans.js';

/**
 * Rescate de llamadas perdidas (plan Scale).
 *
 * El dolor #1 verbatim de las campañas: "cuando llaman en hora pico el teléfono
 * no da abasto... esa plata se va a otra clínica". Cuando alguien llama al
 * WhatsApp de la clínica y nadie contesta, el bot le escribe al instante para
 * no perder al cliente.
 */

/** Forma mínima del evento 'call' de Baileys que necesitamos (estructural,
 *  para no acoplarnos a los tipos internos de la librería). */
export interface CallEvent {
  from?: string;
  chatId?: string;
  status: string; // 'offer' | 'ringing' | 'timeout' | 'reject' | 'accept' | 'terminate'
  isGroup?: boolean;
}

type EnviarFn = (jid: string, texto: string) => Promise<void>;

/** Mensaje de rescate que se envía al que llamó. */
export function generarMensajeRescate(clinic: Clinic): string {
  return (
    `¡Hola! Vi que llamaste a ${clinic.nombre} 📞\n\n` +
    `No alcanzamos a contestar, pero te leo por aquí mismo: ` +
    `¿en qué te puedo ayudar? Puedo darte información o agendarte una cita de una vez. 😊`
  );
}

/** Anti-spam: máximo 1 rescate por contacto cada 6 horas (estado en memoria). */
const ultimoRescate = new Map<string, number>();
const VENTANA_ANTI_SPAM_MS = 6 * 3600 * 1000;

/** Visible para tests: limpia el estado del anti-spam. */
export function resetAntiSpam(): void {
  ultimoRescate.clear();
}

/** Estados de llamada que significan "terminó sin que nadie contestara". */
const ESTADOS_PERDIDA = new Set(['timeout', 'terminate']);
/** Llamadas que el cliente alcanzó a ver contestadas o rechazadas a propósito. */
const ESTADOS_IGNORAR = new Set(['accept', 'reject', 'offer', 'ringing']);

/**
 * Procesa eventos 'call' de Baileys para una clínica. Devuelve cuántos rescates envió.
 * `enviar` es inyectable para poder probarlo sin un socket real.
 */
export async function handleCallEvents(
  clinic: Clinic,
  calls: CallEvent[],
  enviar: EnviarFn,
): Promise<number> {
  if (!planIncluye(clinic, 'llamadas_perdidas')) return 0;

  let rescatadas = 0;

  for (const call of calls) {
    if (call.isGroup) continue;
    if (!ESTADOS_PERDIDA.has(call.status)) {
      if (!ESTADOS_IGNORAR.has(call.status)) {
        console.warn(`[llamadas] estado de llamada desconocido: ${call.status}`);
      }
      continue;
    }

    const jid = call.chatId ?? call.from;
    if (!jid) continue;

    // Anti-spam: si ya lo rescatamos hace <6h, no insistir.
    const ultimo = ultimoRescate.get(jid);
    if (ultimo && Date.now() - ultimo < VENTANA_ANTI_SPAM_MS) continue;

    const texto = generarMensajeRescate(clinic);
    try {
      await enviar(jid, texto);
      ultimoRescate.set(jid, Date.now());
      rescatadas++;

      // Registrar el lead y dejar el mensaje en el historial para que el cerebro
      // tenga contexto cuando el cliente responda.
      await saveLead({
        clinic_id: clinic.id,
        jid,
        interes: 'LLAMADA PERDIDA',
        notas: 'Llamó por WhatsApp y nadie contestó; se le envió mensaje de rescate.',
      });
      await saveMessage(clinic.id, jid, 'assistant', texto);
      console.log(`[llamadas] rescate enviado a ${jid} (${clinic.nombre})`);
    } catch (err) {
      console.error('[llamadas] error enviando rescate:', err);
    }
  }

  return rescatadas;
}
