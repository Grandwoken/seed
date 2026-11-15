// หน้าหลัก + แผน: กราฟเงินทั้งหมด, โดนัท, เตือนงบ, การ์ดเริ่มต้น, เป้าหมาย, แบ่งเงิน, เช็กลิสต์, แคชค่าเงิน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heroSeries, addMonthsISO, rebalance, expenseBreakdown, budgetAlerts, startSteps, goalStats, checklistAuto, categorySpend,
} from '../app/calc.js';
import { defaultState, migrate, addGoal, updateGoal, deleteGoal, setAllocation, setChecklist } from '../app/store.js';
import { readFxCache, FX_KEY } from '../app/fx.js';

const TODAY = '2026-11-14';
const tx = (id, date, type, amount, categoryId = type === 'in' ? 'allowance' : 'food', walletId = 'w1') =>
  ({ id, date, type, amount, categoryId, walletId, note: '', recurringId: null });
const transfer = (id, date, amount) => ({ id, date, type: 'transfer', amount, fromWalletId: 'w1', toWalletId: 'w2', note: 'ออมเข้าเป้า' });

function makeState(transactions = []) {
  const s = defaultState('2026-09-01');
  s.settings.onboarded = true;
  s.wallets[0].start = 1000;
  s.wallets[1].start = 5000;
  s.transactions = transactions;
  return s;
}

// ---------- กราฟเงินทั้งหมด ----------

test('the balance chart stays empty until the first income or expense', () => {
  assert.equal(heroSeries(makeState(), TODAY, '6m'), null);
  assert.equal(heroSeries(makeState([transfer('a', '2026-11-10', 300)]), TODAY, '6m'), null);
});

test('a short history starts the chart the day before the first entry', () => {
  const s = makeState([tx('a', '2026-11-10', 'out', 100), tx('b', '2026-11-12', 'in', 500)]);
  const h = heroSeries(s, TODAY, '6m');
  assert.equal(h.from, '2026-11-09');
  assert.equal(h.to, TODAY);
  assert.equal(h.points.length, 6);
  assert.equal(h.points[0].total, 6000);
  assert.equal(h.points.at(-1).total, 6400);
  assert.equal(h.change, 400);
});

test('a long history starts the chart one range back', () => {
  const s = makeState([tx('a', '2026-01-05', 'in', 1000), tx('b', '2026-10-20', 'out', 200)]);
  const h = heroSeries(s, TODAY, '1m');
  assert.equal(h.from, '2026-10-14');
  assert.equal(h.points[0].total, 7000);
  assert.equal(h.change, -200);
  assert.equal(heroSeries(s, TODAY, '1y').from, '2026-01-04');
});

test('transfers never move the total-money line', () => {
  const s = makeState([tx('a', '2026-11-10', 'in', 500), transfer('t', '2026-11-12', 300)]);
  const h = heroSeries(s, TODAY, '1m');
  assert.equal(h.points.at(-1).total, 6500);
});

test('addMonthsISO keeps the day and clamps to the month length', () => {
  assert.equal(addMonthsISO('2026-11-14', -1), '2026-10-14');
  assert.equal(addMonthsISO('2026-03-31', -1), '2026-02-28');
  assert.equal(addMonthsISO('2026-11-14', -12), '2025-11-14');
});

// ---------- แบ่งเงินตอนเปิดบัญชี ----------

test('moving one allocation slider rebalances the other two to keep 100', () => {
  assert.deepEqual(rebalance([0, 0, 100], 0, 30), [30, 0, 70]);
  assert.deepEqual(rebalance([34, 33, 33], 2, 50), [25, 25, 50]);
  assert.deepEqual(rebalance([0, 0, 100], 2, 40), [30, 30, 40]);
  assert.deepEqual(rebalance([20, 30, 50], 1, 120), [0, 100, 0]);
  assert.deepEqual(rebalance([20, 30, 50], 1, -10), [29, 0, 71]);
  let v = [10, 20, 70];
  for (let i = 0; i < 60; i++) {
    v = rebalance(v, i % 3, (i * 37) % 101);
    assert.equal(v.reduce((a, b) => a + b, 0), 100, `sum after step ${i}: ${v}`);
    assert.ok(v.every((x) => Number.isInteger(x) && x >= 0), `whole numbers ≥ 0: ${v}`);
  }
});

// ---------- จ่ายไปกับอะไร ----------

