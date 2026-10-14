# Stale-deploy regression: open the admin on build A, deploy build B with A's chunks gone, then navigate.
import re, os, sys
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open(__import__("os").environ.get("FP_TEST_CREDS","/workspace/fptest/.creds")).read().strip().split("\n"))
B = "http://localhost:8787/foodporter-app"; NEW = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True).new_page()
    logs = []; pg.on("console", lambda m: logs.append(m.text[:160]))
    pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
    pg.fill("input[type=email]", creds["ADMIN_EMAIL"]); pg.fill("input[type=password]", creds["ADMIN_PASSWORD"])
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
    pg.goto(B + "/admin/"); pg.wait_for_timeout(4000)
    v0 = pg.evaluate("fetch('/foodporter-app/version.json',{cache:'no-store'}).then(r=>r.json())")
    os.remove("/tmp/srv/foodporter-app"); os.symlink(NEW, "/tmp/srv/foodporter-app")   # "deploy" B
    pg.click("a[href*='/admin/reports']"); pg.wait_for_timeout(6000)
    body = pg.inner_text("body")
    print("before", v0, "after", pg.evaluate("fetch('/foodporter-app/version.json',{cache:'no-store'}).then(r=>r.json())"))
    print("reports OK:", "Key metric" in body and "Er ging iets mis" not in body, "| url", pg.url)
    print("\n".join(l for l in logs if "reload" in l or "chunk" in l.lower() or "error" in l.lower())[:800])
