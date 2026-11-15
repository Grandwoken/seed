// SEED — จดรายการ (#/add?type=out|in) และแก้รายการเดิม (#/add?id=<id>)
import {
  html, icon, toast, confirmBox, pickOne, promptBox, keypadPress, amountDisplay, dayLabel,
  money, signed, bool, parseMoney,
} from '../ui.js';
import { lastWalletFor, walletBalance, addDays } from '../calc.js';
import { addEntry, updateEntry, deleteEntry } from '../store.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
const keyId = (k) => `key-${k === '.' ? 'dot' : k}`;
const firstCat = (s, type) => s.categories.find((c) => c.type === type)?.id || '';
/** ชื่อกระเป๋าแบบสั้นสำหรับชิป ("บัญชีออมทรัพย์" → "ออมทรัพย์") */
const shortWallet = (name) => name.replace(/^บัญชี(?=.)/, '');

/** ฟอร์มของหน้านี้ เริ่มใหม่ทุกครั้งที่ลิงก์เปลี่ยน */
function form(app, route) {
  const ui = (app.ui.add ||= {});
  if (!ui.f || ui.key !== route.hash) {
    const s = app.state;
    const tx = route.query.id && s.transactions.find((t) => t.id === route.query.id && t.type !== 'transfer');
    if (tx) {
      ui.f = { editId: tx.id, type: tx.type, amount: String(tx.amount), categoryId: tx.categoryId, walletId: tx.walletId, date: tx.date, note: tx.note || '', repeat: false };
    } else {
      const type = route.query.type === 'in' ? 'in' : 'out';
      ui.f = { editId: null, type, amount: '0', categoryId: firstCat(s, type), walletId: lastWalletFor(s.transactions, type, s.wallets), date: app.today, note: '', repeat: false };
    }
    ui.key = route.hash;
  }
  return ui.f;
}

const amountText = (f) => `${f.type === 'out' ? '−' : '+'}฿${amountDisplay(f.amount)}`;

function press(app, k) {
  const f = app.ui.add?.f;
  if (!f) return;
  f.amount = keypadPress(f.amount, k);
  const el = document.querySelector('[data-live="amount"]');
  if (el) el.textContent = amountText(f); // อัปเดตแค่ตัวเลข ไม่วาดทั้งหน้า (กดรัว ๆ ได้ลื่น)
}

function close(app, fallback) {
  delete app.ui.add;
  app.back(fallback);
}

function save(app) {
  const f = app.ui.add?.f;
  if (!f) return;
  const s = app.state;
  const amount = parseMoney(f.amount);
  if (!Number.isFinite(amount) || amount <= 0) { toast('ใส่จำนวนเงินก่อน'); return; }
  if (!s.categories.some((c) => c.id === f.categoryId && c.type === f.type)) { toast('เลือกหมวดก่อน'); return; }
  if (!s.wallets.some((w) => w.id === f.walletId)) { toast('เลือกกระเป๋าเงินก่อน'); return; }
  const entry = { type: f.type, amount, categoryId: f.categoryId, walletId: f.walletId, date: f.date, note: f.note.trim() };
  if (f.editId) {
    app.state = updateEntry(s, f.editId, entry);
    app.save();
    toast('แก้รายการแล้ว');
    close(app, 'money');
    return;
  }
  const repeat = f.repeat && f.type === 'in';
  app.state = addEntry(s, entry, { repeat }).state;
  app.save();
  toast(`บันทึก ${signed(amount, f.type)} แล้ว${repeat ? ` · ลงให้ทุกวันที่ ${Number(f.date.slice(8, 10))}` : ''}`);
  close(app, 'home');
}

