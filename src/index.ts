import { getActiveClinics } from './db.js';
import { startClinicSocket } from './whatsapp.js';
import { startDashboard } from './dashboard/server.js';
import { startReminders } from './reminders.js';
import { startWeeklyReports } from './reports.js';
import { startReviews } from './reviews.js';
import { config } from './config.js';

async function main() {
  console.log('Agente de clínicas — arrancando…');
  const clinics = await getActiveClinics();

  if (clinics.length === 0) {
    console.error('No hay clínicas activas en Supabase. Ejecuta supabase/seed.sql primero.');
    process.exit(1);
  }

  console.log(`Clínicas activas: ${clinics.map((c) => c.nombre).join(', ')}`);

  // Un socket de WhatsApp por clínica (multi-tenant).
  for (const clinic of clinics) {
    await startClinicSocket(clinic);
  }

  // Panel de clientas (dashboard web) — incluido en TODOS los planes.
  startDashboard();
  for (const clinic of clinics) {
    if (clinic.dashboard_token) {
      console.log(`   📊 ${clinic.nombre}: http://localhost:${config.dashboardPort}/d/${clinic.dashboard_token}`);
    }
  }

  // Recordatorios anti no-show (24h y 2h antes, con confirmación por chat).
  startReminders(clinics);

  // Reporte semanal al dueño por WhatsApp (planes Growth/Scale).
  startWeeklyReports(clinics);

  // Pedido de reseñas de Google post-cita (planes Growth/Scale).
  startReviews(clinics);

  console.log('Listo. Esperando mensajes… (Ctrl+C para salir)');
}

main().catch((err) => {
  console.error('Error fatal al arrancar:', err);
  process.exit(1);
});
