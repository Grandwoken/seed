// SEED — สูตรคำนวณทั้งหมด (pure functions) ตาม spec §6
// ใช้ได้ทั้งในเบราว์เซอร์และ node --test

const DAY = 86400000;
const HOUR = 3600000;

// ---------- ตัวเลข ----------

/** ปัดเป็นทศนิยม 2 ตำแหน่ง (เก็บเงินเป็นบาท) */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- วันที่ (สตริง YYYY-MM-DD ตามเวลาเครื่อง) ----------

const parts = (iso) => iso.split('-').map(Number);
const utc = (iso) => {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
};
const pad = (n) => String(n).padStart(2, '0');

/** วันนี้ตามเวลาเครื่อง เป็น YYYY-MM-DD */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function addDays(iso, n) {
  return new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
}
export function daysBetween(fromISO, toISO) {
  return Math.round((utc(toISO) - utc(fromISO)) / DAY);
}
/** จำนวนวันในเดือน (m = 1–12) */
export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export const monthOf = (iso) => iso.slice(0, 7);
/** เลื่อนเดือน YYYY-MM ไป n เดือน (ติดลบได้) */
export function addMonths(ym, n) {
  const [y, m] = parts(ym);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

// ---------- เป้าหมาย ----------

export function daysLeft(deadlineISO, today) {
  return Math.max(0, Math.ceil((utc(deadlineISO) - utc(today)) / DAY));
}
export function monthsLeft(days) {
  return Math.max(days / 30.44, 0.5);
}
/** ต้องเก็บเดือนละเท่าไหร่ (ปัดขึ้นทีละ 10 บาท) */
export function needPerMonth(target, saved, days) {
  return Math.ceil(Math.max(target - saved, 0) / monthsLeft(days) / 10) * 10;
}
export function goalProgress(saved, target) {
  return target > 0 ? Math.min(Math.max(saved / target, 0), 1) : 0;
}

// ---------- กระเป๋าเงิน ----------

export function walletBalance(state, walletId) {
  const w = state.wallets.find((x) => x.id === walletId);
  let b = Number(w?.start) || 0;
  for (const t of state.transactions) {
    if (t.type === 'transfer') {
      if (t.toWalletId === walletId) b += t.amount;
      if (t.fromWalletId === walletId) b -= t.amount;
    } else if (t.walletId === walletId) {
      b += t.type === 'in' ? t.amount : -t.amount;
    }
  }
  return round2(b);
}
export function totalBalance(state) {
  return round2(state.wallets.reduce((s, w) => s + walletBalance(state, w.id), 0));
}
export function goalSaved(state, goal) {
  return round2((goal.walletIds || []).reduce((s, id) => s + walletBalance(state, id), 0));
}

// ---------- รายเดือน (โอนเงินไม่นับเป็นรายรับ/รายจ่าย) ----------

export function monthTotals(transactions, ym) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (monthOf(t.date) !== ym) continue;
    if (t.type === 'in') income += t.amount;
    else if (t.type === 'out') expense += t.amount;
  }
  income = round2(income);
  expense = round2(expense);
  const left = round2(income - expense);
  return { income, expense, left, savingsRate: income > 0 ? left / income : 0 };
}
export function categorySpend(transactions, ym) {
  const out = {};
  for (const t of transactions) {
    if (t.type !== 'out' || monthOf(t.date) !== ym) continue;
    out[t.categoryId] = round2((out[t.categoryId] || 0) + t.amount);
  }
  return out;
}

/** 3 เดือนเต็มล่าสุด (ไม่นับเดือนนี้) ที่อยู่หลังรายการแรก */
function fullMonths(transactions, today, n = 3) {
  if (!transactions.length) return [];
  const first = transactions.reduce((m, t) => (t.date < m ? t.date : m), transactions[0].date);
  const firstYm = monthOf(first);
  const cur = monthOf(today);
  const months = [];
  for (let i = 1; i <= n; i++) {
    const ym = addMonths(cur, -i);
    if (ym >= firstYm) months.push(ym);
  }
  return months;
}
function avgOf(transactions, today, pick) {
  const months = fullMonths(transactions, today);
  if (!months.length) return pick(monthTotals(transactions, monthOf(today)));
  return round2(months.reduce((s, ym) => s + pick(monthTotals(transactions, ym)), 0) / months.length);
}
export function avgMonthlyLeft(transactions, today) {
  return avgOf(transactions, today, (m) => m.left);
}
export function avgMonthlyExpense(transactions, today) {
  return avgOf(transactions, today, (m) => m.expense);
}
export function emergencyTarget(multiplier, transactions, today) {
  return round2(multiplier * avgMonthlyExpense(transactions, today));
}
/** % ของงบที่ใช้ไป; ไม่มีงบ (0) → null */
export function budgetPct(spent, budget) {
  return budget > 0 ? Math.round((spent / budget) * 100) : null;
}

