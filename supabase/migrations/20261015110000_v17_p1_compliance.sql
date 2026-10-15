-- v17 P1: allergens, min order + service fee, suspension human-review log
create or replace function public.fp_valid_allergens(a text[]) returns boolean language sql immutable as $$
  select coalesce(a <@ array['gluten','crustaceans','eggs','fish','peanuts','soy','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs']::text[], true)
$$;
alter table menu_items add column if not exists allergens text[] not null default '{}',
  add column if not exists allergens_test boolean not null default false,
  add column if not exists allergens_updated_at timestamptz;
alter table menu_items drop constraint if exists menu_items_allergens_valid;
alter table menu_items add constraint menu_items_allergens_valid check (fp_valid_allergens(allergens) and cardinality(allergens) <= 14);
create or replace function public.fp_menu_allergen_stamp() returns trigger language plpgsql as $$
begin
  if new.allergens is distinct from old.allergens then new.allergens_updated_at := now();
    -- an edit by a restaurant/admin makes the list real data, not seeded test values
    if auth.uid() is not null then new.allergens_test := false; end if;
  end if; return new;
end $$;
drop trigger if exists menu_allergen_stamp on menu_items;
create trigger menu_allergen_stamp before update on menu_items for each row execute function fp_menu_allergen_stamp();

alter table restaurants add column if not exists min_order_cents integer not null default 0 check (min_order_cents between 0 and 10000);
alter table settings add column if not exists service_fee_cents integer not null default 0 check (service_fee_cents between 0 and 300);
alter table orders add column if not exists service_fee_cents integer not null default 0 check (service_fee_cents between 0 and 300);

-- Human review of suspensions: only admins may change a rider's status; suspension needs a reason; every change is logged.
create table if not exists account_status_log (
  id bigserial primary key, profile_id uuid not null references profiles(id) on delete cascade,
  old_status text, new_status text not null, reason text, actor_id uuid, created_at timestamptz not null default now()
);
alter table account_status_log enable row level security;
drop policy if exists "admin reads status log" on account_status_log;
create policy "admin reads status log" on account_status_log for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));
drop policy if exists "own status log" on account_status_log;
create policy "own status log" on account_status_log for select using (profile_id = auth.uid());
create or replace function public.fp_status_review() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if auth.uid() is not null and not exists (select 1 from profiles where id = auth.uid() and role = 'admin') then
      raise exception 'Only an admin can change account status';
    end if;
    if new.status in ('suspended','blocked') and coalesce(btrim(new.status_reason), '') = '' then
      raise exception 'A suspension needs a written reason';
    end if;
    insert into account_status_log(profile_id, old_status, new_status, reason, actor_id) values (new.id, old.status, new.status, new.status_reason, auth.uid());
  end if; return new;
end $$;
drop trigger if exists profiles_status_review on profiles;
create trigger profiles_status_review before update of status on profiles for each row execute function fp_status_review();

-- Seed plausible TEST allergen values for test restaurants' dishes (marked allergens_test)
update menu_items m set allergens = s.a, allergens_test = true from (
  select mi.id, array_remove(array[
    case when mi.name ~* 'pizza|burger|broodje|sandwich|tosti|pasta|wrap|brood|naan|noodle|bun|panini|kebab|durum|friet|croquet|kroket|frikandel|taco' then 'gluten' end,
    case when mi.name ~* 'kaas|cheese|pizza|tosti|milk|melk|yoghurt|ijs|ice|naan|burger|cream|room' then 'milk' end,
    case when mi.name ~* 'ei|egg|mayo|noodle|pasta|carbonara|kroket|croquet' then 'eggs' end,
    case when mi.name ~* 'sushi|vis|fish|zalm|salmon|tonijn|tuna|kibbeling' then 'fish' end,
    case when mi.name ~* 'garnal|shrimp|prawn|ebi' then 'crustaceans' end,
    case when mi.name ~* 'sushi|soja|soy|teriyaki|noodle|wok|ramen|tofu' then 'soy' end,
    case when mi.name ~* 'sesam|sesame|sushi|hummus|falafel' then 'sesame' end,
    case when mi.name ~* 'satay|saté|sate|pinda|peanut|pad thai' then 'peanuts' end,
    case when mi.name ~* 'mosterd|mustard|hotdog|frikandel|burger' then 'mustard' end
  ]::text[], null) a
  from menu_items mi join restaurants r on r.id = mi.restaurant_id where r.is_test and cardinality(mi.allergens) = 0
) s where m.id = s.id;
