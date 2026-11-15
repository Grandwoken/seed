// SEED — จำลองการลงทุน (#/sim): สไลเดอร์ 4 ตัว, 3 กรณี + เงินที่ใส่, ค่าธรรมเนียม, ถ้าพอร์ตตก, ทยอยลง vs ก้อนเดียว
// ไม่ใช่การทำนาย: ผลตอบแทนเป็นสมมติฐานที่แก้ได้ สูตรอยู่ใน calc.js (simulate / invested / feeLoss / recoveryNeeded)
import { html, toHTML, icon, baht, openPanel } from '../ui.js';
import { simDefaults, simScenarios, recoveryNeeded } from '../calc.js';
import { setSim } from '../store.js';
import { simChart, SIM_COLORS } from '../charts.js';
import { topbar } from './common.js';

const SLIDERS = [
  { k: 'initial', label: 'เงินก้อนแรก', min: 0, max: 200000, step: 1000, fmt: (v) => baht(v) },
  { k: 'monthly', label: 'เติมทุกเดือน', min: 0, max: 10000, step: 100, fmt: (v) => baht(v) },
  { k: 'years', label: 'ระยะเวลา', min: 1, max: 15, step: 1, fmt: (v) => `${v} ปี` },
  { k: 'fee', label: 'ค่าธรรมเนียมรวมต่อปี', min: 0, max: 2, step: 0.1, fmt: (v) => `${Number(v).toFixed(1)}%` },
];
const CASES = [['good', 'ดี'], ['mid', 'กลาง'], ['bad', 'แย่']];
const DEFAULT_RATES = { bad: -5, mid: 6, good: 12 };
/** +12% / −5% / 0% / +5.5% */
const rateTxt = (r) => (r > 0 ? '+' : r < 0 ? '−' : '') + (Number.isInteger(r) ? Math.abs(r) : Math.abs(r).toFixed(1)) + '%';
const recover = (drop) => Math.round(recoveryNeeded(drop) * 100);

/** การ์ดผล (วาดใหม่ทุกครั้งที่เลื่อนสไลเดอร์) */
function results(p, r) {
  const inv = r.invested[r.invested.length - 1];
  const top = html`<div class="row between base"><span class="sub">ใส่เงินรวม</span><span class="mono" style="font-size:18px;font-weight:600" id="sim-invested">${baht(inv)}</span></div>`;
  if (p.initial <= 0 && p.monthly <= 0) {
    return html`${top}<div class="empty-box" id="sim-empty">ตั้งเงินก้อนแรกหรือเงินที่เติมทุกเดือนด้านล่าง แล้วกราฟจะขึ้นตรงนี้</div>`;
  }
  const label = `กราฟมูลค่าพอร์ต 3 กรณี ใน ${p.years} ปี: ${CASES.map(([k, n]) => `${n} ${baht(r[k].end)}`).join(', ')}, เงินที่ใส่ ${baht(inv)}`;
  return html`${top}
    ${simChart({ good: r.good.yearly, mid: r.mid.yearly, bad: r.bad.yearly, invested: r.invested, label })}
    <div class="stack" style="gap:10px">
      ${CASES.map(([k, n]) => html`<div class="row" style="gap:10px;font-size:14px">
        <span class="dot" style="width:12px;height:12px;background:${SIM_COLORS[k]}" aria-hidden="true"></span>
        <span class="grow">${n} <span class="small muted nowrap">สมมติ ${rateTxt(p.rates[k])}/ปี</span></span>
        <span class="mono" style="font-weight:600" id="sim-end-${k}">${baht(r[k].end)}</span>
      </div>`)}
      <div class="row small muted" style="gap:10px"><span style="width:12px;border-top:2px dashed ${SIM_COLORS.invested};flex:none" aria-hidden="true"></span>เส้นประ = เงินที่ใส่เข้าไป</div>
    </div>`;
}

const feeText = (p, r) => html`ค่าธรรมเนียม <span class="mono">${Number(p.fee).toFixed(1)}%</span> ต่อปี ทำให้กรณีกลางได้น้อยลง <b class="mono warn" id="sim-fee-loss">${baht(r.feeLoss)}</b> ใน ${p.years} ปี`;

