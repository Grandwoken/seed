// SEED — หน้าแผน (#/plan): เป้าหมาย, เงินฉุกเฉิน, แบ่งเงินตอนเปิดบัญชี, เครื่องคิดเลข, เช็กลิสต์ก่อนเปิดบัญชี
import { html, toHTML, icon, int, money, baht, toast, openPanel, confirmBox, parseMoney } from '../ui.js';
import { goalStats, checklistAuto, walletBalance, rebalance, addDays, avgMonthlyExpense } from '../calc.js';
import { addGoal, updateGoal, deleteGoal, setAllocation, setChecklist, ALLOC_KEYS } from '../store.js';
import { ring } from '../charts.js';

const BLUE = '#7C9CFF';
const LESSONS = 12;
const MULTIPLIERS = [1, 2, 3, 4, 5, 6, 9, 12];
const ALLOC = {
  stock: { name: 'หุ้นตัวเดียว', color: '#7C9CFF' },
  fund: { name: 'ETF-กองทุน', color: '#4CC9C0' },
  cash: { name: 'เงินสดสำรอง', color: '#C3A6FF' },
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** 29.04.2570 */
const dotDate = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${Number(iso.slice(0, 4)) + 543}`;
const walletNames = (s, ids) => (ids || []).map((id) => s.wallets.find((w) => w.id === id)?.name).filter(Boolean).join(', ');
const g1Of = (s) => s.goals.find((g) => g.id === 'g1') || s.goals.find((g) => g.kind !== 'emergency');

/** แถวท้ายการ์ด: นับจากกระเป๋าไหน + ปุ่มแก้ */
const countedFrom = (s, g) => html`<div class="row between" style="gap:8px">
  <span class="small muted ellipsis">${g.walletIds?.length ? `นับจาก ${walletNames(s, g.walletIds)}` : 'ยังไม่ได้เลือกกระเป๋าที่จะนับ'}</span>
  <button class="link-btn" data-act="editGoal" data-id="${g.id}" id="goal-edit-${g.id}" aria-label="แก้${g.kind === 'emergency' ? 'เงินฉุกเฉิน' : `เป้าหมาย ${g.name}`}">แก้</button>
</div>`;

function goalCard(app, g) {
  const s = app.state;
  const st = goalStats(s, g, app.today);
  const p = Math.round(st.progress * 100);
  const ok = st.need === null || st.thisMonth >= st.need;
  return html`<section class="card" aria-label="เป้าหมาย ${g.name}" id="goal-${g.id}">
    <div class="row between label" style="gap:8px"><span class="ellipsis">GOAL · ${g.name}</span>${g.deadline ? html`<span style="flex:none">${dotDate(g.deadline)}</span>` : ''}</div>
    <div class="row" style="gap:16px">
      ${ring({ size: 96, r: 40, stroke: 9, textSize: 17, arcs: [{ frac: st.progress, color: BLUE }], text: `${p}%`, label: `ความคืบหน้า ${p}%` })}
      <div class="grow stack" style="gap:2px">
        <div class="mono" style="font-size:24px;font-weight:600">${int(st.saved)}</div>
        <div class="sub">จาก ${baht(st.target)} · ${st.days === null ? 'ยังไม่ได้ตั้งวัน' : st.days > 0 ? `เหลือ ${st.days} วัน` : 'ถึงกำหนดแล้ว'}</div>
      </div>
    </div>
    <div class="grid2" style="gap:8px">
      <div class="inner lg"><span class="label">ต้องเก็บ/เดือน</span><span class="v">${st.need === null ? '—' : int(st.need)}</span></div>
      <div class="inner lg"><span class="label">เก็บได้จริงเดือนนี้</span><span class="v ${ok ? 'up' : 'warn'}">${int(st.thisMonth)}</span></div>
    </div>
    ${countedFrom(s, g)}
  </section>`;
}

function emergencyCard(app, g) {
  const s = app.state;
  const st = goalStats(s, g, app.today);
  const p = Math.round(st.progress * 100);
  const mult = g.multiplier || 3;
  return html`<section class="card" aria-label="เงินฉุกเฉิน" id="goal-${g.id}" style="gap:10px">
    <div class="row between base"><h2 class="h-title">เงินฉุกเฉิน</h2><span class="mono muted" style="font-size:13px">${p}%</span></div>
    <div class="mono" id="em-amount" style="font-size:20px;font-weight:600">${int(st.saved)}<span class="muted" style="font-size:14px;font-weight:400"> / ${st.target > 0 ? int(st.target) : '—'}</span></div>
    <div class="bar" role="progressbar" aria-label="เงินฉุกเฉิน" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><span style="width:${p}%"></span></div>
    <p class="sub" style="line-height:1.5">${mult} เท่าของรายจ่ายต่อเดือน แยกไว้ใช้ตอนมีเรื่องด่วน จะได้ไม่ต้องขายหุ้นตอนราคาตก</p>
    ${st.target > 0 ? '' : html`<p class="note plain">ยังไม่มีรายจ่ายให้คิด จดรายจ่ายไปสักพักแล้วเป้าจะขึ้นเอง</p>`}
    ${countedFrom(s, g)}
  </section>`;
}

function allocationCard(app) {
  const s = app.state;
  const a = s.allocation;
  if (!a) {
    return html`<section class="card" aria-label="แบ่งเงินตอนเปิดบัญชี" style="gap:12px">
      <h2 class="h-title">แบ่งเงินตอนเปิดบัญชี</h2>
      <div class="alloc-bar" aria-hidden="true"><span></span><span></span><span></span></div>
      <p style="font-size:13px;line-height:1.6;color:#C5CAD2">ยังไม่ได้ตั้ง ลองเล่นเครื่องจำลองก่อน แล้วค่อยแบ่งระหว่าง หุ้นตัวเดียว / ETF-กองทุน / เงินสดสำรอง</p>
      <div class="row between">
        <a class="link-btn lg" href="#/sim" id="alloc-sim">ไปที่เครื่องจำลอง →</a>
        <button class="link-btn lg" data-act="editAlloc" id="alloc-edit">ตั้งเอง</button>
      </div>
    </section>`;
  }
  const g = g1Of(s);
  const base = g ? Number(g.target) || 0 : 0;
  const keys = ALLOC_KEYS.filter((k) => a[k] > 0);
  const label = ALLOC_KEYS.map((k) => `${ALLOC[k].name} ${a[k]}%`).join(', ');
  return html`<section class="card" aria-label="แบ่งเงินตอนเปิดบัญชี" style="gap:12px">
    <div class="row between base"><h2 class="h-title">แบ่งเงินตอนเปิดบัญชี</h2><button class="link-btn" data-act="editAlloc" id="alloc-edit" aria-label="แก้สัดส่วนแบ่งเงิน">แก้</button></div>
    <div class="alloc-bar" role="img" aria-label="${label}">${keys.map((k) => html`<span style="flex:${a[k]};background:${ALLOC[k].color}"></span>`)}</div>
    <div class="stack" style="gap:8px;font-size:13px">
      ${ALLOC_KEYS.map((k) => html`<div class="row" style="gap:8px"><span class="dot" style="background:${ALLOC[k].color}"></span><span class="grow">${ALLOC[k].name}</span><span class="mono" style="width:44px;text-align:right">${a[k]}%</span>${base > 0 ? html`<span class="mono muted" style="min-width:74px;text-align:right">${baht((base * a[k]) / 100)}</span>` : ''}</div>`)}
    </div>
    <p class="small muted" style="line-height:1.6">${base > 0 ? `คิดจากเป้า ${baht(base)} · ` : ''}เป็นโน้ตเตือนตัวเอง ไม่ใช่คำแนะนำ</p>
  </section>`;
}

const calcTiles = (app) => html`<section class="grid2" aria-label="เครื่องคิดเลข" style="gap:10px">
  <a class="tile calc-tile" href="#/sim" id="calc-sim"><span class="ico-tile">${icon('sim', 20)}</span><span class="calc-name">จำลอง ${app.state.sim?.years || 6} ปี</span></a>
  <a class="tile calc-tile" href="#/sim?s=dca" id="calc-dca"><span class="ico-tile">${icon('steps', 20)}</span><span class="calc-name">ทยอยลง vs ก้อนเดียว</span></a>
  <a class="tile calc-tile" href="#/sim?s=fee" id="calc-fee"><span class="ico-tile">${icon('percent', 20)}</span><span class="calc-name">ค่าธรรมเนียม<span class="nowrap">กินเท่าไหร่</span></span></a>
  <a class="tile calc-tile" href="#/sim?s=drop" id="calc-drop"><span class="ico-tile warm">${icon('drop', 20)}</span><span class="calc-name">ถ้าพอร์ตตกครึ่ง</span></a>
</section>`;

function checklistItems(app) {
  const s = app.state;
  const c = s.checklist;
  const auto = checklistAuto(s, app.today, LESSONS);
  const em = s.goals.find((g) => g.kind === 'emergency');
  const read = s.learn?.done?.length || 0;
  const note = (c.whyNote || '').trim();
  return [
    { key: 'talkParent', checked: c.talkParent, title: 'คุยกับผู้ปกครองเรื่องเปิดบัญชี', sub: 'อายุยังไม่ถึง 20 ต้องให้ผู้ปกครองยินยอมหรือเปิดให้' },
    {
      key: 'channel', checked: c.channel, title: 'เลือกช่องทาง', sub: 'Dime บัญชีเสริม / โบรกเกอร์ที่รับอายุ 15–20 / กองทุนรวม',
      extra: html`<a class="link-btn" href="#/learn/accounts" id="chk-channel-read">อ่านเทียบช่องทาง →</a>`,
    },
    { key: 'docs', checked: c.docs, title: 'เตรียมเอกสาร', sub: 'บัตรประชาชน, หน้าสมุดบัญชี, หนังสือยินยอม' },
    { key: 'emergency', checked: auto.emergency, auto: true, title: 'มีเงินฉุกเฉินแยกไว้แล้ว', sub: `อย่างน้อย ${em?.multiplier || 3} เท่าของรายจ่ายต่อเดือน · ครบแล้วแอพติ๊กให้เอง` },
    { key: 'lessons', checked: auto.lessons, auto: true, title: `อ่านบทเรียนพื้นฐานครบ ${LESSONS} บท`, sub: `อ่านแล้ว ${Math.min(read, LESSONS)}/${LESSONS} บท · ครบแล้วแอพติ๊กให้เอง` },
    {
      key: 'why', checked: c.why, title: 'เขียนเหตุผลว่าจะซื้ออะไร เพราะอะไร', sub: 'ไว้กลับมาอ่านตอนตลาดผันผวน',
      extra: html`${note ? html`<span class="why-preview">${note}</span>` : ''}<button class="link-btn" data-act="whyNote" id="why-note">${note ? 'อ่าน/แก้เหตุผล' : 'เขียนเหตุผล'}</button>`,
    },
  ];
}

function checklistCard(app) {
  const items = checklistItems(app);
  const n = items.filter((i) => i.checked).length;
  return html`<section class="card list" aria-label="เช็กลิสต์ก่อนเปิดบัญชี">
    <div class="list-head" style="padding:14px 0 6px"><h2 class="h-title">เช็กลิสต์ก่อนเปิดบัญชี</h2><span class="mono muted" style="font-size:13px" id="chk-count">${n}/${items.length}</span></div>
    ${items.map((i) => html`<div class="check-row ${i.checked ? 'done' : ''}">
      <input type="checkbox" id="chk-${i.key}" ${i.checked ? 'checked' : ''} ${i.auto ? html`disabled aria-describedby="chk-${i.key}-sub"` : html`data-change="check" data-key="${i.key}"`}>
      <div class="grow stack" style="gap:2px">
        <label for="chk-${i.key}" class="stack" style="gap:2px"><span class="t">${i.title}</span><span class="s" id="chk-${i.key}-sub">${i.sub}</span></label>
        ${i.extra || ''}
      </div>
    </div>`)}
  </section>`;
}

// ---------- แผงแก้ไข ----------

/** ช่องเลือกกระเป๋าที่นับเข้าเป้า (บอกด้วยถ้ากระเป๋านั้นนับในเป้าอื่นอยู่แล้ว) */
function walletChecks(s, goal) {
  const own = new Set(goal?.walletIds || []);
  return html`<fieldset class="field" style="border:0;padding:0;margin:0">
    <legend style="padding:0;margin-bottom:8px">นับเงินจากกระเป๋า</legend>
    ${s.wallets.map((w) => {
      const others = s.goals.filter((g) => g.id !== goal?.id && (g.walletIds || []).includes(w.id)).map((g) => g.name);
      return html`<label class="check-row" style="border-top:0;padding:8px 0">
        <input type="checkbox" data-w="${w.id}" ${own.has(w.id) ? 'checked' : ''}>
        <span class="grow stack" style="gap:2px"><span class="t">${w.name}</span>${others.length ? html`<span class="s">นับใน${others.join(', ')}ด้วย</span>` : ''}</span>
        <span class="mono muted" style="font-size:13px">${baht(walletBalance(s, w.id))}</span>
      </label>`;
    })}
  </fieldset>`;
}

/** แผงแก้/เพิ่มเป้าหมาย → { patch } | { del: true } | undefined */
function goalEditor(app, goal) {
  const s = app.state;
  const isNew = !goal;
  const em = goal?.kind === 'emergency';
  const isG1 = goal?.id === 'g1';
  const minDate = addDays(app.today, 1);
  const title = isNew ? 'เพิ่มเป้าหมาย' : em ? 'แก้เงินฉุกเฉิน' : 'แก้เป้าหมาย';
  return openPanel((panel, close) => {
    const avgExp = avgMonthlyExpense(s.transactions, app.today);
    panel.innerHTML = toHTML(html`
      <h2>${title}</h2>
      ${em ? html`
        <label class="field">กี่เท่าของรายจ่ายต่อเดือน
          <select class="input" data-f="mult">${MULTIPLIERS.map((m) => html`<option value="${m}" ${m === (goal.multiplier || 3) ? 'selected' : ''}>${m} เท่า</option>`)}</select></label>
        <p class="sub" data-em-hint></p>` : html`
        <label class="field">ชื่อเป้าหมาย
          <input class="input" data-f="name" maxlength="40" autocomplete="off" value="${goal?.name || ''}" placeholder="เช่น ค่าเรียนพิเศษ"></label>
        <label class="field">เป้า (บาท)
          <input class="input mono" data-f="target" inputmode="decimal" autocomplete="off" value="${goal?.target ? money(goal.target) : ''}" placeholder="0"></label>
        <label class="field">${isG1 ? 'วันเปิดบัญชี (วันที่ต้องถึงเป้า)' : 'ถึงเป้าภายในวันที่'}
          <input class="input" type="date" data-f="deadline" min="${minDate}" value="${goal?.deadline || ''}"></label>`}
      ${walletChecks(s, goal)}
      <p class="small warn" data-err hidden></p>
      <button class="btn md" data-ok>${isNew ? 'เพิ่มเป้าหมาย' : 'บันทึก'}</button>
      ${!isNew && !em && !isG1 ? html`<button class="btn danger" data-del>ลบเป้าหมายนี้</button>` : ''}
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const f = (k) => panel.querySelector(`[data-f="${k}"]`);
    const err = panel.querySelector('[data-err]');
    const fail = (msg, el) => {
      err.textContent = msg;
      err.hidden = false;
      panel.querySelectorAll('.input.bad').forEach((x) => x.classList.remove('bad'));
      if (el) { el.classList.add('bad'); el.focus(); }
    };
    if (em) {
      const hint = panel.querySelector('[data-em-hint]');
      const upd = () => {
        hint.textContent = avgExp > 0
          ? `รายจ่ายเฉลี่ยต่อเดือน ${baht(avgExp)} → เป้า ${baht(avgExp * Number(f('mult').value))}`
          : 'ยังไม่มีรายจ่ายให้คิด จดรายจ่ายไปสักพักแล้วเป้าจะขึ้นเอง';
      };
      f('mult').addEventListener('change', upd);
      upd();
    }
    panel.querySelector('[data-ok]').addEventListener('click', () => {
      const walletIds = [...panel.querySelectorAll('[data-w]')].filter((x) => x.checked).map((x) => x.dataset.w);
      if (em) {
        close({ patch: { multiplier: Number(f('mult').value), walletIds } });
        return;
      }
      const name = f('name').value.trim();
      if (!name) return fail('ใส่ชื่อเป้าหมาย', f('name'));
      const target = parseMoney(f('target').value);
      if (!Number.isFinite(target) || target <= 0) return fail('ใส่เป้าเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)', f('target'));
      const deadline = f('deadline').value;
      if (!ISO.test(deadline)) return fail('เลือกวันที่', f('deadline'));
      // วันเดิมที่เลยมาแล้วยังเก็บไว้ได้ (แก้อย่างอื่นได้) แต่วันใหม่ต้องหลังวันนี้
      if (deadline !== goal?.deadline && deadline < minDate) return fail('เลือกวันที่หลังวันนี้', f('deadline'));
      return close({ patch: { name, target, deadline, walletIds } });
    });
    const del = panel.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => close({ del: true }));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: title });
}

