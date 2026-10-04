// Карта ризиків SK Security — клієнтський застосунок.
// Два режими: DemoBackend (вигадані дані, localStorage) і SupabaseBackend (вхід за логіном і паролем, RLS у базі).
import { loadAccess, getSession, setSession, demoLogin, ROLE_UK } from './demo-store.js';
import { buildTripDoc, buildDutyDoc } from './duty.js';
const CFG = window.SKS_CONFIG || {};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KIND = { office: 'Офіс', warehouse: 'Склад', store: 'Магазин', production: 'Виробництво', terminal: 'Термінал', residence: 'Житло персоналу', other: 'Інше' };
const KIND_COLOR = { office: '#1565c0', warehouse: '#00897b', store: '#5c6bc0', production: '#6d4c41', terminal: '#00838f', residence: '#8e24aa', other: '#546e7a' };
const CAT_COLOR = { military: '#e53935', crime: '#6a1b9a', registry: '#f9a825', technogenic: '#ef6c00', civil: '#607d8b' };
const CAT_NAME = { military: 'воєнні', crime: 'кримінальні', registry: 'рейдерство / тиск', technogenic: 'техногенні', civil: 'інше' };
const LEVELS = ['', 'Низький', 'Помірний', 'Високий', 'Критичний'];

// ---------------- геометрія ----------------
function km(a, b) { const R = 6371, t = x => x * Math.PI / 180, dLa = t(b[0] - a[0]), dLo = t(b[1] - a[1]);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
function inRing(pt, ring) { let x = pt[1], y = pt[0], ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) ins = !ins; } return ins; }
function inPoly(ll, polys) { return polys.some(p => inRing(ll, p[0]) && !p.slice(1).some(h => inRing(ll, h))); }
function segKm(p, a, b) { const kx = 111.32 * Math.cos(p[0] * Math.PI / 180), ky = 110.57;
  const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky, bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy; return Math.sqrt(x * x + y * y); }

// ---------------- спільна логіка оцінки (демо; у робочому режимі — функція object_risk у базі) ----------------
function makeAreaIndex(areas) {
  const occ = [], segs = [];
  (areas.features || []).forEach(f => { const g = f.geometry, sw = c => [c[1], c[0]];
    if (g.type === 'Polygon') { if (f.properties.kind !== 'frontline' && f.properties.type !== 'current_frontline') occ.push(g.coordinates); g.coordinates.forEach(r => { for (let i = 1; i < r.length; i++) segs.push([sw(r[i - 1]), sw(r[i])]); }); }
    if (g.type === 'LineString') { const r = g.coordinates; for (let i = 1; i < r.length; i++) segs.push([sw(r[i - 1]), sw(r[i])]); } });
  return { inOcc: ll => occ.some(p => inRing(ll, p[0])),
    frontKm: ll => { let m = 1e9; for (const s of segs) { if (Math.abs(s[0][0] - ll[0]) > 3 && Math.abs(s[1][0] - ll[0]) > 3) continue; const d = segKm(ll, s[0], s[1]); if (d < m) m = d; } return m < 1e8 ? Math.round(m) : null; } };
}
function scoreRisk(ctx) {
  let s = 0; const why = [];
  if (ctx.inOcc) { s = 100; why.push('об\'єкт на окупованій території (за останнім контуром)'); }
  const f = ctx.frontKm;
  if (f != null) { if (f < 20) { s += 40; why.push(`до лінії фронту ${f} км`); } else if (f < 50) { s += 25; why.push(`прифронтова смуга: ${f} км до лінії фронту`); } else if (f < 100) { s += 10; why.push(`до лінії фронту ${f} км`); } }
  const c = ctx.counts;
  const zone = ctx.corridor ? `у коридорі ${ctx.radius} км від маршруту` : `у радіусі ${ctx.radius} км`;
  if (c.military) { s += Math.min(30, 5 * c.military); why.push(`${c.military} воєнних інцидентів ${zone} за ${ctx.days} днів`); }
  if (c.crime) { s += Math.min(15, 3 * c.crime); why.push(`${c.crime} кримінальних інцидентів ${zone}`); }
  if (c.registry) { s += 10; why.push('випадки рейдерства / тиску на бізнес поблизу'); }
  if (ctx.alertHours > 50) { s += 10; why.push(`тривоги в області: ${ctx.alertHours} год за 30 днів`); } else if (ctx.alertHours > 20) { s += 5; why.push(`тривоги в області: ${ctx.alertHours} год за 30 днів`); }
  if (ctx.crime != null && ctx.crimeAvg != null && ctx.crime > ctx.crimeAvg * 1.2) { s += 8; why.push(`рівень злочинності в області вище середнього (${ctx.crime} проти ${ctx.crimeAvg} на 10 тис.)`); }
  const level = ctx.inOcc ? 4 : s >= 55 ? 3 : s >= 25 ? 2 : 1;
  return { score: s, level, level_name: LEVELS[level], why };
}

