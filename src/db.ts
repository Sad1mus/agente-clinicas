import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import type { Appointment, Clinic, HistoryMessage } from './types.js';

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function getActiveClinics(): Promise<Clinic[]> {
  const { data, error } = await supabase.from('clinics').select('*').eq('activo', true);
  if (error) throw error;
  return (data ?? []) as Clinic[];
}

/** Últimos N turnos de la conversación con un contacto, en orden cronológico. */
export async function getRecentHistory(
  clinicId: string,
  jid: string,
  limit = 20,
): Promise<HistoryMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('clinic_id', clinicId)
    .eq('jid', jid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as HistoryMessage[]).reverse();
}

export async function saveMessage(
  clinicId: string,
  jid: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ clinic_id: clinicId, jid, role, content });
  if (error) throw error;
}

export async function upsertContact(clinicId: string, jid: string): Promise<void> {
  await supabase.from('contacts').upsert({ clinic_id: clinicId, jid }, { onConflict: 'clinic_id,jid' });
}

/** Citas (no canceladas) de un día — para calcular disponibilidad. */
export async function getAppointmentsForDate(
  clinicId: string,
  fecha: string,
): Promise<{ hora: string }[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('hora')
    .eq('clinic_id', clinicId)
    .eq('fecha', fecha)
    .neq('estado', 'cancelada');
  if (error) throw error;
  return (data ?? []) as { hora: string }[];
}

export async function createAppointment(row: {
  clinic_id: string;
  jid: string;
  nombre: string;
  telefono?: string;
  servicio?: string;
  mascota?: string;
  fecha: string;
  hora: string;
}): Promise<void> {
  const { error } = await supabase.from('appointments').insert(row);
  if (error) throw error;
}

export async function saveLead(row: {
  clinic_id: string;
  jid: string;
  nombre?: string;
  telefono?: string;
  interes?: string;
  notas?: string;
  escalado?: boolean;
  motivo_escalado?: string;
}): Promise<void> {
  const { error } = await supabase.from('leads').insert(row);
  if (error) throw error;
}

// ======================= Confirmación de citas =========================

/** Última cita futura activa de un contacto (para confirmar/cancelar por chat). */
export async function getUpcomingAppointment(
  clinicId: string,
  jid: string,
): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('jid', jid)
    .neq('estado', 'cancelada')
    .gte('fecha', new Date().toISOString().slice(0, 10))
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Appointment) ?? null;
}

export async function setAppointmentStatus(
  appointmentId: string,
  estado: 'agendada' | 'confirmada' | 'cancelada',
): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({ estado })
    .eq('id', appointmentId);
  if (error) throw error;
}

// ===================== Recordatorios anti no-show ======================

/** Citas activas de una clínica para una fecha, con su estado de recordatorios. */
export async function getActiveAppointmentsForDate(
  clinicId: string,
  fecha: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('fecha', fecha)
    .neq('estado', 'cancelada');
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

export async function markReminderSent(
  appointmentId: string,
  tipo: 'recordatorio_24h' | 'recordatorio_2h',
): Promise<void> {
  const { error } = await supabase
    .from('appointments')
    .update({ [tipo]: new Date().toISOString() })
    .eq('id', appointmentId);
  if (error) throw error;
}

// ===================== Dashboard (panel de clientas) ===================

export async function getClinicByDashboardToken(token: string): Promise<Clinic | null> {
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('dashboard_token', token)
    .eq('activo', true)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Clinic) ?? null;
}

/** Todos los datos que pinta el dashboard, en una sola pasada. */
export async function getDashboardData(clinic: Clinic) {
  const hoy = new Date().toISOString().slice(0, 10);
  const hace7dias = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [citas, contactos, leads, mensajes, mensajesHoy] = await Promise.all([
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinic.id)
      .gte('fecha', hoy)
      .neq('estado', 'cancelada')
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true })
      .limit(50),
    supabase
      .from('contacts')
      .select('jid, nombre, created_at', { count: 'exact' })
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('leads')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('messages')
      .select('jid, role, content, created_at')
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinic.id)
      .gte('created_at', `${hoy}T00:00:00`),
  ]);

  const citasSemana = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinic.id)
    .neq('estado', 'cancelada')
    .gte('created_at', hace7dias);

  return {
    clinica: {
      nombre: clinic.nombre,
      vertical: clinic.vertical,
      ciudad: clinic.ciudad,
      plan: clinic.plan,
    },
    kpis: {
      citas_proximas: citas.data?.length ?? 0,
      citas_hoy: (citas.data ?? []).filter((c) => c.fecha === hoy).length,
      citas_ultimos_7d: citasSemana.count ?? 0,
      clientes_totales: contactos.count ?? 0,
      mensajes_hoy: mensajesHoy.count ?? 0,
      leads_capturados: (leads.data ?? []).length,
      escalamientos: (leads.data ?? []).filter((l) => l.escalado).length,
    },
    citas: citas.data ?? [],
    contactos: contactos.data ?? [],
    leads: leads.data ?? [],
    conversaciones: (mensajes.data ?? []).reverse(),
  };
}
