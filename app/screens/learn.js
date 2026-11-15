// SEED — เรียนรู้ (#/learn) + หน้าบทเรียน (#/learn/<เลขบท>) + ไฟล์อ้างอิง (#/learn/compare, #/learn/accounts)
// เนื้อหามาจาก data/content.json (npm run build:content) — HTML ผ่านการล้างตอน build แล้ว
import { html, raw, icon, thDate, bool, toast } from '../ui.js';
import { learnProgress, nextLesson, lessonAfter, quizPick } from '../content.js';
import { setLessonDone, answerQuiz, resetQuiz } from '../store.js';
import { backbar as bar } from './common.js';

const REFS = {
  compare: { name: 'เทียบตัวเลือก', cmd: '/compare' },
  accounts: { name: 'ช่องทางเปิดบัญชี', cmd: '/learn' },
};

const backbar = (label) => bar(label, 'learn');

function notLoaded(app) {
  return app.contentStatus === 'error'
    ? html`<div class="empty-box" id="learn-empty">โหลดบทเรียนไม่ได้ ปิดแล้วเปิดแอพใหม่อีกครั้ง</div>`
    : html`<div class="empty-box" id="learn-empty" role="status">กำลังโหลดบทเรียน…</div>`;
}

const answered = (learn, id, k) => Number.isInteger(learn.quiz[id]?.[k]);

/** คำถาม 1 ข้อ: แตะตัวเลือก → เฉลยทันที (ถูก = เขียว, ที่เลือกผิด = ส้ม + บอกข้อที่ถูกเป็นข้อความ) */
function quizBlock(lesson, index, q, picked, prefix) {
  const shown = picked !== null && picked !== undefined;
  const right = shown && picked === q.answer;
  const qid = `${prefix}-${lesson.id}-${index}`;
  return html`<div class="quiz" role="group" aria-labelledby="${qid}-q">
    <p class="quiz-q" id="${qid}-q">${q.q}</p>
    ${q.options.map((o, i) => {
      const st = shown ? (i === q.answer ? 'right' : i === picked ? 'wrong' : '') : '';
      return html`<button class="quiz-opt ${st}" data-act="answer" data-l="${lesson.id}" data-q="${index}" data-o="${i}" id="${qid}-o${i}" ${shown ? raw('aria-disabled="true"') : ''}>
        <span class="grow">${o}</span>${st === 'right' ? html`<span class="quiz-mark">${icon('check', 16, 2.4)}<span class="sr">ข้อที่ถูก</span></span>`
          : st === 'wrong' ? html`<span class="quiz-mark">${icon('close', 16, 2.4)}<span class="sr">ที่เลือก ยังไม่ถูก</span></span>` : ''}
      </button>`;
    })}
    ${shown ? html`<p class="quiz-fb ${right ? 'up' : 'warn'}" id="${qid}-fb">${right ? 'ถูก' : `ยังไม่ใช่ ข้อที่ถูกคือ “${q.options[q.answer]}”`}${q.explain ? ` ${q.explain}` : ''}</p>` : ''}
  </div>`;
}

// ---------- หน้ารวม ----------

function nextCard(c, learn) {
  const prog = learnProgress(c, learn);
  const L = nextLesson(c, learn);
  if (!c.lessons.length) {
    return html`<div class="empty-box" id="learn-next">ยังไม่มีรายการบทเรียน (knowledge/00-roadmap.md)</div>`;
  }
  if (!L) {
    return html`<section class="card next-card" aria-label="บทถัดไป" id="learn-next">
      <div class="label">ครบแล้ว</div>
      <h2 class="next-title">อ่านครบ ${prog.total} บทแล้ว</h2>
      <p class="next-desc">ย้อนอ่านบทไหนก็ได้จากรายการด้านล่าง</p>
    </section>`;
  }
  return html`<section class="card next-card" aria-label="บทถัดไป" id="learn-next">
    <div class="label">${L.written ? `NEXT · อ่านราว ${L.minutes} นาที` : 'NEXT'}</div>
    <h2 class="next-title">บทที่ ${L.n} · ${L.title}</h2>
    ${L.desc ? html`<p class="next-desc">${L.desc}</p>` : ''}
    ${L.written
      ? html`<a class="btn md next-btn" href="#/learn/${L.id}" id="learn-next-go">${prog.done ? 'อ่านต่อ' : 'เริ่มอ่าน'}</a>`
      : html`<p class="next-desc" id="learn-next-wait">บทนี้ยังไม่ได้เขียน สั่ง <span class="mono">/learn</span> ใน Claude Code แล้วเปิดแอพใหม่</p>`}
  </section>`;
}

