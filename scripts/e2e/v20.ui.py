# v20 UI: CAO selector, contract terms, call-in roster (admin add → rider decline), guarantees/surcharges in the week summary,
# 12 h rest message (NL/EN) + admin rest panel, provider-neutral CSV. Test rider SIMR3 only. Saves screenshots.
import re, sys, os, subprocess, datetime
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://bazsozsolt.github.io/foodporter-app"
OUT = "/workspace/foodporter/screens_v20"; os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
res = []
def ok(n, c, x=""): res.append(bool(c)); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
def setup(m): return subprocess.run(["node", os.path.join(HERE, "v20.ui.setup.mjs"), m], check=True, capture_output=True, text=True).stdout
def run(acct, view, lang, steps):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport=view)
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
        pg.evaluate(f"localStorage.setItem('fp-lang','{lang}')")
        pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
        steps(pg); b.close()
M, D = {"width": 390, "height": 844}, {"width": 1280, "height": 900}
tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
def admin(pg):
    pg.goto(B + "/admin/settings/"); pg.wait_for_selector("[data-testid=cao-select]", timeout=20000); pg.wait_for_timeout(1500)
    ok("settings: CAO BGV selected", pg.input_value("[data-testid=cao-select]") == "bgv" and pg.input_value("[data-testid=wml-16]") == "7.50" and pg.input_value("[data-testid=set-rest_min_h]") == "12")
    pg.select_option("[data-testid=cao-select]", "none")
    ok("settings: 'no CAO' preset fills WML", pg.input_value("[data-testid=wml-16]") == "5.17" and pg.input_value("[data-testid=set-surcharge_sun_pct]") == "0")
    pg.select_option("[data-testid=cao-select]", "bgv")
    pg.locator("[data-testid=cao-select]").scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/admin-settings-cao.png", full_page=True)
    pg.goto(B + "/admin/legal/"); pg.wait_for_selector("[data-testid=legal-rider-row]", timeout=20000); pg.wait_for_timeout(1500)
    pg.locator("[data-testid=legal-rider-row] button.underline").first.click(); pg.wait_for_selector("[data-testid=contract-terms]", timeout=10000)
    pg.select_option("[data-testid=contract-kind]", "min_max"); pg.wait_for_timeout(300)
    ok("legal: contract terms with min-max fields", pg.locator("[data-testid=min-hours]").count() == 1 and pg.locator("[data-testid=reference-days]").count() == 1)
    pg.locator("[data-testid=contract-terms]").scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/admin-contract-terms.png", full_page=True)
    ok("legal: library lists payroll DPA", pg.locator("[data-testid=tpl-row][data-template=dpa_payroll]").count() >= 1)
    pg.goto(B + "/admin/payroll/"); pg.wait_for_selector("[data-testid=call-rider]", timeout=20000); pg.wait_for_timeout(2500)
    val = RIDER
    pg.select_option("[data-testid=call-rider]", val); pg.fill("[data-testid=call-date]", tomorrow); pg.fill("[data-testid=call-from]", "17:00"); pg.fill("[data-testid=call-to]", "21:00")
    pg.get_by_role("button", name="Add call-in").click(); pg.wait_for_timeout(2500)
    ok("payroll: call-in added, flagged short notice", pg.locator("[data-testid=call-row] >> text=short notice").count() >= 1)
    with pg.expect_download() as dl: pg.get_by_role("button", name="⬇ Payroll CSV").click()
    head = open(dl.value.path()).read().split("\n")[0]
    ok("CSV: contract kind, guarantees, surcharges, no BSN", all(k in head for k in ["contract_kind", "guarantee_callin_hours", "surcharge_sun_eur", "paid_hours", "pension_fund"]) and "bsn" not in head.lower(), head[:100])
    pg.screenshot(path=f"{OUT}/admin-payroll-roster.png", full_page=True)
def rider_nl(pg):
    pg.goto(B + "/rider/shifts/"); pg.wait_for_selector("[data-testid=rider-shifts]", timeout=20000); pg.wait_for_timeout(2000)
    ok("rider: call-in listed as short notice", pg.locator("[data-testid=callin-list] >> text=korte termijn").count() >= 1)
    pg.locator("[data-testid=rider-shifts]").scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/rider-callin-nl.png", full_page=True)
    pg.locator("[data-testid=callin-decline]").first.click(); pg.wait_for_timeout(2500)
    ok("rider: declined", pg.locator("[data-testid=callin-list] >> text=geweigerd").count() >= 1)
    pg.goto(B + "/rider/earnings/"); pg.wait_for_selector("[data-testid=week-pay]", timeout=20000); pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="Vorige week").click(); pg.wait_for_timeout(2000)
    t = pg.inner_text("[data-testid=week-pay]")
    ok("week pay: guarantee + surcharges + contract", "Garantie-uren" in t and "Toeslagen" in t and "Oproepcontract" in t, t[:200])
    pg.screenshot(path=f"{OUT}/rider-weekpay-cao-nl.png", full_page=True)
def rider_en(pg):
    pg.goto(B + "/rider/earnings/"); pg.wait_for_selector("[data-testid=week-pay]", timeout=20000); pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="Previous week").click(); pg.wait_for_timeout(2000)
    t = pg.inner_text("[data-testid=week-pay]"); ok("week pay EN", "Guaranteed hours" in t and "Surcharges" in t and "On-call contract" in t)
    pg.screenshot(path=f"{OUT}/rider-weekpay-cao-en.png", full_page=True)
    pg.goto(B + "/rider-info/"); pg.wait_for_timeout(1500)
    t = pg.inner_text("main"); ok("rider info EN: CAO, contracts, rest", "CAO" in t and "12 hours" in t and "on-call contract" in t)
def rest(lang):
    def f(pg):
        pg.goto(B + "/rider/"); pg.wait_for_timeout(4000)
        t = pg.inner_text("main")
        ok(f"rider rest message {lang}", ("12 uur rust" in t and "weer inklokken vanaf" in t) if lang == "nl" else ("12 hours' rest" in t and "clock in again from" in t), t[:160])
        pg.screenshot(path=f"{OUT}/rider-rest-{lang}.png", full_page=True)
    return f
def admin_rest(pg):
    pg.goto(B + "/admin/payroll/"); pg.wait_for_selector("text=Resting riders", timeout=20000); pg.wait_for_timeout(2500)
    ok("admin rest panel lists rider", pg.locator("[data-testid=rest-row]").count() >= 1)
    pg.locator("text=Resting riders").scroll_into_view_if_needed(); pg.screenshot(path=f"{OUT}/admin-rest.png", full_page=False)
try:
    setup("clean"); RIDER = re.search(r"rider ([0-9a-f-]{36})", setup("pay")).group(1)
    run("ADMIN", D, "en", admin); run("SIMR3", M, "nl", rider_nl); run("SIMR3", M, "en", rider_en)
    setup("rest"); run("SIMR3", M, "nl", rest("nl")); run("SIMR3", M, "en", rest("en")); run("ADMIN", D, "en", admin_rest)
finally:
    setup("clean")
print(f"\n{sum(res)} passed, {len(res)-sum(res)} failed"); sys.exit(0 if all(res) else 1)
