export type Vertical = 'veterinaria' | 'dental' | 'estetica';

/** Planes del servicio. TODOS incluyen dashboard (panel de clientas). */
export type Plan = 'basic' | 'growth' | 'scale';

export interface Horario {
  dias: number[];          // 1=lunes ... 7=domingo
  inicio: string;          // "08:00"
  fin: string;             // "18:00"
  duracion_min: number;    // duración de cada cita
  almuerzo?: [string, string]; // rango bloqueado opcional
}

export interface Clinic {
  id: string;
  nombre: string;
  vertical: Vertical;
  ciudad: string | null;
  direccion: string | null;
  servicios: string[];
  horario: Horario;
  tono: string | null;
  /** FAQs de la clínica (medios de pago, parqueadero, etc.) — clave: respuesta. */
  info_extra: Record<string, string>;
  session_id: string;
  telefono_humano: string | null;
  plan: Plan;
  /** Token de acceso al dashboard de esta clínica (URL: /d/<token>). */
  dashboard_token: string | null;
  /** Cuándo se envió el último reporte semanal (planes Growth/Scale). */
  ultimo_reporte: string | null;
  /** Valor promedio de una cita en COP (para el ROI del dashboard, Growth/Scale). */
  valor_cita_promedio: number;
  /** Link de Google Reviews de la clínica (para el pedido de reseñas, Growth/Scale). */
  google_review_url: string | null;
  activo: boolean;
}

/** Cita tal como vive en la tabla appointments. */
export interface Appointment {
  id: string;
  clinic_id: string;
  jid: string | null;
  nombre: string | null;
  telefono: string | null;
  servicio: string | null;
  mascota: string | null;
  fecha: string;        // YYYY-MM-DD
  hora: string;         // HH:MM:SS
  estado: 'agendada' | 'confirmada' | 'cancelada';
  recordatorio_24h: string | null;
  recordatorio_2h: string | null;
  resena_pedida: string | null;
  created_at: string;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
