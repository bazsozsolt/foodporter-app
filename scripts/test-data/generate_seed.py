"""Generates seed.sql: fictional test data for the Food Porter Tilburg pilot.
Restaurants: OpenStreetMap (ODbL) via Overpass (osm_tilburg.json). Addresses: PDOK/BAG (pdok_addresses.json).
People are invented. Phones use 06-0000xxxx (the 060 block is not issued to mobile numbers in NL).
Remove everything with:  select public.purge_test_data();"""
import json, random, math, uuid, datetime as dt
random.seed(42)
C = (51.5576, 5.0913); RADIUS = 15.0; FEE = 295
UTC = dt.timezone.utc; NOW = dt.datetime(2026, 10, 13, 22, 0, tzinfo=UTC)
def km(a, b):
    p = math.pi/180; x = (b[1]-a[1])*p*math.cos((a[0]+b[0])/2*p); y = (b[0]-a[0])*p; return 6371*math.hypot(x, y)
def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, dt.datetime): return "'" + v.isoformat() + "'"
    return "'" + str(v).replace("'", "''") + "'"
def U(): return str(uuid.uuid4())
out = []; W = out.append

# ---------- restaurants ----------
LABEL = {'pizza':'Pizza','kebab':'Kebab','sushi':'Sushi','sandwich':'Sandwiches','chinese':'Chinese','asian':'Asian','burger':'Burgers',
 'turkish':'Turkish','chicken':'Chicken','indonesian':'Indonesian','italian':'Italian','friture':'Dutch snacks','snackbar':'Dutch snacks',
 'cafetaria':'Dutch snacks','tapas':'Tapas','international':'International','korean':'Korean','greek':'Greek','french':'French',
 'japanese':'Japanese','shawarma':'Shawarma','surinamese':'Surinamese','thai':'Thai','tex-mex':'Mexican','mexican':'Mexican',
 'indian':'Indian','polish':'Polish','argentinian':'Steakhouse','steak_house':'Steakhouse','vietnamese':'Vietnamese','lebanese':'Lebanese',
 'regional':'Dutch','dutch':'Dutch','spanish':'Tapas','ramen':'Japanese','noodle':'Asian','poke':'Poke','bagel':'Sandwiches','fish':'Fish'}
