# Click-everything crawler. For every role (anon, customer, rider, restaurant, admin, admin-as-other-roles), every page,
# mobile + desktop, NL + EN: click each visible button/link/tab/summary/toggle and flag
#   console errors, page errors, failed requests (>=400, excluding expected RLS probes), no-op clicks, dead links / 404s.
# Destructive actions (pay, deliver, cancel, delete, refund, sign out, SOS, call, send) are listed but not clicked.
# Usage: python3 crawl.ui.py [base] [--quick]   (quick = mobile NL + desktop EN only)
import re, sys, os, json, time, subprocess
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open(os.environ.get("FP_TEST_CREDS","/workspace/fptest/.creds")).read().strip().split("\n"))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
B = args[0] if args else os.environ.get("FP_BASE", "http://localhost:8787/foodporter-app")
ONLY = next((a.split("=",1)[1].split(",") for a in sys.argv if a.startswith("--role=")), None)
CHECKED = set()   # links already checked in this run
QUICK = "--quick" in sys.argv
NODE = lambda js: subprocess.run(["node","--input-type=module","-e","import * as m from '/workspace/foodporter-app/scripts/e2e/common.mjs';"+js+";process.exit(0)"],capture_output=True,text=True,cwd="/workspace/foodporter-app/scripts/e2e").stdout.strip().split("\n")[-1]
RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db"
oid = NODE("const a=await m.login('ADMIN'), c=await m.login('SIMC1'); const {data}=await a.sb.from('orders').select('id').eq('customer_id',c.id).eq('status','delivered').order('id',{ascending:false}).limit(1).single(); console.log(data.id)")
tid = NODE("const c=await m.login('SIMC1'); const {data}=await c.sb.from('support_tickets').select('id').order('id',{ascending:false}).limit(1).single(); console.log(data?.id ?? '')")
CUST = ["/", f"/r/?id={RID}", "/cart/", "/checkout/", "/my-orders/", f"/order/?id={oid}", "/support/", f"/support/?id={tid}", "/group/", "/welcome/", "/privacy/", "/terms/", "/cookies/", "/login/", "/rider-info/", "/accessibility/", "/offline/"]
RIDER = ["/rider/", "/rider/earnings/"]
REST = ["/restaurant/"]
ADMIN = ["/admin/", "/admin/orders/", f"/admin/orders/?id={oid}", "/admin/restaurants/", "/admin/riders/", "/admin/customers/", "/admin/map/", "/admin/reports/", "/admin/support/", "/admin/feedback/", "/admin/settings/", "/admin/legal/", "/admin/payroll/", "/admin/promos/", "/admin/payments/", "/admin/payouts/"]
PLAN = [("anon", None, CUST[:3] + CUST[9:] + ["/rider/", "/restaurant/", "/admin/", "/nope-404/"]),
        ("customer", "SIMC1", CUST), ("rider", "SIMR1", RIDER + ["/support/"]), ("restaurant", "STAFF", REST + ["/support/"]),
        ("admin", "ADMIN", ADMIN), ("admin-as-roles", "ADMIN", CUST[:6] + RIDER + REST)]
DESTRUCTIVE = re.compile(r"uitlog|sign out|log ?out|verwijder|delete|annuleer|cancel|terugbetal|refund|betaal|pay\b|nu betalen|bezorgd|delivered|opgehaald|picked up|accepteer|accept|weiger|reject|sos|112|bel |call |stuur|send|plaats bestelling|place order|bestel nu|order now|afrekenen|checkout|bied|bid\b|online|offline|resolve|opgelost|mark paid|betaald|uitbetal|payout|assign|toewijz|save|opslaan|add item|toevoegen|upload|foto kiezen|choose|feedback geven|give feedback|verstuur|submit|unsubscribe|meldingen aan|enable alerts|test sound|testgeluid|reset|wis|clear|export|download|print|reorder|opnieuw bestellen|groepsbestelling starten|start a group|nieuwe|new ticket|melding maken|report|probleem melden|hulp|help|item op|sold out|niet beschikbaar|unavailable|ophalen|deactivat|activate|activeer|suspend|pauze|pause|offer made|reviewed|run checks|revoke|intrekken|request|weigeren|decline|add call-in|teken|sign", re.I)
EXPECTED_FAIL = re.compile(r"/rest/v1/(push_subscriptions|rider_locations)|favicon|/auth/v1/user|realtime", re.I)
findings = []; stats = {"pages": 0, "clicks": 0, "skipped": 0}
def F(kind, where, detail): findings.append((kind, where, detail)); print(f"  ✗ {kind:9} {where} :: {detail}"[:300])

def login(pg, role):
    pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
    pg.fill("input[type=email]", creds[role + "_EMAIL"]); pg.fill("input[type=password]", creds[role + "_PASSWORD"])
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)

SNAP = """() => { const o = window.__fpm; return { m: o ? o.n : 0, dlg: o ? o.d : 0, url: location.href, open: [...document.querySelectorAll('details[open],[role=dialog],[aria-expanded=true]')].length, net: performance.getEntriesByType('resource').length } }"""
INIT = """window.__fpm={n:0,d:0}; new MutationObserver(r=>{window.__fpm.n+=r.length}).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
window.confirm=()=>{window.__fpm.d++;return false}; window.alert=()=>{window.__fpm.d++}; window.prompt=()=>{window.__fpm.d++;return null}; window.open=()=>({});"""
SEL = "main a[href], main button, main summary, main [role=tab], main input[type=checkbox], main input[type=radio], main select, header a[href], header button, nav a[href], nav button, footer a[href]"

