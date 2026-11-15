// SEED — ส่วนที่หลายหน้าใช้ร่วมกัน
import { html, icon, toast, confirmBox, pickTextFile, thDate, openPanel, toHTML, esc } from '../ui.js';
import { parseBackup, restoreBackup, KEY } from '../store.js';
import { todayISO } from '../calc.js';
import { validatePasscode, hashPasscode, verifyPasscode } from '../passcode.js';

/** หัวหน้าย่อย: ปุ่มย้อนกลับ + ชื่อหน้า */
export const topbar = (title, fallback = 'home', extra = '') => html`
  <header class="topbar">
    <button class="icon-btn" data-act="nav-back" data-fallback="${fallback}" aria-label="ย้อนกลับ">${icon('back', 20, 2)}</button>
    <h1>${title}</h1>${extra}
  </header>`;

/** หัวหน้าแบบอ่านบทความ: ปุ่มย้อนกลับ + ป้ายเล็ก (h1 อยู่บรรทัดถัดไป เป็นชื่อเรื่อง) */
export const backbar = (label, fallback = 'home') => html`
  <header class="topbar">
    <button class="icon-btn" data-act="nav-back" data-fallback="${fallback}" aria-label="ย้อนกลับ">${icon('back', 20, 2)}</button>
    <span class="label grow" style="font-size:12px">${label}</span>
  </header>`;

/** นำเข้าไฟล์สำรอง (ใช้ทั้งหน้าเปิดครั้งแรกและตั้งค่า) */
export async function importBackupFlow(app) {
  const text = await pickTextFile();
  if (text == null) return false;
  const r = parseBackup(text, app.today);
  if (!r.ok) {
    await confirmBox({ title: 'นำเข้าไม่ได้', body: r.error, ok: 'ตกลง', cancel: 'ปิด' });
    return false;
  }
  const when = r.exportedAt ? thDate(todayISO(new Date(r.exportedAt))) : 'ไม่ทราบวันที่';
  const ok = await confirmBox({
    title: 'แทนที่ข้อมูลในเครื่องนี้?',
    body: `ไฟล์สำรองวันที่ ${when} มี ${r.data.transactions.length} รายการ ข้อมูลที่อยู่ในเครื่องตอนนี้จะถูกแทนที่ทั้งหมด`,
    ok: 'นำเข้าและแทนที่', danger: true,
  });
  if (!ok) return false;
  app.state = restoreBackup(app.state, r.data);
  app.save();
  app.runRecurringNow();
  toast('นำเข้าข้อมูลแล้ว');
  app.go('home');
  return true;
}

/** ลบทุกอย่างของ SEED ในเครื่องนี้ แล้วเริ่มใหม่ */
export function wipeAllData() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (k === KEY || k.startsWith('seed.'))) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
  location.replace(location.pathname + '#/home');
  location.reload();
}

export async function confirmWipe() {
  const ok = await confirmBox({
    title: 'ลบข้อมูลทั้งหมด?',
    body: 'ลบทุกอย่างของ SEED ในเครื่องนี้ (รายการ กระเป๋า เป้า รหัสผ่าน) กู้คืนได้จากไฟล์สำรองเท่านั้น',
    ok: 'ลบข้อมูลทั้งหมด', danger: true, requireText: 'ลบ',
  });
  if (ok) wipeAllData();
}

/**
 * แผงกรอกรหัส: needCurrent = ต้องใส่รหัสเดิม, needNew = ตั้งรหัสใหม่ (พิมพ์ 2 ครั้ง)
 * คืน { current?, record? } หรือ undefined ถ้ายกเลิก — ตัวรหัสไม่ถูกเก็บที่ไหน
 */
export function passcodePanel(app, { title, needCurrent = false, needNew = false, ok = 'บันทึก' }) {
  const lock = app.state.settings.lock;
  return openPanel((panel, close) => {
    const field = (id, label, auto) => html`<label class="field">${label}
      <input id="${id}" class="input mono" type="password" autocomplete="${auto}" autocapitalize="off" spellcheck="false" placeholder="••••••"></label>`;
    panel.innerHTML = toHTML(html`
      <h2>${title}</h2>
      ${needCurrent ? field('pp-cur', 'รหัสเดิม', 'current-password') : ''}
      ${needNew ? html`${field('pp-new', 'รหัสใหม่ (ภาษาอังกฤษหรือตัวเลข อย่างน้อย 4 ตัว)', 'new-password')}${field('pp-rep', 'พิมพ์อีกครั้ง', 'new-password')}
        <div class="note warn" style="font-size:12px">ถ้าลืมรหัส จะกู้คืนได้จากไฟล์สำรองเท่านั้น</div>` : ''}
      <p class="small warn" data-err role="alert"></p>
      <button class="btn md" data-ok>${ok}</button>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const $ = (id) => panel.querySelector('#' + id);
    const err = panel.querySelector('[data-err]');
    const okBtn = panel.querySelector('[data-ok]');
    const fail = (msg) => { err.textContent = msg; okBtn.disabled = false; okBtn.textContent = ok; };
    const submit = async () => {
      okBtn.disabled = true;
      okBtn.textContent = 'กำลังตรวจ…';
      if (needCurrent && !(await verifyPasscode($('pp-cur').value, lock))) return fail('รหัสเดิมไม่ถูก');
      let record;
      if (needNew) {
        const a = $('pp-new').value;
        const rule = validatePasscode(a);
        if (rule) return fail(rule);
        if (a !== $('pp-rep').value) return fail('พิมพ์สองครั้งไม่ตรงกัน');
        record = await hashPasscode(a);
      }
      close({ ok: true, record });
    };
    okBtn.addEventListener('click', submit);
    panel.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); }));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: title });
}

export { esc };
