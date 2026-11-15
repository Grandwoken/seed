// SEED — ออมเข้าเป้า (#/save-goal): ย้ายเงินจากกระเป๋าใช้จ่ายไปกระเป๋าเงินเก็บเป้า (บันทึกเป็น transfer)
import { html, icon, toast, pickOne, promptBox, money, parseMoney, bool } from '../ui.js';
import { walletBalance, goalSaved, goalProgress, round2 } from '../calc.js';
import { addTransfer } from '../store.js';
import { ring } from '../charts.js';

const CHIPS = [100, 300, 500];
const goalOf = (s) => s.goals.find((g) => g.id === 'g1');

function form(app) {
  const ui = (app.ui['save-goal'] ||= {});
  if (!ui.f) {
    const s = app.state;
    const linked = goalOf(s)?.walletIds || [];
    const to = s.wallets.find((w) => linked.includes(w.id))?.id || null;
    const from = (s.wallets.find((w) => !linked.includes(w.id)) || s.wallets.find((w) => w.id !== to))?.id || null;
    const bal = from ? walletBalance(s, from) : 0;
    ui.f = { from, to, amount: round2(Math.max(0, Math.min(500, bal))) };
  }
  return ui.f;
}

function close(app) {
  delete app.ui['save-goal'];
  app.back('home');
}

/** เหตุที่ยังย้ายไม่ได้ ('' = ย้ายได้) */
function problem(s, f) {
  if (!f.from || !f.to) return 'ต้องมีกระเป๋าอย่างน้อย 2 ใบ';
  if (f.from === f.to) return 'เลือกกระเป๋าต้นทางกับปลายทางคนละใบ';
  const bal = walletBalance(s, f.from);
  if (bal <= 0) return 'กระเป๋าต้นทางไม่มีเงิน';
  if (!(f.amount > 0)) return 'ใส่จำนวนเงินก่อน';
  if (f.amount > bal) return `เกินยอดในกระเป๋า (มี ฿${money(bal)})`;
  return '';
}

