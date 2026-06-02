import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { generarBoceto, type LeadInput } from '../boceto/generator.js';
import type { Vertical } from '../types.js';

const HELP = `
Generador de bocetos (demo de chat de WhatsApp por clínica).

Uso (un boceto):
  npm run boceto -- --nombre "Veterinaria San Martín" --vertical veterinaria \\
    --ciudad "Bogotá" --servicios "Consulta general;Vacunación" --color "#0a7d4b"

Uso (lote desde CSV):
  npm run boceto -- --csv leads.csv

Flags:
  --nombre      Nombre de la clínica (obligatorio en modo individual)
  --vertical    veterinaria | dental | estetica (obligatorio)
  --ciudad      Ciudad (opcional)
  --servicios   Lista separada por ; (opcional; usa defaults del vertical)
  --color       Color de marca hex, ej #0a7d4b (opcional)
  --ai          Personaliza el guion con IA (requiere OPENROUTER_API_KEY)
  --csv         Ruta a CSV con columnas: nombre,vertical,ciudad,servicios,color
  --out         Carpeta de salida (default ./output)
  --help        Muestra esta ayuda

CSV: la columna "servicios" separa con ; (ej "Limpieza;Implantes").
`;

const VALID: Vertical[] = ['veterinaria', 'dental', 'estetica'];

function parseCsv(text: string): LeadInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return {
      nombre: row.nombre,
      vertical: row.vertical as Vertical,
      ciudad: row.ciudad || undefined,
      servicios: row.servicios ? row.servicios.split(';').map((s) => s.trim()).filter(Boolean) : undefined,
      color: row.color || undefined,
    };
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      nombre: { type: 'string' },
      vertical: { type: 'string' },
      ciudad: { type: 'string' },
      servicios: { type: 'string' },
      color: { type: 'string' },
      ai: { type: 'boolean', default: false },
      csv: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const opts = { ai: values.ai, outDir: values.out };
  let leads: LeadInput[] = [];

  if (values.csv) {
    leads = parseCsv(await readFile(values.csv, 'utf8'));
    if (leads.length === 0) {
      console.error('El CSV no tiene filas válidas.');
      process.exit(1);
    }
  } else {
    if (!values.nombre || !values.vertical) {
      console.error('Faltan --nombre y/o --vertical.\n' + HELP);
      process.exit(1);
    }
    leads = [
      {
        nombre: values.nombre,
        vertical: values.vertical as Vertical,
        ciudad: values.ciudad,
        servicios: values.servicios ? values.servicios.split(';').map((s) => s.trim()).filter(Boolean) : undefined,
        color: values.color,
      },
    ];
  }

  for (const lead of leads) {
    if (!VALID.includes(lead.vertical)) {
      console.error(`✗ "${lead.nombre}": vertical inválido "${lead.vertical}" (usa ${VALID.join(' | ')})`);
      continue;
    }
    const r = await generarBoceto(lead, opts);
    console.log(`✓ ${r.nombre}`);
    console.log(`   HTML: ${r.htmlPath}`);
    if (r.pngPath) console.log(`   PNG:  ${r.pngPath}  ← enviable por WhatsApp`);
    if (r.aviso) console.log(`   ⚠️  ${r.aviso}`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
