// หน้าเรียนรู้ / ข่าว: บทถัดไป, ความคืบหน้า, คำถามทบทวน, ป้ายข่าวใหม่, สถานะที่เก็บในเครื่อง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { learnProgress, nextLesson, lessonAfter, quizPick, newsBadge, fetchContent } from '../app/content.js';
import { defaultState, migrate, setLessonDone, answerQuiz, resetQuiz, markNewsSeen } from '../app/store.js';
import { weekRange } from '../app/ui.js';

const Q = (q, answer = 0) => ({ q, options: ['ก', 'ข', 'ค'], answer, explain: 'เพราะ' });
const written = (n, quiz = []) => ({ n, id: String(n), title: `บท ${n}`, desc: '', written: true, asOf: '2026-11-20', minutes: 4, html: '<p>x</p>', tail: '', quiz });
const unwritten = (n) => ({ n, id: String(n), title: `บท ${n}`, desc: '', written: false });
const CONTENT = {
  version: 1,
  lessons: [unwritten(1), written(2, [Q('ข้อ 1', 1), Q('ข้อ 2')]), written(3, [Q('ข้อ A', 2)]), written(4), unwritten(5)],
  refs: {}, glossary: [], watchlist: [],
  digests: [
    { date: '2026-11-21', title: 'ใหม่', intro: '', top: [{}, {}, {}], sections: [] },
    { date: '2026-11-14', title: 'เก่า', intro: '', top: [{}, {}], sections: [] },
  ],
};
const learn = (done = [], quiz = {}) => ({ done, quiz });

test('learnProgress: นับเฉพาะบทที่มีจริง ไม่นับซ้ำ (ยังไม่โหลดเนื้อหา → นับที่จดไว้ ไม่เกิน 12)', () => {
  assert.deepEqual(learnProgress(CONTENT, learn(['2', '2', '9', 'x'])), { done: 1, total: 5 });
  assert.deepEqual(learnProgress(null, learn(['1', '2', '2'])), { done: 2, total: 12 });
  assert.deepEqual(learnProgress(null, undefined), { done: 0, total: 12 });
});

test('nextLesson: บทแรกที่ยังไม่อ่านและเขียนแล้ว → ถ้าไม่มี ใช้บทแรกที่ยังไม่อ่าน → อ่านครบ = null', () => {
  assert.equal(nextLesson(CONTENT, learn()).id, '2');
  assert.equal(nextLesson(CONTENT, learn(['2'])).id, '3');
  assert.equal(nextLesson(CONTENT, learn(['2', '3', '4'])).id, '1');
  assert.equal(nextLesson(CONTENT, learn(['1', '2', '3', '4', '5'])), null);
  assert.equal(nextLesson(null, learn()), null);
});

test('lessonAfter: บทถัดไปที่เขียนแล้ว (ข้ามบทที่ยังไม่เขียน)', () => {
  assert.equal(lessonAfter(CONTENT, '2').id, '3');
  assert.equal(lessonAfter(CONTENT, '4'), null);
  assert.equal(lessonAfter(CONTENT, '1').id, '2');
});

test('quizPick: ใช้บทที่อ่านจบล่าสุดที่มีคำถาม เลือกข้อแรกที่ยังไม่ตอบ', () => {
  const p = quizPick(CONTENT, learn(['3', '2']));
  assert.equal(p.lesson.id, '2');
  assert.equal(p.index, 0);
  assert.equal(p.picked, null);
  assert.equal(quizPick(CONTENT, learn(['3', '2'], { 2: { 0: 1 } })).index, 1);
  assert.equal(quizPick(CONTENT, learn(['2', '3'])).lesson.id, '3');
  assert.equal(quizPick(CONTENT, learn(['2', '4'])).lesson.id, '2', 'บทล่าสุดไม่มีคำถาม → ย้อนไปบทก่อน');
});

test('quizPick: ตอบครบแล้ว → ค้างข้อสุดท้ายพร้อมเฉลย, ข้อที่เพิ่งตอบยังค้างอยู่จนกดข้อถัดไป', () => {
  const all = quizPick(CONTENT, learn(['2'], { 2: { 0: 1, 1: 0 } }));
  assert.deepEqual([all.index, all.picked, all.allDone], [1, 0, true]);
  const cur = quizPick(CONTENT, learn(['2'], { 2: { 0: 2 } }), { id: '2', index: 0 });
  assert.deepEqual([cur.index, cur.picked, cur.allDone], [0, 2, false]);
  assert.equal(quizPick(CONTENT, learn(['2'], { 2: { 0: 2 } }), { id: '2', index: 9 }).index, 1, 'ข้อที่จำไว้ไม่มีแล้ว → ข้อที่ยังไม่ตอบ');
});

test('quizPick: ยังไม่อ่านจบสักบท / บทที่อ่านไม่มีคำถาม / ยังไม่โหลดเนื้อหา → null', () => {
  assert.equal(quizPick(CONTENT, learn()), null);
  assert.equal(quizPick(CONTENT, learn(['1', '4'])), null);
  assert.equal(quizPick(null, learn(['2'])), null);
});

