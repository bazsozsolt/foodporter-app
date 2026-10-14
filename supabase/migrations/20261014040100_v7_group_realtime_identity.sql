-- Realtime DELETE events bypass RLS; with replica identity FULL they leaked old row contents to
-- anyone subscribed with the group id. Default identity -> only the primary key is broadcast.
alter table group_orders replica identity default;
alter table group_items replica identity default;
alter table group_members replica identity default;
