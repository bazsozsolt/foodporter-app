# v22 redesign UI checks: cart sheet, tab-bar overlap, header, rider Diensten tab, restaurant KPI line, admin order search, 44px targets.
import re, sys
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://bazsozsolt.github.io/foodporter-app"
RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db"; P = F = 0; small = []
def ok(n, c, d=""):
    global P, F
    if c: P += 1; print("PASS", n)
    else: F += 1; print("FAIL", n, d)
TARGETS = "button:visible, a[href]:visible, [role=tab]:visible, input[type=checkbox]:visible"
def targets(pg, where):
    for b in pg.locator("header button:visible, main button:visible, nav button:visible, nav a:visible, [role=dialog] button:visible, [role=dialog] a:visible").all():
        bb = b.bounding_box()
        if bb and bb["height"] < 43.5 and bb["width"] > 0: small.append(f"{where}: {(b.get_attribute('aria-label') or b.inner_text()).strip()[:30]!r} {bb['width']:.0f}x{bb['height']:.0f}")
with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(acct, lang="nl"):
        c = b.new_context(viewport={"width": 390, "height": 844}); pg = c.new_page()
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle"); pg.evaluate(f"localStorage.setItem('fp-lang','{lang}')"); pg.reload()
        pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
        return c, pg
    for lang in ["nl", "en"]:
        c, pg = ctx("SIMC1", lang)
        pg.goto(B + f"/r/?id={RID}"); pg.wait_for_selector("button[aria-label='%s']" % ("Eén meer" if lang == "nl" else "Add one"), timeout=20000); pg.wait_for_timeout(800)
        hdr = pg.locator("header").first.evaluate("e => getComputedStyle(e).backgroundColor")
        ok(f"{lang} header is white", hdr in ("rgb(255, 255, 255)",), hdr)
        ok(f"{lang} red wordmark loaded", pg.locator("img[src*='wordmark-red']").evaluate("i => i.complete && i.naturalWidth > 0"))
        targets(pg, f"menu-{lang}")
        pg.locator("button[aria-label='%s']" % ("Eén meer" if lang == "nl" else "Add one")).first.click(); pg.wait_for_timeout(500)
        vc = pg.locator("[data-testid=view-cart]"); vc.scroll_into_view_if_needed(); pg.mouse.wheel(0, 3000); pg.wait_for_timeout(400)
        nav = pg.locator("nav").last.bounding_box(); vb = vc.bounding_box()
        ok(f"{lang} cart bar does not overlap tab bar", vb and nav and vb["y"] + vb["height"] <= nav["y"] + 1, f"{vb} {nav}")
        vc.click(); pg.wait_for_selector("[data-testid=cart-sheet]", timeout=5000)
        sh = pg.locator("[data-testid=cart-sheet]")
        ok(f"{lang} sheet opens as dialog", sh.get_attribute("role") == "dialog" and sh.get_attribute("aria-modal") == "true")
        sb = sh.bounding_box(); ok(f"{lang} sheet fully on screen", sb["y"] >= 0 and sb["y"] + sb["height"] <= 844 + 1, str(sb))
        gc = pg.locator("[data-testid=go-checkout]"); gb = gc.bounding_box()
        ok(f"{lang} checkout button clickable (not under tab bar)", pg.evaluate("([x,y]) => !!document.elementFromPoint(x,y)?.closest('[data-testid=go-checkout]')", [gb["x"] + gb["width"]/2, gb["y"] + gb["height"]/2]))
        targets(pg, f"sheet-{lang}")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300); ok(f"{lang} Esc closes sheet", pg.locator("[data-testid=cart-sheet]").count() == 0)
        vc.click(); pg.wait_for_timeout(300); pg.mouse.click(195, 40); pg.wait_for_timeout(300); ok(f"{lang} backdrop tap closes sheet", pg.locator("[data-testid=cart-sheet]").count() == 0)
        vc.click(); pg.locator("[data-testid=cart-sheet] button[aria-label='%s']" % ("Item verwijderen" if lang == "nl" else "Remove item")).first.click(); pg.wait_for_timeout(500)
        ok(f"{lang} removing last item closes sheet + bar", pg.locator("[data-testid=cart-sheet]").count() == 0 and pg.locator("[data-testid=view-cart]").count() == 0)
        pg.locator("button[aria-label='%s']" % ("Eén meer" if lang == "nl" else "Add one")).first.click(); pg.wait_for_timeout(300)
        pg.locator("[data-testid=view-cart]").click(); pg.locator("[data-testid=go-checkout]").click(); pg.wait_for_timeout(2500)
        ok(f"{lang} sheet → checkout", "/checkout" in pg.url and pg.locator("[data-testid=total]").count() == 1, pg.url)
        pg.goto(B + "/cart/")
        try: pg.wait_for_selector("[data-testid=go-checkout]", timeout=15000); fb = True
        except Exception: fb = False
        ok(f"{lang} /cart fallback still works", fb, pg.inner_text("main")[:120])
        targets(pg, f"cart-{lang}")
        pg.evaluate("localStorage.removeItem('fp-cart')"); c.close()
    c, pg = ctx("SIMR1")
    pg.goto(B + "/rider/"); pg.wait_for_selector("[data-testid=online-toggle]", timeout=20000); pg.wait_for_timeout(1500)
    ok("rider main: compact shifts line, no full shifts block", pg.locator("[data-testid=rider-shifts-mini]").count() == 1 and pg.locator("[data-testid=rider-shifts]").count() == 0)
    ok("rider main: no availability inputs", pg.locator("[data-testid=slot-add]").count() == 0)
    targets(pg, "rider")
    pg.get_by_role("link", name=re.compile("^Diensten$")).last.click(); pg.wait_for_timeout(2500)
    ok("Diensten tab opens /rider/shifts", "/rider/shifts" in pg.url and pg.locator("[data-testid=rider-shifts]").count() == 1, pg.url)
    ok("Diensten tab is marked current", pg.locator("nav a[aria-current=page]").inner_text().strip().startswith("Diensten"))
    targets(pg, "shifts")
    pg.goto(B + "/rider/"); pg.wait_for_timeout(1500); pg.locator("[data-testid=rider-shifts-mini]").click(); pg.wait_for_timeout(2000)
    ok("compact line links to shifts", "/rider/shifts" in pg.url)
    c.close()
    c, pg = ctx("STAFF")
    pg.goto(B + "/restaurant/"); pg.wait_for_selector("[data-testid=kpi-line]", timeout=20000)
    ok("restaurant KPI line", re.search(r"overgedragen.*omzet.*commissie", pg.inner_text("[data-testid=kpi-line]")) is not None)
    targets(pg, "restaurant"); c.close()
    c, pg = ctx("ADMIN", "en")
    pg.goto(B + "/admin/orders/"); pg.wait_for_selector("[data-testid=order-search]", timeout=20000); pg.wait_for_timeout(2500)
    pg.locator("[data-testid=include-test]").check() if not pg.locator("[data-testid=include-test]").is_checked() else None
    pg.wait_for_timeout(2000)
    ids = [int(x) for x in re.findall(r"#(\d+)", pg.locator("table").inner_text()) if int(x) not in (1043, 1046)]
    old = min(ids) if ids else 1500
    pg.fill("input[type=date] >> nth=0", "2026-10-15"); pg.fill("input[type=date] >> nth=1", "2026-10-16"); pg.wait_for_timeout(1500)
    pg.fill("[data-testid=order-search]", "1600"); pg.wait_for_timeout(2500)
    t = pg.locator("table").inner_text()
    ok("admin search finds an order outside the date range", "#1600" in t, t[:120])
    ok("admin UI English", "Find order #" in pg.inner_text("main"))
    c.close(); b.close()
print("\n".join(sorted(set(small))) or "all checked targets >= 44px")
print(f"\n{P} passed, {F} failed"); sys.exit(1 if F else 0)
