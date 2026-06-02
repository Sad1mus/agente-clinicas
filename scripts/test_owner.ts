/**
 * Prueba de los comandos del dueño: verifica detección del dueño y las
 * respuestas de cada comando con datos reales (sin enviar nada por WhatsApp).
 *
 *   npx tsx scripts/test_owner.ts
 */
import { getActiveClinics } from '../src/db.js';
import { esDuenio, handleOwnerCommand } from '../src/owner.js';

const clinic = (await getActiveClinics())[0];
if (!clinic) throw new Error('No hay clínicas activas');

const resultados: boolean[] = [];

// 1. Detección del dueño
console.log('=== TEST 1: detección del dueño ===');
const duenoOk = esDuenio(clinic, clinic.telefono_humano!.replace(/\D/g, ''));
const extranoOk = !esDuenio(clinic, '573009999999');
console.log({ telefono_humano_es_dueno: duenoOk, numero_random_no_es_dueno: extranoOk });
resultados.push(duenoOk && extranoOk);

// 2. Comando /hoy
console.log('\n=== TEST 2: comando /hoy ===');
const hoy = await handleOwnerCommand(clinic, '/hoy');
console.log(hoy);
resultados.push(Boolean(hoy?.includes('Hoy en') && hoy?.includes('Panel completo')));

// 3. Comando /semana (plan scale → debe dar el reporte)
console.log('\n=== TEST 3: comando /semana ===');
const semana = await handleOwnerCommand(clinic, '/semana');
console.log(semana);
resultados.push(Boolean(semana?.includes('Reporte semanal')));

// 4. Comando /panel
console.log('\n=== TEST 4: comando /panel ===');
const panel = await handleOwnerCommand(clinic, '/panel');
console.log(panel);
resultados.push(Boolean(panel?.includes(String(clinic.dashboard_token))));

// 5. Texto desconocido → null (no responde como dueño)
console.log('\n=== TEST 5: texto que no es comando ===');
const nada = await handleOwnerCommand(clinic, 'hola quiero una cita para mi perro');
console.log({ respuesta: nada });
resultados.push(nada === null);

// 6. Variante sin slash y con mayúsculas
console.log('\n=== TEST 6: "Resumen" sin slash ===');
const resumen = await handleOwnerCommand(clinic, 'Resumen');
resultados.push(Boolean(resumen?.includes('Hoy en')));
console.log({ funciona: Boolean(resumen) });

const ok = resultados.every(Boolean);
console.log(`\nRESULTADO: ${ok ? `✅ PASAN ${resultados.length}/${resultados.length}` : `❌ FALLA (${resultados.map((r, i) => `t${i + 1}=${r}`).join(', ')})`}`);
process.exit(ok ? 0 : 1);
