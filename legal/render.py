# Renders legal/templates/*.md -> public/legal/<id>.html + <id>-v<version>.pdf + index.json (draft templates; not legal advice)
import json, pathlib, re, markdown
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent; out = root.parent / "public" / "legal"; out.mkdir(parents=True, exist_ok=True)
CSS = "body{font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111;max-width:760px;margin:24px auto;padding:0 16px}h1{font-size:20pt}h2{font-size:14pt;margin-top:1.4em}table{border-collapse:collapse;width:100%;font-size:9.5pt}td,th{border:1px solid #bbb;padding:4px 6px;vertical-align:top}blockquote{border-left:4px solid #e11d48;background:#fff1f2;margin:12px 0;padding:8px 12px}hr{margin:24px 0}.meta{color:#555;font-size:9pt}"
docs = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for f in sorted((root / "templates").glob("*.md")):
        src = f.read_text(); fm, body = re.match(r"^---\n(.*?)\n---\n(.*)$", src, re.S).groups()
        meta = dict(l.split(": ", 1) for l in fm.splitlines()); body = re.sub(r"\n(\*\*|  - )", lambda m: "\n\n" + m.group(1), body)
        html_body = markdown.markdown(body, extensions=["tables"])
        foot = f"<p class='meta'>{meta['id']} · versie {meta['version']} · Concept – laat beoordelen door een Nederlandse jurist voor gebruik.</p>"
        (out / f"{meta['id']}.html").write_text(f"<div class='legal-doc'>{html_body}{foot}</div>")
        page = f"<!doctype html><html lang=nl><meta charset=utf-8><title>{meta['title']}</title><style>{CSS}</style><body>{html_body}{foot}</body></html>"
        pg.set_content(page); pdf = f"{meta['id']}-v{meta['version']}.pdf"
        pg.pdf(path=str(out / pdf), format="A4", margin={"top": "18mm", "bottom": "18mm", "left": "16mm", "right": "16mm"},
               display_header_footer=True, header_template="<span></span>",
               footer_template="<div style='font-size:7pt;width:100%;text-align:center;color:#666'>CONCEPT – geen juridisch advies · <span class=pageNumber></span>/<span class=totalPages></span></div>")
        docs.append({**meta, "file": f, "pdf": pdf, "html": f"{meta['id']}.html"})
    b.close()
for d in docs: d["file"] = d["file"].name
(out / "index.json").write_text(json.dumps(docs, ensure_ascii=False, indent=1))
print(len(docs), "rendered")
