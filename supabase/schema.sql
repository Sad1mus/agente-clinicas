-- =====================================================================
-- Esquema multi-tenant: 1 base, N clínicas. Cada clínica = su propio
-- número de WhatsApp (su propia sesión Baileys) y su propia config.
-- Ejecutar en el SQL Editor de Supabase.
-- =====================================================================

create extension if not exists "pgcrypto";

-- Cada fila es una clínica cliente de la agencia ------------------------
create table if not exists clinics (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  vertical        text not null check (vertical in ('veterinaria','dental','estetica')),
  ciudad          text,
  servicios       jsonb not null default '[]',      -- ["Consulta general","Vacunación",...]
  horario         jsonb not null default '{}',      -- ver seed.sql
  tono            text,                              -- nota de estilo opcional
  direccion       text,                              -- dirección física (el bot SOLO da esta, nunca inventa)
  info_extra      jsonb not null default '{}',      -- FAQs: {"medios_pago": "...", "parqueadero": "..."}
  session_id      text not null unique,             -- carpeta de auth Baileys: auth/<session_id>
  telefono_humano text,                             -- a quién avisar al escalar
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Contactos (cada persona que escribe a una clínica) -------------------
create table if not exists contacts (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  jid         text not null,                         -- id de WhatsApp (ej 573001112233@s.whatsapp.net)
  nombre      text,
  created_at  timestamptz not null default now(),
  unique (clinic_id, jid)
);

-- Historial de conversación (memoria del agente) -----------------------
create table if not exists messages (
  id          bigint generated always as identity primary key,
  clinic_id   uuid not null references clinics(id) on delete cascade,
  jid         text not null,
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_messages_conv on messages (clinic_id, jid, created_at);

-- Citas agendadas ------------------------------------------------------
create table if not exists appointments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics(id) on delete cascade,
  jid         text,
  nombre      text,
  telefono    text,
  servicio    text,
  mascota     text,                                  -- solo veterinaria
  fecha       date not null,
  hora        time not null,
  estado      text not null default 'agendada' check (estado in ('agendada','confirmada','cancelada')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_appointments_dia on appointments (clinic_id, fecha, estado);

-- Leads + escalamientos a humano ---------------------------------------
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  jid             text,
  nombre          text,
  telefono        text,
  interes         text,
  notas           text,
  escalado        boolean not null default false,
  motivo_escalado text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_leads_clinic on leads (clinic_id, created_at);
