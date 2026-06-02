import type { Clinic } from './types.js';

/**
 * Registro de "enviadores" por clínica. whatsapp.ts registra, al conectar cada
 * socket, una función que envía un WhatsApp. Así las herramientas (tools.ts)
 * pueden notificar al humano de la clínica sin conocer el socket.
 */
type SendFn = (jid: string, text: string) => Promise<void>;

const registry = new Map<string, SendFn>();

export function registerNotifier(clinicId: string, fn: SendFn): void {
  registry.set(clinicId, fn);
}

/** Envía un aviso al teléfono humano de la clínica. Devuelve true si se envió. */
export async function notifyHuman(clinic: Clinic, message: string): Promise<boolean> {
  const fn = registry.get(clinic.id);
  if (!fn || !clinic.telefono_humano) {
    console.warn(`[notifier] sin destino para ${clinic.nombre}; escalamiento solo quedó en DB.`);
    return false;
  }
  const digits = clinic.telefono_humano.replace(/\D/g, '');
  try {
    await fn(`${digits}@s.whatsapp.net`, message);
    return true;
  } catch (err) {
    console.error('[notifier] error enviando aviso:', err);
    return false;
  }
}

/** Envía un mensaje a un contacto (jid) por el socket de su clínica.
 *  Lo usan los recordatorios anti no-show. Devuelve true si se envió. */
export async function sendToContact(clinic: Clinic, jid: string, message: string): Promise<boolean> {
  const fn = registry.get(clinic.id);
  if (!fn) {
    console.warn(`[notifier] la clínica ${clinic.nombre} no tiene socket registrado.`);
    return false;
  }
  try {
    await fn(jid, message);
    return true;
  } catch (err) {
    console.error('[notifier] error enviando mensaje a contacto:', err);
    return false;
  }
}
