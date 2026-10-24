# v29/v33 account-flow check on the live app with a throwaway test account.
# v33: email confirmation is on. The UI sign-up/resend calls are answered locally (no mail to example.com);
# the real users are created via the admin API (admin-user.mjs, no email sent).
import re, sys, time, subprocess, os
HERE = os.path.dirname(os.path.abspath(__file__))
def adm(*a): return subprocess.run(["node", "admin-user.mjs", *a], cwd=HERE, capture_output=True, text=True, check=True).stdout.strip()
from playwright.sync_api import sync_playwright
B = sys.argv[1] if len(sys.argv) > 1 else "https://app.foodporter.nl"
EMAIL = sys.argv[2]; PW1, PW2 = "Test-v29-pass1", "Test-v29-pass2"
res = []; errs = []
def ok(n, c, x=""): res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
with sync_playwright() as p:
    b = p.chromium.launch(); c = b.new_context(viewport={"width": 390, "height": 844}); pg = c.new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    # never actually send recovery mail (SMTP quota); answer the call like Supabase does
    pg.route("**/auth/v1/recover*", lambda r: r.fulfill(status=200, body="{}", content_type="application/json"))
    body = lambda: pg.inner_text("body")
    pg.goto(B + "/login/"); pg.wait_for_selector("input[type=email]")
    pg.fill("input[type=email]", EMAIL); pg.fill("input[type=password]", "short12")
    ok("create disabled < 8 chars", pg.get_by_role("button", name=re.compile("Account aanmaken|Create account")).is_disabled())
    ok("min-8 hint shown", "8 tekens" in body() or "8 characters" in body())
    import json as _j
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
    UNC = EMAIL.replace("@", "-unc@"); adm("create", UNC, PW1, "unconfirmed")
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
    ok("password changed toast", "gewijzigd" in body() or "changed" in body(), re.sub(r"\\s+"," ",body())[-300:])
    ok("privacy/delete link", pg.locator("a[href*='privacy'][href*='#rights']").count() == 1)
    pg.click("[data-testid=sign-out]"); pg.wait_for_timeout(4000)
    ok("sign-out lands on /login", "/login" in pg.url and ("Welkom" in body() or "Welcome" in body()), pg.url)
    ok("session cleared", pg.evaluate("Object.keys(localStorage).filter(k=>k.includes('auth-token')).length") == 0)
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
    pg.goto(B + "/login/?next=//evil.example"); pg.wait_for_timeout(2500)
    ok("new password works", "Ingelogd" in body() or "Signed in" in body())
    pg.goto(B + "/privacy/#rights"); pg.wait_for_timeout(3000)
    pg.once("dialog", lambda d: d.accept()); pg.click("[data-testid=delete-account]"); pg.wait_for_timeout(1200)
    ok("delete request accepted", "Verzoek ontvangen" in body() or "Request received" in body(), body()[-300:])
    ok("no page errors", not errs, str(errs))
    b.close()
print(f"{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
