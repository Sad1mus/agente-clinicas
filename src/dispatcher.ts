import type { Clinic } from './types.js';
import { handleMessage } from './brain.js';

/**
 * Mejoras críticas #1 (debounce) y #2 (cola por contacto):
 *  - Debounce: la gente escribe en ráfagas ("hola" / "quería cita" / "para mi perro").
 *    Esperamos DEBOUNCE_MS, juntamos los mensajes y respondemos UNA vez.
 *  - Serialización: nunca corren dos cerebros a la vez para el mismo contacto
 *    (evita carreras de historial y respuestas pisadas).
 */
const DEBOUNCE_MS = 4000;

type SendFn = (text: string) => Promise<void>;
type TypingFn = () => Promise<void>;

interface Entry {
  clinic: Clinic;
  jid: string;
  buffer: string[];
  timer: NodeJS.Timeout | null;
  processing: boolean;
  send: SendFn;
  typing?: TypingFn;
}

const entries = new Map<string, Entry>();
const keyOf = (clinicId: string, jid: string) => `${clinicId}|${jid}`;

/** Encola un mensaje entrante. Se procesa tras la ventana de debounce. */
export function enqueue(
  clinic: Clinic,
  jid: string,
  text: string,
  send: SendFn,
  typing?: TypingFn,
): void {
  const key = keyOf(clinic.id, jid);
  let e = entries.get(key);
  if (!e) {
    e = { clinic, jid, buffer: [], timer: null, processing: false, send, typing };
    entries.set(key, e);
  }
  // Refresca callbacks (el socket pudo reconectarse).
  e.send = send;
  e.typing = typing;
  e.buffer.push(text);
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => void flush(key), DEBOUNCE_MS);
}

async function flush(key: string): Promise<void> {
  const e = entries.get(key);
  if (!e) return;
  e.timer = null;

  // Si ya hay un cerebro corriendo para este contacto, espera y reintenta.
  if (e.processing) {
    e.timer = setTimeout(() => void flush(key), 1000);
    return;
  }
  if (e.buffer.length === 0) {
    entries.delete(key);
    return;
  }

  const combined = e.buffer.join('\n');
  e.buffer = [];
  e.processing = true;
  try {
    if (e.typing) await e.typing().catch(() => {});
    const reply = await handleMessage(e.clinic, e.jid, combined);
    // reply === null → clínica pausada por el dueño: no responder nada.
    if (reply !== null) await e.send(reply);
  } catch (err) {
    console.error(`[dispatcher] error procesando ${key}:`, err);
  } finally {
    e.processing = false;
    // Llegaron mensajes durante el proceso → reprograma. Si no, limpia.
    if (e.buffer.length > 0) {
      if (e.timer) clearTimeout(e.timer);
      e.timer = setTimeout(() => void flush(key), 500);
    } else if (!e.timer) {
      entries.delete(key);
    }
  }
}
