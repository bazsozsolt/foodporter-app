# v29/v33 account-flow check on the live app with a throwaway test account.
# v33: email confirmation is on. The UI sign-up/resend calls are answered locally (no mail to example.com);
# the real users are created via the admin API (admin-user.mjs, no email sent).
# v35: ?next= bypasses, recovery-link landing, link-session current password, device cart/favourites, delete the account.
import re, sys, subprocess, os, json as _j, urllib.parse
HERE = os.path.dirname(os.path.abspath(__file__))
def adm(*a): return subprocess.run(["node", "admin-user.mjs", *a], cwd=HERE, capture_output=True, text=True, check=True).stdout.strip()
from playwright.sync_api import sync_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "https://app.foodporter.nl"
EMAIL = sys.argv[2]; PW1, PW2, PW3 = "Test-v29-pass1", "Test-v29-pass2", "Test-v29-pass3"
UNC = EMAIL.replace("@", "-unc@")
res = []; errs = []
def ok(n, c, x=""): res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
def cleanup():
    for e in (EMAIL, UNC):
        try: adm("delete", e)
        except Exception as ex: print("cleanup", type(ex).__name__)
# Rewrite an admin verify-redirect onto this app. Never print the URL (it holds a one-time token).
def auth_landing(email, typ):
    loc = adm("link", email, typ)
    u, b = urllib.parse.urlsplit(loc), urllib.parse.urlsplit(B)
    if "access_token" not in (u.fragment or "") and "code=" not in (u.query or ""):
        raise RuntimeError("auth link did not redirect to a session")
    return urllib.parse.urlunsplit((b.scheme, b.netloc, u.path or "/", u.query, u.fragment))
