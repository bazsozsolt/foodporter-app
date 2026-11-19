-- Local stand-in for the v38 delivery-minimum trigger. Not applied to the live project.
create table public.settings (
  id boolean primary key default true,
  zone_radius_km numeric
);
insert into public.settings(id, zone_radius_km) values (true, 5);

create table public.orders (
  id bigint primary key,
  status text not null,
  fulfilment text not null default 'delivery' check (fulfilment in ('delivery', 'pickup')),
  subtotal_cents int not null
);
