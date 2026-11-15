// SEED — เปิดครั้งแรก 5 ขั้น (#/welcome)
import { html, icon, logo, int, parseMoney, promptBox, toast, bool } from '../ui.js';
import { daysLeft, needPerMonth, round2 } from '../calc.js';
import { setAccountDate, defaultAccountDate } from '../store.js';
import { validatePasscode, hashPasscode } from '../passcode.js';
import { importBackupFlow } from './common.js';

const GOAL_CHIPS = [10000, 30000, 50000];

function draft(app) {
  const ui = (app.ui.welcome ||= {});
  if (!ui.d) {
    const s = app.state;
    const goal = s.goals.find((g) => g.id === 'g1');
    ui.d = {
      step: 0,
      name: s.settings.name || '',
      accountDate: s.settings.accountDate || defaultAccountDate(app.today),
      target: String(goal?.target ?? 30000),
      wallets: s.wallets.map((w) => ({ id: w.id, name: w.name, start: w.start ? String(w.start) : '0', goal: (goal?.walletIds || []).includes(w.id) })),
    };
  }
  return ui.d;
}

const intro = (title, text) => html`<div>
  <h1 style="font-size:24px;font-weight:600;line-height:1.35">${title}</h1>
  <p class="sub" style="font-size:15px;line-height:1.6;margin-top:8px">${text}</p></div>`;

const needText = (d, app) => {
  const t = parseMoney(d.target);
  return Number.isFinite(t) ? '฿' + int(needPerMonth(t, 0, daysLeft(d.accountDate, app.today))) : '—';
};

const STEPS = [
  (app, d) => html`
    <span class="logo">${logo(34)}</span>
    <div><h1 style="font-size:26px;font-weight:600;line-height:1.35">ยินดีต้อนรับสู่ SEED</h1>
      <p class="sub" style="font-size:15px;line-height:1.6;margin-top:8px">ตั้งค่า 5 ข้อ ใช้เวลาไม่ถึง 1 นาที ข้อมูลทั้งหมดเก็บในเครื่องนี้เท่านั้น</p></div>
    ${app.status === 'corrupt' ? html`<div class="note warn">ข้อมูลเดิมในเครื่องเปิดไม่ได้ แอพเก็บสำเนาไว้แล้ว ถ้ามีไฟล์สำรองกด "นำเข้าข้อมูล" ด้านล่าง</div>` : ''}
    <label class="field">ชื่อเล่น
      <input id="ob-name" class="input" data-in="name" value="${d.name}" placeholder="ชื่อของคุณ" autocomplete="nickname" maxlength="30"></label>
    <button class="link-btn lg" data-act="import" style="align-self:flex-start">มีไฟล์สำรองอยู่แล้ว? นำเข้าข้อมูล</button>`,

  (app, d) => html`
    ${intro('วันที่จะเปิดบัญชีลงทุน', 'ใช้นับถอยหลัง และคำนวณว่าต้องเก็บเดือนละเท่าไหร่ แก้ทีหลังได้')}
    <label class="field">วันที่
      <input id="ob-date" class="input" type="date" data-change="date" value="${d.accountDate}" min="${app.today}"></label>
    <div class="note info" style="font-size:14px">อีก <b class="mono">${int(daysLeft(d.accountDate, app.today))}</b> วัน</div>`,

  (app, d) => html`
    ${intro('อยากมีเงินก้อนแรกเท่าไหร่', 'เงินที่ตั้งใจเอาไปลงทุนในวันเปิดบัญชี')}
    <div class="amount-line"><span class="cur">฿</span>
      <input id="ob-target" data-in="target" data-change="targetFmt" inputmode="decimal" autocomplete="off" value="${Number.isFinite(parseMoney(d.target)) ? int(parseMoney(d.target)) : d.target}" aria-label="เป้าเงินก้อนแรก (บาท)"></div>
    <div class="grid3">${GOAL_CHIPS.map((v) => html`
      <button class="chip mono" data-act="target" data-v="${v}" aria-pressed="${bool(parseMoney(d.target) === v)}">${int(v)}</button>`)}</div>
    <div class="sub">ต้องเก็บประมาณเดือนละ <b class="mono" style="color:var(--text)" data-live="need">${needText(d, app)}</b></div>`,

  (app, d) => html`
    ${intro('ตอนนี้มีเงินอยู่ที่ไหนบ้าง', 'ใส่ยอดตอนนี้ แล้วเลือกว่าอันไหนเป็นเงินเก็บสำหรับเป้า')}
    <div class="card list" style="border-radius:18px;padding:6px 16px">
      ${d.wallets.map((w, i) => html`<div class="li tall">
        <button class="grow plain-btn" data-act="wgoal" data-i="${i}" id="ob-wg${i}" aria-pressed="${bool(w.goal)}">
          <span style="font-size:15px">${w.name}</span>
          ${w.goal ? html`<span class="pill">เงินเก็บเป้า</span>` : html`<span class="pill ghost-pill">+ เงินเก็บเป้า</span>`}
        </button>
        <input id="ob-w${i}" class="input sm" data-in="wstart" data-i="${i}" inputmode="decimal" autocomplete="off" value="${w.start}" aria-label="ยอด${w.name} (บาท)">
      </div>`)}
    </div>
    <button class="link-btn lg" data-act="addWallet" style="align-self:flex-start">+ เพิ่มกระเป๋าเงิน</button>
    <p class="small muted">แตะชื่อกระเป๋าเพื่อเลือกว่านับเป็น "เงินเก็บเป้า" หรือไม่</p>`,

  () => html`
    ${intro('ตั้งรหัสผ่าน', 'ใช้ตัวอักษรภาษาอังกฤษหรือตัวเลขก็ได้ อย่างน้อย 4 ตัว กันคนอื่นเปิดดูยอดเงิน ไม่บังคับ')}
    <label class="field">รหัสผ่าน
      <input id="ob-p1" class="input mono" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="••••••"></label>
    <label class="field">พิมพ์อีกครั้ง
      <input id="ob-p2" class="input mono" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" placeholder="••••••"></label>
    <p class="small warn" data-live="perr" role="alert"></p>
    <div class="note warn" style="font-size:12px">ถ้าลืมรหัส จะกู้คืนได้จากไฟล์สำรองเท่านั้น</div>
    <p class="small muted" style="line-height:1.6">หน้าล็อกกันคนอื่นเปิดดู แต่ข้อมูลในเครื่องยังไม่ได้เข้ารหัส</p>`,
];

