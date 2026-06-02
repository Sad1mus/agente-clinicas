# 📋 Formulario de Onboarding — Asistente de WhatsApp

> **Uso interno de la agencia:** copia el bloque de abajo y pégalo en el WhatsApp del cliente
> apenas diga que sí. Con sus respuestas, corre `scripts/nueva_clinica.ts` y el agente queda
> listo en menos de 10 minutos. Solo falta escanear el QR con el WhatsApp de la clínica.

---

## El mensaje para copiar y pegar al cliente

¡Excelente decisión! 🎉 Para dejar tu asistente listo esta misma semana, solo necesito que me respondas estas 10 preguntas (puedes responder por audio o texto, como prefieras):

**1.** ¿Cuál es el nombre exacto de tu clínica? (como quieres que el asistente se presente)
　　_Ejemplo: "Veterinaria San Martín"_

**2.** ¿Cuál es la dirección completa?
　　_Ejemplo: "Calle 123 #45-67, Chapinero, Bogotá"_

**3.** ¿Qué servicios ofrecen? (lista, los más importantes primero)
　　_Ejemplo: "Consulta general, vacunación, baño y peluquería, cirugía"_

**4.** ¿Cuál es el horario de atención? (días, hora de apertura y cierre, hora de almuerzo si cierran)
　　_Ejemplo: "Lunes a sábado de 8am a 6pm, cerramos de 12:30 a 2 para almorzar"_

**5.** ¿Cuánto dura en promedio una cita?
　　_Ejemplo: "30 minutos"_

**6.** ¿Qué medios de pago reciben?
　　_Ejemplo: "Efectivo, tarjetas, Nequi y Daviplata"_

**7.** ¿Tienen parqueadero, domicilios, o algo más que los clientes pregunten seguido?
　　_Ejemplo: "Parqueadero gratis, no hacemos domicilios"_

**8.** ¿Cuánto vale en promedio una cita/servicio? (para mostrarte cuánta plata te genera el asistente cada mes)
　　_Ejemplo: "$80.000"_

**9.** ¿A qué número de WhatsApp te avisamos las urgencias y los casos que necesiten una persona?
　　_Ejemplo: "300 123 4567 (mi número personal)"_

**10.** ¿Tienes el link de tu negocio en Google Maps? (para que el asistente pida reseñas a tus clientes contentos)
　　_Ejemplo: "https://g.page/r/...... — si no lo tienes, te ayudamos a sacarlo"_

¡Eso es todo! Con esto tu asistente queda configurado. Te aviso apenas esté listo para conectarlo a tu WhatsApp (son 2 minutos, yo te guío). 🚀

---

## Después de recibir las respuestas (proceso interno)

1. Arma el JSON con las respuestas y corre:
   ```bash
   npx tsx scripts/nueva_clinica.ts --json '{
     "nombre": "Veterinaria San Martín",
     "vertical": "veterinaria",
     "ciudad": "Bogotá",
     "direccion": "Calle 123 #45-67, Chapinero",
     "servicios": ["Consulta general", "Vacunación", "Baño y peluquería"],
     "horario": {"dias": [1,2,3,4,5,6], "inicio": "08:00", "fin": "18:00", "duracion_min": 30, "almuerzo": ["12:30", "14:00"]},
     "medios_pago": "Efectivo, tarjetas, Nequi y Daviplata",
     "info_extra": {"parqueadero": "Gratis para clientes"},
     "valor_cita_promedio": 80000,
     "telefono_humano": "573001234567",
     "google_review_url": "https://g.page/r/...",
     "plan": "basic"
   }'
   ```
2. El script imprime el **link del panel** y el **session_id**.
3. En el servidor: reiniciar el agente → aparece el QR de la clínica nueva → escanearlo
   con el WhatsApp de la clínica (Dispositivos vinculados → Vincular dispositivo).
4. Enviar al cliente: el link de su panel + las instrucciones de los comandos del dueño
   (/hoy, /info, /editar).
5. Hacer una prueba real: escribirle al número de la clínica pidiendo una cita.

**Tiempo total: ~10 minutos.** La promesa de venta es "listo en 5 días" — entregar antes siempre sorprende. ✨
