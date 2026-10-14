import re, subprocess
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = "http://localhost:8787/foodporter-app"; S = "/workspace/foodporter/screens/v10_"; APP="/workspace/foodporter-app"
res = []
def ok(n, c, x=""): res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
def login(pg, role):
    pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
    pg.fill("input[type=email]", creds[role+"_EMAIL"]); pg.fill("input[type=password]", creds[role+"_PASSWORD"])
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
SPY = """if(window.Notification){Object.defineProperty(Notification,"permission",{configurable:true,get:()=>window.__perm||localStorage.getItem("__perm")||"default"});Notification.requestPermission=async()=>{localStorage.setItem("__perm","granted");return "granted"};}
window.__shown=[]; const hook=()=>{ if(window.ServiceWorkerRegistration){const o=ServiceWorkerRegistration.prototype.showNotification; ServiceWorkerRegistration.prototype.showNotification=function(t,op){window.__shown.push({t,body:op&&op.body,url:op&&op.data&&op.data.url,ri:op&&op.requireInteraction}); return o.call(this,t,op);};}}; hook();
window.__hide=()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.hasFocus=()=>false;document.dispatchEvent(new Event('visibilitychange'));};"""
with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    c.add_init_script(SPY); c.grant_permissions(["notifications"], origin="http://localhost:8787")
    pg = c.new_page(); login(pg, "RIDER"); pg.goto(B + "/rider/"); pg.wait_for_timeout(4000)
    t = pg.locator("[data-testid=alerts-toggle]")
    if t.get_attribute("aria-pressed") != "true": t.click(); pg.wait_for_timeout(500)
    ok("Dutch permission prompt shown", pg.locator("[data-testid=notify-prompt]").count() == 1, pg.locator("[data-testid=notify-prompt]").inner_text()[:90] if pg.locator("[data-testid=notify-prompt]").count() else "")
    pg.locator("[data-testid=notify-prompt]").scroll_into_view_if_needed(); pg.screenshot(path=S+"rider_notify_prompt.png")
    pg.click("[data-testid=notify-allow]"); pg.wait_for_timeout(800)
    ok("granted state shown", pg.locator("[data-testid=notify-granted]").count() == 1)
    pg.screenshot(path=S+"rider_notify_granted.png")
    ok("service worker active", pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))"))
    pg.evaluate("window.__hide()")
    oid = subprocess.run(["node", "scripts/sim/one-order.mjs"], cwd=APP, capture_output=True, text=True).stdout.strip().split("\n")[-1]
    ok("test order created", oid.isdigit(), oid)
    for _ in range(40):
        if pg.evaluate("window.__shown.length") > 0: break
        pg.wait_for_timeout(1000)
    s = pg.evaluate("window.__shown[0]"); ok("background bid notification via service worker", "Nieuwe bestelling" in s["t"] and s["url"].endswith("/rider/") and s["ri"], str(s))
    ok("tab title flags the new order", "Nieuw!" in pg.title(), pg.title())
    ok("beep counted", pg.evaluate("window.__fpAlerts") >= 1)
    subprocess.run(["node", "scripts/sim/one-order.mjs", "cancel", oid], cwd=APP)
    # unsupported browser: no Notification API → graceful message, sound still works
    c2 = b.new_context(viewport={"width": 390, "height": 844}); c2.add_init_script("delete window.Notification;")
    q = c2.new_page(); login(q, "RIDER"); q.goto(B + "/rider/"); q.wait_for_timeout(3500)
    if q.locator("[data-testid=alerts-toggle]").get_attribute("aria-pressed") != "true": q.click("[data-testid=alerts-toggle]"); q.wait_for_timeout(500)
    n = q.locator("[data-testid=notify-unsupported], [data-testid=notify-install]")
    ok("unsupported browser: graceful Dutch fallback", n.count() == 1, n.inner_text() if n.count() else "")
    q.screenshot(path=S+"rider_notify_unsupported.png")
    b.close()
print(f"{sum(res)}/{len(res)} passed")
