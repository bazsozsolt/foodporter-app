-- v17 P4: "leave at door" + photo proof of delivery. Private bucket delivery-proof/<order_id>/<file>, read via signed URLs.
alter table orders add column if not exists leave_at_door boolean not null default false;
alter table orders add column if not exists delivery_photo_path text;
alter table orders add column if not exists delivery_photo_at timestamptz;
grant select (leave_at_door, delivery_photo_path, delivery_photo_at) on orders to authenticated;
grant insert (leave_at_door) on orders to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-proof', 'delivery-proof', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- who may see an order's proof: its customer, its rider, admins
create or replace function public.fp_proof_access(p_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare oid bigint; o orders;
begin
  begin oid := split_part(p_name, '/', 1)::bigint; exception when others then return false; end;
  select * into o from orders where id = oid;
  if not found then return false; end if;
  if coalesce(my_role()::text, '') = 'admin' then return true; end if;
  if p_write then return o.rider_id = auth.uid() and o.status = 'picked_up'; end if;
  return o.rider_id = auth.uid() or o.customer_id = auth.uid();
end $$;

drop policy if exists "delivery proof upload by rider" on storage.objects;
create policy "delivery proof upload by rider" on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-proof' and fp_proof_access(name, true));
drop policy if exists "delivery proof read" on storage.objects;
create policy "delivery proof read" on storage.objects for select to authenticated
  using (bucket_id = 'delivery-proof' and fp_proof_access(name, false));

-- the rider attaches the uploaded photo; only via this RPC
create or replace function public.order_set_delivery_photo(p_order bigint, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_order;
  if not found or not (o.rider_id = auth.uid() or coalesce(my_role()::text, '') = 'admin') then raise exception 'not allowed'; end if;
  if o.status not in ('picked_up', 'delivered') then raise exception 'Foto kan alleen bij de aflevering'; end if;
  if split_part(p_path, '/', 1) <> p_order::text or p_path !~ '^[0-9]+/[A-Za-z0-9._-]{1,80}$' then raise exception 'invalid path'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'delivery-proof' and name = p_path) then raise exception 'photo not uploaded'; end if;
  perform set_config('fp.proof', 'on', true);
  update orders set delivery_photo_path = p_path, delivery_photo_at = now() where id = p_order;
  insert into audit_events (order_id, type, to_value, actor) values (p_order, 'delivery_photo', p_path, auth.uid());
end $$;
revoke all on function public.order_set_delivery_photo(bigint, text) from public, anon;
grant execute on function public.order_set_delivery_photo(bigint, text) to authenticated;

-- guard: photo columns only via the RPC; leave-at-door orders need a photo before "delivered" (admins exempt)
create or replace function public.fp_guard_proof() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and coalesce(current_setting('fp.proof', true), '') <> 'on'
     and (new.delivery_photo_path is distinct from old.delivery_photo_path or new.delivery_photo_at is distinct from old.delivery_photo_at) then
    raise exception 'delivery photo can only be set by the rider at drop-off';
  end if;
  if auth.uid() is not null and new.leave_at_door is distinct from old.leave_at_door and old.status not in ('awaiting_payment', 'payment_failed') then
    raise exception 'leave-at-door can only be chosen before payment';
  end if;
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.leave_at_door and new.delivery_photo_path is null
     and auth.uid() is not null and coalesce(my_role()::text, '') <> 'admin' then
    raise exception 'Maak eerst een foto bij de deur (afleveren zonder contact)';
  end if;
  return new;
end $$;
drop trigger if exists orders_guard_proof on orders;
create trigger orders_guard_proof before update on orders for each row execute function fp_guard_proof();
