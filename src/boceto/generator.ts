import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Vertical } from '../types.js';
import { VERTICALS } from './verticals.js';
import { buildHtml } from './template.js';
import { htmlToPng } from './render.js';
import { generarConversacionIA } from './conversation.js';

export interface LeadInput {
  nombre: string;
  vertical: Vertical;
  ciudad?: string;
  servicios?: string[];
  color?: string;
}

export interface GenerarOpts {
  ai?: boolean;       // usar IA para el guion
  outDir?: string;    // carpeta de salida (default ./output)
}

export interface BocetoResult {
  nombre: string;
  htmlPath: string;
  pngPath?: string;   // ausente si el render falló
  aviso?: string;
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'clinica';
}

export async function generarBoceto(lead: LeadInput, opts: GenerarOpts = {}): Promise<BocetoResult> {
  const v = VERTICALS[lead.vertical];
  if (!v) throw new Error(`Vertical desconocido: ${lead.vertical} (usa veterinaria | dental | estetica)`);

  const servicios = lead.servicios?.length ? lead.servicios : v.defaultServicios;
  const color = lead.color ?? v.defaultColor;

  let mensajes = v.conversacion(servicios[0]);
  if (opts.ai) {
    try {
      mensajes = await generarConversacionIA(lead.nombre, lead.vertical, servicios);
    } catch (err) {
      console.warn(`[boceto] IA falló (${(err as Error).message}); uso el guion de plantilla.`);
    }
  }

  const html = buildHtml({
    nombre: lead.nombre,
    ciudad: lead.ciudad,
    color,
    subtitulo: v.subtitulo,
    mensajes,
  });

  const outDir = opts.outDir ?? 'output';
  await mkdir(outDir, { recursive: true });
  const slug = slugify(lead.nombre);
  const htmlPath = join(outDir, `boceto-${slug}.html`);
  await writeFile(htmlPath, html, 'utf8');

  const result: BocetoResult = { nombre: lead.nombre, htmlPath };

  try {
    const png = await htmlToPng(html);
    const pngPath = join(outDir, `boceto-${slug}.png`);
    await writeFile(pngPath, png);
    result.pngPath = pngPath;
  } catch (err) {
    result.aviso = `No se pudo renderizar el PNG (${(err as Error).message}). El HTML sí se generó; ábrelo en un navegador o instala Chromium para Puppeteer.`;
    console.warn(`[boceto] ${result.aviso}`);
  }

  return result;
}
