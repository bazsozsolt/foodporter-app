-- v13: restaurant cover/logo and menu item photos. Public bucket (images are shown to everyone), owner-only writes.
alter table restaurants add column if not exists image_url text, add column if not exists logo_url text, add column if not exists image_credit text;
alter table menu_items add column if not exists image_url text, add column if not exists image_credit text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-photos', 'menu-photos', true, 1572864, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = true, file_size_limit = 1572864, allowed_mime_types = array['image/webp','image/jpeg','image/png'];

-- Path layout: <restaurant_id>/<kind>-<random>.webp ; library/<key>.webp (admin only, licensed test images)
create policy "menu photos owner insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'menu-photos' and ((select my_role()) = 'admin' or (storage.foldername(name))[1] = (select my_restaurant())::text));
create policy "menu photos owner update" on storage.objects for update to authenticated using (
  bucket_id = 'menu-photos' and ((select my_role()) = 'admin' or (storage.foldername(name))[1] = (select my_restaurant())::text));
create policy "menu photos owner delete" on storage.objects for delete to authenticated using (
  bucket_id = 'menu-photos' and ((select my_role()) = 'admin' or (storage.foldername(name))[1] = (select my_restaurant())::text));

create or replace function fp_menu_photo_url(p_path text) returns text language sql immutable set search_path = public as $$
  select case when p_path is null then null else 'https://joontqbhfqjqkyhlifle.supabase.co/storage/v1/object/public/menu-photos/' || p_path end $$;

create or replace function set_restaurant_image(p_restaurant uuid, p_kind text, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare u text;
begin
  if not ((select my_role()) = 'admin' or (select my_restaurant()) = p_restaurant) then raise exception 'Alleen je eigen restaurant'; end if;
  if p_kind not in ('cover','logo') then raise exception 'Onbekend fototype'; end if;
  if p_path is not null and (p_path !~ '^[0-9a-f-]{36}/[a-z]+-[0-9a-zA-Z_-]{6,40}\.(webp|jpg|png)$' or split_part(p_path, '/', 1) <> p_restaurant::text) then raise exception 'Foto kon niet worden gekoppeld, probeer opnieuw'; end if;
  u := fp_menu_photo_url(p_path);
  if p_kind = 'cover' then update restaurants set image_url = u, image_credit = null where id = p_restaurant;
  else update restaurants set logo_url = u where id = p_restaurant; end if;
  return u;
end $$;

create or replace function set_menu_item_image(p_item uuid, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare rid uuid; u text;
begin
  select restaurant_id into rid from menu_items where id = p_item;
  if rid is null or not ((select my_role()) = 'admin' or (select my_restaurant()) = rid) then raise exception 'Alleen je eigen restaurant'; end if;
  if p_path is not null and (p_path !~ '^[0-9a-f-]{36}/[a-z]+-[0-9a-zA-Z_-]{6,40}\.(webp|jpg|png)$' or split_part(p_path, '/', 1) <> rid::text) then raise exception 'Foto kon niet worden gekoppeld, probeer opnieuw'; end if;
  u := fp_menu_photo_url(p_path);
  update menu_items set image_url = u, image_credit = null where id = p_item;
  return u;
end $$;
revoke execute on function set_restaurant_image(uuid, text, text), set_menu_item_image(uuid, text) from public, anon;
grant execute on function set_restaurant_image(uuid, text, text), set_menu_item_image(uuid, text) to authenticated;
