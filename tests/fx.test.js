// ค่าเงิน: ดึงเรทจาก Frankfurter, แคช 6 ชม., เน็ตพังใช้แคชเดิม, โดเมนสำรอง, ช่วงกราฟ
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX_KEY, parseFx, refreshFx, fxRange, fxTrend } from '../app/fx.js';

const TODAY = '2026-11-14';
const H = 3600 * 1000;
const NOW = Date.UTC(2026, 10, 14, 9, 0, 0);

const LATEST = { amount: 1, base: 'USD', date: '2026-11-13', rates: { THB: 33.915 } };
const SERIES = {
  amount: 1, base: 'USD', start_date: '2025-11-14', end_date: '2026-11-13',
  rates: { '2026-11-12': { THB: 33.8 }, '2025-11-14': { THB: 32.4 }, '2026-11-13': { THB: 33.915 } },
};
const OLD = { fetchedAt: NOW - 7 * H, date: '2026-11-12', rate: 33.8, history: [{ date: '2026-11-12', rate: 33.8 }] };

function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
/** fetch ปลอม: route(url) คืน { status, body } หรือ Error (= เน็ตพัง) */
function fakeFetch(route) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const r = route(url);
    if (r instanceof Error) throw r;
    const headers = r.headers || {};
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body, headers: { get: (k) => headers[k.toLowerCase()] ?? null } };
  };
  fn.calls = calls;
  return fn;
}
const frankfurter = (url) => (url.includes('/latest') ? { status: 200, body: LATEST } : { status: 200, body: SERIES });
/** เน็ตหลุด แต่ service worker ตอบด้วยคำตอบเก่าในแคช (ใส่ header X-SEED-Offline) */
const swCached = (route) => fakeFetch((url) => ({ ...route(url), headers: { 'x-seed-offline': '1' } }));

test('parseFx: เรียงประวัติตามวันที่ และใช้เรทล่าสุดเป็นจุดท้าย', () => {
  const fx = parseFx(LATEST, SERIES);
  assert.equal(fx.date, '2026-11-13');
  assert.equal(fx.rate, 33.915);
  assert.deepEqual(fx.history.map((h) => h.date), ['2025-11-14', '2026-11-12', '2026-11-13']);
  const noLast = parseFx(LATEST, { rates: { '2026-11-12': { THB: 33.8 } } });
  assert.deepEqual(noLast.history.at(-1), { date: '2026-11-13', rate: 33.915 });
});

test('parseFx: คำตอบผิดรูป (ไม่มี THB / วันที่เพี้ยน) → throw', () => {
  assert.throws(() => parseFx({ date: '2026-11-13', rates: {} }, SERIES));
  assert.throws(() => parseFx({ date: 'x', rates: { THB: 33 } }, SERIES));
  assert.throws(() => parseFx({ date: '2026-11-13', rates: { THB: -1 } }, SERIES));
  // ประวัติพังแต่เรทล่าสุดดี → ยังใช้ได้ (มีจุดเดียว)
  assert.deepEqual(parseFx(LATEST, null).history, [{ date: '2026-11-13', rate: 33.915 }]);
});

test('refreshFx: แคชอายุ 5 ชม. → ใช้แคช ไม่เรียกเน็ต', async () => {
  const storage = memoryStorage({ [FX_KEY]: JSON.stringify({ ...OLD, fetchedAt: NOW - 5 * H }) });
  const f = fakeFetch(() => new Error('ไม่ควรเรียกเน็ต'));
  const r = await refreshFx({ fetchFn: f, storage, now: NOW, today: TODAY });
  assert.equal(r.status, 'cached');
  assert.equal(r.fx.rate, 33.8);
  assert.equal(f.calls.length, 0);
});

test('refreshFx: แคชอายุ 7 ชม. → ดึงใหม่ทั้งเรทล่าสุดและย้อนหลัง 1 ปี แล้วเก็บลงแคช', async () => {
  const storage = memoryStorage({ [FX_KEY]: JSON.stringify(OLD) });
  const f = fakeFetch(frankfurter);
  const r = await refreshFx({ fetchFn: f, storage, now: NOW, today: TODAY });
  assert.equal(r.status, 'fresh');
  assert.equal(r.fx.rate, 33.915);
  assert.equal(r.fx.date, '2026-11-13');
  assert.equal(r.fx.fetchedAt, NOW);
  assert.deepEqual(f.calls.map((c) => c.url).sort(), [
    'https://api.frankfurter.dev/v1/2025-11-14..2026-11-14?base=USD&symbols=THB',
    'https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB',
  ]);
  assert.deepEqual(JSON.parse(storage.getItem(FX_KEY)), r.fx);
});

test('refreshFx: เน็ตพัง → ใช้แคชเดิม (ออฟไลน์) และไม่ลบแคช', async () => {
  const before = JSON.stringify(OLD);
  const storage = memoryStorage({ [FX_KEY]: before });
  const r = await refreshFx({ fetchFn: fakeFetch(() => new TypeError('Failed to fetch')), storage, now: NOW, today: TODAY });
  assert.equal(r.status, 'offline');
  assert.equal(r.fx.rate, 33.8);
  assert.equal(r.fx.date, '2026-11-12');
  assert.equal(storage.getItem(FX_KEY), before);
});

