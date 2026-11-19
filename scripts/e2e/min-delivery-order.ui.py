# Local UI check for the €15 delivery minimum (NL/EN). Serves the static export in mock mode.
# One browser. Prints no secrets.
import re, sys
from playwright.sync_api import sync_playwright

B = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4360"
# Korvel Kebab example menu: Ayran is €2,50, below the €15 delivery minimum.
REST = "/r/11111111-0000-4000-8000-000000000004/"
res = []

def ok(n, c, x=""):
    res.append(c)
    print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))

def body(pg):
    return pg.inner_text("body")

def toggle(pg, lang):
    box = pg.locator("[data-testid=lang-toggle]")
    box.wait_for(timeout=10000)
    box.locator("button", has_text=re.compile(f"^{lang}$", re.I)).click()
    pg.wait_for_timeout(400)

with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={"width": 390, "height": 844})
    pg = c.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(B + REST, wait_until="networkidle", timeout=30000)
    pg.wait_for_timeout(600)
    # Ayran: add one via "Add one" / "Eén meer" on that row
    row = pg.get_by_text("Ayran", exact=True).first
    ok("example kebab menu loads with Ayran", row.count() > 0, pg.url)
    row.locator("xpath=ancestor::*[.//button][1]").get_by_role("button", name=re.compile("Eén meer|Add one")).click()
    pg.wait_for_timeout(400)
    pg.goto(B + "/cart/", wait_until="networkidle", timeout=20000)
    pg.wait_for_timeout(600)
    toggle(pg, "nl")
    txt = body(pg)
    warn = pg.locator("[data-testid=min-delivery-order-warning]")
    ok("cart shows the NL delivery-minimum warning", warn.count() >= 1 and "€15,00" in warn.inner_text() and "€12,50" in warn.inner_text() and "afhalen" in warn.inner_text().lower(), warn.inner_text() if warn.count() else txt[:300])
    ok("cart checkout link stays enabled so pickup remains possible", pg.locator("[data-testid=go-checkout]").count() == 1)
    toggle(pg, "en")
    warn = pg.locator("[data-testid=min-delivery-order-warning]")
    ok("cart shows the EN delivery-minimum warning", warn.count() >= 1 and "€15,00" in warn.inner_text() and "€12,50" in warn.inner_text() and "Pickup" in warn.inner_text() and "food subtotal" in warn.inner_text(), warn.inner_text() if warn.count() else "")
    pg.locator("[data-testid=go-checkout]").click()
    pg.wait_for_url("**/checkout/**", timeout=15000)
    pg.wait_for_timeout(600)
    toggle(pg, "nl")
    if pg.locator("[data-testid=choose-delivery]").count():
        pg.locator("[data-testid=choose-delivery]").click()
        pg.wait_for_timeout(300)
    warn = pg.locator("[data-testid=min-delivery-order-warning]")
    pay = pg.get_by_role("button", name=re.compile("Log in om te betalen|Sign in to pay|Betaal |Pay "))
    ok("checkout delivery shows the NL warning and disables pay", warn.count() >= 1 and "€15,00" in warn.inner_text() and "afhalen" in warn.inner_text().lower() and pay.is_disabled(), f"warn={warn.inner_text() if warn.count() else ''} disabled={pay.is_disabled() if pay.count() else 'missing'}")
    pg.locator("[data-testid=choose-pickup]").click()
    pg.wait_for_timeout(400)
    toggle(pg, "nl")
    ok("checkout pickup hides the platform warning and enables pay", pg.locator("[data-testid=min-delivery-order-warning]").count() == 0 and not pay.is_disabled(), f"warns={pg.locator('[data-testid=min-delivery-order-warning]').count()} disabled={pay.is_disabled() if pay.count() else 'missing'}")
    pg.locator("[data-testid=choose-delivery]").click()
    pg.wait_for_timeout(300)
    toggle(pg, "en")
    warn = pg.locator("[data-testid=min-delivery-order-warning]")
    ok("checkout delivery EN warning and pay still disabled", warn.count() >= 1 and "Pickup is not subject" in warn.inner_text() and pay.is_disabled(), warn.inner_text() if warn.count() else "")
    ok("no page errors", not errs, str(errs))
    b.close()

failed = sum(1 for x in res if not x)
print(f"{sum(1 for x in res if x)}/{len(res)} passed, {failed} failed")
sys.exit(1 if failed else 0)
