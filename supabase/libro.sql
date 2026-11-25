-- Diseño del libro (color, alto y ancho del lomo) de cada texto. Idempotente.
-- Ejecutar en el SQL Editor del proyecto wvnwsmmaastsakoweksx.
alter table public.textos add column if not exists libro jsonb;
