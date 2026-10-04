// Документи для відряджень у форматі SK Security «Рекомендації для планування та підготовки до службових відряджень».
// 1) buildTripDoc — довідка для конкретного маршруту (області на шляху, загальний рівень = найвищий, події за 14 днів, карта маршруту).
// 2) buildDutyDoc — щотижневі рекомендації по всіх регіонах + Додаток: карта ризиків відносно об'єктів клієнта за 2 тижні.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const LEVEL = {
  high: { uk: 'Високий', rank: 4, bg: '#f8cbad' },
  high_partial: { uk: 'Високий/середній (частина області)*', rank: 3, bg: '#fbe0cf' },
  medium: { uk: 'Середній', rank: 2, bg: '#fff2cc' },
  low: { uk: 'Низький', rank: 1, bg: '#e2efda' }
};
export const levelOf = (base, code) => ((base.items || []).find(i => i.code === code) || { level: 'low', note: '' });

const INTRO = `<p>Наведені у таблиці нижче рівні ризику відображають найвищий рівень ризику у межах відповідної адміністративно-територіальної одиниці (області).</p>
<p><b><i>Високий рівень ризику</i></b> означає, що у межах відповідної області, на усій її території, або у окремих районах, існує реальний високий ризик стати жертвою війни, і цей ризик не може бути виключений підготовкою та дотриманням правил безпеки. Наприклад, відвідування прикордонних із РФ та прифронтових територій пов’язане із ризиком стати жертвою артилерійського обстрілу чи авіаудару плануючою бомбою, які відбуваються раптово без оголошення повітряної тривоги та без можливості вчасно пройти до укриття.</p>
<p>За загальним правилом, <b><i>відвідування регіонів із високим рівнем ризику категорично не рекомендується</i></b>. У деяких випадках високий рівень ризику може бути актуальний лише для частини території області, в той час, як інші її частини перебувають за межами зон вірогідного ураження конкретних видів зброї та можуть бути віднесені до територій із низьким чи середнім рівнем ризику. У разі гострої необхідності організувати робочі візити у такі регіони необхідно отримати індивідуальні рекомендації щодо безпеки місця перебування та правил безпечної поведінки від консультанта SK Security.</p>
<p><b><i>Середній рівень ризику</i></b> означає, що у межах відповідної області, на усій її території, або у окремих районах, існує реальний ризик стати жертвою війни, і цей ризик може бути ефективно зменшений до прийнятного рівня додатковим тренінгом (наприклад, обізнаність щодо мінної загрози) чи уникненням відвідування окремих районів чи місць.</p>
<p>Відвідування регіонів із середнім рівнем ризику рекомендується планувати із залученням консультанта SK Security.</p>
<p><b><i>Низький рівень ризику</i></b> означає, що у межах відповідної області ризик стати жертвою війни є мінімальним та може бути ефективно зменшений до прийнятного рівня суворим дотриманням правил безпеки. Так, абсолютно уся територія України перебуває у межах досяжності російських ракет та БпЛА великої дальності, проте з огляду на можливості української ППО та системи оповіщення, такі удари не стануть причиною загибелі чи травмування працівників, за умови наявності надійного укриття та суворого дотримання правил безпеки під час повітряної тривоги.</p>
<p>За загальним правилом, планування відряджень до регіонів із низьким рівнем ризику <b><i>не потребує додаткових консультацій із спеціалістами SK Security</i></b>, проте повинно здійснюватися у суворій відповідності до рекомендацій щодо правил безпеки під час подорожі та правил безпечної поведінки під час повітряної тривоги.</p>`;

