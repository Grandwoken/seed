import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, loadState, saveState, migrate, exportBackup, parseBackup, restoreBackup } from '../app/store.js';

/** localStorage ปลอมสำหรับเทสต์ */
function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const TODAY = '2026-11-14';

test('first run starts empty with default wallets and categories', () => {
  const { state, status } = loadState(memoryStorage(), TODAY);
  assert.equal(status, 'new');
  assert.equal(state.settings.onboarded, false);
  // วันเปิดบัญชีตั้งต้น = 1 ปีจากวันเริ่มใช้ (ไม่ฝังวันจริงของเจ้าของไว้ในโค้ดที่ขึ้นเว็บ) เป้าแรกใช้วันเดียวกัน
  assert.equal(state.settings.accountDate, '2027-11-14');
  assert.equal(state.goals.find((g) => g.id === 'g1').deadline, '2027-11-14');
  assert.deepEqual(state.transactions, []);
  assert.deepEqual(state.wallets.map((w) => w.name), ['เงินสด', 'บัญชีออมทรัพย์']);
  assert.deepEqual(
    state.categories.filter((c) => c.type === 'out').map((c) => c.name),
    ['อาหาร', 'เดินทาง', 'เกม/บันเทิง', 'ของเรียน', 'ของใช้', 'อื่น ๆ'],
  );
  assert.deepEqual(
    state.categories.filter((c) => c.type === 'in').map((c) => c.name),
    ['ค่าขนม', 'งานพิเศษ', 'ของขวัญ', 'อื่น ๆ'],
  );
});

test('saved data loads back unchanged', () => {
  const storage = memoryStorage();
  const { state } = loadState(storage, TODAY);
  state.settings.name = 'ต้น';
  state.transactions.push({ id: 't1', date: TODAY, type: 'out', amount: 65, categoryId: 'food', walletId: 'w1', note: 'ข้าว' });
  saveState(storage, state);
  const again = loadState(storage, TODAY);
  assert.equal(again.status, 'ok');
  assert.equal(again.state.settings.name, 'ต้น');
  assert.deepEqual(again.state.transactions, state.transactions);
});

test('broken saved data is kept aside, never overwritten', () => {
  const storage = memoryStorage({ [KEY]: '{"schemaVersion":1, broken' });
  const { state, status } = loadState(storage, TODAY);
  assert.equal(status, 'corrupt');
  assert.equal(state.settings.onboarded, false);
  assert.equal(storage.getItem(KEY), '{"schemaVersion":1, broken');
  assert.equal(storage.getItem(KEY + '.broken'), '{"schemaVersion":1, broken');
});

test('migrate fills missing sections and keeps existing values', () => {
  const s = migrate({ schemaVersion: 1, settings: { name: 'ต้น', onboarded: true }, wallets: [{ id: 'w9', name: 'กระปุก', start: 50 }], transactions: [] }, TODAY);
  assert.equal(s.settings.name, 'ต้น');
  assert.equal(s.settings.onboarded, true);
  assert.equal(s.settings.lock.enabled, false);
  assert.deepEqual(s.wallets, [{ id: 'w9', name: 'กระปุก', start: 50 }]);
  assert.equal(s.categories.length, 10);
  assert.equal(s.sim.years, 6);
  assert.deepEqual(s.sim.rates, { bad: -5, mid: 6, good: 12 });
  assert.deepEqual(s.learn.done, []);
  assert.equal(s.checklist.talkParent, false);
});

const withLock = () => {
  const { state } = loadState(memoryStorage(), TODAY);
  state.settings.onboarded = true;
  state.settings.lock = { enabled: true, salt: 'c2FsdA==', hash: 'aGFzaA==', iterations: 310000, autoLockMin: 5 };
  state.transactions.push({ id: 't1', date: TODAY, type: 'in', amount: 4500, categoryId: 'allowance', walletId: 'w2', note: '' });
  return state;
};

test('a backup file never contains the passcode hash or salt', () => {
  const text = exportBackup(withLock());
  const data = JSON.parse(text);
  assert.equal(data.settings.lock.hash, undefined);
  assert.equal(data.settings.lock.salt, undefined);
  assert.equal(data.transactions.length, 1);
  assert.ok(!text.includes('aGFzaA=='));
});

test('a valid backup parses', () => {
  const r = parseBackup(exportBackup(withLock()));
  assert.equal(r.ok, true);
  assert.equal(r.data.transactions[0].amount, 4500);
});