// ---------------- DemoBackend ----------------
class DemoBackend {
  constructor() { this.mode = 'demo'; this.key = 'sks-riskmap-demo-v1'; }
  async init() {
    const sess = getSession();
    if (!sess) return null;
    this.d = await fetch('demo/demo-data.json').then(r => r.json());
    let saved = null; try { saved = JSON.parse(localStorage.getItem(this.key)); } catch (e) { }
    this.objs = saved && saved.objs ? saved.objs : this.d.objects.slice();
    this.extraInc = saved && saved.inc ? saved.inc : [];
    this.areaIx = makeAreaIndex(this.d.areas);
    const acc = loadAccess();
    const orgs = sess.role === 'analyst' ? acc.orgs : acc.orgs.filter(o => o.id === sess.org_id);
    return { user: { email: sess.email }, profile: { role: sess.role, org_id: sess.org_id, full_name: sess.full_name }, orgs };
  }
  persist() { try { localStorage.setItem(this.key, JSON.stringify({ objs: this.objs, inc: this.extraInc })); } catch (e) { } }
  async oblasts() { return this.d.oblasts; }
  async areas() { return this.d.areas; }
  async alerts() { const m = {}; this.d.oblasts.features.forEach(f => { const s = this.d.alerts[f.properties.alert_key]; if (s) m[f.properties.code] = !!s.alertnow; }); return { map: m, time: this.d.alerts_time + ' (знімок)', hours: {} }; }
  async regionStats(metric) { return metric === 'hist' ? Object.fromEntries(Object.entries(this.d.hist).map(([k, v]) => [k, v.total || 0])) : {}; }
  allIncidents() { return this.d.incidents.concat(this.extraInc); }
  async incidents(bbox, days, cats) {
    const since = daysAgo(days);
    return this.allIncidents().filter(i => i.occurred_at >= since && (!cats || cats.includes(i.category)) &&
      i.lat >= bbox[1] && i.lat <= bbox[3] && i.lon >= bbox[0] && i.lon <= bbox[2]);
  }
  async objects(org) { return this.objs.filter(o => !org || o.org_id === org); }
  async saveObject(o) { if (o.id) { const i = this.objs.findIndex(x => x.id === o.id); this.objs[i] = { ...this.objs[i], ...o }; } else { o.id = 'u' + Date.now(); this.objs.push(o); } this.persist(); return o; }
  async deleteObject(id) { this.objs = this.objs.filter(o => o.id !== id); this.persist(); }
  async saveIncident(i) { i.id = 'm' + Date.now(); this.extraInc.push(i); this.persist(); return i; }
  async incidentTypes() { return DEMO_TYPES; }
  async objectRisk(id, days) {
    const o = this.objs.find(x => x.id === id), ll = [o.lat, o.lon], since = daysAgo(days);
    const near = this.allIncidents().filter(i => i.occurred_at >= since).map(i => ({ ...i, km: Math.round(km(ll, [i.lat, i.lon]) * 10) / 10 })).filter(i => i.km <= o.radius_km).sort((a, b) => a.km - b.km);
    const counts = {}; near.forEach(i => counts[i.category] = (counts[i.category] || 0) + 1);
    const oblF = this.d.oblasts.features.find(f => inPoly(ll, f.geometry.coordinates));
    const obl = oblF ? oblF.properties.code : null, al = await this.alerts();
    const r = scoreRisk({ inOcc: this.areaIx.inOcc(ll), frontKm: this.areaIx.frontKm(ll), counts, radius: o.radius_km, days, alertHours: 0, crime: null, crimeAvg: null });
    return { ...r, object_id: id, name: o.name, oblast: obl, oblast_uk: oblF ? oblF.properties.name_uk : '', days, radius_km: o.radius_km, counts, nearest: near.slice(0, 15),
      frontline_km: this.areaIx.frontKm(ll), alert_now: obl ? al.map[obl] : null, alert_hours_30d: null, crime_per_10k: null, calculated_at: new Date().toISOString() };
  }
  async signOut() { setSession(null); location.reload(); }
  async dutyBaseline() {
    const b = await fetch('data/duty-baseline.json').then(r => r.json());
    try { const o = JSON.parse(localStorage.getItem('sks-riskmap-demo-duty')); if (o && o.items) Object.assign(b, o); } catch (e) { }
    return b;
  }
}
const DEMO_TYPES = [['strike_business', 'Удар по бізнес-об\'єкту', 'military'], ['strike', 'Удар / обстріл', 'military'], ['drone_debris', 'Падіння уламків', 'military'], ['mine', 'Мінна небезпека', 'military'],
  ['robbery', 'Розбій / грабіж', 'crime'], ['kidnapping', 'Викрадення людини / підприємця', 'crime'], ['extortion', 'Вимагання / хабар / данина з бізнесу', 'registry'], ['fraud', 'Шахрайство / незаконна діяльність', 'registry'], ['theft', 'Крадіжка / проникнення', 'crime'], ['arson', 'Підпал', 'crime'], ['attack_business', 'Напад на підприємця / персонал', 'crime'],
  ['raider', 'Рейдерство / тиск на бізнес', 'registry'], ['search', 'Обшук / слідчі дії', 'registry'], ['fire', 'Пожежа', 'technogenic'], ['blackout', 'Знеструмлення / аварія', 'technogenic'],
  ['road_accident', 'ДТП з тяжкими наслідками', 'technogenic'], ['protest', 'Протест / блокування', 'civil'], ['other', 'Інше', 'civil']].map(([code, name_uk, category]) => ({ code, name_uk, category }));

