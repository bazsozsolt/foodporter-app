# Mobile screenshots of every page per role. Usage: python3 screens.ui.py <base> <prefix>  -> /workspace/foodporter/screens/<prefix>_<role>_<page>.png
import re, sys, os, subprocess
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B, P = sys.argv[1], sys.argv[2]; OUT = "/workspace/foodporter/screens"
NODE = lambda js: subprocess.run(["node","--input-type=module","-e","import * as m from '/workspace/foodporter-app/scripts/e2e/common.mjs';"+js+";process.exit(0)"],capture_output=True,text=True,cwd="/workspace/foodporter-app/scripts/e2e").stdout.strip().split("\n")[-1]
RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db"
oid = NODE("const a=await m.login('ADMIN'), c=await m.login('SIMC1'); const {data}=await a.sb.from('orders').select('id').eq('customer_id',c.id).eq('status','delivered').order('id',{ascending:false}).limit(1).single(); console.log(data.id)")
PLAN = {"customer": ("SIMC1", [("home","/"),("menu",f"/r/?id={RID}"),("cart","/cart/"),("checkout","/checkout/"),("orders","/my-orders/"),("tracking",f"/order/?id={oid}"),("support","/support/"),("group","/group/"),("login","/login/"),("welcome","/welcome/")]),
        "rider": ("SIMR1", [("job","/rider/"),("earnings","/rider/earnings/")]),
        "restaurant": ("STAFF", [("board","/restaurant/")]),
        "admin": ("ADMIN", [("home","/admin/"),("orders","/admin/orders/"),("restaurants","/admin/restaurants/"),("riders","/admin/riders/"),("map","/admin/map/"),("reports","/admin/reports/"),("support","/admin/support/"),("payments","/admin/payments/"),("payouts","/admin/payouts/")])}
only = sys.argv[3].split(",") if len(sys.argv) > 3 else PLAN
with sync_playwright() as p:
    b = p.chromium.launch()
    for role in only:
        acct, pages = PLAN[role]
        c = b.new_context(viewport={"width": 1280, "height": 900}) if role == "admin" else b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=1)
        pg = c.new_page(); pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
        pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
        if role == "customer":   # put something in the cart for cart/checkout shots
            pg.goto(B + f"/r/?id={RID}"); pg.wait_for_timeout(3000)
            add = pg.locator("[data-testid^=add-]").first
            if add.count(): add.click(); pg.wait_for_timeout(500)
        for name, url in pages:
            pg.goto(B + url); pg.wait_for_timeout(3500)
            pg.screenshot(path=f"{OUT}/{P}_{role}_{name}.png", full_page=True); print("shot", role, name)
        c.close()
    b.close()
