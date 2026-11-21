# Mock UI: rider bid board hides the street, assigned jobs show it; auth captcha flag off/on.
import json, os, re, sys, time, http.server, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/v41-out")
PORT = int(sys.argv[2] if len(sys.argv) > 2 else "8791")
SHOT = Path("/workspace/fptest/v41/screens")
SHOT.mkdir(parents=True, exist_ok=True)
res = []
def ok(n, c, x=""):
    res.append(c)
    print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))

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

STREET = "Heuvelstraat 12, 5038 AA Tilburg"
seed = {
    "signedIn": "rider@mock",
    "cart": {"restaurant_id": None, "qty": {}},
    "earnings": [],
    "orders": [
        {
            "id": "bid-1", "restaurant_id": "11111111-0000-4000-8000-000000000001",
            "customer_id": "cust-1", "status": "accepted", "fulfilment": "delivery",
            "lines": [], "subtotal_cents": 1800, "delivery_fee_cents": 249, "service_fee_cents": 99,
            "tip_cents": 0, "address": STREET, "phone": "0612345678", "prep_minutes": 10,
            "ready_at": None, "bids": [], "created_at": "2026-11-21T01:00:00+01:00", "delivered_at": None,
            "lat": 51.5555, "lng": 5.0913, "distance_km": 1.2, "rider_bonus_cents": 50,
            "rider_id": None, "bid_window_closes_at": None,
        },
        {
            "id": "job-1", "restaurant_id": "11111111-0000-4000-8000-000000000001",
            "customer_id": "cust-1", "status": "assigned", "fulfilment": "delivery",
            "lines": [], "subtotal_cents": 1800, "delivery_fee_cents": 249, "service_fee_cents": 99,
            "tip_cents": 0, "address": STREET, "phone": "0612345678", "prep_minutes": 10,
            "ready_at": None, "bids": [{"id": "b1", "rider_id": "rider-demo", "rider_name": "Sanne", "eta_minutes": 20, "accepted": True, "created_at": "2026-11-21T01:00:00+01:00"}],
            "created_at": "2026-11-21T01:00:00+01:00", "delivered_at": None,
            "lat": 51.5555, "lng": 5.0913, "distance_km": 1.2, "rider_bonus_cents": 50,
            "rider_id": "rider-demo", "assigned_at": "2026-11-21T01:05:00+01:00",
        },
    ],
}

flag = os.environ.get("NEXT_PUBLIC_CAPTCHA_MOCK", "")
with sync_playwright() as p:
    b = p.chromium.launch()
    c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg = c.new_page()
    pg.goto(B + "/login/", wait_until="domcontentloaded")
    pg.wait_for_timeout(800)
    if flag == "1":
        ok("captcha flag on: widget is shown", pg.locator("[data-testid=captcha]").count() == 1)
        ok("sign-in disabled until the captcha is completed", pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).is_disabled())
        pg.locator("[data-testid=captcha-mock]").check()
        pg.wait_for_timeout(200)
        ok("mock captcha can be completed", pg.locator("[data-testid=captcha-mock]").is_checked())
        # email/password still required, so the button may stay disabled; the captcha itself is the check
        ok("mock captcha is labelled in Dutch or English", bool(re.search(r"robot", pg.inner_text("body"), re.I)))
        pg.screenshot(path=str(SHOT / "login-captcha-on.png"), full_page=True)
    else:
        ok("captcha flag off: no widget", pg.locator("[data-testid=captcha]").count() == 0)
        pg.screenshot(path=str(SHOT / "login-captcha-off.png"), full_page=True)
        pg.evaluate(f"localStorage.setItem('foodporter-mock-v2', {json.dumps(json.dumps(seed))})")
        pg.goto(B + "/rider/", wait_until="domcontentloaded")
        pg.wait_for_timeout(1500)
        body = pg.inner_text("body")
        area = pg.locator("[data-testid=bid-area]")
        ok("bid card shows a neighbourhood, not the street", area.count() == 1 and "Heuvelstraat" not in (area.inner_text() if area.count() else "") and "5038" in (area.inner_text() if area.count() else body))
        ok("bid list body does not include the house number street on the open job", "Heuvelstraat" not in pg.locator("[data-testid=bid-area]").inner_text() if area.count() else False)
        assigned = pg.locator("[data-testid=assigned-address]")
        ok("assigned job still shows the full street address", assigned.count() >= 1 and "Heuvelstraat" in assigned.first.inner_text())
        pg.screenshot(path=str(SHOT / "rider-bid-and-assigned.png"), full_page=True)
    b.close()

httpd.shutdown()
print(f"\n{sum(res)} passed, {len(res)-sum(res)} failed")
sys.exit(0 if all(res) and res else 1)
