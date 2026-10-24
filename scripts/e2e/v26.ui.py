# v26/v27 UI: transparent price breakdown (distance fee + service fee, pickup without fees), pay hand-off without price_changed,
# home fee badge + allergen default label (feedback 8), terms copy, restaurant commission figures, admin business model / restaurants / payouts.
# Test accounts only; one Mollie TEST checkout is opened and abandoned. Saves screens_v26.
import re, sys, os, json
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://foodporter.nl"
OUT = "/workspace/foodporter/screens_v26"; os.makedirs(OUT, exist_ok=True); P = F = 0
RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db"
def ok(n, c, d=""):
    global P, F
    if c: P += 1; print("PASS", n)
    else: F += 1; print("FAIL", n, d)
def cents(s): m = re.findall(r"€\s?(\d+)[,.](\d{2})", s); return int(m[-1][0]) * 100 + int(m[-1][1]) if m else None
with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(acct, lang="nl", w=390, h=844):
        c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2); pg = c.new_page()
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle"); pg.evaluate(f"localStorage.setItem('fp-lang','{lang}'); localStorage.removeItem('fp-cart')"); pg.reload()
        pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
        return c, pg
    for lang in ["nl", "en"]:
        c, pg = ctx("SIMC1", lang)
        pg.goto(B + "/"); pg.wait_for_selector("[data-testid=home-allergen]", timeout=20000); pg.wait_for_timeout(1200)
        opt = pg.locator("[data-testid=home-allergen] option").first.inner_text()
        ok(f"{lang} allergen default reads '… (kies)/(choose)' (feedback 8)", opt.strip() == ("… (kies)" if lang == "nl" else "… (choose)"), opt)
        main = pg.inner_text("main")
        ok(f"{lang} home shows distance fee from €2.49", ("bezorging vanaf €2,49" in main) if lang == "nl" else re.search(r"delivery from €2[.,]49", main), main[:200])
        add = "Eén meer" if lang == "nl" else "Add one"
        pg.goto(B + f"/r/?id={RID}"); pg.wait_for_selector(f"button[aria-label='{add}']", timeout=20000); pg.wait_for_timeout(600)
        for _ in range(3): pg.locator(f"button[aria-label='{add}']").first.click(); pg.wait_for_timeout(300)
        pg.locator("[data-testid=view-cart]").click(); pg.wait_for_selector("[data-testid=cart-fee-note]", timeout=5000)
        note = pg.inner_text("[data-testid=cart-fee-note]")
        ok(f"{lang} cart sheet explains fees", all(re.search(x, note) for x in [r"€2[.,]49", r"€4[.,]99", r"€0[.,]99"]), note)
        pg.locator("[data-testid=go-checkout]").click(); pg.wait_for_selector("[data-testid=price-breakdown]", timeout=15000)
        pg.fill("[data-testid=address]", "Heuvelstraat 12, Tilburg"); pg.wait_for_timeout(2500)
        sug = pg.locator("[data-testid=address] ~ ul button").first
        if sug.count(): sug.click()
        pg.wait_for_function("() => /km/.test(document.querySelector('[data-testid=fee-line]')?.textContent || '')", timeout=15000)
        pg.fill("[data-testid=phone]", "0612345678"); pg.wait_for_timeout(500)
        bd = pg.inner_text("[data-testid=price-breakdown]")
        fee = cents(pg.inner_text("[data-testid=fee-line]")); svc = cents(pg.inner_text("[data-testid=service-line]")); tot = cents(pg.inner_text("[data-testid=total]"))
        items = cents(pg.locator("[data-testid=price-breakdown] div").first.inner_text())
        ok(f"{lang} breakdown: fee by distance (≤3 km → €2.49)", fee == 249, pg.inner_text("[data-testid=fee-line]"))
        ok(f"{lang} breakdown: service fee €0.99", svc == 99)
        ok(f"{lang} breakdown adds up", tot == items + fee + svc, f"{items}+{fee}+{svc} vs {tot}")
        ok(f"{lang} fee explainer lists bands + rider bonus", "€3" in pg.inner_text("[data-testid=fee-explainer]") and ("rider" in pg.inner_text("[data-testid=fee-explainer]")))
        pg.locator("[data-testid=price-breakdown]").scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/checkout-breakdown-{lang}.png", full_page=True)
        pg.click("[data-testid=choose-pickup]"); pg.wait_for_timeout(600)
        pfee = cents(pg.inner_text("[data-testid=fee-line]")); psvc = cents(pg.inner_text("[data-testid=service-line]")); ptot = cents(pg.inner_text("[data-testid=total]"))
        ok(f"{lang} pickup: no delivery or service fee", pfee == 0 and psvc == 0 and ptot == items and pg.locator("[data-testid=fee-explainer]").count() == 0, f"{pfee} {psvc} {ptot}")
        pg.screenshot(path=f"{OUT}/checkout-pickup-{lang}.png", full_page=True)
        pg.click("[data-testid=choose-delivery]"); pg.wait_for_timeout(1500)
        if lang == "nl":
            pg.get_by_role("button", name=re.compile(r"^Betaal €")).last.click()
            try: pg.wait_for_url(re.compile(r"mollie\.com"), timeout=25000); moved = True
            except Exception: moved = False
            ok("pay hands off to Mollie TEST checkout (server total = shown total, no price_changed)", moved and pg.locator("[data-testid=price-changed]").count() == 0, pg.url)
        pg.goto(B + "/terms/"); pg.wait_for_timeout(1500); tt = pg.inner_text("main")
        ok(f"{lang} terms page: distance fees, service fee, 5 km zone", ("€2,49" in tt and "€0,99" in tt and "5 km" in tt) if lang == "nl" else ("€2.49" in tt and "€0.99" in tt and "5 km" in tt))
        pg.evaluate("localStorage.removeItem('fp-cart')"); c.close()
    for lang in ["nl", "en"]:
        c, pg = ctx("STAFF", lang)
        pg.goto(B + "/restaurant/"); pg.wait_for_selector("[data-testid=commission-rates]", timeout=20000); pg.wait_for_timeout(1500)
        cr = pg.inner_text("[data-testid=commission-rates]")
        ok(f"{lang} restaurant sees its rates (20% founding, 10% pickup) + end date", "20%" in cr and "10%" in cr and re.search(r"2027", cr), cr)
        pg.screenshot(path=f"{OUT}/restaurant-figures-{lang}.png", full_page=False); c.close()
    c, pg = ctx("ADMIN", "en", 1280, 900)
    pg.goto(B + "/admin/settings/"); pg.wait_for_selector("[data-testid=business-model]", timeout=20000); pg.wait_for_timeout(1500)
    ok("admin business model: zone 5, 3 bands, service €0.99, min-max", pg.input_value("[data-testid=bm-zone]") == "5" and pg.locator("[data-testid^=band-km-]").count() == 3
       and pg.input_value("[data-testid=service-fee]") in ("0.99", "0,99") and pg.input_value("[data-testid=bm-contract]") == "min_max")
    ok("admin business model: commission 25/20/3/10", [pg.input_value(f"[data-testid=bm-{k}]") for k in ["commission_delivery_pct", "commission_intro_pct", "commission_intro_months", "commission_pickup_pct"]] == ["25", "20", "3", "10"])
    ok("v27 admin business model: rider bonus €0.50", pg.input_value("[data-testid=bm-rider-bonus]") in ("0.50", "0,50"))
    pg.locator("[data-testid=business-model]").scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/admin-business-settings.png", full_page=True)
    # v28: rider info reads the live bonus setting (temporarily €0.75, then the reset below restores €0.50)
    pg.fill("[data-testid=bm-rider-bonus]", "0.75")
    pg.fill("[data-testid=band-fee-0]", "2.59"); pg.fill("[data-testid=service-fee]", "1.09"); pg.fill("[data-testid=bm-commission_delivery_pct]", "26")  # v28b: live copy
    pg.get_by_role("button", name="Save business model").click(); pg.wait_for_timeout(2500)
    pg.goto(B + "/terms/"); pg.wait_for_timeout(4000); tt = pg.inner_text("main")
    ok("v28b terms quote the live fee band + service fee", "€2.59 up to 3 km" in tt and "€1.09" in tt and "€2.49" not in tt, tt[:200])
    pg.goto(B + "/welcome/"); pg.wait_for_timeout(4000); wt = pg.inner_text("main")
    ok("v28b welcome quotes the live commission", "26% on delivered" in wt and "25% on delivered" not in wt)
    pg.goto(B + "/r/?id=187f751c-bebb-4a34-9d4b-9b1a9e8851db")
    for _ in range(40):
        if pg.locator("[data-testid=help-button]").count(): break
        pg.wait_for_timeout(500)
    fq = ""
    if pg.locator("[data-testid=help-button]").count(): pg.locator("[data-testid=help-button]").first.click(); pg.wait_for_timeout(1500); fq = pg.text_content("body") or ""
    ok("v28b help FAQ quotes the live fee band + service fee", "€2.59 up to 3 km" in fq and "€1.09 service fee" in fq)
    pg.goto(B + "/rider-info/"); pg.wait_for_selector("[data-testid=live-bonus]", timeout=20000); pg.wait_for_timeout(2500)
    lb = pg.locator("[data-testid=live-bonus]").first.inner_text()
    ok("v28 rider info shows the live bonus setting (€0.75)", re.search(r"0[,.]75", lb) is not None, lb)
    pg.goto(B + "/admin/settings/"); pg.wait_for_selector("[data-testid=business-model]", timeout=20000); pg.wait_for_timeout(1500)
    pg.once("dialog", lambda d: d.accept()); pg.get_by_role("button", name="Reset to plan defaults").click(); pg.wait_for_timeout(2500)
    ok("reset to plan defaults saves (toast)", "Plan defaults restored" in pg.inner_text("body"))
    pg.goto(B + "/admin/restaurants/"); pg.wait_for_selector("[data-testid=admin-commission]", timeout=20000)
    ac = pg.locator("[data-testid=admin-commission]").all_inner_texts(); kb = [t for t in ac if "20%" in t]
    ok("admin restaurants list shows the current rate", len(kb) >= 1, str(ac[:3]))
    pg.goto(B + "/admin/payments/"); pg.wait_for_timeout(5000)
    fr = pg.locator("[data-testid=fin-rates]").all_inner_texts()
    ok("admin payouts show delivered/pickup rates", any("delivered" in t and "pickup" in t for t in fr), str(fr[:2]))
    pg.wait_for_selector("[data-testid=company-revenue]", timeout=20000)
    ok("v27 payments page shows company revenue", cents(pg.inner_text("[data-testid=company-revenue-total]")) is not None, pg.inner_text("[data-testid=company-revenue]")[:200])
    pg.screenshot(path=f"{OUT}/admin-restaurant-payouts.png", full_page=False); c.close()
    for lang in ["nl", "en"]:
        c, pg = ctx("SIMR3", lang)
        pg.goto(B + "/rider/earnings/"); pg.wait_for_timeout(5000); t = pg.inner_text("main")
        ok(f"v27 {lang} rider earnings explain the fixed €0.50 bonus", re.search(r"€0[,.]50", t) and ("vaste bezorgbonus" in t if lang == "nl" else "fixed delivery bonus" in t), t[-300:])
        pg.screenshot(path=f"{OUT}/rider-earnings-{lang}.png", full_page=True)
        pg.goto(B + "/rider-info/"); pg.wait_for_timeout(1500); ri = pg.inner_text("main")
        ok(f"v27 {lang} rider info: fixed bonus, no 'equal to the delivery fee'", re.search(r"€0[,.]50", ri) and "gelijk aan de bezorgkosten" not in ri and "equal to the delivery fee" not in ri)
        if lang == "en":  # v28: the GDPR export includes the rider's employment data and the other own tables
            pg.goto(B + "/privacy/"); pg.wait_for_timeout(3000)
            with pg.expect_download(timeout=30000) as dl: pg.click("[data-testid=data-export]")
            data = json.load(open(dl.value.path()))
            want = ["profile", "earnings", "rider_employment", "rider_onboarding", "payouts", "work_violations", "group_memberships", "account_status_log"]
            ok("v28 data export has all own sections incl. rider employment", all(k in data for k in want) and isinstance(data.get("rider_employment"), list) and len(data["rider_employment"]) == 1, str([k for k in want if k not in data]))
        c.close()
    b.close()
print(f"\n{P} passed, {F} failed"); sys.exit(1 if F else 0)
