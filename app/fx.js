// SEED — ค่าเงิน USD/THB จาก Frankfurter (เรทอ้างอิงธนาคารกลางยุโรป) แคชไว้ใน localStorage['seed.fx']
import { addDays, addMonthsISO, fxIsFresh } from './calc.js';

export const FX_KEY = 'seed.fx';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const goodRate = (r) => typeof r === 'number' && Number.isFinite(r) && r > 0;

/** อ่านแคชเรท { fetchedAt, date, rate, history: [{ date, rate }] }; ไม่มีหรือเสีย → null */
export function readFxCache(storage) {
  let o;
  try {
    o = JSON.parse(storage.getItem(FX_KEY));
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || !goodRate(o.rate) || !ISO.test(o.date || '') || !Number.isFinite(o.fetchedAt)) return null;
  const history = Array.isArray(o.history)
    ? o.history.filter((h) => h && ISO.test(h.date || '') && goodRate(h.rate)).map((h) => ({ date: h.date, rate: h.rate }))
    : [];
  return { fetchedAt: o.fetchedAt, date: o.date, rate: o.rate, history };
}

// ---------- ดึงเรทจากเว็บ (เรียกเน็ตอย่างเดียวของแอพ: ส่งแค่สกุลเงินกับวันที่ ไม่มีข้อมูลส่วนตัว) ----------

/** v1 = เรทอ้างอิง ECB (v1 ถูกแทนด้วย v2 แต่ผู้ให้บริการบอกว่าเปิดไว้ต่อไป); โดเมนเก่า .app ไม่มี /v1 */
export const FX_HOSTS = ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app'];
const QS = '?base=USD&symbols=THB';
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** คำตอบ Frankfurter → { date, rate, history (เรียงวันที่ จุดท้าย = เรทล่าสุด) }; ผิดรูป → throw */
export function parseFx(latest, series) {
  const rate = latest?.rates?.THB;
  const date = latest?.date;
  if (!goodRate(rate) || !ISO.test(date || '')) throw new Error('คำตอบค่าเงินผิดรูป');
  const rates = series && series.rates && typeof series.rates === 'object' ? series.rates : {};
  const history = Object.entries(rates)
    .filter(([d, r]) => ISO.test(d) && d < date && goodRate(r?.THB))
    .map(([d, r]) => ({ date: d, rate: r.THB }))
    .sort(byDate);
  history.push({ date, rate });
  return { date, rate, history };
}

/** → { body, stale } — stale = เน็ตหลุดแล้ว service worker ตอบด้วยคำตอบเก่าที่เก็บไว้ (header X-SEED-Offline) */
async function getJSON(fetchFn, url) {
  // ไม่ส่ง referrer/cookie; no-cache = ถามเซิร์ฟเวอร์ใหม่ (เซิร์ฟเวอร์ให้แคชได้ 1 วัน)
  const r = await fetchFn(url, { cache: 'no-cache', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
  const stale = !!(r.headers && typeof r.headers.get === 'function' && r.headers.get('X-SEED-Offline'));
  return { body: await r.json(), stale };
}

/** ดึงเรทล่าสุด + ย้อนหลัง 1 ปี: ลองโดเมนหลักก่อน แล้วโดเมนเก่า; ไม่ได้ทั้งคู่ → throw (stale = มาจากแคชของ service worker) */
export async function fetchFx(fetchFn, today) {
  const start = addMonthsISO(today, -12);
  let err = null;
  for (const host of FX_HOSTS) {
    try {
      const [latest, series] = await Promise.all([
        getJSON(fetchFn, `${host}/latest${QS}`),
        getJSON(fetchFn, `${host}/${start}..${today}${QS}`).catch(() => null), // ประวัติพัง ยังใช้เรทล่าสุดได้
      ]);
      return { ...parseFx(latest.body, series && series.body), stale: latest.stale };
    } catch (e) {
      err = e;
    }
  }
  throw err || new Error('ดึงค่าเงินไม่ได้');
}

/**
 * เรทที่จะใช้ (ไม่ throw):
 * แคชอายุไม่ถึง 6 ชม. → ใช้แคช ไม่เรียกเน็ต ('cached'); เกิน/ไม่มี → ดึงใหม่แล้วเก็บ ('fresh');
 * ดึงไม่ได้ → แคชเดิม ('offline') หรือไม่มีเลย ('none')
 */
export async function refreshFx({ fetchFn, storage, now, today }) {
  const cached = readFxCache(storage);
  if (cached && fxIsFresh(cached.fetchedAt, now)) return { fx: cached, status: 'cached' };
  try {
    const { stale, ...got } = await fetchFx(fetchFn, today);
    if (stale) {
      // เน็ตหลุด แต่ service worker มีคำตอบเก่า: ใช้อันที่วันที่ใหม่กว่า บอกว่าออฟไลน์ และไม่บันทึกว่าเพิ่งดึง
      if (cached && cached.date >= got.date) return { fx: cached, status: 'offline' };
      return { fx: { fetchedAt: 0, ...got }, status: 'offline' };
    }
    const fx = { fetchedAt: now, ...got };
    try {
      storage.setItem(FX_KEY, JSON.stringify(fx));
    } catch {
      /* พื้นที่เต็ม: ใช้เรทใหม่ไปก่อน รอบหน้าค่อยเก็บ */
    }
    return { fx, status: 'fresh' };
  } catch {
    return { fx: cached, status: cached ? 'offline' : 'none' };
  }
}

// ---------- ช่วงของกราฟ (นับย้อนจากวันที่ของเรท ไม่ใช่วันนี้ เพราะเสาร์-อาทิตย์ไม่มีเรทใหม่) ----------

export const FX_RANGES = [['30d', '30 วัน'], ['3m', '3 เดือน'], ['1y', '1 ปี']];
const RANGE_START = {
  '30d': (d) => addDays(d, -30),
  '3m': (d) => addMonthsISO(d, -3),
  '1y': (d) => addMonthsISO(d, -12),
};
/** ทิศของเรทในช่วง (fxChange = สัดส่วน): ปัดเป็น % ทศนิยม 1 ตำแหน่งก่อน ขยับไม่ถึง 0.05% = เท่าเดิม */
export function fxTrend(change) {
  const p = Math.round(Math.abs(change) * 1000) / 10;
  return { dir: p === 0 ? 'flat' : change > 0 ? 'up' : 'down', pct: p.toFixed(1) + '%' };
}

/** จุดเรทในช่วงที่เลือก (จุดท้าย = เรทล่าสุดเสมอ) */
export function fxRange(fx, range) {
  const from = (RANGE_START[range] || RANGE_START['30d'])(fx.date);
  const pts = fx.history.filter((h) => h.date >= from && h.date < fx.date);
  pts.push({ date: fx.date, rate: fx.rate });
  return pts;
}
