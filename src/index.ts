import { getActiveClinics } from './db.js';
import { startClinicSocket } from './whatsapp.js';

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

  console.log('Listo. Esperando mensajes… (Ctrl+C para salir)');
}

main().catch((err) => {
  console.error('Error fatal al arrancar:', err);
  process.exit(1);
});
