// SEED — เงิน (#/money): สรุปรายเดือน, งบรายหมวด, กระเป๋า, รายการแบ่งตามวัน
import {
  html, icon, toast, confirmBox, openPanel, toHTML, money, signed, thDay, thMonth, soft, parseMoney, pct,
} from '../ui.js';
import {
  monthOf, addMonths, monthTotals, categorySpend, dailySpend, budgetPct, walletBalance, groupByDay, daysInMonth, round2,
} from '../calc.js';
import { deleteEntry, COLORS } from '../store.js';
import { bars } from '../charts.js';

const PAGE = 40;
const catById = (s, id) => s.categories.find((c) => c.id === id);
const walletName = (s, id) => s.wallets.find((w) => w.id === id)?.name || 'กระเป๋าที่ลบไปแล้ว';

function lastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(daysInMonth(y, m)).padStart(2, '0')}`;
}
function earliestMonth(s, today) {
  let first = monthOf(s.settings.createdAt || today);
  for (const t of s.transactions) if (monthOf(t.date) < first) first = monthOf(t.date);
  return first;
}

function summaryCard(app, ym) {
  const s = app.state;
  const t = monthTotals(s.transactions, ym);
  const isNow = ym === monthOf(app.today);
  const series = dailySpend(s.transactions, isNow ? app.today : lastDay(ym), 14);
  const values = series.map((d) => d.amount);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const top = series.reduce((m, d) => (d.amount > m.amount ? d : m), series[0]);
  const big = (v, color = 'var(--text)') => html`<div class="mono" style="font-size:18px;font-weight:600;color:${color}">${v}</div>`;
  return html`<section class="card" aria-label="สรุปเดือน ${thMonth(ym)}">
    <div class="grid3" style="gap:4px">
      <div><div class="small muted">รับ</div>${big(t.income > 0 ? '+' + money(t.income) : '0', t.income > 0 ? 'var(--green)' : 'var(--text)')}</div>
      <div><div class="small muted">จ่าย</div>${big(t.expense > 0 ? '−' + money(t.expense) : '0', t.expense > 0 ? 'var(--orange)' : 'var(--text)')}</div>
      <div><div class="small muted">เหลือ</div>${big(money(t.left), t.left < 0 ? 'var(--orange)' : 'var(--text)')}</div>
    </div>
    ${bars({
      values, hot: (v) => avg > 0 && v > 2 * avg,
      label: top.amount > 0 ? `กราฟแท่งรายจ่ายรายวัน 14 วัน วันที่จ่ายมากสุด ${thDay(top.date)} ฿${money(top.amount)}` : 'กราฟแท่งรายจ่ายรายวัน 14 วัน ยังไม่มีรายจ่าย',
    })}
    <div class="row between" style="font-size:11px;color:var(--muted)">
      <span>รายจ่ายรายวัน ${isNow ? '14 วันล่าสุด' : '14 วันท้ายเดือน'}</span>
      <span>อัตราเก็บ <b class="mono" style="color:var(--text)">${t.income > 0 ? pct(t.savingsRate) : '—'}</b></span>
    </div>
  </section>`;
}

function budgetsCard(app, ym) {
  const s = app.state;
  const spend = categorySpend(s.transactions, ym);
  const rows = s.categories.filter((c) => c.type === 'out' && (c.budget > 0 || spend[c.id] > 0)).map((c) => {
    const spent = spend[c.id] || 0;
    const p = budgetPct(spent, c.budget);
    const warn = p != null && p >= 80;
    return html`<div class="stack" style="gap:6px">
      <div class="row" style="gap:8px;font-size:14px">
        <span class="dot" style="background:${c.color}"></span><span class="grow">${c.name}</span>
        <span class="mono" style="font-size:13px;color:var(--muted)"><span style="color:var(--text)">${money(spent)}</span> / ${c.budget > 0 ? money(c.budget) : 'ไม่ตั้งงบ'}</span>
      </div>
      ${p != null ? html`<div class="bar ${warn ? 'warn' : ''}" role="progressbar" aria-label="${c.name} ใช้ไป ${p}% ของงบ" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(p, 100)}"><span style="width:${Math.min(p, 100)}%"></span></div>` : ''}
      ${spent > c.budget && c.budget > 0 ? html`<div class="small warn">เกินงบ ฿${money(round2(spent - c.budget))}</div>`
        : warn ? html`<div class="small warn">ใช้ไปแล้ว ${p}% · เหลือ ฿${money(round2(c.budget - spent))}</div>` : ''}
    </div>`;
  });
  return html`<section class="card" aria-label="งบรายหมวด">
    <div class="row between"><h2 class="h-title">งบรายหมวด</h2><button class="link-btn lg" data-act="editBudgets" id="m-budgets">แก้งบ</button></div>
    ${rows.length ? rows : html`<p class="sub" style="line-height:1.6">ยังไม่ได้ตั้งงบ กด "แก้งบ" เพื่อกำหนดว่าแต่ละหมวดใช้ได้เดือนละเท่าไหร่</p>`}
  </section>`;
}

function walletTiles(app) {
  const s = app.state;
  return html`<section class="grid2" aria-label="กระเป๋าเงิน">
    ${s.wallets.map((w) => html`<div class="tile" style="gap:2px">
      <span class="small muted ellipsis">${w.name}</span>
      <span class="mono" style="font-size:18px;font-weight:600">${money(walletBalance(s, w.id))}</span>
    </div>`)}
  </section>`;
}

function txRow(s, t) {
  if (t.type === 'transfer') {
    return html`<button class="tx" data-act="tx" data-id="${t.id}" id="tx-${t.id}">
      <span class="tag" style="background:var(--raised);color:var(--muted)">${icon('swap', 18)}</span>
      <span class="grow" style="min-width:0"><span class="ellipsis" style="display:block;font-size:14px">${t.note || 'ย้ายเงิน'}</span>
        <span class="small muted">${walletName(s, t.fromWalletId)} → ${walletName(s, t.toWalletId)}</span></span>
      <span class="amt" style="color:var(--muted)">${money(t.amount)}</span>
    </button>`;
  }
  const c = catById(s, t.categoryId);
  const isIn = t.type === 'in';
  const [bg, fg] = soft(isIn ? COLORS.green : c?.color);
  const catName = c?.name || 'ไม่มีหมวด';
  return html`<button class="tx" data-act="tx" data-id="${t.id}" id="tx-${t.id}">
    <span class="tag" style="background:${bg};color:${fg}">${isIn ? 'รับ' : c?.short || 'อื่น'}</span>
    <span class="grow" style="min-width:0"><span class="ellipsis" style="display:block;font-size:14px">${t.note || catName}</span>
      <span class="small muted">${isIn ? `รายรับ · ${catName}` : catName}${t.recurringId ? ' · ประจำ' : ''}</span></span>
    <span class="amt ${isIn ? 'in' : 'out'}">${signed(t.amount, t.type)}</span>
  </button>`;
}

function listCard(app, ym) {
  const s = app.state;
  const limit = app.local.limit || PAGE;
  const groups = groupByDay(s.transactions, ym);
  if (!groups.length) {
    return html`<section class="card" aria-label="รายการล่าสุด">
      <div class="empty-box">ยังไม่มีรายการ${ym === monthOf(app.today) ? '' : 'ในเดือนนี้'}</div>
    </section>`;
  }
  let shown = 0;
  const parts = [];
  for (const g of groups) {
    if (shown >= limit) break;
    const items = g.items.slice(0, limit - shown);
    shown += items.length;
    parts.push(html`<div class="day-label">${g.date === app.today ? `วันนี้ · ${thDay(g.date)}` : thDay(g.date)}</div>${items.map((t) => txRow(s, t))}`);
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return html`<section class="card list" aria-label="รายการล่าสุด" style="padding-bottom:8px">
    ${parts}
    ${total > shown ? html`<button class="link-btn lg" data-act="more" id="m-more" style="align-self:center">แสดงเพิ่ม (อีก ${total - shown} รายการ)</button>` : ''}
  </section>`;
}

async function editBudgets(app) {
  const s = app.state;
  const outs = s.categories.filter((c) => c.type === 'out');
  const r = await openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>งบต่อเดือน</h2>
      <p class="sub">ช่องว่าง = ไม่ตั้งงบ</p>
      <div class="stack s4">${outs.map((c) => html`<label class="li" style="gap:10px">
        <span class="dot" style="background:${c.color}"></span><span class="grow">${c.name}</span>
        <input class="input sm" data-id="${c.id}" inputmode="decimal" autocomplete="off" placeholder="ไม่ตั้ง" value="${c.budget > 0 ? money(c.budget) : ''}" aria-label="งบ ${c.name} (บาท)">
      </label>`)}</div>
      <p class="small warn" data-err role="alert"></p>
      <button class="btn md" data-ok>บันทึกงบ</button>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const err = panel.querySelector('[data-err]');
    panel.querySelector('[data-ok]').addEventListener('click', () => {
      const out = {};
      for (const inp of panel.querySelectorAll('[data-id]')) {
        const raw = inp.value.trim();
        const v = raw === '' ? 0 : parseMoney(raw);
        if (!Number.isFinite(v)) { err.textContent = `งบ${catById(s, inp.dataset.id).name}ต้องเป็นตัวเลข`; inp.classList.add('bad'); return; }
        out[inp.dataset.id] = round2(v);
      }
      close(out);
    });
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: 'งบต่อเดือน' });
  if (!r) return;
  app.commit((st) => { for (const c of st.categories) if (c.id in r) c.budget = r[c.id]; });
  toast('บันทึกงบแล้ว');
}

export default {
  id: 'money',
  title: 'เงิน',
  tab: 'money',
  render(app) {
    const cur = monthOf(app.today);
    const ym = app.local.ym || cur;
    const first = earliestMonth(app.state, app.today);
    return html`<div class="screen" style="gap:16px">
      <header class="row between">
        <h1 style="font-size:24px;font-weight:600">เงิน</h1>
        <div class="month-switch" role="group" aria-label="เลือกเดือน">
          <button data-act="month" data-d="-1" id="m-prev" aria-label="เดือนก่อน" ${ym <= first ? 'disabled' : ''}>${icon('back', 18, 2)}</button>
          <span aria-live="polite">${thMonth(ym)}</span>
          <button data-act="month" data-d="1" id="m-next" aria-label="เดือนถัดไป" ${ym >= cur ? 'disabled' : ''}>${icon('next', 18, 2)}</button>
        </div>
      </header>
      ${summaryCard(app, ym)}
      ${budgetsCard(app, ym)}
      ${walletTiles(app)}
      <a class="tile row between" href="#/wealth" id="m-wealth" style="min-height:56px">
        <span class="stack" style="gap:2px"><span>ทรัพย์สินและหนี้</span>
          <span class="small muted">ทรัพย์สินสุทธิ เงินลงทุน บัตรเครดิต เงินผ่อน</span></span>
        <span class="chev" aria-hidden="true">›</span>
      </a>
      ${listCard(app, ym)}
      <a class="btn" href="#/add?type=out">${icon('plus', 20, 2)}จดรายการ</a>
    </div>`;
  },
  actions: {
    month(app, el) {
      const cur = monthOf(app.today);
      const ym = addMonths(app.local.ym || cur, Number(el.dataset.d));
      if (ym > cur || ym < earliestMonth(app.state, app.today)) return;
      app.local.ym = ym;
      app.local.limit = PAGE;
      app.render();
    },
    more(app) { app.local.limit = (app.local.limit || PAGE) + PAGE; app.render(); },
    editBudgets(app) { editBudgets(app); },
    async tx(app, el) {
      const t = app.state.transactions.find((x) => x.id === el.dataset.id);
      if (!t) return;
      if (t.type !== 'transfer') { app.go(`add?id=${encodeURIComponent(t.id)}`); return; }
      const ok = await confirmBox({
        title: 'ลบรายการย้ายเงินนี้?', ok: 'ลบรายการ', danger: true,
        body: `฿${money(t.amount)} · ${walletName(app.state, t.fromWalletId)} → ${walletName(app.state, t.toWalletId)} · ${thDay(t.date)} — เงินจะกลับไปอยู่กระเป๋าเดิม`,
      });
      if (!ok) return;
      app.state = deleteEntry(app.state, t.id);
      app.save();
      app.render();
      toast('ลบรายการแล้ว');
    },
  },
};
