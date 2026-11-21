# Accessibility on the v41-changed pages against a local mock build. Not live.
# Usage: python3 v41-a11y.ui.py <out-dir> [port] [--json out]
import json, os, sys, time, http.server, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 and not str(sys.argv[1]).startswith("--") else "/tmp/v41-out")
args = [a for a in sys.argv[2:] if not a.startswith("--")]
PORT = int(args[0]) if args else 8795
AXE = open("/workspace/foodporter-app/node_modules/axe-core/axe.min.js").read()
SHOT = Path("/workspace/fptest/v41/screens")
SHOT.mkdir(parents=True, exist_ok=True)

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(OUT), **k)
    def log_message(self, *a):
        pass

httpd = socketserver.TCPServer(("127.0.0.1", PORT), H)
httpd.allow_reuse_address = True
threading.Thread(target=httpd.serve_forever, daemon=True).start()
B = f"http://127.0.0.1:{PORT}"
time.sleep(0.3)

FOCUS = """() => { const el = document.activeElement; if (!el || el === document.body) return 'none';
  const s = getComputedStyle(el); const vis = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
  return (vis ? 'ok:' : 'noring:') + el.tagName + ':' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) }"""

SEEDS = {
    "/login/": {"signedIn": None, "cart": {"restaurant_id": None, "qty": {}}, "earnings": [], "orders": []},
    "/rider/": {
        "signedIn": "rider@mock", "cart": {"restaurant_id": None, "qty": {}}, "earnings": [],
        "orders": [
            {"id": "bid-1", "restaurant_id": "11111111-0000-4000-8000-000000000001", "customer_id": "cust-1", "status": "accepted", "fulfilment": "delivery",
             "lines": [], "subtotal_cents": 1800, "delivery_fee_cents": 249, "service_fee_cents": 99, "tip_cents": 0,
             "address": "Heuvelstraat 12, 5038 AA Tilburg", "phone": "0612345678", "prep_minutes": 10, "ready_at": None, "bids": [],
             "created_at": "2026-11-21T01:00:00+01:00", "delivered_at": None, "lat": 51.5555, "lng": 5.0913, "distance_km": 1.2,
             "rider_bonus_cents": 50, "rider_id": None, "bid_window_closes_at": None},
            {"id": "job-1", "restaurant_id": "11111111-0000-4000-8000-000000000001", "customer_id": "cust-1", "status": "assigned", "fulfilment": "delivery",
             "lines": [], "subtotal_cents": 1800, "delivery_fee_cents": 249, "service_fee_cents": 99, "tip_cents": 0,
             "address": "Heuvelstraat 12, 5038 AA Tilburg", "phone": "0612345678", "prep_minutes": 10, "ready_at": None,
             "bids": [{"id": "b1", "rider_id": "rider-demo", "rider_name": "Sanne", "eta_minutes": 20, "accepted": True, "created_at": "2026-11-21T01:00:00+01:00"}],
             "created_at": "2026-11-21T01:00:00+01:00", "delivered_at": None, "lat": 51.5555, "lng": 5.0913, "distance_km": 1.2,
             "rider_bonus_cents": 50, "rider_id": "rider-demo", "assigned_at": "2026-11-21T01:05:00+01:00"},
        ],
    },
    "/checkout/": {
        "signedIn": "cara@mock",
        "cart": {"restaurant_id": "11111111-0000-4000-8000-000000000004", "qty": {"22222222-0004-4000-8000-000000000002": 1}},
        "earnings": [], "orders": [],
    },
    "/admin/settings/": {"signedIn": "ada@mock", "cart": {"restaurant_id": None, "qty": {}}, "earnings": [], "orders": []},
}

out = {}
rc = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for lang in ("nl", "en"):
        for path, seed in SEEDS.items():
            ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
            pg = ctx.new_page()
            pg.goto(B + "/login/", wait_until="domcontentloaded")
            pg.evaluate(f"localStorage.setItem('fp-lang','{lang}')")
            pg.evaluate(f"localStorage.setItem('foodporter-mock-v2', {json.dumps(json.dumps(seed))})")
            pg.goto(B + path, wait_until="domcontentloaded")
            pg.wait_for_timeout(2000)
            pg.add_script_tag(content=AXE)
            r = pg.evaluate("async () => (await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v => ({id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0,3).map(x => x.target.join(' ') + ' | ' + (x.failureSummary||'').split('\\n')[1]) }))")
            foc = []
            pg.locator("body").click(position={"x": 1, "y": 1})
            for _ in range(6):
                pg.keyboard.press("Tab")
                foc.append(pg.evaluate(FOCUS))
            key = f"{lang} {path}"
            out[key] = {"axe": r, "focus": foc}
            bad = [v for v in r if v["impact"] in ("serious", "critical")]
            print(key, "axe:", ", ".join(f"{v['id']}({v['impact']},{v['n']})" for v in r) or "none", "| no-ring:", sum(1 for f in foc if f.startswith("noring")))
            if bad:
                rc = 1
            if lang == "nl":
                name = path.strip("/").replace("/", "-") or "home"
                pg.screenshot(path=str(SHOT / f"a11y-{name}.png"), full_page=True)
            ctx.close()
    b.close()

httpd.shutdown()
json_path = None
if "--json" in sys.argv:
    json_path = sys.argv[sys.argv.index("--json") + 1]
    json.dump(out, open(json_path, "w"), indent=1)
sys.exit(rc)
