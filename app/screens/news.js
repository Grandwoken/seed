// SEED — ข่าว (#/news) + สรุปฉบับเต็ม (#/news/<YYYY-MM-DD>)
// เนื้อหามาจาก data/content.json (npm run build:content จาก digests/ + watchlist.md) — HTML ผ่านการล้างตอน build แล้ว
import { html, raw, icon, thDay, weekRange } from '../ui.js';
import { markNewsSeen } from '../store.js';
import { backbar } from './common.js';

const TAGS = {
  fact: ['fact', 'ข้อเท็จจริง'],
  forecast: ['opinion', 'คาดการณ์'],
  unconfirmed: ['unconfirmed', 'ยังไม่ยืนยัน'],
};
const GENERIC_LINK = /^(แหล่ง(ที่มา)?|ลิงก์|link|source|ที่มา)\s*\d*$/i;

function notLoaded(app) {
  return app.contentStatus === 'error'
    ? html`<div class="empty-box" id="news-empty">โหลดข่าวไม่ได้ ปิดแล้วเปิดแอพใหม่อีกครั้ง</div>`
    : html`<div class="empty-box" id="news-empty" role="status">กำลังโหลดข่าว…</div>`;
}

/** การ์ดเรื่องสำคัญ 1 เรื่อง: ป้าย + จำนวนแหล่ง + วันที่, หัวข้อ, สรุป 1 บรรทัด, ลิงก์แหล่งที่มา */
function topCard(it, i, prefix) {
  const tag = TAGS[it.tag];
  const when = it.date ? thDay(it.date) : it.dateText;
  const meta = [it.sources > 1 ? `${it.sources} แหล่ง` : '', when || ''].filter(Boolean).join(' · ');
  return html`<article class="card news-card" id="${prefix}-${i}">
    ${tag || it.sources || meta ? html`<div class="news-meta">
      ${tag ? html`<span class="pill ${tag[0]}">${tag[1]}</span>` : ''}
      ${it.sources === 1 ? html`<span class="pill unconfirmed mono">1 แหล่ง</span>` : ''}
      ${meta ? html`<span class="small mono muted">${meta}</span>` : ''}
    </div>` : ''}
    <h3 class="news-title">${it.title}</h3>
    ${it.line ? html`<p class="news-line">${it.line}</p>` : ''}
    ${it.links.length ? html`<div class="news-links">${it.links.map((l, k) => html`<a href="${l.href}" target="_blank" rel="noopener noreferrer">${icon('link', 14)}<span>${GENERIC_LINK.test(l.text) ? `แหล่งที่ ${k + 1}` : l.text}</span><span class="sr"> (เปิดเว็บภายนอก)</span></a>`)}</div>` : ''}
  </article>`;
}

/** สรุปที่ทำก่อนเปลี่ยนรูปแบบ /digest: ไม่มีป้ายและจำนวนแหล่งในรายการ */
const oldNote = (d) => (d.top.some((t) => !t.tag)
  ? html`<p class="small muted" style="line-height:1.6">ฉบับนี้ใช้รูปแบบเก่า ยังไม่มีป้ายข้อเท็จจริง/คาดการณ์และจำนวนแหล่ง ลิงก์อยู่ในฉบับเต็ม</p>`
  : '');

function topList(d, prefix) {
  if (!d.top.length) return '';
  return html`<section class="stack" aria-labelledby="${prefix}-h" id="${prefix}">
    <h2 class="h-title" id="${prefix}-h">${d.top.length} เรื่องสำคัญ</h2>
    ${d.top.map((it, i) => topCard(it, i, prefix))}
    ${oldNote(d)}
  </section>`;
}

const planBox = (s, id) => html`<section class="plan-box" aria-labelledby="${id}-h" id="${id}">
  <h2 id="${id}-h">เกี่ยวกับแผนเรายังไง</h2>
  <div class="prose sm">${raw(s.html)}</div>
</section>`;

const lineBox = (s, id) => html`<section class="card" aria-labelledby="${id}-h" id="${id}" style="gap:10px">
  <div class="row" style="gap:8px"><h2 class="h-title grow" id="${id}-h">ความเห็นจากกลุ่มไลน์</h2><span class="pill opinion">ความเห็น</span></div>
  ${s ? html`<div class="prose sm">${raw(s.html)}</div>`
    : html`<p class="sub" style="line-height:1.6">ฉบับนี้ไม่มี ตอนสั่ง /digest ให้ Claude อ่าน LINE ในคอม หรือวางไฟล์แชต .txt ไว้ในโฟลเดอร์ inbox/</p>`}
</section>`;

const sectionCard = (s, id) => html`<section class="card" aria-labelledby="${id}-h" id="${id}" style="gap:8px">
  <h2 class="h-title" id="${id}-h">${s.heading}</h2>
  <div class="prose sm">${raw(s.html)}</div>
</section>`;

