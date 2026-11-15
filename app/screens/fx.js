// SEED — ค่าเงิน (#/fx): เรท USD/THB + กราฟ, แปลงเงิน, เป้าเป็นดอลลาร์
// เรทอ้างอิงจาก Frankfurter (ธนาคารกลางยุโรป) — ดึงใน app.js แคชไว้ใน seed.fx
import { html, icon, int, money2, baht, thDay, thDate, bool, parseMoney } from '../ui.js';
import { fxChange, thbToUsd, usdToThb, goalStats } from '../calc.js';
import { fxRange, fxTrend, FX_RANGES } from '../fx.js';
import { fxLine } from '../charts.js';
import { topbar } from './common.js';

const DEFAULT_AMT = '1000';
const usd = (n) => (n < 0 ? '−$' : '$') + int(Math.abs(n));
/** วันที่บนกราฟ: ช่วง 1 ปีใส่ปี พ.ศ. 2 หลักด้วย (ไม่งั้นต้นกับปลายเป็นเดือนเดียวกัน) */
const dayLabel = (iso, withYear) => (withYear ? `${thDay(iso)} ${String(Number(iso.slice(0, 4)) + 543).slice(2)}` : thDay(iso));

/** แปลงเงินตามทิศที่เลือก; ช่องว่าง = 0, พิมพ์ผิด = null */
function convert(amtText, dir, rate) {
  if (String(amtText ?? '').trim() === '') return 0;
  const n = parseMoney(amtText);
  if (Number.isNaN(n)) return null;
  return dir === 'usd' ? usdToThb(n, rate) : thbToUsd(n, rate);
}
const outText = (v) => (v === null ? '—' : money2(v));

function rateSection(app, fx, status) {
  const range = app.local.range || '30d';
  const rangeLabel = FX_RANGES.find(([k]) => k === range)[1];
  const pts = fxRange(fx, range);
  const values = pts.map((p) => p.rate);
  const t = pts.length >= 2 ? fxTrend(fxChange(pts)) : null;
  // ดอลลาร์แพงขึ้น (▲) = แลกได้น้อยลง → สีส้ม, ถูกลง (▼) → สีเขียว
  const chip = !t ? ''
    : t.dir === 'up' ? html`<span class="delta down" id="fx-change">▲ ${t.pct} ${rangeLabel}</span>`
      : t.dir === 'down' ? html`<span class="delta" id="fx-change">▼ ${t.pct} ${rangeLabel}</span>`
        : html`<span class="delta flat" id="fx-change">เท่าเดิม ${rangeLabel}</span>`;
  const withYear = range === '1y';
  const from = dayLabel(pts[0].date, withYear);
  const to = dayLabel(fx.date, withYear);
  const label = pts.length >= 2
    ? `กราฟค่าเงินดอลลาร์เทียบบาท ${rangeLabel}: ${from} ${values[0].toFixed(2)} ถึง ${to} ${fx.rate.toFixed(2)} สูงสุด ${Math.max(...values).toFixed(2)} ต่ำสุด ${Math.min(...values).toFixed(2)}`
    : `เรท ${to} ${fx.rate.toFixed(2)} ยังไม่มีเรทย้อนหลังในช่วงนี้`;
  return html`<section aria-label="อัตราแลกเปลี่ยน" class="stack" style="gap:6px">
    <div class="label" style="font-size:12px">USD / THB</div>
    <div class="row" style="gap:10px;flex-wrap:wrap"><span class="big-num" id="fx-rate">${fx.rate.toFixed(2)}</span>${chip}</div>
    <div class="sub" id="fx-line">1 ดอลลาร์ = <span class="mono">${fx.rate.toFixed(2)}</span> บาท · <span class="nowrap">เรทวันที่ ${thDate(fx.date)}</span></div>
    ${status === 'offline' ? html`<div class="small muted row" id="fx-offline" style="gap:6px"><span class="dot" style="width:8px;height:8px;border-radius:99px;background:var(--faint)" aria-hidden="true"></span>ออฟไลน์ · ใช้เรทล่าสุดที่เก็บไว้</div>` : ''}
    <div style="margin-top:8px">${fxLine({ values, label, fromLabel: from, toLabel: to })}</div>
    <div class="seg" role="group" aria-label="ช่วงเวลาของกราฟ">
      ${FX_RANGES.map(([k, l]) => html`<button data-act="range" data-r="${k}" id="fx-range-${k}" aria-pressed="${bool(k === range)}">${l}</button>`)}
    </div>
  </section>`;
}