test('refreshFx: เน็ตหลุดแต่ service worker ตอบจากแคช → ออฟไลน์ ใช้แคชในเครื่องถ้าวันที่ไม่เก่ากว่า และไม่บันทึกทับ', async () => {
  const same = JSON.stringify({ ...OLD, date: '2026-11-13', rate: 33.9 });
  const storage = memoryStorage({ [FX_KEY]: same });
  const r = await refreshFx({ fetchFn: swCached(frankfurter), storage, now: NOW, today: TODAY });
  assert.equal(r.status, 'offline');
  assert.equal(r.fx.rate, 33.9);
  assert.equal(storage.getItem(FX_KEY), same);
});

test('refreshFx: service worker มีเรทที่ใหม่กว่าแคชในเครื่อง (หรือไม่มีแคช) → ใช้เรทนั้นแบบออฟไลน์ ไม่บันทึกว่าเพิ่งดึง', async () => {
  const before = JSON.stringify(OLD);
  const storage = memoryStorage({ [FX_KEY]: before });
  const r = await refreshFx({ fetchFn: swCached(frankfurter), storage, now: NOW, today: TODAY });
  assert.equal(r.status, 'offline');
  assert.deepEqual([r.fx.rate, r.fx.date, r.fx.fetchedAt], [33.915, '2026-11-13', 0]);
  assert.equal(storage.getItem(FX_KEY), before);
  const none = memoryStorage();
  const r2 = await refreshFx({ fetchFn: swCached(frankfurter), storage: none, now: NOW, today: TODAY });
  assert.deepEqual([r2.status, r2.fx.rate], ['offline', 33.915]);
  assert.equal(none.getItem(FX_KEY), null);
});

test('refreshFx: ไม่มีแคช + เน็ตพัง → ไม่มีเรท (none) ไม่ throw', async () => {
  const r = await refreshFx({ fetchFn: fakeFetch(() => new Error('offline')), storage: memoryStorage(), now: NOW, today: TODAY });
  assert.deepEqual(r, { fx: null, status: 'none' });
});

test('refreshFx: โดเมนหลักตอบ error → ลอง api.frankfurter.app (path ไม่มี /v1)', async () => {
  const f = fakeFetch((url) => (url.startsWith('https://api.frankfurter.dev') ? { status: 503, body: {} } : frankfurter(url)));
  const r = await refreshFx({ fetchFn: f, storage: memoryStorage(), now: NOW, today: TODAY });
  assert.equal(r.status, 'fresh');
  assert.equal(r.fx.rate, 33.915);
  assert.ok(f.calls.some((c) => c.url === 'https://api.frankfurter.app/latest?base=USD&symbols=THB'));
  assert.ok(f.calls.some((c) => c.url === 'https://api.frankfurter.app/2025-11-14..2026-11-14?base=USD&symbols=THB'));
});

test('refreshFx: คำตอบผิดรูปทุกโดเมน → ใช้แคชเดิม', async () => {
  const f = fakeFetch(() => ({ status: 200, body: { message: 'not found' } }));
  const r = await refreshFx({ fetchFn: f, storage: memoryStorage({ [FX_KEY]: JSON.stringify(OLD) }), now: NOW, today: TODAY });
  assert.equal(r.status, 'offline');
  assert.equal(r.fx.rate, 33.8);
});

test('refreshFx: URL มีแค่สกุลเงินกับวันที่ ไม่ส่ง referrer/cookie', async () => {
  const f = fakeFetch(frankfurter);
  await refreshFx({ fetchFn: f, storage: memoryStorage(), now: NOW, today: TODAY });
  assert.ok(f.calls.length >= 2);
  for (const c of f.calls) {
    assert.match(c.url, /^https:\/\/api\.frankfurter\.(dev\/v1|app)\/(latest|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2})\?base=USD&symbols=THB$/);
    assert.equal(c.opts.referrerPolicy, 'no-referrer');
    assert.equal(c.opts.credentials, 'omit');
  }
});

test('fxTrend: ทิศ + % ทศนิยม 1 ตำแหน่ง; ปัดแล้วเป็น 0.0% = เท่าเดิม (ไม่ขึ้น ▲0.0%)', () => {
  assert.deepEqual(fxTrend(-0.0071), { dir: 'down', pct: '0.7%' });
  assert.deepEqual(fxTrend(0.0123), { dir: 'up', pct: '1.2%' });
  assert.deepEqual(fxTrend(0.0004), { dir: 'flat', pct: '0.0%' });
  assert.deepEqual(fxTrend(-0.00049), { dir: 'flat', pct: '0.0%' });
  assert.deepEqual(fxTrend(0), { dir: 'flat', pct: '0.0%' });
});

test('fxRange: นับย้อนจากวันที่ของเรท (ไม่ใช่วันนี้) และมีจุดล่าสุดเสมอ', () => {
  const history = [
    { date: '2025-11-10', rate: 32.0 }, { date: '2025-11-14', rate: 32.4 }, { date: '2026-08-13', rate: 33.0 },
    { date: '2026-08-14', rate: 33.1 }, { date: '2026-10-13', rate: 33.5 }, { date: '2026-10-14', rate: 33.6 },
  ];
  const fx = { date: '2026-11-13', rate: 33.915, history };
  assert.deepEqual(fxRange(fx, '30d').map((p) => p.date), ['2026-10-14', '2026-11-13']);
  assert.deepEqual(fxRange(fx, '3m').map((p) => p.date), ['2026-08-13', '2026-08-14', '2026-10-13', '2026-10-14', '2026-11-13']);
  assert.deepEqual(fxRange(fx, '1y').map((p) => p.date), ['2025-11-14', '2026-08-13', '2026-08-14', '2026-10-13', '2026-10-14', '2026-11-13']);
  assert.deepEqual(fxRange({ ...fx, history: [] }, '30d'), [{ date: '2026-11-13', rate: 33.915 }]);
});
