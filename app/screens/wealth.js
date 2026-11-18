// SEED — ทรัพย์สินและหนี้ (#/wealth): ทรัพย์สินสุทธิ, ทรัพย์สินที่พิมพ์มูลค่าเอง, หนี้ + จ่ายหนี้
import { html, icon, toast, confirmBox, pickOne, promptBox, money, int, thDate, thMonthShort, parseMoney } from '../ui.js';
import { walletBalance, monthOf, round2 } from '../calc.js';
import {
  addDebt, updateDebt, deleteDebt, payDebt, addAsset, updateAsset, deleteAsset, logNetWorth,
} from '../store.js';
import { netWorth, payoffMonths, monthlyInterest } from '../wealth.js';
import { topbar } from './common.js';

const KIND_DEBT = { card: 'บัตรเครดิต', loan: 'เงินผ่อน/สินเชื่อ', other: 'หนี้อื่น ๆ' };
const KIND_ASSET = { invest: 'เงินลงทุน', other: 'ทรัพย์สินอื่น' };
const rateOf = (app) => app.fxNow().fx?.rate || null;
const findDebt = (app, id) => app.state.debts.find((d) => d.id === id);
const findAsset = (app, id) => app.state.assets.find((a) => a.id === id);
const signedMoney = (n) => (n < 0 ? '−' : '') + money(Math.abs(n));

const moneyRule = (t) => (Number.isFinite(parseMoney(t)) ? '' : 'ใส่เป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง');
const askMoney = (title, value, hint = '') => promptBox({
  title, label: 'บาท', value: value ? money(value) : '', inputmode: 'decimal', ok: 'ตกลง', hint, validate: moneyRule,
}).then((v) => (v === undefined ? undefined : round2(parseMoney(v))));
const askName = (title, value = '') => promptBox({
  title, label: 'ชื่อ', value, ok: 'ตกลง',
  validate: (t) => (!t.trim() ? 'ใส่ชื่อก่อน' : t.trim().length > 40 ? 'ยาวไม่เกิน 40 ตัวอักษร' : ''),
}).then((v) => (v === undefined ? undefined : v.trim()));

/** จดทรัพย์สินสุทธิของเดือนนี้ไว้ดูย้อนหลัง (เขียนเฉพาะตอนค่าเปลี่ยน) */
function remember(app, total) {
  const ym = monthOf(app.today);
  const last = app.state.netWorthLog.find((x) => x.ym === ym);
  if (last && last.total === total) return;
  app.state = logNetWorth(app.state, ym, total);
  app.save();
}

function summaryCard(app, nw) {
  const log = app.state.netWorthLog.slice(-6);
  return html`<section class="card" aria-label="ทรัพย์สินสุทธิ" style="gap:10px">
    <span class="label">ทรัพย์สินสุทธิ</span>
    <span class="mono" id="nw-total" style="font-size:30px;font-weight:600;${nw.total < 0 ? 'color:var(--orange)' : ''}">฿${signedMoney(nw.total)}</span>
    <div class="stack" style="gap:4px">
      <div class="row between small"><span class="muted">เงินในกระเป๋า</span><span class="mono" id="nw-cash">+${money(nw.cash)}</span></div>
      <div class="row between small"><span class="muted">ทรัพย์สิน</span><span class="mono" id="nw-assets">+${money(nw.assets)}</span></div>
      <div class="row between small"><span class="muted">หนี้</span><span class="mono" id="nw-debts">−${money(nw.debts)}</span></div>
    </div>
    ${nw.missingFx ? html`<p class="small warn">ยังไม่มีเรทดอลลาร์ ทรัพย์สินที่เป็น USD ยังไม่ถูกนับ ลองเปิดหน้าค่าเงินตอนมีเน็ต</p>` : ''}
    ${log.length > 1 ? html`<div class="stack" style="gap:2px;border-top:1px solid var(--line);padding-top:8px">
      <span class="small muted">ย้อนหลัง (บันทึกเองเดือนละครั้งตอนเปิดหน้านี้)</span>
      ${log.map((x) => html`<div class="row between small"><span>${thMonthShort(x.ym)}</span><span class="mono">฿${signedMoney(x.total)}</span></div>`)}
    </div>` : ''}
    <p class="small muted" style="line-height:1.6">ทรัพย์สินสุทธิ = ของที่มีทั้งหมด − หนี้ทั้งหมด ถ้าเพิ่มขึ้นทุกปี แปลว่ากำลังรวยขึ้นจริง</p>
  </section>`;
}

