/**
 * Prueba del pedido de reseñas: inserta una cita simulada de ayer, corre la
 * revisión con un "enviador" falso (imprime en vez de mandar WhatsApp), verifica
 * que la cita queda marcada y la borra al final.
 *
 *   npx tsx scripts/test_resenas.ts
 */
import { getActiveClinics } from '../src/db.js';
import { forClinic } from '../src/scope.js';
import { revisarResenas } from '../src/reviews.js';

const clinic = (await getActiveClinics())[0];
if (!clinic) throw new Error('No hay clínicas activas');

// 1. Insertar cita simulada: ayer a esta misma hora (cae en la ventana 2-26h).
//    OJO: fecha y hora se guardan en la TZ de la clínica (config.tz) — igual que
//    lo hace el bot al agendar — así que ambas se construyen en hora LOCAL.
const ayer = new Date(Date.now() - 24 * 3600 * 1000);
const pad = (n: number) => String(n).padStart(2, '0');
const fecha = `${ayer.getFullYear()}-${pad(ayer.getMonth() + 1)}-${pad(ayer.getDate())}`;
const hora = ayer.toTimeString().slice(0, 8);

const { data: insertada, error } = await forClinic(clinic.id)
  .insert('appointments', {
    clinic_id: clinic.id,
    jid: 'test-resena@s.whatsapp.net',
    nombre: 'Cliente De Prueba',
    servicio: 'Vacunación',
    mascota: 'Firulais',
    fecha,
    hora,
    estado: 'confirmada',
  })
  .select()
  .single();
if (error) throw error;

console.log('=== ANTES: cita simulada insertada ===');
console.log({ id: insertada.id, fecha, hora, resena_pedida: insertada.resena_pedida });

// 2. Correr la revisión con enviador falso (no toca WhatsApp).
let mensajeGenerado = '';
const enviadas = await revisarResenas(clinic, async (_clinic, jid, texto) => {
  mensajeGenerado = texto;
  console.log(`\n=== MENSAJE QUE SE ENVIARÍA a ${jid}: ===\n`);
  console.log(texto);
  return true;
});

// 3. Verificar que la cita quedó marcada.
const { data: despues } = await forClinic(clinic.id)
  .select('appointments', 'id, resena_pedida')
  .eq('id', insertada.id)
  .single();

console.log('\n=== DESPUÉS: cita marcada ===');
console.log({ id: despues?.id, resena_pedida: despues?.resena_pedida });

// 4. Limpiar: borrar la cita simulada.
await forClinic(clinic.id).delete('appointments').eq('id', insertada.id);
const { data: verificarBorrada } = await forClinic(clinic.id)
  .select('appointments', 'id')
  .eq('id', insertada.id);
console.log('\n=== LIMPIEZA: cita simulada borrada ===');
console.log({ filas_restantes: verificarBorrada?.length ?? 0 });

// Resultado final
const ok = enviadas >= 1 && mensajeGenerado.includes(String(clinic.google_review_url)) && despues?.resena_pedida;
console.log(`\nRESULTADO: ${ok ? '✅ PASA' : '❌ FALLA'} (enviadas=${enviadas}, marcada=${Boolean(despues?.resena_pedida)})`);
process.exit(ok ? 0 : 1);