const PROTOCOLS = `<p class="h"><b>Рекомендовані протоколи безпеки для подорожей у регіони із низьким рівнем ризику.</b></p><ul class="dash">
<li>Перед плануванням відрядження необхідно отримати розгорнуту інформацію від Лінійного Менеджера про <b>ризики на територіях, що входять до маршруту відрядження</b>.</li>
<li>Наявність бомбосховища у місцях проживання – <b>обов'язкова</b>.</li>
<li>Наявність бомбосховища у місцях робочих зустрічей – <b>обов'язкова</b>.</li>
<li>Обов'язкове <b>дотримання працівниками правил безпеки та поведінки під час повітряної тривоги</b> (негайне переміщення до найближчого бомбосховища/укриття).</li>
<li>При переміщенні містом <b>заздалегідь планувати свій маршрут</b> та обов'язково вивчити розміщення (наявність) захисних споруд вздовж усього маршруту з метою оперативного реагування на випадок сигналу повітряної тривоги.</li>
<li><b>Переміщення по території відрядження:</b> якщо компанія надає службовий транспорт, співробітник повинен використовувати його для переміщення містом з дотриманням правил дорожнього руху. Використовуйте тільки головні дороги, де можливо.</li>
<li><b>Не ігноруйте попереджувальні знаки</b> та <b>не чіпайте підозрілі предмети</b>, не робіть фото біля військової техніки.</li>
<li><b>Зберігати контакт із колегами:</b> співробітник повинен зберігати контакт із колегами та своїм менеджером, щоб тримати їх в курсі своїх планів та місцезнаходження.</li>
<li><b>Носити мобільний телефон із собою</b> і заряджати його перед виходом з номера готелю, щоб у разі потреби зв'язатися з колегами або викликати допомогу.</li>
<li><b>Не залишати речі без нагляду:</b> паспорт, кредитні картки, службові документи, комп'ютер, мобільний телефон тощо.</li></ul>
<p><b>Важливо</b>: перед кожною поїздкою ви зобов’язані також самостійно зважено оцінити ризики, з якими ви можете зіштовхнуться у відповідній місцевості. Якщо ви обґрунтовано вважаєте, що поїздка у будь-яку місцевість створює неприйнятні для вас ризики для життя та здоров’я, ви можете повідомити про це ЛМ-а і відмовитися від поїздки.</p>`;

const CSS = `:root{color-scheme:light}html{background:#fff}body{background:#fff;font:13px/1.5 'Times New Roman',Georgia,serif;max-width:800px;margin:24px auto;color:#111;padding:0 14px}
h1{font:bold 20px Calibri,Arial,sans-serif;text-align:center;margin:0}.sub{text-align:center;margin:4px 0 14px}p{text-align:justify;text-indent:28px;margin:6px 0}p.h,p.noind{text-indent:0}
table.t{width:100%;border-collapse:collapse;margin:10px 0;font-size:12.5px}table.t td,table.t th{border:1px solid #333;padding:3px 6px;vertical-align:top}table.t th{background:#fff;font-weight:bold;text-align:center}
.muted{color:#555;font:11px Arial,sans-serif}.box{border:1px solid #bbb;background:#f7f7f7;padding:6px 10px;margin:8px 0}ul.dash{list-style:'-  ';padding-left:36px}ul.dash li{margin:4px 0;text-align:justify}
.map{height:420px;border:1px solid #bbb;margin:8px 0}.pb{page-break-before:always}h2{font:bold 15px Calibri,Arial,sans-serif;margin:16px 0 6px}a{color:#1155cc}
.leg{font:11px Arial,sans-serif}.leg i{display:inline-block;width:12px;height:10px;margin:0 4px 0 10px;vertical-align:middle}@media print{.map{page-break-inside:avoid}}`;

function head(title) {
  return `<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"><script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script><style>${CSS}</style></head><body>`;
}
function riskRows(list) {
  return list.map((r, i) => `<tr style="background:${LEVEL[r.level].bg}"><td style="width:26px">${i + 1}.</td><td style="width:180px;font-size:14px">${esc(r.name)}</td><td style="width:130px;font-size:12px">${esc(LEVEL[r.level].uk)}</td><td>${esc(r.note || '')}${r.auto ? `<div class="muted">${esc(r.auto)}</div>` : ''}</td></tr>`).join('');
}
function shelterList(shelters, codes) {
  const l = shelters.filter(s => !codes || codes.includes(s.oblast));
  return l.length ? l.map(s => `<div><a href="${esc(s.url)}">${esc(s.city.toUpperCase())}</a></div>`).join('') : '<p class="noind muted">Для областей маршруту посилань на мапи укриттів немає — уточніть у місцевої адміністрації.</p>';
}
function mapScript(o) {
  // o: {line?, events:[[lat,lon,kind]], objects:[[lat,lon,kind,name]], areas: FeatureCollection, id}
  return `<script>function init_${o.id}(){if(window.__done_${o.id})return;window.__done_${o.id}=1;const m=L.map('${o.id}',{zoomControl:false,attributionControl:false,preferCanvas:true});
  m.fitBounds([[44.3,22.1],[52.4,40.2]]);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
  const A=${JSON.stringify(o.areas || { type: 'FeatureCollection', features: [] })};
  L.geoJSON(A,{style:f=>f.geometry.type.indexOf('Line')>-1?{color:'#e06666',weight:2}:{color:'#cc0000',weight:1,fillColor:'#e06666',fillOpacity:.45}}).addTo(m);
  const E=${JSON.stringify(o.events || [])};E.forEach(p=>L.circleMarker([p[0],p[1]],{radius:p[2]==='shelling'?3:5,color:p[2]==='shelling'?'#cc0000':'#b45309',weight:1,fillColor:p[2]==='shelling'?'#ff4d4d':'#f59e0b',fillOpacity:.9}).addTo(m));
  const O=${JSON.stringify(o.objects || [])};const oc={office:'#e879f9',warehouse:'#1d4ed8',store:'#16a34a',terminal:'#0891b2',production:'#7c2d12',residence:'#9333ea',other:'#475569'};
  O.forEach(p=>L.circleMarker([p[0],p[1]],{radius:6,color:'#fff',weight:1.5,fillColor:oc[p[2]]||'#16a34a',fillOpacity:1}).bindTooltip(p[3]).addTo(m));
  ${o.line ? `const ln=L.polyline(${JSON.stringify(o.line)},{color:'#1F3864',weight:5}).addTo(m);m.fitBounds(ln.getBounds(),{padding:[25,25]});` : ''}
  ${o.print ? 'setTimeout(()=>window.print(),2200);' : ''}}
  window.addEventListener('load',()=>setTimeout(init_${o.id},50));setTimeout(()=>{if(document.readyState==='complete')init_${o.id}()},800);<\/script>`;
}
const LEGEND = `<div class="leg"><i style="background:#e06666"></i>окуповані території / лінія фронту (архівний контур) <i style="background:#f59e0b;border-radius:50%"></i>ракетні удари, атаки БпЛА, пошкодження <i style="background:#ff4d4d;border-radius:50%"></i>артилерійські обстріли <i style="background:#e879f9;border-radius:50%"></i>офіси <i style="background:#1d4ed8;border-radius:50%"></i>склади <i style="background:#16a34a;border-radius:50%"></i>місця доставки / магазини</div>`;