test('parseBackup rejects files that are not SEED backups', () => {
  assert.equal(parseBackup('not json').ok, false);
  assert.equal(parseBackup('{}').ok, false);
  assert.equal(parseBackup('[1,2]').ok, false);
  const newer = JSON.parse(exportBackup(withLock()));
  newer.schemaVersion = 99;
  assert.equal(parseBackup(JSON.stringify(newer)).ok, false);
});

test('parseBackup rejects broken transactions', () => {
  const bad = (t) => {
    const d = JSON.parse(exportBackup(withLock()));
    d.transactions = [t];
    return parseBackup(JSON.stringify(d)).ok;
  };
  assert.equal(bad({ id: 'x', date: TODAY, type: 'steal', amount: 5, walletId: 'w1' }), false);
  assert.equal(bad({ id: 'x', date: TODAY, type: 'out', amount: -5, walletId: 'w1' }), false);
  assert.equal(bad({ id: 'x', date: TODAY, type: 'out', amount: 'lots', walletId: 'w1' }), false);
  assert.equal(bad({ id: 'x', date: '14/11/2026', type: 'out', amount: 5, walletId: 'w1' }), false);
  assert.equal(bad({ id: 'x', date: TODAY, type: 'out', amount: 5, walletId: 'w1' }), true);
});

test('restoring a backup keeps this device\'s passcode setting', () => {
  const backup = parseBackup(exportBackup(withLock())).data;
  const { state: fresh } = loadState(memoryStorage(), TODAY);
  const restored = restoreBackup(fresh, backup);
  assert.equal(restored.settings.lock.enabled, false);
  assert.equal(restored.settings.lock.hash, null);
  assert.equal(restored.settings.onboarded, true);
  assert.equal(restored.transactions.length, 1);
});

// ---------- แก้หมวด / กระเป๋า / วันเปิดบัญชี ----------
import { addCategory, deleteCategory, deleteWallet, setAccountDate, defaultState } from '../app/store.js';

const used = () => {
  const s = defaultState(TODAY);
  s.transactions.push({ id: 't1', date: TODAY, type: 'out', amount: 40, categoryId: 'fun', walletId: 'w1', note: '' });
  s.recurring.push({ id: 'r1', type: 'out', amount: 99, categoryId: 'fun', walletId: 'w1', dayOfMonth: 5, note: 'เกมรายเดือน', lastRun: TODAY });
  return s;
};

test('a new expense category takes the next palette color and a zero budget', () => {
  const s = addCategory(defaultState(TODAY), { name: 'ของฝาก', type: 'out' });
  const c = s.categories.at(-1);
  assert.equal(c.name, 'ของฝาก');
  assert.equal(c.type, 'out');
  assert.equal(c.budget, 0);
  assert.equal(c.color, '#4CC9C0'); // 6 หมวดเดิม → สีที่ 7 = ตัวที่ 3 ของวง (ฟ้า ส้ม เขียวน้ำทะเล ม่วง)
  assert.ok(c.id && !['food', 'fun'].includes(c.id));
});

test('an unused category can be deleted', () => {
  const r = deleteCategory(used(), 'study');
  assert.equal(r.ok, true);
  assert.ok(!r.state.categories.some((c) => c.id === 'study'));
});

test('a used category cannot be deleted without a merge target', () => {
  const r = deleteCategory(used(), 'fun');
  assert.equal(r.ok, false);
  assert.equal(r.inUse, 2);
});

test('deleting with a merge target moves its entries first', () => {
  const r = deleteCategory(used(), 'fun', 'other_out');
  assert.equal(r.ok, true);
  assert.equal(r.state.transactions[0].categoryId, 'other_out');
  assert.equal(r.state.recurring[0].categoryId, 'other_out');
  assert.ok(!r.state.categories.some((c) => c.id === 'fun'));
});

test('a wallet with entries cannot be deleted; an empty one can', () => {
  assert.equal(deleteWallet(used(), 'w1').ok, false);
  const r = deleteWallet(used(), 'w2');
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.wallets.map((w) => w.id), ['w1']);
  assert.deepEqual(r.state.goals[0].walletIds, []);
});

test('changing the account date moves the first goal deadline with it', () => {
  const s = setAccountDate(defaultState(TODAY), '2027-06-01');
  assert.equal(s.settings.accountDate, '2027-06-01');
  assert.equal(s.goals[0].deadline, '2027-06-01');
});