// ---------------- SupabaseBackend ----------------
class SupabaseBackend {
  constructor(sb) { this.mode = 'live'; this.sb = sb; }
  async init() {
    const { data: { session } } = await this.sb.auth.getSession();
    if (!session) return null;
    const { data: profile } = await this.sb.from('profiles').select('role, org_id, full_name').eq('id', session.user.id).single();
    const { data: orgs } = await this.sb.from('organizations').select('id, name, tier').order('name');
    const { data: types } = await this.sb.from('incident_types').select('code, name_uk, category');
    this.types = types || [];
    return { user: session.user, profile: profile || { role: 'client_user' }, orgs: orgs || [] };
  }
  async oblasts() { return fetch('data/oblasts.geojson').then(r => r.json()); }   // статичний файл для швидкості
  async areas() {
    const { data } = await this.sb.rpc('areas_geojson');
    return data || { type: 'FeatureCollection', features: [] };
  }
  async alerts() {
    const { data } = await this.sb.from('alert_state').select('oblast, alert_now, updated_at');
    const m = {}; let t = ''; (data || []).forEach(r => { m[r.oblast] = r.alert_now; if (r.updated_at > t) t = r.updated_at; });
    return { map: m, time: t ? new Date(t).toLocaleString('uk-UA') + ' (наживо)' : '', hours: {} };
  }
  async regionStats(metric) {
    const since = new Date(); since.setMonth(since.getMonth() - 12);
    const { data } = await this.sb.from('region_stats').select('oblast, value').eq('metric', metric === 'crime' ? 'crimes_total' : 'strikes_archive').gte('period', since.toISOString().slice(0, 10));
    const m = {}; (data || []).forEach(r => m[r.oblast] = (m[r.oblast] || 0) + Number(r.value)); return m;
  }
  async incidents(bbox, days, cats) {
    const { data } = await this.sb.rpc('incidents_in_view', { min_lon: bbox[0], min_lat: bbox[1], max_lon: bbox[2], max_lat: bbox[3], p_days: days, p_categories: cats });
    return (data || []).map(i => ({ ...i, occurred_at: i.occurred_at.slice(0, 10) }));
  }
  async objects(org) {
    let q = this.sb.from('objects_v').select('id, org_id, name, kind, address, radius_km, criticality, contact, lat, lon').order('name');
    if (org) q = q.eq('org_id', org);
    const { data, error } = await q; if (error) throw error; return data || [];
  }
  async saveObject(o) {
    const row = { org_id: o.org_id, name: o.name, kind: o.kind, address: o.address, radius_km: o.radius_km, criticality: o.criticality, contact: o.contact, geom: `SRID=4326;POINT(${o.lon} ${o.lat})` };
    const res = o.id ? await this.sb.from('objects').update(row).eq('id', o.id).select('id').single() : await this.sb.from('objects').insert(row).select('id').single();
    if (res.error) throw res.error; return { ...o, id: res.data.id };
  }
  async deleteObject(id) { const { error } = await this.sb.from('objects').delete().eq('id', id); if (error) throw error; }
  async saveIncident(i) {
    const { error } = await this.sb.from('incidents').insert({ type: i.type, occurred_at: i.occurred_at, geom: `SRID=4326;POINT(${i.lon} ${i.lat})`, title: i.title,
      source_url: i.source_url, severity: i.severity, verified: i.verified, ingest_source: 'manual', external_id: 'm' + Date.now() });
    if (error) throw error; return i;
  }
  async incidentTypes() { return this.types; }
  async saveTrip(t) {
    const org = S.org || (S.orgs[0] && S.orgs[0].id); if (!org) return;
    const step = Math.max(1, Math.floor(t.line.length / 400)), pts = t.line.filter((_, i) => i % step === 0).map(p => `${p[1]} ${p[0]}`).join(',');
    await this.sb.from('trips').insert({ org_id: org, name: `${t.from} → ${t.to}`, route: `SRID=4326;LINESTRING(${pts})`, depart_at: t.date || null, risk_level: t.lvl,
      details: { km: Math.round(t.km), why: t.why, purpose: t.purpose, who: t.who, near: t.near.length } });
  }
  async objectRisk(id, days) { const { data, error } = await this.sb.rpc('object_risk', { p_object: id, p_days: days }); if (error) throw error; return data; }
  async dutyBaseline() {
    const [r, m, sh] = await Promise.all([this.sb.from('oblast_risk').select('oblast, level, note'), this.sb.from('duty_meta').select('updated, status').maybeSingle(), this.sb.from('shelter_maps').select('city, oblast, url').order('city')]);
    return { updated: (m.data || {}).updated || '', status: (m.data || {}).status || '', items: (r.data || []).map(x => ({ code: x.oblast, level: x.level, note: x.note })), shelters: sh.data || [] };
  }
  async signOut() { await this.sb.auth.signOut(); location.reload(); }
}

function daysAgo(n) { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); }

// ---------------- старт ----------------
let B, S = { role: 'client_user', org: null, orgs: [], objs: [], inc: [], alerts: { map: {} }, stats: {}, oblasts: null };
const map = L.map('map', { preferCanvas: true }).setView([48.6, 31.3], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 18 }).addTo(map);

async function boot() {
  if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
    B = new SupabaseBackend(sb);
    sb.auth.onAuthStateChange(async (ev) => {
      if (ev === 'PASSWORD_RECOVERY') { const np = prompt('Новий пароль (мінімум 10 символів):'); if (np && np.length >= 10) { const { error } = await sb.auth.updateUser({ password: np }); alert(error ? 'Не вдалося: ' + error.message : 'Пароль змінено.'); } }
    });
    const ctx = await B.init();
    if (!ctx) { showLogin(sb); return; }
    start(ctx);
  } else {
    B = new DemoBackend(); $('demoNote').hidden = false;
    const ctx = await B.init();
    if (!ctx) { showLogin(null); return; }
    start(ctx);
  }
}

function showLogin(sb) {
  $('login').hidden = false;
  const email = () => $('loginEmail').value.trim(), pass = () => $('loginPass').value;
  const msg = t => $('loginMsg').textContent = t;
  if (!sb) {
    $('demoAccounts').hidden = false;
    $('demoAccBody').innerHTML = loadAccess().users.filter(u => !u.blocked).map(u => `<tr data-e="${esc(u.email)}" data-p="${esc(u.password)}"><td>${esc(u.email)}</td><td>${esc(u.password)}</td><td>${esc(ROLE_UK[u.role])}${u.org_id ? '<br><span class="hint">' + esc((loadAccess().orgs.find(o => o.id === u.org_id) || {}).name || '') + '</span>' : ''}</td></tr>`).join('');
    $('demoAccBody').querySelectorAll('tr').forEach(tr => tr.onclick = () => { $('loginEmail').value = tr.dataset.e; $('loginPass').value = tr.dataset.p; });
  }
  const login = async () => {
    if (!email() || !pass()) { msg('Вкажіть логін і пароль.'); return; }
    if (!sb) { const r = demoLogin(email(), pass()); if (r.error) msg(r.error); else location.reload(); return; }
    const { error } = await sb.auth.signInWithPassword({ email: email(), password: pass() });
    if (error) msg('Невірний логін або пароль, або доступ заблоковано.'); else location.reload();
  };
  $('loginBtn').onclick = login;
  $('loginPass').onkeydown = e => { if (e.key === 'Enter') login(); };
  $('magicBtn').onclick = async () => {
    if (!sb) { msg('У демо-режимі вхід лише за паролем.'); return; }
    if (!email()) { msg('Вкажіть пошту.'); return; }
    const { error } = await sb.auth.signInWithOtp({ email: email(), options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: false } });
    msg(error ? 'Не вдалося надіслати посилання.' : 'Посилання для входу надіслано на пошту.');
  };
  $('forgotBtn').onclick = async () => {
    if (!sb) { msg('У демо-режимі пароль скидає аналітик на сторінці «Доступи».'); return; }
    if (!email()) { msg('Вкажіть пошту.'); return; }
    await sb.auth.resetPasswordForEmail(email(), { redirectTo: location.href.split('#')[0] });
    msg('Якщо такий обліковий запис існує, на пошту надіслано посилання для зміни пароля.');
  };
}

