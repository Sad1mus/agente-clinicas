import type OpenAI from 'openai';
import type { Clinic } from './types.js';
import { config } from './config.js';
import {
  getAppointmentsForDate,
  createAppointment,
  saveLead,
  getUpcomingAppointment,
  setAppointmentStatus,
} from './db.js';
import { notifyHuman } from './notifier.js';

/** Definiciones de herramientas (formato OpenAI / OpenRouter). Descripciones
 * prescriptivas (cuándo llamarlas) para activar bien el tool-use. */
export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'consultar_disponibilidad',
      description:
        'Consulta los horarios disponibles de la clínica para una fecha. Llámala SIEMPRE antes de ofrecer horarios; nunca inventes horarios. Devuelve la lista de horas libres ese día.',
      parameters: {
        type: 'object',
        properties: {
          fecha: { type: 'string', description: 'Fecha a consultar en formato YYYY-MM-DD' },
        },
        required: ['fecha'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_cita',
      description:
        'Agenda una cita en el calendario de la clínica. Llámala SOLO después de que el cliente confirme explícitamente un horario que tú le ofreciste con consultar_disponibilidad.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del cliente' },
          fecha: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
          hora: { type: 'string', description: 'Hora en formato HH:MM (24h)' },
          servicio: { type: 'string', description: 'Servicio solicitado (de la lista de la clínica)' },
          telefono: { type: 'string', description: 'Teléfono del cliente, si lo dio' },
          mascota: { type: 'string', description: 'Nombre de la mascota/paciente, solo si aplica' },
        },
        required: ['nombre', 'fecha', 'hora', 'servicio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'actualizar_cita',
      description:
        'Confirma o cancela la próxima cita del cliente. Úsala cuando el cliente responda a un recordatorio: "sí"/"confirmo" → confirmar; "no puedo"/"cancela" → cancelar. Si quiere REAGENDAR: primero cancela con esta herramienta y luego agenda la nueva con consultar_disponibilidad + agendar_cita.',
      parameters: {
        type: 'object',
        properties: {
          accion: {
            type: 'string',
            enum: ['confirmar', 'cancelar'],
            description: 'Qué hacer con la próxima cita del cliente',
          },
        },
        required: ['accion'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'guardar_lead',
      description:
        'Guarda los datos del contacto interesado para no perder el lead. Úsala cuando el cliente muestre interés pero aún no agende, o al cerrar la conversación.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del cliente, si lo dio' },
          telefono: { type: 'string', description: 'Teléfono, si lo dio' },
          interes: { type: 'string', description: 'Qué le interesa (servicio o motivo)' },
          notas: { type: 'string', description: 'Cualquier dato útil para el seguimiento' },
        },
        required: ['interes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalar_humano',
      description:
        'Escala la conversación a una persona del equipo. Úsala ante quejas serias, urgencias médicas reales, temas de precio/decisión que no puedas cerrar, o si el cliente pide hablar con una persona.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Por qué se escala' },
          nombre: { type: 'string', description: 'Nombre del cliente, si lo dio' },
          telefono: { type: 'string', description: 'Teléfono, si lo dio' },
        },
        required: ['motivo'],
      },
    },
  },
];

interface ToolContext {
  clinic: Clinic;
  jid: string;
}

