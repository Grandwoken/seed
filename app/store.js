// SEED — เก็บข้อมูลในเครื่อง (localStorage key "seed.v1") + ไฟล์สำรอง
// ข้อมูลเงินอยู่ในมือถือเครื่องเดียว ไม่ส่งไปไหน (ดู spec §1 anti-goals)

import { todayISO, round2, walletBalance, addMonthsISO } from './calc.js';

export const KEY = 'seed.v1';
export const SCHEMA_VERSION = 1;
/** วันเปิดบัญชีตั้งต้น = 1 ปีจากวันเริ่มใช้ เจ้าของเลือกวันจริงเองตอนตั้งค่า (โค้ดขึ้นเว็บสาธารณะ: ห้ามฝังวันจริง) */
export const defaultAccountDate = (today) => addMonthsISO(today, 12);

export const COLORS = {
  blue: '#7C9CFF', orange: '#FF9F6B', teal: '#4CC9C0', lilac: '#C3A6FF', green: '#3DDC97', gray: '#9AA1AC',
};
/** สีหมวดรายจ่ายใหม่: ฟ้า ส้ม เขียวน้ำทะเล ม่วง แล้ววนซ้ำ */
export const CATEGORY_CYCLE = [COLORS.blue, COLORS.orange, COLORS.teal, COLORS.lilac];

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'อาหาร', type: 'out', budget: 0, short: 'กิน', color: COLORS.blue },
  { id: 'travel', name: 'เดินทาง', type: 'out', budget: 0, short: 'รถ', color: COLORS.teal },
  { id: 'fun', name: 'เกม/บันเทิง', type: 'out', budget: 0, short: 'เกม', color: COLORS.orange },
  { id: 'study', name: 'ของเรียน', type: 'out', budget: 0, short: 'เรียน', color: COLORS.lilac },
  { id: 'stuff', name: 'ของใช้', type: 'out', budget: 0, short: 'ใช้', color: COLORS.blue },
  { id: 'other_out', name: 'อื่น ๆ', type: 'out', budget: 0, short: 'อื่น', color: COLORS.gray },
  { id: 'allowance', name: 'ค่าขนม', type: 'in', budget: 0, short: 'ขนม', color: COLORS.green },
  { id: 'job', name: 'งานพิเศษ', type: 'in', budget: 0, short: 'งาน', color: COLORS.green },
  { id: 'gift', name: 'ของขวัญ', type: 'in', budget: 0, short: 'ขวัญ', color: COLORS.green },
  { id: 'other_in', name: 'อื่น ๆ', type: 'in', budget: 0, short: 'รับ', color: COLORS.green },
];

const clone = (x) => JSON.parse(JSON.stringify(x));

export function defaultState(today = todayISO()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      name: '', accountDate: defaultAccountDate(today), lastExport: null, createdAt: today, onboarded: false,
      lock: { enabled: false, salt: null, hash: null, iterations: 310000, autoLockMin: 5 },
    },
    wallets: [{ id: 'w1', name: 'เงินสด', start: 0 }, { id: 'w2', name: 'บัญชีออมทรัพย์', start: 0 }],
    categories: clone(DEFAULT_CATEGORIES),
    transactions: [],
    recurring: [],
    goals: [
      { id: 'g1', name: 'เงินก้อนแรกลงทุน', target: 30000, deadline: defaultAccountDate(today), walletIds: ['w2'], kind: 'custom' },
      { id: 'g_em', name: 'เงินฉุกเฉิน', kind: 'emergency', multiplier: 3, walletIds: [] },
    ],
    allocation: null,
    checklist: { talkParent: false, channel: false, docs: false, why: false, whyNote: '' },
    // initial / monthly = null → ใช้ค่าตั้งต้นจากเป้าและเงินเหลือเฉลี่ย จนกว่าจะเลื่อนเอง
    sim: { initial: null, monthly: null, years: 6, fee: 0.5, rates: { bad: -5, mid: 6, good: 12 } },
    learn: { done: [], quiz: {} },
    news: { seen: [] },
  };
}

const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const arr = (x, fallback) => (Array.isArray(x) ? x : fallback);

