import type { Vertical } from '../types.js';

export interface Mensaje {
  from: 'cliente' | 'asistente';
  text: string; // admite *negrita* y saltos de línea \n
  hora: string; // "21:14"
}

export interface VerticalConfig {
  /** Color de marca por defecto (avatar + acento del caption). */
  defaultColor: string;
  /** Servicios por defecto si el lead no trae. */
  defaultServicios: string[];
  /** Subtítulo del caption (refuerza el dolor que resuelve). */
  subtitulo: string;
  /** Guion de la conversación demo, parametrizado por servicio. */
  conversacion: (servicio: string) => Mensaje[];
}

export const VERTICALS: Record<Vertical, VerticalConfig> = {
  veterinaria: {
    defaultColor: '#0a7d4b',
    defaultServicios: ['Consulta general', 'Vacunación', 'Baño'],
    subtitulo: 'Responde los mensajes de noche y en hora pico — cuando se escapan los clientes',
    conversacion: (servicio) => [
      { from: 'cliente', hora: '21:14', text: 'Buenas, mi perro lleva el día decaído y no come 😟 ¿tienen cita para mañana?' },
      { from: 'asistente', hora: '21:14', text: '¡Hola! Lamento lo de tu peludo 🐾 Sí, para mañana tengo espacio. ¿Prefieres en la mañana o en la tarde?' },
      { from: 'cliente', hora: '21:15', text: 'En la mañana' },
      { from: 'asistente', hora: '21:15', text: `Perfecto. Tengo *8:30* o *10:00* para ${servicio.toLowerCase()}. ¿Cuál te sirve?` },
      { from: 'cliente', hora: '21:15', text: '8:30 está bien' },
      { from: 'asistente', hora: '21:16', text: '¡Listo! ✅ ¿A nombre de quién la agendo y cómo se llama tu mascota?' },
      { from: 'cliente', hora: '21:16', text: 'Andrea, mi perrito es Toby' },
      { from: 'asistente', hora: '21:16', text: `Cita confirmada, Andrea 🙌\n📅 Mañana 8:30 — ${servicio}\n🐶 Toby\nTe recuerdo una hora antes. ¡Aquí estoy si necesitas algo!` },
    ],
  },

  dental: {
    defaultColor: '#0b7ec2',
    defaultServicios: ['Valoración de ortodoncia', 'Limpieza', 'Implantes'],
    subtitulo: 'Responde primero — el paciente se queda con la clínica que contesta antes',
    conversacion: (servicio) => [
      { from: 'cliente', hora: '19:42', text: `Hola, vi que hacen ${servicio.toLowerCase()}. ¿Cuánto vale la valoración?` },
      { from: 'asistente', hora: '19:42', text: '¡Hola! 😊 La valoración es sin costo y dura unos 20 min. ¿Te gustaría que te agende esta semana?' },
      { from: 'cliente', hora: '19:43', text: 'Sí, ¿qué tienen el jueves?' },
      { from: 'asistente', hora: '19:43', text: 'El jueves tengo *9:00* o *15:30*. ¿Cuál prefieres?' },
      { from: 'cliente', hora: '19:43', text: '15:30' },
      { from: 'asistente', hora: '19:44', text: '¡Perfecto! ✅ ¿A nombre de quién la agendo?' },
      { from: 'cliente', hora: '19:44', text: 'Carlos Pérez' },
      { from: 'asistente', hora: '19:44', text: `Confirmado, Carlos 🙌\n📅 Jueves 15:30 — ${servicio}\nTe llega un recordatorio el día antes. ¡Te esperamos!` },
    ],
  },

  estetica: {
    defaultColor: '#c0397a',
    defaultServicios: ['Valoración', 'Limpieza facial', 'Tratamiento'],
    subtitulo: 'Responde al instante los DM de Instagram y WhatsApp, antes de que se enfríen',
    conversacion: (servicio) => [
      { from: 'cliente', hora: '22:05', text: 'Hola! Les escribo por el post de limpieza facial ✨ ¿hacen valoración?' },
      { from: 'asistente', hora: '22:05', text: '¡Hola, qué gusto! 💆‍♀️ Claro, hacemos una valoración para recomendarte el tratamiento ideal. ¿Esta semana te queda bien?' },
      { from: 'cliente', hora: '22:06', text: 'Sí, entre semana en la tarde' },
      { from: 'asistente', hora: '22:06', text: 'Genial. Tengo *miércoles 16:00* o *viernes 17:30*. ¿Cuál te gusta más?' },
      { from: 'cliente', hora: '22:06', text: 'Viernes 17:30' },
      { from: 'asistente', hora: '22:07', text: '¡Lista! ✅ ¿A nombre de quién la agendo?' },
      { from: 'cliente', hora: '22:07', text: 'Daniela' },
      { from: 'asistente', hora: '22:07', text: `Confirmado, Daniela 🙌\n📅 Viernes 17:30 — ${servicio}\nTe recuerdo el día antes. ¡Nos vemos! ✨` },
    ],
  },
};
