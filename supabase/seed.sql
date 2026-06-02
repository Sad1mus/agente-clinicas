-- =====================================================================
-- Clínica veterinaria de arranque (tu vertical ganador en las campañas).
-- Ejecutar DESPUÉS de schema.sql. Edita los valores con datos reales.
-- =====================================================================

insert into clinics (nombre, vertical, ciudad, direccion, servicios, horario, tono, info_extra, session_id, telefono_humano)
values (
  'Veterinaria San Martín',
  'veterinaria',
  'Bogotá',
  'Calle 123 #45-67, Chapinero, Bogotá',
  '["Consulta general","Vacunación","Baño y peluquería","Cirugía","Urgencias","Desparasitación"]',
  '{
    "dias": [1,2,3,4,5,6],
    "inicio": "08:00",
    "fin": "18:00",
    "duracion_min": 30,
    "almuerzo": ["12:30","14:00"]
  }',
  'Cálido, cercano y resolutivo. Trata a las mascotas por su nombre cuando se mencione.',
  '{
    "medios_pago": "Efectivo, tarjeta débito/crédito y transferencia (Nequi o Daviplata)",
    "parqueadero": "Sí, gratis para clientes",
    "recordatorios": "Confirmamos la cita por este mismo chat un día antes"
  }',
  'vet-san-martin',
  '573226272302'
);

-- Genera el token del panel de clientas (dashboard) para las clínicas que no lo tengan.
update clinics set dashboard_token = encode(gen_random_bytes(16), 'hex') where dashboard_token is null;

-- Valor promedio de cita (COP) para el cálculo de ROI del dashboard (planes Growth/Scale).
update clinics set valor_cita_promedio = 80000 where session_id = 'vet-san-martin';

-- Link de Google Reviews para el pedido de reseñas post-cita (planes Growth/Scale).
update clinics set google_review_url = 'https://g.page/r/veterinaria-san-martin-demo/review' where session_id = 'vet-san-martin';

-- =====================================================================
-- Clínica DENTAL de prueba (activo=false: no exige QR; se prueba con
-- scripts/test_dental.ts que llama al cerebro directamente).
-- =====================================================================
insert into clinics (nombre, vertical, ciudad, direccion, servicios, horario, tono, info_extra, session_id, telefono_humano, plan, valor_cita_promedio, google_review_url, activo, dashboard_token)
values (
  'Clínica Dental Sonríe',
  'dental',
  'Bogotá',
  'Carrera 15 #82-30, Zona Rosa, Bogotá',
  '["Valoración","Limpieza dental","Ortodoncia","Implantes","Blanqueamiento","Endodoncia"]',
  '{"dias":[1,2,3,4,5,6],"inicio":"08:00","fin":"19:00","duracion_min":40,"almuerzo":["13:00","14:00"]}',
  'Profesional y cercano. Transmite confianza: ir al odontólogo no tiene que dar miedo.',
  '{"medios_pago":"Efectivo, tarjetas y transferencia. Planes de financiación para ortodoncia e implantes","parqueadero":"Convenio con parqueadero de la esquina (2 horas gratis)","primera_valoracion":"La valoración inicial no tiene costo"}',
  'dental-sonrie',
  '573226272302',
  'growth',
  150000,
  'https://g.page/r/clinica-dental-sonrie-demo/review',
  false,
  encode(gen_random_bytes(16), 'hex')
)
on conflict (session_id) do nothing;

-- dias: 1=lunes ... 7=domingo. almuerzo: rango bloqueado [desde, hasta].
