// จดรายการ / แก้ / ลบ / ย้ายเงินเข้าเป้า / รายการของเดือนแบบแบ่งตามวัน
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, updateEntry, deleteEntry, addTransfer, defaultState } from '../app/store.js';
import { runRecurring, walletBalance, monthTotals, groupByDay, lastWalletFor } from '../app/calc.js';

const TODAY = '2026-11-14';
const ready = () => {
  const s = defaultState(TODAY);
  s.settings.onboarded = true;
  s.wallets[0].start = 860;
  return s;
};

test('addEntry saves a rounded entry and leaves the old state alone', () => {
  const s = ready();
  const r = addEntry(s, { type: 'out', amount: 65.004, categoryId: 'food', walletId: 'w1', date: TODAY, note: 'ข้าวกลางวัน' });
  assert.equal(s.transactions.length, 0);
  const t = r.state.transactions[0];
  assert.equal(t, r.tx);
  assert.equal(t.amount, 65);
  assert.equal(t.recurringId, null);
  assert.equal(t.note, 'ข้าวกลางวัน');
  assert.equal(walletBalance(r.state, 'w1'), 795);
});

test('monthly income entered on day 1 adds exactly 2 entries two months later', () => {
  const r = addEntry(ready(), { type: 'in', amount: 4500, categoryId: 'allowance', walletId: 'w2', date: '2026-11-01', note: '' }, { repeat: true });
  assert.equal(r.state.recurring.length, 1);
  const item = r.state.recurring[0];
  assert.equal(item.dayOfMonth, 1);
  assert.equal(item.lastRun, '2026-11-01');
  assert.equal(item.note, 'ค่าขนม');
  assert.equal(r.tx.recurringId, item.id);
  let n = 0;
  const run = runRecurring(r.state.recurring, r.state.transactions, '2027-01-01', () => `x${++n}`);
  assert.deepEqual(run.added.map((t) => t.date), ['2026-12-01', '2027-01-01']);
});

test('repeat monthly only applies to income', () => {
  const r = addEntry(ready(), { type: 'out', amount: 50, categoryId: 'food', walletId: 'w1', date: TODAY }, { repeat: true });
  assert.equal(r.state.recurring.length, 0);
  assert.equal(r.tx.recurringId, null);
});

test('updateEntry and deleteEntry change only that entry', () => {
  let s = addEntry(ready(), { type: 'out', amount: 65, categoryId: 'food', walletId: 'w1', date: TODAY }).state;
  s = addEntry(s, { type: 'out', amount: 16, categoryId: 'travel', walletId: 'w1', date: TODAY }).state;
  const [a, b] = s.transactions;
  const u = updateEntry(s, a.id, { amount: 70.504, note: 'ข้าว + น้ำ' });
  assert.equal(u.transactions[0].amount, 70.5);
  assert.equal(u.transactions[0].note, 'ข้าว + น้ำ');
  assert.equal(u.transactions[1].amount, 16);
  assert.equal(s.transactions[0].amount, 65);
  const d = deleteEntry(u, a.id);
  assert.deepEqual(d.transactions.map((t) => t.id), [b.id]);
});

test('saving to the goal moves money between wallets and is not income or expense', () => {
  const r = addTransfer(ready(), { fromWalletId: 'w1', toWalletId: 'w2', amount: 500, date: TODAY });
  assert.equal(r.ok, true);
  assert.equal(walletBalance(r.state, 'w1'), 360);
  assert.equal(walletBalance(r.state, 'w2'), 500);
  assert.deepEqual(monthTotals(r.state.transactions, '2026-11'), { income: 0, expense: 0, left: 0, savingsRate: 0 });
  assert.equal(r.state.transactions[0].type, 'transfer');
  assert.equal(r.state.transactions[0].note, 'ออมเข้าเป้า');
});

test('a transfer above the from-wallet balance, zero, or to the same wallet is blocked', () => {
  const s = ready();
  assert.equal(addTransfer(s, { fromWalletId: 'w1', toWalletId: 'w2', amount: 860.01, date: TODAY }).ok, false);
  assert.equal(addTransfer(s, { fromWalletId: 'w1', toWalletId: 'w2', amount: 0, date: TODAY }).ok, false);
  assert.equal(addTransfer(s, { fromWalletId: 'w1', toWalletId: 'w1', amount: 10, date: TODAY }).ok, false);
  assert.equal(addTransfer(s, { fromWalletId: 'w1', toWalletId: 'w2', amount: 860, date: TODAY }).ok, true);
  assert.equal(s.transactions.length, 0);
});

test('groupByDay lists one month, newest day first and newest entry first within a day', () => {
  const tx = [
    { id: 'a', date: '2026-11-01', type: 'in', amount: 4500 },
    { id: 'b', date: '2026-11-13', type: 'out', amount: 120 },
    { id: 'c', date: '2026-11-14', type: 'out', amount: 65 },
    { id: 'd', date: '2026-10-31', type: 'out', amount: 10 },
    { id: 'e', date: '2026-11-13', type: 'out', amount: 55 },
    { id: 'f', date: '2026-11-14', type: 'out', amount: 16 },
  ];
  assert.deepEqual(groupByDay(tx, '2026-11').map((g) => [g.date, g.items.map((t) => t.id)]),
    [['2026-11-14', ['f', 'c']], ['2026-11-13', ['e', 'b']], ['2026-11-01', ['a']]]);
  assert.deepEqual(groupByDay(tx, '2026-09'), []);
});

test('lastWalletFor uses the newest typed entry of that type, skipping automatic ones', () => {
  const wallets = [{ id: 'w1' }, { id: 'w2' }];
  const tx = [
    { id: 'a', type: 'out', walletId: 'w2' },
    { id: 'b', type: 'in', walletId: 'w1' },
    { id: 'c', type: 'out', walletId: 'w1', recurringId: 'r1' },
  ];
  assert.equal(lastWalletFor(tx, 'out', wallets), 'w2');
  assert.equal(lastWalletFor(tx, 'in', wallets), 'w1');
  assert.equal(lastWalletFor([], 'out', wallets), 'w1');
  assert.equal(lastWalletFor([{ id: 'x', type: 'out', walletId: 'gone' }], 'out', wallets), 'w1');
});
