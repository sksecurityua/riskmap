// Сторінка «Доступи»: список облікових записів, створення клієнтів і користувачів, скидання пароля, блокування.
// Робочий режим — через Edge Function admin-users (перевіряє, що викликає аналітик; сервісний ключ лише на сервері).
import { loadAccess, saveAccess, getSession, ROLE_UK, genPassword } from './demo-store.js';
const CFG = window.SKS_CONFIG || {};
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIER = { basic: 'Базовий', standard: 'Стандарт', premium: 'Преміум' };
let api, sbc = null, state = { orgs: [], users: [] }, obl = [];
const LV = { high: 'Високий', high_partial: 'Високий/середній (частина області)', medium: 'Середній', low: 'Низький' };

// ---------- демо ----------
const demoApi = {
  async call(action, b = {}) {
    const s = loadAccess();
    if (action === 'list') return { orgs: s.orgs, users: s.users.map(({ password, ...u }) => u) };
    if (action === 'create_org') { const o = { id: 'org-' + Date.now(), name: b.name, edrpou: b.edrpou, tier: b.tier, active: true }; s.orgs.push(o); saveAccess(s); return { org: o }; }
    if (action === 'create_user') {
      if (s.users.some(u => u.email.toLowerCase() === b.email.toLowerCase())) throw new Error('Користувач з такою поштою вже існує');
      s.users.push({ id: 'u-' + Date.now(), email: b.email, password: b.password, role: b.role, org_id: b.role === 'analyst' ? null : b.org_id, full_name: b.full_name, blocked: false }); saveAccess(s); return { ok: true };
    }
    const u = s.users.find(x => x.id === b.user_id); if (!u) throw new Error('не знайдено');
    if (action === 'reset_password') u.password = b.password;
    if (action === 'set_blocked') u.blocked = b.blocked;
    if (action === 'delete_user') s.users = s.users.filter(x => x.id !== b.user_id);
    saveAccess(s); return { ok: true };
  }
};

async function boot() {
  if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    const sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey); sbc = sb;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { $('denied').hidden = false; return; }
    api = { async call(action, b = {}) { const { data, error } = await sb.functions.invoke('admin-users', { body: { action, ...b } }); if (error || data.error) throw new Error((data && data.error) || error.message); return data; } };
    $('who').textContent = session.user.email + ' · аналітик SK';
  } else {
    $('demoNote').hidden = false;
    const sess = getSession();
    if (!sess || sess.role !== 'analyst') { $('denied').hidden = false; return; }
    api = demoApi; $('who').textContent = sess.email + ' · аналітик SK · демо';
  }
  try { await refresh(); await loadDuty(); await loadReqs(); $('main').hidden = false; } catch (e) { $('denied').hidden = false; $('denied').textContent = 'Немає доступу: ' + e.message; }
}

async function refresh() {
  state = await api.call('list');
  const orgName = id => (state.orgs.find(o => o.id === id) || {}).name || '—';
  const q = $('filter').value.trim().toLowerCase();
  const users = state.users.filter(u => !q || [u.email, u.full_name, orgName(u.org_id)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => (a.role === 'analyst' ? 0 : 1) - (b.role === 'analyst' ? 0 : 1) || orgName(a.org_id).localeCompare(orgName(b.org_id)) || a.email.localeCompare(b.email));
  $('users').innerHTML = users.map(u => `<tr>
    <td>${esc(u.email)}</td><td>${esc(u.full_name || '')}</td><td>${u.role === 'analyst' ? '<span class="hint">SK Security</span>' : esc(orgName(u.org_id))}</td>
    <td>${esc(ROLE_UK[u.role] || 'без профілю')}</td><td>${u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('uk-UA') : '<span class="hint">ще не входив</span>'}</td>
    <td>${u.blocked ? '<span class="st-bl">заблоковано</span>' : '<span class="st-ok">активний</span>'}</td>
    <td class="actions"><button class="sec small" data-reset="${esc(u.id)}">Скинути пароль</button><button class="sec small" data-block="${esc(u.id)}" data-v="${u.blocked ? 0 : 1}">${u.blocked ? 'Розблокувати' : 'Заблокувати'}</button><button class="sec small" data-del="${esc(u.id)}">Видалити</button></td></tr>`).join('')
    || '<tr><td colspan="7" class="hint">Немає користувачів</td></tr>';
  $('orgs').innerHTML = state.orgs.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.edrpou || '')}</td><td>${esc(TIER[o.tier] || o.tier)}</td><td>${state.users.filter(u => u.org_id === o.id).length}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">Клієнтів ще немає</td></tr>';
  $('uOrg').innerHTML = state.orgs.map(o => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('');
  $('users').querySelectorAll('[data-reset]').forEach(b => b.onclick = () => resetPw(b.dataset.reset));
  $('users').querySelectorAll('[data-block]').forEach(b => b.onclick = () => act('set_blocked', { user_id: b.dataset.block, blocked: b.dataset.v === '1' }));
  $('users').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { if (confirm('Видалити обліковий запис? Об\'єкти клієнта залишаться.')) act('delete_user', { user_id: b.dataset.del }); });
}

