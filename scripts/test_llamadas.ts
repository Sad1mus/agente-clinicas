/**
 * Prueba del rescate de llamadas perdidas: simula eventos 'call' de Baileys con
 * un enviador falso y verifica:
 *   1. Llamada perdida (timeout) → genera mensaje de rescate + lead
 *   2. Anti-spam: segunda llamada perdida en <6h → NO genera mensaje
 *   3. Llamada contestada (accept) → NO genera mensaje
 *   4. Plan basic → NO genera mensaje (gating)
 *
 *   npx tsx scripts/test_llamadas.ts
 */
import { getActiveClinics } from '../src/db.js';
import { forClinic } from '../src/scope.js';
import { handleCallEvents, resetAntiSpam } from '../src/missed-calls.js';

const clinic = (await getActiveClinics())[0];
if (!clinic) throw new Error('No hay clínicas activas');

const JID_TEST = 'test-llamada@s.whatsapp.net';
const resultados: boolean[] = [];
let mensajes: string[] = [];

const enviarFalso = async (jid: string, texto: string) => {
  mensajes.push(texto);
  console.log(`  📤 MENSAJE a ${jid}:\n  ${texto.split('\n').join('\n  ')}\n`);
};

// ── 1. Llamada perdida → debe enviar rescate ────────────────────────────
console.log('=== TEST 1: llamada perdida (timeout) con plan', clinic.plan, '===');
resetAntiSpam();
mensajes = [];
const r1 = await handleCallEvents(clinic, [{ chatId: JID_TEST, status: 'timeout' }], enviarFalso);
console.log(`Rescates enviados: ${r1} (esperado: 1)`);
resultados.push(r1 === 1 && mensajes[0].includes(clinic.nombre));

// ── 2. Anti-spam: segunda llamada en <6h → NO debe enviar ──────────────
console.log('=== TEST 2: segunda llamada perdida inmediata (anti-spam) ===');
mensajes = [];
const r2 = await handleCallEvents(clinic, [{ chatId: JID_TEST, status: 'timeout' }], enviarFalso);
console.log(`Rescates enviados: ${r2} (esperado: 0)`);
resultados.push(r2 === 0);

// ── 3. Llamada contestada → NO debe enviar ──────────────────────────────
console.log('=== TEST 3: llamada contestada (accept) ===');
resetAntiSpam();
mensajes = [];
const r3 = await handleCallEvents(clinic, [{ chatId: 'otro@s.whatsapp.net', status: 'accept' }], enviarFalso);
console.log(`Rescates enviados: ${r3} (esperado: 0)`);
resultados.push(r3 === 0);

// ── 4. Gating: plan basic → NO debe enviar ───────────────────────────────
console.log('=== TEST 4: gating con plan basic ===');
resetAntiSpam();
mensajes = [];
const clinicBasic = { ...clinic, plan: 'basic' as const };
const r4 = await handleCallEvents(clinicBasic, [{ chatId: JID_TEST, status: 'timeout' }], enviarFalso);
console.log(`Rescates enviados: ${r4} (esperado: 0)`);
resultados.push(r4 === 0);

// ── Limpieza: leads y mensajes de prueba ─────────────────────────────────
await forClinic(clinic.id).delete('leads').eq('jid', JID_TEST);
await forClinic(clinic.id).delete('messages').eq('jid', JID_TEST);
console.log('\n=== LIMPIEZA: leads y mensajes de prueba borrados ===');

const ok = resultados.every(Boolean);
console.log(`\nRESULTADO: ${ok ? '✅ PASAN 4/4' : `❌ FALLA (${resultados.map((r, i) => `test${i + 1}=${r}`).join(', ')})`}`);
process.exit(ok ? 0 : 1);
