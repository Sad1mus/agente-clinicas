export type Vertical = 'veterinaria' | 'dental' | 'estetica';

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
  activo: boolean;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}
