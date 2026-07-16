/**
 * Prueba del vertical DENTAL: conversación REAL contra el cerebro (handleMessage,
 * LLM free de OpenRouter) con la Clínica Dental Sonríe, sin WhatsApp.
 *
 * Flujo: pedir valoración para implantes el viernes → el bot debe ofrecer
 * horarios reales (tool consultar_disponibilidad) → elegir uno y dar nombre →
 * el bot agenda (fila real en appointments). Limpieza al final.
 *
 *   npx tsx scripts/test_dental.ts
 */
import { getClinicBySessionId } from '../src/db.js';
import { forClinic } from '../src/scope.js';
import { handleMessage } from '../src/brain.js';

const clinic = await getClinicBySessionId('dental-sonrie');
if (!clinic) throw new Error('No existe la clínica dental-sonrie. Corre el seed primero.');

const JID = 'test-dental@s.whatsapp.net';
const resultados: boolean[] = [];

// Limpieza previa por si quedó basura de una corrida anterior.
await forClinic(clinic.id).delete('messages').eq('jid', JID);
await forClinic(clinic.id).delete('appointments').eq('jid', JID);
await forClinic(clinic.id).delete('contacts').eq('jid', JID);

console.log(`Clínica: ${clinic.nombre} (${clinic.vertical}, plan ${clinic.plan})\n`);

// ── Turno 1: pedir valoración para implantes ─────────────────────────────────
const pregunta1 = 'Hola, quiero una valoración para implantes, ¿tienen algo el viernes?';
console.log(`👤 CLIENTE: ${pregunta1}\n`);
const respuesta1 = await handleMessage(clinic, JID, pregunta1);
console.log(`🤖 BOT: ${respuesta1}\n`);
if (respuesta1 === null) {
  console.error('❌ El bot no respondió (null): no hay nada que evaluar. Revisa OPENROUTER_API_KEY / el modelo.');
  process.exit(1);
}


// Debe ofrecer horarios reales (formato de hora) y no inventar diagnósticos.
const ofreceHorarios = /\d{1,2}:\d{2}/.test(respuesta1);
console.log(`>> ¿Ofrece horarios concretos (tool de disponibilidad)?: ${ofreceHorarios ? 'SÍ ✅' : 'NO ❌'}`);
resultados.push(ofreceHorarios);

// ── Turno 2: aceptar el primer horario y dar nombre ──────────────────────────
const horaOfrecida = respuesta1.match(/\d{1,2}:\d{2}/)?.[0] ?? '09:00';
const pregunta2 = `Perfecto, a las ${horaOfrecida} está bien. Mi nombre es Carlos Pérez`;
console.log(`\n👤 CLIENTE: ${pregunta2}\n`);
const respuesta2 = await handleMessage(clinic, JID, pregunta2);
console.log(`🤖 BOT: ${respuesta2}\n`);
if (respuesta2 === null) {
  console.error('❌ El bot no respondió (null): no hay nada que evaluar. Revisa OPENROUTER_API_KEY / el modelo.');
  process.exit(1);
}


// ── Verificar que la cita quedó en la base ───────────────────────────────────
const { data: citas } = await forClinic(clinic.id)
  .select('appointments', 'nombre, servicio, fecha, hora, estado')
  .eq('jid', JID);

console.log('=== CITAS CREADAS EN SUPABASE ===');
console.log(citas);
const citaCreada = (citas ?? []).length >= 1;
resultados.push(citaCreada);

// ── Limpieza ──────────────────────────────────────────────────────────────────
await forClinic(clinic.id).delete('appointments').eq('jid', JID);
await forClinic(clinic.id).delete('messages').eq('jid', JID);
await forClinic(clinic.id).delete('contacts').eq('jid', JID);
await forClinic(clinic.id).delete('ciclos').eq('jid', JID);
const { data: restantes } = await forClinic(clinic.id)
  .select('appointments', 'id')
  .eq('jid', JID);
console.log(`\n=== LIMPIEZA: citas de prueba restantes: ${restantes?.length ?? 0} ===`);

const ok = resultados.every(Boolean);
console.log(
  `\nRESULTADO: ${ok ? '✅ PASA (horarios reales + cita agendada e2e)' : `❌ FALLA (horarios=${resultados[0]}, cita=${resultados[1]})`}`,
);
process.exit(ok ? 0 : 1);
