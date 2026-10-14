-- upsert/replace in storage needs SELECT on the object; scope it to owners like the write policies.
create policy "menu photos owner select" on storage.objects for select to authenticated using (
  bucket_id = 'menu-photos' and ((select my_role()) = 'admin' or (storage.foldername(name))[1] = (select my_restaurant())::text));