function watchCard(c) {
  return html`<section class="card" aria-label="หัวข้อที่ติดตาม" id="news-watch" style="gap:10px">
    <div class="row between" style="gap:8px"><span class="label">WATCHLIST</span><span class="small muted">แก้ใน watchlist.md</span></div>
    ${c.watchlist.length
      ? html`<ul class="chips bare">${c.watchlist.map((w) => {
        const name = w.ticker ? w.label.replace(/\s*\([A-Z0-9.]+\)\s*$/, '') : w.label;
        return html`<li class="tag-chip">${name}${w.ticker && name !== w.ticker ? html` <span class="mono muted">${w.ticker}</span>` : ''}</li>`;
      })}</ul>`
      : html`<p class="sub">ยังไม่มีหัวข้อ บอก Claude Code ให้เพิ่มใน watchlist.md</p>`}
  </section>`;
}

function archive(app, c) {
  const old = c.digests.slice(1);
  if (!old.length) return '';
  const seen = new Set(app.state.news.seen);
  return html`<section class="card list" aria-labelledby="news-archive-h" id="news-archive">
    <h2 class="label list-head" id="news-archive-h">สรุปสัปดาห์ก่อน ๆ</h2>
    ${old.map((d) => html`<a class="li" href="#/news/${d.date}" id="news-old-${d.date}">
      <span class="grow stack s4" style="padding:10px 0"><span>${weekRange(d.date)}</span><span class="small muted ellipsis">${d.top[0] ? d.top[0].title : d.title}</span></span>
      ${seen.has(d.date) ? '' : html`<span class="new-dot" aria-hidden="true"></span><span class="sr">ยังไม่ได้เปิด</span>`}
      <span class="chev" aria-hidden="true">${icon('next', 18)}</span>
    </a>`)}
  </section>`;
}

function listView(app) {
  const c = app.content;
  const d = c && c.digests[0];
  const sec = (k) => d && d.sections.find((s) => s.key === k);
  const plan = sec('plan');
  const update = sec('update');
  return html`<div class="screen" style="gap:16px">
    <header class="stack s4">
      <h1 style="font-size:24px;font-weight:600">ข่าว</h1>
      ${d ? html`<p class="sub" id="news-range">สรุปสัปดาห์ <span class="nowrap">${weekRange(d.date)}</span></p>` : ''}
    </header>
    ${!c ? notLoaded(app) : html`
      ${watchCard(c)}
      ${!d ? html`<div class="empty-box" id="news-empty">ยังไม่มีสรุป สั่ง /digest ใน Claude Code</div>` : html`
        ${topList(d, 'news-top')}
        ${plan ? planBox(plan, 'news-plan') : ''}
        ${lineBox(sec('line'), 'news-line')}
        ${update ? sectionCard({ ...update, heading: 'ควรอัปเดต' }, 'news-update') : ''}
        <a class="btn raised md" href="#/news/${d.date}" id="news-full">อ่านฉบับเต็ม</a>
        ${archive(app, c)}`}`}
  </div>`;
}

function fullView(app, date) {
  const c = app.content;
  if (!c) return html`<div class="screen">${backbar('ข่าว', 'news')}<h1 class="sr">สรุปข่าว</h1>${notLoaded(app)}</div>`;
  const d = c.digests.find((x) => x.date === date);
  if (!d) {
    return html`<div class="screen">
      ${backbar('ข่าว', 'news')}
      <h1 class="lesson-title">ไม่พบสรุปฉบับนี้</h1>
      <p class="sub" style="line-height:1.6">แอพเก็บ 26 ฉบับล่าสุด ฉบับเก่ากว่านั้นยังอยู่ในโฟลเดอร์ digests/</p>
      <a class="btn raised md" href="#/news" id="news-missing-back">ไปหน้าข่าว</a>
    </div>`;
  }
  return html`<div class="screen" style="gap:16px">
    ${backbar(`สรุปสัปดาห์ ${weekRange(d.date)}`, 'news')}
    <h1 class="lesson-title">${d.title}</h1>
    ${d.intro ? html`<div class="prose sm">${raw(d.intro)}</div>` : ''}
    ${topList(d, 'full-top')}
    ${d.sections.map((s, i) => (s.key === 'plan' ? planBox(s, `full-${i}`) : s.key === 'line' ? lineBox(s, `full-${i}`) : sectionCard(s, `full-${i}`)))}
  </div>`;
}

export default {
  id: 'news',
  title: (app, route) => (route.param ? 'สรุปข่าว' : 'ข่าว'),
  tab: (route) => (route.param ? null : 'news'),
  render(app, route) {
    return route.param ? fullView(app, route.param) : listView(app);
  },
  /** เปิดดูสรุปฉบับไหน = เห็นแล้ว (ป้าย "ข่าวใหม่" ที่หน้าหลักหายไป) */
  mount(app, view, route) {
    const c = app.content;
    if (!c || !c.digests.length) return;
    const date = route.param || c.digests[0].date;
    if (!c.digests.some((d) => d.date === date) || app.state.news.seen.includes(date)) return;
    app.state = markNewsSeen(app.state, date);
    app.save();
  },
};
