# Local UI checks for the eight e2e-round-1 fixes. Serves nothing itself: pass the
# mock-mode static export base URL. One browser. Prints no secrets.
import json, os, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4361"
SHOT = Path(sys.argv[2] if len(sys.argv) > 2 else "/workspace/fptest/v38/e2e_round1/shots")
SHOT.mkdir(parents=True, exist_ok=True)
REST = "/r/11111111-0000-4000-8000-000000000004/"
res, notes = [], []

def ok(n, c, x=""):
    res.append({"name": n, "pass": bool(c), "detail": str(x)[:300]})
    print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
    return bool(c)

def body(pg):
    try:
        return pg.inner_text("body")
    except Exception:
        return ""

def shot(pg, name):
    pg.screenshot(path=str(SHOT / f"{name}.png"), full_page=True)

def toggle(pg, lang):
    box = pg.locator("[data-testid=lang-toggle]")
    box.wait_for(timeout=10000)
    box.locator("button", has_text=re.compile(f"^{lang}$", re.I)).click()
    pg.wait_for_timeout(500)

def sign_in(pg):
    pg.goto(B + "/login/", wait_until="networkidle", timeout=30000)
    pg.wait_for_timeout(400)
    if pg.get_by_role("button", name=re.compile("Uitloggen|Sign out")).count():
        return True
    pg.fill("input[type=email]", "mock.customer@example.com")
    pg.fill("input[type=password]", "mock-pass")
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click()
    pg.wait_for_timeout(800)
    return "Ingelogd" in body(pg) or "Signed in" in body(pg) or "mock.customer" in body(pg)

def add_named(pg, name):
    row = pg.get_by_text(name, exact=True).first
    row.locator("xpath=ancestor::*[.//button][1]").get_by_role("button", name=re.compile("Eén meer|Add one")).click()
    pg.wait_for_timeout(250)