/** แผงตั้งสัดส่วน 3 ช่อง (รวม 100 เสมอ) → [stock, fund, cash] | 'clear' | undefined */
function allocEditor(app) {
  const s = app.state;
  const cur = s.allocation;
  let vals = cur ? ALLOC_KEYS.map((k) => cur[k]) : [0, 0, 100];
  const g = g1Of(s);
  const base = g ? Number(g.target) || 0 : 0;
  return openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>แบ่งเงินตอนเปิดบัญชี</h2>
      <p class="sub" style="line-height:1.6">เลื่อนช่องไหน อีก 2 ช่องจะปรับให้รวมได้ 100% เอง${base > 0 ? ` · คิดจากเป้า ${baht(base)}` : ''}</p>
      ${ALLOC_KEYS.map((k, i) => html`<label class="field" style="gap:6px">
        <span class="row between" style="color:var(--text)"><span class="row" style="gap:8px"><span class="dot" style="background:${ALLOC[k].color}"></span>${ALLOC[k].name}</span>
          <span class="mono"><span data-pv="${k}">${vals[i]}%</span>${base > 0 ? html`<span class="muted" data-bv="${k}"> · ${baht((base * vals[i]) / 100)}</span>` : ''}</span></span>
        <input type="range" class="range" min="0" max="100" step="1" value="${vals[i]}" data-k="${k}" id="alloc-${k}" aria-valuetext="${vals[i]}%">
      </label>`)}
      <p class="small muted">เป็นโน้ตเตือนตัวเอง ไม่ใช่คำแนะนำ</p>
      <button class="btn md" data-ok>บันทึก</button>
      ${cur ? html`<button class="btn ghost" data-clear>ล้างค่าที่ตั้งไว้</button>` : ''}
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    const ranges = [...panel.querySelectorAll('[data-k]')];
    const paint = () => ALLOC_KEYS.forEach((k, i) => {
      ranges[i].value = String(vals[i]);
      ranges[i].setAttribute('aria-valuetext', `${vals[i]}%`);
      panel.querySelector(`[data-pv="${k}"]`).textContent = `${vals[i]}%`;
      const bv = panel.querySelector(`[data-bv="${k}"]`);
      if (bv) bv.textContent = ` · ${baht((base * vals[i]) / 100)}`;
    });
    ranges.forEach((r, i) => r.addEventListener('input', () => {
      vals = rebalance(vals, i, r.value);
      paint();
    }));
    panel.querySelector('[data-ok]').addEventListener('click', () => close(vals.slice()));
    const clr = panel.querySelector('[data-clear]');
    if (clr) clr.addEventListener('click', () => close('clear'));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: 'แบ่งเงินตอนเปิดบัญชี' });
}

