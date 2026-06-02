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
import { esDuenio, handleOwnerCommand, ayudaDuenio } from './owner.js';

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
      if (!jid) continue;
      if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue;

      const text = extractText(m);
      if (!text?.trim()) continue;
      const jidDigits = jid.split('@')[0].split(':')[0];

      // ── Comandos del dueño ─────────────────────────────────────────────
      // Caso A — chat "tú mismo": el dueño usa el MISMO número del bot. Sus
      // mensajes llegan con fromMe=true; solo se aceptan comandos con "/" para
      // no entrar en bucle con las respuestas del propio bot.
      const numerosPropios = new Set(
        [sock.user?.id, sock.user?.lid]
          .filter((v): v is string => Boolean(v))
          .map((v) => v.split('@')[0].split(':')[0]),
      );
      const esSelfChat = m.key.fromMe && numerosPropios.has(jidDigits);
      // Caso B — el dueño escribe desde su número personal (distinto al del bot).
      const esDuenoExterno = !m.key.fromMe && esDuenio(clinic, jidDigits);

      if (esSelfChat || esDuenoExterno) {
        if (esSelfChat && !text.trim().startsWith('/')) continue; // ignora respuestas del bot
        const respuesta = await handleOwnerCommand(clinic, text.trim(), jid);
        if (respuesta) {
          await sock.sendMessage(jid, { text: respuesta });
        } else if (esSelfChat) {
          // En self-chat un "/" desconocido muestra la ayuda.
          await sock.sendMessage(jid, { text: ayudaDuenio });
        }
        // Dueño externo con texto que no es comando: cae al flujo normal (lo
        // atiende el cerebro como a cualquier cliente).
        if (esSelfChat || respuesta) continue;
      }

      // Ignora mensajes propios (respuestas del bot y ecos).
      if (m.key.fromMe) continue;

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
