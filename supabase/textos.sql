-- ============================================================================
-- Textos publicados (post.html lee; admin.html escribe)
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede correr varias veces.
--
-- Modelo de seguridad:
--   * El front usa SOLO la clave anon (pública). Nunca la service_role.
--   * Cualquiera puede LEER los textos publicados (publicado = true).
--   * Solo un administrador (public.es_admin()) ve, crea, edita o borra textos
--     y archivos del bucket "textos".
--   * La tabla public.admins no tiene políticas: nadie la lee ni la escribe por la API.
--     Los administradores se dan de alta a mano (ver el bloque final).
-- ============================================================================

-- Administradores ------------------------------------------------------------
create table if not exists public.admins (
  -- UID del usuario en Authentication → Users
  id uuid primary key references auth.users (id) on delete cascade
);

-- RLS activado y sin políticas: la API nunca puede leer ni escribir admins.
alter table public.admins enable row level security;

-- Función que indica si la sesión actual es de un administrador.
-- security definer: consulta admins aunque el usuario no tenga acceso directo.
-- search_path vacío: evita que alguien secuestre nombres de funciones o tablas.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where id = auth.uid());
$$;

revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to anon, authenticated;

-- Tabla de textos ------------------------------------------------------------
create table if not exists public.textos (
  id         bigint generated always as identity primary key,
  -- dirección del texto: post.html?p=<slug>; también es la carpeta en Storage
  slug       text        not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  titulo     text        not null check (char_length(titulo) between 1 and 200),
  autor      text        not null check (char_length(autor) between 1 and 120),
  fecha      date        not null default current_date,
  resumen    text        not null default '' check (char_length(resumen) <= 600),
  -- fragmento HTML sanitizado (solo <header>, <section>, etc.)
  html       text        not null check (char_length(html) between 1 and 600000),
  -- PDF original y miniatura (página 1) en el bucket "textos"
  pdf_url    text,
  thumb_url  text,
  -- carpeta pública del texto, con barra final: resuelve las <img src="archivo.png">
  base_url   text,
  publicado  boolean     not null default true,
  creado     timestamptz default now()
);

create index if not exists textos_fecha_idx on public.textos (fecha desc, creado desc);

-- Row Level Security ---------------------------------------------------------
alter table public.textos enable row level security;

-- Lectura pública de los textos publicados (anon y usuarios logueados sin admin).
drop policy if exists "textos: publicados leen" on public.textos;
create policy "textos: publicados leen"
  on public.textos
  for select
  to anon, authenticated
  using (publicado = true);

-- El administrador hace todo, incluidos los textos ocultos.
drop policy if exists "textos: admin todo" on public.textos;
create policy "textos: admin todo"
  on public.textos
  for all
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- Permisos explícitos (RLS filtra filas; GRANT permite el acceso a la tabla) -
grant usage on schema public to anon, authenticated;
grant select on table public.textos to anon;
grant select, insert, update, delete on table public.textos to authenticated;
-- Necesario para que el INSERT pueda tomar el siguiente id (columna identity)
grant usage, select on sequence public.textos_id_seq to authenticated;

-- Bucket de Storage ---------------------------------------------------------
-- Público para lectura por URL. Límite 50 MB por archivo; solo PDF e imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'textos',
  'textos',
  true,
  52428800,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Políticas de storage.objects para el bucket "textos" ------------------------
-- Las URL públicas funcionan sin política; listar el bucket es solo del admin.
drop policy if exists "textos storage: lectura publica" on storage.objects;
drop policy if exists "textos storage: admin lee" on storage.objects;
create policy "textos storage: admin lee"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'textos' and public.es_admin());

-- Subir, reemplazar y borrar solo con sesión de administrador.
drop policy if exists "textos storage: admin inserta" on storage.objects;
create policy "textos storage: admin inserta"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'textos' and public.es_admin());

drop policy if exists "textos storage: admin actualiza" on storage.objects;
create policy "textos storage: admin actualiza"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'textos' and public.es_admin())
  with check (bucket_id = 'textos' and public.es_admin());

drop policy if exists "textos storage: admin borra" on storage.objects;
create policy "textos storage: admin borra"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'textos' and public.es_admin());

-- ============================================================================
-- AUTORIZAR AL ADMINISTRADOR (hacerlo una sola vez, después de ejecutar lo de arriba)
--
-- 1. Supabase → Authentication → Users → "Add user" → "Create new user".
--    Escribe correo y contraseña, marca "Auto Confirm User" y crea el usuario.
-- 2. Supabase → Authentication → Sign In / Providers (o Settings) y
--    DESACTIVA "Allow new users to sign up", para que nadie más pueda registrarse.
-- 3. En la lista de usuarios, copia el UID de ese usuario y ejecuta en el SQL Editor:
--
--    insert into public.admins(id) values ('<UID del usuario>');
--
-- Para revocar el acceso, borra su fila de public.admins o el usuario en Authentication.
-- ============================================================================
