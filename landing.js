// Форма «Замовити демо»: надсилає заявку в сервіс форм (Formspree або сумісний — адреса в config.js: formEndpoint)
// і, якщо підключена база, зберігає копію в таблицю demo_requests (бачить аналітик SK на сторінці «Доступи»).
(function () {
  const CFG = window.SKS_CONFIG || {};
  const form = document.getElementById('demoForm'), msg = document.getElementById('formMsg');
  const say = (t, ok) => { msg.textContent = t; msg.className = 'msg ' + (ok ? 'ok' : 'err'); };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form).entries());
    if (d._gotcha) return;                                         // бот
    if (!d.name || !d.company || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || '')) { say('Заповніть ім\'я, компанію і коректну робочу пошту.'); return; }
    if (!d.consent) { say('Потрібна згода на обробку персональних даних.'); return; }
    delete d._gotcha; d.consent = 'так'; d.source = 'Лендинг «Карта ризиків»'; d.page = location.href.split('#')[0];
    const btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Надсилаю…';
    let sent = false, errors = [];
    try {
      if (CFG.formEndpoint) {
        const r = await fetch(CFG.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ ...d, _subject: 'Заявка на демо «Карта ризиків»: ' + d.company }) });
        if (r.ok) sent = true; else errors.push('сервіс форм ' + r.status);
      }
      if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
        const r = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/demo_requests', { method: 'POST',
          headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name: d.name, position: d.position || null, company: d.company, email: d.email, phone: d.phone || null,
            objects: d.objects, interest: d.interest, comment: d.comment || null }) });
        if (r.ok) sent = true; else errors.push('база ' + r.status);
      }
      if (!CFG.formEndpoint && !(CFG.supabaseUrl && CFG.supabaseAnonKey)) {
        // демо-режим: форму ще не підключено — зберігаємо локально, щоб показати сценарій
        const k = 'sks-riskmap-demo-requests'; const list = JSON.parse(localStorage.getItem(k) || '[]');
        list.push({ ...d, created_at: new Date().toISOString() }); localStorage.setItem(k, JSON.stringify(list)); sent = true;
      }
    } catch (err) { errors.push(err.message); }
    btn.disabled = false; btn.textContent = 'Надіслати заявку';
    if (sent) { form.reset(); say('Дякуємо! Заявку отримано — зв\'яжемося з вами протягом робочого дня.', true); }
    else say('Не вдалося надіслати заявку (' + errors.join(', ') + '). Напишіть нам, будь ласка, на пошту SK Security.');
  });
})();

// ---------- відкрита стрічка безпекових подій ----------
(function () {
  const CFG = window.SKS_CONFIG || {};
  const list = document.getElementById('feedList'); if (!list) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let items = [], cat = 'all';
  async function load() {
    try {
      let data;
      if (CFG.supabaseUrl && CFG.supabaseAnonKey) {
        const r = await fetch(CFG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/public_feed', { method: 'POST',
          headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_days: 7, p_limit: 150 }) });
        const rows = await r.json();
        data = { updated: new Date().toISOString(), items: rows.map(x => ({ ...x, cat: x.category })), attribution: 'VIINA (Zhukov, University of Michigan), ODbL; SK Security' };
      } else data = await fetch('data/feed.json?t=' + Date.now()).then(r => r.json());
      items = data.items || [];
      document.getElementById('feedUpd').textContent = 'оновлено ' + new Date(data.updated).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      document.getElementById('feedAttr').textContent = 'Джерела: ' + (data.attribution || '');
      render();
    } catch (e) { list.innerHTML = '<div class="feed-empty">Стрічка тимчасово недоступна.</div>'; }
  }
  function render() {
    const l = items.filter(i => cat === 'all' || i.cat === cat).slice(0, 80);
    list.innerHTML = l.length ? l.map(i => `<div class="fi"><div class="fi-date">${esc(new Date(i.date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }))}</div><div>
      <span class="fi-type c-${esc(i.cat)}">${esc(i.type_uk)}</span>${i.place || i.oblast ? `<span class="fi-place">${esc([i.place, i.oblast].filter(Boolean).join(', '))}</span>` : ''}
      <div class="fi-title">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener nofollow">${esc(i.title)}</a>` : esc(i.title)}</div><div class="fi-src">${esc(i.src)}</div></div></div>`).join('')
      : '<div class="feed-empty">Подій цієї категорії за тиждень немає.</div>';
  }
  document.querySelectorAll('#feedChips .chip').forEach(b => b.onclick = () => { document.querySelectorAll('#feedChips .chip').forEach(x => x.classList.toggle('on', x === b)); cat = b.dataset.c; render(); });
  document.querySelectorAll('[data-interest]').forEach(a => a.addEventListener('click', () => { const sel = document.querySelector('#demoForm select[name=interest]'); if (sel) sel.value = a.dataset.interest; }));
  load(); setInterval(load, 5 * 60 * 1000);
})();