function assetRow(app, a, rate) {
  const thb = a.currency === 'USD' ? (rate ? a.value * rate : null) : a.value;
  return html`<button class="li" data-act="assetMenu" data-id="${a.id}" id="as-${a.id}" style="min-height:60px">
    <span class="grow" style="min-width:0"><span class="ellipsis" style="display:block">${a.name}</span>
      <span class="small muted">${KIND_ASSET[a.kind]}${a.updatedAt ? ` · อัปเดต ${thDate(a.updatedAt)}` : ''}</span></span>
    <span class="stack" style="align-items:flex-end;gap:0">
      <span class="mono">${a.currency === 'USD' ? `$${money(a.value)}` : money(a.value)}</span>
      ${a.currency === 'USD' ? html`<span class="small muted mono">${thb == null ? 'ไม่มีเรท' : `≈ ฿${int(thb)}`}</span>` : ''}
    </span>
  </button>`;
}

function assetsCard(app, rate) {
  const list = app.state.assets;
  return html`<section class="card list" aria-label="ทรัพย์สิน">
    <div class="list-head"><h2 class="label">ทรัพย์สิน</h2><button class="link-btn" data-act="addAsset" id="as-add">+ เพิ่ม</button></div>
    ${list.length ? list.map((a) => assetRow(app, a, rate))
      : html`<p class="sub" style="padding:8px 0;line-height:1.6">ยังไม่มี เช่น กองทุน หุ้น หรือเงินในแอพหุ้น (เงินในกระเป๋านับให้แล้ว ไม่ต้องใส่ซ้ำ)</p>`}
    <p class="small muted" style="line-height:1.5;padding:6px 0 14px">แอพไม่ดึงราคาหุ้นเอง แตะรายการเพื่อพิมพ์มูลค่าล่าสุดจากแอพหุ้น เดือนละครั้งก็พอ</p>
  </section>`;
}

/** บรรทัดอธิบายหนี้: ดอกเบี้ยเดือนนี้ + หมดเมื่อไหร่ */
function debtLine(d) {
  const parts = [];
  if (d.rate > 0) parts.push(`ดอกเบี้ย ${d.rate}%/ปี ≈ ฿${money(monthlyInterest(d.balance, d.rate))}/เดือน`);
  if (d.minPay > 0) {
    const n = payoffMonths(d.balance, d.rate, d.minPay);
    parts.push(n == null ? `จ่ายเดือนละ ${money(d.minPay)} ไม่พอดอกเบี้ย หนี้จะไม่ลด` : `จ่ายเดือนละ ${money(d.minPay)} หมดในราว ${n} เดือน`);
  }
  if (d.dueDay) parts.push(`ครบกำหนดทุกวันที่ ${d.dueDay}`);
  return parts;
}

function debtsCard(app) {
  const list = app.state.debts;
  return html`<section class="card list" aria-label="หนี้">
    <div class="list-head"><h2 class="label">หนี้</h2><button class="link-btn" data-act="addDebt" id="db-add">+ เพิ่ม</button></div>
    ${list.length ? list.map((d) => {
      const lines = debtLine(d);
      const never = d.minPay > 0 && payoffMonths(d.balance, d.rate, d.minPay) == null;
      return html`<button class="li" data-act="debtMenu" data-id="${d.id}" id="db-${d.id}" style="min-height:60px;align-items:flex-start;padding:10px 0">
        <span class="grow" style="min-width:0"><span class="ellipsis" style="display:block">${d.name}</span>
          ${d.name !== KIND_DEBT[d.kind] ? html`<span class="small muted" style="display:block">${KIND_DEBT[d.kind]}</span>` : ''}
          ${lines.map((l, i) => html`<span class="small ${never && i === (d.rate > 0 ? 1 : 0) ? 'warn' : 'muted'}" style="display:block;line-height:1.5">${l}</span>`)}</span>
        <span class="mono">${d.balance > 0 ? `−${money(d.balance)}` : 'หมดแล้ว'}</span>
      </button>`;
    }) : html`<p class="sub" style="padding:8px 0;line-height:1.6">ยังไม่มีหนี้ ดีมาก ถ้าวันหลังมีบัตรเครดิตหรือผ่อนของ ใส่ไว้ที่นี่</p>`}
    <p class="small muted" style="line-height:1.5;padding:6px 0 14px">แตะหนี้เพื่อ "จ่ายหนี้" (แอพจดเป็นรายจ่ายและลดยอดให้) หรือแก้ยอด ดอกเบี้ยบัตรเครดิตมักสูงมาก ควรจ่ายเต็มยอดทุกเดือน</p>
  </section>`;
}

