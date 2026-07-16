/**
 * Prueba del vertical ESTÉTICA: conversación REAL contra el cerebro con la clínica
 * Estética Belle. El caso crítico: preguntan PRECIO de un tratamiento — el precio
 * NO está en la ficha, así que el bot NO puede inventarlo; debe llevar a una
 * valoración (donde se da el presupuesto exacto).
 *
 *   npx tsx scripts/test_estetica.ts
 */
import { getClinicBySessionId } from '../src/db.js';
import { forClinic } from '../src/scope.js';
import { handleMessage } from '../src/brain.js';

const clinic = await getClinicBySessionId('estetica-belle');
if (!clinic) throw new Error('No existe la clínica estetica-belle. Corre el seed primero.');

const JID = 'test-estetica@s.whatsapp.net';
const resultados: boolean[] = [];

// Limpieza previa.
await forClinic(clinic.id).delete('messages').eq('jid', JID);
await forClinic(clinic.id).delete('appointments').eq('jid', JID);
await forClinic(clinic.id).delete('contacts').eq('jid', JID);
await forClinic(clinic.id).delete('leads').eq('jid', JID);

console.log(`Clínica: ${clinic.nombre} (${clinic.vertical}, plan ${clinic.plan})\n`);

// ── Turno 1: pregunta de precio (típico DM de Instagram) ─────────────────────
const pregunta1 = 'Hola! Vi sus fotos en Instagram 😍 ¿cuánto cuesta la depilación láser?';
console.log(`👤 CLIENTA: ${pregunta1}\n`);
const respuesta1 = await handleMessage(clinic, JID, pregunta1);
console.log(`🤖 BOT: ${respuesta1}\n`);
if (respuesta1 === null) {
  console.error('❌ El bot no respondió (null): no hay nada que evaluar. Revisa OPENROUTER_API_KEY / el modelo.');
  process.exit(1);
}


// CHECK A: NO debe inventar precios (cifras en pesos). Patrones: $XXX.XXX, "300 mil", "300.000 pesos", "desde $X"
const patronPrecio = /\$\s?[\d.,]+|[\d.,]+\s?(mil|pesos|cop)\b|\bdesde\s+[\d.,]+/i;
const inventaPrecio = patronPrecio.test(respuesta1);
console.log(`>> ¿Inventó un precio?: ${inventaPrecio ? 'SÍ ❌ (ALUCINACIÓN)' : 'NO ✅'}`);
resultados.push(!inventaPrecio);

// CHECK B: debe ofrecer la valoración como siguiente paso.
const ofreceValoracion = /valoraci[oó]n/i.test(respuesta1);
console.log(`>> ¿Ofrece valoración como siguiente paso?: ${ofreceValoracion ? 'SÍ ✅' : 'NO ❌'}`);
resultados.push(ofreceValoracion);

// ── Turno 2: acepta la valoración ─────────────────────────────────────────────
const pregunta2 = 'Bueno sí, ¿qué horarios tienen mañana para la valoración?';
console.log(`\n👤 CLIENTA: ${pregunta2}\n`);
const respuesta2 = await handleMessage(clinic, JID, pregunta2);
console.log(`🤖 BOT: ${respuesta2}\n`);
if (respuesta2 === null) {
  console.error('❌ El bot no respondió (null): no hay nada que evaluar. Revisa OPENROUTER_API_KEY / el modelo.');
  process.exit(1);
}


// CHECK C: ofrece horarios reales.
const ofreceHorarios = /\d{1,2}:\d{2}/.test(respuesta2);
console.log(`>> ¿Ofrece horarios concretos?: ${ofreceHorarios ? 'SÍ ✅' : 'NO ❌'}`);
resultados.push(ofreceHorarios);

// ── Limpieza ──────────────────────────────────────────────────────────────────
await forClinic(clinic.id).delete('appointments').eq('jid', JID);
await forClinic(clinic.id).delete('messages').eq('jid', JID);
await forClinic(clinic.id).delete('contacts').eq('jid', JID);
await forClinic(clinic.id).delete('leads').eq('jid', JID);
console.log('=== LIMPIEZA: datos de prueba borrados ===');

const ok = resultados.every(Boolean);
console.log(
  `\nRESULTADO: ${ok ? '✅ PASA (no inventa precios + ofrece valoración + horarios reales)' : `❌ FALLA (sin_precio=${resultados[0]}, valoracion=${resultados[1]}, horarios=${resultados[2]})`}`,
);
process.exit(ok ? 0 : 1);
