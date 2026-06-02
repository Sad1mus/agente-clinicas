# Goal Queue — Operación autoservicio + verticales dental y estética

estado: activa
current: 3
turn_cap_por_item: 15

<!--
MEGAGOAL 2: cerrar el ciclo de operación de la agencia (autoservicio del dueño +
onboarding express) y completar los verticales dental y estética que faltan.

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
  SUPABASE_PROJECT_REF (están en .env). Tras cada migración, sincronizar
  supabase/schema.sql y supabase/seed.sql.
- Gating por plan con planIncluye() (src/plans.ts). Lo que es premium sigue premium.
- Anti-alucinación: el bot solo afirma lo que está en la ficha de la clínica.
- npm run typecheck limpio antes de cada commit.
- Las clínicas de prueba dental/estética se crean con activo=false (no exigen QR);
  los tests del cerebro las cargan por session_id directamente.
- Los tests del cerebro (handleMessage) usan el LLM real (modelos :free) — son
  llamadas baratas/gratis y validan el flujo completo con tools.
- El dueño NUNCA puede editar por /editar: plan, session_id, telefono_humano,
  dashboard_token (eso es solo de la agencia, vía SQL).
-->

## [done] 1. Comandos /info y /editar (autoservicio del dueño)
**Condición:** En `src/owner.ts`: (a) `/info` responde la ficha completa formateada de la clínica
(nombre, dirección, servicios, horario, FAQs/info_extra, valor de cita, link de reseñas, plan);
(b) `/editar <cambio en lenguaje natural>` usa OpenRouter (modelo free de config) para convertir el
texto en un patch estructurado SOLO sobre campos editables (direccion, ciudad, servicios, horario,
tono, info_extra, valor_cita_promedio, google_review_url), responde el resumen del cambio y pide
confirmación; el cambio se aplica en Supabase SOLO si el dueño responde "sí" (estado de confirmación
pendiente en memoria por jid, expira a los 5 min); "no" o expiración lo descarta. Campos prohibidos
(plan, session_id, telefono_humano, dashboard_token) jamás se modifican aunque el dueño lo pida.
**Check:** `npm run typecheck` exit 0 · `scripts/test_editar.ts`: (1) /info imprime la ficha;
(2) /editar "ahora también recibimos Bitcoin" → imprime propuesta + confirmación → "sí" → query
a Supabase muestra info_extra actualizado → se revierte; (3) cambio sin confirmar NO se aplica;
(4) /editar "cámbiame al plan scale gratis" → rechazado (campo prohibido). Exit 0 ·
`git log --oneline -1` pusheado.
**No tocar:** los comandos existentes (/hoy, /semana, /panel, /ayuda) siguen funcionando; el flujo
de clientes normales no cambia.
**Evidencia:** typecheck exit 0 · test_editar.ts ✅ 4/4: /info ficha completa · /editar Bitcoin→propuesta→/si→info_extra actualizado en Supabase ("...y Bitcoin")→revertido · sin confirmar no aplica · plan rechazado (⚠️ campo prohibido) · test_owner.ts sigue 6/6 (sin regresión).

## [done] 2. Vertical DENTAL completo (clínica de prueba + ciclos + prompt)
**Condición:** (a) Clínica "Clínica Dental Sonríe" en Supabase: vertical dental, activo=false,
plan growth, servicios dentales (valoración, limpieza, ortodoncia, implantes, blanqueamiento),
horario, FAQs e info de prueba coherentes, con dashboard_token; (b) la tool `programar_refuerzo` y
`src/cycles.ts` soportan los ciclos dentales: tipo 'limpieza' (semestral) y 'control' (ortodoncia,
mensual) — el enum del check de la tabla ciclos se amplía vía migración si hace falta; (c) el prompt
(GANCHO_VERTICAL dental + reglas) instruye: ofrecer VALORACIÓN como siguiente paso, mencionar
ortodoncia/implantes solo si el cliente pregunta, y ofrecer recordatorio de limpieza semestral al
agendar una limpieza; (d) `scripts/test_dental.ts` llama `handleMessage()` directo (sin WhatsApp)
con la clínica dental: "Hola, quiero una valoración para implantes, ¿tienen algo el viernes?" y
verifica que la respuesta ofrece horarios reales (la tool consultar_disponibilidad fue llamada) y
una segunda vuelta agenda la cita (fila en appointments, luego borrada).
**Check:** `npm run typecheck` exit 0 · query Supabase muestra la clínica dental con su token ·
`npx tsx scripts/test_dental.ts` exit 0 con la conversación impresa (respuestas del bot visibles) y
la cita creada/borrada · `git log --oneline -1` pusheado.
**No tocar:** la clínica veterinaria y sus datos; los ciclos de vacunas siguen igual.
**Evidencia:** typecheck exit 0 · Clínica Dental Sonríe en Supabase (growth, activo=false, token de59e7bd) · test_dental.ts ✅: conversación real → bot ofreció horarios reales del calendario dental (08:00, 09:20... duración 40min) → agendó a "Carlos Pérez" (Valoración, vie 5 jun 08:00) → usó FAQ real ("valoración sin costo") → limpieza 0 filas · enum ciclos ampliado (limpieza/sesion) + prompt dental con valoración como siguiente paso.