try:
 with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={"width": 390, "height": 844}); pg = c.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    # never actually send recovery mail (SMTP quota); answer the call like Supabase does
    pg.route("**/auth/v1/recover*", lambda r: r.fulfill(status=200, body="{}", content_type="application/json"))
    body = lambda: pg.inner_text("body")
    host = lambda: urllib.parse.urlsplit(pg.url).hostname or ""
    def sign_out():
        pg.goto(B + "/login/"); pg.wait_for_timeout(800)
        for _ in range(20):
            if pg.locator("[data-testid=sign-out]").count():
                pg.click("[data-testid=sign-out]"); pg.wait_for_timeout(2500); return
            if "Welkom" in body() or "Welcome" in body(): return
            pg.wait_for_timeout(500)
    def sign_in(pw):
        pg.goto(B + "/login/"); pg.wait_for_selector("input[type=email]", timeout=15000)
        pg.fill("input[type=email]", EMAIL); pg.fill("input[type=password]", pw)
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click()
        for _ in range(20):
            pg.wait_for_timeout(500)
            if "Ingelogd" in body() or "Signed in" in body(): return True
        return False
    pg.goto(B + "/login/"); pg.wait_for_selector("input[type=email]")
    pg.fill("input[type=email]", EMAIL); pg.fill("input[type=password]", "short12")
    ok("create disabled < 8 chars", pg.get_by_role("button", name=re.compile("Account aanmaken|Create account")).is_disabled())
    ok("min-8 hint shown", "8 tekens" in body() or "8 characters" in body())
    pg.fill("input[type=password]", "Fpv35€testje9")
    ok("non-ascii symbol rejected", pg.get_by_role("button", name=re.compile("Account aanmaken|Create account")).is_disabled() and "ASCII" in body())
    pg.fill("input[type=password]", "Test test1")
    ok("space is not a symbol", pg.get_by_role("button", name=re.compile("Account aanmaken|Create account")).is_disabled() and "ASCII" in body())
    fake_user = _j.dumps({"id": "00000000-0000-4000-8000-000000000033", "aud": "authenticated", "role": "", "email": EMAIL, "identities": [], "created_at": "2026-10-24T00:00:00Z", "app_metadata": {}, "user_metadata": {}})
    pg.route("**/auth/v1/signup*", lambda r: r.fulfill(status=200, body=fake_user, content_type="application/json"))
    resend_mode = {"v": "ok"}
    pg.route("**/auth/v1/resend*", lambda r: r.fulfill(status=200, body="{}", content_type="application/json") if resend_mode["v"] == "ok" else r.fulfill(status=429, body=_j.dumps({"code": "over_email_send_rate_limit", "error_code": "over_email_send_rate_limit", "msg": "email rate limit exceeded"}), content_type="application/json"))
    pg.fill("input[type=password]", PW1); pg.get_by_role("button", name=re.compile("Account aanmaken|Create account")).click()
    pg.wait_for_selector("[data-testid=check-email]", timeout=10000)
    ok("sign-up → check-your-email screen", ("Kijk in je e-mail" in body() or "Check your email" in body()) and EMAIL in body())
    pg.click("[data-testid=resend-confirmation]"); pg.wait_for_timeout(1500)
    ok("resend: neutral message", "nieuwe bevestigingslink" in body() or "new confirmation link" in body(), body()[-200:])
    resend_mode["v"] = "limit"; pg.wait_for_timeout(500); pg.click("[data-testid=resend-confirmation]"); pg.wait_for_timeout(1500)
    ok("resend: rate-limit message", "te veel e-mails" in body().lower() or "too many emails" in body().lower(), body()[-200:])
    # unconfirmed account: clear message + resend on sign-in
    adm("create", UNC, PW1, "unconfirmed")
    pg.get_by_text(re.compile("Terug naar inloggen|Back to sign in")).click(); pg.wait_for_selector("input[type=email]")
    pg.fill("input[type=email]", UNC); pg.fill("input[type=password]", PW1)
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
    ok("unconfirmed sign-in → clear message + resend", pg.locator("[data-testid=unconfirmed] [data-testid=resend-confirmation]").count() == 1)
    adm("delete", UNC)
    # the real (confirmed) throwaway account, created without sending email
    adm("create", EMAIL, PW1)
    pg.fill("input[type=email]", EMAIL); pg.fill("input[type=password]", PW1)
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
    pg.goto(B + "/login/")
    for _ in range(15):  # v31: poll instead of a fixed 3 s wait (session restore can be slower on live)
        pg.wait_for_timeout(1000)
        if "Ingelogd" in body() or "Signed in" in body(): break
    ok("confirmed account signs in", "Ingelogd" in body() or "Signed in" in body(), body()[:120])
    pg.get_by_text(re.compile("Wachtwoord wijzigen|Change password")).click()
    ok("current-password field shown", pg.locator("[data-testid=current-password]").count() == 1)
    pg.fill("[data-testid=current-password]", PW1); pg.fill("[data-testid=new-password]", PW2); pg.fill("input[autocomplete=new-password] >> nth=1", "mismatch1")
    ok("mismatch blocked", "niet gelijk" in body() or "don't match" in body())
    pg.fill("input[autocomplete=new-password] >> nth=1", PW2)
    pg.get_by_role("button", name=re.compile("Wachtwoord opslaan|Save password")).click()
    for _ in range(20):  # v31: poll — the server-side leaked-password check makes the update slower than 1.2 s
        pg.wait_for_timeout(500)
        if "gewijzigd" in body() or "changed" in body(): break
    ok("password changed toast", "gewijzigd" in body() or "changed" in body(), re.sub(r"\s+"," ",body())[-300:])
    ok("privacy/delete link", pg.locator("a[href*='privacy'][href*='#rights']").count() == 1)
    # device data the next person on this phone must not see
    pg.evaluate("""() => {
      localStorage.setItem('foodporter-cart-v1', JSON.stringify({restaurant_id:'fp-test', qty:{item:2}}));
      localStorage.setItem('fp-favs', JSON.stringify(['fp-test-rest']));
    }""")
    pg.reload(); pg.wait_for_timeout(1500)
    for _ in range(15):
        if "Ingelogd" in body() or "Signed in" in body(): break
        pg.wait_for_timeout(500)
    pg.click("[data-testid=sign-out]"); pg.wait_for_timeout(4000)
    ok("sign-out lands on /login", "/login" in pg.url and ("Welkom" in body() or "Welcome" in body()), pg.url.split("#")[0])
    ok("session cleared", pg.evaluate("Object.keys(localStorage).filter(k=>k.includes('auth-token')).length") == 0)
    cart = pg.evaluate("localStorage.getItem('foodporter-cart-v1')") or ""
    fav = pg.evaluate("localStorage.getItem('fp-favs')")
    ok("cart cleared on sign-out", "fp-test" not in cart and "item" not in cart, cart[:80])
    ok("favourites cleared on sign-out", fav in (None, "null", "[]"))
    for path in ["/admin/", "/rider/", "/restaurant/", "/my-orders/"]:
        pg.goto(B + path); pg.wait_for_timeout(3000); t = body()
        ok(f"{path} after logout asks sign-in / shows no data", "Log eerst in" in t or "Log in" in t or "Please sign in" in t or "Inloggen" in t or "Sign in" in t)
    pg.goto(B + "/login/"); pg.wait_for_selector("input[type=email]")
    pg.fill("input[type=email]", EMAIL); pg.fill("input[type=password]", PW1)
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
    t1 = body(); ok("old password rejected, generic msg", "Onjuist e-mailadres of wachtwoord" in t1 or "Wrong email or password" in t1)
    pg.fill("input[type=email]", "nobody-v29@example.com"); pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
    ok("unknown email → same message (no enumeration)", "Onjuist e-mailadres of wachtwoord" in body() or "Wrong email or password" in body())
    pg.fill("input[type=email]", EMAIL); pg.click("[data-testid=forgot-password]")
    pg.click("[data-testid=send-reset]"); pg.wait_for_timeout(2500)
    ok("reset: neutral message", "Als er een account" in body() or "If an account exists" in body())
    pg.get_by_text(re.compile("Terug naar inloggen|Back to sign in")).click(); pg.click("[data-testid=forgot-email]")
    ok("forgot-email guidance", "privacy" in body().lower() and ("Food Porter" in body()))
    pg.get_by_text(re.compile("Terug naar inloggen|Back to sign in")).click()
    pg.fill("input[type=password]", PW2); pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(4000)
    # v35b: after sign-in goNext() lands on home, so check the signed-in state on /login/
    pg.goto(B + "/login/")
    for _ in range(20):
        if "Ingelogd" in body() or "Signed in" in body(): break
        pg.wait_for_timeout(500)
    ok("new password works", "Ingelogd" in body() or "Signed in" in body())
    # ?next= is honoured only as a same-origin path. These are the bypasses browsers turn into //host.
    sign_out()
    bad = [
        ("slash-slash", "//evil.example"), ("https", "https://evil.example/"), ("backslash-host", "\\\\evil.example"),
        ("javascript", "javascript:alert(1)"), ("slash-backslash", "/\\evil.example"),
        ("tab", "/\t/evil.example"), ("lf", "/\n/evil.example"),
    ]
    for name, nxt in bad:
        pg.goto(B + "/login/?next=" + urllib.parse.quote(nxt, safe="")); pg.wait_for_selector("input[type=email]", timeout=15000)
        pg.fill("input[type=email]", EMAIL); pg.fill("input[type=password]", PW2)
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click()
        for _ in range(16):
            pg.wait_for_timeout(500)
            if "Ingelogd" in body() or "Signed in" in body() or host() == "evil.example": break
        ok(f"next blocked {name}", host() != "evil.example" and "evil.example" not in pg.url and not pg.url.lower().startswith("javascript:"), pg.url.split("?")[0].split("#")[0])
        if host() != "evil.example": sign_out()
    pg.goto(B + "/login/?next=" + urllib.parse.quote("/my-orders", safe="")); pg.wait_for_selector("input[type=email]")
    pg.fill("input[type=email]", EMAIL); pg.fill("input[type=password]", PW2)
    pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click()
    for _ in range(16):
        pg.wait_for_timeout(500)
        if "/my-orders" in pg.url: break
    ok("next /my-orders kept", "/my-orders" in pg.url and host() != "evil.example", pg.url.split("?")[0])
    # A session from an email link must still check the current password (GoTrue skips it for amr "otp").
    sign_out()
    pg.goto(auth_landing(EMAIL, "magiclink"))
    for _ in range(30):
        pg.wait_for_timeout(500)
        if "reset=1" in pg.url: break
        if "/login" not in pg.url and pg.locator("text=Food Porter").count(): break
    ok("magic link does not open the reset form", "reset=1" not in pg.url, pg.url.split("#")[0])
    pg.goto(B + "/login/")
    for _ in range(20):
        pg.wait_for_timeout(500)
        if "Ingelogd" in body() or "Signed in" in body(): break
    ok("magic link signs in", "Ingelogd" in body() or "Signed in" in body(), body()[:80])
    pg.get_by_text(re.compile("Wachtwoord wijzigen|Change password")).click()
    pg.fill("[data-testid=current-password]", "Wrong-current-9!"); pg.fill("[data-testid=new-password]", "Not-saved-v35!")
    pg.fill("input[autocomplete=new-password] >> nth=1", "Not-saved-v35!")
    pg.get_by_role("button", name=re.compile("Wachtwoord opslaan|Save password")).click()
    for _ in range(20):
        pg.wait_for_timeout(500)
        if "klopt niet" in body() or "incorrect" in body() or "gewijzigd" in body(): break
    ok("link session rejects a wrong current password", ("klopt niet" in body() or "incorrect" in body()) and "gewijzigd" not in body().split("Wachtwoord wijzigen")[-1], re.sub(r"\s+"," ",body())[-240:])
    sign_out()
    ok("password unchanged after rejected change", sign_in(PW2))
    # A real recovery link (same implicit hash as the email) must open the set-new-password form, with no current password.
    sign_out()
    pg.goto(auth_landing(EMAIL, "recovery"))
    try: pg.wait_for_selector("[data-testid=new-password]", timeout=25000)
    except Exception: pass
    on_reset = "reset=1" in pg.url and "/login" in pg.url and pg.locator("[data-testid=new-password]").count() == 1 and pg.locator("[data-testid=current-password]").count() == 0
    ok("recovery link opens reset form", on_reset, pg.url.split("#")[0])
    if on_reset:
        pg.fill("[data-testid=new-password]", PW3); pg.fill("input[autocomplete=new-password] >> nth=1", PW3)
        pg.get_by_role("button", name=re.compile("Wachtwoord opslaan|Save password")).click()
        for _ in range(24):
            pg.wait_for_timeout(500)
            if "gewijzigd" in body() or "changed" in body() or "klopt niet" in body(): break
        ok("reset saves without a current password", "gewijzigd" in body() or "changed" in body(), re.sub(r"\s+"," ",body())[-240:])
    else:
        ok("reset saves without a current password", False, "form not shown")
    pg.goto(B + "/privacy/#rights"); pg.wait_for_timeout(3000)
    pg.once("dialog", lambda d: d.accept()); pg.click("[data-testid=delete-account]"); pg.wait_for_timeout(1200)
    ok("delete request accepted", "Verzoek ontvangen" in body() or "Request received" in body(), body()[-300:])
    ok("no page errors", not errs, str(errs))
    b.close()
 print(f"{sum(res)}/{len(res)} passed")
finally:
    cleanup()
sys.exit(0 if res and all(res) else 1)
