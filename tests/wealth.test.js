// หนี้ / ทรัพย์สิน / ทรัพย์สินสุทธิ / ส่งออก CSV
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState, migrate, parseBackup, exportBackup, addEntry, addTransfer,
  addDebt, updateDebt, deleteDebt, payDebt, addAsset, updateAsset, deleteAsset, logNetWorth, DEBT_CATEGORY,
} from '../app/store.js';
import { walletBalance } from '../app/calc.js';
import { netWorth, payoffMonths, monthlyInterest, toCSV } from '../app/wealth.js';

const TODAY = '2026-11-18';
const ready = () => {
  const s = defaultState(TODAY);
  s.settings.onboarded = true;
  s.wallets[0].start = 2000; // เงินสด
  s.wallets[1].start = 10000; // ออมทรัพย์
  return s;
};

// ---------- หนี้ ----------

test('new state and old data both get empty debts, assets and net worth log', () => {
  const d = defaultState(TODAY);
  assert.deepEqual([d.debts, d.assets, d.netWorthLog], [[], [], []]);
  const m = migrate({ settings: {}, wallets: [], transactions: [] }, TODAY);
  assert.deepEqual([m.debts, m.assets, m.netWorthLog], [[], [], []]);
});

test('addDebt stores a cleaned debt; bad input is refused', () => {
  const r = addDebt(ready(), { name: ' บัตรเครดิต ', kind: 'card', balance: 5000.004, rate: 16, minPay: 500, dueDay: 25 });
  assert.equal(r.ok, true);
  const d = r.state.debts[0];
  assert.equal(d.name, 'บัตรเครดิต');
  assert.equal(d.balance, 5000);
  assert.deepEqual([d.kind, d.rate, d.minPay, d.dueDay], ['card', 16, 500, 25]);
  assert.equal(addDebt(ready(), { name: '', balance: 10 }).ok, false);
  assert.equal(addDebt(ready(), { name: 'x', balance: -1 }).ok, false);
  assert.equal(addDebt(ready(), { name: 'x', balance: 10, rate: 200 }).ok, false);
  assert.equal(addDebt(ready(), { name: 'x', balance: 10, dueDay: 32 }).ok, false);
});

test('payDebt records an expense from the wallet and lowers the debt', () => {
  let s = addDebt(ready(), { name: 'ผ่อนมือถือ', kind: 'loan', balance: 3000, rate: 0, minPay: 1000, dueDay: 5 }).state;
  const id = s.debts[0].id;
  const r = payDebt(s, { debtId: id, walletId: 'w1', amount: 1000, date: TODAY });
  assert.equal(r.ok, true);
  s = r.state;
  assert.equal(s.debts[0].balance, 2000);
  assert.equal(walletBalance(s, 'w1'), 1000);
  const t = s.transactions.at(-1);
  assert.deepEqual([t.type, t.amount, t.categoryId, t.debtId], ['out', 1000, DEBT_CATEGORY.id, id]);
  assert.ok(s.categories.some((c) => c.id === DEBT_CATEGORY.id), 'debt category added when first needed');
  // ครั้งที่สองไม่เพิ่มหมวดซ้ำ
  const again = payDebt(s, { debtId: id, walletId: 'w1', amount: 500, date: TODAY }).state;
  assert.equal(again.categories.filter((c) => c.id === DEBT_CATEGORY.id).length, 1);
});

test('payDebt refuses to pay more than the debt or more than the wallet has', () => {
  const s = addDebt(ready(), { name: 'ยืมเพื่อน', balance: 300 }).state;
  const id = s.debts[0].id;
  assert.equal(payDebt(s, { debtId: id, walletId: 'w1', amount: 301, date: TODAY }).ok, false);
  assert.equal(payDebt(s, { debtId: id, walletId: 'w1', amount: 0, date: TODAY }).ok, false);
  const poor = addDebt(ready(), { name: 'ก้อนใหญ่', balance: 9000 }).state;
  assert.equal(payDebt(poor, { debtId: poor.debts[0].id, walletId: 'w1', amount: 2500, date: TODAY }).ok, false);
});

test('updateDebt and deleteDebt change only that debt', () => {
  let s = addDebt(ready(), { name: 'A', balance: 100 }).state;
  s = addDebt(s, { name: 'B', balance: 200 }).state;
  const [a, b] = s.debts;
  const u = updateDebt(s, a.id, { balance: 50, rate: 12 });
  assert.equal(u.ok, true);
  assert.deepEqual([u.state.debts[0].balance, u.state.debts[0].rate, u.state.debts[1].balance], [50, 12, 200]);
  assert.equal(updateDebt(s, a.id, { balance: -5 }).ok, false);
  assert.deepEqual(deleteDebt(s, a.id).debts.map((d) => d.id), [b.id]);
});

test('monthlyInterest and payoffMonths follow the loan formula', () => {
  assert.equal(monthlyInterest(12000, 12), 120);
  assert.equal(payoffMonths(3000, 0, 1000), 3);
  assert.equal(payoffMonths(0, 16, 500), 0);
  // 10,000 บาท ดอก 16%/ปี จ่ายเดือนละ 1,000: n = -ln(1 - rB/P)/ln(1+r), r = 0.16/12 → 10.8 → 11 เดือน
  assert.equal(payoffMonths(10000, 16, 1000), 11);
  // จ่ายไม่ถึงดอกเบี้ย = ไม่มีวันหมด
  assert.equal(payoffMonths(10000, 16, 100), null);
  assert.equal(payoffMonths(10000, 16, 0), null);
});