function quizCard(app, c) {
  const learn = app.state.learn;
  const p = quizPick(c, learn, app.local.quizCur);
  if (!p) return '';
  const left = p.lesson.quiz.some((_, k) => !answered(learn, p.lesson.id, k));
  let foot = '';
  if (p.picked !== null && left) foot = html`<button class="link-btn lg" data-act="quizNext" id="quiz-next" style="align-self:flex-start">ข้อถัดไป ›</button>`;
  else if (p.picked !== null) {
    foot = html`<div class="row between" style="gap:8px"><span class="small muted">ตอบครบ ${p.lesson.quiz.length} ข้อแล้ว</span>
      <button class="link-btn lg" data-act="quizReset" data-l="${p.lesson.id}" id="quiz-reset">ทำใหม่</button></div>`;
  }
  return html`<section class="card" aria-label="ทบทวน" id="learn-quiz" style="gap:10px">
    <div class="label">QUIZ · ทบทวนบทที่ ${p.lesson.n} · ข้อ ${p.index + 1}/${p.lesson.quiz.length}</div>
    ${quizBlock(p.lesson, p.index, p.q, p.picked, 'lq')}
    ${foot}
  </section>`;
}

function lessonList(c, learn) {
  const done = new Set(learn.done);
  const next = nextLesson(c, learn);
  return html`<section class="card list" aria-label="บทเรียนทั้งหมด" id="learn-list">
    ${c.lessons.map((l) => {
      const isDone = done.has(l.id);
      const cur = !isDone && next && next.id === l.id;
      return html`<a class="li lesson-row ${isDone ? 'done' : cur ? 'cur' : ''}" href="#/learn/${l.id}" id="lesson-${l.id}">
        <span class="lesson-dot" aria-hidden="true">${isDone ? icon('check', 14, 2.6) : String(l.n)}</span>
        <span class="grow">${l.n}. ${l.title}${isDone ? html`<span class="sr"> (อ่านจบแล้ว)</span>` : cur ? html`<span class="sr"> (บทถัดไป)</span>` : ''}</span>
        ${l.written ? '' : html`<span class="small faint nowrap">ยังไม่เขียน</span>`}
      </a>`;
    })}
  </section>`;
}

function refsCard(c) {
  const cmp = c.refs.compare;
  const acc = c.refs.accounts;
  const compare = cmp
    ? html`<section class="card" aria-label="เทียบตัวเลือก" id="learn-compare" style="gap:10px">
        <div class="row between base" style="gap:8px"><h2 class="h-title">เทียบตัวเลือก</h2>${cmp.asOf ? html`<span class="small muted nowrap" id="learn-compare-date">อัปเดต: ${thDate(cmp.asOf)}</span>` : ''}</div>
        <p class="sub" style="line-height:1.6">${cmp.title}</p>
        ${cmp.items.length ? html`<div class="chips" style="gap:6px">${cmp.items.map((t) => html`<span class="tag-chip mono">${t}</span>`)}</div>` : ''}
        <a class="link-btn lg" href="#/learn/compare" id="learn-compare-open">เปิดตารางเทียบ ›</a>
      </section>`
    : html`<section class="card" aria-label="เทียบตัวเลือก" id="learn-compare" style="gap:8px">
        <h2 class="h-title">เทียบตัวเลือก</h2>
        <p class="sub">ยังไม่มีตารางเทียบ สั่ง <span class="mono">/compare</span> ใน Claude Code</p>
      </section>`;
  const accounts = acc
    ? html`<a class="card row" href="#/learn/accounts" id="learn-accounts" style="flex-direction:row;gap:12px;padding:14px 18px">
        <span class="ico-tile">${icon('wallet', 20)}</span>
        <span class="grow stack s4"><span style="font-size:14px;font-weight:500;line-height:1.45">${acc.title}</span>${acc.asOf ? html`<span class="small muted">อัปเดต: ${thDate(acc.asOf)}</span>` : ''}</span>
        <span class="chev">${icon('next', 18)}</span>
      </a>`
    : '';
  return html`${compare}${accounts}`;
}

