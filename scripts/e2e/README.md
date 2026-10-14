# End-to-end + RLS tests

Run against the live Supabase project with **test accounts only** (all flagged `is_test`, removed by `select public.purge_test_data();`).

```
FP_TEST_CREDS=/path/to/.creds ./scripts/e2e/run-all.sh
```

`.creds` (never committed) holds `HOST_/GUEST_/OUTSIDER_/STAFF_/RIDER_/ADMIN_/CUST2_` `EMAIL` + `PASSWORD` lines.
Mollie test payments are completed through the hosted test checkout with Playwright (`pay.py`, choose "Paid").

- `core.e2e.mjs`: order → Mollie test payment → restaurant accept → rider bid/auction → ready → picked up → delivered → rating → key metric, plus RLS negatives.
- `group.e2e.mjs`: group orders (create/join/add/lock/deadline/checkout/pay) plus RLS and realtime leak tests.
