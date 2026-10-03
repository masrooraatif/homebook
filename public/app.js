/* Homebook front end. Plain modern JavaScript, no build step. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

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

const state = {
  meta: null,
  session: null,
  route: 'dashboard',
  month: thisMonth(),
  filters: { type: '', category: '', q: '' },
  summary: null,
  recent: [],
  txs: [],
  budgets: [],
  recurring: [],
  txIndex: new Map(),
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

function donutHTML(cats, total) {
  const R = 15.9155;
  const top = cats.slice(0, 6).map((c) => ({ name: c.name, color: c.color, v: c.total }));
  const rest = cats.slice(6).reduce((a, c) => a + c.total, 0);
  if (rest > 0) top.push({ name: 'Other categories', color: 'var(--muted-2)', v: rest });
  let acc = 0;
  const arcs = top.map((p) => {
    const pct = (p.v / total) * 100;
    const dash = Math.max(pct - 0.7, 0.1);
    const el = `<circle r="${R}" cx="21" cy="21" fill="none" stroke="${esc(p.color)}" stroke-width="5"
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
  const top = s.categories[0];
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
  const [summary, recent] = await Promise.all([
    api(`/summary?month=${state.month}`),
    api(`/transactions?month=${state.month}&limit=6`),
  ]);
  state.summary = summary;
  state.recent = recent;
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

function renderDashboard() {
  const s = state.summary;
  if (!s.hasData) return firstRun();
  if (!s.income && !s.expense) return emptyMonth(s);

  const left = s.balance;
  const over = left < 0;
  const scale = Math.max(s.income, s.expense) || 1;
  const segs = s.categories.map((c) =>
    `<span class="seg" style="--w:${((c.total / scale) * 100).toFixed(2)};--c:${esc(c.color)}" title="${esc(c.name)}: ${m0(c.total)}"></span>`).join('');
  const leftSeg = left > 0
    ? `<span class="seg left" style="--w:${((left / scale) * 100).toFixed(2)}" title="Left over: ${m0(left)}"></span>` : '';
  const legend = s.categories.slice(0, 4).map((c) =>
    `<li><i style="--c:${esc(c.color)}"></i>${esc(c.name)} ${m0(c.total)}</li>`).join('')
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

  const breakdown = s.expense > 0 ? `<section class="panel">
    <div class="panel-head"><h2>Where the money went</h2></div>
    <div class="split">
      ${donutHTML(s.categories, s.expense)}
      <ul class="cat-list">${s.categories.map((c) => `<li>
        <button class="cat-row" data-action="cat" data-id="${c.id}" style="--c:${esc(c.color)}">
          <span class="dot"></span><span>${catLabel(c.name)}</span><span class="amt">${m0(c.total)}</span>
          <small>${Math.round(c.share * 100)}% of spending</small>
        </button></li>`).join('')}</ul>
    </div>
  </section>` : '';

  const max = Math.max(...s.trend.flatMap((t) => [t.income, t.expense]), 1);
  const trendDesc = s.trend.map((t) => `${monthLabel(t.month, 'short')}: ${m0(t.income)} in, ${m0(t.expense)} out`).join('; ');
  const trend = `<section class="panel">
    <div class="panel-head"><h2>Last 12 months</h2></div>
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

  return `<div class="stack dashboard-stack">${hero}${pendingBanner(s)}${insightsHTML(s)}<div class="grid">${breakdown}${trend}${budgets}${recent}</div></div>`;
}

/* ---------- transactions ---------- */
async function fetchTxs() {
  const f = state.filters;
  const qs = new URLSearchParams({ month: state.month, limit: '500' });
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
    return `<div class="empty"><h2>No entries found</h2><p>${state.filters.q || state.filters.category || state.filters.type
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
  const cats = state.meta.categories
    .filter((c) => !f.type || c.type === f.type)
    .map((c) => `<option value="${c.id}" ${String(f.category) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  return `<div class="filters">
      <div class="chips">${chips}</div>
      <div class="filter-row">
        <input type="search" id="tx-search" placeholder="Search notes" value="${esc(f.q)}" aria-label="Search entries">
        <select id="tx-cat" aria-label="Filter by category"><option value="">All categories</option>${cats}</select>
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
function budgetTotalsHTML() {
  const set = state.budgets.filter((b) => b.budget > 0);
  const budget = set.reduce((a, b) => a + b.budget, 0);
  const spent = set.reduce((a, b) => a + b.spent, 0);
  return set.length
    ? `<h2>${m0(spent)} spent of ${m0(budget)}</h2><small>Across ${set.length} ${set.length === 1 ? 'category' : 'categories'} with a limit</small>`
    : `<h2>No limits set yet</h2><small>Enter a monthly amount next to a category. Leave it empty for no limit.</small>`;
}
function renderBudgets() {
  return `<div class="stack">
    <section class="panel" id="b-total">${budgetTotalsHTML()}</section>
    <section class="panel">${state.budgets.map((b) => `
      <div class="b-edit" data-row="${b.id}" style="--c:${esc(b.color)}">
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
  const categories = [...m.categories].sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
  const categoryRows = categories.map((c) => `<div class="category-manage-row">
      <span class="category-chip" style="--c:${esc(c.color)}"><i></i>${catLabel(c.name)}</span>
      <small>${c.type === 'expense' ? 'Spending' : 'Income'}</small>
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
      <div class="panel-head"><div><h2>Categories</h2><small>Create your own income or spending categories.</small></div></div>
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

/* ---------- routing ---------- */
const ROUTES = {
  dashboard: { title: 'Dashboard', months: true, load: loadDashboard, render: renderDashboard },
  transactions: { title: 'Transactions', months: true, load: loadTransactions, render: renderTransactions },
  budgets: { title: 'Budgets', months: true, load: loadBudgets, render: renderBudgets },
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

function fillCategories(type, selected) {
  const opts = state.meta.categories.filter((c) => c.type === type)
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const sel = $('#f-cat');
  sel.innerHTML = opts;
  if (selected) sel.value = String(selected);
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
    category_id: Number(fd.get('category_id')),
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
        state.filters = { type: 'expense', category: el.dataset.id, q: '' };
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

async function boot() {
  state.session = await fetch('/api/session').then((r) => r.json());
  if (state.session.authRequired && !state.session.authenticated) return showLogin();
  $('#login').hidden = true;
  $('#app').hidden = false;
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