async function start(ctx) {
  S.role = ctx.profile.role; S.orgs = ctx.orgs;
  S.org = S.role === 'analyst' ? '' : ctx.profile.org_id;
  $('who').textContent = ctx.user.email + ' · ' + (S.role === 'analyst' ? 'аналітик SK' : (S.orgs[0] ? S.orgs[0].name : '')) + (B.mode === 'demo' ? ' · демо' : '');
  $('logoutBtn').hidden = false; $('logoutBtn').onclick = () => B.signOut();
  $('accessLink').hidden = S.role !== 'analyst';
  if (S.role === 'analyst') {
    $('orgBox').hidden = false;
    $('orgSel').innerHTML = '<option value="">Усі клієнти (аналітик SK)</option>' + S.orgs.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
    $('orgSel').onchange = () => { S.org = $('orgSel').value; loadObjects(); };
  }
  $('incForm').hidden = S.role !== 'analyst';
  const types = await B.incidentTypes(); $('iType').innerHTML = types.map(t => `<option value="${t.code}" data-cat="${t.category}">${esc(t.name_uk)}</option>`).join('');
  S.oblasts = await B.oblasts(); drawOblasts();
  B.areas().then(a => { S.areasFC = a; S.areaIx = makeAreaIndex(a); occLayer.addData(a); });
  S.alerts = await B.alerts(); restyle();
  await loadObjects(); await loadIncidents();
  map.on('moveend', debounce(loadIncidents, 400));
  if (B.mode === 'live') setInterval(async () => { S.alerts = await B.alerts(); restyle(); }, 60000);
  $('rDate').value = new Date(Date.now() + 86400000).toISOString().slice(0, 10); $('iDate').value = new Date().toISOString().slice(0, 10);
}

// ---------------- області ----------------
let oblLayer;
function oblastOf(ll) { const f = S.oblasts.features.find(f => inPoly(ll, f.geometry.coordinates)); return f ? f.properties : null; }
function drawOblasts() {
  oblLayer = L.geoJSON(S.oblasts, { style: () => ({ color: '#7a869a', weight: 1, fillOpacity: .5, fillColor: '#eee' }),
    onEachFeature: (f, l) => { l.bindTooltip(f.properties.name_uk, { sticky: true }); l.on('click', () => { if (!picking) showRegion(f.properties); }); } }).addTo(map);
}
async function restyle() {
  const m = $('mode').value;
  if (m === 'crime' || m === 'hist') S.stats[m] = S.stats[m] || await B.regionStats(m);
  const incBy = {}; S.inc.forEach(i => { const o = oblastOf([i.lat, i.lon]); if (o) incBy[o.code] = (incBy[o.code] || 0) + 1; });
  const pal = ['#f5f5f5', '#fff3e0', '#ffcc80', '#ffa726', '#f4511e', '#b71c1c'];
  const step = (v, st) => { if (!v) return pal[0]; let i = 0; while (i < st.length - 1 && v > st[i]) i++; return pal[i]; };
  oblLayer.setStyle(f => { const c = f.properties.code; let col = '#eee';
    if (m === 'alert') col = S.alerts.map[c] === true ? '#e53935' : S.alerts.map[c] === false ? '#c8e6c9' : '#eee';
    else if (m === 'inc') col = step(incBy[c], [0, 1, 3, 6, 10, 20]);
    else if (m === 'hist') col = step((S.stats.hist || {})[c], [0, 20, 100, 500, 3000, 12000]);
    else col = step((S.stats.crime || {})[c], [0, 2000, 5000, 10000, 20000, 40000]);
    return { fillColor: col }; });
  $('kAlert').textContent = Object.values(S.alerts.map).filter(Boolean).length;
  legend.update(m);
}
function showRegion(p) {
  const inc = S.inc.filter(i => { const o = oblastOf([i.lat, i.lon]); return o && o.code === p.code; }).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const objs = S.objs.filter(o => { const r = oblastOf([o.lat, o.lon]); return r && r.code === p.code; });
  const a = S.alerts.map[p.code];
  $('regionPanel').classList.remove('hint');
  $('regionPanel').innerHTML = `<b>${esc(p.name_uk)}</b><br>Тривога зараз: <span class="tag ${a ? 'alert-on' : ''}">${a === true ? 'так' : a === false ? 'ні' : 'н/д'}</span><br>
    Інцидентів за період (у межах карти): <b>${inc.length}</b><br>Ваших об'єктів: <b>${objs.length}</b>${objs.length ? '<br>' + objs.map(o => `<span class="tag">${esc(o.name)}</span>`).join('') : ''}` +
    (inc.length ? '<div style="margin-top:6px">' + inc.slice(0, 8).map(i => `<div class="sig">${esc(i.occurred_at)} · ${esc(i.title)}</div>`).join('') + '</div>' : '');
  tab('over');
}
const legend = L.control({ position: 'bottomright' });
legend.onAdd = () => L.DomUtil.create('div', 'legend');
legend.update = m => { const el = legend.getContainer(); if (!el) return;
  const cats = Object.entries(CAT_NAME).map(([k, v]) => `<i style="background:${CAT_COLOR[k]};border-radius:50%"></i>${v}`).join('<br>');
  el.innerHTML = (m === 'alert' ? `<b>Повітряна тривога</b><br><i style="background:#e53935"></i>триває<br><i style="background:#c8e6c9"></i>немає<br><small>${esc(S.alerts.time)}</small>`
    : m === 'crime' && !Object.keys(S.stats.crime || {}).length ? '<b>Криміногенність</b><br><small>статистика підключається (Офіс Генпрокурора)</small>'
    : `<b>${m === 'inc' ? 'Інциденти за період' : m === 'hist' ? 'Архів ударів' : 'Злочинів за 12 міс.'}</b><br>` + ['#fff3e0', '#ffcc80', '#ffa726', '#f4511e', '#b71c1c'].map((c, i) => `<i style="background:${c}"></i>${['мало', '', '', '', 'багато'][i]}`).join('<br>'))
    + '<br><b>Інциденти</b><br>' + cats + '<br><i style="background:#1565c0;border-radius:50%;border:2px solid #fff"></i>об\'єкт клієнта'; };
legend.addTo(map);

// ---------------- шари ----------------
const occLayer = L.geoJSON(null, { style: f => f.geometry.type.indexOf('Line') > -1 ? { color: '#6a1b9a', weight: 2, dashArray: '4 3' } : { color: '#6a1b9a', weight: 1, fillColor: '#9c27b0', fillOpacity: .25 },
  onEachFeature: (f, l) => l.bindTooltip('Окуповано / лінія фронту (' + (f.properties.valid_at || f.properties.date || 'архів') + ')') });