// แป้นพิมพ์จริง (คอม/คีย์บอร์ดบลูทูธ): ตัวเลข . Backspace Enter
let keysBound = false;
function bindKeys(app) {
  if (keysBound) return;
  keysBound = true;
  document.addEventListener('keydown', (e) => {
    if (app.route.name !== 'add' || app.locked || !app.state.settings.onboarded) return;
    if (document.querySelector('.overlay') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'Enter') {
      if (!e.target.closest?.('button, a')) { e.preventDefault(); save(app); }
      return;
    }
    const k = /^[0-9]$/.test(e.key) ? e.key : e.key === '.' ? '.' : e.key === 'Backspace' ? 'del' : null;
    if (!k) return;
    e.preventDefault();
    press(app, k);
  });
}

export default {
  id: 'add',
  title: 'จดรายการ',
  tab: null,
  sheet: true, // เปิดทับหน้าเดิม (หน้าเดิมจำสถานะไว้)
  render(app, route) {
    const s = app.state;
    const f = form(app, route);
    const out = f.type === 'out';
    const cats = s.categories.filter((c) => c.type === f.type);
    const cat = cats.find((c) => c.id === f.categoryId);
    const wallet = s.wallets.find((w) => w.id === f.walletId);
    const when = dayLabel(f.date, app.today);
    return html`<div class="sheet-wrap">
      <button class="scrim" data-act="cancel" aria-label="ปิด" tabindex="-1"></button>
      <section class="sheet" aria-labelledby="add-title" style="gap:14px">
        <div class="grab" aria-hidden="true"></div>
        <div class="row between">
          <button class="link-btn lg" data-act="cancel" style="color:var(--muted)">ยกเลิก</button>
          <h1 id="add-title" class="h-title">${f.editId ? 'แก้รายการ' : 'จดรายการ'}</h1>
          <span style="width:44px"></span>
        </div>
        <div class="seg" role="group" aria-label="ประเภท" style="background:var(--bg)">
          <button data-act="type" data-v="out" id="add-out" aria-pressed="${bool(out)}">รายจ่าย</button>
          <button data-act="type" data-v="in" id="add-in" aria-pressed="${bool(!out)}">รายรับ</button>
        </div>
        <div style="text-align:center;padding:4px 0">
          <div class="mono" data-live="amount" aria-live="polite" style="font-size:46px;font-weight:600;line-height:1.25;overflow-wrap:anywhere;color:${out ? 'var(--text)' : 'var(--green)'}">${amountText(f)}</div>
          <div class="small muted">${when} · ${cat ? cat.name : 'เลือกหมวด'} · ${wallet ? wallet.name : 'เลือกกระเป๋า'}</div>
        </div>
        <div class="grid3" role="group" aria-label="หมวด">
          ${cats.map((c) => html`<button class="chip dark" style="font-size:13px" data-act="cat" data-id="${c.id}" id="cat-${c.id}" aria-pressed="${bool(c.id === f.categoryId)}">${c.name}</button>`)}
        </div>
        <div class="grid3">
          <button class="chip raised" style="font-size:13px" data-act="date" id="add-date" aria-label="วันที่ ${when} แตะเพื่อเปลี่ยน">${icon('calendar', 16)}<span class="ellipsis">${when}</span></button>
          <button class="chip raised" style="font-size:13px" data-act="wallet" id="add-wallet" aria-label="กระเป๋า ${wallet ? wallet.name : ''} แตะเพื่อเปลี่ยน">${icon('wallet', 16)}<span class="ellipsis">${wallet ? shortWallet(wallet.name) : '—'}</span></button>
          <button class="chip dashed" style="font-size:13px" data-act="note" id="add-note">${f.note ? html`${icon('note', 16)}<span class="ellipsis">${f.note}</span>` : '+ โน้ต'}</button>
        </div>
        ${!out && !f.editId ? html`<div class="row" style="background:var(--bg);border-radius:12px;padding:6px 6px 6px 14px;gap:12px">
          <span class="grow" id="rep-label" style="font-size:14px">ทำซ้ำทุกเดือน <span class="small muted">(วันที่เดียวกัน)</span></span>
          <button class="switch" role="switch" id="add-repeat" aria-labelledby="rep-label" aria-checked="${bool(f.repeat)}" data-act="repeat"></button>
        </div>` : ''}
        <div class="keypad">${KEYS.map((k) => html`<button data-act="key" data-k="${k}" id="${keyId(k)}" aria-label="${k === 'del' ? 'ลบตัวเลข' : k}">${k === 'del' ? '⌫' : k}</button>`)}</div>
        <button class="btn" data-act="save" id="add-save">บันทึก</button>
        ${f.editId ? html`<button class="btn ghost" data-act="del" id="add-del" style="color:var(--orange)">ลบรายการนี้</button>` : ''}
      </section>
    </div>`;
  },
  mount(app) { bindKeys(app); },
  actions: {
    cancel(app) { close(app, app.ui.add?.f?.editId ? 'money' : 'home'); },
    type(app, el) {
      const f = app.ui.add.f;
      if (f.type === el.dataset.v) return;
      f.type = el.dataset.v;
      f.categoryId = firstCat(app.state, f.type);
      if (!f.editId) f.walletId = lastWalletFor(app.state.transactions, f.type, app.state.wallets);
      f.repeat = false;
      app.render();
    },
    cat(app, el) { app.ui.add.f.categoryId = el.dataset.id; app.render(); },
    key(app, el) { press(app, el.dataset.k); },
    async date(app) {
      const f = app.ui.add.f;
      const yest = dayLabel(f.date, app.today) === 'เมื่อวาน';
      const v = await pickOne({
        title: 'วันที่', current: f.date === app.today ? 'today' : yest ? 'yesterday' : 'pick',
        options: [{ value: 'today', label: 'วันนี้' }, { value: 'yesterday', label: 'เมื่อวาน' }, { value: 'pick', label: 'เลือกวัน…' }],
      });
      if (v === 'today') f.date = app.today;
      else if (v === 'yesterday') f.date = addDays(app.today, -1);
      else if (v === 'pick') {
        const iso = await promptBox({
          title: 'เลือกวัน', label: 'วันที่', type: 'date', value: f.date,
          validate: (t) => (!/^\d{4}-\d{2}-\d{2}$/.test(t) ? 'เลือกวันที่ก่อน' : t > app.today ? 'จดล่วงหน้าไม่ได้ เลือกวันนี้หรือก่อนหน้า' : ''),
        });
        if (iso) f.date = iso;
      }
      if (v !== undefined) app.render();
    },
    async wallet(app) {
      const f = app.ui.add.f;
      const v = await pickOne({
        title: f.type === 'out' ? 'จ่ายจากกระเป๋า' : 'เข้ากระเป๋า', current: f.walletId,
        options: app.state.wallets.map((w) => ({ value: w.id, label: w.name, sub: `ยอด ฿${money(walletBalance(app.state, w.id))}` })),
      });
      if (v !== undefined) { f.walletId = v; app.render(); }
    },
    async note(app) {
      const f = app.ui.add.f;
      const v = await promptBox({
        title: 'โน้ต', label: 'เช่น ข้าวกลางวัน, ชีทติว', value: f.note, ok: 'ใส่โน้ต',
        validate: (t) => (t.trim().length > 60 ? 'ยาวไม่เกิน 60 ตัวอักษร' : ''),
      });
      if (v !== undefined) { f.note = v.trim(); app.render(); }
    },
    repeat(app) { const f = app.ui.add.f; f.repeat = !f.repeat; app.render(); },
    save(app) { save(app); },
    async del(app) {
      const f = app.ui.add.f;
      const ok = await confirmBox({ title: 'ลบรายการนี้?', body: `${signed(parseMoney(f.amount), f.type)} · ${dayLabel(f.date, app.today)} — ลบแล้วกู้คืนไม่ได้`, ok: 'ลบรายการ', danger: true });
      if (!ok) return;
      app.state = deleteEntry(app.state, f.editId);
      app.save();
      toast('ลบรายการแล้ว');
      close(app, 'money');
    },
  },
};
