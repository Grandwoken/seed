import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  round2, daysLeft, monthsLeft, needPerMonth,
  walletBalance, totalBalance, goalSaved, monthTotals, categorySpend,
  avgMonthlyLeft, emergencyTarget, budgetPct,
  runRecurring, simulate, invested, feeLoss, recoveryNeeded,
  thbToUsd, usdToThb, fxChange, fxIsFresh,
  balanceSeries, dailySpend,
} from '../app/calc.js';

const near = (actual, expected, tol = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ≈${expected}, got ${actual}`);

let n = 0;
const ids = () => `id${++n}`;

// ---------- วันที่และเป้า ----------

test('daysLeft counts calendar days to the deadline', () => {
  assert.equal(daysLeft('2027-11-14', '2026-11-14'), 365);
  assert.equal(daysLeft('2026-11-15', '2026-11-14'), 1);
});

test('daysLeft is 0 on the deadline and after it', () => {
  assert.equal(daysLeft('2026-11-14', '2026-11-14'), 0);
  assert.equal(daysLeft('2026-01-01', '2026-11-14'), 0);
});

test('monthsLeft never goes below half a month', () => {
  near(monthsLeft(166), 5.4534, 0.0001);
  assert.equal(monthsLeft(0), 0.5);
  assert.equal(monthsLeft(10), 0.5);
});

test('needPerMonth rounds up to the next 10 baht', () => {
  // 18,460 left over 166 days (5.4534 months) = 3,385.07 → 3,390
  assert.equal(needPerMonth(30000, 11540, 166), 3390);
});

test('needPerMonth with a past deadline uses the 0.5-month floor', () => {
  assert.equal(needPerMonth(30000, 10000, 0), 40000);
});

test('needPerMonth is 0 once the goal is reached', () => {
  assert.equal(needPerMonth(30000, 31000, 100), 0);
});

// ---------- กระเป๋าเงินและรายเดือน ----------

const base = () => ({
  wallets: [{ id: 'w1', name: 'เงินสด', start: 100 }, { id: 'w2', name: 'ออม', start: 0 }],
  transactions: [
    { id: 't1', date: '2026-11-02', type: 'in', amount: 500, categoryId: 'allowance', walletId: 'w1' },
    { id: 't2', date: '2026-11-03', type: 'out', amount: 65, categoryId: 'food', walletId: 'w1' },
  ],
});
const transfer = { id: 't3', date: '2026-11-04', type: 'transfer', amount: 200, fromWalletId: 'w1', toWalletId: 'w2' };

test('a transfer changes two wallet balances', () => {
  const s = base();
  assert.equal(walletBalance(s, 'w1'), 535);
  assert.equal(walletBalance(s, 'w2'), 0);
  s.transactions.push(transfer);
  assert.equal(walletBalance(s, 'w1'), 335);
  assert.equal(walletBalance(s, 'w2'), 200);
  assert.equal(totalBalance(s), 535);
});

test('a transfer does not change month income or expense', () => {
  const s = base();
  s.transactions.push(transfer);
  assert.deepEqual(monthTotals(s.transactions, '2026-11'), { income: 500, expense: 65, left: 435, savingsRate: 0.87 });
  assert.deepEqual(categorySpend(s.transactions, '2026-11'), { food: 65 });
});

test('savings rate is 0 when there is no income', () => {
  const tx = [{ id: 'a', date: '2026-11-03', type: 'out', amount: 65, categoryId: 'food', walletId: 'w1' }];
  assert.deepEqual(monthTotals(tx, '2026-11'), { income: 0, expense: 65, left: -65, savingsRate: 0 });
});

test('month totals ignore other months', () => {
  const tx = [
    { id: 'a', date: '2026-10-31', type: 'in', amount: 999, categoryId: 'x', walletId: 'w1' },
    { id: 'b', date: '2026-11-01', type: 'in', amount: 100, categoryId: 'x', walletId: 'w1' },
  ];
  assert.equal(monthTotals(tx, '2026-11').income, 100);
});

test('wallet balances have no float noise', () => {
  const s = {
    wallets: [{ id: 'w1', start: 0 }],
    transactions: [
      { id: 'a', date: '2026-11-01', type: 'in', amount: 10.1, walletId: 'w1' },
      { id: 'b', date: '2026-11-01', type: 'in', amount: 20.2, walletId: 'w1' },
    ],
  };
  assert.equal(walletBalance(s, 'w1'), 30.3);
  assert.equal(round2(1.005 + 0.001), 1.01);
});

test('goal saved is the sum of its linked wallets', () => {
  const s = base();
  s.transactions.push(transfer);
  assert.equal(goalSaved(s, { walletIds: ['w2'] }), 200);
  assert.equal(goalSaved(s, { walletIds: ['w1', 'w2'] }), 535);
  assert.equal(goalSaved(s, { walletIds: [] }), 0);
});

// ---------- ค่าเฉลี่ย 3 เดือน ----------

const history = [
  { id: 'a1', date: '2026-08-05', type: 'in', amount: 1000, categoryId: 'x', walletId: 'w1' },
  { id: 'a2', date: '2026-08-20', type: 'out', amount: 400, categoryId: 'food', walletId: 'w1' },
  { id: 'b1', date: '2026-09-05', type: 'in', amount: 1000, categoryId: 'x', walletId: 'w1' },
  { id: 'b2', date: '2026-09-20', type: 'out', amount: 700, categoryId: 'food', walletId: 'w1' },
  { id: 'c1', date: '2026-10-05', type: 'in', amount: 1000, categoryId: 'x', walletId: 'w1' },
  { id: 'c2', date: '2026-10-20', type: 'out', amount: 100, categoryId: 'food', walletId: 'w1' },
  { id: 'd1', date: '2026-11-02', type: 'in', amount: 500, categoryId: 'x', walletId: 'w1' },
];

test('avgMonthlyLeft averages the last 3 full months', () => {
  assert.equal(avgMonthlyLeft(history, '2026-11-14'), 600);
});

test('avgMonthlyLeft falls back to this month when there is no full month yet', () => {
  const tx = [
    { id: 'x', date: '2026-11-02', type: 'in', amount: 500, categoryId: 'x', walletId: 'w1' },
    { id: 'y', date: '2026-11-03', type: 'out', amount: 65, categoryId: 'food', walletId: 'w1' },
  ];
  assert.equal(avgMonthlyLeft(tx, '2026-11-14'), 435);
});

test('avgMonthlyLeft skips months before the first entry', () => {
  // started in October: only October counts, not two empty months before it
  assert.equal(avgMonthlyLeft(history.slice(4), '2026-11-14'), 900);
});

test('emergency target is the multiplier times the average monthly expense', () => {
  assert.equal(emergencyTarget(3, history, '2026-11-14'), 1200);
});

test('budgetPct handles a zero budget without dividing by zero', () => {
  assert.equal(budgetPct(450, 500), 90);
  assert.equal(budgetPct(81, 100), 81);
  assert.equal(budgetPct(100, 0), null);
  assert.equal(budgetPct(0, 0), null);
});

// ---------- รายการประจำ ----------

const monthly = (over = {}) => ({
  id: 'r1', type: 'in', amount: 4500, categoryId: 'allowance', walletId: 'w2',
  dayOfMonth: 1, note: 'ค่าขนมรายเดือน', lastRun: '2026-08-01', ...over,
});

test('recurring catch-up after 3 missed months adds exactly 3', () => {
  const r = runRecurring([monthly()], [], '2026-11-14', ids);
  assert.deepEqual(r.added.map((t) => t.date), ['2026-09-01', '2026-10-01', '2026-11-01']);
  const t = r.added[0];
  assert.equal(t.type, 'in');
  assert.equal(t.amount, 4500);
  assert.equal(t.walletId, 'w2');
  assert.equal(t.categoryId, 'allowance');
  assert.equal(t.recurringId, 'r1');
  assert.equal(t.note, 'ค่าขนมรายเดือน');
  assert.equal(r.recurring[0].lastRun, '2026-11-14');
});

test('a second recurring run on the same day adds nothing', () => {
  const first = runRecurring([monthly()], [], '2026-11-14', ids);
  const second = runRecurring(first.recurring, first.added, '2026-11-14', ids);
  assert.equal(second.added.length, 0);
});

test('day 31 falls on the last day of February', () => {
  const r = runRecurring([monthly({ dayOfMonth: 31, lastRun: '2027-01-31' })], [], '2027-03-31', ids);
  assert.deepEqual(r.added.map((t) => t.date), ['2027-02-28', '2027-03-31']);
  const leap = runRecurring([monthly({ dayOfMonth: 31, lastRun: '2028-01-31' })], [], '2028-03-01', ids);
  assert.deepEqual(leap.added.map((t) => t.date), ['2028-02-29']);
});

test('moving the date forward 2 months adds exactly 2 entries', () => {
  const r = runRecurring([monthly({ lastRun: '2026-11-01' })], [], '2027-01-01', ids);
  assert.deepEqual(r.added.map((t) => t.date), ['2026-12-01', '2027-01-01']);
});

test('recurring never duplicates an entry that already exists', () => {
  const existing = [{ id: 'old', date: '2026-11-01', type: 'in', amount: 4500, walletId: 'w2', recurringId: 'r1' }];
  const r = runRecurring([monthly({ lastRun: '2026-10-01' })], existing, '2026-11-14', ids);
  assert.equal(r.added.length, 0);
  assert.equal(r.recurring[0].lastRun, '2026-11-14');
});

test('a recurring item with no lastRun starts from today', () => {
  const r = runRecurring([monthly({ lastRun: null })], [], '2026-11-14', ids);
  assert.equal(r.added.length, 0);
  assert.equal(r.recurring[0].lastRun, '2026-11-14');
});

// ---------- จำลอง ----------

test('simulator with 0 return equals money put in', () => {
  const r = simulate({ initial: 1000, monthly: 100, years: 2, rate: 0, fee: 0 });
  assert.deepEqual(r.yearly, [1000, 2200, 3400]);
  assert.equal(r.end, invested(1000, 100, 2));
  assert.equal(invested(1000, 100, 2), 3400);
});

test('simulator compounds monthly with the fee taken from the return', () => {
  // 1000 * 1.01^12 + 100 * (1.01^12 - 1) / 0.01 = 2395.08
  near(simulate({ initial: 1000, monthly: 100, years: 1, rate: 12, fee: 0 }).end, 2395.08);
  // (12 - 2)% a year: 1000 * (1+0.1/12)^12 + 100 * ((1+0.1/12)^12 - 1) / (0.1/12) = 2361.27
  near(simulate({ initial: 1000, monthly: 100, years: 1, rate: 12, fee: 2 }).end, 2361.27);
});

test('fee loss is 0 when the fee is 0', () => {
  assert.equal(feeLoss({ initial: 30000, monthly: 1500, years: 6, rate: 6, fee: 0 }), 0);
});

test('fee loss is the gap between no fee and the chosen fee', () => {
  near(feeLoss({ initial: 1000, monthly: 100, years: 1, rate: 12, fee: 2 }), 33.81);
});

test('recovery needed after a drop', () => {
  near(recoveryNeeded(0.3), 0.428571, 0.000001);
  assert.equal(Math.round(recoveryNeeded(0.3) * 100), 43);
  assert.equal(recoveryNeeded(0.5), 1);
});

// ---------- ค่าเงิน ----------

test('FX converts both ways', () => {
  near(thbToUsd(30000, 32.85), 913.24);
  assert.equal(usdToThb(100, 32.85), 3285);
});

test('FX change is measured from the first to the last rate', () => {
  assert.equal(fxChange([{ date: '2026-10-14', rate: 32 }, { date: '2026-11-13', rate: 33 }]), 0.03125);
  assert.equal(fxChange([{ date: '2026-11-13', rate: 33 }]), 0);
  assert.equal(fxChange([]), 0);
});

test('FX cache is fresh for 6 hours', () => {
  const now = Date.UTC(2026, 10, 14, 12);
  const h = 3600 * 1000;
  assert.equal(fxIsFresh(now - 5 * h, now), true);
  assert.equal(fxIsFresh(now - 7 * h, now), false);
  assert.equal(fxIsFresh(null, now), false);
});

// ---------- กราฟ ----------

test('balance series carries the total forward day by day', () => {
  const s = base();
  s.transactions.push(transfer);
  assert.deepEqual(balanceSeries(s, '2026-11-01', '2026-11-05').map((p) => p.total), [100, 600, 535, 535, 535]);
});

test('daily spend counts only expenses per day', () => {
  const s = base();
  s.transactions.push(transfer);
  assert.deepEqual(dailySpend(s.transactions, '2026-11-05', 5).map((d) => d.amount), [0, 0, 65, 0, 0]);
});

import { nextOccurrence } from '../app/calc.js';

test('next occurrence of a monthly item comes after the given date', () => {
  assert.equal(nextOccurrence(1, '2026-11-14'), '2026-12-01');
  assert.equal(nextOccurrence(20, '2026-11-14'), '2026-11-20');
  assert.equal(nextOccurrence(14, '2026-11-14'), '2026-12-14');
  assert.equal(nextOccurrence(31, '2027-01-31'), '2027-02-28');
});
