/* Homebook front end. Plain modern JavaScript, no build step. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* small style add-on for sub-categories (no CSS file change needed) */
document.head.insertAdjacentHTML('beforeend',
  '<style>.category-manage-row.sub,.cat-row.sub{margin-left:22px;font-size:.92em}</style>');

/* ---------- theme (auto / light / dark) ---------- */
const THEME_KEY = 'hb-theme';
function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; } }
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
}
applyTheme(getTheme());

/* ---------- icons ---------- */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.6"/><rect x="14" y="3" width="7" height="5" rx="1.6"/><rect x="14" y="12" width="7" height="9" rx="1.6"/><rect x="3" y="16" width="7" height="5" rx="1.6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chart: '<path d="M3 20h18"/><rect x="5" y="11" width="3" height="7" rx="1"/><rect x="10.5" y="6" width="3" height="12" rx="1"/><rect x="16" y="13" width="3" height="5" rx="1"/>',
  repeat: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 013-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 01-3 3H3"/>',
};
const icon = (name, size = 22) =>
  `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------- category emoji ---------- */
const EMOJI_RULES = [
  [/milk|dairy/i, '🥛'],
  [/grocer|vegetable|fruit|kirana/i, '🛒'],
  [/dining|takeout|restaurant|food|snack|\beat|tea|coffee/i, '🍔'],
  [/rent|home|house|housing|maintenance/i, '🏠'],
  [/fuel|petrol|diesel|transport|\bcar\b|bike|\bbus\b|\bauto\b|\bcab\b|taxi/i, '🚗'],
  [/trip|flight|holiday|vacation|travel/i, '✈️'],
  [/education|school|fees|tuition|college|\bbooks?\b/i, '🎓'],
  [/entertain|movie|\bgames?\b|\bfun\b|subscription|netflix/i, '🎬'],
  [/health|medic|doctor|pharmacy|hospital|personal care/i, '💊'],
  [/electric|water|\bgas\b|utilit|bill|internet|wifi|mobile|phone|recharge/i, '💡'],
  [/shop|cloth|dress|fashion/i, '🛍️'],
  [/gift|donation|charity/i, '🎁'],
  [/saving|invest|deposit|\bsip\b|fund/i, '🏦'],
  [/salary|wage|\bpay|income|bonus|business/i, '💰'],
];
const catEmoji = (name) => EMOJI_RULES.find(([re]) => re.test(name || ''))?.[1] ?? '';
const emo = (name) => { const e = catEmoji(name); return e ? `<span class="emo">${e}</span>` : ''; };
const catLabel = (name) => `${emo(name)}${esc(name)}`;

/* ---------- sub-category helpers ---------- */
// "Market Items › Veg" for a sub-category, plain name otherwise
const catPath = (c) => {
  const p = c.parent_id && state.meta.categories.find((x) => x.id === c.parent_id);
  return p ? `${p.name} › ${c.name}` : c.name;
};
// parents first, each followed by its sub-categories
const orderedCats = (list) => list.filter((c) => !c.parent_id)
  .flatMap((p) => [p, ...list.filter((c) => c.parent_id === p.id)]);

/* ---------- state and formatting ---------- */
const LOCALES = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB', AED: 'en-AE', SGD: 'en-SG', AUD: 'en-AU', CAD: 'en-CA' };
const pad = (n) => String(n).padStart(2, '0');
const ym = (y, m) => `${y}-${pad(m)}`;
const thisMonth = () => { const d = new Date(); return ym(d.getFullYear(), d.getMonth() + 1); };
const todayStr = () => { const d = new Date(); return `${thisMonth()}-${pad(d.getDate())}`; };
function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return ym(Math.floor(idx / 12), (idx % 12) + 1);
}
function monthLabel(month, style = 'long') {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en', style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
}
function dayLabel(dateStr) {
  if (dateStr === todayStr()) return 'Today';
  const [y, m, d] = dateStr.split('-').map(Number);
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === `${ym(yesterday.getFullYear(), yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`) return 'Yesterday';
  return new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
}

let fmt0, fmt2;
function setCurrency(code) {
  const locale = LOCALES[code] ?? 'en-US';
  fmt0 = new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 0 });
  fmt2 = new Intl.NumberFormat(locale, { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const m0 = (v) => fmt0.format(v);
const m2 = (v) => (Number.isInteger(v) ? fmt0 : fmt2).format(v);
const currencySymbol = () => fmt0.formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';

const EMPTY_FILTERS = { type: '', category: '', q: '', from: '', to: '', min: '', max: '' };

const state = {
  meta: null,
  session: null,
  route: 'dashboard',
  month: thisMonth(),
  filters: { ...EMPTY_FILTERS },
  summary: null,
  recent: [],
  txs: [],
  budgets: [],
  recurring: [],
  txIndex: new Map(),
  quick: [],
  goals: [],
  report: null,
  year: new Date().getFullYear(),
};

/* ---------- count-up animation ---------- */
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function countUp(el, duration = 1300) {
  const finalText = el.textContent.trim();
  const isPct = finalText.endsWith('%');
  const target = parseFloat(finalText.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(target) || target === 0) return;
  const show = (v) => (isPct ? `${Math.round(v)}%` : m0(v));
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 4); // fast start, soft landing
    el.textContent = t < 1 ? show(target * eased) : finalText;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function animateNumbers(root = document) {
  if (reduceMotion()) return;
  $$('.hero-big, .kpi b, .donut-center b, #b-total h2', root).forEach((el) => countUp(el));
}

/* ---------- api ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    showLogin();
    throw Object.assign(new Error('Sign in required'), { code: 'auth' });
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Please try again.');
  return data;
}

let toastTimer;
function toast(message, kind = 'ok') {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('error', kind === 'error');
  el.classList.remove('show');
  void el.offsetWidth; // restart the bounce animation
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* small form dialog (replaces prompt()) */
function ask({ title, fields, submit = 'Save' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.innerHTML = `<form class="sheet" method="dialog">
      <div class="sheet-head"><h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-ask="cancel" aria-label="Close">${icon('close')}</button></div>
      ${fields.map((f) => `<label class="field">${esc(f.label)}
        <input name="${esc(f.name)}" type="${f.type || 'text'}" ${f.type === 'number' ? 'inputmode="decimal" step="any" min="0"' : ''}
          placeholder="${esc(f.placeholder || '')}" value="${esc(f.value ?? '')}" required></label>`).join('')}
      <div class="sheet-actions"><button type="button" class="btn" data-ask="cancel">Cancel</button>
        <button class="btn primary" type="submit">${esc(submit)}</button></div>
    </form>`;
    document.body.appendChild(d);
    const done = (v) => { d.close(); d.remove(); resolve(v); };
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-ask="cancel"]')) done(null); });
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
    d.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      done(Object.fromEntries(new FormData(e.target)));
    });
    d.showModal();
    d.querySelector('input').focus();
  });
}

function indexTxs(list) {
  for (const t of list) state.txIndex.set(t.id, t);
}

/* ---------- shared view pieces ---------- */
function txRow(t) {
  const sign = t.type === 'income' ? '+' : '−';
  return `<button class="tx" data-action="edit" data-id="${t.id}" style="--c:${esc(t.color)}">
    <span class="dot"></span>
    <span class="tx-main">
      <b>${emo(t.category)}${esc(t.note || t.category)}${t.recurring_id ? icon('repeat', 14) : ''}</b>
      ${t.note ? `<small>${esc(t.category)}</small>` : ''}
    </span>
    <span class="amt ${t.type}">${sign}${m2(t.amount)}</span>
  </button>`;
}

function meterHTML(b) {
  if (!b.budget) return `<div class="meter"><i style="--p:0"></i></div>`;
  const pct = (b.spent / b.budget) * 100;
  const cls = pct > 100 ? 'over' : pct >= 80 ? 'warn' : '';
  return `<div class="meter ${cls}"><i style="--p:${Math.min(pct, 100).toFixed(1)};--c:${esc(b.color)}"></i></div>`;
}
function budgetNote(b) {
  if (!b.budget) return `<small>${m0(b.spent)} spent, no limit set</small>`;
  const diff = b.budget - b.spent;
  return diff >= 0
    ? `<small>${m0(b.spent)} of ${m0(b.budget)}</small><small>${m0(diff)} left</small>`
    : `<small>${m0(b.spent)} of ${m0(b.budget)}</small><small class="over">${m0(-diff)} over</small>`;
}

function delta(cur, prev, prevMonth, upIsGood) {
  if (!prev) return '';
  const p = Math.round(((cur - prev) / prev) * 100);
  const label = monthLabel(prevMonth, 'short');
  if (p === 0) return `<small class="delta">Same as ${label}</small>`;
  const good = (p > 0) === upIsGood;
  return `<small class="delta ${good ? 'good' : 'bad'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% vs ${label}</small>`;
}

function pendingBanner(s) {
  const items = s.pendingRecurring;
  if (!items.length) return '';
  const names = items.slice(0, 3).map((p) => esc(p.note || p.category)).join(', ');
  const more = items.length > 3 ? ` and ${items.length - 3} more` : '';
  return `<div class="banner">
    <p>${items.length} monthly ${items.length === 1 ? 'entry is' : 'entries are'} not in ${monthLabel(state.month)} yet
      <small>${names}${more}</small></p>
    <button class="btn primary small" data-action="apply-recurring">Add them now</button>
  </div>`;
}

/* The server already rolls sub-categories up into their parent and sends them as `children`. */
function groupCats(cats) {
  return cats
    .map((c) => ({
      id: c.id, name: c.name, color: c.color, total: c.total, share: c.share,
      subs: c.children || [],
    }))
    .sort((a, b) => b.total - a.total);
}

function donutHTML(cats, total) {
  const R = 15.9155;
  const top = cats.slice(0, 6).map((c) => ({ id: c.id, name: c.name, color: c.color, v: c.total }));
  const rest = cats.slice(6).reduce((a, c) => a + c.total, 0);
  if (rest > 0) top.push({ name: 'Other categories', color: 'var(--muted-2)', v: rest });
  let acc = 0;
  const arcs = top.map((p) => {
    const pct = (p.v / total) * 100;
    const dash = Math.max(pct - 0.7, 0.1);
    const el = `<circle class="slice" ${p.id ? `data-action="cat" data-id="${p.id}"` : ''} r="${R}" cx="21" cy="21" fill="none" stroke="${esc(p.color)}" stroke-width="5"
      stroke-dasharray="${dash.toFixed(2)} ${(100 - dash).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"><title>${esc(p.name)}: ${m0(p.v)}</title></circle>`;
    acc += pct;
    return el;
  }).join('');
  return `<div class="donut-wrap">
    <svg viewBox="0 0 42 42" class="donut" role="img" aria-label="Spending by category">
      <circle r="${R}" cx="21" cy="21" fill="none" stroke="var(--line)" stroke-width="5"/>
      <g transform="rotate(-90 21 21)">${arcs}</g>
    </svg>
    <div class="donut-center"><b>${m0(total)}</b><small>spent</small></div>
  </div>`;
}

/* ---------- insights ---------- */
function insightsHTML(s) {
  const items = [];
  const top = groupCats(s.categories)[0];
  if (top && s.expense > 0) {
    items.push({ ic: catEmoji(top.name) || '📊', tone: '',
      text: `<b>${esc(top.name)}</b> is your biggest spend: ${m0(top.total)}, ${Math.round(top.share * 100)}% of spending.` });
  }
  const p = s.previous;
  if (p && p.expense > 0 && s.expense > 0) {
    const pct = Math.round(((s.expense - p.expense) / p.expense) * 100);
    const label = monthLabel(p.month, 'short');
    const soFar = state.month === thisMonth() ? ' so far' : '';
    if (pct > 0) items.push({ ic: '📈', tone: 'warn', text: `You have spent <b>${pct}% more</b>${soFar} than all of ${label}.` });
    else if (pct < 0) items.push({ ic: '📉', tone: 'good', text: `Spending is <b>${-pct}% lower</b>${soFar} than ${label}. Nice control.` });
  }
  const overBudgets = s.budgets.filter((b) => b.budget > 0 && b.spent > b.budget)
    .sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
  if (overBudgets.length) {
    const b = overBudgets[0];
    const more = overBudgets.length > 1 ? `, plus ${overBudgets.length - 1} more over budget` : '';
    items.push({ ic: '🚨', tone: 'bad', text: `<b>${esc(b.name)}</b> is ${m0(b.spent - b.budget)} over its limit${more}.` });
  } else {
    const near = s.budgets.filter((b) => b.budget > 0 && b.spent / b.budget >= 0.8)
      .sort((a, b) => b.spent / b.budget - a.spent / a.budget)[0];
    if (near) items.push({ ic: '⚠️', tone: 'warn', text: `<b>${esc(near.name)}</b> has used ${Math.round((near.spent / near.budget) * 100)}% of its limit. ${m0(near.budget - near.spent)} left.` });
  }
  if (s.expense > 0) {
    const [y, m] = state.month.split('-').map(Number);
    const daysIn = new Date(y, m, 0).getDate();
    const isNow = state.month === thisMonth();
    const avg = s.expense / (isNow ? new Date().getDate() : daysIn);
    items.push({ ic: '📅', tone: '', text: isNow
      ? `You are averaging <b>${m0(avg)}</b> a day. At this pace the month ends near <b>${m0(avg * daysIn)}</b>.`
      : `You averaged <b>${m0(avg)}</b> a day.` });
  }
  if (s.savingsRate !== null) {
    const r = Math.round(s.savingsRate * 100);
    if (s.savingsRate >= 0.3) items.push({ ic: '🎉', tone: 'good', act: 'celebrate', text: `You kept <b>${r}%</b> of your income. Tap to celebrate!` });
    else if (s.savingsRate < 0.1 && s.income > 0) items.push({ ic: '💡', tone: 'warn', text: `Only <b>${Math.max(r, 0)}%</b> of income kept so far. Aim for 20% or more.` });
  }
  if (!items.length) return '';
  const rows = items.slice(0, 4).map((i) => {
    const inner = `<span class="ic" aria-hidden="true">${i.ic}</span><span class="txt">${i.text}</span>`;
    return `<li>${i.act
      ? `<button class="insight ${i.tone}" data-action="${i.act}">${inner}</button>`
      : `<div class="insight ${i.tone}">${inner}</div>`}</li>`;
  }).join('');
  return `<section class="panel insights"><div class="panel-head"><h2>Insights</h2></div><ul class="insight-list">${rows}</ul></section>`;
}

/* ---------- confetti ---------- */
function confetti(count = 150) {
  if (reduceMotion()) return;
  const cv = document.createElement('canvas');
  cv.className = 'confetti';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = (cv.width = window.innerWidth * dpr);
  const H = (cv.height = window.innerHeight * dpr);
  const colors = ['#2F52E0', '#E5484D', '#F59E0B', '#0E9F73', '#7A4DE8', '#FFFFFF'];
  const parts = Array.from({ length: count }, (_, i) => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.38,
    vx: (Math.random() - 0.5) * 18 * dpr, vy: (-Math.random() * 15 - 4) * dpr,
    g: (0.32 + Math.random() * 0.2) * dpr, s: (6 + Math.random() * 6) * dpr,
    r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length],
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += p.g; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.globalAlpha = Math.max(0, 1 - t / 3200);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6);
      ctx.restore();
    }
    if (t < 3200) requestAnimationFrame(frame); else cv.remove();
  };
  requestAnimationFrame(frame);
}

