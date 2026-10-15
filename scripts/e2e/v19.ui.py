# v19 employment UI: rider shifts/clock-in copy, availability, weekly indicative pay, admin payroll + WML settings, rider info. Saves screenshots.
import re, sys, os
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://bazsozsolt.github.io/foodporter-app"
OUT = "/workspace/foodporter/screens_v19"; os.makedirs(OUT, exist_ok=True)
res = []
def ok(n, c, x=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
def run(acct, view, lang, steps):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport=view)
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
        pg.evaluate(f"localStorage.setItem('fp-lang','{lang}')")
        pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
        steps(pg); b.close()
M, D = {"width": 390, "height": 844}, {"width": 1280, "height": 900}
def rider_nl(pg):
    pg.goto(B + "/rider/"); pg.wait_for_selector("[data-testid=rider-shifts]", timeout=20000); pg.wait_for_timeout(1500)
    t = pg.inner_text("main")
    ok("rider: clock-in copy", "klokken" in t, t[:80])
    ok("rider: no freelance copy", not re.search(r"volledige vergoeding|verdien wat je wilt|eigen baas", t, re.I))
    ok("rider: worked today shown", pg.locator("[data-testid=worked-today]").count() == 1)
    pg.fill("[data-testid=slot-from]", "17:00"); pg.fill("[data-testid=slot-to]", "21:00")
    d = pg.input_value("[data-testid=slot-date]")
    import datetime; pg.fill("[data-testid=slot-date]", (datetime.date.today() + datetime.timedelta(days=1)).isoformat())
    pg.click("[data-testid=slot-add]"); pg.wait_for_timeout(2500)
    ok("rider: availability block added", pg.locator("[data-testid=slot-list] li").count() >= 1)
    pg.screenshot(path=f"{OUT}/rider-shifts-nl.png", full_page=True)
    for _ in range(pg.locator("[data-testid=slot-list] li button").count()):
        pg.locator("[data-testid=slot-list] li button").first.click(); pg.wait_for_timeout(1500)
    ok("rider: block removed", pg.locator("[data-testid=slot-list] li").count() == 0)
    pg.goto(B + "/rider/earnings/"); pg.wait_for_selector("[data-testid=week-pay]", timeout=20000); pg.wait_for_timeout(800)
    t = pg.inner_text("[data-testid=week-pay]")
    ok("earnings: indicative weekly summary", "Indicatief, loonadministratie via payroll" in t and "Vakantiegeld (8%)" in t and "Bezorgbonus" in t, t[:120])
    pg.screenshot(path=f"{OUT}/rider-weekpay-nl.png", full_page=True)
def rider_en(pg):
    pg.goto(B + "/rider/earnings/"); pg.wait_for_selector("[data-testid=week-pay]", timeout=20000); pg.wait_for_timeout(800)
    ok("earnings EN", "Holiday pay (8%)" in pg.inner_text("[data-testid=week-pay]"))
    pg.screenshot(path=f"{OUT}/rider-weekpay-en.png", full_page=True)
    pg.goto(B + "/rider-info/"); pg.wait_for_timeout(1500)
    t = pg.inner_text("main"); ok("rider info EN: employment + ATW", "direct employment" in t and "4.5 hours" in t and "not a price" in t)
    pg.screenshot(path=f"{OUT}/rider-info-en.png", full_page=True)
def admin(pg):
    pg.goto(B + "/admin/payroll/"); pg.wait_for_selector("text=Hours & payroll", timeout=20000); pg.wait_for_timeout(2500)
    ok("admin payroll page", pg.get_by_role("button", name="⬇ Payroll CSV").count() == 1)
    with pg.expect_download() as dl: pg.get_by_role("button", name="⬇ Payroll CSV").click()
    head = open(dl.value.path()).read().split("\n")[0]
    ok("payroll CSV columns", "wml_rate_eur" in head and "holiday_pay_eur" in head and "bsn" not in head.lower(), head[:120])
    pg.screenshot(path=f"{OUT}/admin-payroll.png", full_page=True)
    pg.goto(B + "/admin/settings/"); pg.wait_for_selector("[data-testid=wml-table]", timeout=20000); pg.wait_for_timeout(1500)
    ok("admin WML table", pg.input_value("[data-testid=wml-21]") == "14.99" and pg.input_value("[data-testid=wml-16]") == "7.50")
    pg.screenshot(path=f"{OUT}/admin-settings-wml.png", full_page=True)
    pg.goto(B + "/admin/legal/"); pg.wait_for_selector("[data-testid=tpl-row]", timeout=20000); pg.wait_for_timeout(1500)
    pg.screenshot(path=f"{OUT}/admin-legal.png", full_page=True)
run("SIMR3", M, "nl", rider_nl); run("SIMR3", M, "en", rider_en); run("ADMIN", D, "en", admin)
print(f"\n{sum(res)} passed, {len(res)-sum(res)} failed"); sys.exit(0 if all(res) else 1)