// ---------- 1) Довідка для маршруту ----------
export function buildTripDoc(t, base, ctx) {
  const rows = t.obls.map(o => { const b = levelOf(base, o.code); return { name: o.name_uk, level: b.level, note: b.note, auto: `За ${t.days14 ? 14 : t.days} днів у районі маршруту: ${o.inc14 != null ? o.inc14 : o.inc} подій${o.alert ? '; повітряна тривога на момент формування довідки' : ''}.` }; });
  const top = rows.reduce((a, r) => LEVEL[r.level].rank > LEVEL[a].rank ? r.level : a, 'low');
  const verdict = top === 'high' ? 'Маршрут проходить через область з високим рівнем ризику. <b>Поїздка категорично не рекомендується.</b> У разі гострої необхідності — отримати індивідуальні рекомендації щодо безпеки маршруту та місця перебування від консультанта SK Security.'
    : top === 'high_partial' ? 'Маршрут проходить через область, де високий рівень ризику актуальний для частини території (прикордонні, прифронтові чи прибережні райони). <b>Поїздку слід погодити з консультантом SK Security</b> і переконатися, що маршрут і місця перебування лежать поза зонами високого ризику.'
    : top === 'medium' ? 'Найвищий рівень ризику на маршруті — середній. <b>Поїздку рекомендується планувати із залученням консультанта SK Security</b> (зокрема щодо мінної загрози та уникнення окремих районів).'
    : 'Усі області маршруту мають низький рівень ризику. Додаткові консультації не потрібні; поїздку слід здійснювати у суворій відповідності до протоколів безпеки нижче.';
  const no = 'ДВ-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + String(Date.now()).slice(-4);
  const hrs = Math.floor(t.min / 60) + ' год ' + Math.round(t.min % 60) + ' хв';
  return head(`Рекомендації для відрядження ${t.from} — ${t.to}`) + `
  <div class="muted">SK Security · № ${no} · сформовано ${new Date().toLocaleString('uk-UA')} · редакція рівнів ризику від ${esc(base.updated)}</div>
  <h1>Рекомендації для планування та підготовки до службового відрядження</h1>
  <div class="sub">${esc(t.from)} → ${esc(t.to)}${t.date ? ' · ' + esc(t.date) : ''}</div>
  <table class="t"><tr><td style="width:200px">Маршрут</td><td>${Math.round(t.km)} км автомобілем, ≈ ${hrs} в один бік${t.back ? '; повернення того ж дня' : ''}</td></tr>
  ${ctx.client ? `<tr><td>Компанія</td><td>${esc(ctx.client)}</td></tr>` : ''}${t.purpose ? `<tr><td>Мета</td><td>${esc(t.purpose)}</td></tr>` : ''}${t.who ? `<tr><td>Хто їде</td><td>${esc(t.who)}</td></tr>` : ''}
  <tr><td>Найвищий рівень ризику на маршруті</td><td style="background:${LEVEL[top].bg}"><b>${esc(LEVEL[top].uk)}</b></td></tr>
  <tr><td>До лінії фронту (архівний контур)</td><td>${t.minF != null ? t.minF + ' км у найближчій точці маршруту' : 'н/д'}${t.occ ? ' — <b>маршрут перетинає окуповану територію</b>' : ''}</td></tr></table>
  <div class="box">${verdict}</div>
  <h2>Рівні ризику в областях маршруту</h2>
  <table class="t"><tr><th></th><th>Регіон</th><th>Рівень ризику</th><th>Примітки</th></tr>${riskRows(rows)}</table>
  <p class="noind muted">* високий рівень ризику актуальний лише для частини території області. Рівні — експертна оцінка SK Security (редакція від ${esc(base.updated)}); області, яких немає в переліку SK, мають низький рівень ризику. Кількість подій — автоматично з відкритих джерел.</p>
  <h2>Карта маршруту і подій за останні 14 днів</h2><div class="map" id="m1"></div>${LEGEND}
  <h2>Події у коридорі ${t.buf} км від маршруту за 14 днів</h2>
  ${t.near14.length ? '<table class="t"><tr><th>Дата</th><th>Відстань</th><th>Подія</th></tr>' + t.near14.slice(0, 20).map(i => `<tr><td style="width:80px">${esc(i.occurred_at)}</td><td style="width:70px">${i.loc_precision !== 'exact' ? '≈' : ''}${i.km} км</td><td>${esc(i.title)}${i.source_url ? ` — <a href="${esc(i.source_url)}">джерело</a>` : ''}</td></tr>`).join('') + '</table>' + (t.near14.length > 20 ? `<p class="noind muted">Показано 20 з ${t.near14.length}.</p>` : '') : '<p class="noind">Подій у коридорі маршруту за останні 14 днів не зафіксовано.</p>'}
  <div class="pb"></div>
  <h2>Що означають рівні ризику</h2>${INTRO}
  ${PROTOCOLS}
  <h2>Посилання на інтерактивні мапи розміщення захисних споруд</h2>${shelterList(base.shelters || [], t.obls.map(o => o.code))}
  <h2>Контакти на випадок надзвичайної ситуації</h2><table class="t"><tr><td style="width:260px">Єдиний номер екстрених служб</td><td><b>112</b> (поліція 102 · ДСНС 101 · швидка 103)</td></tr><tr><td>Консультант SK Security</td><td>&nbsp;</td></tr><tr><td>Лінійний менеджер</td><td>&nbsp;</td></tr></table>
  <p class="noind muted">Довідку сформовано автоматично в «Карті ризиків SK Security». Обстановка змінюється — перевіряйте тривоги перед виїздом. Не є офіційним прогнозом і не гарантує безпеку.</p>
  ${mapScript({ id: 'm1', line: t.lineLite, events: t.ev14, objects: [], areas: ctx.areas, print: true })}</body></html>`;
}