function maybeCelebrate() {
  const s = state.summary;
  if (state.route !== 'dashboard' || !s || !s.income || s.savingsRate === null || s.savingsRate < 0.3) return;
  if (s.budgets.some((b) => b.budget > 0 && b.spent > b.budget)) return;
  const key = `hb-celebrated-${state.month}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch { return; }
  confetti();
  toast(`Great month! You kept ${Math.round(s.savingsRate * 100)}% of your income 🎉`);
}

/* ---------- dashboard ---------- */
async function loadDashboard() {
  const [summary, recent, quick, goals] = await Promise.all([
    api(`/summary?month=${state.month}`),
    api(`/transactions?month=${state.month}&limit=6`),
    api('/quick').catch(() => []),
    api('/goals').catch(() => []),
  ]);
  state.summary = summary;
  state.recent = recent;
  state.quick = quick;
  state.goals = goals;
  indexTxs(recent);
}

function firstRun() {
  return `<section class="panel empty">
    <h2>Start your household book</h2>
    <p>Add this month's income and your rent, then log spending as it happens. The dashboard fills in as you go.</p>
    <div class="actions">
      <button class="btn primary" data-action="add-income">Add income</button>
      <button class="btn" data-action="add-expense">Add rent or a bill</button>
      <button class="btn" data-action="demo">Try with sample data</button>
    </div>
  </section>`;
}

function emptyMonth(s) {
  return `${pendingBanner(s)}
  <section class="panel empty">
    <h2>Nothing in ${monthLabel(state.month)} yet</h2>
    <p>Add your income and spending for this month to see where the money goes.</p>
    <div class="actions">
      <button class="btn primary" data-action="add-income">Add income</button>
      <button class="btn" data-action="add-expense">Add spending</button>
    </div>
  </section>`;
}

/* One expandable category row with its sub-categories underneath */
function catItemHTML(g, open) {
  const has = g.subs.length > 0;
  const subs = has ? `<div class="subs"><ul>${g.subs.map((sc) => `
      <li class="sub-item">
        <div class="sub-line"><span>${esc(sc.name)}</span><b>${m0(sc.total)}</b></div>
        <div class="sub-bar"><i style="--p:${(sc.share * 100).toFixed(1)}"></i></div>
        <small>${Math.round(sc.share * 100)}% of ${esc(g.name)}${sc.entries ? ` · ${sc.entries} ${sc.entries === 1 ? 'entry' : 'entries'}` : ''}</small>
      </li>`).join('')}</ul></div>` : '';
  return `<li class="cat-item ${open ? 'open' : ''}" style="--c:${esc(g.color)}">
    <div class="cat-head">
      <button class="cat-row" data-action="cat" data-id="${g.id}" style="--c:${esc(g.color)}">
        <span class="dot"></span><span>${catLabel(g.name)}</span><span class="amt">${m0(g.total)}</span>
        <small>${Math.round(g.share * 100)}% of spending</small>
        <span class="cat-bar"><i style="--p:${(g.share * 100).toFixed(1)}"></i></span>
      </button>
      ${has ? `<button class="cat-toggle" data-action="toggle-cat" aria-expanded="${open}" aria-label="Show sub-categories of ${esc(g.name)}">${g.subs.length} sub<span class="chev"></span></button>` : ''}
    </div>
    ${subs}
  </li>`;
}

/* ---------- quick add, day by day, compare, goals ---------- */
function quickHTML() {
  if (!state.quick.length || state.month !== thisMonth()) return '';
  return `<section class="panel quick">
    <div class="panel-head"><h2>Quick add</h2><small>Tap to add it for today</small></div>
    <div class="quick-row">${state.quick.map((q, i) => `
      <button class="quick-chip" data-action="quick" data-i="${i}" style="--c:${esc(q.color)}">
        <span class="q-ic">${catEmoji(q.category) || '+'}</span>
        <span class="q-t"><b>${esc(q.note || q.category)}</b><small>${m0(q.amount)}</small></span>
      </button>`).join('')}</div>
  </section>`;
}

function dailyHTML(s) {
  if (!s.expense) return '';
  const [y, m] = state.month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const byDay = new Map(s.daily.map((d) => [d.day, d.total]));
  const vals = Array.from({ length: days }, (_, i) => byDay.get(i + 1) || 0);
  const max = Math.max(...vals, 1);
  const isNow = state.month === thisMonth();
  const todayN = new Date().getDate();
  const weeks = [];
  for (let i = 0; i < days; i += 7) {
    weeks.push({ label: `${i + 1}–${Math.min(i + 7, days)}`, total: vals.slice(i, i + 7).reduce((a, v) => a + v, 0) });
  }
  const last7 = isNow ? vals.slice(Math.max(todayN - 7, 0), todayN).reduce((a, v) => a + v, 0) : null;
  const peakDay = vals.indexOf(Math.max(...vals)) + 1;
  return `<section class="panel daily">
    <div class="panel-head"><h2>Day by day</h2>${last7 !== null ? `<span class="pill">Last 7 days ${m0(last7)}</span>` : ''}</div>
    <div class="days" role="img" aria-label="Spending for each day of ${monthLabel(state.month)}">${vals.map((v, i) =>
      `<i class="dbar ${isNow && i + 1 === todayN ? 'today' : ''} ${v === 0 ? 'zero' : ''}" style="--h:${((v / max) * 100).toFixed(1)}" title="${i + 1} ${monthLabel(state.month, 'short')}: ${m0(v)}"></i>`).join('')}</div>
    <div class="weeks">${weeks.map((w) => `<div class="wk"><small>Days ${w.label}</small><b>${m0(w.total)}</b></div>`).join('')}</div>
    <small class="peak">Biggest day: ${peakDay} ${monthLabel(state.month, 'short')}, ${m0(vals[peakDay - 1])}</small>
  </section>`;
}

function compareHTML(s) {
  const prev = s.prevCategories || [];
  if (!prev.length || !s.expense) return '';
  const prevMap = new Map(prev.map((c) => [c.id, c]));
  const rows = s.categories.slice(0, 6).map((c) => {
    const was = prevMap.get(c.id)?.total || 0;
    const diff = c.total - was;
    const pct = was > 0 ? Math.round((diff / was) * 100) : null;
    const top = Math.max(c.total, was, 1);
    const chip = pct === null ? 'New' : diff === 0 ? 'Same' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
    return `<li style="--c:${esc(c.color)}">
      <div class="cmp-top"><span>${catLabel(c.name)}</span><span class="cmp-chip ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${chip}</span></div>
      <div class="cmp-bars"><i class="now" style="--w:${((c.total / top) * 100).toFixed(1)}"></i><i class="was" style="--w:${((was / top) * 100).toFixed(1)}"></i></div>
      <div class="cmp-note"><small>${m0(c.total)} now</small><small>${m0(was)} in ${monthLabel(s.previous.month, 'short')}</small></div>
    </li>`;
  }).join('');
  return `<section class="panel compare">
    <div class="panel-head"><h2>Compared with ${monthLabel(s.previous.month)}</h2></div>
    <ul class="cmp-list">${rows}</ul>
  </section>`;
}

function ringHTML(pct, color) {
  const p = Math.min(Math.max(pct, 0), 100);
  return `<svg class="ring" viewBox="0 0 42 42" aria-hidden="true">
    <circle r="15.9155" cx="21" cy="21" fill="none" stroke="var(--line)" stroke-width="4.5"/>
    <circle class="ring-fg" r="15.9155" cx="21" cy="21" fill="none" stroke="${esc(color)}" stroke-width="4.5" stroke-linecap="round"
      stroke-dasharray="${p.toFixed(1)} ${(100 - p).toFixed(1)}" transform="rotate(-90 21 21)"/></svg>`;
}

function goalsHTML() {
  const head = `<div class="panel-head"><h2>Savings goals</h2><button class="link" data-action="goal-new">+ New goal</button></div>`;
  if (!state.goals.length) {
    return `<section class="panel goals">${head}<p class="empty-note"><small>Saving for something? Set a target and watch the ring fill up.</small></p>
      <p style="margin-top:12px"><button class="btn small" data-action="goal-new">Create a goal</button></p></section>`;
  }
  return `<section class="panel goals">${head}<ul class="goal-list">${state.goals.map((g) => {
    const pct = g.target > 0 ? (g.saved / g.target) * 100 : 0;
    const done = pct >= 100;
    return `<li class="goal ${done ? 'done' : ''}" style="--c:${esc(g.color)}">
      <div class="goal-ring">${ringHTML(pct, g.color)}<b>${Math.min(Math.round(pct), 100)}%</b></div>
      <div class="goal-main"><b>${esc(g.name)}${done ? ' 🎉' : ''}</b><small>${m0(g.saved)} of ${m0(g.target)}</small>${done ? '' : `<small>${m0(g.target - g.saved)} to go</small>`}</div>
      <div class="goal-act"><button class="btn small" data-action="goal-add" data-id="${g.id}">+ Add</button>
        <button class="icon-btn" data-action="goal-del" data-id="${g.id}" aria-label="Delete goal ${esc(g.name)}">${icon('close', 18)}</button></div>
    </li>`;
  }).join('')}</ul></section>`;
}

function renderDashboard() {
  const s = state.summary;
  if (!s.hasData) return firstRun();
  if (!s.income && !s.expense) return emptyMonth(s);

  const groups = groupCats(s.categories);
  const left = s.balance;
  const over = left < 0;
  const scale = Math.max(s.income, s.expense) || 1;
  const segs = groups.map((g) =>
    `<span class="seg" style="--w:${((g.total / scale) * 100).toFixed(2)};--c:${esc(g.color)}" title="${esc(g.name)}: ${m0(g.total)}"></span>`).join('');
  const leftSeg = left > 0
    ? `<span class="seg left" style="--w:${((left / scale) * 100).toFixed(2)}" title="Left over: ${m0(left)}"></span>` : '';
  const legend = groups.slice(0, 4).map((g) =>
    `<li><i style="--c:${esc(g.color)}"></i>${esc(g.name)} ${m0(g.total)}</li>`).join('')
    + (left > 0 ? `<li><i class="left"></i>Left over ${m0(left)}</li>` : '');
  const rate = s.savingsRate === null ? '–' : `${Math.round(s.savingsRate * 100)}%`;

  const hero = `<section class="hero ${over ? 'over' : ''}" aria-label="This month at a glance">
    <div class="hero-top">
      <div>
        <div class="hero-label">${over ? 'Overspent in' : 'Left in'} ${monthLabel(state.month)}</div>
        <div class="hero-big">${m0(Math.abs(left))}</div>
      </div>
      <small>${m0(s.income)} came in, ${m0(s.expense)} went out</small>
    </div>
    <div class="flow-wrap">
      <div class="flow" role="img" aria-label="How this month's money was used">${segs}${leftSeg}</div>
      <ul class="legend">${legend}</ul>
    </div>
    <div class="kpis">
      <div class="kpi"><small>Income</small><b>${m0(s.income)}</b>${delta(s.income, s.previous.income, s.previous.month, true)}</div>
      <div class="kpi"><small>Spent</small><b>${m0(s.expense)}</b>${delta(s.expense, s.previous.expense, s.previous.month, false)}</div>
      <div class="kpi"><small>Kept</small><b>${rate}</b><small>of income</small></div>
    </div>
  </section>`;

  const firstWithSubs = groups.findIndex((g) => g.subs.length > 0);
  const breakdown = s.expense > 0 ? `<section class="panel">
    <div class="panel-head"><h2>Where the money went</h2></div>
    <div class="split">
      ${donutHTML(groups, s.expense)}
      <ul class="cat-list">${groups.map((g, i) => catItemHTML(g, i === firstWithSubs)).join('')}</ul>
    </div>
  </section>` : '';

  const max = Math.max(...s.trend.flatMap((t) => [t.income, t.expense]), 1);
  const trendDesc = s.trend.map((t) => `${monthLabel(t.month, 'short')}: ${m0(t.income)} in, ${m0(t.expense)} out`).join('; ');
  const trend = `<section class="panel">
    <div class="panel-head"><h2>Last 12 months</h2><a class="link" href="#/report">Yearly report</a></div>
    <div class="trend" role="img" aria-label="${esc(trendDesc)}">${s.trend.map((t) => `
      <div class="tcol ${t.month === state.month ? 'now' : ''}">
        <div class="tbars">
          <i class="bar in" style="--h:${((t.income / max) * 100).toFixed(1)}" title="Income ${m0(t.income)}"></i>
          <i class="bar out" style="--h:${((t.expense / max) * 100).toFixed(1)}" title="Spent ${m0(t.expense)}"></i>
        </div>
        <span class="tm">${monthLabel(t.month, 'short')}</span>
      </div>`).join('')}</div>
    <div class="key"><span><i style="background:var(--pos)"></i>Income</span><span><i style="background:var(--neg)"></i>Spent</span></div>
  </section>`;

  const topBudgets = [...s.budgets].sort((a, b) => b.spent / b.budget - a.spent / a.budget).slice(0, 5);
  const budgets = `<section class="panel">
    <div class="panel-head"><h2>Budgets</h2><a class="link" href="#/budgets">Edit limits</a></div>
    ${topBudgets.length ? `<ul class="b-list">${topBudgets.map((b) => `<li><div class="b-row">
      <div class="b-line"><b>${catLabel(b.name)}</b></div>${meterHTML(b)}<div class="b-note">${budgetNote(b)}</div></div></li>`).join('')}</ul>`
      : `<p class="empty-note"><small>Set monthly limits for rent, groceries and more to see how you are tracking.</small></p>
         <p style="margin-top:12px"><a class="btn small" href="#/budgets">Set budgets</a></p>`}
  </section>`;

  const recent = `<section class="panel">
    <div class="panel-head"><h2>Recent</h2><a class="link" href="#/transactions">See all</a></div>
    <div>${state.recent.map(txRow).join('')}</div>
  </section>`;

  return `<div class="stack dashboard-stack">${hero}${pendingBanner(s)}${quickHTML()}${insightsHTML(s)}<div class="grid">${breakdown}${compareHTML(s)}${dailyHTML(s)}${trend}${budgets}${goalsHTML()}${recent}</div></div>`;
}

/* ---------- transactions ---------- */
async function fetchTxs() {
  const f = state.filters;
  const qs = new URLSearchParams({ limit: '500' });
  if (!f.from && !f.to) qs.set('month', state.month);
  if (f.from) qs.set('from', f.from);
  if (f.to) qs.set('to', f.to);
  if (f.min) qs.set('min', f.min);
  if (f.max) qs.set('max', f.max);
  if (f.type) qs.set('type', f.type);
  if (f.category) qs.set('category', f.category);
  if (f.q) qs.set('q', f.q);
  state.txs = await api(`/transactions?${qs}`);
  indexTxs(state.txs);
}
const loadTransactions = fetchTxs;

function txListHTML() {
  const list = state.txs;
  if (!list.length) {
    return `<div class="empty"><h2>No entries found</h2><p>${state.filters.q || state.filters.category || state.filters.type || state.filters.from || state.filters.to || state.filters.min || state.filters.max
      ? 'Try clearing a filter.' : `Nothing has been added for ${monthLabel(state.month)} yet.`}</p></div>`;
  }
  let html = '';
  let last = '';
  for (const t of list) {
    if (t.date !== last) { html += `<div class="day">${dayLabel(t.date)}</div>`; last = t.date; }
    html += txRow(t);
  }
  return html;
}
function txTotalsHTML() {
  const inc = state.txs.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0);
  const out = state.txs.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
  return `<span>Income <b>${m0(inc)}</b></span><span>Spent <b>${m0(out)}</b></span>`;
}

function renderTransactions() {
  const f = state.filters;
  const chips = [['', 'All'], ['expense', 'Spending'], ['income', 'Income']]
    .map(([v, l]) => `<button class="chip ${f.type === v ? 'on' : ''}" data-action="type" data-type="${v}">${l}</button>`).join('');
  const cats = orderedCats(state.meta.categories.filter((c) => !f.type || c.type === f.type))
    .map((c) => `<option value="${c.id}" ${String(f.category) === String(c.id) ? 'selected' : ''}>${esc(catPath(c))}</option>`).join('');
  return `<div class="filters">
      <div class="chips">${chips}</div>
      <div class="filter-row">
        <input type="search" id="tx-search" placeholder="Search notes" value="${esc(f.q)}" aria-label="Search entries">
        <select id="tx-cat" aria-label="Filter by category"><option value="">All categories</option>${cats}</select>
      </div>
      <div class="filter-more">
        <label class="field">From<input type="date" id="tx-from" value="${esc(f.from)}"></label>
        <label class="field">To<input type="date" id="tx-to" value="${esc(f.to)}"></label>
        <label class="field">Min amount<input type="number" id="tx-min" inputmode="decimal" min="0" placeholder="0" value="${esc(f.min)}"></label>
        <label class="field">Max amount<input type="number" id="tx-max" inputmode="decimal" min="0" placeholder="Any" value="${esc(f.max)}"></label>
        ${f.from || f.to || f.min || f.max ? '<button class="btn small" data-action="filters-clear">Clear</button>' : ''}
      </div>
    </div>
    <div class="tx-totals" id="tx-totals">${txTotalsHTML()}</div>
    <section class="panel" style="padding-top:4px;padding-bottom:8px"><div id="tx-list">${txListHTML()}</div></section>`;
}

async function refreshTxList() {
  await fetchTxs();
  $('#tx-list').innerHTML = txListHTML();
  $('#tx-totals').innerHTML = txTotalsHTML();
}

/* ---------- budgets ---------- */
async function loadBudgets() {
  state.budgets = await api(`/budgets?month=${state.month}`);
}
const orderBudgets = (list) => list.filter((b) => !b.parent_id)
  .flatMap((p) => [p, ...list.filter((b) => b.parent_id === p.id)]);

function budgetTotalsHTML() {
  // a sub-category limit is already inside its parent's limit, so don't count it twice
  const parentSet = new Set(state.budgets.filter((b) => !b.parent_id && b.budget > 0).map((b) => b.id));
  const set = state.budgets.filter((b) => b.budget > 0 && !(b.parent_id && parentSet.has(b.parent_id)));
  const budget = set.reduce((a, b) => a + b.budget, 0);
  const spent = set.reduce((a, b) => a + b.spent, 0);
  return set.length
    ? `<h2>${m0(spent)} spent of ${m0(budget)}</h2><small>Across ${set.length} ${set.length === 1 ? 'category' : 'categories'} with a limit</small>`
    : `<h2>No limits set yet</h2><small>Enter a monthly amount next to a category. Leave it empty for no limit.</small>`;
}
function renderBudgets() {
  return `<div class="stack">
    <section class="panel" id="b-total">${budgetTotalsHTML()}</section>
    <section class="panel">${orderBudgets(state.budgets).map((b) => `
      <div class="b-edit ${b.parent_id ? 'is-sub' : ''}" data-row="${b.id}" style="--c:${esc(b.color)}">
        <label class="name" for="b-${b.id}"><span class="dot"></span>${catLabel(b.name)}</label>
        <input class="budget-input" id="b-${b.id}" data-id="${b.id}" inputmode="numeric" placeholder="No limit" value="${b.budget || ''}" aria-label="Monthly budget for ${esc(b.name)}">
        <div class="meter-slot">${meterHTML(b)}</div>
        <div class="b-note">${budgetNote(b)}</div>
      </div>`).join('')}</section>
  </div>`;
}
async function saveBudget(input) {
  const id = Number(input.dataset.id);
  const amount = Number(String(input.value).replace(/[,\s]/g, '') || 0);
  if (!(amount >= 0)) { toast('Enter a number, or leave it empty for no limit.', 'error'); return; }
  await api(`/budgets/${id}`, { method: 'PUT', body: { amount } });
  const b = state.budgets.find((x) => x.id === id);
  b.budget = amount;
  const row = $(`[data-row="${id}"]`);
  row.querySelector('.meter-slot').innerHTML = meterHTML(b);
  row.querySelector('.b-note').innerHTML = budgetNote(b);
  $('#b-total').innerHTML = budgetTotalsHTML();
  input.value = amount || '';
}

/* ---------- settings ---------- */
async function loadSettings() {
  const [meta, recurring] = await Promise.all([api('/meta'), api('/recurring')]);
  state.meta = meta;
  state.recurring = recurring;
}
function renderSettings() {
  const m = state.meta;
  const theme = getTheme();
  const sorted = [...m.categories].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const categoryRows = orderedCats(sorted).map((c) => `<div class="category-manage-row ${c.parent_id ? 'sub' : ''}">
      <span class="category-chip" style="--c:${esc(c.color)}"><i></i>${catLabel(c.name)}</span>
      <small>${c.type === 'expense' ? 'Spending' : 'Income'}</small>
      <span class="row-actions">${c.parent_id ? '' : `<button class="btn small" data-action="add-sub" data-id="${c.id}">+ sub</button>`}<button class="btn small danger" data-action="del-cat" data-id="${c.id}" aria-label="Delete ${esc(c.name)}">Delete</button></span>
    </div>`).join('');
  const rec = state.recurring.length
    ? state.recurring.map((r) => `<div class="rec-row" style="--c:${esc(r.color)}">
        <span class="dot"></span>
        <span><b style="font-weight:500">${esc(r.note || r.category)}</b><br><small>${esc(r.category)}, on day ${r.day_of_month}</small></span>
        <span class="amt ${r.type}">${m2(r.amount)}</span>
        <button class="btn small danger" data-action="del-recurring" data-id="${r.id}">Stop</button>
      </div>`).join('')
    : `<p><small>Nothing repeats yet. Tick "Repeat every month" when you add rent, salary or a bill.</small></p>`;

  return `<div class="stack" style="max-width:720px">
    <section class="panel">
      <div class="set-row"><p>Budget email alerts<small>${m.budgetEmailEnabled ? 'Enabled. You will receive one email per category when a monthly limit is crossed.' : 'Not configured. Add EMAIL_HOST, EMAIL_USER, EMAIL_PASS and BUDGET_ALERT_TO to .env.'}</small></p>
        <span class="status-pill ${m.budgetEmailEnabled ? 'on' : ''}">${m.budgetEmailEnabled ? 'ON' : 'OFF'}</span></div>
    </section>
    <section class="panel">
      <div class="set-row"><p>Appearance<small>Auto follows your phone or computer setting.</small></p>
        <div class="chips" role="group" aria-label="Theme">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]
          .map(([v, l]) => `<button class="chip ${theme === v ? 'on' : ''}" data-action="theme" data-theme="${v}">${l}</button>`).join('')}</div></div>
    </section>
    <section class="panel">
      <div class="set-row"><p>Currency<small>Changes how amounts are shown. Existing amounts are not converted.</small></p>
        <select id="currency" aria-label="Currency">${m.currencies.map((c) => `<option ${c === m.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
    </section>
    <section class="panel category-panel">
      <div class="panel-head"><div><h2>Categories</h2><small>Create your own income or spending categories. Use "+ sub" to add a sub-category under one.</small></div></div>
      <form id="category-form" class="category-form">
        <label class="field">Name<input name="name" maxlength="80" placeholder="e.g. School fees" required></label>
        <label class="field">Type<select name="type"><option value="expense">Spending</option><option value="income">Income</option></select></label>
        <label class="field color-field">Color<input type="color" name="color" value="#2B45D4" aria-label="Category color"></label>
        <button class="btn primary" type="submit">Add category</button>
      </form>
      <div class="category-list">${categoryRows}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Repeats every month</h2></div>${rec}
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Your data</h2></div>
      <div class="set-row"><p>Backup<small>Download a full copy of your book (entries, categories, budgets, goals) as one file. Do this once a month.</small></p>
        <a class="btn small primary" href="/api/backup.json" download>Download backup</a></div>
      <div class="set-row"><p>Export everything<small>Download all entries as a spreadsheet file (CSV).</small></p>
        <div class="export-actions">
          <a class="btn small primary" href="/api/export.xlsx" download>Download Excel</a>
          <a class="btn small" href="/api/export.csv" download>Download CSV</a>
        </div></div>
      ${m.hasData ? '' : `<div class="set-row"><p>Sample data<small>Fill the book with six months of example entries.</small></p>
        <button class="btn small" data-action="demo">Load sample data</button></div>`}
      <div class="set-row"><p>Erase all data<small>Removes every entry, budget and monthly repeat. This cannot be undone.</small></p>
        <button class="btn small danger" data-action="reset">Erase everything</button></div>
    </section>
    <section class="panel">
      <div class="panel-head"><h2>Use it on your phone</h2></div>
      <p><small>Open this page in Chrome or Safari on your phone, then choose Add to Home Screen. Homebook opens full screen like an app.</small></p>
      ${state.session?.authRequired ? `<p style="margin-top:14px"><button class="btn small" data-action="logout">Sign out</button></p>` : ''}
    </section>
  </div>`;
}

/* ---------- yearly report ---------- */
async function loadReport() {
  state.report = await api(`/report?year=${state.year}`);
}

function reportCatHTML(c, i, activeMonths) {
  const top = Math.max(...c.months, 1);
  const spark = c.months.map((v) => `<i style="--h:${((v / top) * 100).toFixed(0)}"></i>`).join('');
  const has = c.children.length > 0;
  const subs = has ? `<div class="subs"><ul>${c.children.map((k) => `
      <li class="sub-item">
        <div class="sub-line"><span>${esc(k.name)}</span><b>${m0(k.total)}</b></div>
        <div class="sub-bar"><i style="--p:${(k.share * 100).toFixed(1)}"></i></div>
        <small>${Math.round(k.share * 100)}% of ${esc(c.name)}</small>
      </li>`).join('')}</ul></div>` : '';
  return `<li class="cat-item rep-item ${i === 0 && has ? 'open' : ''}" style="--c:${esc(c.color)}">
    <button class="rep-head" data-action="toggle-cat" aria-label="Show details for ${esc(c.name)}">
      <span class="rank">${i + 1}</span>
      <span class="rep-main"><b>${catLabel(c.name)}</b>
        <span class="rep-bar"><i style="--p:${(c.share * 100).toFixed(1)}"></i></span>
        <small>${Math.round(c.share * 100)}% of spending · about ${m0(c.total / Math.max(activeMonths, 1))} a month</small></span>
      <span class="spark" aria-hidden="true">${spark}</span>
      <span class="rep-amt">${m0(c.total)}</span>
      ${has ? '<span class="chev"></span>' : '<span class="chev-gap"></span>'}
    </button>${subs}
  </li>`;
}

function renderReport() {
  const r = state.report;
  const yearNav = `<div class="year-nav">
    <button class="icon-btn" data-action="year-prev" aria-label="Previous year">${icon('left')}</button>
    <b>${r.year}</b>
    <button class="icon-btn" data-action="year-next" aria-label="Next year">${icon('right')}</button></div>`;
  if (!r.income && !r.expense) {
    return `<div class="stack"><section class="panel empty"><h2>Nothing in ${r.year} yet</h2>
      <p>Entries you add for ${r.year} will build this report.</p>${yearNav}</section></div>`;
  }
  const rate = r.savingsRate === null ? '–' : `${Math.round(r.savingsRate * 100)}%`;
  const act = r.months.filter((m) => m.income || m.expense);
  const best = [...act].sort((a, b) => (b.income - b.expense) - (a.income - a.expense))[0];
  const peak = [...act].sort((a, b) => b.expense - a.expense)[0];
  const avg = r.expense / Math.max(r.activeMonths, 1);
  const hero = `<section class="hero ${r.saved < 0 ? 'over' : ''}">
    <div class="hero-top">
      <div><div class="hero-label">${r.saved < 0 ? 'Overspent in' : 'Saved in'} ${r.year}</div>
        <div class="hero-big">${m0(Math.abs(r.saved))}</div></div>
      ${yearNav}
    </div>
    <div class="kpis">
      <div class="kpi"><small>Income</small><b>${m0(r.income)}</b></div>
      <div class="kpi"><small>Spent</small><b>${m0(r.expense)}</b></div>
      <div class="kpi"><small>Kept</small><b>${rate}</b><small>of income</small></div>
    </div>
  </section>`;
  const stats = `<div class="stat-row">
    <div class="stat"><small>Average spend a month</small><b>${m0(avg)}</b></div>
    <div class="stat"><small>Highest spending month</small><b>${peak ? monthLabel(peak.month) : '–'}</b><small>${peak ? m0(peak.expense) : ''}</small></div>
    <div class="stat"><small>Best saving month</small><b>${best ? monthLabel(best.month) : '–'}</b><small>${best ? `${m0(best.income - best.expense)} kept` : ''}</small></div>
  </div>`;
  const max = Math.max(...r.months.flatMap((t) => [t.income, t.expense]), 1);
  const chart = `<section class="panel">
    <div class="panel-head"><h2>Month by month</h2></div>
    <div class="trend">${r.months.map((t) => `
      <div class="tcol ${best && t.month === best.month ? 'now' : ''}">
        <div class="tbars">
          <i class="bar in" style="--h:${((t.income / max) * 100).toFixed(1)}" title="Income ${m0(t.income)}"></i>
          <i class="bar out" style="--h:${((t.expense / max) * 100).toFixed(1)}" title="Spent ${m0(t.expense)}"></i>
        </div>
        <span class="tm">${monthLabel(t.month, 'short')}</span>
      </div>`).join('')}</div>
    <div class="key"><span><i style="background:var(--pos)"></i>Income</span><span><i style="background:var(--neg)"></i>Spent</span></div>
  </section>`;
  const cats = `<section class="panel">
    <div class="panel-head"><h2>Where ${r.year} went</h2><a class="link" href="/api/export.xlsx" download>Download Excel</a></div>
    <ul class="rep-list">${r.categories.map((c, i) => reportCatHTML(c, i, r.activeMonths)).join('')}</ul>
  </section>`;
  return `<div class="stack report-stack">${hero}${stats}${chart}${cats}</div>`;
}

/* ---------- routing ---------- */
const ROUTES = {
  dashboard: { title: 'Dashboard', months: true, load: loadDashboard, render: renderDashboard },
  transactions: { title: 'Transactions', months: true, load: loadTransactions, render: renderTransactions },
  budgets: { title: 'Budgets', months: true, load: loadBudgets, render: renderBudgets },
  report: { title: 'Yearly report', months: false, load: loadReport, render: renderReport },
  settings: { title: 'Settings', months: false, load: loadSettings, render: renderSettings },
};

function updateChrome() {
  const r = ROUTES[state.route];
  $('#title').textContent = r.title;
  document.title = `${r.title} · Homebook`;
  $('#months').hidden = !r.months;
  $('#month-label').textContent = monthLabel(state.month);
  $$('[data-route]').forEach((a) => {
    if (a.dataset.route === state.route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function refresh() {
  const view = $('#view');
  const r = ROUTES[state.route];
  view.setAttribute('aria-busy', 'true');
  updateChrome();
  try {
    await r.load();
    view.innerHTML = r.render();
    animateNumbers(view);
    maybeCelebrate();
  } catch (err) {
    if (err.code !== 'auth') {
      view.innerHTML = `<section class="panel empty"><h2>This page did not load</h2><p>${esc(err.message)}</p>
        <div class="actions"><button class="btn primary" data-action="retry">Try again</button></div></section>`;
    }
  } finally {
    view.removeAttribute('aria-busy');
  }
}

function onRoute() {
  const name = location.hash.replace(/^#\//, '') || 'dashboard';
  state.route = ROUTES[name] ? name : 'dashboard';
  window.scrollTo(0, 0);
  refresh();
}

/* ---------- entry dialog ---------- */
const dialog = () => $('#entry');
let editingId = null;

// adds a "Sub-category" dropdown under the category dropdown (once)
function ensureSubField() {
  if ($('#f-sub')) return;
  const host = $('#f-cat').closest('label') || $('#f-cat').parentElement;
  host.insertAdjacentHTML('afterend',
    '<label class="field" id="sub-field" hidden>Sub-category<select id="f-sub" name="sub_category_id"></select></label>');
  $('#f-cat').addEventListener('change', () => renderSubs());
}

function renderSubs(selectedSub) {
  const subs = state.meta.categories.filter((c) => c.parent_id === Number($('#f-cat').value));
  $('#sub-field').hidden = !subs.length;
  $('#f-sub').innerHTML = '<option value="">No sub-category</option>'
    + subs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  if (selectedSub) $('#f-sub').value = String(selectedSub);
}

function fillCategories(type, selected) {
  ensureSubField();
  const tops = state.meta.categories.filter((c) => c.type === type && !c.parent_id);
  $('#f-cat').innerHTML = tops.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const cur = state.meta.categories.find((c) => c.id === Number(selected));
  const parentId = cur?.parent_id || selected;
  if (parentId) $('#f-cat').value = String(parentId);
  renderSubs(cur?.parent_id ? cur.id : '');
}

function formError(msg) {
  const el = $('#f-error');
  el.textContent = msg;
  el.hidden = !msg;
}

function openEntry(tx = null, presetType = 'expense') {
  const form = $('#entry-form');
  form.reset();
  formError('');
  editingId = tx?.id ?? null;
  const type = tx?.type ?? presetType;
  form.elements.type.value = type;
  fillCategories(type, tx?.category_id);
  $('#cur-sym').textContent = currencySymbol();
  $('#f-amount').value = tx ? String(tx.amount) : '';
  $('#f-note').value = tx?.note ?? '';
  const inThisMonth = state.month === thisMonth();
  $('#f-date').value = tx?.date ?? (inThisMonth ? todayStr() : `${state.month}-01`);
  $('#entry-title').textContent = tx ? 'Edit entry' : 'Add entry';
  $('#btn-save').textContent = tx ? 'Save changes' : 'Save entry';
  $('#repeat-row').hidden = Boolean(tx);
  $('#btn-delete').hidden = !tx;
  dialog().showModal();
  if (!tx) $('#f-amount').focus();
}

async function submitEntry(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const amount = Number(String(fd.get('amount')).replace(/[,\s]/g, ''));
  if (!(amount > 0)) return formError('Enter an amount greater than zero.');
  if (!fd.get('date')) return formError('Pick a date.');
  const body = {
    type: fd.get('type'),
    // a chosen sub-category wins, otherwise the main category
    category_id: Number(fd.get('sub_category_id') || fd.get('category_id')),
    amount,
    date: fd.get('date'),
    note: fd.get('note'),
    repeat: fd.get('repeat') === 'on',
  };
  const btn = $('#btn-save');
  btn.disabled = true;
  try {
    if (editingId) await api(`/transactions/${editingId}`, { method: 'PUT', body });
    else await api('/transactions', { method: 'POST', body });
    dialog().close();
    state.month = body.date.slice(0, 7);
    state.meta.hasData = true;
    toast(editingId ? 'Entry updated' : 'Entry added');
    await refresh();
  } catch (err) {
    formError(err.message);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- actions ---------- */
function confirmTwice(el, label = 'Tap again to confirm') {
  if (el.dataset.armed) return true;
  el.dataset.armed = '1';
  const original = el.innerHTML;
  el.innerHTML = label;
  setTimeout(() => { delete el.dataset.armed; el.innerHTML = original; }, 4000);
  return false;
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  try {
    switch (el.dataset.action) {
      case 'add': openEntry(); break;
      case 'add-income': openEntry(null, 'income'); break;
      case 'add-expense': openEntry(null, 'expense'); break;
      case 'toggle-cat': {
        const open = el.closest('.cat-item').classList.toggle('open');
        el.setAttribute('aria-expanded', String(open));
        break;
      }
      case 'del-cat':
        if (!confirmTwice(el, 'Tap again')) break;
        await api(`/categories/${el.dataset.id}`, { method: 'DELETE' });
        toast('Category deleted');
        await refresh();
        break;
      case 'quick': {
        const q = state.quick[Number(el.dataset.i)];
        if (!q) break;
        el.disabled = true;
        try {
          await api('/transactions', {
            method: 'POST',
            body: { type: q.type, category_id: q.category_id, amount: q.amount, date: todayStr(), note: q.note },
          });
          toast(`Added ${q.note || q.category}, ${m0(q.amount)}`);
          await refresh();
        } finally { el.disabled = false; }
        break;
      }
      case 'goal-new': {
        const v = await ask({
          title: 'New savings goal', submit: 'Create goal',
          fields: [
            { name: 'name', label: 'What are you saving for', placeholder: 'New bike' },
            { name: 'target', label: 'Target amount', type: 'number', placeholder: '50000' },
          ],
        });
        if (!v) break;
        await api('/goals', { method: 'POST', body: { name: v.name, target: Number(v.target) } });
        toast('Goal created');
        await refresh();
        break;
      }
      case 'goal-add': {
        const g = state.goals.find((x) => x.id === Number(el.dataset.id));
        if (!g) break;
        const v = await ask({
          title: `Add to ${g.name}`, submit: 'Add money',
          fields: [{ name: 'add', label: 'Amount', type: 'number', placeholder: '1000' }],
        });
        if (!v) break;
        const out = await api(`/goals/${g.id}`, { method: 'PUT', body: { add: Number(v.add) } });
        if (g.saved < g.target && out.saved >= out.target) { confetti(); toast(`Goal reached: ${out.name} 🎉`); }
        else toast('Added to your goal');
        await refresh();
        break;
      }
      case 'goal-del':
        if (!confirmTwice(el, 'Sure?')) break;
        await api(`/goals/${el.dataset.id}`, { method: 'DELETE' });
        toast('Goal deleted');
        await refresh();
        break;
      case 'year-prev': state.year -= 1; await refresh(); break;
      case 'year-next': state.year += 1; await refresh(); break;
      case 'filters-clear':
        state.filters = { ...EMPTY_FILTERS, type: state.filters.type };
        await refresh();
        break;
      case 'add-sub': {
        const parent = state.meta.categories.find((c) => c.id === Number(el.dataset.id));
        const v = await ask({
          title: `New sub-category under ${parent.name}`, submit: 'Add sub-category',
          fields: [{ name: 'name', label: 'Name', placeholder: 'Vegetables and fruit' }],
        });
        if (!v || !v.name.trim()) break;
        await api('/categories', {
          method: 'POST',
          body: { name: v.name.trim(), type: parent.type, color: parent.color, parent_id: parent.id },
        });
        state.meta = await api('/meta');
        toast('Sub-category added');
        await refresh();
        break;
      }
      case 'edit': openEntry(state.txIndex.get(Number(el.dataset.id))); break;
      case 'close': dialog().close(); break;
      case 'prev': state.month = shiftMonth(state.month, -1); await refresh(); break;
      case 'next': state.month = shiftMonth(state.month, 1); await refresh(); break;
      case 'today': state.month = thisMonth(); await refresh(); break;
      case 'retry': await refresh(); break;
      case 'celebrate': confetti(); break;
      case 'theme':
        applyTheme(el.dataset.theme);
        $$('[data-action="theme"]').forEach((b) => b.classList.toggle('on', b === el));
        break;
      case 'type':
        state.filters.type = el.dataset.type;
        state.filters.category = '';
        await refresh();
        break;
      case 'cat':
        state.filters = { ...EMPTY_FILTERS, type: 'expense', category: el.dataset.id };
        if (location.hash === '#/transactions') await refresh(); else location.hash = '#/transactions';
        break;
      case 'apply-recurring': {
        const { added } = await api('/recurring/apply', { method: 'POST', body: { month: state.month } });
        toast(`${added} monthly ${added === 1 ? 'entry' : 'entries'} added`);
        await refresh();
        break;
      }
      case 'delete-entry':
        if (!confirmTwice(el, 'Tap again to delete')) break;
        await api(`/transactions/${editingId}`, { method: 'DELETE' });
        dialog().close();
        toast('Entry deleted');
        await refresh();
        break;
      case 'del-recurring':
        if (!confirmTwice(el, 'Confirm')) break;
        await api(`/recurring/${el.dataset.id}`, { method: 'DELETE' });
        toast('Monthly repeat stopped. Past entries were kept.');
        await refresh();
        break;
      case 'demo': {
        const { added } = await api('/demo', { method: 'POST' });
        state.meta.hasData = true;
        state.month = thisMonth();
        toast(`Added ${added} sample entries`);
        await refresh();
        break;
      }
      case 'reset':
        if (!confirmTwice(el, 'Tap again to erase')) break;
        await api('/data', { method: 'DELETE', body: { confirm: true } });
        state.meta.hasData = false;
        toast('All data erased');
        await refresh();
        break;
      case 'logout':
        await api('/logout', { method: 'POST' });
        location.reload();
        break;
      default: break;
    }
  } catch (err) {
    if (err.code !== 'auth') toast(err.message, 'error');
  }
});

document.addEventListener('change', async (e) => {
  try {
    if (e.target.matches('input[name="type"]')) fillCategories(e.target.value);
    else if (e.target.id === 'tx-cat') { state.filters.category = e.target.value; await refreshTxList(); }
    else if (['tx-from', 'tx-to', 'tx-min', 'tx-max'].includes(e.target.id)) {
      const key = { 'tx-from': 'from', 'tx-to': 'to', 'tx-min': 'min', 'tx-max': 'max' }[e.target.id];
      state.filters[key] = e.target.value;
      await refresh();
    }
    else if (e.target.matches('.budget-input')) await saveBudget(e.target);
    else if (e.target.id === 'currency') {
      const { currency } = await api('/settings', { method: 'PUT', body: { currency: e.target.value } });
      state.meta.currency = currency;
      setCurrency(currency);
      toast(`Amounts now show in ${currency}`);
    }
  } catch (err) {
    if (err.code !== 'auth') toast(err.message, 'error');
  }
});

let searchTimer;
document.addEventListener('input', (e) => {
  if (e.target.id !== 'tx-search') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    state.filters.q = e.target.value.trim();
    try { await refreshTxList(); } catch (err) { if (err.code !== 'auth') toast(err.message, 'error'); }
  }, 250);
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'category-form') return;
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    const fd = new FormData(form);
    await api('/categories', {
      method: 'POST',
      body: { name: fd.get('name'), type: fd.get('type'), color: fd.get('color') },
    });
    state.meta = await api('/meta');
    form.reset();
    form.elements.color.value = '#2B45D4';
    toast('Category added');
    if (state.route === 'settings') await refresh();
  } catch (err) {
    if (err.code !== 'auth') toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#entry-form').addEventListener('submit', submitEntry);
dialog().addEventListener('click', (e) => { if (e.target === dialog()) dialog().close(); });

/* ---------- login and boot ---------- */
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-form').elements.password.focus();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  try {
    await api('/login', { method: 'POST', body: { password: e.target.elements.password.value } });
    e.target.reset();
    await boot();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

function addReportNav() {
  const nav = $('.nav');
  if (!nav || $('[data-route="report"]', nav)) return;
  const link = `<a href="#/report" data-route="report">${icon('chart')}<span>Reports</span></a>`;
  const settings = $('[data-route="settings"]', nav);
  if (settings) settings.insertAdjacentHTML('beforebegin', link); else nav.insertAdjacentHTML('beforeend', link);
}

async function boot() {
  state.session = await fetch('/api/session').then((r) => r.json());
  if (state.session.authRequired && !state.session.authenticated) return showLogin();
  $('#login').hidden = true;
  $('#app').hidden = false;
  addReportNav();
  state.meta = await api('/meta');
  setCurrency(state.meta.currency);
  onRoute();
}

$$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
window.addEventListener('hashchange', onRoute);
boot().catch((err) => {
  document.body.innerHTML = `<div class="login"><div class="login-card"><h1>Cannot reach the server</h1><p>${esc(err.message)}</p></div></div>`;
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});