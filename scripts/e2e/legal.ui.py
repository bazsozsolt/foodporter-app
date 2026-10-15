# v18 HR & Legal UI: admin library + statuses, rider onboarding card blocks the online toggle, sign via UI unblocks it.
import re, sys, subprocess
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://bazsozsolt.github.io/foodporter-app"
def NODE(js): return subprocess.run(["node","--input-type=module","-e","import * as m from '/workspace/foodporter-app/scripts/e2e/common.mjs';"+js+";process.exit(0)"],capture_output=True,text=True,cwd="/workspace/foodporter-app/scripts/e2e").stdout.strip().split("\n")[-1]
res = []
def ok(n, c, x=""): res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
def session(acct, view):
    p = sync_playwright().start(); b = p.chromium.launch(); pg = b.new_page(viewport=view)
    pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
    pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
    return p, b, pg
p, b, pg = session("ADMIN", {"width": 1280, "height": 900})
pg.goto(B + "/admin/legal/")
pg.wait_for_selector("[data-testid=tpl-row]", timeout=20000)
ok("admin library lists all templates + versions", pg.locator("[data-testid=tpl-row]").count() >= 12, str(pg.locator("[data-testid=tpl-row]").count()))
ok("zzp template marked not used", pg.locator("[data-testid=tpl-row][data-template=rider_zzp] [data-testid=tpl-archived]").count() >= 1)
ok("nav entry", pg.get_by_role("link", name="Contracts & onboarding").count() == 1)
pg.locator("[data-testid=tpl-row][data-template=rider_employment] >> text=View").first.click(); pg.wait_for_timeout(1500)
ok("template viewer renders", "Concept" in pg.inner_text("[data-testid=tpl-view]"))
ok("rider statuses shown", pg.locator("[data-testid=legal-rider-row] [data-status=signed]").count() > 10)
ok("restaurant status shown", pg.locator("[data-testid=legal-rest-row] [data-status=signed]").count() >= 2)
ok("signature log", pg.locator("[data-testid=acc-row]").count() > 10)
pg.locator("[data-testid=legal-rider-row] button.underline").first.click(); pg.wait_for_selector("[data-testid=rider-detail]", timeout=10000)
ok("rider detail with checklist (no KvK, BSN flag)", pg.locator("[data-testid=checklist] input[type=checkbox]").count() == 9 and pg.locator("[data-testid=step-bsn_entered]").count() == 1 and pg.locator("[data-testid=step-kvk_checked]").count() == 0)
pg.screenshot(path="/tmp/legal-admin.png", full_page=True); b.close(); p.stop()
rq = NODE("const a=await m.login('ADMIN'), r=await m.login('SIMR3'); await a.sb.from('profiles').update({online:false}).eq('id',r.id); const t=(await a.sb.from('legal_templates').select('version').eq('id','platform_transparency').single()).data; const q=(await a.sb.from('legal_requests').insert({template_id:'platform_transparency',version:t.version,profile_id:r.id}).select('id').single()).data; console.log(q.id)")
try:
    p, b, pg = session("SIMR3", {"width": 390, "height": 844})
    pg.goto(B + "/rider/"); pg.wait_for_selector("[data-testid=legal-onboarding]", timeout=20000)
    ok("rider sees onboarding card", True)
    ok("online toggle disabled", pg.locator("[data-testid=online-toggle]").is_disabled())
    pg.locator("[data-testid=legal-doc] >> text=/^(Lezen|Read)$/").click(); pg.wait_for_timeout(1500)
    ok("contract text shown", "Concept" in pg.inner_text("[data-testid=legal-text]"))
    ok("accept disabled until ticked", pg.locator("[data-testid=legal-accept]").is_disabled())
    pg.check("[data-testid=legal-agree]"); pg.click("[data-testid=legal-accept]"); pg.wait_for_timeout(3000)
    ok("card gone after signing", pg.locator("[data-testid=legal-onboarding]").count() == 0)
    ok("online toggle enabled", not pg.locator("[data-testid=online-toggle]").is_disabled())
    pg.screenshot(path="/tmp/legal-rider.png"); b.close(); p.stop()
finally:
    NODE(f"const a=await m.login('ADMIN'); await a.sb.from('legal_requests').update({{status:'revoked'}}).eq('id',{rq}).in('status',['sent','expired']); console.log('ok')")
print(f"\n{sum(res)} passed, {len(res)-sum(res)} failed"); sys.exit(0 if all(res) else 1)