const incLayer = L.layerGroup().addTo(map), objLayer = L.layerGroup().addTo(map), ringLayer = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
function cats() { return [...document.querySelectorAll('.cat:checked')].map(c => c.value); }
async function loadIncidents() {
  const b = map.getBounds(), bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  S.inc = await B.incidents(bbox, +$('days').value, cats());
  incLayer.clearLayers();
  S.inc.forEach(i => L.circleMarker([i.lat, i.lon], { radius: 5, color: '#333', weight: 1, fillColor: CAT_COLOR[i.category] || '#999', fillOpacity: i.loc_precision === 'oblast' ? .45 : .9 })
    .bindPopup(incPopup(i)).addTo(incLayer));
  $('kInc').textContent = S.inc.length;
  $('incList').innerHTML = S.inc.length ? S.inc.slice(0, 60).map(i => `<div class="sig"><span class="tag" style="background:${CAT_COLOR[i.category]}22">${esc(CAT_NAME[i.category] || '')}</span><b>${esc(i.occurred_at)}</b> · ${esc(i.title)}${i.source_url ? ` · <a href="${esc(i.source_url)}" target="_blank" rel="noopener">джерело</a>` : ''}</div>`).join('') : '<span class="hint">Інцидентів у межах карти за період немає.</span>';
  if ($('mode').value === 'inc') restyle();
}
function incPopup(i) { return `<b>${esc(i.title)}</b><br>${esc(i.occurred_at)}${i.loc_precision === 'oblast' ? ' <i>(місце приблизне)</i>' : ''}<br><span class="tag">${esc(CAT_NAME[i.category] || '')}</span>` +
  (i.summary ? '<br>' + esc(i.summary) : '') + (i.source_url ? `<br><a href="${esc(i.source_url)}" target="_blank" rel="noopener">Джерело</a>` : ''); }

// ---------------- об'єкти ----------------
async function loadObjects() {
  S.objs = await B.objects(S.org || null);
  objLayer.clearLayers();
  S.objs.forEach(o => L.circleMarker([o.lat, o.lon], { radius: 7 + (o.criticality - 1), color: '#fff', weight: 2, fillColor: KIND_COLOR[o.kind] || '#1565c0', fillOpacity: 1 })
    .bindTooltip(`${KIND[o.kind] || ''}: ${o.name}` + (S.role === 'analyst' && !S.org ? ' · ' + orgName(o.org_id) : '')).on('click', () => { tab('objs'); showRisk(o.id); }).addTo(objLayer));
  $('kObj').textContent = S.objs.length;
  $('objList').innerHTML = S.objs.length ? S.objs.map(o => `<div class="obj"><span class="nm" data-risk="${esc(o.id)}"><span class="tag">${esc(KIND[o.kind] || '')}</span>${esc(o.name)}` +
    (S.role === 'analyst' && !S.org ? ` <span class="hint">· ${esc(orgName(o.org_id))}</span>` : '') + ` <span class="hint">· ${o.radius_km} км</span></span>` +
    `<span><button class="link" data-edit="${esc(o.id)}" title="Редагувати">✎</button><button class="link del" data-del="${esc(o.id)}" title="Видалити">✕</button></span></div>`).join('')
    : '<span class="hint">Об\'єктів ще немає. Додайте перший нижче.</span>';
  $('objList').querySelectorAll('[data-risk]').forEach(e => e.onclick = () => showRisk(e.dataset.risk));
  $('objList').querySelectorAll('[data-edit]').forEach(e => e.onclick = () => editObject(e.dataset.edit));
  $('objList').querySelectorAll('[data-del]').forEach(e => e.onclick = async () => { if (!confirm('Видалити об\'єкт?')) return; try { await B.deleteObject(e.dataset.del); loadObjects(); } catch (err) { alert('Не вдалося: ' + err.message); } });
}
function orgName(id) { const o = S.orgs.find(x => x.id === id); return o ? o.name : ''; }
let newLL = null, picking = null, pickMarker = null;
function setLL(target, ll, label) {
  newLL = ll; $(target === 'obj' ? 'oLL' : 'iLL').textContent = `Координати: ${ll[0].toFixed(4)}, ${ll[1].toFixed(4)}${label ? ' · ' + label : ''}`;
  if (pickMarker) map.removeLayer(pickMarker); pickMarker = L.marker(ll).addTo(map); map.setView(ll, Math.max(map.getZoom(), 11));
}
$('oPick').onclick = () => { picking = 'obj'; document.body.classList.add('picking'); $('oLL').textContent = 'Клікніть на карті в місці об\'єкта…'; };
$('iPick').onclick = () => { picking = 'inc'; document.body.classList.add('picking'); $('iLL').textContent = 'Клікніть на карті в місці інциденту…'; };
map.on('click', e => { if (!picking) return; const t = picking; picking = null; document.body.classList.remove('picking'); setLL(t, [e.latlng.lat, e.latlng.lng], 'вказано на карті'); });
function editObject(id) {
  const o = S.objs.find(x => x.id === id); if (!o) return;
  $('oId').value = o.id; $('oName').value = o.name; $('oKind').value = o.kind; $('oCrit').value = o.criticality; $('oRad').value = o.radius_km;
  $('oContact').value = o.contact || ''; $('oAddr').value = o.address || ''; setLL('obj', [o.lat, o.lon], 'поточне місце');
  $('objFormTitle').textContent = 'Редагувати об\'єкт'; $('oCancel').hidden = false; $('oName').focus();
}
function resetForm() { ['oId', 'oName', 'oAddr', 'oContact'].forEach(i => $(i).value = ''); $('oRad').value = 25; newLL = null; $('oLL').textContent = 'Координати не задано.';
  $('objFormTitle').textContent = 'Додати об\'єкт'; $('oCancel').hidden = true; if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; } }