export default {
  id: 'save-goal',
  title: 'ออมเข้าเป้า',
  tab: null,
  sheet: true, // เปิดทับหน้าเดิม (หน้าเดิมจำสถานะไว้)
  render(app) {
    const s = app.state;
    const f = form(app);
    const g = goalOf(s);
    const linked = g?.walletIds || [];
    const from = s.wallets.find((w) => w.id === f.from);
    const to = s.wallets.find((w) => w.id === f.to);
    const fromBal = from ? walletBalance(s, from.id) : 0;
    const saved = g ? goalSaved(s, g) : 0;
    const delta = (to && linked.includes(to.id) ? f.amount : 0) - (from && linked.includes(from.id) ? f.amount : 0);
    const after = round2(saved + delta);
    const pBefore = g ? goalProgress(saved, g.target) : 0;
    const pAfter = g ? goalProgress(after, g.target) : 0;
    const up = Math.round((pAfter - pBefore) * 1000) / 10;
    const why = problem(s, f);
    const noGoalWallet = !linked.length;
    return html`<div class="sheet-wrap">
      <button class="scrim" data-act="cancel" aria-label="ปิด" tabindex="-1"></button>
      <section class="sheet" aria-labelledby="sg-title">
        <div class="grab" aria-hidden="true"></div>
        <div class="row between">
          <button class="link-btn lg" data-act="cancel" style="color:var(--muted)">ยกเลิก</button>
          <h1 id="sg-title" class="h-title">ออมเข้าเป้า</h1>
          <span style="width:44px"></span>
        </div>
        ${g ? html`<div class="row" style="gap:16px;background:var(--bg);border-radius:18px;padding:14px">
          ${ring({
            arcs: [{ frac: pAfter, color: '#A9BCFF', opacity: 0.45 }, { frac: Math.min(pBefore, pAfter), color: '#7C9CFF' }],
            text: `${Math.round(pAfter * 100)}%`, label: `ความคืบหน้าเป้าหลังออม ${Math.round(pAfter * 100)}%`,
          })}
          <span class="grow stack" style="gap:2px">
            <span class="small muted">${g.name}</span>
            <span class="mono" style="font-size:15px;color:var(--muted)">${money(saved)} → <b style="color:var(--text);font-size:18px">${money(after)}</b></span>
            <span class="small" style="color:var(--blue-text)">${up >= 0 ? '+' : '−'}${Math.abs(up).toFixed(1)}% จากตอนนี้</span>
          </span>
        </div>` : ''}
        ${noGoalWallet ? html`<div class="note warn">ยังไม่ได้เลือกว่ากระเป๋าไหนเป็น "เงินเก็บเป้า" <a href="#/settings">ไปตั้งค่า</a></div>` : ''}
        <div class="stack" style="gap:8px">
          <button class="wallet-row" data-act="from" id="sg-from">
            <span class="muted" style="width:28px">จาก</span><span class="grow">${from ? from.name : 'เลือกกระเป๋า'}</span>
            <span class="mono muted">${from ? money(fromBal) : ''}</span>
          </button>
          <div style="align-self:center;color:var(--blue)" aria-hidden="true">${icon('down', 20)}</div>
          <button class="wallet-row" data-act="to" id="sg-to">
            <span class="muted" style="width:28px">ไป</span>
            <span class="grow">${to ? to.name : 'เลือกกระเป๋า'} ${to && linked.includes(to.id) ? html`<span class="pill">เงินเก็บเป้า</span>` : ''}</span>
          </button>
        </div>
        <button class="amount-btn mono" data-act="typeAmount" id="sg-amount" aria-label="จำนวนเงิน ${money(f.amount)} บาท แตะเพื่อพิมพ์">฿${money(f.amount)}</button>
        <div class="grid4">
          ${CHIPS.map((v) => html`<button class="chip dark mono" data-act="chip" data-v="${v}" id="sg-c${v}" aria-pressed="${bool(f.amount === v)}" ${v > fromBal ? 'disabled' : ''}>${money(v)}</button>`)}
          <button class="chip dark" data-act="chip" data-v="all" id="sg-call" aria-pressed="${bool(fromBal > 0 && f.amount === fromBal)}" ${fromBal > 0 ? '' : 'disabled'}>ทั้งหมด</button>
        </div>
        ${why ? html`<p class="small warn" role="alert" style="text-align:center">${why}</p>` : ''}
        <p class="small muted" style="text-align:center;line-height:1.6">เป็นการย้ายเงินระหว่างกระเป๋า ไม่นับเป็นรายจ่าย</p>
        <button class="btn" data-act="save" id="sg-save" ${why ? 'disabled' : ''}>ย้ายเงินเข้าเป้า</button>
      </section>
    </div>`;
  },
  actions: {
    cancel(app) { close(app); },
    chip(app, el) {
      const f = app.ui['save-goal'].f;
      f.amount = el.dataset.v === 'all' ? walletBalance(app.state, f.from) : Number(el.dataset.v);
      app.render();
    },
    async typeAmount(app) {
      const f = app.ui['save-goal'].f;
      const v = await promptBox({
        title: 'จำนวนเงิน', label: 'บาท', value: f.amount ? money(f.amount) : '', inputmode: 'decimal', ok: 'ตกลง',
        validate: (t) => (Number.isFinite(parseMoney(t)) ? '' : 'ใส่เป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง'),
      });
      if (v !== undefined) { f.amount = round2(parseMoney(v)); app.render(); }
    },
    async from(app) {
      const f = app.ui['save-goal'].f;
      const v = await pickOne({
        title: 'ย้ายจากกระเป๋า', current: f.from,
        options: app.state.wallets.filter((w) => w.id !== f.to).map((w) => ({ value: w.id, label: w.name, sub: `ยอด ฿${money(walletBalance(app.state, w.id))}` })),
      });
      if (v !== undefined) { f.from = v; app.render(); }
    },
    async to(app) {
      const f = app.ui['save-goal'].f;
      const linked = goalOf(app.state)?.walletIds || [];
      const v = await pickOne({
        title: 'ย้ายไปกระเป๋า', current: f.to,
        options: app.state.wallets.filter((w) => w.id !== f.from).map((w) => ({ value: w.id, label: w.name, sub: linked.includes(w.id) ? 'เงินเก็บเป้า' : 'ไม่นับเข้าเป้า' })),
      });
      if (v !== undefined) { f.to = v; app.render(); }
    },
    save(app) {
      const f = app.ui['save-goal'].f;
      const r = addTransfer(app.state, { fromWalletId: f.from, toWalletId: f.to, amount: f.amount, date: app.today });
      if (!r.ok) { toast(r.error); return; }
      const toName = app.state.wallets.find((w) => w.id === f.to)?.name || '';
      app.state = r.state;
      app.save();
      toast(`ย้าย ฿${money(f.amount)} เข้า${toName}แล้ว`);
      close(app);
    },
  },
};
