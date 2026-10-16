# Accessibility basics with axe-core (WCAG 2 A/AA: labels, names, contrast, landmarks) + keyboard focus visibility.
# One browser at a time, mobile viewport, NL and EN. Usage: python3 a11y.ui.py [base] [--json out]
import re, sys, os, json
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = next((a for a in sys.argv[1:] if a.startswith("http")), "https://bazsozsolt.github.io/foodporter-app")
AXE = open("/workspace/foodporter-app/node_modules/axe-core/axe.min.js").read()
RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db"
PLAN = [(None, ["/", f"/r/?id={RID}", "/cart/", "/login/", "/welcome/", "/privacy/", "/rider-info/"]),
        ("SIMC1", ["/my-orders/", "/support/", "/checkout/"]), ("SIMR1", ["/rider/", "/rider/shifts/", "/rider/earnings/"]), ("STAFF", ["/restaurant/"]),
        ("ADMIN", ["/admin/", "/admin/payroll/", "/admin/legal/", "/admin/settings/", "/admin/reports/"])]
out = {}
FOCUS = """() => { const el = document.activeElement; if (!el || el === document.body) return 'none';
  const s = getComputedStyle(el); const vis = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
  return (vis ? 'ok:' : 'noring:') + el.tagName + ':' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for acct, pages in PLAN:
        for lang in ("nl", "en"):
            ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page()
            pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle"); pg.evaluate(f"localStorage.setItem('fp-lang','{lang}')")
            if acct:
                pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
                pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
            for path in pages:
                pg.goto(B + path); pg.wait_for_timeout(3500)
                pg.add_script_tag(content=AXE)
                r = pg.evaluate("async () => (await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0,3).map(x => x.target.join(' ') + ' | ' + (x.failureSummary||'').split('\\n')[1]) }))")
                foc = []
                pg.locator("body").click(position={"x": 1, "y": 1})
                for _ in range(6): pg.keyboard.press("Tab"); foc.append(pg.evaluate(FOCUS))
                key = f"{acct or 'anon'} {lang} {path}"
                out[key] = {"axe": r, "focus": foc}
                bad = [v for v in r if v["impact"] in ("serious", "critical")]
                print(key, "axe:", ", ".join(f"{v['id']}({v['impact']},{v['n']})" for v in r) or "none", "| no-ring:", sum(1 for f in foc if f.startswith("noring")))
            ctx.close()
    b.close()
if "--json" in sys.argv: json.dump(out, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1)
