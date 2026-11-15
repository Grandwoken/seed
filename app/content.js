// SEED — เนื้อหาบทเรียน/ข่าวจาก data/content.json (สร้างโดย npm run build:content) + ตัวช่วยที่หน้าจอใช้
// HTML ใน content.json ผ่านการล้างตอน build แล้ว (scripts/content-lib.mjs)

export const CONTENT_URL = 'data/content.json';

/** โหลด content.json จากเว็บเดียวกัน (ไม่ใช้แคชเก่าของเบราว์เซอร์) → object หรือ throw */
export async function fetchContent(fetchFn) {
  const r = await fetchFn(CONTENT_URL, { cache: 'no-cache', credentials: 'same-origin' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const c = await r.json();
  if (!c || c.version !== 1 || !Array.isArray(c.lessons) || !Array.isArray(c.digests)) throw new Error('content.json รูปแบบไม่ถูก');
  return c;
}

const doneList = (learn) => [...new Set((Array.isArray(learn?.done) ? learn.done : []).map(String))];

/** อ่านจบกี่บทจากทั้งหมด (ยังไม่โหลดเนื้อหา → นับที่จดไว้ ไม่เกิน 12) */
export function learnProgress(content, learn) {
  const done = doneList(learn);
  if (!content) return { done: Math.min(done.length, 12), total: 12 };
  const ids = new Set(content.lessons.map((l) => l.id));
  return { done: done.filter((d) => ids.has(d)).length, total: content.lessons.length };
}

/** บทถัดไป: บทแรกที่ยังไม่อ่านและเขียนแล้ว → ถ้าไม่มี บทแรกที่ยังไม่อ่าน → อ่านครบ = null */
export function nextLesson(content, learn) {
  if (!content) return null;
  const done = new Set(doneList(learn));
  const open = content.lessons.filter((l) => !done.has(l.id));
  return open.find((l) => l.written) || open[0] || null;
}

/** บทที่เขียนแล้วบทถัดจาก id (สำหรับปุ่ม "บทถัดไป" ท้ายบท) */
export function lessonAfter(content, id) {
  if (!content) return null;
  return content.lessons.find((l) => l.n > Number(id) && l.written) || null;
}

/**
 * คำถามทบทวน 1 ข้อจากบทที่อ่านจบล่าสุด (ที่มีคำถาม): ข้อแรกที่ยังไม่ตอบ, ตอบครบแล้ว = ข้อสุดท้าย
 * current = { id, index } ข้อที่เพิ่งตอบ (ค้างไว้ให้เห็นเฉลยจนกด "ข้อถัดไป")
 * → { lesson, index, q, picked, allDone } หรือ null
 */
export function quizPick(content, learn, current = null) {
  if (!content || !learn) return null;
  const done = doneList(learn);
  for (let i = done.length - 1; i >= 0; i--) {
    const lesson = content.lessons.find((l) => l.id === done[i]);
    if (!lesson || !lesson.written || !lesson.quiz || !lesson.quiz.length) continue;
    const answers = (learn.quiz && learn.quiz[lesson.id]) || {};
    const has = (k) => Number.isInteger(answers[k]);
    const n = lesson.quiz.length;
    let index;
    if (current && current.id === lesson.id && current.index >= 0 && current.index < n) index = current.index;
    else {
      index = lesson.quiz.findIndex((_, k) => !has(k));
      if (index < 0) index = n - 1;
    }
    return { lesson, index, q: lesson.quiz[index], picked: has(index) ? answers[index] : null, allDone: lesson.quiz.every((_, k) => has(k)) };
  }
  return null;
}

/** ป้าย "n ใหม่": สรุปฉบับล่าสุดที่ยังไม่เปิดดู → จำนวนเรื่องสำคัญ (อย่างน้อย 1) */
export function newsBadge(content, news) {
  const d = content && content.digests && content.digests[0];
  if (!d) return 0;
  const seen = Array.isArray(news?.seen) ? news.seen : [];
  if (seen.includes(d.date)) return 0;
  return (d.top && d.top.length) || 1;
}