const dropText = (r) => html`ถึงจะกลับมาเท่าเดิม ถ้าพอร์ตกรณีกลาง <span class="mono">${baht(r.mid.end)}</span> ตกครึ่งหนึ่งจะเหลือ <span class="mono" id="sim-half">${baht(r.mid.end / 2)}</span> รับได้ไหม?`;

function slider(s, p) {
  const v = p[s.k];
  return html`<div class="stack" style="gap:4px">
    <div class="row between sub"><label for="sl-${s.k}">${s.label}</label><b class="mono" style="color:var(--text);font-weight:600" id="sl-v-${s.k}">${s.fmt(v)}</b></div>
    <input class="range" type="range" id="sl-${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"
      aria-valuetext="${s.fmt(v)}" data-k="${s.k}" data-in="slide" data-change="slide">
  </div>`;
}

/** เลื่อนสไลเดอร์: คำนวณใหม่แล้วแก้เฉพาะตัวเลข/กราฟ (ไม่วาดทั้งหน้า นิ้วจะได้ไม่หลุด) */
function paint(app, el) {
  const root = el.closest('.screen');
  if (!root) return;
  const p = simDefaults(app.state, app.today);
  const s = SLIDERS.find((x) => x.k === el.dataset.k);
  p[s.k] = Number(el.value);
  const r = simScenarios(p);
  const t = s.fmt(p[s.k]);
  root.querySelector(`#sl-v-${s.k}`).textContent = t;
  el.setAttribute('aria-valuetext', t);
  root.querySelector('#sim-result').innerHTML = toHTML(results(p, r));
  root.querySelector('#sim-fee-text').innerHTML = toHTML(feeText(p, r));
  root.querySelector('#sim-drop-text').innerHTML = toHTML(dropText(r));
}

/** แผงแก้สมมติฐานผลตอบแทน (−50…50 และ แย่ ≤ กลาง ≤ ดี — ตรวจใน setSim) */
function ratesPanel(app) {
  const cur = simDefaults(app.state, app.today).rates;
  const order = [['bad', 'แย่'], ['mid', 'กลาง'], ['good', 'ดี']];
  const title = 'สมมติฐานผลตอบแทนต่อปี';
  return openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>${title}</h2>
      <p class="sub" style="line-height:1.6">เป็นตัวเลขสมมติ ไม่ใช่การทำนาย ใส่ได้ตั้งแต่ −50 ถึง 50 (% ต่อปี) และต้องเรียง แย่ ≤ กลาง ≤ ดี</p>
      ${order.map(([k, n]) => html`<label class="field">กรณี${n} (% ต่อปี)
        <input class="input mono" type="number" step="0.1" min="-50" max="50" value="${cur[k]}" data-k="${k}" id="rate-${k}" autocomplete="off"></label>`)}
      <p class="small warn" data-err role="alert"></p>
      <button class="btn md" data-ok>บันทึก</button>
      <button class="btn ghost" data-reset>ใช้ค่าเริ่มต้น (แย่ −5% · กลาง +6% · ดี +12%)</button>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const err = panel.querySelector('[data-err]');
    const tryRates = (rates) => {
      try {
        close(setSim(app.state, { rates }));
      } catch (e) {
        err.textContent = e.message;
      }
    };
    const read = () => {
      const rates = {};
      panel.querySelectorAll('[data-k]').forEach((i) => { rates[i.dataset.k] = i.value.trim() === '' ? NaN : Number(i.value); });
      return rates;
    };
    panel.querySelector('[data-ok]').addEventListener('click', () => tryRates(read()));
    panel.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryRates(read()); }));
    panel.querySelector('[data-reset]').addEventListener('click', () => tryRates({ ...DEFAULT_RATES }));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: title });
}