function srcText(c, src) {
  if (REFS[src]) return [REFS[src].name, `#/learn/${src}`];
  const l = c.lessons.find((x) => x.id === src);
  return l ? [`บทที่ ${l.n}`, `#/learn/${l.id}`] : null;
}

function glossary(app, c) {
  if (!c.glossary.length) {
    return html`<section aria-label="คำศัพท์" class="stack" id="learn-glossary" style="gap:8px">
      <h2 class="h-title">คำศัพท์</h2>
      <p class="sub">ยังไม่มีคำศัพท์ จะขึ้นเมื่อบทเรียนมีหัวข้อ “คำศัพท์”</p>
    </section>`;
  }
  const sel = app.local.term ?? null;
  const g = sel !== null ? c.glossary[sel] : null;
  const from = g && srcText(c, g.src);
  return html`<section aria-label="คำศัพท์" class="stack" id="learn-glossary" style="gap:10px">
    <h2 class="h-title">คำศัพท์</h2>
    <div class="chips">${c.glossary.map((x, i) => html`<button class="chip term-chip" data-act="term" data-i="${i}" id="term-${i}" aria-expanded="${bool(i === sel)}" aria-controls="term-def">${x.term}</button>`)}</div>
    <div id="term-def" aria-live="polite">${g ? html`<p class="note info" style="line-height:1.7"><b>${g.term}</b> = ${g.def}${from ? html` <a href="${from[1]}" class="nowrap">· จาก${from[0]}</a>` : ''}</p>` : ''}</div>
  </section>`;
}

function listView(app) {
  const c = app.content;
  const learn = app.state.learn;
  const prog = learnProgress(c, learn);
  const next = c && nextLesson(c, learn);
  const done = new Set(learn.done);
  return html`<div class="screen" style="gap:16px">
    <header class="row between base">
      <h1 style="font-size:24px;font-weight:600">เรียนรู้</h1>
      ${prog.total ? html`<span class="mono muted" style="font-size:14px" id="learn-progress">${prog.done} / ${prog.total} บท</span>` : ''}
    </header>
    ${c ? html`
      <div class="lesson-bar" role="img" aria-label="อ่านจบ ${prog.done} จาก ${prog.total} บท">${c.lessons.map((l) => html`<span class="${done.has(l.id) ? 'on' : next && next.id === l.id ? 'cur' : ''}"></span>`)}</div>
      ${nextCard(c, learn)}
      ${quizCard(app, c)}
      ${c.lessons.length ? lessonList(c, learn) : ''}
      ${refsCard(c)}
      ${glossary(app, c)}` : notLoaded(app)}
  </div>`;
}

// ---------- หน้าบทเรียน / ไฟล์อ้างอิง ----------

function lessonView(app, c, L) {
  const learn = app.state.learn;
  const total = c.lessons.length;
  if (!L.written) {
    return html`<div class="screen">
      ${backbar(`บทที่ ${L.n} / ${total}`)}
      <h1 class="lesson-title">${L.title}</h1>
      ${L.desc ? html`<p class="sub" style="line-height:1.6">${L.desc}</p>` : ''}
      <div class="empty-box" id="lesson-empty">บทนี้ยังไม่ได้เขียน สั่ง /learn ${L.n} ใน Claude Code แล้วเปิดแอพใหม่</div>
    </div>`;
  }
  const done = learn.done.includes(L.id);
  const after = lessonAfter(c, L.id);
  const anyAnswered = L.quiz.some((_, k) => answered(learn, L.id, k));
  return html`<div class="screen" style="gap:16px">
    ${backbar(`บทที่ ${L.n} / ${total} · อ่านราว ${L.minutes} นาที`)}
    <h1 class="lesson-title">${L.title}</h1>
    <article class="prose" id="lesson-body">${raw(L.html)}</article>
    ${L.quiz.length ? html`<section class="card" aria-label="คำถามทบทวน" id="lesson-quiz" style="gap:14px">
      <div class="row between"><h2 class="h-title">คำถามทบทวน</h2>${anyAnswered ? html`<button class="link-btn" data-act="quizReset" data-l="${L.id}" id="lesson-quiz-reset">ทำใหม่</button>` : ''}</div>
      ${L.quiz.map((q, i) => quizBlock(L, i, q, learn.quiz[L.id]?.[i] ?? null, 'ls'))}
    </section>` : ''}
    ${L.tail ? html`<div class="prose" id="lesson-tail">${raw(L.tail)}</div>` : ''}
    <button class="btn ${done ? 'raised' : ''}" data-act="done" data-l="${L.id}" id="lesson-done" aria-pressed="${bool(done)}">
      ${done ? html`${icon('check', 18, 2.4)}อ่านจบแล้ว` : 'อ่านจบแล้ว'}</button>
    ${done ? html`<p class="small muted" style="text-align:center;margin-top:-8px">แตะอีกครั้งถ้าอยากเอาเครื่องหมายออก</p>` : ''}
    ${after ? html`<a class="card row" href="#/learn/${after.id}" id="lesson-next" style="flex-direction:row;padding:14px 18px;gap:10px">
      <span class="grow stack s4"><span class="small muted">บทถัดไป</span><span style="font-size:14px;font-weight:500">${after.n}. ${after.title}</span></span>
      <span class="chev">${icon('next', 18)}</span></a>` : ''}
  </div>`;
}