async function finish(app, withPass) {
  const d = draft(app);
  let record = null;
  if (withPass) {
    const p1 = document.getElementById('ob-p1').value;
    const p2 = document.getElementById('ob-p2').value;
    const errEl = document.querySelector('[data-live="perr"]');
    if (p1 || p2) {
      const rule = validatePasscode(p1);
      const msg = rule || (p1 !== p2 ? 'พิมพ์สองครั้งไม่ตรงกัน' : '');
      if (msg) { errEl.textContent = msg; return; }
      record = await hashPasscode(p1);
    }
  }
  let s = setAccountDate(app.state, d.accountDate);
  s.settings.name = d.name.trim();
  s.settings.createdAt = app.today;
  s.wallets = d.wallets.map((w) => ({ id: w.id, name: w.name, start: round2(parseMoney(w.start) || 0) }));
  const g1 = s.goals.find((g) => g.id === 'g1');
  g1.target = parseMoney(d.target);
  g1.walletIds = d.wallets.filter((w) => w.goal).map((w) => w.id);
  if (record) s.settings.lock = { ...s.settings.lock, enabled: true, ...record };
  s.settings.onboarded = true;
  app.state = s;
  app.locked = false;
  app.save();
  delete app.ui.welcome;
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  toast(record ? 'ตั้งค่าเสร็จแล้ว ตั้งรหัสผ่านแล้ว' : 'ตั้งค่าเสร็จแล้ว');
  app.go('home');
}

function validStep(app, d) {
  if (d.step === 1 && !/^\d{4}-\d{2}-\d{2}$/.test(d.accountDate)) return 'เลือกวันที่ก่อน';
  if (d.step === 2) {
    const t = parseMoney(d.target);
    if (!Number.isFinite(t) || t <= 0) return 'ใส่เป้าเป็นตัวเลขมากกว่า 0';
  }
  if (d.step === 3) {
    const bad = d.wallets.find((w) => !Number.isFinite(parseMoney(w.start || '0')));
    if (bad) return `ยอด${bad.name}ต้องเป็นตัวเลข`;
  }
  return '';
}

export default {
  id: 'welcome',
  title: 'เริ่มต้น',
  tab: null,
  render(app) {
    const d = draft(app);
    const s = d.step;
    return html`<div class="screen" style="padding:20px 20px 24px;min-height:100dvh;gap:22px">
      <div class="row" style="min-height:44px">
        ${s > 0 ? html`<button class="icon-btn filled" data-act="back" aria-label="ย้อนกลับ">${icon('back', 18, 2)}</button>` : ''}
        <div class="steps" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => html`<span class="${i <= s ? 'on' : ''}"></span>`)}</div>
        <span class="mono small muted" aria-label="ขั้นที่ ${s + 1} จาก 5">${s + 1}/5</span>
      </div>
      <div class="grow stack" style="justify-content:center;gap:22px">${STEPS[s](app, d)}</div>
      <div class="stack">
        ${s < 4 ? html`<button class="btn" data-act="next">ต่อไป</button>` : html`
          <button class="btn" data-act="finish">เริ่มใช้งาน</button>
          <button class="btn ghost" data-act="skip">ข้าม ไม่ตั้งรหัส</button>`}
      </div>
    </div>`;
  },
  actions: {
    back(app) { draft(app).step -= 1; app.render(); },
    next(app) {
      const d = draft(app);
      const msg = validStep(app, d);
      if (msg) { toast(msg); return; }
      d.step += 1;
      app.render();
    },
    target(app, el) { draft(app).target = el.dataset.v; app.render(); },
    wgoal(app, el) { const w = draft(app).wallets[Number(el.dataset.i)]; w.goal = !w.goal; app.render(); },
    async addWallet(app) {
      const name = await promptBox({ title: 'เพิ่มกระเป๋าเงิน', label: 'ชื่อ เช่น กระปุก, บัญชีพร้อมเพย์', ok: 'เพิ่ม',
        validate: (v) => (v.trim() ? '' : 'ใส่ชื่อก่อน') });
      if (name === undefined) return;
      draft(app).wallets.push({ id: 'w_' + crypto.randomUUID().slice(0, 8), name: name.trim(), start: '0', goal: false });
      app.render();
    },
    import(app) { importBackupFlow(app); },
    finish(app) { finish(app, true); },
    skip(app) { finish(app, false); },
  },
  inputs: {
    name(app, el) { draft(app).name = el.value; },
    target(app, el) {
      const d = draft(app);
      d.target = el.value;
      const live = document.querySelector('[data-live="need"]');
      if (live) live.textContent = needText(d, app);
    },
    wstart(app, el) { draft(app).wallets[Number(el.dataset.i)].start = el.value; },
  },
  changes: {
    date(app, el) { if (el.value) { draft(app).accountDate = el.value; app.render(); } },
    targetFmt(app, el) {
      const t = parseMoney(el.value);
      if (Number.isFinite(t)) { draft(app).target = String(t); app.render(); }
    },
  },
};
