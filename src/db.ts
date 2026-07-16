import type { Appointment, Clinic, HistoryMessage } from './types.js';
import { planIncluye } from './plans.js';
import { clinicsTable, forClinic } from './scope.js';

// El cliente crudo ya no vive aquí ni se exporta: la frontera de tenant es
// `forClinic()` en scope.ts, y solo funciona si nadie puede rodearla. Ver scope.ts.

export async function getActiveClinics(): Promise<Clinic[]> {
  const { data, error } = await clinicsTable().select('*').eq('activo', true);
  if (error) throw error;
  return (data ?? []) as Clinic[];
}

/** ¿La clínica está pausada por el dueño? Lee el estado FRESCO de la DB
 *  (así la pausa aplica al instante, sin reiniciar el proceso). */
export async function estaPausada(clinicId: string): Promise<boolean> {
  const { data, error } = await clinicsTable()
    .select('pausado')
    .eq('id', clinicId)
    .single();
  if (error) return false; // ante la duda, no bloquear la atención
  return Boolean((data as { pausado?: boolean } | null)?.pausado);
}

/** Carga una clínica por session_id, esté activa o no (para tests y onboarding). */
export async function getClinicBySessionId(sessionId: string): Promise<Clinic | null> {
  const { data, error } = await clinicsTable()
    .select('*')
    .eq('session_id', sessionId)
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Clinic) ?? null;
}

/** Últimos N turnos de la conversación con un contacto, en orden cronológico. */
export async function getRecentHistory(
  clinicId: string,
  jid: string,
  limit = 20,
): Promise<HistoryMessage[]> {
  const { data, error } = await forClinic(clinicId)
    .select('messages', 'role, content')
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
  const { error } = await forClinic(clinicId).insert('messages', { jid, role, content });
  if (error) throw error;
}

export async function upsertContact(clinicId: string, jid: string): Promise<void> {
  await forClinic(clinicId).upsert('contacts', { jid }, { onConflict: 'clinic_id,jid' });
}

/** Citas (no canceladas) de un día — para calcular disponibilidad. */
export async function getAppointmentsForDate(
  clinicId: string,
  fecha: string,
): Promise<{ hora: string }[]> {
  const { data, error } = await forClinic(clinicId)
    .select('appointments', 'hora')
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
  const { clinic_id, ...campos } = row;
  const { error } = await forClinic(clinic_id).insert('appointments', campos);
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
  const { clinic_id, ...campos } = row;
  const { error } = await forClinic(clinic_id).insert('leads', campos);
  if (error) throw error;
}

// ======================= Confirmación de citas =========================

/** Última cita futura activa de un contacto (para confirmar/cancelar por chat). */
export async function getUpcomingAppointment(
  clinicId: string,
  jid: string,
): Promise<Appointment | null> {
  const { data, error } = await forClinic(clinicId)
    .select('appointments', '*')
    .eq('jid', jid)
    .neq('estado', 'cancelada')
    .gte('fecha', new Date().toISOString().slice(0, 10))
    .order('fecha', { ascending: true })
    .order('hora', { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0] as Appointment) ?? null;
}

/** Cambia el estado de una cita. `clinicId` no es decorativo: sin él, un id de
 *  cita de otra clínica se actualizaría igual (antes se filtraba solo por PK). */
export async function setAppointmentStatus(
  clinicId: string,
  appointmentId: string,
  estado: 'agendada' | 'confirmada' | 'cancelada',
): Promise<void> {
  const { error } = await forClinic(clinicId)
    .update('appointments', { estado })
    .eq('id', appointmentId);
  if (error) throw error;
}

// ===================== Recordatorios anti no-show ======================

/** Citas activas de una clínica para una fecha, con su estado de recordatorios. */
export async function getActiveAppointmentsForDate(
  clinicId: string,
  fecha: string,
): Promise<Appointment[]> {
  const { data, error } = await forClinic(clinicId)
    .select('appointments', '*')
    .eq('fecha', fecha)
    .neq('estado', 'cancelada');
  if (error) throw error;
  return (data ?? []) as Appointment[];
}

export async function markReminderSent(
  clinicId: string,
  appointmentId: string,
  tipo: 'recordatorio_24h' | 'recordatorio_2h',
): Promise<void> {
  const { error } = await forClinic(clinicId)
    .update('appointments', { [tipo]: new Date().toISOString() })
    .eq('id', appointmentId);
  if (error) throw error;
}

// ===================== Dashboard (panel de clientas) ===================

export async function getClinicByDashboardToken(token: string): Promise<Clinic | null> {
  const { data, error } = await clinicsTable()
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
  const db = forClinic(clinic.id);

  const [citas, contactos, leads, mensajes, mensajesHoy] = await Promise.all([
    db
      .select('appointments', '*')
      .gte('fecha', hoy)
      .neq('estado', 'cancelada')
      .order('fecha', { ascending: true })
      .order('hora', { ascending: true })
      .limit(50),
    db
      .select('contacts', 'jid, nombre, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(100),
    db.select('leads', '*').order('created_at', { ascending: false }).limit(50),
    db
      .select('messages', 'jid, role, content, created_at')
      .order('created_at', { ascending: false })
      .limit(60),
    db
      .select('messages', 'id', { count: 'exact', head: true })
      .gte('created_at', `${hoy}T00:00:00`),
  ]);

  const citasSemana = await db
    .select('appointments', 'id', { count: 'exact', head: true })
    .neq('estado', 'cancelada')
    .gte('created_at', hace7dias);

  // ROI estimado del mes (solo planes que lo incluyen): citas activas del mes × valor promedio.
  let roi: { roi_estimado_mes: number } | Record<string, never> = {};
  if (planIncluye(clinic, 'roi_dashboard')) {
    const inicioMes = `${hoy.slice(0, 7)}-01T00:00:00`;
    const citasMes = await db
      .select('appointments', 'id', { count: 'exact', head: true })
      .neq('estado', 'cancelada')
      .gte('created_at', inicioMes);
    roi = { roi_estimado_mes: (citasMes.count ?? 0) * (clinic.valor_cita_promedio ?? 0) };
  }

  return {
    clinica: {
      nombre: clinic.nombre,
      vertical: clinic.vertical,
      ciudad: clinic.ciudad,
      plan: clinic.plan,
    },
    kpis: {
      citas_proximas: citas.data?.length ?? 0,
      citas_hoy: (citas.data ?? []).filter((c: { fecha: string }) => c.fecha === hoy).length,
      citas_ultimos_7d: citasSemana.count ?? 0,
      clientes_totales: contactos.count ?? 0,
      mensajes_hoy: mensajesHoy.count ?? 0,
      leads_capturados: (leads.data ?? []).length,
      escalamientos: (leads.data ?? []).filter((l: { escalado?: boolean }) => l.escalado).length,
      ...roi,
    },
    citas: citas.data ?? [],
    contactos: contactos.data ?? [],
    leads: leads.data ?? [],
    conversaciones: (mensajes.data ?? []).reverse(),
  };
}
