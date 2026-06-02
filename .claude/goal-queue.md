# Goal Queue — Funciones premium (Growth/Scale) del agente de clínicas

estado: completada
current: 5
turn_cap_por_item: 15

<!--
MEGAGOAL: construir las funciones premium de los planes Growth/Scale del agente
de WhatsApp para clínicas, en orden de valor/esfuerzo.

Estados por tarea: [pending] -> [in-progress] -> [done] | [blocked]
Reglas:
- Solo UNA tarea [in-progress] a la vez. No empezar la siguiente hasta [done]/[blocked].
- "Check" debe CORRERSE y su resultado quedar VISIBLE en la conversación
  (el evaluador de /goal no lee este archivo, solo ve el transcript).
- Cada tarea termina con commit + push a master de Sad1mus/agente-clinicas.

Reglas permanentes del proyecto:
- Directorio: /home/sadimus/Documentos/Agencia/resultados/agente-clinicas
- Stack: Node/TS + Baileys + OpenRouter (SOLO modelos :free) + Supabase.
- NUNCA commitear: .env, auth/, output/, tokens, ni teléfonos de leads.
- Migraciones de Supabase: Management API con SUPABASE_ACCESS_TOKEN y
  SUPABASE_PROJECT_REF (están en .env). Después de cada migración, actualizar
  también supabase/schema.sql y supabase/seed.sql para que queden en sincronía.
- GATING POR PLAN: crear/usar un helper planIncluye(clinic, feature) en
  src/plans.ts. Features Growth+: reporte_semanal, roi_dashboard,
  resenas_google, recordatorios_vacunas. Features Scale: llamadas_perdidas.
  Una clínica 'basic' NO debe recibir estas funciones.
- La clínica de prueba "Veterinaria San Martín" (session_id vet-san-martin):
  ponerla en plan 'scale' en la PRIMERA tarea para poder probar todo; dejarla así.
- Anti-alucinación: el bot solo afirma lo que está en la ficha de la clínica.
- npm run typecheck debe salir limpio antes de cada commit.
- El proceso del usuario corre con tsx watch: no hace falta reiniciarlo a mano.
-->

## [done] 1. Gating por plan + reporte semanal al dueño por WhatsApp
**Condición:** Existe `src/plans.ts` con `planIncluye(clinic, feature)` (mapa feature→plan mínimo)
y `src/reports.ts` que: (a) genera el resumen semanal de una clínica (citas agendadas/confirmadas/
canceladas, clientes nuevos, escalamientos, mensajes atendidos, comparativa vs semana anterior),
(b) lo envía por WhatsApp al `telefono_humano` cada lunes 8:00 am (TZ de config) usando el
notifier, (c) SOLO para clínicas con plan growth/scale. La clínica de prueba queda en plan 'scale'
(update en Supabase). `src/index.ts` arranca el scheduler de reportes.
**Check:** `npm run typecheck` exit 0 · script temporal o `tsx -e` que llama a la función
generadora del reporte para la clínica de prueba e IMPRIME el texto del reporte con datos reales ·
query a Supabase que muestra `plan='scale'` · `git log --oneline -1` mostrando el commit pusheado.
**No tocar:** el flujo actual de mensajes (dispatcher/brain) ni los recordatorios anti no-show.
**Evidencia:** typecheck exit 0 · `scripts/test_reporte.ts` imprimió reporte real (1 cita, 3 clientes, 11 mensajes, 1 escalamiento, comparativas 📈) y gating "SÍ ✅" con plan scale · Supabase: plan='scale' · src/plans.ts + src/reports.ts creados, scheduler lunes 8am en index.ts.

## [done] 2. ROI visible en el dashboard
**Condición:** Migración: columna `clinics.valor_cita_promedio` (numeric, COP; seed: 80000 para
la clínica de prueba). El endpoint `/api/<token>` devuelve `kpis.roi_estimado_mes` = (citas
agendadas+confirmadas con created_at en el mes actual) × valor_cita_promedio. El HTML del panel
muestra un banner destacado "💰 Este mes el asistente te generó ~$X COP en citas" (formato de miles
colombiano), SOLO si `planIncluye(clinic,'roi_dashboard')`; para plan basic el banner no aparece.
**Check:** `npm run typecheck` exit 0 · `curl -s localhost:3000/api/<token> | jq .kpis.roi_estimado_mes`
muestra un número > 0 · el mismo curl con la clínica temporalmente en 'basic' NO incluye el campo
(y se restaura a 'scale' después, mostrando ambas salidas) · `git log --oneline -1` pusheado.
**No tocar:** los KPIs existentes del dashboard ni el diseño general (solo agregar el banner).
**Evidencia:** typecheck exit 0 · API con plan scale: roi_estimado_mes=80000 (1 cita × $80.000) · API con plan basic: campo ausente (tiene_roi=false) · restaurado a scale · banner gradiente verde en html.ts · columna valor_cita_promedio migrada y en schema/seed.