function showOnce(email, pw, what) {
  $('onceBox').innerHTML = `<div class="once"><b>${esc(what)}</b><br>Логін: <code>${esc(email)}</code> · Пароль: <code id="oncePw">${esc(pw)}</code>
    <button class="sec small" id="copyPw">Копіювати</button><br><span class="hint">Пароль показано лише зараз — скопіюйте й передайте клієнту захищеним каналом. Після оновлення сторінки його не буде видно.</span></div>`;
  $('copyPw').onclick = () => navigator.clipboard.writeText(`Логін: ${email}\nПароль: ${pw}`).then(() => $('copyPw').textContent = 'Скопійовано');
}
async function act(action, b) { try { await api.call(action, b); await refresh(); } catch (e) { alert('Не вдалося: ' + e.message); } }
async function resetPw(id) {
  const u = state.users.find(x => x.id === id); if (!u || !confirm(`Згенерувати новий пароль для ${u.email}?`)) return;
  const pw = genPassword();
  try { await api.call('reset_password', { user_id: id, password: pw }); await refresh(); showOnce(u.email, pw, 'Пароль скинуто'); } catch (e) { alert('Не вдалося: ' + e.message); }
}
$('uGen').onclick = () => { $('uPass').value = genPassword(); };
$('uRole').onchange = () => { $('uOrg').disabled = $('uRole').value === 'analyst'; };
$('uCreate').onclick = async () => {
  const email = $('uEmail').value.trim(), pw = $('uPass').value, role = $('uRole').value;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('Вкажіть коректну пошту.'); return; }
  if (pw.length < 10) { alert('Пароль — мінімум 10 символів (натисніть «Згенерувати»).'); return; }
  if (role !== 'analyst' && !$('uOrg').value) { alert('Спершу додайте клієнта.'); return; }
  try {
    await api.call('create_user', { email, password: pw, role, org_id: $('uOrg').value, full_name: $('uName').value.trim() });
    ['uEmail', 'uName', 'uPass'].forEach(i => $(i).value = ''); await refresh(); showOnce(email, pw, 'Доступ створено');
  } catch (e) { alert('Не вдалося: ' + e.message); }
};
$('oCreate').onclick = async () => {
  const name = $('oName').value.trim(); if (!name) { alert('Вкажіть назву клієнта.'); return; }
  try { await api.call('create_org', { name, edrpou: $('oEdrpou').value.trim(), tier: $('oTier').value }); $('oName').value = ''; $('oEdrpou').value = ''; await refresh(); } catch (e) { alert('Не вдалося: ' + e.message); }
};
$('filter').oninput = () => refresh();

