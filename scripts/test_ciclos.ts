/**
 * Prueba de recordatorios de ciclos: inserta un ciclo de vacuna con fecha de hoy,
 * corre la revisión con un enviador falso, verifica que se genera el mensaje y el
 * ciclo queda marcado, y lo borra al final.
 *
 *   npx tsx scripts/test_ciclos.ts
 */
import { getActiveClinics, supabase } from '../src/db.js';
import { revisarCiclos } from '../src/cycles.js';

const clinic = (await getActiveClinics())[0];
if (!clinic) throw new Error('No hay clínicas activas');

// 1. Insertar ciclo de prueba: refuerzo de vacuna con fecha de HOY.
const hoy = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const fechaHoy = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}-${pad(hoy.getDate())}`;

const { data: ciclo, error } = await supabase
  .from('ciclos')
  .insert({
    clinic_id: clinic.id,
    jid: 'test-ciclo@s.whatsapp.net',
    mascota: 'Firulais',
    tipo: 'vacuna',
    descripcion: 'refuerzo anual de rabia',
    fecha_proxima: fechaHoy,
  })
  .select()
  .single();
if (error) throw error;

console.log('=== ANTES: ciclo insertado ===');
console.log({ id: ciclo.id, tipo: ciclo.tipo, fecha_proxima: ciclo.fecha_proxima, enviado: ciclo.enviado });

// 2. Correr la revisión con enviador falso.
let mensaje = '';
const enviados = await revisarCiclos(clinic, async (_clinic, jid, texto) => {
  mensaje = texto;
  console.log(`\n=== MENSAJE QUE SE ENVIARÍA a ${jid}: ===\n`);
  console.log(texto);
  return true;
});

// 3. Verificar que el ciclo quedó marcado.
const { data: despues } = await supabase
  .from('ciclos')
  .select('id, enviado')
  .eq('id', ciclo.id)
  .single();
console.log('\n=== DESPUÉS: ciclo marcado ===');
console.log({ id: despues?.id, enviado: despues?.enviado });

// 4. Limpieza (ciclo + mensaje de historial que guarda revisarCiclos).
await supabase.from('ciclos').delete().eq('id', ciclo.id);
await supabase.from('messages').delete().eq('clinic_id', clinic.id).eq('jid', 'test-ciclo@s.whatsapp.net');
const { data: restantes } = await supabase.from('ciclos').select('id').eq('id', ciclo.id);
console.log('\n=== LIMPIEZA ===');
console.log({ ciclos_restantes: restantes?.length ?? 0 });

const ok = enviados >= 1 && mensaje.includes('Firulais') && Boolean(despues?.enviado);
console.log(`\nRESULTADO: ${ok ? '✅ PASA' : '❌ FALLA'} (enviados=${enviados}, marcado=${Boolean(despues?.enviado)})`);
process.exit(ok ? 0 : 1);