// ---------- 2) Щотижневі рекомендації по всіх регіонах ----------
export function buildDutyDoc(base, ctx) {
  const rows = (base.items || []).map(i => ({ ...i, name: (ctx.names[i.code] || i.code) })).sort((a, b) => (a.code === 'Kyiv' ? -1 : b.code === 'Kyiv' ? 1 : a.name.localeCompare(b.name, 'uk')));
  return head('Рекомендації для службових відряджень ' + base.updated) + `
  <div class="muted">SK Security · редакція від ${esc(base.updated)}${ctx.client ? ' · для ' + esc(ctx.client) : ''} · сформовано ${new Date().toLocaleString('uk-UA')}</div>
  <h1>Рекомендації для планування та підготовки до службових відряджень</h1>
  <div class="sub">${base.status ? '(' + esc(base.status) + ')' : ''}</div>
  ${INTRO}
  <table class="t"><tr><th></th><th>Регіон</th><th>Рівень Ризику</th><th>Примітки</th></tr>${riskRows(rows)}</table>
  <p class="noind muted">* високий рівень ризику актуальний лише для частини території області. Області, яких немає в таблиці, мають низький рівень ризику.</p>
  ${PROTOCOLS}
  <div class="pb"></div><p class="h"><b>Посилання на інтерактивні мапи розміщення захисних споруд у регіонах</b></p>${shelterList(base.shelters || [])}
  <div class="pb"></div><h2 style="text-align:center">Додаток. Карта локалізації основних ризиків відносно об’єктів ${ctx.client ? esc(ctx.client) : 'Замовників'}</h2>
  <div class="sub">(дані про обстріли, ракетні удари та удари безпілотними літальними апаратами за попередні два тижні)</div>
  <div class="map" id="m2" style="height:520px"></div>${LEGEND}
  ${mapScript({ id: 'm2', events: ctx.ev14, objects: ctx.objects, areas: ctx.areas, print: true })}</body></html>`;
}
