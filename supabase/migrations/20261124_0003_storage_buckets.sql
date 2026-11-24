-- ============================================================
-- MIGRACIÓN 0003 — Buckets de Supabase Storage
--
-- La migración 0002 ya contemplaba estos buckets, pero algunas bases
-- quedaron con las tablas configuradas y sin storage.buckets.
-- Este script es idempotente y solo crea buckets/policies faltantes.
--
-- Ejecutar en: Supabase → SQL Editor
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 5242880,
   array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']),
  ('payment-proofs', 'payment-proofs', true, 8388608,
   array['image/png','image/jpeg','image/webp','image/heic','application/pdf'])
on conflict (id) do nothing;

drop policy if exists "product-images staff insert" on storage.objects;
drop policy if exists "product-images staff update" on storage.objects;
drop policy if exists "product-images staff delete" on storage.objects;
drop policy if exists "payment-proofs anyone insert" on storage.objects;

create policy "product-images staff insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images');

create policy "product-images staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product-images staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images');

create policy "payment-proofs anyone insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'payment-proofs');
