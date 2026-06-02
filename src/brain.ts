import OpenAI from 'openai';
import { config } from './config.js';
import type { Clinic } from './types.js';
import { buildSystem } from './prompts.js';
import { TOOLS, runTool } from './tools.js';
import { getRecentHistory, saveMessage, upsertContact } from './db.js';

// OpenRouter expone una API compatible con OpenAI.
const client = new OpenAI({
  apiKey: config.openrouterApiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': config.appUrl,
    'X-Title': config.appName,
  },
});

const MAX_ITERS = 6; // tope de vueltas del loop de herramientas por mensaje

function ahoraTexto(): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: config.tz,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());
}

/**
 * Procesa un mensaje (o ráfaga ya combinada) y devuelve la respuesta a enviar.
 * Carga historial desde Supabase, corre el loop de tool-use y persiste todo.
 */
export async function handleMessage(
  clinic: Clinic,
  jid: string,
  userText: string,
): Promise<string> {
  await upsertContact(clinic.id, jid);

  const history = await getRecentHistory(clinic.id, jid);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystem(clinic, ahoraTexto()) },
    ...history.map(
      (m) =>
        ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam,
    ),
    { role: 'user', content: userText },
  ];

  let finalText = '';
  for (let i = 0; i < MAX_ITERS; i++) {
    // `models` activa el routing con respaldo de OpenRouter (no es campo OpenAI estándar).
    const body = {
      model: config.model,
      models: [config.model, config.modelFallback],
      messages,
      tools: TOOLS,
      tool_choice: 'auto' as const,
      max_tokens: 1024,
    };
    const resp = (await client.chat.completions.create(
      body as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
    )) as OpenAI.Chat.Completions.ChatCompletion;

    const msg = resp.choices[0]?.message;
    if (!msg) break;

    // ¿Pidió herramientas? Ejecútalas y continúa el loop.
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch {
          /* argumentos inválidos → objeto vacío */
        }
        const result = await runTool(tc.function.name, args, { clinic, jid });
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
      continue;
    }

    finalText = (msg.content ?? '').trim();
    break;
  }

  if (!finalText) {
    finalText = 'Disculpa, tuve un problema procesando tu mensaje. ¿Me lo repites?';
  }

  await saveMessage(clinic.id, jid, 'user', userText);
  await saveMessage(clinic.id, jid, 'assistant', finalText);

  return finalText;
}
