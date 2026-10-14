import sys, re
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto(url); pg.wait_for_load_state("networkidle")
    pg.screenshot(path="/tmp/m_1.png")
    # pick iDEAL if method selection is shown
    for label in ["iDEAL"]:
        loc = pg.get_by_text(label, exact=False).first
        if loc.count(): loc.click(); pg.wait_for_load_state("networkidle")
    pg.screenshot(path="/tmp/m_2.png")
    # issuer selection (test mode) then status page
    for _ in range(4):
        txt = pg.content()
        if pg.locator("input[value=paid]").count():
            pg.locator("input[value=paid]").check(); pg.get_by_role("button").filter(has_text=re.compile("Continue|Doorgaan|Ga verder", re.I)).first.click(); break
        btns = pg.locator("button[name=issuer], .payment-method-list button, li button")
        if btns.count(): btns.first.click(); pg.wait_for_load_state("networkidle"); continue
        break
    pg.wait_for_timeout(4000)
    pg.screenshot(path="/tmp/m_3.png")
    print("final url:", pg.url)
    b.close()
