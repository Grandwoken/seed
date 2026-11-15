// SEED — ตั้งค่า (#/settings): สำรองข้อมูล, ความปลอดภัย, รายการประจำ, หมวด/งบ, กระเป๋า, โปรไฟล์, ลบข้อมูล
import {
  html, icon, toast, confirmBox, pickOne, promptBox, openPanel, toHTML, downloadText,
  money, signed, thDate, soft, parseMoney, bool,
} from '../ui.js';
import { daysBetween, walletBalance, nextOccurrence, round2 } from '../calc.js';
import { exportBackup, addCategory, deleteCategory, deleteWallet, setAccountDate, COLORS } from '../store.js';
import { topbar, importBackupFlow, confirmWipe, passcodePanel } from './common.js';
import { VERSION } from '../version.js';

const AUTOLOCK_MIN = [1, 5, 15];
const uid = (p) => `${p}_${crypto.randomUUID().slice(0, 8)}`;
const goalOf = (s) => s.goals.find((g) => g.id === 'g1');
const catById = (s, id) => s.categories.find((c) => c.id === id);
const walletById = (s, id) => s.wallets.find((w) => w.id === id);
const nameRule = (t) => (!t.trim() ? 'ใส่ชื่อก่อน' : t.trim().length > 30 ? 'ยาวไม่เกิน 30 ตัวอักษร' : '');
const short = (name) => [...name].slice(0, 4).join('');

function backupStatus(app) {
  const last = app.state.settings.lastExport;
  if (!last) return { text: 'ยังไม่เคยสำรอง', warn: true };
  const d = daysBetween(last, app.today);
  return { text: d <= 0 ? 'สำรองล่าสุดวันนี้' : `สำรองล่าสุด ${d} วันก่อน`, warn: d > 30 };
}

// ---------- ส่วนต่าง ๆ ของหน้า ----------

function backupCard(app) {
  const st = backupStatus(app);
  return html`<section class="card" aria-label="สำรองข้อมูล" style="gap:12px">
    <div class="row" style="gap:12px">
      <span class="ico-tile">${icon('download', 20)}</span>
      <span class="grow"><span class="h-title" style="display:block">สำรองข้อมูล</span>
        <span class="small ${st.warn ? 'warn' : 'muted'}">${st.text}</span></span>
    </div>
    <p class="sub" style="line-height:1.6">ข้อมูลอยู่ในเครื่องนี้เท่านั้น ถ้าล้างเบราว์เซอร์หรือเปลี่ยนเครื่องจะหายถ้าไม่ได้สำรอง เก็บไฟล์ไว้ใน Google Drive ก็ได้</p>
    <p class="small muted" style="line-height:1.6">ไฟล์สำรองไม่มีรหัสผ่านและไม่ได้เข้ารหัส ใครได้ไฟล์ไปก็เปิดดูยอดเงินได้</p>
    <div class="grid2" style="gap:8px">
      <button class="btn md" data-act="export" id="bk-export">ส่งออกไฟล์</button>
      <button class="btn md raised" data-act="import" id="bk-import">นำเข้าไฟล์</button>
    </div>
  </section>`;
}

function securityCard(app) {
  const lock = app.state.settings.lock;
  return html`<section class="card list" aria-label="ความปลอดภัย">
    <h2 class="label">ความปลอดภัย</h2>
    <div class="li" style="min-height:56px">
      <span class="grow" id="sw-lock-label">ล็อกด้วยรหัสผ่าน</span>
      <button class="switch" id="sw-lock" role="switch" aria-checked="${bool(lock.enabled)}" aria-labelledby="sw-lock-label" data-act="toggleLock"></button>
    </div>
    ${lock.enabled ? html`
      <button class="li" data-act="changePass" id="set-pass"><span class="grow">เปลี่ยนรหัสผ่าน</span><span class="chev" aria-hidden="true">›</span></button>
      <button class="li" data-act="autoLock" id="set-autolock"><span class="grow">ล็อกเองเมื่อออกจากแอพเกิน</span><span class="v">${lock.autoLockMin} นาที</span></button>
      <button class="li" data-act="lockNow" id="set-locknow"><span class="grow">ล็อกตอนนี้</span><span class="chev">${icon('lock', 18)}</span></button>` : ''}
    <p class="small muted" style="line-height:1.6;padding:6px 0 14px">หน้าล็อกกันคนอื่นเปิดดู แต่ข้อมูลในเครื่องยังไม่ได้เข้ารหัส</p>
  </section>`;
}