// ---------- рівні ризику для відряджень ----------
async function getBaseline() {
  if (sbc) {
    const [r, m] = await Promise.all([sbc.from('oblast_risk').select('oblast, level, note'), sbc.from('duty_meta').select('updated, status').maybeSingle()]);
    return { updated: (m.data || {}).updated || '', status: (m.data || {}).status || '', items: (r.data || []).map(x => ({ code: x.oblast, level: x.level, note: x.note })) };
  }
  const b = await fetch('data/duty-baseline.json').then(r => r.json());
  try { const o = JSON.parse(localStorage.getItem('sks-riskmap-demo-duty')); if (o && o.items) Object.assign(b, o); } catch (e) { }
  return b;
}
async function loadDuty() {
  const [base, gj] = await Promise.all([getBaseline(), fetch('data/oblasts.geojson').then(r => r.json())]);
  obl = gj.features.map(f => f.properties).sort((a, b) => a.name_uk.localeCompare(b.name_uk, 'uk'));
  $('dUpd').value = base.updated || new Date().toISOString().slice(0, 10); $('dStatus').value = base.status || '';
  const by = {}; (base.items || []).forEach(i => by[i.code] = i);
  $('duty').innerHTML = obl.map(o => { const i = by[o.code] || { level: 'low', note: '' };
    return `<tr data-code="${esc(o.code)}"><td>${esc(o.name_uk)}</td><td><select>${Object.entries(LV).map(([k, v]) => `<option value="${k}"${k === i.level ? ' selected' : ''}>${v}</option>`).join('')}</select></td><td><input type="text" value="${esc(i.note || '')}" placeholder="Примітка"></td></tr>`; }).join('');
}
$('dSave').onclick = async () => {
  const items = [...$('duty').querySelectorAll('tr')].map(tr => ({ code: tr.dataset.code, level: tr.querySelector('select').value, note: tr.querySelector('input').value.trim() })).filter(i => i.level !== 'low' || i.note);
  const meta = { updated: $('dUpd').value, status: $('dStatus').value.trim() };
  try {
    if (sbc) {
      const all = [...$('duty').querySelectorAll('tr')].map(tr => ({ oblast: tr.dataset.code, level: tr.querySelector('select').value, note: tr.querySelector('input').value.trim() || null }));
      const e1 = (await sbc.from('oblast_risk').upsert(all)).error; if (e1) throw e1;
      const e2 = (await sbc.from('duty_meta').upsert({ id: 1, ...meta })).error; if (e2) throw e2;
    } else localStorage.setItem('sks-riskmap-demo-duty', JSON.stringify({ items, ...meta }));
    $('dSave').textContent = 'Збережено ✓'; setTimeout(() => $('dSave').textContent = 'Зберегти редакцію', 2000);
  } catch (e) { alert('Не вдалося: ' + e.message); }
};
boot();

// ---------- заявки на демо ----------
const RST = { new: 'Нова', contacted: 'Зв\'язалися', demo_done: 'Демо проведено', client: 'Став клієнтом', rejected: 'Відмова' };
async function loadReqs() {
  let list = [];
  if (sbc) { const { data } = await sbc.from('demo_requests').select('*').order('created_at', { ascending: false }).limit(200); list = data || []; }
  else { try { list = JSON.parse(localStorage.getItem('sks-riskmap-demo-requests') || '[]').map((r, i) => ({ id: 'l' + i, status: 'new', ...r })).reverse(); } catch (e) { } }
  $('reqs').innerHTML = list.map(r => `<tr><td>${new Date(r.created_at).toLocaleString('uk-UA')}</td><td><b>${esc(r.company)}</b><br><span class="hint">${esc(r.position || '')}</span></td>
    <td>${esc(r.name)}<br><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? '<br>' + esc(r.phone) : ''}</td><td>${esc(r.objects || '')}<br><span class="hint">${esc(r.interest || '')}</span></td>
    <td>${esc(r.comment || '')}</td><td><select data-req="${esc(r.id)}">${Object.entries(RST).map(([k, v]) => `<option value="${k}"${k === r.status ? ' selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')
    || '<tr><td colspan="6" class="hint">Заявок ще немає.</td></tr>';
  $('reqs').querySelectorAll('[data-req]').forEach(sel => sel.onchange = async () => {
    if (sbc) { const { error } = await sbc.from('demo_requests').update({ status: sel.value }).eq('id', sel.dataset.req); if (error) alert('Не вдалося: ' + error.message); }
  });
}