## [done] 3. Pedido de reseñas de Google post-cita
**Condición:** Migración: `clinics.google_review_url` (text; seed: un link de ejemplo en la clínica
de prueba) y `appointments.resena_pedida` (timestamptz null). Módulo `src/reviews.ts`: cada hora
revisa citas en estado confirmada/agendada cuya fecha+hora pasó hace entre 2 y 26 horas y
`resena_pedida` es null → envía por WhatsApp al jid de la cita un mensaje cálido pidiendo la reseña
con el link → marca `resena_pedida`. SOLO si `planIncluye(clinic,'resenas_google')` y la clínica
tiene `google_review_url`. Arrancado desde `src/index.ts`.
**Check:** `npm run typecheck` exit 0 · test con cita simulada de ayer (insertada vía Supabase) que
muestra el mensaje generado y la cita marcada (query antes/después visible) · la cita simulada se
borra al final · `git log --oneline -1` pusheado.
**No tocar:** recordatorios anti no-show ni el flujo de agendamiento.
**Evidencia:** typecheck exit 0 · test_resenas.ts ✅ PASA: cita simulada de ayer → mensaje generado con nombre+mascota+link de Google → resena_pedida marcada → cita borrada (0 filas) · fix de TZ: ventana 2-26h calculada con offset de config.tz (patrón de reminders.ts) · scheduler horario en index.ts.

## [done] 4. Recordatorios de vacunas/ciclos (veterinarias)
**Condición:** Migración: tabla `ciclos` (id, clinic_id, jid, mascota, tipo
['vacuna','desparasitacion','control'], descripcion, fecha_proxima date, enviado timestamptz null,
created_at). Nueva tool `programar_refuerzo` en tools.ts: cuando el bot agenda una vacunación/
desparasitación, registra el próximo refuerzo (el prompt instruye al bot a ofrecerlo: "¿quieres que
le recuerde el refuerzo anual?"). Scheduler en `src/cycles.ts`: diario revisa ciclos con
fecha_proxima <= hoy+3 días y enviado null → envía recordatorio por WhatsApp ofreciendo agendar →
marca enviado. SOLO veterinarias con `planIncluye(clinic,'recordatorios_vacunas')`.
**Check:** `npm run typecheck` exit 0 · tabla visible en Supabase (query) · test: insertar ciclo con
fecha_proxima hoy → correr la revisión → mensaje generado impreso y ciclo marcado · TOOLS incluye
programar_refuerzo (grep visible) · `git log --oneline -1` pusheado.
**No tocar:** las 5 tools existentes (consultar_disponibilidad, agendar_cita, actualizar_cita,
guardar_lead, escalar_humano) siguen funcionando igual.
**Evidencia:** typecheck exit 0 · tabla ciclos en Supabase (information_schema) · test_ciclos.ts ✅ PASA: ciclo de vacuna hoy → mensaje con mascota+descripción → enviado marcado → limpiado · tool programar_refuerzo en tools.ts:92/262 + prompts.ts:43 · scheduler 12h en index.ts.

## [done] 5. Rescate de llamadas perdidas (plan Scale)
**Condición:** En `src/whatsapp.ts`, listener del evento 'call' de Baileys: cuando una llamada
entrante a la clínica termina sin respuesta (status terminate/timeout sin accept), el bot envía al
llamante: "Hola, vi que llamaste a [clínica] 📞 No alcanzamos a contestar, pero te leo por aquí:
¿en qué te puedo ayudar?" y registra un lead (interes='LLAMADA PERDIDA'). Anti-spam: máximo 1
mensaje de rescate por contacto cada 6 horas (en memoria). SOLO si
`planIncluye(clinic,'llamadas_perdidas')`.
**Check:** `npm run typecheck` exit 0 · el handler existe y está suscrito (grep "sock.ev.on('call'"
visible) · test unitario del handler con evento mock que imprime el mensaje que se enviaría y
verifica el anti-spam (segunda llamada en <6h no genera mensaje) · `git log --oneline -1` pusheado.
**No tocar:** el listener de messages.upsert existente; las llamadas contestadas no generan mensaje.
**Evidencia:** typecheck exit 0 · listener sock.ev.on('call') en whatsapp.ts:74 (messages.upsert intacto en :84) · test_llamadas.ts ✅ 4/4: timeout→rescate+lead, anti-spam <6h→0, accept→0, plan basic→0 · src/missed-calls.ts con envío inyectable.

<!--
Al terminar TODAS las tareas: actualizar README.md (tabla de planes con las funciones
nuevas marcadas como ✅ construidas) y la memoria del proyecto si aplica. Commit final.
-->
