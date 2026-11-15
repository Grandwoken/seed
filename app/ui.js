// SEED — ตัวช่วยหน้าจอ: template ที่ escape เอง, ไอคอน, รูปแบบตัวเลข/วันที่, toast, กล่องยืนยัน
import { addDays } from './calc.js';

// ---------- html template ----------
const RAW = Symbol('raw');
export const raw = (s) => ({ [RAW]: true, s: String(s) });
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const str = (v) => {
  if (v == null || v === false) return '';
  if (Array.isArray(v)) return v.map(str).join('');
  if (v[RAW]) return v.s;
  return esc(v);
};
/** html`...${x}...` — ค่าที่แทรกถูก escape ทั้งหมด ยกเว้นที่มาจาก html`` / raw() */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += str(vals[i]) + strings[i + 1];
  return raw(out);
}
export const toHTML = (tpl) => str(tpl);

// ---------- ตัวเลข ----------
/** จัดรูปแบบค่าสัมบูรณ์ แล้วใส่ "−" (เครื่องหมายลบจริง) ถ้าติดลบและไม่ใช่ศูนย์หลังปัด */
const fmt = (n, opts) => {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-US', opts);
  return v < 0 && /[1-9]/.test(s) ? '−' + s : s;
};
export const int = (n) => fmt(Math.round(Number(n) || 0), { maximumFractionDigits: 0 });
export const money = (n) => fmt(n, { maximumFractionDigits: 2 });
export const money2 = (n) => fmt(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const baht = (n) => {
  const s = int(n);
  return s.startsWith('−') ? '−฿' + s.slice(1) : '฿' + s;
};
/** รายจ่าย "−65" (สีตัวอักษรปกติ) รายรับ "+4,500" (สีเขียว) */
export const signed = (n, type) => (type === 'in' ? '+' : '−') + money(n);
export const pct = (x) => {
  const v = Math.round((Number(x) || 0) * 100);
  return (v < 0 ? '−' : '') + Math.abs(v) + '%';
};
/** ค่า aria-pressed / aria-checked ("true"/"false") — html`` แสดง false เป็นค่าว่าง จึงต้องแปลงก่อน */
export const bool = (b) => (b ? 'true' : 'false');
/** แปลงข้อความเป็นเงิน (รับ "1,250.5") ไม่ได้ → NaN */
export function parseMoney(text) {
  const s = String(text ?? '').replace(/[,\s฿]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(s) || s === '' || s === '.') return NaN;
  return Number(s);
}

// ---------- แป้นตัวเลข (หน้าจดรายการ) ----------
/** กดปุ่มบนแป้น: ตัวเลข, '.', 'del' — ทศนิยมไม่เกิน 2 ตำแหน่ง จำนวนเต็มไม่เกิน 9 หลัก */
export function keypadPress(cur, key) {
  const s = cur || '0';
  if (key === 'del') return s.length > 1 ? s.slice(0, -1) : '0';
  if (key === '.') return s.includes('.') ? s : s + '.';
  if (!/^\d$/.test(key)) return s;
  const [whole, dec] = s.split('.');
  if (dec !== undefined) return dec.length >= 2 ? s : s + key;
  if (whole === '0') return key;
  return whole.length >= 9 ? s : s + key;
}
/** จำนวนที่กำลังพิมพ์: ใส่จุลภาคหลักพัน แต่เก็บจุดทศนิยมที่พิมพ์ค้างไว้ */
export function amountDisplay(s) {
  const [whole, dec] = String(s || '0').split('.');
  const w = Number(whole || 0).toLocaleString('en-US');
  return dec === undefined ? w : `${w}.${dec}`;
}

// ---------- วันที่ภาษาไทย ----------
export const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const mIdx = (iso) => Number(iso.slice(5, 7)) - 1;
const be = (iso) => Number(iso.slice(0, 4)) + 543;
/** "14 พ.ย." */
export const thDay = (iso) => `${Number(iso.slice(8, 10))} ${TH_MONTHS[mIdx(iso)]}`;
/** "14 พ.ย. 2569" */
export const thDate = (iso) => `${thDay(iso)} ${be(iso)}`;
/** "พ.ย. 2569" จาก YYYY-MM */
export const thMonth = (ym) => `${TH_MONTHS[mIdx(ym)]} ${be(ym)}`;
/** "พ.ย. 69" */
export const thMonthShort = (ym) => `${TH_MONTHS[mIdx(ym)]} ${String(be(ym)).slice(2)}`;
/** ช่วง 7 วันที่สรุปข่าวครอบคลุม: "8–14 พ.ย. 2569" / "28 ต.ค.–3 พ.ย. 2569" / "29 ธ.ค. 2569–4 ม.ค. 2570" */
export function weekRange(iso) {
  const from = addDays(iso, -6);
  if (from.slice(0, 4) !== iso.slice(0, 4)) return `${thDate(from)}–${thDate(iso)}`;
  if (from.slice(5, 7) !== iso.slice(5, 7)) return `${thDay(from)}–${thDate(iso)}`;
  return `${Number(from.slice(8, 10))}–${thDate(iso)}`;
}
/** ป้ายวันที่สั้น: "วันนี้" / "เมื่อวาน" / "1 พ.ย." */
export function dayLabel(iso, today) {
  if (iso === today) return 'วันนี้';
  if (iso === addDays(today, -1)) return 'เมื่อวาน';
  return thDay(iso);
}

// ---------- ไอคอน (เส้น 1.8) ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  money: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  plan: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  learn: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/>',
  news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  goal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  sim: '<path d="M3 20h18"/><path d="m4 16 5-5 4 3 7-8"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 21h16"/>',
  upload: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M4 21h16"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4 3-7 8-7 0 5-3 7-8 7z"/><path d="M12 14c0-3-2-5-7-5 0 4 2 5 7 5z"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M16 14.5h2"/>',
  note: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  swap: '<path d="M7 4 4 7l3 3"/><path d="M4 7h16"/><path d="m17 20 3-3-3-3"/><path d="M20 17H4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="m7 22-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><path d="M12 17.5h.01"/>',
  fx: '<path d="M12 3v18"/><path d="M16 7.5c-.8-1.5-2.3-2.5-4-2.5-2.2 0-4 1.3-4 3.2 0 4.3 8 2.8 8 7 0 1.9-1.8 3.3-4 3.3-1.8 0-3.4-1-4.2-2.5"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/>',
  down: '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
  steps: '<path d="M5 20V14M10 20v-9M15 20v-6M20 20V8"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  drop: '<path d="M3 4h18"/><path d="m4 8 5 5 4-3 7 8"/>',
  swapV: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
};
/** ไอคอนเส้น ขนาด size px */
export function icon(name, size = 22, sw = 1.8) {
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`);
}
export const logo = (size = 34) => raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#7C9CFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P.sprout}</svg>`);