MENU = {
 'Pizza':[('Pizza Margherita',1050),('Pizza Salami',1250),('Pizza Quattro Formaggi',1395),('Tiramisu',595)],
 'Italian':[('Spaghetti Carbonara',1495),('Lasagne al forno',1550),('Pizza Margherita',1095),('Panna cotta',650)],
 'Kebab':[('Kebab broodje',795),('Kapsalon',995),('Durum kip',850),('Friet met knoflooksaus',395)],
 'Shawarma':[('Shawarma broodje',795),('Shawarma schotel',1395),('Falafel wrap',750),('Hummus met brood',550)],
 'Turkish':[('Lahmacun',595),('Adana kebab schotel',1595),('Pide met kaas',1095),('Baklava (3 st.)',495)],
 'Lebanese':[('Mezze schotel',1495),('Shawarma wrap',850),('Falafel (6 st.)',650),('Fattoush',750)],
 'Sushi':[('Sushi box 16 st.',1895),('Salmon maki (8 st.)',795),('Chicken teriyaki bowl',1395),('Edamame',450)],
 'Japanese':[('Tonkotsu ramen',1595),('Gyoza (6 st.)',695),('Chicken katsu don',1495),('Miso soep',395)],
 'Poke':[('Salmon poke bowl',1450),('Tofu poke bowl',1295),('Chicken poke bowl',1395),('Edamame',450)],
 'Chinese':[('Babi pangang met rijst',1395),('Kip ketjap',1295),('Tjap tjoy',1195),('Loempia',395)],
 'Asian':[('Pad thai kip',1395),('Nasi goreng',1250),('Bami goreng',1250),('Kroepoek',295)],
 'Thai':[('Pad thai garnalen',1595),('Groene curry kip',1495),('Tom kha soep',695),('Mango sticky rice',650)],
 'Vietnamese':[('Pho bo',1495),('Banh mi kip',895),('Verse loempia (2 st.)',695),('Bun cha',1395)],
 'Korean':[('Bibimbap',1495),('Korean fried chicken',1395),('Kimchi pancake',895),('Tteokbokki',1095)],
 'Indonesian':[('Rijsttafel voor 1',1895),('Saté ajam met rijst',1395),('Gado gado',1195),('Spekkoek',450)],
 'Surinamese':[('Roti kip',1295),('Moksi meti',1495),('Broodje pom',695),('Bara (2 st.)',395)],
 'Indian':[('Butter chicken',1595),('Chana masala',1295),('Garlic naan',395),('Mango lassi',450)],
 'Burgers':[('Classic cheeseburger',1150),('Bacon burger',1350),('Veggie burger',1195),('Friet met mayo',395)],
 'Chicken':[('Crispy chicken burger',995),('Chicken wings (8 st.)',895),('Chicken bucket',1695),('Coleslaw',350)],
 'Dutch snacks':[('Patat met mayo',375),('Frikandel speciaal',375),('Kroket broodje',350),('Kipcorn',325)],
 'Sandwiches':[('Club sandwich',895),('Broodje gezond',695),('Tosti ham kaas',495),('Verse jus',395)],
 'Mexican':[('Burrito pollo',1295),('Nachos supreme',1095),('Quesadilla kaas',995),('Churros',550)],
 'Greek':[('Gyros schotel',1595),('Souvlaki pita',895),('Moussaka',1595),('Tzatziki met brood',550)],
 'Tapas':[('Patatas bravas',650),('Gambas al ajillo',995),('Albondigas',850),('Tapasplank voor 2',2495)],
 'Steakhouse':[('Biefstuk met friet',2295),('Spareribs',1995),('Caesar salad',1395),('Chocolate brownie',650)],
 'Polish':[('Pierogi (8 st.)',1095),('Zurek soep',750),('Bigos',1295),('Placki',895)],
 'Fish':[('Kibbeling',895),('Lekkerbek met friet',1095),('Haring',395),('Visburger',795)],
}
DEF = [('Dagschotel',1495),('Soep van de dag',650),('Salade',1095),('Dessert van de dag',650)]
for k in ['International','French','Dutch','Restaurant']: MENU.setdefault(k, DEF)
PREP = {'Dutch snacks':10,'Kebab':12,'Shawarma':12,'Burgers':14,'Chicken':12,'Sandwiches':8,'Pizza':16,'Sushi':20,'Steakhouse':25,'French':25,'Indonesian':22}
els = json.load(open('osm_tilburg.json'))['elements']; R = []
for e in els:
    t = e['tags']; lat = e.get('lat') or e.get('center', {}).get('lat'); lon = e.get('lon') or e.get('center', {}).get('lon')
    if not (t.get('addr:street') and t.get('addr:housenumber') and lat): continue
    if km(C, (lat, lon)) > RADIUS: continue
    raw = (t.get('cuisine') or '').split(';')[0].strip().lower()
    cu = LABEL.get(raw) or ('Dutch snacks' if t['amenity'] == 'fast_food' and not raw else ('Restaurant' if not raw else raw.replace('_', ' ').title()))
    if cu not in MENU: cu_menu = DEF
    else: cu_menu = MENU[cu]
    city = t.get('addr:city', 'Tilburg'); pc = t.get('addr:postcode', '')
    area = t.get('addr:suburb') or (city if city != 'Tilburg' else 'Tilburg')
    R.append(dict(id=U(), name=t['name'], cuisine=cu, menu=cu_menu, area=area, lat=lat, lng=lon, osm=f"{e['type']}/{e['id']}",
      address=f"{t['addr:street']} {t['addr:housenumber']}, {(pc + ' ') if pc else ''}{city}", prep=PREP.get(cu, 18)))
W("-- generated by scripts/test-data/generate_seed.py; remove with: select public.purge_test_data();")
W("alter table orders disable trigger user; alter table bids disable trigger user;")
W("insert into restaurants (id,name,cuisine,area,address,avg_prep_minutes,commission_pct,active,lat,lng,is_test,description,osm_ref) values")
W(",\n".join(f"({q(r['id'])},{q(r['name'])},{q(r['cuisine'])},{q(r['area'])},{q(r['address'])},{r['prep']},12,true,{r['lat']},{r['lng']},true,'Test data from OpenStreetMap, not a partner',{q(r['osm'])})" for r in R) + ";")
MI = {}
rows = []
for r in R:
    MI[r['id']] = []
    for n, p in r['menu']:
        i = U(); MI[r['id']].append((i, n, p)); rows.append(f"({q(i)},{q(r['id'])},{q(n)},'Example dish and example price (test data)',{p},true)")