export default {
  id: 'sim',
  title: 'จำลอง',
  tab: null,
  render(app) {
    const p = simDefaults(app.state, app.today);
    const r = simScenarios(p);
    return html`<div class="screen" style="gap:16px">
      ${topbar('จำลองการลงทุน', 'plan')}
      <p class="sub" style="line-height:1.6">ไม่ใช่การทำนาย เป็นการคำนวณจากสมมติฐานด้านล่าง</p>

      <section class="card" aria-label="ผลลัพธ์">
        <div class="stack" style="gap:14px" id="sim-result">${results(p, r)}</div>
        <button class="link-btn row" data-act="rates" id="sim-rates" style="gap:6px;align-self:flex-start">${icon('edit', 14, 2)}แก้สมมติฐานผลตอบแทน</button>
      </section>

      <section class="card" aria-label="ตั้งค่าการจำลอง" style="gap:16px">
        ${SLIDERS.map((s) => slider(s, p))}
      </section>

      <section class="card" id="sim-fee" aria-labelledby="sim-fee-h" style="gap:8px">
        <h2 class="h-title" id="sim-fee-h">ค่าธรรมเนียมกินไปเท่าไหร่</h2>
        <p style="font-size:14px;line-height:1.6" id="sim-fee-text">${feeText(p, r)}</p>
      </section>

      <section class="card" id="sim-drop" aria-labelledby="sim-drop-h" style="gap:10px">
        <h2 class="h-title" id="sim-drop-h">ถ้าพอร์ตตก</h2>
        <div class="grid2" style="gap:8px">
          <div class="inner lg"><span class="label">ตก 30%</span><span class="v" id="sim-rec-30">ต้องขึ้น ${recover(0.3)}%</span></div>
          <div class="inner lg"><span class="label">ตก 50%</span><span class="v" id="sim-rec-50">ต้องขึ้น ${recover(0.5)}%</span></div>
        </div>
        <p class="sub" style="line-height:1.6" id="sim-drop-text">${dropText(r)}</p>
      </section>

      <section class="card" id="sim-dca" aria-labelledby="sim-dca-h" style="gap:12px">
        <h2 class="h-title" id="sim-dca-h">ทยอยลง vs ลงก้อนเดียว</h2>
        <div class="grid2" style="gap:8px;font-size:13px;line-height:1.55">
          <div class="inner" style="padding:12px"><div style="font-weight:600;margin-bottom:4px">ลงก้อนเดียว</div><div class="muted">เงินอยู่ในตลาดนานกว่า แต่ถ้าซื้อตอนแพงจะเจ็บทั้งก้อน</div></div>
          <div class="inner" style="padding:12px"><div style="font-weight:600;margin-bottom:4px">ทยอยลง (DCA)</div><div class="muted">เฉลี่ยราคาซื้อ ลดความเสียใจ แต่ถ้าตลาดขึ้นตลอดจะได้น้อยกว่า</div></div>
        </div>
        <a class="link-btn lg row" href="#/learn/5" id="sim-lesson5" style="text-decoration:none">อ่านบทที่ 5 →</a>
      </section>
    </div>`;
  },
  /** มาจากปุ่มในหน้าแผน (#/sim?s=fee|drop|dca): เลื่อนไปส่วนนั้นครั้งเดียว */
  mount(app, view, route) {
    const s = route.query.s;
    if (!/^(fee|drop|dca)$/.test(s || '') || app.local.scrolled) return;
    app.local.scrolled = true;
    const sec = view.querySelector(`#sim-${s}`);
    if (!sec) return;
    requestAnimationFrame(() => {
      sec.scrollIntoView({ block: 'start' });
      const h = sec.querySelector('h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    });
  },
  actions: {
    async rates(app) {
      const next = await ratesPanel(app);
      if (!next) return;
      app.state = next;
      app.save();
      app.render();
    },
  },
  inputs: {
    slide: (app, el) => paint(app, el),
  },
  changes: {
    /** ปล่อยนิ้ว = จำค่าล่าสุด */
    slide(app, el) {
      app.state = setSim(app.state, { [el.dataset.k]: Number(el.value) });
      app.save();
    },
  },
};
