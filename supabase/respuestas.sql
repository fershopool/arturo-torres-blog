-- ============================================================================
-- Respuestas a comentarios. Idempotente.
-- Ejecutar en el SQL Editor de Supabase (después de comentarios.sql).
-- ============================================================================

-- Respuestas: una respuesta apunta a un comentario principal y no lleva estrellas.
alter table public.comentarios add column if not exists parent_id bigint
  references public.comentarios(id) on delete cascade;
alter table public.comentarios alter column estrellas drop not null;

alter table public.comentarios drop constraint if exists comentarios_estrellas_req;
alter table public.comentarios add constraint comentarios_estrellas_req
  check ((parent_id is null and estrellas is not null) or (parent_id is not null and estrellas is null));

create index if not exists comentarios_parent_idx on public.comentarios (parent_id);

alter table public.comentarios add column if not exists verificado boolean not null default false;

-- La respuesta debe ir a un comentario principal del mismo texto.
drop policy if exists "comentarios: anon publica" on public.comentarios;
create policy "comentarios: anon publica" on public.comentarios for insert to anon
  with check (
    comentarios.verificado = false
    and (comentarios.parent_id is null
      or exists (select 1 from public.comentarios p
                 where p.id = comentarios.parent_id and p.slug = comentarios.slug and p.parent_id is null))
  );
