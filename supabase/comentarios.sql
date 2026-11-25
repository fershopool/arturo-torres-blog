-- ============================================================================
-- Comentarios públicos de los textos (post.html)
-- Ejecutar en el SQL Editor de Supabase. Es idempotente: se puede correr varias veces.
--
-- Modelo de seguridad:
--   * El front usa SOLO la clave anon (pública). Nunca la service_role.
--   * RLS activado: anon puede leer y crear comentarios, pero NO editarlos ni borrarlos.
--   * Las validaciones de longitud y rango también viven en la base (CHECK),
--     así un cliente malicioso no puede saltarse el front.
--   * Limitación: no hay límite de frecuencia en el servidor; el throttle de 20 s
--     es solo del navegador. Si hay spam, añadir una regla en Supabase (Edge Function
--     o trigger) o moderar filas desde el panel.
-- ============================================================================

-- Tabla ----------------------------------------------------------------------
create table if not exists public.comentarios (
  id        bigint generated always as identity primary key,
  -- identificador del texto (coincide con ?p= en post.html)
  slug      text        not null check (char_length(slug) between 1 and 80),
  -- nombre público elegido por la persona que comenta
  seudonimo text        not null check (char_length(seudonimo) between 1 and 40),
  -- calificación de 1 a 5 estrellas
  estrellas smallint    not null check (estrellas between 1 and 5),
  -- texto del comentario
  comentario text       not null check (char_length(comentario) between 1 and 1000),
  creado    timestamptz not null default now()
);

-- Índice para listar por texto, del más nuevo al más viejo
create index if not exists comentarios_slug_creado_idx
  on public.comentarios (slug, creado desc);

-- Row Level Security ---------------------------------------------------------
-- Activarlo es idempotente (no falla si ya estaba activo).
alter table public.comentarios enable row level security;

-- Políticas: se borran y se vuelven a crear para poder re-ejecutar el script.
-- Lectura pública para anon.
drop policy if exists "comentarios: anon lee" on public.comentarios;
create policy "comentarios: anon lee"
  on public.comentarios
  for select
  to anon
  using (true);

-- Inserción pública para anon. Sin políticas de UPDATE ni DELETE: nadie
-- (salvo el panel de Supabase con rol de servicio) puede modificar o borrar.
-- Se crea solo si no existe: así no pisa la versión de respuestas.sql.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comentarios'
                 and policyname='comentarios: anon publica') then
    create policy "comentarios: anon publica" on public.comentarios for insert to anon with check (true);
  end if;
end $$;

-- Permisos explícitos (RLS filtra filas; GRANT permite el acceso a la tabla) -
-- El esquema public debe ser visible para el rol anon.
grant usage on schema public to anon;

-- Solo leer e insertar. Nada de update/delete.
grant select, insert on table public.comentarios to anon;
revoke update, delete, truncate on table public.comentarios from anon;

-- La columna identity usa una secuencia; anon necesita usarla para insertar.
grant usage, select on sequence public.comentarios_id_seq to anon;