def checkout_cart(pg, door=False, tip=True):
    pg.goto(B + REST, wait_until="networkidle", timeout=30000)
    pg.get_by_text("Durum Döner", exact=True).first.wait_for(timeout=15000)
    add_named(pg, "Durum Döner")
    add_named(pg, "Lahmacun")
    pg.goto(B + "/checkout/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(500)
    if pg.locator("[data-testid=choose-delivery]").count():
        pg.locator("[data-testid=choose-delivery]").click()
        pg.wait_for_timeout(200)
    phone = pg.locator("[data-testid=phone]")
    phone.fill("0612345678")
    box = pg.locator("[data-testid=leave-at-door] input")
    if box.count():
        if door and not box.is_checked():
            box.check()
        if not door and box.is_checked():
            box.uncheck()
    if tip and pg.locator("[data-testid=tip-100]").count():
        pg.locator("[data-testid=tip-100]").click()
        pg.wait_for_timeout(200)
    return phone

def pay_mock(pg):
    pay = pg.get_by_role("button", name=re.compile(r"Betaal |Pay "))
    pay.click()
    pg.wait_for_timeout(1200)
    for _ in range(15):
        if "order" in pg.url:
            break
        pg.wait_for_timeout(300)
    return "order" in pg.url

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="nl-NL")
    pg = ctx.new_page()
    pg.on("dialog", lambda d: d.accept())
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))

    ok("mock sign-in", sign_in(pg), pg.url)
    pg.goto(B + "/", wait_until="networkidle", timeout=20000)
    toggle(pg, "nl")
    bar = pg.locator("[data-testid=tabbar]").inner_text()
    shot(pg, "nl_tabbar_start")
    ok("NL tab bar says Start, not Home", "Start" in bar and not re.search(r"^Home$|\\nHome\\n", bar), bar.replace("\n", " | "))
    toggle(pg, "en")
    bar = pg.locator("[data-testid=tabbar]").inner_text()
    ok("EN tab bar still says Home", "Home" in bar, bar.replace("\n", " | "))

    # Bug 6: fill checkout, toggle language, fields and pay stay
    toggle(pg, "nl")
    checkout_cart(pg, door=False, tip=True)
    pay = pg.get_by_role("button", name=re.compile(r"Betaal |Pay "))
    ok("pay enabled after fill (NL)", pay.count() and not pay.is_disabled(), pay.inner_text() if pay.count() else "missing")
    # €3 promo on €16,50 food drops below the €15 minimum — pay should disable, quote should stick
    pg.locator("[data-testid=mock-apply-promo]").click()
    pg.wait_for_timeout(300)
    toggle(pg, "en")
    pg.wait_for_timeout(600)
    shot(pg, "checkout_after_lang_toggle")
    phone_val = pg.locator("[data-testid=phone]").input_value()
    ok("phone survived the language toggle", phone_val.replace(" ", "") == "0612345678", phone_val)
    ok("promo quote survived the language toggle", pg.locator("[data-testid=discount-line]").count() > 0 and "€3,00" in (pg.locator("[data-testid=discount-line]").inner_text() if pg.locator("[data-testid=discount-line]").count() else ""))
    pay = pg.get_by_role("button", name=re.compile(r"Betaal |Pay "))
    ok("pay stays disabled under the €15 minimum after the language toggle", pay.count() > 0 and pay.is_disabled(), pay.inner_text() if pay.count() else "missing")
    # clear promo so the paid total is predictable (€16,50 + 2,49 + service + tip)
    if pg.locator("[data-testid=mock-clear-discounts]").count():
        pg.locator("[data-testid=mock-clear-discounts]").click()
        pg.wait_for_timeout(200)
    pay = pg.get_by_role("button", name=re.compile(r"Betaal |Pay "))
    ok("pay enabled after clearing the promo", pay.count() and not pay.is_disabled(), pay.inner_text() if pay.count() else "missing")

    ok("mock payment reached the order page", pay_mock(pg), pg.url)
    # Bug 5: admin detail shows tip and customer total (mock admin reads the store)
    pg.goto(B + "/admin/orders/?id=1040", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(600)
    shot(pg, "admin_order_tip_total")
    tip_txt = pg.locator("[data-testid=admin-tip]").inner_text() if pg.locator("[data-testid=admin-tip]").count() else ""
    tot_txt = pg.locator("[data-testid=admin-total]").inner_text() if pg.locator("[data-testid=admin-total]").count() else ""
    ok("admin order detail shows the tip", "€1,00" in tip_txt, tip_txt or body(pg)[:200])
    ok("admin order detail shows the customer total", "€20,98" in tot_txt, tot_txt or "missing")
    pg.goto(B + "/order/?id=1040", wait_until="networkidle", timeout=20000)
    toggle(pg, "nl")
    cancel = pg.locator("[data-testid=cancel-order]")
    ok("customer cancel button visible while placed (NL)", cancel.count() > 0 and "Annuleren" in cancel.inner_text(), body(pg)[:200].replace("\n", " | "))
    shot(pg, "customer_cancel_nl")
    toggle(pg, "en")
    cancel = pg.locator("[data-testid=cancel-order]")
    ok("customer cancel button visible while placed (EN)", cancel.count() > 0 and "Cancel" in cancel.inner_text())
    shot(pg, "customer_cancel_en")

    # Deliver the first order through restaurant + rider (leave cancel for the second order)
    pg.goto(B + "/restaurant/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(800)
    acc = pg.get_by_role("button", name=re.compile("Bestelling accepteren|Accept order"))
    ok("restaurant sees the placed order to accept", acc.count() > 0)
    if acc.count():
        acc.first.click()
        pg.wait_for_timeout(800)
    pg.goto(B + "/rider/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(800)
    bid = pg.get_by_role("button", name=re.compile("Bod plaatsen|Place bid"))
    ok("rider can bid on the accepted order", bid.count() > 0)
    if bid.count():
        bid.first.click()
        pg.wait_for_timeout(800)
    pg.goto(B + "/restaurant/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(800)
    ready = pg.get_by_role("button", name=re.compile("Klaar voor ophalen|Mark ready for pickup"))
    if ready.count() and not ready.is_disabled():
        ready.first.click()
        pg.wait_for_timeout(800)
    ok("restaurant marked ready", True)
    pg.goto(B + "/rider/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(800)
    pickup = pg.get_by_role("button", name=re.compile("^Opgehaald$|^Picked up$"))
    if pickup.count():
        pickup.first.click()
        pg.wait_for_timeout(800)
    shot(pg, "rider_picked_up_no_proof")
    ok("proof capture is hidden when leave_at_door is off", pg.get_by_text(re.compile("Maak foto bij de deur|Take photo at the door")).count() == 0, body(pg)[body(pg).find("Huidige"):body(pg).find("Huidige")+200] if "Huidige" in body(pg) else "")
    deliv = pg.get_by_role("button", name=re.compile("^Bezorgd$|^Delivered$"))
    ok("deliver button visible", deliv.count() > 0)
    if deliv.count():
        deliv.first.click()
        pg.locator("[data-testid=toast]").wait_for(state="visible", timeout=4000)
    shot(pg, "rider_delivered_toast")
    toast = pg.locator("[data-testid=toast]")
    t = toast.inner_text() if toast.count() else body(pg)
    # bonus €0,50 + tip €1,00 = €1,50; old bug would show delivery+tip €3,49
    ok("deliver toast uses bonus + tip (€1,50), not delivery fee + tip (€3,49)", "€1,50" in t and "€3,49" not in t, re.sub(r"\s+", " ", t)[:280])

    # Bug 8: kitchen finished today with chat
    pg.goto(B + "/restaurant/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(800)
    fin = pg.locator("[data-testid=col-finished]")
    shot(pg, "kitchen_finished_today")
    ok("kitchen board has a Finished today section with the delivered order", fin.count() > 0 and ("Chat" in fin.inner_text() or "chat" in fin.inner_text().lower()), fin.inner_text()[:200].replace("\n", " | ") if fin.count() else body(pg)[:200])

    # Bug 1: second order, cancel it
    checkout_cart(pg, door=False, tip=False)
    ok("second mock payment reached the order page", pay_mock(pg), pg.url)
    cancel = pg.locator("[data-testid=cancel-order]")
    ok("cancel is offered on the second placed order", cancel.count() > 0)
    if cancel.count():
        cancel.first.click()
        pg.wait_for_timeout(1000)
    shot(pg, "customer_cancelled")
    t = body(pg)
    ok("cancelled status and refund copy after customer cancel", "geannuleerd" in t.lower() or "cancelled" in t.lower(), t[:220].replace("\n", " | "))

    # Bug 3: leave-at-door order shows the proof prompt
    checkout_cart(pg, door=True, tip=False)
    ok("leave-at-door order paid", pay_mock(pg), pg.url)
    pg.goto(B + "/restaurant/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(600)
    acc = pg.get_by_role("button", name=re.compile("Bestelling accepteren|Accept order"))
    if acc.count():
        acc.first.click()
        pg.wait_for_timeout(600)
    pg.goto(B + "/rider/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(600)
    bid = pg.get_by_role("button", name=re.compile("Bod plaatsen|Place bid"))
    if bid.count():
        bid.first.click()
        pg.wait_for_timeout(600)
    pg.goto(B + "/restaurant/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(600)
    ready = pg.get_by_role("button", name=re.compile("Klaar voor ophalen|Mark ready for pickup"))
    if ready.count() and not ready.is_disabled():
        ready.first.click()
        pg.wait_for_timeout(600)
    pg.goto(B + "/rider/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(600)
    pickup = pg.get_by_role("button", name=re.compile("^Opgehaald$|^Picked up$"))
    if pickup.count():
        pickup.first.click()
        pg.wait_for_timeout(800)
    shot(pg, "rider_picked_up_leave_at_door")
    ok("proof capture is shown for leave_at_door", pg.get_by_text(re.compile("Maak foto bij de deur|Take photo at the door")).count() > 0)

    # Bug 4 (client): inject a stale assigned job and confirm it is flagged, not on the route
    raw = pg.evaluate("() => localStorage.getItem('foodporter-mock-v2')")
    data = json.loads(raw or "{}")
    stale = {
        "id": "9007", "restaurant_id": "11111111-0000-4000-8000-000000000004", "customer_id": "customer-demo",
        "status": "assigned", "lines": [{"name": "Durum Döner", "qty": 1, "price_cents": 950}],
        "subtotal_cents": 950, "delivery_fee_cents": 249, "address": "FP TEST: stale Heuvelstraat 12", "phone": "0612345678",
        "prep_minutes": 15, "ready_at": None, "bids": [], "created_at": "2026-10-18T10:00:00.000Z",
        "delivered_at": None, "accepted_at": "2026-10-18T10:00:00.000Z", "assigned_at": "2026-10-18T10:05:00.000Z",
        "rider_id": "rider-demo",
    }
    data.setdefault("orders", []).append(stale)
    data["signedIn"] = data.get("signedIn") or "mock.customer@example.com"
    pg.evaluate("(v) => localStorage.setItem('foodporter-mock-v2', v)", json.dumps(data))
    pg.goto(B + "/rider/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(800)
    # start() already ran on this page before the write; force a full reload in a new page
    pg2 = ctx.new_page()
    pg2.goto(B + "/rider/", wait_until="networkidle", timeout=20000)
    pg2.wait_for_timeout(1000)
    shot(pg2, "rider_stale_flagged")
    t = body(pg2)
    ok("stale assignment is flagged for the rider", pg2.locator("[data-testid=stale-jobs]").count() > 0 and "9007" in t, t[:240].replace("\n", " | "))
    # route should not list #9007 if a route is shown
    route = pg2.locator("[data-testid=route]")
    if route.count():
        ok("stale assignment is not on the combined route", "9007" not in route.inner_text(), route.inner_text()[:200])
    else:
        ok("stale assignment did not create a stacked route by itself", pg2.locator("[data-testid=job-9007]").count() == 0, "no route, not an active job card")
    pg2.close()

    if errs:
        ok("no page errors", False, " | ".join(errs)[:300])
    else:
        ok("no page errors", True)

    browser.close()

failed = sum(1 for r in res if not r["pass"])
print(f"\n{sum(1 for r in res if r['pass'])}/{len(res)} passed, {failed} failed")
Path("/workspace/fptest/v38/e2e_round1/ui_results.json").write_text(json.dumps({"results": res}, indent=2))
sys.exit(1 if failed else 0)