function converter(app, fx) {
  const dir = app.local.dir || 'thb'; // thb = ใส่บาท ได้ดอลลาร์
  const amt = app.local.amt ?? DEFAULT_AMT;
  const [from, to] = dir === 'usd' ? ['USD', 'THB'] : ['THB', 'USD'];
  return html`<section class="card" aria-label="แปลงเงิน" style="gap:10px">
    <h2 class="h-title">แปลงเงิน</h2>
    <label class="conv-row">
      <span class="cur">${from}</span>
      <input id="conv-amt" type="text" inputmode="decimal" autocomplete="off" maxlength="14" value="${amt}" data-in="amt"
        aria-label="จำนวนเงิน ${from === 'THB' ? 'บาท' : 'ดอลลาร์'}">
    </label>
    <button class="conv-swap" data-act="swap" id="conv-swap" aria-label="สลับสกุลเงิน (ตอนนี้ ${from} เป็น ${to})">${icon('swapV', 18, 2)}</button>
    <div class="conv-row">
      <span class="cur">${to}</span>
      <output id="conv-out" for="conv-amt" aria-live="polite">${outText(convert(amt, dir, fx.rate))}</output>
    </div>
  </section>`;
}

function goalUsd(app, fx) {
  const g = app.state.goals.find((x) => x.id === 'g1') || app.state.goals.find((x) => x.kind !== 'emergency');
  if (!g) return '';
  const st = goalStats(app.state, g, app.today);
  return html`<section class="card" aria-label="เป้าเป็นดอลลาร์" style="gap:10px">
    <div class="label ellipsis">GOAL · เป็นดอลลาร์</div>
    <div class="grid2" style="gap:8px">
      <div class="inner lg"><span class="label">เป้า <span class="mono">${baht(st.target)}</span></span><span class="v" id="fx-goal-usd">${usd(thbToUsd(st.target, fx.rate))}</span></div>
      <div class="inner lg"><span class="label">มีแล้ว <span class="mono">${baht(st.saved)}</span></span><span class="v" id="fx-saved-usd">${usd(thbToUsd(st.saved, fx.rate))}</span></div>
    </div>
    <p class="sub" style="line-height:1.6">ถ้าบาทแข็งขึ้น (ตัวเลขลดลง) เงินบาทเท่าเดิมจะแลกดอลลาร์ได้มากขึ้น</p>
  </section>`;
}

const FOOT = 'เรทอ้างอิงจากธนาคารกลางยุโรป อัปเดตวันละครั้งในวันทำการ เรทที่โบรกเกอร์ใช้แลกจริงจะต่างไปเล็กน้อย';

function empty(status) {
  if (status === 'loading') {
    return html`<div class="empty-box" id="fx-empty" role="status">กำลังโหลดเรทล่าสุด…</div>`;
  }
  return html`<div class="empty-box" id="fx-empty" style="flex-direction:column;gap:12px">
    <span>ยังไม่มีเรทในเครื่อง ต่อเน็ตแล้วกดลองใหม่</span>
    <button class="btn md" data-act="retry" id="fx-retry" style="width:auto;padding:0 24px">ลองใหม่</button>
  </div>`;
}

export default {
  id: 'fx',
  title: 'ค่าเงิน',
  tab: null,
  render(app) {
    const { fx, status } = app.fxNow();
    return html`<div class="screen">
      ${topbar('ค่าเงิน', 'home')}
      ${fx ? html`${rateSection(app, fx, status)}${converter(app, fx)}${goalUsd(app, fx)}` : empty(status)}
      <p class="small muted" style="line-height:1.6;background:var(--card);border-radius:14px;padding:12px 14px">${FOOT}</p>
    </div>`;
  },
  mount(app) {
    // เข้าหน้านี้ = ลองดึงเรทใหม่ 1 ครั้ง (app.js ไม่ดึงซ้ำถ้าเรทยังไม่เก่า 6 ชม.)
    if (!app.local.tried) {
      app.local.tried = true;
      app.refreshFxNow();
    }
  },
  actions: {
    range(app, el) {
      app.local.range = el.dataset.r;
      app.render();
    },
    /** สลับทิศ: ตัวเลขที่พิมพ์ไว้คงเดิม เปลี่ยนแค่สกุลเงิน */
    swap(app) {
      app.local.dir = (app.local.dir || 'thb') === 'thb' ? 'usd' : 'thb';
      app.render();
    },
    retry(app) {
      app.fx = null;
      app.render();
      app.refreshFxNow({ force: true });
    },
  },
  inputs: {
    /** พิมพ์จำนวนเงิน: อัปเดตผลทันที ไม่วาดหน้าใหม่ (คีย์บอร์ดไม่หาย) */
    amt(app, el) {
      app.local.amt = el.value;
      const { fx } = app.fxNow();
      const out = document.getElementById('conv-out');
      if (!fx || !out) return;
      const v = convert(el.value, app.local.dir || 'thb', fx.rate);
      out.textContent = outText(v);
      el.setAttribute('aria-invalid', bool(v === null));
    },
  },
};
