import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import type { Clinic } from './types.js';
import { enqueue } from './dispatcher.js';
import { registerNotifier } from './notifier.js';
import { handleCallEvents } from './missed-calls.js';

const logger = pino({ level: 'warn' });

/** Extrae el texto plano de un mensaje de WhatsApp (varios formatos posibles). */
function extractText(m: WAMessage): string | null {
  const msg = m.message;
  if (!msg) return null;
  return (
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.imageMessage?.caption ??
    msg.videoMessage?.caption ??
    null
  );
}

/**
 * Arranca un socket de Baileys para UNA clínica. Cada clínica = su propio
 * número de WhatsApp, su propia carpeta de auth (auth/<session_id>).
 * Reconecta solo si la sesión sigue siendo válida.
 */
export async function startClinicSocket(clinic: Clinic): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(`auth/${clinic.session_id}`);
  const { version } = await fetchLatestBaileysVersion();

  const sock: WASocket = makeWASocket({ version, auth: state, logger });

  sock.ev.on('creds.update', saveCreds);

  // Permite que las herramientas (escalar_humano) avisen al humano de la clínica.
  registerNotifier(clinic.id, async (jid, text) => {
    await sock.sendMessage(jid, { text });
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(`\n[${clinic.nombre}] Escanea este QR con WhatsApp (Dispositivos vinculados):`);
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log(`[${clinic.nombre}] ✅ conectado a WhatsApp.`);
    }
    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      console.log(`[${clinic.nombre}] conexión cerrada (code ${code}).`);
      if (!loggedOut) {
        console.log(`[${clinic.nombre}] reconectando…`);
        startClinicSocket(clinic).catch((e) => console.error(e));
      } else {
        console.log(`[${clinic.nombre}] sesión cerrada. Borra auth/${clinic.session_id} y re-escanea.`);
      }
    }
  });

  // Rescate de llamadas perdidas (plan Scale): si llaman y nadie contesta,
  // el bot escribe al instante para no perder al cliente.
  sock.ev.on('call', async (calls) => {
    try {
      await handleCallEvents(clinic, calls, async (jid, texto) => {
        await sock.sendMessage(jid, { text: texto });
      });
    } catch (err) {
      console.error(`[${clinic.nombre}] error en rescate de llamadas:`, err);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      const jid = m.key.remoteJid;
      // Ignora: mensajes propios, grupos, estados/broadcast.
      if (!jid || m.key.fromMe) continue;
      if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

      const text = extractText(m);
      if (!text?.trim()) continue;

      // Entrega al dispatcher: agrupa ráfagas (debounce) y serializa por contacto.
      enqueue(
        clinic,
        jid,
        text.trim(),
        async (reply) => {
          await sock.sendMessage(jid, { text: reply });
        },
        async () => {
          await sock.sendPresenceUpdate('composing', jid);
        },
      );
    }
  });
}