// ---------- รายการประจำ ----------

const newId = () => 't_' + globalThis.crypto.randomUUID();

/**
 * ลงรายการประจำที่ค้างอยู่ตั้งแต่ lastRun ถึงวันนี้
 * วันที่เกินจำนวนวันในเดือน → ใช้วันสุดท้ายของเดือน
 * รันซ้ำวันเดียวกันจะไม่เพิ่มอะไร และไม่สร้างรายการซ้ำที่มีอยู่แล้ว
 */
export function runRecurring(recurring, transactions, today, makeId = newId) {
  const have = new Set(transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`));
  const added = [];
  const next = recurring.map((item) => {
    if (!item.lastRun) return { ...item, lastRun: today };
    if (item.lastRun >= today) return item;
    for (let ym = monthOf(item.lastRun); ym <= monthOf(today); ym = addMonths(ym, 1)) {
      const [y, m] = parts(ym);
      const date = `${ym}-${pad(Math.min(item.dayOfMonth, daysInMonth(y, m)))}`;
      const key = `${item.id}|${date}`;
      if (date <= item.lastRun || date > today || have.has(key)) continue;
      have.add(key);
      added.push({
        id: makeId(), date, type: item.type, amount: item.amount,
        categoryId: item.categoryId, walletId: item.walletId,
        note: item.note || '', recurringId: item.id,
      });
    }
    return { ...item, lastRun: today };
  });
  return { added, recurring: next };
}

// ---------- จำลองการลงทุน ----------

/** ทบต้นรายเดือน ค่าธรรมเนียมหักจากผลตอบแทน; คืนค่ามูลค่าทุกสิ้นปี */
export function simulate({ initial, monthly, years, rate, fee }) {
  const m = (rate - fee) / 100 / 12;
  let v = initial;
  const yearly = [round2(v)];
  for (let y = 1; y <= years; y++) {
    for (let k = 0; k < 12; k++) v = v * (1 + m) + monthly;
    yearly.push(round2(v));
  }
  return { yearly, end: yearly[yearly.length - 1] };
}
export function invested(initial, monthly, years) {
  return round2(initial + monthly * 12 * years);
}
export function feeLoss(params) {
  return round2(simulate({ ...params, fee: 0 }).end - simulate(params).end);
}
/** ตก x (0–1) ต้องขึ้นกี่เท่าถึงจะกลับมาเท่าเดิม */
export function recoveryNeeded(drop) {
  return drop >= 1 ? Infinity : 1 / (1 - drop) - 1;
}

// ---------- ค่าเงิน ----------

export function thbToUsd(thb, rate) {
  return rate > 0 ? round2(thb / rate) : 0;
}
export function usdToThb(usd, rate) {
  return round2(usd * rate);
}
export function fxChange(history) {
  if (!history || history.length < 2) return 0;
  const first = history[0].rate;
  const last = history[history.length - 1].rate;
  return first > 0 ? (last - first) / first : 0;
}
export function fxIsFresh(fetchedAt, now) {
  return fetchedAt != null && now - fetchedAt < 6 * HOUR;
}

// ---------- ข้อมูลกราฟ ----------

/** เงินทั้งหมดรายวัน จาก from ถึง to (รวมทั้งสองวัน) */
export function balanceSeries(state, from, to) {
  const delta = {};
  for (const t of state.transactions) {
    if (t.type === 'in') delta[t.date] = (delta[t.date] || 0) + t.amount;
    else if (t.type === 'out') delta[t.date] = (delta[t.date] || 0) - t.amount;
  }
  let total = state.wallets.reduce((s, w) => s + (Number(w.start) || 0), 0);
  for (const [d, v] of Object.entries(delta)) if (d < from) total += v;
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    total += delta[d] || 0;
    out.push({ date: d, total: round2(total) });
  }
  return out;
}
/** รายจ่ายรายวัน n วันล่าสุด จนถึง end */
export function dailySpend(transactions, end, days) {
  const byDay = {};
  for (const t of transactions) if (t.type === 'out') byDay[t.date] = (byDay[t.date] || 0) + t.amount;
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(end, -i);
    out.push({ date, amount: round2(byDay[date] || 0) });
  }
  return out;
}
/** รายการของเดือน ym แบ่งตามวัน: วันใหม่สุดก่อน ในวันเดียวกันรายการที่จดทีหลังขึ้นก่อน */
export function groupByDay(transactions, ym) {
  const days = new Map();
  for (let i = transactions.length - 1; i >= 0; i--) {
    const t = transactions[i];
    if (monthOf(t.date) !== ym) continue;
    if (!days.has(t.date)) days.set(t.date, []);
    days.get(t.date).push(t);
  }
  return [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, items]) => ({ date, items }));
}

/** กระเป๋าที่ใช้ล่าสุดกับรายการประเภทนี้ (ไม่นับที่แอพลงให้เอง) ไม่มีก็ใช้ใบแรก */
export function lastWalletFor(transactions, type, wallets) {
  for (let i = transactions.length - 1; i >= 0; i--) {
    const t = transactions[i];
    if (t.type === type && !t.recurringId && wallets.some((w) => w.id === t.walletId)) return t.walletId;
  }
  return wallets[0]?.id || null;
}

/** วันที่รายการประจำจะลงครั้งถัดไป (หลังวัน after) */
export function nextOccurrence(dayOfMonth, after) {
  for (let ym = monthOf(after); ; ym = addMonths(ym, 1)) {
    const [y, m] = parts(ym);
    const date = `${ym}-${pad(Math.min(dayOfMonth, daysInMonth(y, m)))}`;
    if (date > after) return date;
  }
}

// ---------- หน้าหลัก + แผน ----------

/** วันที่ห่างไป n เดือน (วันเดิม; เดือนนั้นสั้นกว่าก็ใช้วันสุดท้ายของเดือน) */
export function addMonthsISO(iso, n) {
  const ym = addMonths(monthOf(iso), n);
  const [y, m] = ym.split('-').map(Number);
  const d = Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m));
  return `${ym}-${String(d).padStart(2, '0')}`;
}

/** ช่วงของกราฟเงินทั้งหมด (จำนวนเดือน) */
export const RANGES = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };

/**
 * จุดของกราฟเงินทั้งหมดในช่วงที่เลือก → { from, to, points: [{ date, total }], change }
 * ยังไม่มีรายรับ/รายจ่าย → null; ประวัติสั้นกว่าช่วง → เริ่มวันก่อนรายการแรก (= ยอดตั้งต้น)
 */
export function heroSeries(state, today, range) {
  let first = null;
  for (const t of state.transactions) {
    if ((t.type === 'in' || t.type === 'out') && (first === null || t.date < first)) first = t.date;
  }
  if (first === null) return null;
  const back = addMonthsISO(today, -(RANGES[range] || 6));
  const beforeFirst = addDays(first, -1);
  let from = back > beforeFirst ? back : beforeFirst;
  if (from >= today) from = addDays(today, -1); // รายการลงวันในอนาคต (จากไฟล์นำเข้า) ไม่ทำให้กราฟพัง
  const points = balanceSeries(state, from, today);
  return { from, to: today, points, change: round2(points[points.length - 1].total - points[0].total) };
}

/** แบ่ง 3 ช่องให้รวมได้ 100: ตั้งช่อง idx = v แล้วแบ่งที่เหลือให้อีก 2 ช่องตามสัดส่วนเดิม (จำนวนเต็ม) */
export function rebalance(values, idx, v) {
  const nv = Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
  const [a, b] = [0, 1, 2].filter((i) => i !== idx);
  const va0 = Number(values[a]) || 0;
  const vb0 = Number(values[b]) || 0;
  const rest = 100 - nv;
  const va = va0 + vb0 > 0 ? Math.round((rest * va0) / (va0 + vb0)) : Math.ceil(rest / 2);
  const out = [0, 0, 0];
  out[idx] = nv;
  out[a] = va;
  out[b] = rest - va;
  return out;
}

/** รายจ่ายของเดือนแยกตามหมวด เรียงมากไปน้อย (โดนัทหน้าหลัก) */
export function expenseBreakdown(transactions, categories, ym) {
  const items = Object.entries(categorySpend(transactions, ym))
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => {
      const c = categories.find((x) => x.id === id);
      return { id, name: c?.name || 'ไม่มีหมวด', color: c?.color || '#9AA1AC', amount };
    })
    .sort((x, y) => y.amount - x.amount);
  return { total: round2(items.reduce((s, i) => s + i.amount, 0)), items };
}

/** หมวดที่ใช้งบไปแล้ว ≥ 80% (หมวดที่ไม่ตั้งงบไม่เตือน) เรียงจากมากไปน้อย */
export function budgetAlerts(categories, spend) {
  return categories
    .filter((c) => c.type === 'out' && c.budget > 0)
    .map((c) => {
      const spent = spend[c.id] || 0;
      return { id: c.id, name: c.name, pct: budgetPct(spent, c.budget), over: spent > c.budget, overBy: round2(Math.max(spent - c.budget, 0)) };
    })
    .filter((x) => x.pct >= 80)
    .sort((x, y) => y.pct - x.pct);
}

/** การ์ด "เริ่มต้น 3 ขั้น" บนหน้าหลัก */
export function startSteps(state) {
  const entry = state.transactions.some((t) => t.type === 'in' || t.type === 'out');
  const budget = state.categories.some((c) => c.type === 'out' && c.budget > 0);
  const backup = Boolean(state.settings.lastExport);
  return { entry, budget, backup, done: [entry, budget, backup].filter(Boolean).length };
}

/** ตัวเลขของเป้าหมาย 1 อัน (§6) — เงินฉุกเฉินไม่มีวันครบกำหนด จึงไม่มี need/days */
export function goalStats(state, goal, today) {
  const saved = goalSaved(state, goal);
  const em = goal.kind === 'emergency';
  const target = em ? emergencyTarget(goal.multiplier || 3, state.transactions, today) : Number(goal.target) || 0;
  const days = em || !goal.deadline ? null : daysLeft(goal.deadline, today);
  const need = days === null ? null : needPerMonth(target, saved, days);
  const avgLeft = avgMonthlyLeft(state.transactions, today);
  const thisMonth = monthTotals(state.transactions, monthOf(today)).left;
  return {
    saved, target, progress: goalProgress(saved, target), days, need, avgLeft, thisMonth,
    gap: need === null ? null : round2(Math.max(need - avgLeft, 0)),
  };
}

/** เช็กลิสต์ข้อที่ติ๊กเอง: เงินฉุกเฉินครบ 100% และอ่านบทเรียนครบ */
export function checklistAuto(state, today, lessonCount = 12) {
  const em = state.goals.find((g) => g.kind === 'emergency');
  const st = em ? goalStats(state, em, today) : null;
  return {
    emergency: Boolean(st && st.target > 0 && st.saved >= st.target),
    lessons: (state.learn?.done?.length || 0) >= lessonCount,
  };
}

// ---------- เครื่องจำลอง: ค่าเริ่มต้น + 3 กรณี ----------

const SIM_BASE = { years: 6, fee: 0.5, rates: { bad: -5, mid: 6, good: 12 } };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const snap = (v, min, max, step) => Math.min(max, Math.max(min, Math.round(v / step) * step));

/** ค่าที่ใช้ในเครื่องจำลอง: ยังไม่เคยตั้ง → เงินก้อนแรก = เป้าแรก, เติมทุกเดือน = เงินเหลือเฉลี่ยต่อเดือน (ปัดตามขั้นสไลเดอร์) */
export function simDefaults(state, today) {
  const sim = state.sim || {};
  const g = state.goals.find((x) => x.id === 'g1') || state.goals.find((x) => x.kind !== 'emergency');
  return {
    initial: isNum(sim.initial) ? sim.initial : snap(Number(g?.target) || 0, 0, 200000, 1000),
    monthly: isNum(sim.monthly) ? sim.monthly : snap(avgMonthlyLeft(state.transactions, today), 0, 10000, 100),
    years: isNum(sim.years) ? sim.years : SIM_BASE.years,
    fee: isNum(sim.fee) ? sim.fee : SIM_BASE.fee,
    rates: Object.fromEntries(Object.entries(SIM_BASE.rates).map(([k, v]) => [k, isNum(sim.rates?.[k]) ? sim.rates[k] : v])),
  };
}

/** 3 กรณี (แย่/กลาง/ดี) + เงินที่ใส่ รายปี (ปีที่ 0 = ตอนนี้) และค่าธรรมเนียมที่ทำให้กรณีกลางได้น้อยลง */
export function simScenarios({ initial, monthly, years, fee, rates }) {
  const run = (rate) => simulate({ initial, monthly, years, rate, fee });
  const inv = [];
  for (let y = 0; y <= years; y++) inv.push(invested(initial, monthly, y));
  return {
    invested: inv, bad: run(rates.bad), mid: run(rates.mid), good: run(rates.good),
    feeLoss: feeLoss({ initial, monthly, years, rate: rates.mid, fee }),
  };
}