function recurringCard(app) {
  const s = app.state;
  const rows = s.recurring.map((r) => {
    const c = catById(s, r.categoryId);
    const [bg, fg] = soft(r.type === 'in' ? COLORS.green : c?.color);
    const w = walletById(s, r.walletId);
    return html`<button class="tx" data-act="editRec" data-id="${r.id}" id="rec-${r.id}">
      <span class="tag" style="background:${bg};color:${fg}">${r.type === 'in' ? 'รับ' : c?.short || 'อื่น'}</span>
      <span class="grow"><span style="display:block;font-size:14px">${r.note || c?.name || 'รายการประจำ'}</span>
        <span class="small muted">ทุกวันที่ ${r.dayOfMonth} · ${r.type === 'in' ? 'เข้า' : 'จาก'}${w ? w.name : 'กระเป๋าที่ลบไปแล้ว'}</span></span>
      <span class="amt ${r.type === 'in' ? 'in' : ''}">${signed(r.amount, r.type)}</span>
    </button>`;
  });
  return html`<section class="card list" aria-label="รายการประจำ">
    <div class="list-head"><h2 class="label">รายการประจำ</h2><button class="link-btn" data-act="addRec" id="rec-add">+ เพิ่ม</button></div>
    ${rows.length ? rows : html`<p class="sub" style="padding:8px 0;line-height:1.6">ยังไม่มี เช่น ค่าขนมที่ได้ทุกเดือน กด "+ เพิ่ม" แล้วแอพจะลงให้เอง</p>`}
    <p class="small muted" style="line-height:1.5;padding:6px 0 14px">แอพลงให้เองตอนเปิดแอพตั้งแต่วันนั้นเป็นต้นไป (ไม่ต้องเปิดตรงวัน) แล้วแจ้งว่าลงอะไรไป</p>
  </section>`;
}

function categoriesCard(app) {
  const s = app.state;
  const outs = s.categories.filter((c) => c.type === 'out');
  const ins = s.categories.filter((c) => c.type === 'in');
  return html`<section class="card list" aria-label="หมวดและงบต่อเดือน">
    <div class="list-head"><h2 class="label">หมวดและงบต่อเดือน</h2><button class="link-btn" data-act="addCat" id="cat-add">+ เพิ่ม</button></div>
    ${outs.map((c) => html`<div class="li">
      <span class="dot" style="background:${c.color}"></span>
      <button class="plain-btn grow" data-act="catMenu" data-id="${c.id}" id="cat-${c.id}">${c.name}</button>
      <input class="input sm" id="bud-${c.id}" data-change="budget" data-id="${c.id}" inputmode="decimal" autocomplete="off"
        value="${c.budget > 0 ? money(c.budget) : ''}" placeholder="ไม่ตั้ง" aria-label="งบต่อเดือน ${c.name} (บาท)">
    </div>`)}
    <p class="small muted" style="padding:6px 0 4px;line-height:1.5">ช่องว่าง = ไม่ตั้งงบ · แตะชื่อหมวดเพื่อเปลี่ยนชื่อหรือลบ</p>
    <h3 class="label" style="padding:14px 0 4px">หมวดรายรับ</h3>
    ${ins.map((c) => html`<div class="li">
      <span class="dot" style="background:${c.color}"></span>
      <button class="plain-btn grow" data-act="catMenu" data-id="${c.id}" id="cat-${c.id}">${c.name}</button>
    </div>`)}
    <div style="height:8px"></div>
  </section>`;
}

function walletsCard(app) {
  const s = app.state;
  const inGoal = goalOf(s)?.walletIds || [];
  return html`<section class="card list" aria-label="กระเป๋าเงิน">
    <div class="list-head"><h2 class="label">กระเป๋าเงิน</h2><button class="link-btn" data-act="addWallet" id="wal-add">+ เพิ่ม</button></div>
    ${s.wallets.map((w) => html`<button class="li" data-act="walletMenu" data-id="${w.id}" id="wal-${w.id}">
      <span class="grow">${w.name} ${inGoal.includes(w.id) ? html`<span class="pill">เงินเก็บเป้า</span>` : ''}</span>
      <span class="v">${money(walletBalance(s, w.id))}</span>
    </button>`)}
    <p class="small muted" style="line-height:1.5;padding:6px 0 14px">แตะกระเป๋าเพื่อเลือกว่านับเป็น "เงินเก็บเป้า" หรือไม่ เปลี่ยนชื่อ หรือแก้ยอดเริ่มต้น</p>
  </section>`;
}

