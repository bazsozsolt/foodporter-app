-- Local stand-in for v39 stale-assignment helpers. Not applied to the live project.
create type public.order_status as enum (
  'awaiting_payment', 'payment_failed', 'placed', 'accepted', 'assigned', 'ready', 'picked_up', 'delivered', 'cancelled'
);
create table public.orders (
  id bigint primary key,
  rider_id uuid,
  status public.order_status not null,
  assigned_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz
);

create table public.settings (
  id boolean primary key default true,
  stale_assignment_minutes int not null default 180,
  constraint settings_stale_assignment_minutes_check check (stale_assignment_minutes between 30 and 1440)
);
insert into public.settings(id) values (true);
