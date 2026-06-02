/**
 * Prueba del reporte semanal: genera e imprime el reporte de cada clínica activa
 * con datos REALES (no lo envía por WhatsApp). También demuestra el gating por plan.
 *
 *   npx tsx scripts/test_reporte.ts
 */
import { getActiveClinics } from '../src/db.js';
import { generarReporteSemanal } from '../src/reports.js';
import { planIncluye } from '../src/plans.js';

const clinics = await getActiveClinics();

for (const clinic of clinics) {
  const incluido = planIncluye(clinic, 'reporte_semanal');
  console.log(`\n========== ${clinic.nombre} (plan: ${clinic.plan}) ==========`);
  console.log(`¿Su plan incluye reporte semanal?: ${incluido ? 'SÍ ✅' : 'NO ❌ (necesita Growth o Scale)'}`);
  if (incluido) {
    console.log('--- Texto que recibiría el dueño por WhatsApp: ---\n');
    console.log(await generarReporteSemanal(clinic));
  }
}

process.exit(0);
