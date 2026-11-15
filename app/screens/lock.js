// SEED — หน้าล็อก (แสดงเมื่อเปิดแอพ และเมื่อกลับมาหลังออกไปเกินเวลาที่ตั้ง)
import { html, icon, logo, toHTML, openPanel } from '../ui.js';
import { verifyPasscode, registerFail, lockedFor } from '../passcode.js';
import { confirmWipe } from './common.js';

const LOCKOUT_KEY = 'seed.lockout';
const readLockout = () => {
  try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY)) || { fails: 0, until: 0 }; } catch { return { fails: 0, until: 0 }; }
};
const writeLockout = (s) => { try { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(s)); } catch { /* ไม่เป็นไร */ } };

let timer = null;

async function unlock(app) {
  const input = document.getElementById('lock-pass');
  const btn = document.querySelector('[data-act="unlock"]');
  // ปุ่มถูกปิดระหว่างตรวจ และตอนรอหลังใส่ผิดหลายครั้ง → กด Enter ซ้ำไม่ตรวจซ้อน
  if (!input || !btn || btn.disabled || lockedFor(readLockout(), Date.now())) return;
  const ui = (app.ui.lock ||= {});
  btn.disabled = true;
  btn.textContent = 'กำลังตรวจ…';
  const ok = await verifyPasscode(input.value, app.state.settings.lock);
  if (ok) {
    writeLockout({ fails: 0, until: 0 });
    delete app.ui.lock;
    app.locked = false;
    app.runRecurringNow();
    app.render();
    return;
  }
  writeLockout(registerFail(readLockout(), Date.now()));
  ui.wrong = true;
  app.render();
  document.getElementById('lock-pass')?.focus();
}

export default {
  id: 'lock',
  title: 'ล็อกอยู่',
  tab: null,
  render(app) {
    const ui = (app.ui.lock ||= {});
    const wait = lockedFor(readLockout(), Date.now());
    return html`<div class="screen" style="padding:24px 24px 32px;min-height:100dvh">
      <div class="grow stack" style="justify-content:center;gap:28px">
        <div class="stack" style="align-items:center;gap:14px;text-align:center">
          <span class="logo lg">${logo(36)}</span>
          <h1 style="font-size:22px;font-weight:600">ใส่รหัสผ่าน</h1>
          <p class="sub" style="font-size:14px">SEED ล็อกอยู่</p>
        </div>
        <div class="stack">
          <div class="pass-wrap ${ui.wrong ? 'bad' : ''}">
            <input id="lock-pass" type="password" aria-label="รหัสผ่าน" autocomplete="current-password" autocapitalize="off" spellcheck="false" placeholder="รหัสผ่าน" ${wait ? 'disabled' : ''}>
            <button class="icon-btn" data-act="show" aria-label="แสดงรหัส">${icon('eye', 20)}</button>
          </div>
          ${wait ? html`<div role="alert" class="warn" style="font-size:13px">ใส่ผิดหลายครั้ง รออีก <span class="mono" data-live="wait">${wait}</span> วินาที</div>`
            : ui.wrong ? html`<div role="alert" class="warn" style="font-size:13px">รหัสไม่ถูก ลองอีกครั้ง</div>` : ''}
          <button class="btn" data-act="unlock" ${wait ? 'disabled' : ''}>ปลดล็อก</button>
        </div>
      </div>
      <div class="stack" style="align-items:center;gap:6px;text-align:center">
        <button class="link-btn lg" data-act="forgot" style="font-size:14px">ลืมรหัส?</button>
        <span class="small muted">ล็อกเองเมื่อออกจากแอพเกิน ${app.state.settings.lock.autoLockMin} นาที</span>
      </div>
    </div>`;
  },
  mount(app) {
    clearInterval(timer);
    const input = document.getElementById('lock-pass');
    if (input) {
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlock(app); });
      if (!input.disabled) input.focus({ preventScroll: true });
    }
    if (lockedFor(readLockout(), Date.now())) {
      timer = setInterval(() => {
        const left = lockedFor(readLockout(), Date.now());
        const el = document.querySelector('[data-live="wait"]');
        if (!left || !el) { clearInterval(timer); if (app.locked) app.render(); return; }
        el.textContent = left;
      }, 500);
    }
  },
  actions: {
    unlock(app) { unlock(app); },
    show(app, el) {
      const input = document.getElementById('lock-pass');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      el.setAttribute('aria-label', showing ? 'แสดงรหัส' : 'ซ่อนรหัส');
      el.innerHTML = toHTML(icon(showing ? 'eye' : 'eyeOff', 20));
      input.focus();
    },
    async forgot() {
      const go = await openPanel((panel, close) => {
        panel.innerHTML = toHTML(html`
          <h2>ลืมรหัส?</h2>
          <p class="sub" style="line-height:1.7">รหัสผ่านเก็บแบบที่ย้อนกลับไม่ได้ จึงไม่มีใครดูรหัสเดิมได้ วิธีเดียวที่จะกลับเข้าแอพคือ
            <b style="color:var(--text)">ลบข้อมูลทั้งหมด</b> ในเครื่องนี้ แล้ว <b style="color:var(--text)">นำเข้าไฟล์สำรอง</b> ที่เคยส่งออกไว้</p>
          <p class="sub" style="line-height:1.7">ไฟล์สำรองไม่มีรหัสผ่านติดไปด้วย นำเข้าแล้วค่อยตั้งรหัสใหม่ในหน้าตั้งค่า</p>
          <button class="btn md" data-ok style="background:var(--orange)">ไปขั้นตอนลบข้อมูล</button>
          <button class="btn ghost" data-cancel>ยกเลิก</button>`);
        panel.querySelector('[data-ok]').addEventListener('click', () => close(true));
        panel.querySelector('[data-cancel]').addEventListener('click', () => close(false));
      }, { label: 'ลืมรหัส' });
      if (go) confirmWipe();
    },
  },
};
