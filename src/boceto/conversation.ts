import OpenAI from 'openai';
import type { Vertical } from '../types.js';
import type { Mensaje } from './verticals.js';

/**
 * Guion personalizado por IA (opcional, flag --ai). Lee la key directo de
 * process.env para no exigir OPENROUTER_API_KEY en el modo plantilla.
 * Devuelve la lista de mensajes; si algo falla, lanza para que el generador
 * caiga al guion de plantilla.
 */
export async function generarConversacionIA(
  nombre: string,
  vertical: Vertical,
  servicios: string[],
): Promise<Mensaje[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('Falta OPENROUTER_API_KEY para el modo --ai');

  const client = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
  const model = process.env.MODEL ?? 'moonshotai/kimi-k2.6:free';

  const prompt = `Genera una conversación de WhatsApp BREVE y realista para una demo de la clínica "${nombre}" (${vertical}). Servicios: ${servicios.join(', ')}.
Flujo obligatorio: un cliente escribe fuera de horario → el asistente responde al instante, cálido y humano → ofrece DOS horarios concretos → el cliente elige → el asistente pide el nombre → confirma la cita con día, hora y servicio, y menciona un recordatorio.
8 a 10 mensajes alternando cliente/asistente. Mensajes cortos, tono de WhatsApp, máximo un emoji por mensaje. Usa *texto* para negritas en horarios.
Responde SOLO con JSON válido: {"mensajes":[{"from":"cliente"|"asistente","text":"...","hora":"HH:MM"}]}`;

  const resp = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 900,
  });

  const raw = resp.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw) as { mensajes?: Mensaje[] };
  if (!parsed.mensajes?.length) throw new Error('La IA no devolvió mensajes válidos');
  return parsed.mensajes.filter(
    (m) => (m.from === 'cliente' || m.from === 'asistente') && typeof m.text === 'string',
  );
}