test('spending breakdown is sorted and ignores transfers, income and other months', () => {
  const s = makeState([
    tx('a', '2026-11-02', 'out', 80, 'food'), tx('b', '2026-11-03', 'out', 210, 'fun'), tx('c', '2026-11-05', 'out', 50, 'food'),
    tx('d', '2026-10-30', 'out', 60, 'travel'), transfer('t', '2026-11-06', 300), tx('e', '2026-11-01', 'in', 4500),
    tx('f', '2026-11-07', 'out', 25, 'gone'),
  ]);
  const b = expenseBreakdown(s.transactions, s.categories, '2026-11');
  assert.equal(b.total, 365);
  assert.deepEqual(b.items.map((i) => [i.id, i.amount]), [['fun', 210], ['food', 130], ['gone', 25]]);
  assert.equal(b.items[0].name, 'เกม/บันเทิง');
  assert.equal(b.items[2].name, 'ไม่มีหมวด');
});

test('budget alerts start at 80% and skip categories without a budget', () => {
  const s = makeState([
    tx('a', '2026-11-02', 'out', 1700, 'food'), tx('b', '2026-11-03', 'out', 600, 'fun'),
    tx('c', '2026-11-04', 'out', 300, 'travel'), tx('d', '2026-11-05', 'out', 600, 'study'),
  ]);
  for (const [id, budget] of [['food', 2000], ['fun', 500], ['travel', 0], ['study', 800]]) s.categories.find((c) => c.id === id).budget = budget;
  const alerts = budgetAlerts(s.categories, categorySpend(s.transactions, '2026-11'));
  assert.deepEqual(alerts.map((a) => [a.id, a.pct, a.over]), [['fun', 120, true], ['food', 85, false]]);
  assert.equal(alerts[0].overBy, 100);
});

// ---------- เริ่มต้น 3 ขั้น ----------

test('the three start steps tick themselves', () => {
  const s = makeState();
  assert.deepEqual(startSteps(s), { entry: false, budget: false, backup: false, done: 0 });
  s.transactions = [transfer('t', '2026-11-10', 100)];
  assert.equal(startSteps(s).entry, false, 'moving money is not a first entry');
  s.transactions.push(tx('a', '2026-11-10', 'out', 65));
  s.categories[0].budget = 2000;
  s.settings.lastExport = '2026-11-14';
  assert.deepEqual(startSteps(s), { entry: true, budget: true, backup: true, done: 3 });
});

// ---------- เป้าหมาย ----------

test('first-money goal numbers follow the section 6 formulas', () => {
  const s = makeState([tx('a', '2026-11-01', 'in', 4500, 'allowance', 'w2'), tx('b', '2026-11-03', 'out', 1000)]);
  s.goals[0].deadline = '2027-03-14'; // 14 พ.ย. → 14 มี.ค. = 16 + 31 + 31 + 28 + 14 = 120 วัน
  const g = goalStats(s, s.goals[0], TODAY);
  assert.equal(g.saved, 9500);
  assert.equal(g.target, 30000);
  assert.equal(g.days, 120);
  // (30,000 − 9,500) ÷ (120 ÷ 30.44 เดือน) = 5,200.17 → ปัดขึ้นทีละ 10 = 5,210
  assert.equal(g.need, 5210);
  assert.equal(g.avgLeft, 3500);
  assert.equal(g.thisMonth, 3500);
  assert.equal(g.gap, 1710);
  assert.ok(Math.abs(g.progress - 9500 / 30000) < 1e-9);
});

test('emergency goal target is 3 × the average expense of the last 3 full months', () => {
  const s = makeState([
    tx('a', '2026-08-10', 'out', 900), tx('b', '2026-09-10', 'out', 1200), tx('c', '2026-10-10', 'out', 1500), tx('d', '2026-11-10', 'out', 100),
  ]);
  const g = goalStats(s, s.goals.find((x) => x.kind === 'emergency'), TODAY);
  assert.equal(g.target, 3600);
  assert.equal(g.saved, 0);
  assert.equal(g.progress, 0);
  assert.equal(g.need, null);
  assert.equal(g.days, null);
});

