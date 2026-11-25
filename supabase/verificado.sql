-- Respuestas del autor con palomita de verificado. Idempotente. Ejecutar después de respuestas.sql.
alter table public.comentarios add column if not exists verificado boolean not null default false;

-- El público NUNCA puede marcarse como verificado.
drop policy if exists "comentarios: anon publica" on public.comentarios;
create policy "comentarios: anon publica" on public.comentarios for insert to anon
  with check (
    comentarios.verificado = false
    and (comentarios.parent_id is null
      or exists (select 1 from public.comentarios p
                 where p.id = comentarios.parent_id and p.slug = comentarios.slug and p.parent_id is null))
  );

-- Solo el administrador publica con sesión iniciada.
drop policy if exists "comentarios: admin lee" on public.comentarios;
create policy "comentarios: admin lee" on public.comentarios for select to authenticated using (public.es_admin());
drop policy if exists "comentarios: admin publica" on public.comentarios;
create policy "comentarios: admin publica" on public.comentarios for insert to authenticated with check (public.es_admin());
grant select, insert on table public.comentarios to authenticated;
revoke update, delete, truncate on table public.comentarios from authenticated;