test('newsBadge: ฉบับล่าสุดยังไม่เปิดดู → จำนวนเรื่องสำคัญ, เปิดแล้ว → 0', () => {
  assert.equal(newsBadge(CONTENT, { seen: [] }), 3);
  assert.equal(newsBadge(CONTENT, { seen: ['2026-11-14'] }), 3);
  assert.equal(newsBadge(CONTENT, { seen: ['2026-11-21'] }), 0);
  assert.equal(newsBadge({ ...CONTENT, digests: [{ ...CONTENT.digests[0], top: [] }] }, { seen: [] }), 1);
  assert.equal(newsBadge({ ...CONTENT, digests: [] }, { seen: [] }), 0);
  assert.equal(newsBadge(null, { seen: [] }), 0);
});

test('fetchContent: ไม่ใช้แคชเก่า ไม่ส่ง cookie ข้ามเว็บ, ไฟล์ผิดรูป/โหลดไม่ได้ → throw', async () => {
  let call;
  const ok = async (url, opts) => {
    call = [url, opts];
    return { ok: true, json: async () => CONTENT };
  };
  assert.equal((await fetchContent(ok)).lessons.length, 5);
  assert.equal(call[0], 'data/content.json');
  assert.equal(call[1].cache, 'no-cache');
  assert.equal(call[1].credentials, 'same-origin');
  await assert.rejects(fetchContent(async () => ({ ok: false, status: 404 })));
  await assert.rejects(fetchContent(async () => ({ ok: true, json: async () => ({ version: 2 }) })));
});

// ---------- เก็บในเครื่อง ----------

test('setLessonDone: เพิ่มเป็นข้อความ ไม่ซ้ำ ต่อท้าย (ลำดับ = อ่านจบเมื่อไหร่) และเอาออกได้ ไม่แก้ state เดิม', () => {
  const s = defaultState('2026-11-15');
  const a = setLessonDone(s, 2, true);
  assert.deepEqual(a.learn.done, ['2']);
  assert.deepEqual(s.learn.done, []);
  const b = setLessonDone(setLessonDone(a, '1', true), '2', true);
  assert.deepEqual(b.learn.done, ['2', '1']);
  assert.deepEqual(setLessonDone(b, '2', false).learn.done, ['1']);
});

test('answerQuiz / resetQuiz: จำตัวเลือกที่ตอบต่อบทต่อข้อ ล้างได้ทีละบท', () => {
  const s = defaultState('2026-11-15');
  const a = answerQuiz(answerQuiz(s, '2', 0, 1), '2', 1, 0);
  assert.deepEqual(a.learn.quiz, { 2: { 0: 1, 1: 0 } });
  assert.deepEqual(s.learn.quiz, {});
  assert.deepEqual(resetQuiz(answerQuiz(a, '3', 0, 2), '2').learn.quiz, { 3: { 0: 2 } });
});

test('markNewsSeen: จำวันที่ของสรุปที่เปิดดูแล้ว ไม่ซ้ำ เก็บไม่เกิน 60', () => {
  let s = defaultState('2026-11-15');
  s = markNewsSeen(markNewsSeen(s, '2026-11-14'), '2026-11-14');
  assert.deepEqual(s.news.seen, ['2026-11-14']);
  for (let i = 0; i < 70; i++) s = markNewsSeen(s, `2027-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + Math.floor(i / 12)).padStart(2, '0')}`);
  assert.equal(s.news.seen.length, 60);
});

test('migrate: learn/news ที่เพี้ยน (เช่นไฟล์สำรองแก้มือ) → ค่าที่ใช้ได้', () => {
  const a = migrate({ learn: { done: 'abc', quiz: [] }, news: { seen: 'x' } }, '2026-11-15');
  assert.deepEqual(a.learn, { done: [], quiz: {} });
  assert.deepEqual(a.news, { seen: [] });
  const b = migrate({
    learn: { done: [1, '2', '2', null, {}, 'x'], quiz: { 2: { 0: 1, 1: 'x', 2: -1 }, 3: 5 } },
    news: { seen: ['2026-11-14', 'bad', 3] },
  }, '2026-11-15');
  assert.deepEqual(b.learn, { done: ['1', '2'], quiz: { 2: { 0: 1 } } });
  assert.deepEqual(b.news, { seen: ['2026-11-14'] });
});

test('weekRange: ช่วง 7 วันที่สรุป (ข้ามเดือน / ข้ามปีแสดงครบ)', () => {
  assert.equal(weekRange('2026-11-14'), '8–14 พ.ย. 2569');
  assert.equal(weekRange('2026-11-03'), '28 ต.ค.–3 พ.ย. 2569');
  assert.equal(weekRange('2027-01-04'), '29 ธ.ค. 2569–4 ม.ค. 2570');
});