/** เติมส่วนที่ขาดจากค่าตั้งต้น (ข้อมูลเก่า/ไฟล์สำรอง) โดยไม่ทับค่าที่มีอยู่ */
export function migrate(input, today = todayISO()) {
  const d = defaultState(today);
  const o = obj(input);
  const settings = obj(o.settings);
  const sim = obj(o.sim);
  const s = {
    ...d,
    ...o,
    schemaVersion: SCHEMA_VERSION,
    settings: { ...d.settings, ...settings, lock: { ...d.settings.lock, ...obj(settings.lock) } },
    wallets: arr(o.wallets, d.wallets),
    categories: arr(o.categories, d.categories),
    transactions: arr(o.transactions, []),
    recurring: arr(o.recurring, []),
    goals: arr(o.goals, d.goals),
    checklist: { ...d.checklist, ...obj(o.checklist) },
    sim: { ...d.sim, ...sim, rates: { ...d.sim.rates, ...obj(sim.rates) } },
    learn: cleanLearn(o.learn),
    news: cleanNews(o.news),
    allocation: validAllocation(o.allocation) ? pickAllocation(o.allocation) : null,
  };
  if (!s.goals.some((g) => g.kind === 'emergency')) s.goals = [...s.goals, clone(d.goals[1])];
  return s;
}

const LESSON_ID = /^\d{1,2}$/;
/** บทที่อ่านจบ (เลขบทเป็นข้อความ เรียงตามลำดับที่อ่านจบ) + ตัวเลือกที่ตอบ { บท: { ข้อ: ตัวเลือก } } */
function cleanLearn(x) {
  const o = obj(x);
  const done = [...new Set(arr(o.done, []).filter((v) => typeof v === 'string' || typeof v === 'number').map(String))]
    .filter((v) => LESSON_ID.test(v));
  const quiz = {};
  for (const [id, answers] of Object.entries(obj(o.quiz))) {
    if (!LESSON_ID.test(id)) continue;
    const a = {};
    for (const [k, v] of Object.entries(obj(answers))) if (/^\d{1,2}$/.test(k) && Number.isInteger(v) && v >= 0 && v < 20) a[k] = v;
    if (Object.keys(a).length) quiz[id] = a;
  }
  return { done, quiz };
}
/** สรุปข่าวที่เปิดดูแล้ว (วันที่ของฉบับ) */
const NEWS_SEEN_MAX = 60;
function cleanNews(x) {
  return { seen: [...new Set(arr(obj(x).seen, []).filter(realDate))].slice(-NEWS_SEEN_MAX) };
}

/** โหลดจาก storage; ข้อมูลเสียจะถูกเก็บแยกไว้ที่ KEY.broken และไม่ถูกเขียนทับ */
export function loadState(storage, today = todayISO()) {
  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return { state: defaultState(today), status: 'unavailable' };
  }
  if (raw == null) return { state: defaultState(today), status: 'new' };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    return { state: migrate(parsed, today), status: 'ok' };
  } catch {
    try {
      storage.setItem(KEY + '.broken', raw);
    } catch { /* เต็ม — อย่างน้อยไม่ทับของเดิม */ }
    return { state: defaultState(today), status: 'corrupt' };
  }
}

