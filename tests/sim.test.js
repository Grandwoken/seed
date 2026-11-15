// เครื่องจำลอง: ค่าเริ่มต้นจากเป้า/เงินเหลือ, 3 กรณี + เงินที่ใส่ รายปี, เก็บค่าที่ใช้ล่าสุด
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simDefaults, simScenarios, simulate, invested, feeLoss } from '../app/calc.js';
import { defaultState, setSim } from '../app/store.js';

const TODAY = '2026-11-14';
const tx = (id, date, type, amount) =>
  ({ id, date, type, amount, categoryId: type === 'in' ? 'allowance' : 'food', walletId: 'w1', note: '', recurringId: null });

/** ส.ค.–ต.ค. เหลือเดือนละ 1,640 → เฉลี่ย 1,640 */
function makeState(left = 1640) {
  const s = defaultState('2026-08-01');
  s.settings.onboarded = true;
  s.transactions = ['2026-08', '2026-09', '2026-10'].flatMap((ym, i) => [
    tx('i' + i, `${ym}-01`, 'in', 4500), tx('o' + i, `${ym}-10`, 'out', 4500 - left),
  ]);
  return s;
}

test('simDefaults: ยังไม่เคยตั้ง → เงินก้อนแรก = เป้า, เติมทุกเดือน = เหลือเฉลี่ยต่อเดือน (ปัดตามขั้นสไลเดอร์)', () => {
  const d = simDefaults(makeState(), TODAY);
  assert.equal(d.initial, 30000);
  assert.equal(d.monthly, 1600);
  assert.equal(d.years, 6);
  assert.equal(d.fee, 0.5);
  assert.deepEqual(d.rates, { bad: -5, mid: 6, good: 12 });
});

test('simDefaults: เหลือเฉลี่ยติดลบ → 0, เป้าเกิน 200,000 → 200,000, ปัด 30,499 → 30,000', () => {
  const s = makeState(-300);
  s.goals[0].target = 250000;
  const d = simDefaults(s, TODAY);
  assert.equal(d.monthly, 0);
  assert.equal(d.initial, 200000);
  s.goals[0].target = 30499;
  assert.equal(simDefaults(s, TODAY).initial, 30000);
});

test('simDefaults: ค่าที่เคยตั้งไว้ใช้ตามนั้น (จำค่าล่าสุด)', () => {
  const s = makeState();
  s.sim = { initial: 5000, monthly: 0, years: 10, fee: 1.2, rates: { bad: -10, mid: 4, good: 9 } };
  assert.deepEqual(simDefaults(s, TODAY), { initial: 5000, monthly: 0, years: 10, fee: 1.2, rates: { bad: -10, mid: 4, good: 9 } });
});

test('simDefaults: ค่าที่เก็บไว้เพี้ยน (เช่นไฟล์สำรองที่แก้มือ) → ใช้ค่าเริ่มต้นแทน กราฟไม่เป็น NaN', () => {
  const s = makeState();
  s.sim = { initial: 'abc', monthly: null, years: NaN, fee: '1', rates: { bad: 'x', mid: 4, good: null } };
  assert.deepEqual(simDefaults(s, TODAY), { initial: 30000, monthly: 1600, years: 6, fee: 0.5, rates: { bad: -5, mid: 4, good: 12 } });
});

test('simScenarios: 3 กรณี + เงินที่ใส่ รายปี ตรงกับ simulate/invested/feeLoss', () => {
  const p = { initial: 30000, monthly: 1500, years: 6, fee: 0.5, rates: { bad: -5, mid: 6, good: 12 } };
  const r = simScenarios(p);
  assert.equal(r.invested.length, 7);
  assert.equal(r.invested[0], 30000);
  assert.equal(r.invested[6], invested(30000, 1500, 6));
  assert.deepEqual(r.mid.yearly, simulate({ ...p, rate: 6 }).yearly);
  assert.equal(r.good.end, simulate({ ...p, rate: 12 }).end);
  assert.equal(r.bad.end, simulate({ ...p, rate: -5 }).end);
  assert.equal(r.feeLoss, feeLoss({ ...p, rate: 6 }));
  assert.ok(r.good.end > r.mid.end && r.mid.end > r.invested[6] && r.bad.end < r.invested[6]);
});

test('simScenarios: ผลตอบแทน 0 ค่าธรรมเนียม 0 → ทุกกรณีเท่ากับเงินที่ใส่', () => {
  const r = simScenarios({ initial: 1000, monthly: 100, years: 3, fee: 0, rates: { bad: 0, mid: 0, good: 0 } });
  assert.deepEqual(r.mid.yearly, r.invested);
  assert.equal(r.feeLoss, 0);
});

test('setSim: บีบค่าให้อยู่ในช่วงสไลเดอร์ ไม่แก้ state เดิม', () => {
  const s = defaultState(TODAY);
  const n = setSim(s, { initial: 250000.7, monthly: -5, years: 40, fee: 0.55 });
  assert.deepEqual([n.sim.initial, n.sim.monthly, n.sim.years, n.sim.fee], [200000, 0, 15, 0.6]);
  assert.equal(s.sim.initial, null);
  assert.deepEqual(setSim(s, { years: 0 }).sim.years, 1);
  assert.equal(setSim(s, { initial: 'abc' }).sim.initial, null); // ตัวเลขเพี้ยน → ไม่เปลี่ยน
});

test('setSim: สมมติฐานผลตอบแทนต้องเป็นตัวเลข −50…50 และ แย่ ≤ กลาง ≤ ดี', () => {
  const s = defaultState(TODAY);
  assert.deepEqual(setSim(s, { rates: { bad: -8, mid: 5.5, good: 10 } }).sim.rates, { bad: -8, mid: 5.5, good: 10 });
  assert.throws(() => setSim(s, { rates: { bad: -5, mid: 60, good: 70 } }));
  assert.throws(() => setSim(s, { rates: { bad: 5, mid: 4, good: 10 } }));
  assert.throws(() => setSim(s, { rates: { bad: -5, mid: NaN, good: 10 } }));
});
