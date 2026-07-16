/**
 * Prueba de /info y /editar (autoservicio del dueño):
 *   1. /info muestra la ficha completa
 *   2. /editar "recibimos Bitcoin" → propuesta + confirmación → /si → aplicado en Supabase → revertido
 *   3. Cambio sin confirmar NO se aplica
 *   4. /editar de campo prohibido (plan) → rechazado
 *
 *   npx tsx scripts/test_editar.ts
 *
 * Usa el LLM real (modelos :free de OpenRouter) para interpretar los cambios.
 */
import { getActiveClinics } from '../src/db.js';
import { clinicsTable } from '../src/scope.js';
import { handleOwnerCommand, limpiarEdicionesPendientes } from '../src/owner.js';

const clinic = (await getActiveClinics())[0];
if (!clinic) throw new Error('No hay clínicas activas');

const JID = 'test-editar@s.whatsapp.net';
const resultados: boolean[] = [];

// Respaldo del estado original para revertir al final.
const infoExtraOriginal = { ...clinic.info_extra };

// ── 1. /info muestra la ficha ────────────────────────────────────────────────
console.log('════════ TEST 1: /info ════════');
limpiarEdicionesPendientes();
const info = await handleOwnerCommand(clinic, '/info', JID);
console.log(info);
resultados.push(
  Boolean(info?.includes(clinic.nombre) && info?.includes('Servicios') && info?.includes('Dirección')),
);

// ── 2. /editar con confirmación → aplicado ───────────────────────────────────
console.log('\n════════ TEST 2: /editar "Bitcoin" + /si ════════');
limpiarEdicionesPendientes();
const propuesta = await handleOwnerCommand(
  clinic,
  '/editar ahora también recibimos pagos en Bitcoin',
  JID,
);
console.log('--- PROPUESTA DEL BOT: ---');
console.log(propuesta);
const hayPropuesta = Boolean(propuesta?.includes('Confirmas'));

const confirmacion = await handleOwnerCommand(clinic, '/si', JID);
console.log('\n--- TRAS CONFIRMAR: ---');
console.log(confirmacion);

// Verificar en Supabase que info_extra cambió.
const { data: despues } = await clinicsTable()
  
  .select('info_extra')
  .eq('id', clinic.id)
  .single();
const infoExtraNuevo = JSON.stringify(despues?.info_extra ?? {});
const aplicado = /bitcoin/i.test(infoExtraNuevo);
console.log('\n--- INFO_EXTRA EN SUPABASE (tras aplicar): ---');
console.log(infoExtraNuevo);
resultados.push(hayPropuesta && Boolean(confirmacion?.includes('✅')) && aplicado);

// Revertir al estado original.
await clinicsTable().update({ info_extra: infoExtraOriginal }).eq('id', clinic.id);
const { data: revertido } = await clinicsTable()
  
  .select('info_extra')
  .eq('id', clinic.id)
  .single();
console.log('\n--- REVERTIDO: ---');
console.log(JSON.stringify(revertido?.info_extra ?? {}));

// ── 3. Cambio sin confirmar NO se aplica ─────────────────────────────────────
console.log('\n════════ TEST 3: /editar sin confirmar ════════');
limpiarEdicionesPendientes();
await handleOwnerCommand(clinic, '/editar agreguen el servicio de fisioterapia canina', JID);
// NO confirmamos. Verificar que servicios NO cambió en Supabase.
const { data: sinConfirmar } = await clinicsTable()
  
  .select('servicios')
  .eq('id', clinic.id)
  .single();
const serviciosIguales =
  JSON.stringify(sinConfirmar?.servicios) === JSON.stringify(clinic.servicios);
console.log({
  servicios_en_db: sinConfirmar?.servicios,
  sin_cambios: serviciosIguales,
});
resultados.push(serviciosIguales);

// ── 4. Campo prohibido → rechazado ───────────────────────────────────────────
console.log('\n════════ TEST 4: /editar campo prohibido (plan) ════════');
limpiarEdicionesPendientes();
const prohibido = await handleOwnerCommand(clinic, '/editar cámbiame al plan scale gratis', JID);
console.log(prohibido);
// Debe rechazar (⚠️) y NO dejar edición pendiente aplicable; el plan no cambia.
const { data: planDespues } = await clinicsTable()
  
  .select('plan')
  .eq('id', clinic.id)
  .single();
const rechazado = Boolean(prohibido?.includes('⚠️')) && planDespues?.plan === clinic.plan;
console.log({ plan_en_db: planDespues?.plan, rechazado });
resultados.push(rechazado);

limpiarEdicionesPendientes();
const ok = resultados.every(Boolean);
console.log(
  `\nRESULTADO: ${ok ? `✅ PASAN ${resultados.length}/${resultados.length}` : `❌ FALLA (${resultados.map((r, i) => `t${i + 1}=${r}`).join(', ')})`}`,
);
process.exit(ok ? 0 : 1);