/** Hora actual "HH:MM" en la zona horaria configurada. */
function nowHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: config.tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** Fecha de hoy "YYYY-MM-DD" en la zona horaria configurada (en-CA da ese formato). */
function todayISO(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Genera las horas (HH:MM) entre inicio y fin según la duración, excluyendo almuerzo. */
function generarSlots(clinic: Clinic): string[] {
  const { inicio, fin, duracion_min, almuerzo } = clinic.horario;
  const toMin = (h: string) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const slots: string[] = [];
  const finMin = toMin(fin);
  const almIni = almuerzo ? toMin(almuerzo[0]) : null;
  const almFin = almuerzo ? toMin(almuerzo[1]) : null;
  for (let t = toMin(inicio); t + duracion_min <= finMin; t += duracion_min) {
    if (almIni !== null && almFin !== null && t >= almIni && t < almFin) continue;
    slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }
  return slots;
}

/** Ejecuta una herramienta y devuelve un string (el contenido del tool result). */
export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const { clinic, jid } = ctx;
  try {
    switch (name) {
      case 'consultar_disponibilidad': {
        const fecha = String(input.fecha);
        const d = new Date(`${fecha}T00:00:00`);
        const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=lun..7=dom
        if (!clinic.horario.dias.includes(dow)) {
          return JSON.stringify({ fecha, disponibles: [], nota: 'La clínica no atiende ese día.' });
        }
        const ocupadas = new Set(
          (await getAppointmentsForDate(clinic.id, fecha)).map((a) => a.hora.slice(0, 5)),
        );
        let libres = generarSlots(clinic).filter((h) => !ocupadas.has(h));
        // Mejora crítica: si la fecha es hoy, descarta horarios que ya pasaron.
        if (fecha === todayISO()) {
          const ahora = nowHHMM();
          libres = libres.filter((h) => h > ahora);
        }
        return JSON.stringify({ fecha, disponibles: libres });
      }

      case 'agendar_cita': {
        const fecha = String(input.fecha);
        const hora = String(input.hora);
        // No agendar en el pasado.
        if (fecha === todayISO() && hora <= nowHHMM()) {
          return JSON.stringify({ ok: false, error: 'Ese horario ya pasó. Ofrece uno futuro.' });
        }
        // El horario debe seguir libre.
        const ocupadas = new Set(
          (await getAppointmentsForDate(clinic.id, fecha)).map((a) => a.hora.slice(0, 5)),
        );
        if (ocupadas.has(hora)) {
          return JSON.stringify({ ok: false, error: 'Ese horario se acaba de ocupar. Ofrece otro.' });
        }
        await createAppointment({
          clinic_id: clinic.id,
          jid,
          nombre: String(input.nombre),
          telefono: input.telefono ? String(input.telefono) : undefined,
          servicio: input.servicio ? String(input.servicio) : undefined,
          mascota: input.mascota ? String(input.mascota) : undefined,
          fecha,
          hora,
        });
        return JSON.stringify({ ok: true, fecha, hora, mensaje: 'Cita agendada en el calendario.' });
      }

      case 'actualizar_cita': {
        const accion = String(input.accion);
        const cita = await getUpcomingAppointment(clinic.id, jid);
        if (!cita) {
          return JSON.stringify({ ok: false, error: 'Este cliente no tiene citas próximas activas.' });
        }
        const nuevoEstado = accion === 'confirmar' ? 'confirmada' : 'cancelada';
        await setAppointmentStatus(cita.id, nuevoEstado);
        return JSON.stringify({
          ok: true,
          estado: nuevoEstado,
          cita: { fecha: cita.fecha, hora: cita.hora.slice(0, 5), servicio: cita.servicio },
        });
      }

      case 'guardar_lead': {
        await saveLead({
          clinic_id: clinic.id,
          jid,
          nombre: input.nombre ? String(input.nombre) : undefined,
          telefono: input.telefono ? String(input.telefono) : undefined,
          interes: String(input.interes),
          notas: input.notas ? String(input.notas) : undefined,
        });
        return JSON.stringify({ ok: true });
      }

      case 'escalar_humano': {
        const motivo = String(input.motivo);
        await saveLead({
          clinic_id: clinic.id,
          jid,
          nombre: input.nombre ? String(input.nombre) : undefined,
          telefono: input.telefono ? String(input.telefono) : undefined,
          interes: 'ESCALADO',
          notas: motivo,
          escalado: true,
          motivo_escalado: motivo,
        });
        // Mejora crítica: avisar de verdad al humano de la clínica por WhatsApp.
        const cliente = input.nombre ? String(input.nombre) : 'un cliente';
        const tel = input.telefono ? ` (tel: ${input.telefono})` : '';
        const avisado = await notifyHuman(
          clinic,
          `🔔 Escalamiento en ${clinic.nombre}\nCliente: ${cliente}${tel}\nChat: ${jid}\nMotivo: ${motivo}`,
        );
        return JSON.stringify({
          ok: true,
          mensaje: avisado
            ? 'Avisé a una persona del equipo; te escribirá pronto.'
            : 'Quedó registrado para que una persona del equipo lo atienda.',
        });
      }

      default:
        return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
    }
  } catch (err) {
    console.error(`[tool ${name}] error:`, err);
    return JSON.stringify({ ok: false, error: 'Error interno ejecutando la herramienta.' });
  }
}