// ---------- สีหมวด (พื้นอ่อน + ตัวอักษร) ----------
const SOFT = {
  '#7C9CFF': ['#1F2A4D', '#A9BCFF'],
  '#FF9F6B': ['#2A1C12', '#FF9F6B'],
  '#4CC9C0': ['#13302D', '#7FE0D8'],
  '#C3A6FF': ['#2B2240', '#D3BEFF'],
  '#3DDC97': ['#10301F', '#3DDC97'],
  '#9AA1AC': ['#262A31', '#C5CAD3'],
};
export const soft = (color) => SOFT[String(color).toUpperCase()] || SOFT['#9AA1AC'];

// ---------- toast ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- กล่องยืนยัน / แผ่นเลือก ----------
/**
 * เปิดแผ่นจากด้านล่าง; build(panel, close) ใส่เนื้อหาเอง
 * คืน Promise ที่ resolve ด้วยค่าที่ส่งให้ close(value)
 */
export function openPanel(build, { label = '' } = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-label="${esc(label)}"></div>`;
    const panel = ov.firstChild;
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      ov.remove();
      if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(undefined); };
    ov.addEventListener('click', (e) => { if (e.target === ov) close(undefined); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    build(panel, close);
    const first = panel.querySelector('input, textarea, select, button');
    if (first) first.focus({ preventScroll: true });
  });
}

/** ยืนยันการกระทำ; requireText = คำที่ต้องพิมพ์ให้ตรง (เช่น "ลบ") */
export function confirmBox({ title, body = '', ok = 'ยืนยัน', cancel = 'ยกเลิก', danger = false, requireText = '' }) {
  return openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>${title}</h2>
      ${body ? html`<p class="sub" style="line-height:1.6">${body}</p>` : ''}
      ${requireText ? html`<label class="field">พิมพ์คำว่า <b style="color:var(--text)">${requireText}</b> เพื่อยืนยัน
        <input class="input" data-req autocomplete="off" autocapitalize="off" spellcheck="false"></label>` : ''}
      <button class="btn md" data-ok style="${danger ? 'background:var(--orange)' : ''}" ${requireText ? 'disabled' : ''}>${ok}</button>
      <button class="btn ghost" data-cancel>${cancel}</button>`);
    const okBtn = panel.querySelector('[data-ok]');
    const req = panel.querySelector('[data-req]');
    if (req) req.addEventListener('input', () => { okBtn.disabled = req.value.trim() !== requireText; });
    okBtn.addEventListener('click', () => close(true));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(false));
  }, { label: title }).then((v) => v === true);
}

/** ให้เลือก 1 ตัวเลือก: options = [{value, label, sub?}] */
export function pickOne({ title, options, current }) {
  return openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>${title}</h2>
      <div class="stack s4">${options.map((o, i) => html`
        <button class="chip" style="justify-content:space-between;min-height:52px;text-align:left" data-i="${i}" aria-pressed="${bool(o.value === current)}">
          <span>${o.label}${o.sub ? html`<span class="sub" style="display:block;font-size:12px">${o.sub}</span>` : ''}</span>
          ${o.value === current ? icon('check', 18) : ''}
        </button>`)}
      </div>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    panel.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => close(options[Number(b.dataset.i)].value)));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: title });
}

/** กรอกข้อความ/ตัวเลข 1 ช่อง */
export function promptBox({ title, label = '', value = '', type = 'text', inputmode = '', ok = 'บันทึก', hint = '', validate }) {
  return openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>${title}</h2>
      <label class="field">${label}
        <input class="input ${inputmode === 'decimal' ? 'mono' : ''}" type="${type}" value="${value}" ${inputmode ? raw(`inputmode="${esc(inputmode)}"`) : ''} autocomplete="off" data-v>
      </label>
      ${hint ? html`<p class="sub">${hint}</p>` : ''}
      <p class="small warn" data-err hidden></p>
      <button class="btn md" data-ok>${ok}</button>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const input = panel.querySelector('[data-v]');
    const err = panel.querySelector('[data-err]');
    const submit = () => {
      const msg = validate ? validate(input.value) : '';
      if (msg) { err.textContent = msg; err.hidden = false; input.classList.add('bad'); return; }
      close(input.value);
    };
    panel.querySelector('[data-ok]').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
    setTimeout(() => input.select(), 0);
  }, { label: title });
}

/** ดาวน์โหลดข้อความเป็นไฟล์ */
export function downloadText(filename, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** ให้เลือกไฟล์แล้วอ่านเป็นข้อความ */
export function pickTextFile(accept = 'application/json,.json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      resolve(f ? await f.text() : null);
    });
    input.click();
  });
}