// ---------- ทรัพย์สิน ----------

test('addAsset keeps THB and USD values; updateAsset stamps the date', () => {
  let r = addAsset(ready(), { name: 'กองทุน S&P 500', kind: 'invest', value: 15000, currency: 'THB', date: TODAY });
  assert.equal(r.ok, true);
  r = addAsset(r.state, { name: 'หุ้นสหรัฐฯ', kind: 'invest', value: 120.5, currency: 'USD', date: TODAY });
  const [thb, usd] = r.state.assets;
  assert.deepEqual([thb.value, thb.currency, thb.updatedAt], [15000, 'THB', TODAY]);
  assert.equal(usd.currency, 'USD');
  assert.equal(addAsset(ready(), { name: 'x', value: 1, currency: 'JPY', date: TODAY }).ok, false);
  assert.equal(addAsset(ready(), { name: 'x', value: -1, date: TODAY }).ok, false);
  const u = updateAsset(r.state, thb.id, { value: 16000, date: '2026-12-01' });
  assert.deepEqual([u.state.assets[0].value, u.state.assets[0].updatedAt], [16000, '2026-12-01']);
  assert.equal(deleteAsset(r.state, thb.id).assets.length, 1);
});

test('netWorth = wallets + assets (USD at the given rate) − debts', () => {
  let s = ready(); // 12,000 ในกระเป๋า
  s = addAsset(s, { name: 'กองทุน', value: 5000, currency: 'THB', date: TODAY }).state;
  s = addAsset(s, { name: 'หุ้น US', value: 100, currency: 'USD', date: TODAY }).state;
  s = addDebt(s, { name: 'บัตร', balance: 3000 }).state;
  const n = netWorth(s, 35);
  assert.deepEqual(n, { cash: 12000, assets: 8500, debts: 3000, total: 17500, missingFx: false });
  // ไม่มีเรท: ไม่นับทรัพย์สิน USD และบอกว่าขาดเรท
  const m = netWorth(s, null);
  assert.deepEqual([m.assets, m.total, m.missingFx], [5000, 14000, true]);
});

test('logNetWorth keeps one value per month and at most 120 months', () => {
  let s = logNetWorth(ready(), '2026-11', 100);
  s = logNetWorth(s, '2026-11', 150);
  s = logNetWorth(s, '2026-12', 200);
  assert.deepEqual(s.netWorthLog, [{ ym: '2026-11', total: 150 }, { ym: '2026-12', total: 200 }]);
  let many = ready();
  for (let i = 0; i < 130; i++) many = logNetWorth(many, `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, i);
  assert.equal(many.netWorthLog.length, 120);
  assert.equal(many.netWorthLog[0].total, 10);
});

test('backups keep debts and assets; broken ones are dropped on load', () => {
  let s = addDebt(ready(), { name: 'บัตร', balance: 3000, rate: 16 }).state;
  s = addAsset(s, { name: 'กองทุน', value: 5000, date: TODAY }).state;
  const r = parseBackup(exportBackup(s), TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.data.debts[0].name, 'บัตร');
  assert.equal(r.data.assets[0].value, 5000);
  const m = migrate({ ...s, debts: [{ id: 'd1', name: 'ok', balance: 1 }, { id: 'd2', balance: 'x' }, null], assets: [{ name: 'no id', value: 1 }] }, TODAY);
  assert.deepEqual(m.debts.map((d) => d.id), ['d1']);
  assert.deepEqual(m.assets, []);
});

// ---------- CSV ----------

test('toCSV lists every entry by date with a BOM for Thai text in Excel', () => {
  let s = ready();
  s = addEntry(s, { type: 'out', amount: 65, categoryId: 'food', walletId: 'w1', date: '2026-11-02', note: 'ข้าว, น้ำ' }).state;
  s = addEntry(s, { type: 'in', amount: 4500, categoryId: 'allowance', walletId: 'w2', date: '2026-11-01', note: '' }).state;
  s = addTransfer(s, { fromWalletId: 'w1', toWalletId: 'w2', amount: 100, date: '2026-11-03', note: 'ออม "เป้า"' }).state;
  const text = toCSV(s);
  assert.ok(text.startsWith('﻿'));
  const lines = text.slice(1).trim().split('\r\n');
  assert.equal(lines[0], 'วันที่,ประเภท,จำนวนเงิน,หมวด,กระเป๋า,ไปกระเป๋า,โน้ต');
  assert.equal(lines[1], '2026-11-01,รายรับ,4500,ค่าขนม,บัญชีออมทรัพย์,,');
  assert.equal(lines[2], '2026-11-02,รายจ่าย,-65,อาหาร,เงินสด,,"ข้าว, น้ำ"');
  assert.equal(lines[3], '2026-11-03,ย้ายเงิน,100,,เงินสด,บัญชีออมทรัพย์,"ออม ""เป้า"""');
});

test('toCSV stops notes from running as spreadsheet formulas', () => {
  const s = addEntry(ready(), { type: 'out', amount: 1, categoryId: 'food', walletId: 'w1', date: TODAY, note: '=HYPERLINK("x")' }).state;
  const row = toCSV(s).slice(1).trim().split('\r\n')[1];
  assert.ok(row.endsWith(`"'=HYPERLINK(""x"")"`), row);
});