W("insert into menu_items (id,restaurant_id,name,description,price_cents,available) values\n" + ",\n".join(rows) + ";")

# ---------- people ----------
FN = ['Anouk','Bram','Daan','Eva','Fleur','Gijs','Hanna','Iris','Jesse','Julia','Kees','Lotte','Luuk','Maud','Mila','Noah','Olaf','Pien','Ruben','Sanne','Sem','Tess','Thijs','Vera','Wout','Yara','Zoë','Amira','Bilal','Chen','Dilan','Elif','Farid','Ilse','Jorien','Karim','Lieke','Milan','Nadia','Owen','Priya','Rik','Selin','Timo','Unai','Vince','Wendy','Xander','Yusuf','Zara']
LN = ['Brabander','Klompstra','Veldhoven-Test','Molenkamp','Doornbos','Kastanje','Vennema','Heidepoort','Lindeboom','Ruisdael','Akkerman','Beekhuis','Zandvliet','Hoefsmid','Wilgenburg','Korenaar','Steenuil','Dennenoord','Berkhof','Vlasman','Esdoorn','Gagelveld','Maasdonk','Pijnacker-Fictief','Rozendaal']
addrs = [a for a in json.load(open('pdok_addresses.json')) if a.get('centroide_ll')]
def pt(a):
    x, y = a['centroide_ll'].replace('POINT(', '').replace(')', '').split(); return float(y), float(x)
addrs = [a for a in addrs if km(C, pt(a)) <= RADIUS]
random.shuffle(addrs)
def person(i, kind):
    f = random.choice(FN); l = random.choice(LN)
    return dict(id=U(), name=f"{f} {l}", email=f"{kind}.{f.lower().replace('ë','e')}.{l.lower().split('-')[0]}.{i:03d}@example.com",
                phone=f"+31 6 0000 {random.randint(0,9999):04d}")
CU = [person(i, 'testklant') for i in range(100)]
for c, a in zip(CU, addrs):
    hn = str(a['huisnummer']) + (a.get('huisletter') or '') + (('-' + a['huisnummertoevoeging']) if a.get('huisnummertoevoeging') else '')
    c['addr'] = f"{a['straatnaam']} {hn}, {a['postcode']} {a['woonplaatsnaam']}"; c['pt'] = pt(a)
RI = [person(i, 'testrider') for i in range(15)]
def users(ps, role):
    W("insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values\n" + ",\n".join(
      f"('00000000-0000-0000-0000-000000000000',{q(p['id'])},'authenticated','authenticated',{q(p['email'])},'',{q(NOW - dt.timedelta(days=40))},'{{\"provider\":\"email\",\"providers\":[\"email\"],\"is_test\":true}}',{q(json.dumps({'full_name': p['name']}))},{q(NOW - dt.timedelta(days=40))},{q(NOW)})" for p in ps) + ";")
    W(f"update profiles p set role='{role}', is_test=true, phone=v.phone, full_name=v.name, created_at=v.ts from (values " + ",".join(
      f"({q(p['id'])}::uuid,{q(p['phone'])},{q(p['name'])},{q(NOW - dt.timedelta(days=random.randint(31, 60)))}::timestamptz)" for p in ps) + ") v(id,phone,name,ts) where p.id=v.id;")
users(CU, 'customer'); users(RI, 'rider')
W("update profiles set status='active' where is_test and status <> 'active';")
W(f"update profiles set status='suspended', status_reason='Test: repeated late deliveries (fictional)', status_changed_at={q(NOW - dt.timedelta(days=6))} where id={q(RI[14]['id'])};")
W(f"update profiles set online=true, location_consent_at={q(NOW - dt.timedelta(days=20))} where id in ({','.join(q(r['id']) for r in RI[:4])});")
active_riders = RI[:14]

