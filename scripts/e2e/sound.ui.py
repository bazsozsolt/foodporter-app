# Test-sound regression: the WAV is in the export and served under the basePath, and the rider + restaurant
# "Testgeluid" buttons call play() on it (falls back to Web Audio if the browser refuses).
import re, sys
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open(__import__("os").environ.get("FP_TEST_CREDS","/workspace/fptest/.creds")).read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://bazsozsolt.github.io/foodporter-app"
res = []
def ok(n, c, x=""): res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
SPY = """window.__played=[]; const op=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(){window.__played.push(this.currentSrc||this.src); return op.call(this);};"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=user-gesture-required"])
    for role, path in [("RIDER", "/rider/"), ("STAFF", "/restaurant/")]:
        c = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True); c.add_init_script(SPY)
        pg = c.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
        pg.fill("input[type=email]", creds[role+"_EMAIL"]); pg.fill("input[type=password]", creds[role+"_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3500)
        pg.goto(B + path); pg.wait_for_selector("[data-testid=test-sound]", timeout=20000)
        r = pg.request.get(B + "/sounds/beep-beep.wav")
        ok(f"{role}: sound asset served", r.status == 200 and r.body()[:4] == b"RIFF", f"{r.status} {r.headers.get('content-type')}")
        pg.tap("[data-testid=test-sound]"); pg.wait_for_timeout(1200)
        st = pg.evaluate("({played: window.__played, beeps: window.__fpBeeps, synth: window.__fpSynth||0, err: (()=>{const a=[...document.querySelectorAll('audio')];return null})()})")
        ok(f"{role}: test button calls play() on the beep", st["beeps"] == 1 and any(u.endswith("/sounds/beep-beep.wav") for u in st["played"]), str(st))
        ok(f"{role}: audio element loaded without error", pg.evaluate("(async()=>{const a=new Audio(document.baseURI.replace(/\\/(rider|restaurant)\\/.*$/,'')+'/sounds/beep-beep.wav'); await new Promise((r,j)=>{a.oncanplaythrough=r;a.onerror=()=>j(a.error&&a.error.code);a.load();}); return a.duration>0.3})()"))
        ok(f"{role}: no page errors", not errs, str(errs)[:300])
        c.close()
    b.close()
print(f"{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
