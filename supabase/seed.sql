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

-- dias: 1=lunes ... 7=domingo. almuerzo: rango bloqueado [desde, hasta].
