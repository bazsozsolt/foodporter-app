# v13 UI: admin-role help (Zsolt's bug), Dutch error box, HEIC/empty-mime photo, order chat + call, photos (CLS), NL/EN language scan.
import re, sys, json, subprocess, os
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open(os.environ.get("FP_TEST_CREDS","/workspace/fptest/.creds")).read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787/foodporter-app"
S = "/workspace/foodporter/screens/v13_"; res = []
def ok(n, c, x=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
def login(pg, role):
    pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
    pg.fill("input[type=email]", creds[role+"_EMAIL"]); pg.fill("input[type=password]", creds[role+"_PASSWORD"])
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
def NODE(js): return subprocess.run(["node", "--input-type=module", "-e", "import * as m from '/workspace/foodporter-app/scripts/e2e/common.mjs';" + js + ";process.exit(0)"], capture_output=True, text=True, cwd="/workspace/foodporter-app/scripts/e2e").stdout.strip().split("\n")[-1]
def lang(pg, l): pg.evaluate(f"localStorage.setItem('fp-lang','{l}')")
NODE("const a=await m.login('ADMIN'); await a.sb.rpc('fp_test_reset_rate_limits')")
mob = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Mobile/15E148 Safari/604.1")
with sync_playwright() as p:
    b = p.chromium.launch()
    # ---- 1. Zsolt's case: an admin-role account on a phone uses the rider help (was a 400 "Onbekende categorie")
    ad = b.new_context(**mob).new_page(); errs = []; ad.on("pageerror", lambda e: errs.append(str(e)))
    login(ad, "ADMIN"); lang(ad, "nl"); ad.goto(B + "/rider/earnings/"); ad.wait_for_selector("[data-testid=help-button]", timeout=20000)
    ad.click("[data-testid=help-button]"); ad.wait_for_selector("[data-testid=support-sheet]")
    ad.click("[data-testid=cat-payout]"); ad.fill("[data-testid=support-body]", "Regressietest v13: admin-account op mobiel")
    ad.set_input_files("[data-testid=support-photo]", files=[{"name": "IMG_0001.HEIC", "mimeType": "", "buffer": open("/tmp/fp_fake.heic", "rb").read()}])
    ad.click("[data-testid=support-submit]")
    try: ad.wait_for_url(re.compile(r"/support/\?id=\d+"), timeout=20000); went = True
    except Exception: went = False
    ad.wait_for_timeout(2000)
    ok("admin-role account on mobile files a help ticket with an iPhone HEIC (empty mime) photo", went and ad.locator("[data-testid=thread] img").count() == 1, ad.url)
    ad.screenshot(path=S + "admin_role_help_ok.png")
    # ---- 2. failures are shown in a clear Dutch box (not a silent fail)
    cu = b.new_context(**mob).new_page(); login(cu, "SIMC1"); lang(cu, "nl")
    oid_d = NODE("const a=await m.login('ADMIN'), c=await m.login('SIMC1'); const {data}=await a.sb.from('orders').select('id').eq('customer_id',c.id).eq('status','delivered').order('id',{ascending:false}).limit(1).single(); console.log(data.id)")
    cu.route("**/rest/v1/rpc/support_create", lambda r: r.fulfill(status=400, content_type="application/json", body=json.dumps({"code": "P0429", "message": "Te veel verzoeken, probeer het over een paar minuten opnieuw (rate limit)"})))
    cu.goto(B + f"/order/?id={oid_d}"); cu.wait_for_selector("[data-testid=help-button]", timeout=20000); cu.click("[data-testid=help-button]")
    cu.click("[data-testid=cat-late]"); cu.fill("[data-testid=support-body]", "Waar blijft mijn eten?"); cu.click("[data-testid=support-submit]")
    cu.wait_for_selector("[data-testid=support-error]", timeout=10000)
    ok("server error shows a Dutch error box in the sheet", "Te veel verzoeken" in cu.inner_text("[data-testid=support-error]"))
    cu.screenshot(path=S + "help_error_dutch.png"); cu.unroute("**/rest/v1/rpc/support_create")
    # ---- 3. chat + call during an active delivery
    oid = NODE("const {execSync}=await import('child_process'); const id=Number(execSync('node ../sim/one-order.mjs',{encoding:'utf8'}).trim().split('\\n').pop()); const a=await m.login('ADMIN'), r=await m.login('SIMR1'); await a.sb.from('orders').update({rider_id:r.id,status:'assigned',assigned_at:new Date().toISOString()}).eq('id',id); await a.sb.from('bids').insert({order_id:id,rider_id:r.id,eta_minutes:12,accepted:true}); console.log(id)")
    cu.goto(B + f"/order/?id={oid}"); cu.wait_for_selector("[data-testid=contact-box]", timeout=20000)
    ok("customer sees 'Bel bezorger' during the delivery", cu.locator("[data-testid=call-btn]").count() == 1 and "Bel bezorger" in cu.inner_text("[data-testid=call-btn]"))
    cu.click("[data-testid=chat-toggle-rider]"); cu.click("[data-testid=chat-quick] button >> text=Ik sta beneden"); cu.wait_for_timeout(2500)
    ok("quick reply appears in the customer chat", "Ik sta beneden" in cu.inner_text("[data-testid=chat-rider]"))
    rd = b.new_context(**mob).new_page(); login(rd, "SIMR1"); lang(rd, "nl"); rd.goto(B + "/rider/"); rd.wait_for_selector("[data-testid=chat-rider]", timeout=25000)
    rd.click("[data-testid=chat-toggle-rider]"); rd.wait_for_timeout(2000)
    ok("rider sees the customer's message + 'Bel klant'", "Ik sta beneden" in rd.inner_text("[data-testid=chat-rider]") and rd.locator("[data-testid=call-btn]").count() >= 1)
    rd.fill("[data-testid=chat-input]", "Top, ik ben er over 2 min"); rd.click("[data-testid=chat-send]"); cu.wait_for_timeout(4000)
    ok("customer receives the rider's reply live", "ik ben er over 2 min" in cu.inner_text("[data-testid=chat-rider]"))
    cu.screenshot(path=S + "customer_chat_call.png", full_page=True); rd.screenshot(path=S + "rider_chat_call.png", full_page=True)
    before = int(NODE(f"const a=await m.login('ADMIN'); const {{data}}=await a.sb.from('call_audit').select('id').eq('order_id',{oid}); console.log(data.length)"))
    cu.click("[data-testid=call-btn]"); cu.wait_for_timeout(2500)
    after = int(NODE(f"const a=await m.login('ADMIN'); const {{data}}=await a.sb.from('call_audit').select('id').eq('order_id',{oid}); console.log(data.length)"))
    ok("tapping 'Bel bezorger' is audited", after == before + 1, f"{before}->{after}")
    ad2 = b.new_context(viewport={"width": 1280, "height": 900}).new_page(); login(ad2, "ADMIN"); ad2.goto(B + f"/admin/orders/?id={oid}"); ad2.wait_for_selector("[data-testid=admin-contact]", timeout=20000); ad2.wait_for_timeout(1500)
    for c in ["rider", "restaurant"]:
        t = ad2.locator(f"[data-testid=chat-toggle-{c}]")
        if ad2.locator(f"[data-testid=chat-{c}] [data-testid=chat-list]").count() == 0: t.click()
    ad2.wait_for_timeout(1500)
    ok("admin reads the chat and call log on the order", "Ik sta beneden" in ad2.inner_text("[data-testid=admin-contact]") and "customer→rider" in ad2.inner_text("[data-testid=call-audit]"))
    ad2.screenshot(path=S + "admin_order_chat.png", full_page=True)
    NODE(f"const a=await m.login('ADMIN'); await a.sb.from('orders').update({{status:'cancelled',cancel_reason:'test: v13 ui'}}).eq('id',{oid})")
    # ---- 4. photos: list, menu, cart; no layout shift
    hm = b.new_context(**mob).new_page(); hm.goto(B + "/"); lang(hm, "nl"); hm.reload(); hm.wait_for_selector("[data-testid=photo]", timeout=20000); hm.wait_for_timeout(1500)
    ok("restaurant list shows photos (lazy)", hm.locator("[data-testid=photo] img[loading=lazy]").count() >= 3)
    hm.screenshot(path=S + "home_photos.png")
    hm.goto(B + "/r/?id=187f751c-bebb-4a34-9d4b-9b1a9e8851db"); hm.wait_for_selector("[data-testid=photo]", timeout=20000)
    hm.evaluate("window.__cls=0; new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value}).observe({type:'layout-shift',buffered:true})")
    hm.wait_for_timeout(2500); cls = hm.evaluate("window.__cls")
    ok("menu page: no layout shift from images (CLS < 0.05)", cls < 0.05, f"CLS {cls:.3f}")
    ok("menu shows dish photos or branded placeholders + photo credits", hm.locator("[data-testid=photo], [data-testid=photo-placeholder]").count() >= 4 and hm.locator("[data-testid=photo-credits]").count() == 1)
    hm.screenshot(path=S + "menu_photos.png", full_page=True)
    hm.click("button[aria-label='Eén meer'] >> nth=0"); hm.click("button[aria-label='Eén meer'] >> nth=1"); hm.goto(B + "/cart/"); hm.wait_for_timeout(1500)
    ok("cart shows item photos", hm.locator("main [data-testid=photo], main [data-testid=photo-placeholder]").count() >= 2); hm.screenshot(path=S + "cart_photos.png")
    st = b.new_context(**mob).new_page(); login(st, "STAFF"); lang(st, "nl"); st.goto(B + "/restaurant/"); st.click("[data-testid=rtab-menu]", timeout=20000); st.wait_for_selector("[data-testid=restaurant-photos]", timeout=20000)
    st.click("[data-testid=restaurant-photos] summary"); st.wait_for_timeout(800); ok("restaurant has a photo manager (cover, logo, per dish)", st.locator("[data-testid=upload-cover]").count() == 1 and st.locator("[data-testid^=upload-item-]").count() >= 1)
    st.screenshot(path=S + "restaurant_photo_manager.png", full_page=True)
    # ---- 5. language scan: EN pages must not contain Dutch UI words, NL pages no English UI words
    NL = re.compile(r"\b(bestelling|bestellingen|bezorger|winkelmand|afrekenen|bezorgd|betaling|melding|meldingen|inloggen|uitloggen|wachtwoord|bekijk|terugbetaling|verdiensten|uitbetaling|klaar|onderweg|probleem|geen|jouw|bezorging|bereiding|Typ een|Stuur|Bel )\b", re.I)
    EN = re.compile(r"\b(order|orders|cart|checkout|delivered|payment|sign in|sign out|password|refund|earnings|payout|ready|on the way|problem|your|delivery|prep|Send|Call )\b", re.I)
    pages = {"customer": ["/", "/r/?id=187f751c-bebb-4a34-9d4b-9b1a9e8851db", "/cart/", "/checkout/", "/my-orders/", "/login/", f"/order/?id={oid_d}", "/support/", "/privacy/", "/terms/", "/cookies/"], "rider": ["/rider/", "/rider/earnings/"], "restaurant": ["/restaurant/"]}
    who = {"customer": cu, "rider": rd, "restaurant": st}
    leftovers = []
    for role, urls in pages.items():
        pg = who[role]
        for l, rx in [("en", NL), ("nl", EN)]:
            for u in urls:
                lang(pg, l); pg.goto(B + u); pg.wait_for_timeout(2500)
                for d in pg.locator("details").all():
                    try: d.evaluate("e => e.open = true")
                    except Exception: pass
                txt = pg.inner_text("body")
                # dynamic data (restaurant + dish names, addresses, user messages) is not UI copy
                for sel in ["h3", "[data-testid=chat-list]", "[data-testid=thread]", "b"]:
                    for t in pg.locator(sel).all_inner_texts(): txt = txt.replace(t, " ")
                hits = sorted(set(m.group(0) for m in rx.finditer(txt)))
                if hits: leftovers.append(f"{role} {l.upper()} {u}: {hits}")
    ok("language scan: no Dutch in EN mode / no English in NL mode on any non-admin page", not leftovers, "\n   " + "\n   ".join(leftovers))
    lang(cu, "en"); cu.goto(B + f"/order/?id={oid_d}"); cu.wait_for_timeout(2000); cu.screenshot(path=S + "customer_order_en.png", full_page=True)
    ok("no page errors", not errs, str(errs[:3]))
    b.close()
print(f"\n{sum(res)} passed, {len(res)-sum(res)} failed"); sys.exit(0 if all(res) else 1)