export default {
  id: 'wealth',
  title: 'ทรัพย์สินและหนี้',
  tab: null,
  render(app) {
    const rate = rateOf(app);
    const nw = netWorth(app.state, rate);
    if (!nw.missingFx) remember(app, nw.total);
    return html`<div class="screen" style="gap:16px">
      ${topbar('ทรัพย์สินและหนี้', 'money')}
      ${summaryCard(app, nw)}
      ${assetsCard(app, rate)}
      ${debtsCard(app)}
    </div>`;
  },
  actions: {
    async addAsset(app) {
      const kind = await pickOne({ title: 'ทรัพย์สินแบบไหน', current: 'invest', options: [
        { value: 'invest', label: KIND_ASSET.invest, sub: 'กองทุน หุ้น ETF เงินในแอพหุ้น' },
        { value: 'other', label: KIND_ASSET.other, sub: 'เช่น ทอง หรือของที่ขายได้' },
      ] });
      if (kind === undefined) return;
      const name = await askName('ชื่อทรัพย์สิน');
      if (name === undefined) return;
      const currency = await pickOne({ title: 'มูลค่าเป็นสกุลไหน', current: 'THB', options: [
        { value: 'THB', label: 'บาท (฿)' }, { value: 'USD', label: 'ดอลลาร์ ($)', sub: 'แอพแปลงเป็นบาทด้วยเรทล่าสุด' },
      ] });
      if (currency === undefined) return;
      const value = await promptBox({
        title: 'มูลค่าตอนนี้', label: currency === 'USD' ? 'ดอลลาร์' : 'บาท', inputmode: 'decimal', ok: 'บันทึก', validate: moneyRule,
      });
      if (value === undefined) return;
      const r = addAsset(app.state, { name, kind, currency, value: round2(parseMoney(value)), date: app.today });
      if (!r.ok) { toast(r.error); return; }
      app.state = r.state; app.save(); app.render();
      toast('เพิ่มทรัพย์สินแล้ว');
    },
    async assetMenu(app, el) {
      const a = findAsset(app, el.dataset.id);
      if (!a) return;
      const pick = await pickOne({ title: a.name, options: [
        { value: 'value', label: 'อัปเดตมูลค่า', sub: `ตอนนี้ ${a.currency === 'USD' ? '$' : '฿'}${money(a.value)}` },
        { value: 'name', label: 'เปลี่ยนชื่อ' },
        { value: 'del', label: 'ลบ' },
      ] });
      if (pick === 'value') {
        const v = await promptBox({
          title: 'มูลค่าล่าสุด', label: a.currency === 'USD' ? 'ดอลลาร์' : 'บาท', value: money(a.value), inputmode: 'decimal', ok: 'บันทึก', validate: moneyRule,
        });
        if (v === undefined) return;
        const r = updateAsset(app.state, a.id, { value: round2(parseMoney(v)), date: app.today });
        if (!r.ok) { toast(r.error); return; }
        app.state = r.state; app.save(); app.render();
      } else if (pick === 'name') {
        const n = await askName('เปลี่ยนชื่อ', a.name);
        if (n === undefined) return;
        const r = updateAsset(app.state, a.id, { name: n });
        if (r.ok) { app.state = r.state; app.save(); app.render(); }
      } else if (pick === 'del') {
        if (!(await confirmBox({ title: `ลบ "${a.name}"?`, ok: 'ลบ', danger: true }))) return;
        app.state = deleteAsset(app.state, a.id); app.save(); app.render();
      }
    },
    async addDebt(app) {
      const kind = await pickOne({ title: 'หนี้แบบไหน', current: 'card', options: [
        { value: 'card', label: KIND_DEBT.card }, { value: 'loan', label: KIND_DEBT.loan, sub: 'ผ่อนของ ผ่อนรถ กยศ.' },
        { value: 'other', label: KIND_DEBT.other, sub: 'เช่น ยืมเพื่อน' },
      ] });
      if (kind === undefined) return;
      const name = await askName('ชื่อหนี้', KIND_DEBT[kind]);
      if (name === undefined) return;
      const balance = await askMoney('ยอดที่ยังค้างอยู่', 0);
      if (balance === undefined) return;
      const rateTxt = await promptBox({
        title: 'ดอกเบี้ยต่อปี', label: '% ต่อปี (ไม่รู้หรือไม่มี ใส่ 0)', value: kind === 'card' ? '16' : '0', inputmode: 'decimal', ok: 'ตกลง',
        hint: kind === 'card' ? 'บัตรเครดิตในไทยมักคิดราว 16% ต่อปี ถ้าจ่ายไม่เต็มยอด ดูตัวเลขจริงในใบแจ้งยอด' : '',
        validate: (t) => { const n = Number(t.replace(/,/g, '')); return Number.isFinite(n) && n >= 0 && n <= 100 ? '' : 'ใส่ 0–100'; },
      });
      if (rateTxt === undefined) return;
      const minPay = await askMoney('จ่ายเดือนละเท่าไหร่', 0, 'ใช้คำนวณว่าหนี้จะหมดเมื่อไหร่ ไม่รู้ใส่ 0 ก่อนได้');
      if (minPay === undefined) return;
      const r = addDebt(app.state, { name, kind, balance, rate: Number(rateTxt.replace(/,/g, '')), minPay });
      if (!r.ok) { toast(r.error); return; }
      app.state = r.state; app.save(); app.render();
      toast('เพิ่มหนี้แล้ว');
    },
    async debtMenu(app, el) {
      const d = findDebt(app, el.dataset.id);
      if (!d) return;
      const pick = await pickOne({ title: d.name, options: [
        ...(d.balance > 0 ? [{ value: 'pay', label: 'จ่ายหนี้', sub: 'จดเป็นรายจ่ายจากกระเป๋า แล้วลดยอดหนี้' }] : []),
        { value: 'balance', label: 'แก้ยอดที่ค้าง', sub: 'เช่น ตามใบแจ้งยอดใหม่' },
        { value: 'rate', label: 'แก้ดอกเบี้ย / ค่างวด' },
        { value: 'del', label: 'ลบ' },
      ] });
      if (pick === 'pay') {
        const wallets = app.state.wallets;
        const walletId = await pickOne({ title: 'จ่ายจากกระเป๋า', options: wallets.map((w) => ({ value: w.id, label: w.name, sub: `ยอด ฿${money(walletBalance(app.state, w.id))}` })) });
        if (walletId === undefined) return;
        const amount = await askMoney('จ่ายเท่าไหร่', Math.min(d.minPay || d.balance, d.balance), `ค้างอยู่ ฿${money(d.balance)}`);
        if (amount === undefined) return;
        const r = payDebt(app.state, { debtId: d.id, walletId, amount, date: app.today });
        if (!r.ok) { toast(r.error); return; }
        app.state = r.state; app.save(); app.render();
        toast(`จ่าย ฿${money(amount)} แล้ว เหลือ ฿${money(r.state.debts.find((x) => x.id === d.id).balance)}`);
      } else if (pick === 'balance') {
        const v = await askMoney('ยอดที่ค้างตอนนี้', d.balance);
        if (v === undefined) return;
        const r = updateDebt(app.state, d.id, { balance: v });
        if (!r.ok) { toast(r.error); return; }
        app.state = r.state; app.save(); app.render();
      } else if (pick === 'rate') {
        const rateTxt = await promptBox({
          title: 'ดอกเบี้ยต่อปี', label: '% ต่อปี', value: String(d.rate), inputmode: 'decimal', ok: 'ตกลง',
          validate: (t) => { const n = Number(t.replace(/,/g, '')); return Number.isFinite(n) && n >= 0 && n <= 100 ? '' : 'ใส่ 0–100'; },
        });
        if (rateTxt === undefined) return;
        const minPay = await askMoney('จ่ายเดือนละเท่าไหร่', d.minPay);
        if (minPay === undefined) return;
        const r = updateDebt(app.state, d.id, { rate: Number(rateTxt.replace(/,/g, '')), minPay });
        if (!r.ok) { toast(r.error); return; }
        app.state = r.state; app.save(); app.render();
      } else if (pick === 'del') {
        if (!(await confirmBox({ title: `ลบ "${d.name}"?`, body: 'รายการจ่ายหนี้ที่จดไปแล้วยังอยู่ในหน้าเงิน', ok: 'ลบ', danger: true }))) return;
        app.state = deleteDebt(app.state, d.id); app.save(); app.render();
      }
    },
  },
};
