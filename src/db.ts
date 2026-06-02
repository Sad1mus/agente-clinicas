import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import type { Clinic, HistoryMessage } from './types.js';

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
