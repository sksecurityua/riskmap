// Демо-режим: вигадані облікові записи і клієнти, зберігаються лише в цьому браузері (localStorage).
// У робочому режимі паролі зберігає Supabase Auth у захешованому вигляді — список паролів ніде не показується.
const KEY = 'sks-riskmap-demo-access-v1', SKEY = 'sks-riskmap-demo-session';

export const DEFAULT = {
  orgs: [
    { id: 'demo-logist', name: 'Демо-Логістика', edrpou: '00000001', tier: 'standard', active: true },
    { id: 'demo-retail', name: 'Демо-Рітейл', edrpou: '00000002', tier: 'basic', active: true }
  ],
  users: [
    { id: 'u-an', email: 'analyst@sks.demo', password: 'Demo-Analyst-2026', role: 'analyst', org_id: null, full_name: 'Аналітик SK (демо)', blocked: false },
    { id: 'u-la', email: 'admin@logist.demo', password: 'Demo-Logist-2026', role: 'client_admin', org_id: 'demo-logist', full_name: 'Адміністратор «Демо-Логістика»', blocked: false },
    { id: 'u-ru', email: 'user@retail.demo', password: 'Demo-Retail-2026', role: 'client_user', org_id: 'demo-retail', full_name: 'Користувач «Демо-Рітейл»', blocked: false }
  ]
};

export function loadAccess() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.users) return s; } catch (e) { }
  return JSON.parse(JSON.stringify(DEFAULT));
}
export function saveAccess(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } }
export function getSession() { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch (e) { return null; } }
export function setSession(u) { try { u ? sessionStorage.setItem(SKEY, JSON.stringify(u)) : sessionStorage.removeItem(SKEY); } catch (e) { } }
export function demoLogin(email, password) {
  const s = loadAccess();
  const u = s.users.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase());
  if (!u || u.password !== password) return { error: 'Невірний логін або пароль' };
  if (u.blocked) return { error: 'Обліковий запис заблоковано. Зверніться до аналітика SK Security.' };
  u.last_sign_in_at = new Date().toISOString(); saveAccess(s);
  const sess = { id: u.id, email: u.email, role: u.role, org_id: u.org_id, full_name: u.full_name };
  setSession(sess); return { user: sess };
}
export const ROLE_UK = { analyst: 'Аналітик SK', client_admin: 'Адміністратор клієнта', client_user: 'Користувач клієнта' };
export function genPassword(n = 14) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%*';
  const r = new Uint32Array(n); crypto.getRandomValues(r); return Array.from(r, x => a[x % a.length]).join('');
}
