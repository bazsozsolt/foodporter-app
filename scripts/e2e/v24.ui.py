# v24 UI: favourites, allergen filter on home, restaurant sold-out quick edit, admin today health. Saves screens_v24.
import re, sys, os
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://bazsozsolt.github.io/foodporter-app"
OUT = "/workspace/foodporter/screens_v24"; os.makedirs(OUT, exist_ok=True); P = F = 0
def ok(n, c, d=""):
    global P, F
    if c: P += 1; print("PASS", n)
    else: F += 1; print("FAIL", n, d)
def count(pg): return int(re.search(r"\d+", pg.inner_text("[data-testid=result-count]")).group(0))
with sync_playwright() as p:
    b = p.chromium.launch()
    def ctx(acct, lang="nl", w=390, h=844):
        c = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2); pg = c.new_page()
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle"); pg.evaluate(f"localStorage.setItem('fp-lang','{lang}'); localStorage.removeItem('fp-favs')"); pg.reload()
        pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
        return c, pg
    for lang in ["nl", "en"]:
        c, pg = ctx("SIMC1", lang)
        pg.goto(B + "/"); pg.wait_for_selector("[data-testid=fav-btn]", timeout=20000); pg.wait_for_timeout(1500)
        ok(f"{lang} no favourites chip before saving", pg.locator("[data-testid=fav-chip]").count() == 0)
        total = count(pg)
        pg.locator("[data-testid=fav-btn]").nth(1).click(); pg.wait_for_timeout(400)
        ok(f"{lang} heart toggles pressed", pg.locator("[data-testid=fav-btn]").nth(1).get_attribute("aria-pressed") == "true")
        ok(f"{lang} heart does not open the restaurant", pg.url.rstrip("/").endswith("foodporter-app") or pg.url.endswith("/"), pg.url)
        pg.click("[data-testid=fav-chip]"); pg.wait_for_timeout(400)
        ok(f"{lang} favourites chip filters to 1", count(pg) == 1, str(count(pg)))
        if lang == "nl": pg.screenshot(path=f"{OUT}/home-favourites-nl.png")
        pg.click("[data-testid=fav-chip]"); pg.wait_for_timeout(300)
        pg.select_option("[data-testid=home-allergen]", "gluten"); pg.wait_for_timeout(500)
        n = count(pg); ok(f"{lang} allergen filter narrows the list", 0 < n <= total, f"{n}/{total}")
        if lang == "nl": pg.screenshot(path=f"{OUT}/home-without-gluten-nl.png")
        pg.select_option("[data-testid=home-allergen]", ""); pg.wait_for_timeout(300); ok(f"{lang} filter reset", count(pg) == total)
        pg.goto(B + "/r/?id=187f751c-bebb-4a34-9d4b-9b1a9e8851db"); pg.wait_for_selector("[data-testid=fav-btn]", timeout=20000)
        fb = pg.locator("[data-testid=fav-btn]"); fb.click(); pg.wait_for_timeout(300); pg.goto(B + "/"); pg.wait_for_selector("[data-testid=fav-chip]", timeout=20000)
        ok(f"{lang} heart on menu page saves too (2 favourites)", "(2)" in pg.inner_text("[data-testid=fav-chip]"), pg.inner_text("[data-testid=fav-chip]"))
        pg.evaluate("localStorage.removeItem('fp-favs')"); c.close()
    c, pg = ctx("STAFF")
    pg.goto(B + "/restaurant/"); pg.wait_for_selector("[data-testid=rtab-menu]", timeout=20000); pg.click("[data-testid=rtab-menu]")
    pg.wait_for_selector("[data-testid=sold-out-row]", timeout=20000)
    row = pg.locator("[data-testid=sold-out-row]").first; name = row.locator("span.font-semibold").inner_text()
    row.locator("[data-testid=sold-out-btn]").click(); pg.wait_for_timeout(2500)
    row = pg.locator("[data-testid=sold-out-row]", has_text=name).first
    ok("staff: sold out shows until-time + 'Weer aan'", "Uitverkocht tot" in row.inner_text() and row.locator("[data-testid=back-on-btn]").count() == 1, row.inner_text())
    pg.locator("[data-testid=sold-out-panel]").scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/restaurant-sold-out-nl.png")
    row.locator("[data-testid=back-on-btn]").click(); pg.wait_for_timeout(2500)
    ok("staff: back on", pg.locator("[data-testid=sold-out-row]", has_text=name).first.locator("[data-testid=sold-out-btn]").count() == 1)
    c.close()
    c, pg = ctx("ADMIN", "en", 1280, 900)
    pg.goto(B + "/admin/"); pg.wait_for_selector("[data-testid=today-health]", timeout=20000); pg.wait_for_timeout(3000)
    t = pg.inner_text("[data-testid=today-health]")
    ok("admin today health KPIs", all(k in t for k in ["Late deliveries", "On time", "Cancelled", "Avg order"]) and "…" not in t, t[:160])
    pg.locator("[data-testid=today-health]").scroll_into_view_if_needed(); pg.mouse.wheel(0, -120); pg.wait_for_timeout(400); pg.screenshot(path=f"{OUT}/admin-today-health.png"); c.close(); b.close()
print(f"\n{P} passed, {F} failed"); sys.exit(1 if F else 0)