function refView(app, c, id) {
  const r = c.refs[id];
  const meta = REFS[id];
  if (!r) {
    return html`<div class="screen">
      ${backbar(meta.name)}
      <h1 class="lesson-title">${meta.name}</h1>
      <div class="empty-box" id="ref-empty">ยังไม่มีไฟล์นี้ สั่ง ${meta.cmd} ใน Claude Code</div>
    </div>`;
  }
  return html`<div class="screen" style="gap:14px">
    ${backbar(r.asOf ? `อัปเดต: ${thDate(r.asOf)}` : meta.name)}
    <h1 class="lesson-title">${r.title}</h1>
    <article class="prose" id="ref-body">${raw(r.html)}</article>
  </div>`;
}

function detailView(app, param) {
  const c = app.content;
  if (!c) return html`<div class="screen">${backbar('เรียนรู้')}<h1 class="sr">บทเรียน</h1>${notLoaded(app)}</div>`;
  if (REFS[param]) return refView(app, c, param);
  const L = c.lessons.find((l) => l.id === param);
  if (L) return lessonView(app, c, L);
  return html`<div class="screen">
    ${backbar('เรียนรู้')}
    <h1 class="lesson-title">ไม่พบบทเรียนนี้</h1>
    <a class="btn raised md" href="#/learn" id="learn-missing-back">ไปหน้าเรียนรู้</a>
  </div>`;
}

export default {
  id: 'learn',
  title: (app, route) => (!route.param ? 'เรียนรู้' : REFS[route.param] ? REFS[route.param].name : `บทที่ ${route.param}`),
  tab: (route) => (route.param ? null : 'learn'),
  render(app, route) {
    return route.param ? detailView(app, route.param) : listView(app);
  },
  actions: {
    answer(app, el) {
      const id = el.dataset.l;
      const q = Number(el.dataset.q);
      if (answered(app.state.learn, id, q)) return; // ตอบแล้ว (กดทำใหม่ถ้าจะตอบอีกรอบ)
      app.state = answerQuiz(app.state, id, q, Number(el.dataset.o));
      app.save();
      if (!app.route.param) app.local.quizCur = { id, index: q }; // ค้างข้อนี้ไว้ให้เห็นเฉลย
      app.render();
    },
    quizNext(app) {
      delete app.local.quizCur;
      app.render();
      document.getElementById('learn-quiz')?.querySelector('.quiz-opt')?.focus({ preventScroll: true });
    },
    quizReset(app, el) {
      app.state = resetQuiz(app.state, el.dataset.l);
      app.save();
      delete app.local.quizCur;
      app.render();
    },
    done(app, el) {
      const id = el.dataset.l;
      const was = app.state.learn.done.includes(id);
      app.state = setLessonDone(app.state, id, !was);
      app.save();
      toast(was ? 'เอาเครื่องหมายอ่านจบออกแล้ว' : 'บันทึกแล้ว อ่านจบบทนี้');
      app.render();
    },
    term(app, el) {
      const i = Number(el.dataset.i);
      app.local.term = app.local.term === i ? null : i;
      app.render();
    },
  },
};