function profileCard(app) {
  const st = app.state.settings;
  return html`<section class="card list" aria-label="โปรไฟล์">
    <h2 class="label">โปรไฟล์</h2>
    <button class="li" data-act="name" id="pf-name"><span class="grow">ชื่อ</span><span class="muted">${st.name || '—'}</span></button>
    <button class="li" data-act="accountDate" id="pf-date"><span class="grow">วันเปิดบัญชี</span><span class="v">${thDate(st.accountDate)}</span></button>
    <div style="height:6px"></div>
  </section>`;
}

// ---------- แผงแก้ไข ----------

const typeSeg = (type, label) => html`<div class="seg lg" role="group" aria-label="${label}" style="background:var(--bg)">
  <button type="button" data-type="out" aria-pressed="${bool(type === 'out')}">รายจ่าย</button>
  <button type="button" data-type="in" aria-pressed="${bool(type === 'in')}">รายรับ</button>
</div>`;

function wireTypeSeg(panel, onChange) {
  const btns = panel.querySelectorAll('[data-type]');
  btns.forEach((b) => b.addEventListener('click', () => {
    btns.forEach((x) => x.setAttribute('aria-pressed', bool(x === b)));
    onChange(b.dataset.type);
  }));
}

/** เพิ่ม/แก้รายการประจำ (item = null คือเพิ่มใหม่) */
async function editRecurring(app, item) {
  const s = app.state;
  if (!s.wallets.length) { toast('เพิ่มกระเป๋าเงินก่อน'); return; }
  const isNew = !item;
  const firstCat = (type) => s.categories.find((c) => c.type === type)?.id || '';
  const d = item || { type: 'in', amount: 0, categoryId: firstCat('in'), walletId: s.wallets[0].id, dayOfMonth: Number(app.today.slice(8, 10)), note: '' };
  const catOptions = (type, cur) => s.categories.filter((c) => c.type === type)
    .map((c) => html`<option value="${c.id}" ${c.id === cur ? 'selected' : ''}>${c.name}</option>`);
  const walletLabel = (type) => (type === 'in' ? 'เข้ากระเป๋า' : 'จ่ายจากกระเป๋า');

  const r = await openPanel((panel, close) => {
    let type = d.type;
    panel.innerHTML = toHTML(html`
      <h2>${isNew ? 'เพิ่มรายการประจำ' : 'แก้รายการประจำ'}</h2>
      ${typeSeg(type, 'ประเภท')}
      <label class="field">จำนวนเงิน (บาท)
        <input class="input mono" data-f="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${d.amount ? money(d.amount) : ''}"></label>
      <label class="field">ชื่อรายการ
        <input class="input" data-f="note" maxlength="40" autocomplete="off" placeholder="เช่น ค่าขนมรายเดือน" value="${d.note || ''}"></label>
      <label class="field">หมวด
        <select class="input" data-f="cat">${catOptions(type, d.categoryId)}</select></label>
      <label class="field"><span data-wlabel>${walletLabel(type)}</span>
        <select class="input" data-f="wallet">${s.wallets.map((w) => html`<option value="${w.id}" ${w.id === d.walletId ? 'selected' : ''}>${w.name}</option>`)}</select></label>
      <label class="field">ทุกวันที่ (1–31)
        <input class="input mono" data-f="day" type="number" min="1" max="31" step="1" inputmode="numeric" value="${d.dayOfMonth}"></label>
      <p class="sub" data-next aria-live="polite"></p>
      <p class="small warn" data-err role="alert"></p>
      <button class="btn md" data-ok>บันทึก</button>
      ${isNew ? '' : html`<button class="btn danger" data-del>ลบรายการประจำ</button>`}
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const f = (k) => panel.querySelector(`[data-f="${k}"]`);
    const err = panel.querySelector('[data-err]');
    const showNext = () => {
      const day = Number(f('day').value);
      const el = panel.querySelector('[data-next]');
      if (!Number.isInteger(day) || day < 1 || day > 31) { el.textContent = ''; return; }
      const next = nextOccurrence(day, isNew ? app.today : item.lastRun || app.today);
      const endNote = day > 28 ? ` · เดือนที่ไม่มีวันที่ ${day} จะลงวันสุดท้ายของเดือน` : '';
      el.textContent = `${isNew ? 'ครั้งแรกจะลง' : 'ครั้งถัดไป'} ${thDate(next)}${endNote}`;
    };
    wireTypeSeg(panel, (t) => {
      type = t;
      f('cat').innerHTML = toHTML(catOptions(t, ''));
      panel.querySelector('[data-wlabel]').textContent = walletLabel(t);
    });
    f('day').addEventListener('input', showNext);
    showNext();
    panel.querySelector('[data-ok]').addEventListener('click', () => {
      const amount = parseMoney(f('amount').value);
      const day = Number(f('day').value);
      if (!Number.isFinite(amount) || amount <= 0) { err.textContent = 'ใส่จำนวนเงินมากกว่า 0'; return; }
      if (!Number.isInteger(day) || day < 1 || day > 31) { err.textContent = 'วันที่ต้องเป็นเลข 1–31'; return; }
      if (!f('cat').value) { err.textContent = 'เลือกหมวดก่อน'; return; }
      close({ save: {
        id: item?.id || uid('r'), type, amount: round2(amount), categoryId: f('cat').value, walletId: f('wallet').value,
        dayOfMonth: day, note: f('note').value.trim(), lastRun: item?.lastRun || app.today,
      } });
    });
    panel.querySelector('[data-del]')?.addEventListener('click', () => close({ del: true }));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: isNew ? 'เพิ่มรายการประจำ' : 'แก้รายการประจำ' });

  if (!r) return;
  if (r.del) {
    const ok = await confirmBox({ title: 'ลบรายการประจำนี้?', body: 'รายการที่ลงไปแล้วยังอยู่เหมือนเดิม แค่จะไม่ลงให้อีก', ok: 'ลบ', danger: true });
    if (!ok) return;
    app.commit((st) => { st.recurring = st.recurring.filter((x) => x.id !== item.id); });
    toast('ลบรายการประจำแล้ว');
    return;
  }
  app.commit((st) => {
    const i = st.recurring.findIndex((x) => x.id === r.save.id);
    if (i >= 0) st.recurring[i] = r.save;
    else st.recurring.push(r.save);
  });
  toast(isNew ? `ตั้งแล้ว ครั้งแรกจะลง ${thDate(nextOccurrence(r.save.dayOfMonth, app.today))}` : 'บันทึกแล้ว');
}

async function addCategoryFlow(app) {
  const r = await openPanel((panel, close) => {
    let type = 'out';
    panel.innerHTML = toHTML(html`
      <h2>เพิ่มหมวด</h2>
      <label class="field">ชื่อหมวด
        <input class="input" data-f="name" maxlength="30" autocomplete="off" placeholder="เช่น ขนม, หนังสือ"></label>
      ${typeSeg(type, 'ประเภทหมวด')}
      <label class="field" data-budget-field>งบต่อเดือน (บาท ไม่ใส่ก็ได้)
        <input class="input mono" data-f="budget" inputmode="decimal" autocomplete="off" placeholder="ไม่ตั้ง"></label>
      <p class="small warn" data-err role="alert"></p>
      <button class="btn md" data-ok>เพิ่ม</button>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const f = (k) => panel.querySelector(`[data-f="${k}"]`);
    const err = panel.querySelector('[data-err]');
    wireTypeSeg(panel, (t) => { type = t; panel.querySelector('[data-budget-field]').hidden = t === 'in'; });
    const submit = () => {
      const name = f('name').value.trim();
      const bad = nameRule(name);
      if (bad) { err.textContent = bad; return; }
      if (app.state.categories.some((c) => c.type === type && c.name === name)) { err.textContent = 'มีหมวดชื่อนี้แล้ว'; return; }
      const raw = f('budget').value.trim();
      const budget = type === 'out' && raw ? parseMoney(raw) : 0;
      if (!Number.isFinite(budget)) { err.textContent = 'งบต้องเป็นตัวเลข'; return; }
      close({ name, type, budget: round2(budget) });
    };
    panel.querySelector('[data-ok]').addEventListener('click', submit);
    f('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: 'เพิ่มหมวด' });
  if (!r) return;
  app.state = addCategory(app.state, r);
  app.save();
  app.render();
  toast(`เพิ่มหมวด "${r.name}" แล้ว`);
}

async function categoryMenu(app, id) {
  const c = catById(app.state, id);
  if (!c) return;
  const what = await pickOne({ title: c.name, options: [
    { value: 'rename', label: 'เปลี่ยนชื่อ' },
    { value: 'delete', label: 'ลบหมวดนี้' },
  ] });
  if (what === 'rename') {
    const v = await promptBox({ title: 'เปลี่ยนชื่อหมวด', label: 'ชื่อหมวด', value: c.name, validate: nameRule });
    if (v === undefined) return;
    app.commit((st) => { const x = catById(st, id); x.name = v.trim(); x.short = short(v.trim()); });
    return;
  }
  if (what !== 'delete') return;
  const others = app.state.categories.filter((x) => x.type === c.type && x.id !== id);
  if (!others.length) { toast(`ต้องมีหมวด${c.type === 'in' ? 'รายรับ' : 'รายจ่าย'}อย่างน้อย 1 หมวด`, 4000); return; }
  const r = deleteCategory(app.state, id);
  if (r.ok) {
    const ok = await confirmBox({ title: `ลบหมวด "${c.name}"?`, body: 'ยังไม่มีรายการใช้หมวดนี้', ok: 'ลบหมวด', danger: true });
    if (!ok) return;
    app.state = r.state;
  } else {
    const into = await pickOne({ title: `มี ${r.inUse} รายการใช้หมวด "${c.name}" ย้ายไปหมวดไหน`, options: others.map((x) => ({ value: x.id, label: x.name })) });
    if (!into) return;
    app.state = deleteCategory(app.state, id, into).state;
    toast(`ย้ายไป "${catById(app.state, into).name}" แล้ว`);
  }
  app.save();
  app.render();
}

async function addWalletFlow(app) {
  const r = await openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>เพิ่มกระเป๋าเงิน</h2>
      <label class="field">ชื่อ
        <input class="input" data-f="name" maxlength="30" autocomplete="off" placeholder="เช่น กระปุก, บัญชีพร้อมเพย์"></label>
      <label class="field">ยอดตอนนี้ (บาท)
        <input class="input mono" data-f="start" inputmode="decimal" autocomplete="off" value="0"></label>
      <p class="small warn" data-err role="alert"></p>
      <button class="btn md" data-ok>เพิ่ม</button>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const f = (k) => panel.querySelector(`[data-f="${k}"]`);
    const err = panel.querySelector('[data-err]');
    panel.querySelector('[data-ok]').addEventListener('click', () => {
      const name = f('name').value.trim();
      const bad = nameRule(name);
      if (bad) { err.textContent = bad; return; }
      const start = parseMoney(f('start').value || '0');
      if (!Number.isFinite(start)) { err.textContent = 'ยอดต้องเป็นตัวเลข'; return; }
      close({ name, start: round2(start) });
    });
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: 'เพิ่มกระเป๋าเงิน' });
  if (!r) return;
  app.commit((st) => { st.wallets.push({ id: uid('w'), name: r.name, start: r.start }); });
  toast(`เพิ่ม "${r.name}" แล้ว`);
}

async function walletMenu(app, id) {
  const s = app.state;
  const w = walletById(s, id);
  if (!w) return;
  const g = goalOf(s);
  const inGoal = (g?.walletIds || []).includes(id);
  const what = await pickOne({ title: w.name, options: [
    ...(g ? [{ value: 'goal', label: inGoal ? 'ไม่นับเป็นเงินเก็บเป้า' : 'นับเป็นเงินเก็บเป้า', sub: `ยอดในกระเป๋านี้${inGoal ? 'จะไม่' : 'จะ'}รวมเข้าเป้า "${g.name}"` }] : []),
    { value: 'rename', label: 'เปลี่ยนชื่อ' },
    { value: 'start', label: 'แก้ยอดเริ่มต้น', sub: `ยอดก่อนเริ่มจดในแอพ ตอนนี้ ฿${money(w.start)}` },
    { value: 'delete', label: 'ลบกระเป๋า' },
  ] });
  if (what === 'goal') {
    app.commit((st) => {
      const gg = goalOf(st);
      gg.walletIds = inGoal ? gg.walletIds.filter((x) => x !== id) : [...(gg.walletIds || []), id];
    });
    toast(inGoal ? `"${w.name}" ไม่นับเป็นเงินเก็บเป้าแล้ว` : `"${w.name}" นับเป็นเงินเก็บเป้าแล้ว`);
  } else if (what === 'rename') {
    const v = await promptBox({ title: 'เปลี่ยนชื่อกระเป๋า', label: 'ชื่อ', value: w.name, validate: nameRule });
    if (v !== undefined) app.commit((st) => { walletById(st, id).name = v.trim(); });
  } else if (what === 'start') {
    const v = await promptBox({
      title: 'ยอดเริ่มต้น', label: `ยอดใน "${w.name}" ก่อนเริ่มจดในแอพ (บาท)`, value: money(w.start), inputmode: 'decimal',
      hint: 'ยอดตอนนี้ = ยอดเริ่มต้น + รายรับ − รายจ่าย ± เงินที่โอน',
      validate: (t) => (Number.isFinite(parseMoney(t)) ? '' : 'ใส่เป็นตัวเลข'),
    });
    if (v !== undefined) app.commit((st) => { walletById(st, id).start = round2(parseMoney(v)); });
  } else if (what === 'delete') {
    if (s.wallets.length <= 1) { toast('ต้องมีกระเป๋าเงินอย่างน้อย 1 ใบ', 4000); return; }
    const r = deleteWallet(s, id);
    if (!r.ok) { toast('ลบไม่ได้ มีรายการหรือรายการประจำใช้กระเป๋านี้อยู่', 4000); return; }
    const ok = await confirmBox({
      title: `ลบ "${w.name}"?`, ok: 'ลบ', danger: true,
      body: w.start ? `ยอดเริ่มต้น ฿${money(w.start)} ของกระเป๋านี้จะหายจากยอดรวม` : 'ยังไม่มีรายการใช้กระเป๋านี้',
    });
    if (!ok) return;
    app.state = r.state;
    app.save();
    app.render();
    toast('ลบกระเป๋าแล้ว');
  }
}

export default {
  id: 'settings',
  title: 'ตั้งค่า',
  tab: null,
  /** มาจาก "ตั้งงบรายหมวด" บนหน้าหลัก (#/settings?focus=budgets): เลื่อนไปที่การ์ดงบ ครั้งเดียวต่อการเปิดหน้า */
  mount(app, view, route) {
    if (route.query.focus !== 'budgets' || app.local.focused) return;
    app.local.focused = true;
    // render() เลื่อนกลับบนสุดหลัง mount จึงต้องรอเฟรมถัดไป
    requestAnimationFrame(() => {
      const sec = view.querySelector('section[aria-label="หมวดและงบต่อเดือน"]');
      if (!sec) return;
      sec.scrollIntoView({ block: 'start' });
      const h = sec.querySelector('h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
  },
  render(app) {
    return html`<div class="screen tight">
      ${topbar('ตั้งค่า')}
      ${backupCard(app)}
      ${securityCard(app)}
      ${recurringCard(app)}
      ${categoriesCard(app)}
      ${walletsCard(app)}
      ${profileCard(app)}
      <section class="danger-zone" aria-label="ลบข้อมูลทั้งหมด">
        <h2 style="font-size:14px;font-weight:600;color:var(--orange)">ลบข้อมูลทั้งหมด</h2>
        <p class="small muted" style="line-height:1.6">ลบทุกอย่างในเครื่องนี้ ต้องพิมพ์คำว่า ลบ เพื่อยืนยัน ควรส่งออกไฟล์สำรองก่อน</p>
        <button class="btn danger" data-act="wipe" id="wipe">ลบข้อมูล</button>
      </section>
      <p class="label" style="text-align:center;color:var(--faint)">SEED v${VERSION}</p>
    </div>`;
  },
  actions: {
    export(app) {
      const file = `seed-backup-${app.today}.json`;
      downloadText(file, exportBackup(app.state));
      app.commit((s) => { s.settings.lastExport = app.today; });
      toast(`บันทึก ${file} แล้ว ดูในโฟลเดอร์ดาวน์โหลด`, 4000);
    },
    import(app) { importBackupFlow(app); },
    async toggleLock(app) {
      if (!app.state.settings.lock.enabled) {
        const r = await passcodePanel(app, { title: 'ตั้งรหัสผ่าน', needNew: true, ok: 'เปิดล็อก' });
        if (!r) return;
        app.commit((s) => { s.settings.lock = { ...s.settings.lock, ...r.record, enabled: true }; });
        toast('เปิดล็อกแล้ว');
      } else {
        const r = await passcodePanel(app, { title: 'ปิดล็อก', needCurrent: true, ok: 'ปิดล็อก' });
        if (!r) return;
        app.commit((s) => { s.settings.lock = { ...s.settings.lock, enabled: false, salt: null, hash: null }; });
        toast('ปิดล็อกแล้ว');
      }
    },
    async changePass(app) {
      const r = await passcodePanel(app, { title: 'เปลี่ยนรหัสผ่าน', needCurrent: true, needNew: true });
      if (!r) return;
      app.commit((s) => { s.settings.lock = { ...s.settings.lock, ...r.record, enabled: true }; });
      toast('เปลี่ยนรหัสผ่านแล้ว');
    },
    async autoLock(app) {
      const v = await pickOne({
        title: 'ล็อกเองเมื่อออกจากแอพเกิน', current: app.state.settings.lock.autoLockMin,
        options: AUTOLOCK_MIN.map((m) => ({ value: m, label: `${m} นาที` })),
      });
      if (v !== undefined) app.commit((s) => { s.settings.lock.autoLockMin = v; });
    },
    lockNow(app) {
      app.locked = true;
      app.render();
    },
    addRec(app) { editRecurring(app, null); },
    editRec(app, el) {
      const item = app.state.recurring.find((r) => r.id === el.dataset.id);
      if (item) editRecurring(app, item);
    },
    addCat(app) { addCategoryFlow(app); },
    catMenu(app, el) { categoryMenu(app, el.dataset.id); },
    addWallet(app) { addWalletFlow(app); },
    walletMenu(app, el) { walletMenu(app, el.dataset.id); },
    async name(app) {
      const v = await promptBox({
        title: 'ชื่อเล่น', label: 'ชื่อที่ให้แอพเรียก', value: app.state.settings.name,
        validate: (t) => (t.trim().length > 30 ? 'ยาวไม่เกิน 30 ตัวอักษร' : ''),
      });
      if (v !== undefined) app.commit((s) => { s.settings.name = v.trim(); });
    },
    async accountDate(app) {
      const v = await promptBox({
        title: 'วันเปิดบัญชีลงทุน', label: 'วันที่', type: 'date', value: app.state.settings.accountDate,
        hint: 'กำหนดของเป้าเงินก้อนแรกจะเลื่อนตามไปด้วย',
        validate: (t) => (/^\d{4}-\d{2}-\d{2}$/.test(t) ? '' : 'เลือกวันที่ก่อน'),
      });
      if (v === undefined) return;
      app.state = setAccountDate(app.state, v);
      app.save();
      app.render();
      toast(`เปลี่ยนเป็น ${thDate(v)} แล้ว`);
    },
    wipe() { confirmWipe(); },
  },
  changes: {
    budget(app, el) {
      const c = catById(app.state, el.dataset.id);
      if (!c) return;
      const raw = el.value.trim();
      const v = raw === '' ? 0 : parseMoney(raw);
      if (!Number.isFinite(v)) {
        toast('งบต้องเป็นตัวเลข');
        el.value = c.budget > 0 ? money(c.budget) : '';
        return;
      }
      // ไม่วาดใหม่ทั้งหน้า: โฟกัสจะได้ไปช่องถัดไปที่ผู้ใช้แตะได้ตามปกติ
      app.commit((s) => { catById(s, c.id).budget = round2(v); }, { render: false });
      el.value = v > 0 ? money(v) : '';
    },
  },
};
