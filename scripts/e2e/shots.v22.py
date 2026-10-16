# v22 design screenshots: every main screen per role, mobile 390x844, NL. Usage: python3 shots.v22.py <base> <outdir>
import re, sys, os
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B, OUT = sys.argv[1], sys.argv[2]; os.makedirs(OUT, exist_ok=True)
RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db"
def shot(pg, name, full=False): pg.wait_for_timeout(2200); pg.screenshot(path=f"{OUT}/{name}.png", full_page=full); print("shot", name)
with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(acct=None):
        c = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2); pg = c.new_page()
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle"); pg.evaluate("localStorage.setItem('fp-lang','nl')")
        if acct:
            pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
            pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
        return c, pg
    c, pg = ctx()
    pg.goto(B + "/"); shot(pg, "c1-home"); shot(pg, "c1-home-full", True)
    pg.goto(B + "/login/"); shot(pg, "c0-login")
    c.close()
    c, pg = ctx("SIMC1")
    pg.goto(B + "/"); shot(pg, "c1-home-signedin")
    pg.goto(B + f"/r/?id={RID}"); shot(pg, "c2-menu")
    pg.get_by_role("button", name="Eén meer").first.click(); pg.wait_for_timeout(600); shot(pg, "c2-menu-added")
    pg.goto(B + "/cart/"); shot(pg, "c3-cart")
    pg.goto(B + "/checkout/"); shot(pg, "c4-checkout"); shot(pg, "c4-checkout-full", True)
    pg.goto(B + "/my-orders/"); shot(pg, "c5-orders")
    first = pg.locator("a[href*='/order/']").first
    if first.count(): first.click(); shot(pg, "c6-tracking")
    pg.goto(B + "/support/"); shot(pg, "c7-support")
    pg.goto(B + "/cart/"); pg.evaluate("localStorage.removeItem('fp-cart')"); c.close()
    c, pg = ctx("SIMR1")
    pg.goto(B + "/rider/"); shot(pg, "r1-rider"); shot(pg, "r1-rider-full", True)
    pg.goto(B + "/rider/earnings/"); shot(pg, "r2-earnings")
    c.close()
    c, pg = ctx("STAFF")
    pg.goto(B + "/restaurant/"); shot(pg, "s1-restaurant"); shot(pg, "s1-restaurant-full", True)
    c.close()
    c, pg = ctx("ADMIN")
    for path, n in [("/admin/", "a1-dashboard"), ("/admin/orders/", "a2-orders"), ("/admin/payroll/", "a3-payroll")]:
        pg.goto(B + path); shot(pg, n)
    c.close(); b.close()