# ---------- orders ----------
popular = random.sample(R, min(28, len(R)))
weights = [random.uniform(0.5, 3) for _ in popular]
def dinner_time(day):
    h = random.choices([12, 13, 17, 18, 19, 20, 21, 22], [5, 5, 10, 22, 26, 18, 9, 5])[0]
    local = dt.datetime(day.year, day.month, day.day, h, random.randint(0, 59), random.randint(0, 59), tzinfo=dt.timezone(dt.timedelta(hours=2)))
    return local.astimezone(UTC)
cases = (['delivered'] * 84 + ['late'] * 12 + ['rejected'] * 7 + ['timeout'] * 6 + ['pay_failed'] * 5 + ['pay_expired'] * 4 + ['paid_after_cancel'] * 3)
random.shuffle(cases)
LOWC = ['Food arrived cold and soggy.', 'Rider was 25 minutes late, no update.', 'Wrong item delivered, missing sauce.', 'Packaging leaked all over the bag.', 'Portion much smaller than expected.']
HIGHC = ['Lekker en snel!', 'Great food, friendly rider.', None, None, 'Hot and on time 👍', None]
seq = 0; S = []  # statements inside DO block
def ev(ts, typ, frm, to): S.append(f"insert into audit_events (order_id,type,from_value,to_value,created_at) values (oid,'{typ}',{q(frm)},{q(to)},{q(ts)});")
mins = lambda m: dt.timedelta(minutes=m); secs = lambda s: dt.timedelta(seconds=s)
counts = {}; deliv = []
ext_left = 14; nobid_left = 3; incident_orders = []
for n, case in enumerate(cases):
    day = (NOW - dt.timedelta(days=random.randint(1, 30))).date()
    t0 = dinner_time(day)
    if t0 > NOW - mins(90): t0 -= dt.timedelta(days=1)
    r = random.choices(popular, weights)[0]; c = random.choice(CU)
    items = random.sample(MI[r['id']], random.randint(1, 3)); lines = [(i, nm, random.choice([1, 1, 1, 2]), p) for i, nm, p in items]
    sub = sum(qt * p for _, _, qt, p in lines); comm = round(sub * 12 / 100); dist = round(km((r['lat'], r['lng']), c['pt']), 2)
    o = dict(status='delivered', paid_at=t0 + secs(random.randint(40, 120)), accepted_at=None, assigned_at=None, ready_at=None, picked_up_at=None, delivered_at=None,
             prep=None, rider=None, payment_status='paid', cancel_reason=None, cancelled_at=None, refund_id=None, refund_status=None, refund_cents=None, refunded_at=None, win=None)
    S.append("")
    evs = [(t0, 'status_change', None, 'awaiting_payment')]
    if case in ('pay_failed', 'pay_expired'):
        o.update(status='payment_failed', paid_at=None, payment_status='failed' if case == 'pay_failed' else 'expired')
        evs.append((t0 + mins(2 if case == 'pay_failed' else 30), 'status_change', 'awaiting_payment', 'payment_failed'))
    elif case == 'paid_after_cancel':
        ca = t0 + mins(random.randint(4, 12)); o.update(status='cancelled', cancel_reason='admin_cancelled', cancelled_at=ca, paid_at=ca + mins(random.randint(1, 6)),
            refund_id='re_test_seed_' + uuid.uuid4().hex[:10], refund_status='refunded', refund_cents=sub + FEE)
        o['refunded_at'] = o['paid_at'] + mins(1); evs.append((ca, 'status_change', 'awaiting_payment', 'cancelled'))
    else:
        evs.append((o['paid_at'], 'status_change', 'awaiting_payment', 'placed'))
        if case in ('rejected', 'timeout'):
            ca = o['paid_at'] + (mins(random.randint(1, 4)) if case == 'rejected' else mins(5))
            o.update(status='cancelled', cancel_reason='restaurant_rejected' if case == 'rejected' else 'restaurant_timeout', cancelled_at=ca,
                     refund_id='re_test_seed_' + uuid.uuid4().hex[:10], refund_status='refunded', refund_cents=sub + FEE, refunded_at=ca + mins(1))
            evs.append((ca, 'status_change', 'placed', 'cancelled'))
        else:
            acc = o['paid_at'] + secs(random.randint(30, 240)); prep = r['prep'] + random.choice([-2, 0, 0, 3, 5])
            o.update(accepted_at=acc, prep=prep); evs += [(acc, 'status_change', 'placed', 'accepted'), (acc, 'prep_set', None, str(prep))]
            first = acc + secs(random.randint(8, 80)); slow = nobid_left > 0 and random.random() < 0.06
            if slow: first = acc + mins(random.randint(5, 8)); nobid_left -= 1; o['nobid'] = acc + mins(5)
            close = first + secs(60); nb = random.choices([1, 2, 3, 4], [25, 40, 25, 10])[0]
            bidders = random.sample(active_riders, nb); bids = []
            for k, b in enumerate(bidders):
                bt = first + secs(0 if k == 0 else random.randint(3, 55)); eta = int(max(0, (acc + mins(prep) - bt).total_seconds() / 60) + dist * 3 + random.randint(6, 16)); bids.append([b, eta, bt])
            bids.sort(key=lambda x: (x[1], x[2])); win = bids[0]; o['bids'] = bids; o['rider'] = win[0]; o['win'] = win
            asg = close + secs(random.randint(1, 5)); o['assigned_at'] = asg; evs.append((asg, 'status_change', 'accepted', 'assigned'))
            if ext_left > 0 and random.random() < 0.16:
                ext_left -= 1; et = acc + mins(max(4, prep - 4)); evs.append((et, 'prep_extended', str(prep), str(prep + 10))); prep += 10; o['prep'] = prep
            ready = acc + mins(prep) + secs(random.randint(-120, 150)); o['ready_at'] = ready; evs.append((ready, 'status_change', 'assigned', 'ready'))
            pick = max(ready, asg + mins(random.randint(4, 10))) + secs(random.randint(30, 180)); o['picked_up_at'] = pick; evs.append((pick, 'status_change', 'ready', 'picked_up'))
            due = asg + mins(win[1])
            dl = due + mins(random.randint(5, 22)) if case == 'late' else min(due - secs(random.randint(30, 400)), pick + mins(max(4, dist * 3 + 3)))
            if dl <= pick: dl = pick + mins(4)
            o['delivered_at'] = dl; evs.append((dl, 'status_change', 'picked_up', 'delivered')); deliv.append((o, r, c, case))
    counts[case] = counts.get(case, 0) + 1
    oc = ['customer_id','restaurant_id','rider_id','status','subtotal_cents','delivery_fee_cents','commission_cents','address','phone','prep_minutes','ready_at','mollie_payment_id','created_at','accepted_at','assigned_at','picked_up_at','delivered_at','paid_at','payment_status','lat','lng','distance_km','cancel_reason','cancelled_at','refund_id','refund_status','refund_cents','refunded_at','is_test','sms_sent']
    vals = [c['id'], r['id'], o['rider']['id'] if o['rider'] else None, o['status'], sub, FEE, comm, c['addr'], c['phone'], o['prep'], o['ready_at'], 'tr_test_seed_' + uuid.uuid4().hex[:10], t0,
            o['accepted_at'], o['assigned_at'], o['picked_up_at'], o['delivered_at'], o['paid_at'], o['payment_status'], c['pt'][0], c['pt'][1], dist, o['cancel_reason'], o['cancelled_at'],
            o['refund_id'], o['refund_status'], o['refund_cents'], o['refunded_at'], True]
    S.append(f"insert into orders ({','.join(oc)}) values ({','.join(q(v) for v in vals)},'{{}}') returning id into oid;")
    S.append("insert into order_items (order_id,menu_item_id,name,qty,price_cents) values " + ",".join(f"(oid,{q(i)},{q(nm)},{qt},{p})" for i, nm, qt, p in lines) + ";")
    for e in sorted(evs, key=lambda x: x[0]): ev(*e)
    if o.get('bids'):
        S.append("insert into bids (order_id,rider_id,eta_minutes,accepted,created_at,rider_name) values " + ",".join(
            f"(oid,{q(b[0]['id'])},{b[1]},{q(b is o['win'])},{q(b[2])},{q(b[0]['name'])})" for b in o['bids']) + ";")
        S.append(f"update orders set bid_window_closes_at={q(o['bids'][0][2] if False else min(b[2] for b in o['bids']) + secs(60))} where id=oid;")
    if o['status'] == 'delivered':
        S.append(f"insert into earnings (rider_id,order_id,amount_cents,earned_at) values ({q(o['rider']['id'])},oid,{FEE},{q(o['delivered_at'])});")
        rr = random.random()
        if rr < 0.58:
            low = case == 'late' and random.random() < 0.6 or random.random() < 0.07
            fs = random.choice([1, 2, 2]) if low else random.choice([4, 4, 5, 5, 5]); rs = random.choice([1, 2]) if low else random.choice([4, 5, 5])
            com = random.choice(LOWC) if low else random.choice(HIGHC)
            S.append(f"insert into ratings (order_id,customer_id,food_stars,rider_stars,comment,created_at) values (oid,{q(c['id'])},{fs},{rs},{q(com)},{q(o['delivered_at'] + mins(random.randint(10, 300)))});")
            counts['rating_low' if low else 'rating_ok'] = counts.get('rating_low' if low else 'rating_ok', 0) + 1
        if len(incident_orders) < 5 and random.random() < 0.08: incident_orders.append(True); S.append(f"perform 1; -- incident\n insert into incidents (type,severity,status,order_id,rider_id,restaurant_id,description,occurred_at,created_at,resolved_at,is_test) values " +
            "({},{},{},oid,{},{},{},{},{},{},true);".format(*[q(x) for x in (lambda k: (k[0], k[1], k[2], o['rider']['id'], r['id'], 'TEST (fictional): ' + k[3], o['delivered_at'], o['delivered_at'] + mins(30), (o['delivered_at'] + dt.timedelta(days=1)) if k[2] == 'resolved' else None))(
              [('food_safety','high','open','Customer reports undercooked chicken; restaurant asked to review kitchen process.'),('damaged_goods','medium','resolved','Drinks spilled in bag, partial refund offered.'),
               ('food_safety','critical','open','Possible allergen (peanut) in dish labelled nut-free.'),('complaint','low','resolved','Rider rude at the door (customer report).'),('accident','medium','resolved','Rider slipped on wet road, minor scrape, no food damaged.')][len(incident_orders) - 1])]))
    if o['status'] == 'cancelled' and case == 'timeout':
        S.append(f"insert into ops_alerts (kind,order_id,message,created_at,resolved_at) values ('restaurant_timeout',oid,'Restaurant did not accept within 5 min: cancelled and refunded (test data)',{q(o['cancelled_at'])},{q(o['cancelled_at'] + mins(20))});")
    if case == 'paid_after_cancel':
        S.append(f"insert into ops_alerts (kind,order_id,message,created_at,resolved_at) values ('late_payment',oid,'Payment arrived after the order was cancelled: refunding automatically. (test data)',{q(o['paid_at'])},{q(o['paid_at'] + mins(45))});")
    if o.get('nobid'):
        S.append(f"insert into ops_alerts (kind,order_id,message,created_at,resolved_at) values ('no_bid',oid,'No rider bid within 5 min (test data)',{q(o['nobid'])},{q(o['nobid'] + mins(3))});")
        counts['no_bid_alert'] = counts.get('no_bid_alert', 0) + 1