/** แผงเขียนเหตุผล → ข้อความ | undefined */
function whyEditor(app) {
  const note = app.state.checklist.whyNote || '';
  return openPanel((panel, close) => {
    panel.innerHTML = toHTML(html`
      <h2>เหตุผลที่จะลงทุน</h2>
      <p class="sub" style="line-height:1.6">จะซื้ออะไร เพราะอะไร ถ้าราคาตกครึ่งจะทำอะไร — เขียนไว้อ่านเองตอนตลาดผันผวน</p>
      <textarea class="input" data-v maxlength="2000" aria-label="เหตุผลที่จะลงทุน" placeholder="เช่น อยากถือยาว 6 ปี เพราะ...">${note}</textarea>
      <button class="btn md" data-ok>บันทึก</button>
      <button class="btn ghost" data-cancel>ยกเลิก</button>`);
    panel.querySelector('[data-ok]').addEventListener('click', () => close(panel.querySelector('[data-v]').value));
    panel.querySelector('[data-cancel]').addEventListener('click', () => close(undefined));
  }, { label: 'เหตุผลที่จะลงทุน' });
}

function apply(app, next, msg) {
  app.state = next;
  app.save();
  app.render();
  if (msg) toast(msg);
}

export default {
  id: 'plan',
  title: 'แผน',
  tab: 'plan',
  render(app) {
    const s = app.state;
    const g1 = g1Of(s);
    const em = s.goals.find((g) => g.kind === 'emergency');
    const others = s.goals.filter((g) => g !== g1 && g.kind !== 'emergency');
    return html`<div class="screen">
      <h1 style="font-size:24px;font-weight:600">แผน</h1>
      ${g1 ? goalCard(app, g1) : ''}
      ${em ? emergencyCard(app, em) : ''}
      ${others.map((g) => goalCard(app, g))}
      <button class="add-dashed" data-act="addGoal" id="plan-add-goal">+ เพิ่มเป้าหมาย</button>
      ${allocationCard(app)}
      ${calcTiles(app)}
      ${checklistCard(app)}
    </div>`;
  },
  actions: {
    async editGoal(app, el) {
      const goal = app.state.goals.find((g) => g.id === el.dataset.id);
      if (!goal) return;
      const r = await goalEditor(app, goal);
      if (!r) return;
      if (r.del) {
        const ok = await confirmBox({ title: `ลบเป้า "${goal.name}"?`, body: 'เงินในกระเป๋าไม่หายไปไหน แค่เลิกนับเข้าเป้านี้', ok: 'ลบเป้าหมาย', danger: true });
        if (ok) apply(app, deleteGoal(app.state, goal.id), 'ลบเป้าหมายแล้ว');
        return;
      }
      apply(app, updateGoal(app.state, goal.id, r.patch), 'บันทึกเป้าหมายแล้ว');
    },
    async addGoal(app) {
      const r = await goalEditor(app, null);
      if (!r || !r.patch) return;
      apply(app, addGoal(app.state, r.patch).state, 'เพิ่มเป้าหมายแล้ว');
    },
    async editAlloc(app) {
      const r = await allocEditor(app);
      if (r === undefined) return;
      if (r === 'clear') return apply(app, setAllocation(app.state, null), 'ล้างสัดส่วนแล้ว');
      const [stock, fund, cash] = r;
      return apply(app, setAllocation(app.state, { stock, fund, cash }), 'บันทึกสัดส่วนแล้ว');
    },
    async whyNote(app) {
      const text = await whyEditor(app);
      if (text === undefined) return;
      const had = Boolean((app.state.checklist.whyNote || '').trim());
      const patch = { whyNote: text };
      if (text.trim() && !had) patch.why = true; // เขียนเหตุผลครั้งแรก = ติ๊กข้อนี้ให้
      apply(app, setChecklist(app.state, patch), 'บันทึกเหตุผลแล้ว');
    },
  },
  changes: {
    check(app, el) {
      apply(app, setChecklist(app.state, { [el.dataset.key]: el.checked }));
    },
  },
};
