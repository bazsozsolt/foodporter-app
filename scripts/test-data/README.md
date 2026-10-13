# Test dataset (testing mode)

Everything here is **fictional test data** and flagged `is_test = true`
(`restaurants`, `profiles`, `orders`, `incidents`, `payouts`). Seeded orders use fake Mollie ids `tr_test_seed_*`
and refunds `re_test_seed_*`; Mollie is never called.

| Source | What |
|---|---|
| OpenStreetMap via Overpass (`osm_tilburg.json`, © OpenStreetMap contributors, ODbL) | `amenity=restaurant|fast_food` with a name and street address inside Tilburg municipality and the 15 km zone. Description: "Test data from OpenStreetMap, not a partner". Menus/prices are generated examples per cuisine. |
| PDOK Locatieserver / BAG (`pdok_addresses.json`) | Real Tilburg street + house number addresses used for invented customers. |
| Invented | 100 customers (`testklant.*@example.com`), 15 riders (`testrider.*@example.com`), no usable password (empty hash). Phones `+31 6 0000 xxxx`: the 06-0000 block is not issued, so they are fake by design. |

No data was taken from Thuisbezorgd, Uber Eats or any real person.

## Regenerate / load
```
python3 generate_seed.py      # writes seed.sql (deterministic, random.seed(42))
psql "$DB_URL" -f seed.sql    # or paste parts into the Supabase SQL editor
```
The seed disables user triggers on `orders`/`bids` while inserting (no SMS/refund webhooks fire) and writes the
timeline to `audit_events` itself, then re-enables them.

## Remove everything
```sql
select public.purge_test_data();
```
Deletes all rows flagged `is_test` plus their orders, items, bids, events, ratings, earnings, payouts, incidents,
alerts, rider locations, menus and the test auth users, then recomputes restaurant rating counters.
Callable by the database owner or a signed-in admin. It refuses to run if orders 1043/1046 were ever flagged.