counts['prep_extended'] = 14 - ext_left; counts['incidents'] = len(incident_orders)

# live orders for the map (in progress right now; loc points within 7 days)
LIVE_NOW = 'now()'
for k, (st, rider) in enumerate([('picked_up', active_riders[0]), ('assigned', active_riders[1]), ('ready', active_riders[2])]):
    r = popular[k]; c = CU[90 + k]; it = MI[r['id']][0]; sub = it[2]
    S.append("")
    S.append(f"insert into orders (customer_id,restaurant_id,rider_id,status,subtotal_cents,delivery_fee_cents,commission_cents,address,phone,prep_minutes,mollie_payment_id,created_at,accepted_at,assigned_at,ready_at,picked_up_at,paid_at,payment_status,lat,lng,distance_km,is_test,sms_sent,bid_window_closes_at) values "
             f"({q(c['id'])},{q(r['id'])},{q(rider['id'])},'{st}',{sub},{FEE},{round(sub*0.12)},{q(c['addr'])},{q(c['phone'])},{r['prep']},'tr_test_seed_live{k}',now()-interval '25 min',now()-interval '23 min',now()-interval '21 min',"
             f"{'now()-interval '+chr(39)+'5 min'+chr(39) if st != 'assigned' else 'null'},{'now()-interval '+chr(39)+'3 min'+chr(39) if st == 'picked_up' else 'null'},now()-interval '24 min','paid',{c['pt'][0]},{c['pt'][1]},{round(km((r['lat'],r['lng']),c['pt']),2)},true,'{{}}',now()-interval '22 min') returning id into oid;")
    S.append(f"insert into order_items (order_id,menu_item_id,name,qty,price_cents) values (oid,{q(it[0])},{q(it[1])},1,{sub});")
    S.append(f"insert into bids (order_id,rider_id,eta_minutes,accepted,created_at,rider_name) values (oid,{q(rider['id'])},25,true,now()-interval '22 min',{q(rider['name'])});")
    S.append(f"insert into audit_events (order_id,type,to_value,created_at) values (oid,'status_change','awaiting_payment',now()-interval '25 min'),(oid,'status_change','placed',now()-interval '24 min'),(oid,'status_change','accepted',now()-interval '23 min'),(oid,'status_change','assigned',now()-interval '21 min');")
    a = (r['lat'], r['lng']); b = c['pt'] if st == 'picked_up' else a
    start = (a[0] + 0.01, a[1] - 0.012) if st != 'picked_up' else a
    frac_end = 0.55 if st == 'picked_up' else 0.85
    pts = ",".join(f"({q(rider['id'])},oid,{start[0] + (b[0]-start[0])*frac_end*i/12:.6f},{start[1] + (b[1]-start[1])*frac_end*i/12:.6f},12,now()-interval '{(12-i)*8} seconds')" for i in range(13))
    S.append(f"insert into rider_locations (rider_id,order_id,lat,lng,accuracy_m,created_at) values {pts};")
