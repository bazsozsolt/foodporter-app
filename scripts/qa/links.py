# Static link/image check over the static export (out/): internal hrefs/srcs, legal PDFs, plus external links from src (HEAD, sequential).
import re, pathlib, subprocess, json, sys
root = pathlib.Path("out"); BP = "/foodporter-app"
bad, ext, seen = [], set(), set()
def exists(u):
    u = u.split("#")[0].split("?")[0]
    if not u.startswith(BP): return True
    p = u[len(BP):] or "/"
    c = [root / p.lstrip("/"), root / p.lstrip("/") / "index.html", root / (p.strip("/") + ".html")]
    if re.search(r"/r/[^/]+/?$|/order/[^/]+/?$|/group/[^/]+/?$", p): return True  # dynamic, handled by SPA fallback
    return any(x.is_file() for x in c)
for f in root.rglob("*.html"):
    s = f.read_text(errors="ignore")
    for attr, u in re.findall(r'(href|src)="([^"]+)"', s):
        if u.startswith(("http://", "https://")):
            if "foodporter-app" not in u: ext.add(u)
            continue
        if u.startswith(("mailto:", "tel:", "data:", "#", "javascript:")): continue
        if (u) in seen: continue
        seen.add(u)
        if not exists(u): bad.append((str(f), u))
for f in pathlib.Path("src").rglob("*.tsx"):
    for u in re.findall(r'https?://[^\s"\'`)<>{}]+', f.read_text()):
        if not re.search(r"supabase\.co|localhost|\$\{|example|w3\.org|schema", u): ext.add(u.rstrip(".,;"))
idx = json.load(open("public/legal/index.json"))
for d in idx:
    for k in ("pdf", "html"):
        if not (root / "legal" / d[k]).is_file(): bad.append(("legal/index.json", d[k]))
print("internal checked", len(seen), "broken", len(bad))
for b in bad[:50]: print("BROKEN", b)
extbad = []
for u in sorted(ext):
    r = subprocess.run(["curl", "-sS", "-o", "/dev/null", "-L", "--max-time", "12", "-A", "Mozilla/5.0 FP-linkcheck", "-w", "%{http_code}", u], capture_output=True, text=True)
    code = r.stdout.strip()
    if not code.startswith(("2", "3")): extbad.append((code, u))
print("external checked", len(ext), "non-2xx", len(extbad))
for e in extbad: print("EXT", e)
