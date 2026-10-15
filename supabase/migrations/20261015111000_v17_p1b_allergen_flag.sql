-- keep allergens_test when the caller sets it explicitly in the same update (test cleanup); otherwise an edit marks the list as real
create or replace function public.fp_menu_allergen_stamp() returns trigger language plpgsql as $$
begin
  if new.allergens is distinct from old.allergens then new.allergens_updated_at := now();
    if auth.uid() is not null and new.allergens_test is not distinct from old.allergens_test then new.allergens_test := false; end if;
  end if; return new;
end $$;
