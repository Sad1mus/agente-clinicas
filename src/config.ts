import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Revisa tu .env`);
  return v;
}

export const config = {
  openrouterApiKey: required('OPENROUTER_API_KEY'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_KEY'),
  // Modelos GRATIS de OpenRouter por defecto (:free). Cámbialos en el .env sin tocar código.
  model: process.env.MODEL ?? 'moonshotai/kimi-k2.6:free',
  modelFallback: process.env.MODEL_FALLBACK ?? 'openai/gpt-oss-120b:free',
  appUrl: process.env.APP_URL ?? 'https://localhost',
  appName: process.env.APP_NAME ?? 'Agente Clinicas',
  tz: process.env.TZ ?? 'America/Bogota',
  // Puerto del dashboard web (panel de clientas). Incluido en TODOS los planes.
  dashboardPort: Number(process.env.DASHBOARD_PORT ?? 3000),
  // URL pública del dashboard (túnel o VPS). Se usa en los links que se envían por WhatsApp.
  dashboardUrl: process.env.DASHBOARD_URL ?? `http://localhost:${process.env.DASHBOARD_PORT ?? 3000}`,
};
