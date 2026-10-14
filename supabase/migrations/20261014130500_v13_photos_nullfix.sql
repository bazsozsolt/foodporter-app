-- Fix: my_restaurant() is NULL for non-restaurant users, which made the ownership test NULL (not true) and let it pass.
create or replace function fp_owns_restaurant(p_restaurant uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select my_role()) = 'admin', false) or coalesce((select my_restaurant()) = p_restaurant, false) $$;
revoke execute on function fp_owns_restaurant(uuid) from public, anon;
grant execute on function fp_owns_restaurant(uuid) to authenticated;

create or replace function set_restaurant_image(p_restaurant uuid, p_kind text, p_path text) returns text
language plpgsql security definer set search_path = public as $$
declare u text;
begin
  if not fp_owns_restaurant(p_restaurant) then raise exception 'Alleen je eigen restaurant'; end if;
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
  if rid is null or not fp_owns_restaurant(rid) then raise exception 'Alleen je eigen restaurant'; end if;
  if p_path is not null and (p_path !~ '^[0-9a-f-]{36}/[a-z]+-[0-9a-zA-Z_-]{6,40}\.(webp|jpg|png)$' or split_part(p_path, '/', 1) <> rid::text) then raise exception 'Foto kon niet worden gekoppeld, probeer opnieuw'; end if;
  u := fp_menu_photo_url(p_path);
  update menu_items set image_url = u, image_credit = null where id = p_item;
  return u;
end $$;
