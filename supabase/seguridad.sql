-- Nadie salvo el admin puede listar los archivos (incluidos los de textos ocultos).
-- Las URL públicas ya conocidas siguen funcionando. Idempotente.
drop policy if exists "textos storage: lectura publica" on storage.objects;
drop policy if exists "textos storage: admin lee" on storage.objects;
create policy "textos storage: admin lee" on storage.objects for select to authenticated
  using (bucket_id = 'textos' and public.es_admin());
