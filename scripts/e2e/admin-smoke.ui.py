import re, sys
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://app.foodporter.nl"
mobile = "--mobile" in sys.argv
errs = []; res = []
def ok(n, c, x=""): res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True) if mobile else b.new_context(viewport={"width": 1280, "height": 900})
    pg = c.new_page()
    pg.on("console", lambda m: m.type == "error" and errs.append(("console", pg.url, m.text[:300])))
    pg.on("pageerror", lambda e: errs.append(("pageerror", pg.url, str(e)[:300])))
    pg.on("response", lambda r: r.status >= 400 and errs.append(("http", r.status, r.url[:160])))
    pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
    pg.fill("input[type=email]", creds["ADMIN_EMAIL"]); pg.fill("input[type=password]", creds["ADMIN_PASSWORD"])
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
    pg.goto(B + "/admin/"); pg.wait_for_timeout(5000)
    links = pg.eval_on_selector_all("a[href*='/admin']", "as=>[...new Set(as.map(a=>a.getAttribute('href')))]")
    print("admin links:", links)
    links = [h for h in links if "orders/?id=" not in h] + [h for h in links if "orders/?id=" in h][:3]
    for h in links:
        n0 = len(errs); pg.goto(h if h.startswith("http") else "https://bazsozsolt.github.io" + h if B.startswith("https") else B.split("/foodporter-app")[0] + h); pg.wait_for_timeout(3500)
        body = pg.inner_text("body")
        ok(f"{h} renders", "Application error" not in body and "Er ging iets mis" not in body and len(body) > 80, str(errs[n0:])[:300])
    for t in ["key", "delivery", "quality", "safety", "groups", "support"]:
        n0 = len(errs); pg.goto(B + f"/admin/reports/?tab={t}"); pg.wait_for_timeout(3500)
        cb = pg.locator("label:has-text('only') input[type=checkbox]")
        if cb.count(): cb.first.check(); pg.wait_for_timeout(2500)
        body = pg.inner_text("body"); ok(f"reports {t} renders (incl. real-only)", "Er ging iets mis" not in body and "Something went wrong" not in body, str(errs[n0:])[:300])
    real = [e for e in errs if not (e[0] == "http" and "favicon" in str(e))]
    ok("no console/page/http errors", not real, "\n".join(map(str, real))[:2000])
    b.close()
print(f"{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