export function saveState(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---------- ไฟล์สำรอง ----------

/** ไฟล์สำรอง: ไม่มี hash/salt ของรหัสผ่าน (รหัสเป็นของเครื่องนั้น ๆ) */
export function exportBackup(state) {
  const copy = clone(state);
  const { autoLockMin, iterations } = state.settings.lock;
  copy.settings.lock = { autoLockMin, iterations };
  return JSON.stringify({ app: 'SEED', exportedAt: new Date().toISOString(), ...copy }, null, 2);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function realDate(s) {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const money = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const str = (s) => typeof s === 'string' && s.length > 0;

function validTx(t) {
  if (!t || !str(t.id) || !realDate(t.date) || !money(t.amount)) return false;
  if (t.type === 'transfer') return str(t.fromWalletId) && str(t.toWalletId);
  return (t.type === 'in' || t.type === 'out') && str(t.walletId);
}

export function parseBackup(text, today = todayISO()) {
  const fail = (error) => ({ ok: false, error });
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('อ่านไฟล์ไม่ได้ — ไม่ใช่ไฟล์สำรองของ SEED');
  }
  const o = obj(data);
  if (typeof o.schemaVersion !== 'number' || !o.settings || !Array.isArray(o.wallets) || !Array.isArray(o.transactions)) {
    return fail('ไฟล์นี้ไม่ใช่ไฟล์สำรองของ SEED');
  }
  if (o.schemaVersion > SCHEMA_VERSION) return fail('ไฟล์นี้มาจากแอพเวอร์ชันใหม่กว่า — อัปเดตแอพก่อนแล้วลองใหม่');
  if (!o.wallets.every((w) => w && str(w.id) && typeof w.name === 'string' && Number.isFinite(Number(w.start ?? 0)))) {
    return fail('ข้อมูลกระเป๋าเงินในไฟล์เสีย');
  }
  const bad = o.transactions.findIndex((t) => !validTx(t));
  if (bad >= 0) return fail(`รายการที่ ${bad + 1} ในไฟล์เสีย`);
  if (o.categories && !(Array.isArray(o.categories) && o.categories.every((c) => c && str(c.id) && (c.type === 'in' || c.type === 'out')))) {
    return fail('ข้อมูลหมวดในไฟล์เสีย');
  }
  if (o.recurring && !(Array.isArray(o.recurring) && o.recurring.every((r) => r && str(r.id) && money(r.amount) && r.dayOfMonth >= 1 && r.dayOfMonth <= 31))) {
    return fail('ข้อมูลรายการประจำในไฟล์เสีย');
  }
  const { app, exportedAt, ...rest } = o;
  return { ok: true, data: migrate(rest, today), exportedAt: exportedAt || null };
}

/** ใช้ข้อมูลจากไฟล์สำรอง แต่คงการตั้งรหัสผ่านของเครื่องนี้ไว้ */
export function restoreBackup(current, data) {
  const s = migrate(clone(data));
  s.settings.lock = { ...current.settings.lock };
  s.settings.onboarded = true;
  return s;
}

// ---------- แก้หมวด / กระเป๋า / วันเปิดบัญชี (คืน state ใหม่ ไม่แก้ของเดิม) ----------

const uid = (prefix) => `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`;

export function addCategory(state, { name, type, budget = 0, short = '' }) {
  const s = clone(state);
  const sameType = s.categories.filter((c) => c.type === type).length;
  s.categories.push({
    id: uid('c'), name, type, budget: type === 'out' ? budget : 0,
    short: short || [...name].slice(0, 4).join(''),
    color: type === 'in' ? COLORS.green : CATEGORY_CYCLE[sameType % CATEGORY_CYCLE.length],
  });
  return s;
}

/** ลบหมวด: ถ้ามีรายการใช้อยู่ต้องบอกหมวดที่จะย้ายไป (mergeInto) */
export function deleteCategory(state, id, mergeInto = null) {
  const inUse = state.transactions.filter((t) => t.categoryId === id).length
    + state.recurring.filter((r) => r.categoryId === id).length;
  if (inUse && !mergeInto) return { ok: false, inUse };
  const s = clone(state);
  if (mergeInto) {
    for (const t of s.transactions) if (t.categoryId === id) t.categoryId = mergeInto;
    for (const r of s.recurring) if (r.categoryId === id) r.categoryId = mergeInto;
  }
  s.categories = s.categories.filter((c) => c.id !== id);
  return { ok: true, state: s };
}

/** ลบกระเป๋าได้เฉพาะที่ไม่มีรายการ/รายการประจำใช้อยู่ */
export function deleteWallet(state, id) {
  const inUse = state.transactions.some((t) => t.walletId === id || t.fromWalletId === id || t.toWalletId === id)
    || state.recurring.some((r) => r.walletId === id);
  if (inUse) return { ok: false };
  const s = clone(state);
  s.wallets = s.wallets.filter((w) => w.id !== id);
  for (const g of s.goals) g.walletIds = (g.walletIds || []).filter((x) => x !== id);
  return { ok: true, state: s };
}

/** เปลี่ยนวันเปิดบัญชี และเลื่อนกำหนดของเป้าเงินก้อนแรกตามไปด้วย */
export function setAccountDate(state, iso) {
  const s = clone(state);
  s.settings.accountDate = iso;
  const first = s.goals.find((g) => g.id === 'g1') || s.goals.find((g) => g.kind !== 'emergency');
  if (first) first.deadline = iso;
  return s;
}

// ---------- จดรายการ / ย้ายเงิน (คืน state ใหม่ ไม่แก้ของเดิม) ----------

const txId = () => `t_${globalThis.crypto.randomUUID()}`;

/** จดรายรับ/รายจ่าย; repeat = ทำซ้ำทุกเดือนวันที่เดียวกัน (รายรับเท่านั้น) */
export function addEntry(state, { type, amount, categoryId, walletId, date, note = '' }, { repeat = false } = {}) {
  const s = clone(state);
  const tx = { id: txId(), date, type, amount: round2(amount), categoryId, walletId, note: note || '', recurringId: null };
  if (repeat && type === 'in') {
    const cat = s.categories.find((c) => c.id === categoryId);
    const item = {
      id: uid('r'), type, amount: tx.amount, categoryId, walletId,
      dayOfMonth: Number(date.slice(8, 10)), note: tx.note || cat?.name || 'รายรับประจำ',
      lastRun: date, // วันนี้จดเองแล้ว รอบถัดไปจึงเริ่มเดือนหน้า
    };
    s.recurring.push(item);
    tx.recurringId = item.id;
  }
  s.transactions.push(tx);
  return { state: s, tx };
}

const EDITABLE = ['type', 'amount', 'categoryId', 'walletId', 'date', 'note'];
export function updateEntry(state, id, patch) {
  const s = clone(state);
  const t = s.transactions.find((x) => x.id === id);
  if (t) for (const k of EDITABLE) if (k in patch) t[k] = k === 'amount' ? round2(patch[k]) : patch[k];
  return s;
}

export function deleteEntry(state, id) {
  const s = clone(state);
  s.transactions = s.transactions.filter((x) => x.id !== id);
  return s;
}

/** ย้ายเงินระหว่างกระเป๋า (ไม่นับเป็นรายรับ/รายจ่าย) — ย้ายเกินยอดในกระเป๋าต้นทางไม่ได้ */
export function addTransfer(state, { fromWalletId, toWalletId, amount, date, note = 'ออมเข้าเป้า' }) {
  const fail = (error) => ({ ok: false, error });
  const has = (id) => state.wallets.some((w) => w.id === id);
  const a = round2(amount);
  if (!(a > 0)) return fail('ใส่จำนวนเงินมากกว่า 0');
  if (!has(fromWalletId) || !has(toWalletId)) return fail('เลือกกระเป๋าก่อน');
  if (fromWalletId === toWalletId) return fail('กระเป๋าต้นทางกับปลายทางต้องเป็นคนละใบ');
  if (a > walletBalance(state, fromWalletId)) return fail('เกินยอดในกระเป๋าต้นทาง');
  const s = clone(state);
  s.transactions.push({ id: txId(), date, type: 'transfer', amount: a, fromWalletId, toWalletId, note });
  return { ok: true, state: s };
}

// ---------- เป้าหมาย / แบ่งเงิน / เช็กลิสต์ ----------

const knownWallets = (s, ids) => (Array.isArray(ids) ? ids : []).filter((id) => s.wallets.some((w) => w.id === id));
const goalName = (n) => String(n ?? '').trim().slice(0, 40);

/** เพิ่มเป้าหมายใหม่ (แบบมีวันครบกำหนด) */
export function addGoal(state, { name, target, deadline, walletIds = [] }) {
  const s = clone(state);
  const goal = {
    id: uid('g'), name: goalName(name) || 'เป้าหมายใหม่', target: round2(Math.max(0, Number(target) || 0)),
    deadline, walletIds: knownWallets(s, walletIds), kind: 'custom',
  };
  s.goals.push(goal);
  return { state: s, goal };
}

/** แก้เป้าหมาย; เป้าแรก (g1) เปลี่ยนวันที่ = เปลี่ยนวันเปิดบัญชีด้วย */
export function updateGoal(state, id, patch) {
  let s = clone(state);
  const g = s.goals.find((x) => x.id === id);
  if (!g) return s;
  const em = g.kind === 'emergency';
  if ('name' in patch && !em) g.name = goalName(patch.name) || g.name;
  if ('target' in patch && !em) g.target = round2(Math.max(0, Number(patch.target) || 0));
  if ('walletIds' in patch) g.walletIds = knownWallets(s, patch.walletIds);
  if ('multiplier' in patch && em) g.multiplier = Math.min(12, Math.max(1, Math.round(Number(patch.multiplier) || 1)));
  if ('deadline' in patch && !em) {
    if (id === 'g1') s = setAccountDate(s, patch.deadline); // ทำเป็นอย่างสุดท้าย: setAccountDate คืน state ชุดใหม่
    else g.deadline = patch.deadline;
  }
  return s;
}

/** ลบเป้าหมาย (เป้าแรกกับเงินฉุกเฉินลบไม่ได้) */
export function deleteGoal(state, id) {
  const s = clone(state);
  const g = s.goals.find((x) => x.id === id);
  if (!g || g.id === 'g1' || g.kind === 'emergency') return s;
  s.goals = s.goals.filter((x) => x.id !== id);
  return s;
}

/** แบ่งเงินตอนเปิดบัญชี: หุ้นตัวเดียว / ETF-กองทุน / เงินสดสำรอง (จำนวนเต็ม รวม 100) */
export const ALLOC_KEYS = ['stock', 'fund', 'cash'];
function validAllocation(a) {
  if (!a || typeof a !== 'object') return false;
  const v = ALLOC_KEYS.map((k) => a[k]);
  return v.every((x) => Number.isInteger(x) && x >= 0 && x <= 100) && v.reduce((x, y) => x + y, 0) === 100;
}
function pickAllocation(a) {
  return Object.fromEntries(ALLOC_KEYS.map((k) => [k, a[k]]));
}
export function setAllocation(state, alloc) {
  if (alloc !== null && !validAllocation(alloc)) throw new Error('สัดส่วนต้องเป็นจำนวนเต็มและรวมกันได้ 100');
  const s = clone(state);
  s.allocation = alloc === null ? null : pickAllocation(alloc);
  return s;
}

/** เช็กลิสต์ก่อนเปิดบัญชี (ข้อที่ติ๊กเองได้ + โน้ตเหตุผล) */
const CHECK_KEYS = ['talkParent', 'channel', 'docs', 'why'];
export function setChecklist(state, patch) {
  const s = clone(state);
  for (const k of CHECK_KEYS) if (k in patch) s.checklist[k] = Boolean(patch[k]);
  if ('whyNote' in patch) s.checklist.whyNote = String(patch.whyNote ?? '').trim().slice(0, 2000);
  return s;
}

// ---------- เครื่องจำลอง (จำค่าที่ใช้ล่าสุด) ----------

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const within = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** ตั้งค่าเครื่องจำลอง: ตัวเลขบีบให้อยู่ในช่วงสไลเดอร์ (ค่าเพี้ยน = ไม่เปลี่ยน); สมมติฐานผลตอบแทนผิด → throw */
export function setSim(state, patch) {
  const s = clone(state);
  const sim = s.sim;
  if (finite(patch.initial)) sim.initial = within(Math.round(patch.initial), 0, 200000);
  if (finite(patch.monthly)) sim.monthly = within(Math.round(patch.monthly), 0, 10000);
  if (finite(patch.years)) sim.years = within(Math.round(patch.years), 1, 15);
  if (finite(patch.fee)) sim.fee = within(Math.round(patch.fee * 10) / 10, 0, 2);
  if (patch.rates) {
    const r = patch.rates;
    const ok = ['bad', 'mid', 'good'].every((k) => finite(r[k]) && r[k] >= -50 && r[k] <= 50);
    if (!ok || r.bad > r.mid || r.mid > r.good) throw new Error('ผลตอบแทนต้องอยู่ระหว่าง −50 ถึง 50 และ แย่ ≤ กลาง ≤ ดี');
    const r1 = (x) => Math.round(x * 10) / 10;
    sim.rates = { bad: r1(r.bad), mid: r1(r.mid), good: r1(r.good) };
  }
  return s;
}

// ---------- บทเรียน / ข่าว ----------

/** ทำเครื่องหมายอ่านจบ (ต่อท้าย = ลำดับที่อ่านจบ) หรือเอาออก */
export function setLessonDone(state, id, done = true) {
  const s = clone(state);
  const key = String(id);
  if (!LESSON_ID.test(key)) return s;
  if (!done) s.learn.done = s.learn.done.filter((x) => x !== key);
  else if (!s.learn.done.includes(key)) s.learn.done.push(key);
  return s;
}

/** จำตัวเลือกที่ตอบในคำถามทบทวน (บท lessonId ข้อ index) */
export function answerQuiz(state, lessonId, index, pick) {
  const s = clone(state);
  const id = String(lessonId);
  if (!LESSON_ID.test(id) || !Number.isInteger(index) || !Number.isInteger(pick) || index < 0 || pick < 0) return s;
  s.learn.quiz[id] = { ...(s.learn.quiz[id] || {}), [index]: pick };
  return s;
}

/** ล้างคำตอบของบทนั้น (ทำใหม่) */
export function resetQuiz(state, lessonId) {
  const s = clone(state);
  delete s.learn.quiz[String(lessonId)];
  return s;
}

/** จำว่าเปิดดูสรุปข่าวฉบับนี้แล้ว (ป้าย "ใหม่" หาย) */
export function markNewsSeen(state, date) {
  const s = clone(state);
  if (!realDate(date) || s.news.seen.includes(date)) return s;
  s.news.seen = [...s.news.seen, date].slice(-NEWS_SEEN_MAX);
  return s;
}