def label(el):
    try: return (el.get_attribute("aria-label") or el.inner_text() or el.get_attribute("href") or el.get_attribute("data-testid") or "?").strip().replace("\n", " ")[:60]
    except Exception: return "?"

def crawl(ctx, role, url, lang, view):
    where = f"[{role}/{view}/{lang}] {url}"
    pg = ctx.new_page(); errs = []; bad = []; downloads = []
    pg.on("download", lambda d: downloads.append(d.suggested_filename))
    pg.on("console", lambda m: m.type == "error" and errs.append(m.text[:160]))
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:160]))
    pg.on("response", lambda r: r.status >= 400 and not EXPECTED_FAIL.search(r.url) and "nope-404" not in r.url and bad.append(f"{r.status} {r.url[:110]}"))
    pg.add_init_script(INIT)
    pg.goto(B + url); pg.evaluate(f"localStorage.setItem('fp-lang','{lang}')"); pg.reload(); 
    try: pg.wait_for_load_state("networkidle", timeout=4000)
    except Exception: pass
    pg.wait_for_timeout(500); stats["pages"] += 1
    if pg.locator("[data-testid=not-found]").count() and "nope-404" not in url: F("404", where, "page renders not-found")
    els = pg.locator(SEL); n = min(els.count(), 30); seen = set()
    hrefs = set()
    for i in range(n):
        try:
            el = pg.locator(SEL).nth(i)
            if not el.is_visible(): continue
            lab = label(el); tag = el.evaluate("e => e.tagName"); href = el.get_attribute("href") if tag == "A" else None
            key = (tag, lab, href)
            if key in seen: continue
            seen.add(key)
            if href:
                if href.startswith("http") and "foodporter-app" not in href: continue   # external (OSM, Mollie, credits)
                if href.startswith(("tel:", "mailto:", "#")): continue
                hrefs.add(href); continue
            if DESTRUCTIVE.search(lab) or el.is_disabled(): stats["skipped"] += 1; continue
            if el.get_attribute("aria-pressed") == "true" or el.get_attribute("aria-selected") == "true": continue   # already-selected chip: no-op by design
            before = pg.evaluate(SNAP); dl0 = len(downloads)
            if el.get_attribute("data-persist") is not None: stats["skipped"] += 1; continue   # writes to DB on change/click
            if tag == "SELECT":
                opts = el.evaluate("e => [...e.options].map(o => o.value)")
                if len(opts) < 2: continue
                cur = el.input_value(); el.select_option(next(v for v in opts if v != cur))
            else:
                el.click(timeout=2500)
            pg.wait_for_timeout(400); stats["clicks"] += 1
            after = pg.evaluate(SNAP)
            if after == before and len(downloads) == dl0: F("no-op", where, f"{tag} “{lab}”")
            if after["url"] != before["url"]:
                pg.goto(B + url); pg.wait_for_timeout(800)
            else:
                pg.keyboard.press("Escape")
        except Exception as e:
            if "Timeout" in str(e) or "not attached" in str(e) or "outside of the viewport" in str(e): continue
            F("crawler", where, str(e)[:120])
    for h in sorted(hrefs - CHECKED):
        CHECKED.add(h)
        full = h if h.startswith("http") else (re.sub(r"/foodporter-app$", "", B) + h if h.startswith("/foodporter-app") else B + h)
        try:
            r = pg.goto(full); pg.wait_for_timeout(400)
            if (r and r.status >= 400 and "nope" not in h) or pg.locator("[data-testid=not-found]").count(): F("dead-link", where, h)
        except Exception as e: F("dead-link", where, f"{h} {str(e)[:60]}")
    for e in sorted(set(errs)):
        if re.search(r"push|Notification|serviceWorker|geolocation|ERR_ABORTED|WebSocket|favicon|Failed to load resource: the server responded with a status of 4", e, re.I): continue
        F("console", where, e)
    for b in sorted(set(bad)): F("request", where, b)
    pg.close()

views = {"mobile": dict(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2), "desktop": dict(viewport={"width": 1280, "height": 900})}
combos = [("mobile", "nl"), ("mobile", "en")] if "--mobile" in sys.argv else [("mobile", "nl"), ("desktop", "en")] if QUICK else [("mobile", "nl"), ("mobile", "en"), ("desktop", "nl"), ("desktop", "en")]
t0 = time.time()
with sync_playwright() as p:
    b = p.chromium.launch()
    for role, acct, urls in PLAN:
        if ONLY and role not in ONLY: continue
        for view, lang in combos:
            ctx = b.new_context(**views[view])
            if acct: lp = ctx.new_page(); login(lp, acct); lp.close()
            print(f"== {role} {view} {lang}")
            for u in urls: crawl(ctx, role, u, lang, view)
            ctx.close()
    b.close()
print(f"\ncrawl: {stats['pages']} page visits, {stats['clicks']} clicks, {stats['skipped']} destructive skipped, {len(findings)} findings, {int(time.time()-t0)} s")
json.dump(findings, open(f"/tmp/crawl_findings{'_'+'-'.join(ONLY) if ONLY else ''}.json", "w"), indent=1)
sys.exit(1 if findings else 0)
