-- Food Porter seed data (EXAMPLE restaurants, not real partners).
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

insert into restaurants (id, name, cuisine, area, address, avg_prep_minutes, commission_pct, active) values
  ('11111111-0000-4000-8000-000000000001', 'Spoorzone Burger Co. (example)', 'Burgers', 'Spoorzone', 'Example address, Tilburg', 15, 12, true),
  ('11111111-0000-4000-8000-000000000002', 'Piushaven Pizza (example)', 'Wood-fired pizza', 'Piushaven', 'Example address, Tilburg', 20, 12, true),
  ('11111111-0000-4000-8000-000000000003', 'Heuvel Noodle Bar (example)', 'Asian', 'Heuvel', 'Example address, Tilburg', 12, 12, true),
  ('11111111-0000-4000-8000-000000000004', 'Korvel Kebab House (example)', 'Turkish', 'Korvel', 'Example address, Tilburg', 10, 12, true)
on conflict (id) do update set name = excluded.name, cuisine = excluded.cuisine, area = excluded.area,
  avg_prep_minutes = excluded.avg_prep_minutes, commission_pct = excluded.commission_pct, active = excluded.active;

insert into menu_items (id, restaurant_id, name, price_cents) values
  ('22222222-0001-4000-8000-000000000000', '11111111-0000-4000-8000-000000000001', 'Smash Burger', 1150),
  ('22222222-0001-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'Truffle Fries', 475),
  ('22222222-0001-4000-8000-000000000002', '11111111-0000-4000-8000-000000000001', 'Veggie Burger', 1095),
  ('22222222-0001-4000-8000-000000000003', '11111111-0000-4000-8000-000000000001', 'Milkshake', 450),
  ('22222222-0002-4000-8000-000000000000', '11111111-0000-4000-8000-000000000002', 'Margherita', 1050),
  ('22222222-0002-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'Diavola', 1300),
  ('22222222-0002-4000-8000-000000000002', '11111111-0000-4000-8000-000000000002', 'Tiramisu', 600),
  ('22222222-0003-4000-8000-000000000000', '11111111-0000-4000-8000-000000000003', 'Pad Thai', 1350),
  ('22222222-0003-4000-8000-000000000001', '11111111-0000-4000-8000-000000000003', 'Ramen Shoyu', 1450),
  ('22222222-0003-4000-8000-000000000002', '11111111-0000-4000-8000-000000000003', 'Gyoza (6)', 650),
  ('22222222-0004-4000-8000-000000000000', '11111111-0000-4000-8000-000000000004', 'Durum Döner', 950),
  ('22222222-0004-4000-8000-000000000001', '11111111-0000-4000-8000-000000000004', 'Lahmacun', 700),
  ('22222222-0004-4000-8000-000000000002', '11111111-0000-4000-8000-000000000004', 'Ayran', 250)
on conflict (id) do update set name = excluded.name, price_cents = excluded.price_cents, restaurant_id = excluded.restaurant_id;

-- ===== Roles (run AFTER the person has signed in once, so their profile exists) =====
-- Make a user admin (sees and can drive every step: order, accept, bid, deliver):
-- update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
--
-- Make a user a rider:
-- update profiles set role = 'rider', full_name = 'Sanne' where id = (select id from auth.users where email = 'rider@example.com');
--
-- Make a user staff of a restaurant (here: Spoorzone Burger Co.):
-- update profiles set role = 'restaurant', restaurant_id = '11111111-0000-4000-8000-000000000001'
--   where id = (select id from auth.users where email = 'kitchen@example.com');
