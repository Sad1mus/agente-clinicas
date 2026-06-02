# Agente de WhatsApp para clínicas

Agente **multi-tenant** que atiende WhatsApp 24/7 para clínicas (vet / dental / estética):
responde al instante, consulta disponibilidad, **agenda citas** y captura leads — sin humano.

**Stack:** Node + TypeScript · [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp) ·
[OpenRouter](https://openrouter.ai) (modelos baratos y capaces, tool-use, con fallback) ·
Supabase (CRM + memoria).

> ⚠️ Baileys es **no oficial** (conecta un WhatsApp normal por código). Perfecto para
> demo/MVP, pero Meta puede banear el número. Antes de vender a clientes reales, migra el
> archivo `src/whatsapp.ts` al **WhatsApp Cloud API** (oficial). El resto del código (cerebro,
> herramientas, DB) no cambia.

## Arquitectura

```
WhatsApp ──Baileys──▶ src/whatsapp.ts ──▶ src/brain.ts ──▶ Claude (tool-use)
   (1 socket por clínica)                       │              │
                                                │              ├─ consultar_disponibilidad
   Supabase ◀── src/db.ts ◀────────────────────┘              ├─ agendar_cita
   (clinics, contacts, messages,                               ├─ guardar_lead
    appointments, leads)                                       └─ escalar_humano
```

**Multi-tenant:** una sola base, tabla `clinics`. Cada clínica trae su `session_id` (carpeta
de auth de WhatsApp), vertical, servicios, horario y tono. El agente carga la config de la
clínica según el socket que recibe el mensaje. Para sumar la clínica #2, #10… solo insertas
una fila en `clinics` — el código no cambia.

**Prompt caching de dos niveles** (`src/prompts.ts`): instrucciones base (compartidas entre
todas las clínicas) + ficha de la clínica, ambas con `cache_control`. La fecha/hora va al final
sin cachear para no invalidar el prefijo.

## Puesta en marcha

1. **Dependencias**
   ```bash
   npm install
   ```

2. **Supabase**
   - Crea un proyecto en supabase.com.
   - SQL Editor → pega y corre `supabase/schema.sql`, luego `supabase/seed.sql`
     (edita la clínica veterinaria con datos reales antes).
   - Copia la **URL** del proyecto y la **service_role key** (Settings → API).

3. **Variables de entorno**
   ```bash
   cp .env.example .env
   # rellena OPENROUTER_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
   ```

4. **Arrancar**
   ```bash
   npm run dev
   ```
   La primera vez aparece un **QR** en la terminal por cada clínica. Ábrelo desde el WhatsApp
   de esa clínica → **Dispositivos vinculados → Vincular un dispositivo**. La sesión queda
   guardada en `auth/<session_id>/` (no se vuelve a pedir).

5. **Probar:** escribe al número vinculado desde otro teléfono. Pide una cita y observa cómo
   consulta horarios y agenda (revisa la tabla `appointments` en Supabase).

## Cómo añadir una clínica nueva

Inserta una fila en `clinics` con un `session_id` único (ej. `dental-sonrisas`). Al reiniciar,
el agente levanta un socket nuevo y muestra su QR. Ese es todo el onboarding técnico.

## Próximos pasos sugeridos

- **Recordatorios anti no-show:** cron (Supabase `pg_cron` o Make) que 24h/2h antes envía y
  pide confirmar la cita.
- **Boceto generator:** la pieza que cierra ventas (chat-demo con el logo de la clínica).
- **Migrar a WhatsApp Cloud API** para producción (reemplaza solo `src/whatsapp.ts`).
- **Notificar el escalamiento** al `telefono_humano` de la clínica (hoy queda marcado en `leads`).

## Boceto generator (herramienta de ventas)

Genera un **mockup de chat de WhatsApp** personalizado por clínica (nombre, color, servicios)
mostrando al asistente agendando una cita — la pieza que, según las campañas, destraba el "sí".
Salida: **PNG enviable por WhatsApp** + HTML. Vive en `src/boceto/`, es independiente del agente.

```bash
# Un boceto
npm run boceto -- --nombre "Veterinaria San Martín" --vertical veterinaria \
  --ciudad "Bogotá" --servicios "Consulta general;Vacunación" --color "#0a7d4b"

# Lote desde CSV (columnas: nombre,vertical,ciudad,servicios,color)
npm run boceto -- --csv leads.csv

# Guion personalizado por IA (requiere OPENROUTER_API_KEY)
npm run boceto -- --nombre "..." --vertical dental --ai

npm run boceto -- --help
```

Verticales: `veterinaria` | `dental` | `estetica`, cada uno con su guion (respuesta instantánea
fuera de horario → ofrece 2 horarios → agenda → confirma). Los archivos salen en `output/`.
El render usa Puppeteer (Chromium headless); si no está disponible, igual genera el HTML.

## Mejoras críticas incluidas

- **Debounce (agrupar ráfagas):** espera 4s y junta los mensajes seguidos del cliente para
  responder una sola vez (`src/dispatcher.ts`).
- **Cola por contacto:** nunca corren dos cerebros a la vez para el mismo número (sin carreras
  de historial).
- **Filtra horarios pasados:** si piden cita "para hoy", no ofrece horas que ya pasaron
  (zona horaria de `TZ`).
- **Escalamiento real:** `escalar_humano` ahora avisa por WhatsApp al `telefono_humano` de la
  clínica, además de marcarlo en `leads`.

## Notas de modelo (OpenRouter)

Por defecto usa **modelos GRATIS** (sufijo `:free`): **`moonshotai/kimi-k2.6:free`** con fallback
a **`openai/gpt-oss-120b:free`** (`MODEL` y `MODEL_FALLBACK` en `.env`) — $0 por token y con buen
tool-calling. Cámbialos sin tocar código; otras opciones free con tools:
`z-ai/glm-4.5-air:free`, `qwen/qwen3-next-80b-a3b-instruct:free`,
`meta-llama/llama-3.3-70b-instruct:free`.

**Límites del tier free:** ~20 requests/minuto y, con **≥$10 de crédito comprado** en la cuenta,
**1000 requests/día** (sin crédito comprado serían solo 50/día). El crédito NO se gasta usando
modelos `:free` — solo desbloquea el límite alto. Para producción con clientes reales, considera
volver a un modelo pago (ej. `google/gemini-2.0-flash-001`) por estabilidad y sin límites diarios.