$('oCancel').onclick = resetForm;
$('oSave').onclick = async () => {
  const org = S.role === 'analyst' ? S.org : (S.org || null);
  if (S.role === 'analyst' && !org) { alert('Оберіть клієнта у списку «Клієнт», щоб додати йому об\'єкт.'); return; }
  const name = $('oName').value.trim(); if (!name || !newLL) { alert('Вкажіть назву і місце об\'єкта (адреса або точка на карті).'); return; }
  const o = { id: $('oId').value || null, org_id: org || (S.objs[0] && S.objs[0].org_id), name, kind: $('oKind').value, criticality: +$('oCrit').value,
    radius_km: Math.max(1, Math.min(150, +$('oRad').value || 25)), contact: $('oContact').value.trim(), address: $('oAddr').value.trim(), lat: newLL[0], lon: newLL[1] };
  try { await B.saveObject(o); resetForm(); await loadObjects(); } catch (err) { alert('Не вдалося зберегти: ' + err.message); }
};

// ---------------- оцінка ризику ----------------
async function showRisk(id) {
  const o = S.objs.find(x => x.id === id); if (!o) return;
  ringLayer.clearLayers(); const ring = L.circle([o.lat, o.lon], { radius: o.radius_km * 1000, color: '#1565c0', weight: 1.5, fillOpacity: .06 }).addTo(ringLayer);
  map.fitBounds(ring.getBounds(), { padding: [30, 30] });
  $('riskPanel').classList.remove('hint'); $('riskPanel').innerHTML = 'Розраховую…';
  try {
    const r = await B.objectRisk(id, +$('days').value);
    S.lastRisk = { o, r };
    const c = r.counts || {};
    $('riskPanel').innerHTML = `<div class="risk r${r.level}">Ризик: ${esc(r.level_name)}</div><br><b>${esc(o.name)}</b> · ${esc(r.oblast_uk || r.oblast || '')}<br>
      Тривога зараз: <span class="tag ${r.alert_now ? 'alert-on' : ''}">${r.alert_now === true ? 'так' : r.alert_now === false ? 'ні' : 'н/д'}</span>
      ${r.alert_hours_30d != null ? ` · тривоги за 30 днів: <b>${r.alert_hours_30d} год</b>` : ''}<br>
      До лінії фронту / окупації (архів): <b>${r.frontline_km != null ? r.frontline_km + ' км' : 'н/д'}</b><br>
      Інциденти в радіусі ${r.radius_km} км за ${r.days} днів: ${Object.keys(CAT_NAME).map(k => c[k] ? `<span class="tag">${CAT_NAME[k]}: ${c[k]}</span>` : '').join('') || '<span class="tag">немає</span>'}<br>
      ${r.crime_per_10k != null ? `Злочинність в області: <b>${r.crime_per_10k}</b> на 10 тис. (середнє ${r.crime_avg_per_10k})<br>` : ''}
      <div style="margin-top:6px"><b>Чому:</b><br>${(r.why || []).length ? r.why.map(w => '• ' + esc(w)).join('<br>') : '• суттєвих чинників не виявлено'}</div>
      ${(r.nearest || []).length ? '<div style="margin-top:6px"><b>Найближчі події:</b>' + r.nearest.map(i => `<div class="sig"><span class="dist">${(i.precision || i.loc_precision) !== 'exact' ? '≈' : ''}${i.km} км</span> · ${esc(i.date || i.occurred_at)} · ${esc(i.title)}${i.url || i.source_url ? ` · <a href="${esc(i.url || i.source_url)}" target="_blank" rel="noopener">джерело</a>` : ''}</div>`).join('') + '<div class="hint">≈ — місце події відоме з точністю до населеного пункту або області; відстань орієнтовна.</div></div>' : ''}
      <div class="row" style="margin-top:8px"><button class="sec" id="riskReport">Звіт по об'єкту (друк / PDF)</button></div>`;
    $('riskReport').onclick = printReport;
  } catch (err) { $('riskPanel').textContent = 'Помилка оцінки: ' + err.message; }
}
function printReport() {
  const { o, r } = S.lastRisk || {}; if (!o) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><title>Звіт по об'єкту — ${esc(o.name)}</title>
    <style>body{font:13px/1.5 Arial,sans-serif;max-width:760px;margin:24px auto;color:#1a1a1a}h1{color:#1F3864;font-size:20px}h2{color:#1F3864;font-size:14px;margin-top:18px}
    .lvl{display:inline-block;padding:4px 10px;border-radius:6px;font-weight:700}.l1{background:#e8f5e9;color:#2e7d32}.l2{background:#fff3e0;color:#ef6c00}.l3{background:#fde0dc;color:#c62828}.l4{background:#b71c1c;color:#fff}
    td{padding:3px 8px;border-bottom:1px solid #eee;vertical-align:top}.muted{color:#666;font-size:11px}</style></head><body>
    <div class="muted">SK Security · Карта ризиків · ${new Date().toLocaleString('uk-UA')}</div>
    <h1>Оцінка безпекової обстановки: ${esc(o.name)}</h1>
    <p>${esc(KIND[o.kind] || '')} · ${esc(r.oblast_uk || r.oblast || '')} · радіус моніторингу ${r.radius_km} км · період ${r.days} днів</p>
    <p><span class="lvl l${r.level}">Рівень ризику: ${esc(r.level_name)}</span></p>
    <h2>Чинники</h2><ul>${(r.why || []).map(w => '<li>' + esc(w) + '</li>').join('') || '<li>Суттєвих чинників не виявлено</li>'}</ul>
    <h2>Показники</h2><table>
    <tr><td>Тривога зараз</td><td>${r.alert_now === true ? 'так' : r.alert_now === false ? 'ні' : 'н/д'}</td></tr>
    <tr><td>Тривоги за 30 днів</td><td>${r.alert_hours_30d != null ? r.alert_hours_30d + ' год' : 'н/д'}</td></tr>
    <tr><td>До лінії фронту / окупації (архів)</td><td>${r.frontline_km != null ? r.frontline_km + ' км' : 'н/д'}</td></tr>
    ${Object.keys(CAT_NAME).map(k => `<tr><td>Інциденти: ${CAT_NAME[k]}</td><td>${(r.counts || {})[k] || 0}</td></tr>`).join('')}
    <tr><td>Злочинність в області, на 10 тис.</td><td>${r.crime_per_10k != null ? r.crime_per_10k + ' (середнє ' + r.crime_avg_per_10k + ')' : 'дані підключаються'}</td></tr></table>
    <h2>Найближчі події</h2><table>${(r.nearest || []).map(i => `<tr><td>${(i.precision || i.loc_precision) !== 'exact' ? '≈' : ''}${i.km} км</td><td>${esc(i.date || i.occurred_at)}</td><td>${esc(i.title)}${i.url || i.source_url ? ` — <a href="${esc(i.url || i.source_url)}">джерело</a>` : ''}</td></tr>`).join('') || '<tr><td>Подій не зафіксовано</td></tr>'}</table>
    <h2>Рекомендації</h2><ul>${r.level >= 3 ? '<li>Переглянути план реагування і укриття персоналу; погодити з безпековою службою режим роботи об\'єкта.</li>' : ''}
    <li>Підтримувати актуальні контакти відповідальних осіб і канали оповіщення.</li><li>Щотижня переглядати оцінку; при події в радіусі — сповіщення куратору SK Security.</li></ul>
    <p class="muted">Оцінка базується на підтверджених аналітиками SK Security інцидентах з відкритих джерел, даних про тривоги та архівних контурах лінії фронту. Не є офіційним прогнозом.</p>
    <script>window.print()<\/script></body></html>`);
  w.document.close();
}

// ---------------- геокодування ----------------
let geoT = null;
function geocode(q, settlement) {
  return fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=ua&accept-language=uk' + (settlement ? '&featureType=settlement' : '') + '&q=' + encodeURIComponent(q))
    .then(r => r.json()).then(a => { if (settlement) a.sort((x, y) => (y.importance || 0) - (x.importance || 0)); return a.map(x => ({ ll: [+x.lat, +x.lon], label: x.display_name })); });
}
function suggest(inp, box, onPick) {
  $(inp).addEventListener('input', () => { clearTimeout(geoT); const q = $(inp).value.trim(); if (q.length < 3) { $(box).style.display = 'none'; return; }
    geoT = setTimeout(() => geocode(q).then(list => { $(box).innerHTML = list.map((x, i) => `<div data-i="${i}">${esc(x.label)}</div>`).join('') || '<div>Нічого не знайдено</div>'; $(box).style.display = 'block';
      $(box).querySelectorAll('[data-i]').forEach(d => d.onclick = () => { const x = list[+d.dataset.i]; $(inp).value = x.label.split(',').slice(0, 3).join(','); $(box).style.display = 'none'; onPick(x); }); }).catch(() => { }), 700); });
}
suggest('oAddr', 'oSugg', x => setLL('obj', x.ll, 'за адресою'));
suggest('iAddr', 'iSugg', x => setLL('inc', x.ll, 'за адресою'));
const RP = { from: null, to: null };
suggest('rFrom', 'rFromS', x => RP.from = x.ll); suggest('rTo', 'rToS', x => RP.to = x.ll);
['rFrom', 'rTo'].forEach(id => $(id).addEventListener('input', () => RP[id === 'rFrom' ? 'from' : 'to'] = null));

// ---------------- маршрут ----------------
async function resolvePt(k, inp) { if (RP[k]) return RP[k]; let l = await geocode($(inp).value.trim(), true); if (!l.length) l = await geocode($(inp).value.trim()); if (!l.length) throw new Error('Не знайдено: ' + $(inp).value); RP[k] = l[0].ll; return RP[k]; }
$('rGo').onclick = async () => {
  const p = $('routePanel'); p.hidden = false; p.textContent = 'Будую маршрут…'; routeLayer.clearLayers();
  try {
    const a = await resolvePt('from', 'rFrom'); await new Promise(r => setTimeout(r, 1100)); const b = await resolvePt('to', 'rTo');
    const j = await fetch(`https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`).then(r => r.json());
    if (!j.routes || !j.routes.length) throw new Error('Маршрут не знайдено');
    const rt = j.routes[0], line = rt.geometry.coordinates.map(c => [c[1], c[0]]);
    const pts = [line[0]]; let acc = 0; for (let i = 1; i < line.length; i++) { acc += km(line[i - 1], line[i]); if (acc >= 2) { pts.push(line[i]); acc = 0; } } pts.push(line[line.length - 1]);
    const bb = L.polyline(line).getBounds().pad(0.2), buf = +$('rBuf').value;
    const inc = await B.incidents([bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()], +$('days').value, cats());
    const near = inc.map(i => { let m = 1e9; for (const q of pts) { const d = km(q, [i.lat, i.lon]); if (d < m) m = d; } return { ...i, km: Math.round(m * 10) / 10 }; }).filter(i => i.km <= buf).sort((x, y) => y.occurred_at.localeCompare(x.occurred_at));
    const obls = []; pts.forEach((q, i) => { if (i % 5) return; const o = oblastOf(q); if (o && !obls.find(x => x.code === o.code)) obls.push(o); });
    let minF = null, occ = false, minAt = null;
    if (S.areaIx) pts.forEach((q, i) => { if (i % 2) return; const d = S.areaIx.frontKm(q); if (d != null && (minF == null || d < minF)) { minF = d; minAt = q; } if (!occ && S.areaIx.inOcc(q)) occ = true; });
    const counts = {}; near.forEach(i => counts[i.category] = (counts[i.category] || 0) + 1);
    const alertNow = obls.filter(o => S.alerts.map[o.code]);
    const r = scoreRisk({ inOcc: occ, frontKm: minF, counts, radius: buf, days: +$('days').value, alertHours: 0, corridor: true });
    if (alertNow.length) { r.score += 5 * alertNow.length; r.why.push('тривога зараз: ' + alertNow.map(o => o.name_uk).join(', ')); }
    const lvl = occ ? 4 : r.score >= 55 ? 3 : r.score >= 25 ? 2 : 1;
    L.polyline(line, { color: ['', '#2e7d32', '#ef6c00', '#c62828', '#7f0000'][lvl], weight: 5, opacity: .85 }).addTo(routeLayer);
    L.marker(a).bindTooltip('Звідки').addTo(routeLayer); L.marker(b).bindTooltip('Куди').addTo(routeLayer);
    near.forEach(i => L.circleMarker([i.lat, i.lon], { radius: 8, color: '#000', weight: 2, fillColor: CAT_COLOR[i.category], fillOpacity: .9 }).bindPopup(incPopup(i)).addTo(routeLayer));
    if (minAt && minF < 100) L.circleMarker(minAt, { radius: 6, color: '#6a1b9a', weight: 3, fillOpacity: 0 }).bindTooltip('Найближче до лінії фронту: ' + minF + ' км').addTo(routeLayer);
    map.fitBounds(L.polyline(line).getBounds(), { padding: [30, 30] });
    const rec = []; if (lvl >= 3) rec.push('погодити поїздку з безпековою службою, розглянути альтернативний маршрут або перенесення');
    if (minF != null && minF < 50) rec.push('не зупинятися у прифронтовій смузі, рух лише у світлий час доби');
    if (alertNow.length || lvl >= 2) rec.push('стежити за тривогами в областях маршруту, заздалегідь визначити укриття на зупинках'); rec.push('повідомляти контактній особі про виїзд і прибуття');
    const inc14 = await B.incidents([bb.getWest(), bb.getSouth(), bb.getEast(), bb.getNorth()], 14, ['military']);
    const near14 = inc14.map(i => { let m = 1e9; for (const q of pts) { const d = km(q, [i.lat, i.lon]); if (d < m) m = d; } return { ...i, km: Math.round(m * 10) / 10 }; }).filter(i => i.km <= buf).sort((x, y) => y.occurred_at.localeCompare(x.occurred_at));
    const inObl = (list, code) => list.filter(i => { const x = oblastOf([i.lat, i.lon]); return x && x.code === code; }).length;
    const perObl = obls.map(o => ({ ...o, alert: !!S.alerts.map[o.code], inc: inObl(inc, o.code), inc14: inObl(inc14, o.code) }));
    S.lastRoute = { from: $('rFrom').value, to: $('rTo').value, a, b, line, km: rt.distance / 1000, min: rt.duration / 60, date: $('rDate').value, buf, days: +$('days').value,
      lvl, why: r.why, rec, near, obls: perObl, minF, occ, purpose: $('rPurpose').value.trim(), who: $('rWho').value.trim(), back: $('rBack').checked,
      near14, days14: true, ev14: inc14.map(i => [i.lat, i.lon, i.type]), lineLite: line.filter((_, i) => i % Math.max(1, Math.floor(line.length / 600)) === 0) };
    $('tripBtns').hidden = false;
    if (B.saveTrip) B.saveTrip(S.lastRoute).catch(() => { });
    p.innerHTML = `<div class="risk r${lvl}">Ризик: ${LEVELS[lvl]}</div><br><b>${(rt.distance / 1000).toFixed(0)} км</b> · ≈ ${Math.floor(rt.duration / 3600)} год ${Math.round(rt.duration % 3600 / 60)} хв${$('rDate').value ? ' · поїздка ' + esc($('rDate').value) : ''}<br>
      Області: ${obls.map(o => `<span class="tag ${S.alerts.map[o.code] ? 'alert-on' : ''}">${esc(o.name_uk)}</span>`).join('')}
      <div style="margin-top:6px"><b>Чому:</b><br>${r.why.length ? r.why.map(w => '• ' + esc(w)).join('<br>') : '• суттєвих чинників не виявлено'}</div>
      <div style="margin-top:6px"><b>Рекомендації:</b><br>${rec.map(w => '• ' + esc(w)).join('<br>')}</div>
      ${near.length ? '<div style="margin-top:6px"><b>Події в коридорі:</b>' + near.slice(0, 15).map(i => `<div class="sig"><span class="dist">${i.km} км</span> · ${esc(i.occurred_at)} · ${esc(i.title)}${i.source_url ? ` · <a href="${esc(i.source_url)}" target="_blank" rel="noopener">джерело</a>` : ''}</div>`).join('') + '</div>' : ''}`;
  } catch (e) { p.textContent = 'Помилка: ' + e.message + '. Спробуйте уточнити назву міста.'; }
};

// ---------------- документи для відряджень (формат SK Security) ----------------
function clientName() { return S.role === 'analyst' ? (S.orgs.find(o => o.id === S.org) || {}).name || '' : (S.orgs[0] || {}).name || ''; }
function openDoc(html) { const w = window.open('', '_blank'); if (!w) { alert('Дозвольте спливаючі вікна для цього сайту, щоб відкрити документ.'); return; } w.document.write(html); w.document.close(); }
async function printTrip() {
  const t = S.lastRoute; if (!t) return;
  const base = await B.dutyBaseline();
  openDoc(buildTripDoc(t, base, { client: clientName(), areas: S.areasFC }));
}
async function printDuty() {
  const base = await B.dutyBaseline();
  const ev14 = await B.incidents([22, 44, 40.5, 52.5], 14, ['military']);
  const names = {}; S.oblasts.features.forEach(f => names[f.properties.code] = f.properties.name_uk);
  openDoc(buildDutyDoc(base, { client: clientName(), names, areas: S.areasFC, ev14: ev14.map(i => [i.lat, i.lon, i.type]), objects: S.objs.map(o => [o.lat, o.lon, o.kind, o.name]) }));
}
$('tripReport').onclick = printTrip;
$('dutyReport').onclick = printDuty;

// ---------------- інцидент (аналітик) ----------------
$('iSave').onclick = async () => {
  const opt = $('iType').selectedOptions[0], title = $('iTitle').value.trim();
  if (!title || !newLL) { alert('Вкажіть заголовок і місце інциденту.'); return; }
  const i = { type: opt.value, category: opt.dataset.cat, occurred_at: $('iDate').value, lat: newLL[0], lon: newLL[1], loc_precision: 'exact', title, source_url: $('iUrl').value.trim(), severity: +$('iSev').value, verified: $('iVerified').checked };
  try { await B.saveIncident(i); ['iTitle', 'iUrl', 'iAddr'].forEach(x => $(x).value = ''); newLL = null; $('iLL').textContent = 'Збережено.'; if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; } loadIncidents(); }
  catch (e) { alert('Не вдалося: ' + e.message); }
};

// ---------------- інтерфейс ----------------
function tab(id) { document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.p === id)); document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + id)); }
document.querySelectorAll('.tab').forEach(t => t.onclick = () => tab(t.dataset.p));
$('mode').onchange = restyle; $('days').onchange = loadIncidents;
document.querySelectorAll('.cat').forEach(c => c.onchange = loadIncidents);
$('lObj').onchange = e => e.target.checked ? objLayer.addTo(map) : map.removeLayer(objLayer);
$('lOcc').onchange = e => e.target.checked ? occLayer.addTo(map) : map.removeLayer(occLayer);
function debounce(f, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; }

boot().catch(e => { console.error(e); alert('Помилка запуску: ' + e.message); });
