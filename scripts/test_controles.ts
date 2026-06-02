/**
 * Prueba de los controles del dueño (/pausar, /activar, /clientes):
 *   1. /pausar → pausado=true en Supabase
 *   2. Mensaje de cliente con la clínica pausada → NO genera respuesta, pero SÍ queda en messages
 *   3. /activar → pausado=false
 *   4. El mismo mensaje con la clínica activa → SÍ genera respuesta (LLM real)
 *   5. /clientes → imprime la lista de últimos contactos
 *
 *   npx tsx scripts/test_controles.ts
 */
import { getClinicBySessionId, supabase } from '../src/db.js';
import { handleOwnerCommand } from '../src/owner.js';
import { handleMessage } from '../src/brain.js';

// Usamos la clínica dental (activo=false → no interfiere con el bot corriendo del usuario).
const clinic = await getClinicBySessionId('dental-sonrie');
if (!clinic) throw new Error('No existe la clínica dental-sonrie');

const JID_DUENO = 'test-dueno@s.whatsapp.net';
const JID_CLIENTE = 'test-cliente-pausa@s.whatsapp.net';
const resultados: boolean[] = [];

// Limpieza previa.
const limpiar = async () => {
  await supabase.from('messages').delete().eq('clinic_id', clinic.id).in('jid', [JID_CLIENTE]);
  await supabase.from('contacts').delete().eq('clinic_id', clinic.id).in('jid', [JID_CLIENTE]);
  await supabase.from('appointments').delete().eq('clinic_id', clinic.id).in('jid', [JID_CLIENTE]);
};
await limpiar();

// ── 1. /pausar ────────────────────────────────────────────────────────────────
console.log('════════ TEST 1: /pausar ════════');
const rPausar = await handleOwnerCommand(clinic, '/pausar', JID_DUENO);
console.log(rPausar);
const { data: estado1 } = await supabase.from('clinics').select('pausado').eq('id', clinic.id).single();
console.log(`\n>> pausado en Supabase: ${estado1?.pausado}`);
resultados.push(estado1?.pausado === true);

// ── 2. Mensaje de cliente con clínica pausada ────────────────────────────────
console.log('\n════════ TEST 2: mensaje de cliente estando PAUSADA ════════');
const clinicPausada = { ...clinic, pausado: true };
const respuestaPausada = await handleMessage(clinicPausada, JID_CLIENTE, 'Hola, quiero una cita');
console.log(`>> Respuesta del bot: ${respuestaPausada === null ? 'NINGUNA (null) ✅' : `"${respuestaPausada}" ❌`}`);
const { data: msgsPausada } = await supabase
  .from('messages')
  .select('role, content')
  .eq('clinic_id', clinic.id)
  .eq('jid', JID_CLIENTE);
console.log(`>> Mensajes guardados en historial: ${msgsPausada?.length} (el mensaje del cliente NO se perdió)`);
console.log(msgsPausada);
resultados.push(respuestaPausada === null && (msgsPausada?.length ?? 0) === 1 && msgsPausada?.[0]?.role === 'user');

// ── 3. /activar ───────────────────────────────────────────────────────────────
console.log('\n════════ TEST 3: /activar ════════');
const rActivar = await handleOwnerCommand(clinic, '/activar', JID_DUENO);
console.log(rActivar);
const { data: estado2 } = await supabase.from('clinics').select('pausado').eq('id', clinic.id).single();
console.log(`\n>> pausado en Supabase: ${estado2?.pausado}`);
resultados.push(estado2?.pausado === false);

// ── 4. El mismo mensaje con la clínica ACTIVA → sí responde ───────────────────
console.log('\n════════ TEST 4: mensaje de cliente estando ACTIVA (LLM real) ════════');
const respuestaActiva = await handleMessage(clinic, JID_CLIENTE, '¿Atienden los sábados?');
console.log(`🤖 BOT: ${respuestaActiva}`);
resultados.push(typeof respuestaActiva === 'string' && respuestaActiva.length > 0);

// ── 5. /clientes ──────────────────────────────────────────────────────────────
console.log('\n════════ TEST 5: /clientes ════════');
const rClientes = await handleOwnerCommand(clinic, '/clientes', JID_DUENO);
console.log(rClientes);
resultados.push(Boolean(rClientes?.includes('Últimos clientes')));

// ── Limpieza final ─────────────────────────────────────────────────────────────
await limpiar();
console.log('\n=== LIMPIEZA: datos de prueba borrados ===');

const ok = resultados.every(Boolean);
console.log(
  `\nRESULTADO: ${ok ? `✅ PASAN ${resultados.length}/${resultados.length}` : `❌ FALLA (${resultados.map((r, i) => `t${i + 1}=${r}`).join(', ')})`}`,
);
process.exit(ok ? 0 : 1);