counts['live_in_progress'] = 3
# a 4th online rider idle near the centre
S.append(f"insert into rider_locations (rider_id,lat,lng,accuracy_m,created_at) values ({q(active_riders[3]['id'])},51.5601,5.0838,15,now()-interval '20 seconds');")

W("do $$ declare oid bigint; begin\n" + "\n".join(S) + "\nend $$;")
W("alter table orders enable trigger user; alter table bids enable trigger user;")
# weekly rider payouts for completed weeks (Mon-Sun, Europe/Amsterdam ~ UTC+2)
W("""with wk as (select e.rider_id, date_trunc('week', e.earned_at at time zone 'Europe/Amsterdam')::date ws, sum(amount_cents) amt
  from earnings e join profiles p on p.id = e.rider_id and p.is_test where e.payout_id is null
  and date_trunc('week', e.earned_at at time zone 'Europe/Amsterdam') < date_trunc('week', timestamp '2026-10-13') group by 1, 2),
ins as (insert into payouts (rider_id, week_start, amount_cents, paid_at, reference, period_start, period_end, is_test)
  select rider_id, ws, amt, (ws + 8)::timestamp + interval '10 hours', 'TEST-SEED-' || to_char(ws, 'IYYY-IW'), ws, ws + 6, true from wk returning id, rider_id, week_start)
update earnings e set payout_id = ins.id from ins where e.rider_id = ins.rider_id and date_trunc('week', e.earned_at at time zone 'Europe/Amsterdam')::date = ins.week_start and e.payout_id is null;""")
W("select jsonb_build_object('restaurants',(select count(*) from restaurants where is_test),'menu_items',(select count(*) from menu_items m join restaurants r on r.id=m.restaurant_id where r.is_test),'customers',(select count(*) from profiles where is_test and role='customer'),'riders',(select count(*) from profiles where is_test and role='rider'),'orders',(select count(*) from orders where is_test),'payouts',(select count(*) from payouts where is_test)) as seeded;")
open('seed.sql', 'w').write("\n".join(out))
json.dump(counts, open('seed_counts.json', 'w'), indent=1)
print(len(R), 'restaurants', counts)
import os
os.makedirs('/tmp/seedparts', exist_ok=True)
for i, p in enumerate(out): open(f'/tmp/seedparts/{i:02d}.sql', 'w').write(p)
