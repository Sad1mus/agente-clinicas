/**
 * Onboarding express: crea una clínica nueva completa en Supabase en 1 comando.
 *
 *   npx tsx scripts/nueva_clinica.ts --json '{"nombre":"...","vertical":"veterinaria",...}'
 *   npx tsx scripts/nueva_clinica.ts --json ruta/al/archivo.json
 *
 * Campos requeridos: nombre, vertical, telefono_humano.
 * Todo lo demás tiene defaults sensatos según el vertical.
 * Imprime al final: link del panel, session_id e instrucciones del QR.
 */
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

import { config } from '../src/config.js';
import { clinicsTable } from '../src/scope.js';
import type { Vertical } from '../src/types.js';

interface DatosOnboarding {
  nombre: string;
  vertical: Vertical;
  telefono_humano: string;
  ciudad?: string;
  direccion?: string;
  servicios?: string[];
  horario?: Record<string, unknown>;
  tono?: string;
  medios_pago?: string;
  info_extra?: Record<string, string>;
  valor_cita_promedio?: number;
  google_review_url?: string;
  plan?: 'basic' | 'growth' | 'scale';
}

// ── Defaults por vertical ──────────────────────────────────────────────────────
const DEFAULTS: Record<Vertical, { servicios: string[]; valor: number; tono: string }> = {
  veterinaria: {
    servicios: ['Consulta general', 'Vacunación', 'Baño y peluquería', 'Desparasitación'],
    valor: 80000,
    tono: 'Cálido, cercano y resolutivo. Trata a las mascotas por su nombre.',
  },
  dental: {
    servicios: ['Valoración', 'Limpieza dental', 'Ortodoncia', 'Blanqueamiento'],
    valor: 150000,
    tono: 'Profesional y cercano. Transmite confianza: ir al odontólogo no tiene que dar miedo.',
  },
  estetica: {
    servicios: ['Valoración', 'Limpieza facial', 'Depilación láser', 'Masajes'],
    valor: 200000,
    tono: 'Elegante, cálido y discreto. Hace sentir a cada clienta especial.',
  },
};

const HORARIO_DEFAULT = {
  dias: [1, 2, 3, 4, 5, 6],
  inicio: '08:00',
  fin: '18:00',
  duracion_min: 30,
  almuerzo: ['12:30', '14:00'],
};

// ── Parsear argumentos ─────────────────────────────────────────────────────────
const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx === -1 || !process.argv[jsonIdx + 1]) {
  console.error('Uso: npx tsx scripts/nueva_clinica.ts --json \'{"nombre":...}\' (o ruta a archivo .json)');
  process.exit(1);
}
const jsonArg = process.argv[jsonIdx + 1];
const raw = existsSync(jsonArg) ? readFileSync(jsonArg, 'utf8') : jsonArg;

let datos: DatosOnboarding;
try {
  datos = JSON.parse(raw) as DatosOnboarding;
} catch {
  console.error('❌ El JSON no es válido. Revisa las comillas y la sintaxis.');
  process.exit(1);
}

// ── Validar requeridos ─────────────────────────────────────────────────────────
const faltantes = (['nombre', 'vertical', 'telefono_humano'] as const).filter((c) => !datos[c]);
if (faltantes.length > 0) {
  console.error(`❌ Faltan campos requeridos: ${faltantes.join(', ')}`);
  process.exit(1);
}
if (!['veterinaria', 'dental', 'estetica'].includes(datos.vertical)) {
  console.error(`❌ Vertical inválido: "${datos.vertical}". Usa: veterinaria | dental | estetica`);
  process.exit(1);
}

// ── Construir la clínica con defaults ──────────────────────────────────────────
const def = DEFAULTS[datos.vertical];
const sessionId = datos.nombre
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const infoExtra: Record<string, string> = { ...(datos.info_extra ?? {}) };
if (datos.medios_pago) infoExtra.medios_pago = datos.medios_pago;

const fila = {
  nombre: datos.nombre,
  vertical: datos.vertical,
  ciudad: datos.ciudad ?? null,
  direccion: datos.direccion ?? null,
  servicios: datos.servicios ?? def.servicios,
  horario: datos.horario ?? HORARIO_DEFAULT,
  tono: datos.tono ?? def.tono,
  info_extra: infoExtra,
  session_id: sessionId,
  telefono_humano: datos.telefono_humano.replace(/\D/g, ''),
  plan: datos.plan ?? 'basic',
  valor_cita_promedio: datos.valor_cita_promedio ?? def.valor,
  google_review_url: datos.google_review_url ?? null,
  dashboard_token: randomBytes(16).toString('hex'),
  activo: true,
};

// ── Insertar ───────────────────────────────────────────────────────────────────
const { data, error } = await clinicsTable().insert(fila).select().single();
if (error) {
  if (error.code === '23505') {
    console.error(`❌ Ya existe una clínica con session_id "${sessionId}". ¿Es un duplicado?`);
  } else {
    console.error('❌ Error creando la clínica:', error.message);
  }
  process.exit(1);
}

// ── Resultado ──────────────────────────────────────────────────────────────────
console.log('');
console.log('═'.repeat(60));
console.log(`✅ CLÍNICA CREADA: ${data.nombre}`);
console.log('═'.repeat(60));
console.log('');
console.log(`   Vertical:    ${data.vertical}`);
console.log(`   Plan:        ${data.plan}`);
console.log(`   Session ID:  ${data.session_id}`);
console.log(`   Servicios:   ${(data.servicios as string[]).join(', ')}`);
console.log('');
console.log('📊 PANEL DE CLIENTAS (envíaselo al dueño):');
console.log(`   ${config.dashboardUrl}/d/${data.dashboard_token}`);
console.log('');
console.log('📲 PASOS PARA CONECTAR EL WHATSAPP:');
console.log('   1. Reinicia el agente (npm run dev o pm2 restart)');
console.log(`   2. Aparecerá el QR de "${data.nombre}" en la consola`);
console.log('   3. Desde el WhatsApp DE LA CLÍNICA: Dispositivos vinculados → Vincular dispositivo → escanear');
console.log('   4. Prueba escribiéndole desde otro número: "Hola, quiero una cita"');
console.log('');
console.log('💬 COMANDOS DEL DUEÑO (explícaselos):');
console.log('   /hoy · /semana · /panel · /info · /editar · /ayuda');
console.log('');

process.exit(0);