test('checklist items 4 and 5 tick themselves', () => {
  const s = makeState();
  assert.deepEqual(checklistAuto(s, TODAY), { emergency: false, lessons: false }, 'no expenses yet → emergency target 0 is not "done"');
  s.transactions = [tx('a', '2026-11-03', 'out', 1000)];
  s.goals.find((g) => g.kind === 'emergency').walletIds = ['w1'];
  assert.equal(checklistAuto(s, TODAY).emergency, false, 'w1 has 0 left, target 3,000');
  s.wallets[0].start = 5000;
  assert.equal(checklistAuto(s, TODAY).emergency, true, 'w1 has 4,000 ≥ 3,000');
  s.learn.done = Array.from({ length: 12 }, (_, i) => `lesson-${i + 1}`);
  assert.equal(checklistAuto(s, TODAY).lessons, true);
});

test('a new goal gets an id, 2-decimal rounding and its own wallets', () => {
  const s = makeState();
  const r = addGoal(s, { name: 'มือถือใหม่', target: 12000.555, deadline: '2027-12-31', walletIds: ['w1'] });
  assert.match(r.goal.id, /^g_/);
  assert.equal(r.goal.kind, 'custom');
  assert.equal(r.goal.target, 12000.56);
  assert.equal(r.state.goals.length, 3);
  assert.equal(s.goals.length, 2, 'old state is not changed');
});

test('editing the first goal deadline also moves the account date', () => {
  const s = updateGoal(makeState(), 'g1', { deadline: '2027-06-01', target: 25000 });
  assert.equal(s.settings.accountDate, '2027-06-01');
  assert.equal(s.goals[0].deadline, '2027-06-01');
  assert.equal(s.goals[0].target, 25000);
});

test('emergency multiplier stays between 1 and 12', () => {
  assert.equal(updateGoal(makeState(), 'g_em', { multiplier: 40 }).goals[1].multiplier, 12);
  assert.equal(updateGoal(makeState(), 'g_em', { multiplier: 0 }).goals[1].multiplier, 1);
});

test('the first goal and the emergency goal cannot be deleted; extra goals can', () => {
  const s = makeState();
  assert.equal(deleteGoal(s, 'g1').goals.length, 2);
  assert.equal(deleteGoal(s, 'g_em').goals.length, 2);
  const { state, goal } = addGoal(s, { name: 'ทริป', target: 5000, deadline: '2027-03-01', walletIds: [] });
  assert.equal(deleteGoal(state, goal.id).goals.length, 2);
});

test('allocation must be whole numbers that add up to 100', () => {
  const s = makeState();
  assert.deepEqual(setAllocation(s, { stock: 20, fund: 50, cash: 30 }).allocation, { stock: 20, fund: 50, cash: 30 });
  assert.throws(() => setAllocation(s, { stock: 20, fund: 50, cash: 40 }));
  assert.throws(() => setAllocation(s, { stock: 20.5, fund: 49.5, cash: 30 }));
  assert.equal(setAllocation(s, null).allocation, null);
});

test('migrate drops a broken allocation and keeps a valid one', () => {
  assert.equal(migrate({ allocation: { stock: 'x' } }, TODAY).allocation, null);
  assert.deepEqual(migrate({ allocation: { stock: 10, fund: 20, cash: 70 } }, TODAY).allocation, { stock: 10, fund: 20, cash: 70 });
});

test('checklist only stores known items and trims the note', () => {
  const s = setChecklist(makeState(), { talkParent: true, hacked: 1, whyNote: '  ถือยาว 6 ปี  ' });
  assert.equal(s.checklist.talkParent, true);
  assert.equal('hacked' in s.checklist, false);
  assert.equal(s.checklist.whyNote, 'ถือยาว 6 ปี');
});

// ---------- แคชค่าเงิน ----------

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('FX cache: missing or broken → null, valid → used', () => {
  assert.equal(readFxCache(memoryStorage()), null);
  assert.equal(readFxCache(memoryStorage({ [FX_KEY]: '{bad' })), null);
  assert.equal(readFxCache(memoryStorage({ [FX_KEY]: JSON.stringify({ fetchedAt: 1, date: '2026-11-13', rate: -1 }) })), null);
  const good = { fetchedAt: 1763000000000, date: '2026-11-13', rate: 32.85, history: [{ date: '2026-11-12', rate: 32.9 }, { date: '2026-11-13', rate: 32.85 }] };
  assert.deepEqual(readFxCache(memoryStorage({ [FX_KEY]: JSON.stringify(good) })), good);
  const noHistory = readFxCache(memoryStorage({ [FX_KEY]: JSON.stringify({ ...good, history: 'x' }) }));
  assert.deepEqual(noHistory.history, []);
});
