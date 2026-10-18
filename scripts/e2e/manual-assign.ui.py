# Hand-assigned rider (no bid): restaurant card, customer tracking and admin detail show the rider's name + ETA; outsiders get nothing.
import re, sys, subprocess
from playwright.sync_api import sync_playwright
creds = dict(l.split("=",1) for l in open("/workspace/fptest/.creds").read().strip().split("\n"))
B = sys.argv[1] if len(sys.argv) > 1 else "https://bazsozsolt.github.io/foodporter-app"
def NODE(js): return subprocess.run(["node","--input-type=module","-e","import * as m from '/workspace/foodporter-app/scripts/e2e/common.mjs';"+js+";process.exit(0)"],capture_output=True,text=True,cwd="/workspace/foodporter-app/scripts/e2e").stdout.strip().split("\n")[-1]
res = []
def ok(n, c, x=""): res.append(c); print(("PASS " if c else "FAIL ") + n + (f" — {x}" if x else ""))
RID = "187f751c-bebb-4a34-9d4b-9b1a9e8851db"
oid = NODE(f"""const a=await m.login('ADMIN'), c=await m.login('SIMC1'), s=await m.login('STAFF'), r=await m.login('SIMR1');
const it=(await a.sb.from('menu_items').select('id,name,price_cents').eq('restaurant_id','{RID}').eq('available',true).limit(1)).data[0];
const o=(await c.sb.from('orders').insert({{customer_id:c.id,restaurant_id:'{RID}',subtotal_cents:it.price_cents,delivery_fee_cents:295,address:'FP TEST: Heuvelstraat 12, Tilburg',phone:'+31 6 0000 0000'}}).select('id').single()).data;
await c.sb.from('order_items').insert({{order_id:o.id,menu_item_id:it.id,name:it.name,qty:1,price_cents:it.price_cents}});
await a.sb.from('orders').update({{status:'placed',paid_at:new Date().toISOString(),payment_status:'paid',mollie_payment_id:'tr_sim_manual_'+Date.now(),lat:51.5555,lng:5.0913,is_test:true}}).eq('id',o.id);
await s.sb.from('orders').update({{status:'accepted',prep_minutes:15,ready_at:new Date(Date.now()+900000).toISOString()}}).eq('id',o.id);
await a.sb.from('orders').update({{status:'assigned',rider_id:r.id,assigned_at:new Date().toISOString()}}).eq('id',o.id);
console.log(o.id)""")
name = NODE("const r=await m.login('SIMR1'); const {data}=await r.sb.from('profiles').select('full_name').eq('id',r.id).single(); console.log((data.full_name||'').split(' ')[0])")
print("order", oid, "rider", name)
out = NODE(f"const o=await m.login('OUTSIDER'); const {{data}}=await o.sb.rpc('order_rider_info',{{p_order:{oid}}}); console.log(JSON.stringify(data))")
ok("outsider cannot read rider info", out == "null", out)
def page(acct, url, sel, view=None):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport=view or {"width": 390, "height": 844})
        pg.goto(B + "/login/"); pg.wait_for_load_state("networkidle")
        pg.fill("input[type=email]", creds[acct + "_EMAIL"]); pg.fill("input[type=password]", creds[acct + "_PASSWORD"])
        pg.get_by_role("button", name=re.compile("^(Inloggen|Sign in)$")).click(); pg.wait_for_timeout(3000)
        pg.goto(B + url)
        try:
            pg.wait_for_selector(sel, timeout=20000); t = pg.inner_text(sel)
            for _ in range(40):  # poll in Python: the live CSP blocks string eval in wait_for_function
                if "…" not in t: break
                pg.wait_for_timeout(250); t = pg.inner_text(sel)
        except Exception as e: t = "MISSING " + str(e)[:80]
        b.close(); return t
t = page("STAFF", "/restaurant/", f"[data-testid=col-prep] div.rounded-2xl:has(b:text-is('#{oid}')) [data-testid=assigned-rider]")  # v28: this test's own card, not the first one
ok("restaurant card shows hand-assigned rider + ETA", name in t and "ETA" in t and "bod" not in t, t)
t = page("SIMC1", f"/order/?id={oid}", "[data-testid=assigned-rider]")
ok("customer tracking shows hand-assigned rider", name in t, t)
t = page("ADMIN", f"/admin/orders/?id={oid}", "[data-testid=admin-rider]", {"width": 1280, "height": 900})
ok("admin detail shows hand-assigned rider + ETA", name in t and "ETA" in t, t)
NODE(f"const a=await m.login('ADMIN'); await a.sb.from('orders').update({{status:'cancelled',cancel_reason:'test: manual assign'}}).eq('id',{oid})")
print(f"{sum(res)}/{len(res)} passed"); sys.exit(0 if all(res) else 1)