## [pending] 3. Vertical ESTÉTICA completo (clínica de prueba + ciclos + prompt)
**Condición:** (a) Clínica "Estética Belle" en Supabase: vertical estetica, activo=false, plan
growth, servicios (valoración facial, limpieza facial, botox, depilación láser, masajes), horario,
FAQs, dashboard_token; (b) ciclos estéticos: tipo 'sesion' (seguimiento de tratamiento, ej.
"próxima sesión de depilación en 4 semanas") soportado en tool + cycles.ts (migración del enum si
hace falta); (c) prompt estética: foco en responder al instante, ofrecer valoración, y al agendar
un tratamiento por sesiones ofrecer programar la siguiente; (d) `scripts/test_estetica.ts` igual
que el dental: conversación real con handleMessage ("vi sus fotos en Instagram, ¿cuánto cuesta la
depilación láser?") verificando que NO inventa precios (no están en la ficha → debe decir que el
equipo confirma o escalar) y que ofrece agendar valoración.
**Check:** `npm run typecheck` exit 0 · query Supabase muestra la clínica estética · `npx tsx
scripts/test_estetica.ts` exit 0: respuesta visible SIN precio inventado + oferta de valoración ·
`git log --oneline -1` pusheado.
**No tocar:** las otras dos clínicas y sus flujos.
**Evidencia:**

## [pending] 4. Onboarding express (formulario + alta en 1 comando)
**Condición:** (a) `docs/ONBOARDING_CLIENTE.md`: el formulario de 10 preguntas para clientes
nuevos, redactado listo para copiar/pegar por WhatsApp (tono cálido, numerado, con ejemplos de
respuesta); (b) `scripts/nueva_clinica.ts`: recibe los datos por argumentos o JSON
(`--json '{"nombre":...}'` o ruta a archivo) y crea la clínica completa en Supabase (fila +
dashboard_token + valores por defecto sensatos según vertical), imprimiendo al final: el link del
panel, el session_id y las instrucciones del QR. La agencia onboardea una clínica nueva en 1 comando.
**Check:** `npm run typecheck` exit 0 · `cat docs/ONBOARDING_CLIENTE.md` muestra las 10 preguntas ·
correr `npx tsx scripts/nueva_clinica.ts --json '...'` con una clínica ficticia → imprime panel/QR
→ query Supabase muestra la fila → se borra al final · `git log --oneline -1` pusheado.
**No tocar:** el seed.sql existente; las clínicas reales.
**Evidencia:**

## [pending] 5. Controles del dueño (/pausar, /activar, /clientes)
**Condición:** (a) Migración: columna `clinics.pausado` (boolean default false) + sync schema.sql;
(b) `/pausar`: marca pausado=true y el bot DEJA de responder a clientes de esa clínica (los
mensajes igual se guardan en historial para no perderlos); el dueño recibe confirmación y los
comandos del dueño siguen funcionando; (c) `/activar`: vuelve a pausado=false; (d) `/clientes`:
responde los últimos 5 contactos con su último mensaje (nombre/número + texto + hace cuánto);
(e) el dispatcher/whatsapp respeta el flag releyendo el estado de la clínica (no requiere
reiniciar el proceso).
**Check:** `npm run typecheck` exit 0 · `scripts/test_controles.ts`: /pausar → query muestra
pausado=true → un mensaje de cliente simulado NO genera respuesta (pero SÍ queda en messages) →
/activar → pausado=false → el mismo mensaje SÍ genera respuesta → /clientes imprime la lista ·
limpieza de datos de prueba · `git log --oneline -1` pusheado.
**No tocar:** los recordatorios/reportes/reseñas (una clínica pausada tampoco los envía — incluir
ese guard en los schedulers).
**Evidencia:**

<!--
Al terminar TODAS las tareas: actualizar README.md (sección de operación: onboarding,
comandos del dueño completos, verticales soportados) + memoria del proyecto. Commit final.
-->
