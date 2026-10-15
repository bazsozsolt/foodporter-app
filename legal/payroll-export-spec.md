# Payroll export spec (provider-neutral) – v20
Draft. Have the payroll provider and a lawyer or accountant confirm it before use.

**Source:** Admin → Hours & payroll → "⬇ Payroll CSV" (one file per ISO week, Mon 00:00 – Sun 24:00 Europe/Amsterdam), or the admin-only RPC `fp_payroll_week(p_week date)`. Encoding UTF-8, comma-separated, header row, decimal point, amounts in EUR gross. One row per rider with hours or deliveries that week.

**Not in the export or the app:** BSN, loonheffingskorting, ID copy, address, payslips, net pay, tax, pension contributions. The provider collects these directly from the employee and produces the payslip. App amounts are indicative, so the provider's calculation is leading.

| Column | Type | Meaning |
|---|---|---|
| week_start | date | Monday of the ISO week |
| rider_id | uuid | stable employee reference (map it to the provider's personnel number) |
| name, email | text | for matching |
| contract_kind | on_call / min_max | 0-hours on-call or min-max |
| min_hours_week, max_hours_week | number | min-max agreement (blank for on-call) |
| cao | bgv / none | wage profile used |
| age | int | age at week start (youth wage); blank = unknown, 21+ rate used |
| hours | number | clocked-in hours |
| shifts | int | clock-ins started this week |
| call_ins | int | scheduled call-ins that ended this week |
| guarantee_callin_hours | number | top-up to 3 h per call-in (7:628a lid 1 BW) |
| guarantee_cancel_hours | number | call-ins cancelled < 4 days ahead, paid (7:628a lid 3) |
| guarantee_minmax_hours | number | top-up to the weekly minimum (min-max, full weeks only) |
| paid_hours | number | hours + all guarantees |
| wml_rate_eur | € | hourly base rate: max(CAO youth % of WML, CAO scale A1 for 21+, WML) |
| wage_eur | € | hours × rate |
| guarantee_eur | € | guarantee hours × rate (no surcharges) |
| sat_hours, sun_hours, holiday_hours_worked, night_hours, overtime_hours | number | surcharge bases (public holidays from the `public_holidays` table; night 21:00–05:00; overtime Mon–Fri above 40 h, or above the max for min-max) |
| surcharge_sat_eur … surcharge_overtime_eur | € | rate × hours × % (Settings). Day and night surcharges stack, which still needs confirmation |
| delivery_bonus_eur | € | per-delivery bonus (wage component) |
| tips_eur | € | tips passed on 100% (the provider decides the tax treatment) |
| holiday_pay_pct, holiday_pay_eur | %, € | 8% of wage + guarantees + surcharges + bonus |
| holiday_hours | number | leave hours accrued (paid_hours × holiday_hours_pct) |
| pension_fund | text | e.g. Pensioenfonds Vervoer. The provider calculates the premiums |
| gross_indicative_eur | € | wage + guarantees + surcharges + bonus + tips + holiday pay |
| deliveries | int | count |
| atw_violations | int | Working Hours Act alerts this week (for review, not pay) |
| test_account | yes/no | **drop test rows** before import |

**Process:** export Monday morning for the previous week. Check that atw_violations are reviewed and test rows removed, then upload to the provider over its secure portal and never by plain email. Keep a copy for 7 years (fiscal retention) in restricted storage.
