// SEED — อ่าน knowledge/ digests/ watchlist.md แล้วรวมเป็น content.json (ฟังก์ชันล้วน ไม่แตะไฟล์)
// content.json ขึ้นเว็บสาธารณะพร้อมแอพ: HTML ทุกชิ้นผ่านการล้างที่นี่
// (HTML ดิบถูก escape, ไม่มีรูป, ลิงก์ได้แค่ http(s) หรือหน้าในแอพ, ลิงก์ไป inbox/ หรือ plan.md ถูกตัด)
import { Marked } from '../app/vendor/marked.esm.js';

/** เก็บสรุปข่าวล่าสุดกี่ฉบับ (~ครึ่งปี) — ไฟล์เก่ากว่านี้ยังอยู่ใน digests/ แต่ไม่ขึ้นแอพ */
export const MAX_DIGESTS = 26;

const lines = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n');
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const pad2 = (n) => String(n).padStart(2, '0');

function realDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** ลิงก์ markdown [ข้อความ](ที่อยู่ "ชื่อ") — ที่อยู่มีวงเล็บซ้อนได้ 1 ชั้น เช่น javascript:alert(1) */
const LINK = String.raw`\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*)(?:\s+"[^"]*")?\)`;
const LINK_G = new RegExp(LINK, 'g');
const IMG_OR_LINK_G = new RegExp('!?' + LINK, 'g');
/** markdown → ข้อความล้วน (เหลือข้อความของลิงก์, ไม่มีตัวหนา/โค้ด) */
const plain = (s) => String(s ?? '').replace(IMG_OR_LINK_G, '$1').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

// ---------- แยกหัวข้อ ----------

/** { title: ข้อความ # แรก, intro: ก่อน ## แรก, sections: [{ heading, body }] } — ## ในบล็อกโค้ดไม่นับ */
export function splitSections(md) {
  let title = null;
  const intro = [];
  const sections = [];
  let cur = null;
  let fence = null;
  for (const line of lines(md)) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (f) fence = fence ? (f[1][0] === fence ? null : fence) : f[1][0];
    else if (!fence) {
      const h1 = line.match(/^#\s+(.+?)(?:\s+#+)?\s*$/);
      if (h1 && title === null && !cur && !intro.some((l) => l.trim())) {
        title = h1[1].trim();
        continue;
      }
      const h2 = line.match(/^##\s+(.+?)(?:\s+#+)?\s*$/);
      if (h2) {
        cur = { heading: h2[1].trim(), lines: [] };
        sections.push(cur);
        continue;
      }
    }
    (cur ? cur.lines : intro).push(line);
  }
  return { title, intro: intro.join('\n'), sections: sections.map((s) => ({ heading: s.heading, body: s.lines.join('\n') })) };
}

const joinSections = (intro, sections) =>
  [intro, ...sections.map((s) => `## ${s.heading}\n${s.body}`)].filter((x) => x && x.trim()).join('\n\n');

/** "ข้อมูล ณ วันที่ YYYY-MM-DD" → วันที่ หรือ null */
export function asOfDate(md) {
  const m = String(md ?? '').match(/ข้อมูล\s*ณ\s*วันที่\s*(\d{4}-\d{2}-\d{2})/);
  return m && realDate(m[1]) ? m[1] : null;
}

/** เวลาอ่านโดยประมาณ (นาที): ภาษาไทย 4.5 ตัวอักษร ≈ 1 คำ, อ่าน 120 คำ/นาที, ไม่นับที่อยู่ลิงก์ */
export function readMinutes(md) {
  const text = String(md ?? '').replace(IMG_OR_LINK_G, '$1').replace(/https?:\/\/\S+/g, ' ');
  const thai = (text.match(/[ก-๛]/g) || []).length;
  const latin = (text.match(/[A-Za-z0-9]+(?:['’.-][A-Za-z0-9]+)*/g) || []).length;
  return Math.max(1, Math.ceil((thai / 4.5 + latin) / 120));
}

// ---------- roadmap / watchlist ----------

/** "N. [ ] **ชื่อบท** — คำอธิบาย" → [{ n, title, desc, checked }] */
export function parseRoadmap(md) {
  const items = [];
  const warnings = [];
  for (const line of lines(md)) {
    const m = line.match(/^\s{0,3}(\d{1,2})[.)]\s+\[( |x|X)\]\s+(.+)$/);
    if (!m) continue;
    const n = Number(m[1]);
    if (items.some((i) => i.n === n)) {
      warnings.push(`roadmap: บทที่ ${n} ซ้ำ ใช้บรรทัดแรก`);
      continue;
    }
    const rest = m[3].trim();
    const b = rest.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    let title;
    let after;
    if (b) [, title, after] = b;
    else {
      const i = rest.search(/\s[—–]\s/);
      title = i >= 0 ? rest.slice(0, i) : rest;
      after = i >= 0 ? rest.slice(i) : '';
    }
    const desc = after
      .replace(/^\s*[—–:-]\s*/, '')
      .replace(new RegExp(String.raw`\s*(?:→|->)?\s*` + LINK, 'g'), '')
      .replace(/\s*\(\d{4}-\d{2}-\d{2}\)/g, '')
      .replace(/\s*(?:→|->)\s*$/, '');
    items.push({ n, title: plain(title), desc: plain(desc), checked: m[2] !== ' ' });
  }
  items.sort((a, b) => a.n - b.n);
  return { items, warnings };
}

/** หัวข้อใน watchlist.md: "N. **ชื่อ (TICKER)**" ระดับบนสุด (ไม่เอาข้อย่อย และหัวข้อที่อยากเพิ่ม) */
export function parseWatchlist(md) {
  const out = [];
  let skip = false;
  for (const line of lines(md)) {
    const h = line.match(/^##\s+(.+)$/);
    if (h) {
      skip = /อยากเพิ่ม/.test(h[1]);
      continue;
    }
    const m = !skip && line.match(/^\d{1,2}[.)]\s+\*\*(.+?)\*\*/);
    if (!m) continue;
    const label = plain(m[1]);
    const t = label.match(/\(([A-Z][A-Z0-9.]{0,5})\)\s*$/);
    const name = label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
    out.push({ label, ticker: t ? t[1] : null, name });
  }
  return out;
}

// ---------- คำศัพท์ / คำถามทบทวน ----------

/** "- **คำ** = ความหมาย" (หรือ — : คือ) → [{ term, def }] */
export function parseGlossary(body) {
  const out = [];
  for (const line of lines(body)) {
    const m = line.match(/^\s*[-*+]\s+\*\*(.+?)\*\*\s*(?:=|:|：|—|–|-|คือ)\s*(.+)$/)
      || line.match(/^\s*[-*+]\s+\*\*(.+?)[:：]\*\*\s*(.+)$/);
    if (!m) continue;
    const term = plain(m[1]);
    const def = plain(m[2]);
    if (term && def) out.push({ term, def });
  }
  return out;
}

/**
 * คำถามทบทวนแบบเลือกตอบ:
 *   1. คำถาม?
 *      - [ ] ตัวเลือก / - [x] ตัวเลือกที่ถูก (1 ข้อพอดี)
 *      - เฉลย: คำอธิบาย
 * → { questions: [{ q, options, answer, explain }], warnings }
 */
export function parseQuiz(body) {
  const questions = [];
  const warnings = [];
  let cur = null;
  const flush = () => {
    if (!cur) return;
    if (cur.options.length < 2) warnings.push(`คำถาม "${cur.q}" มีตัวเลือกน้อยกว่า 2 ข้อ`);
    else if (cur.correct.length !== 1) warnings.push(`คำถาม "${cur.q}" ต้องมีข้อถูก [x] 1 ข้อพอดี (เจอ ${cur.correct.length})`);
    else questions.push({ q: cur.q, options: cur.options, answer: cur.correct[0], explain: cur.explain });
    cur = null;
  };
  for (const line of lines(body)) {
    let m = line.match(/^\s{0,3}\d{1,2}[.)]\s+(.+)$/);
    if (m) {
      flush();
      cur = { q: plain(m[1]), options: [], correct: [], explain: '' };
      continue;
    }
    if (!cur) continue;
    m = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.+)$/);
    if (m) {
      if (m[1] !== ' ') cur.correct.push(cur.options.length);
      cur.options.push(plain(m[2]));
      continue;
    }
    m = line.match(/^\s*(?:[-*+>]\s*)?(?:\*\*)?(?:เฉลย|คำอธิบาย)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(.+)$/);
    if (m) cur.explain = plain(m[1]);
  }
  flush();
  return { questions, warnings };
}

// ---------- 3 เรื่องสำคัญ (สรุปข่าว) ----------

const TAGS = { 'ข้อเท็จจริง': 'fact', 'คาดการณ์': 'forecast', 'ความเห็น': 'forecast', 'ยังไม่ยืนยัน': 'unconfirmed' };
const NEW_FORMAT = '- [ข้อเท็จจริง|คาดการณ์|ยังไม่ยืนยัน] (n แหล่ง, YYYY-MM-DD) หัวข้อ — สรุป 1 บรรทัด ([แหล่ง](ลิงก์))';

/** ตัดวงเล็บที่เหลือแต่จุลภาค (หลังเอาลิงก์ออก) และช่องว่างเกิน */
function tidy(s) {
  let t = s;
  let prev;
  do {
    prev = t;
    t = t.replace(/\(\s*(?:[,;、]\s*)*\)/g, '');
  } while (t !== prev);
  return t.replace(/\s+/g, ' ').replace(/\s+([,;])/g, '$1').trim().replace(/[\s,;]+$/, '');
}

/** ticker จาก watchlist ถ้าหัวข้อข่าวพูดถึงชื่อหรือ ticker นั้น (เช่น "Nvidia" → NVDA) */
function tickerFor(text, watchlist) {
  for (const w of watchlist || []) {
    if (!w.ticker) continue;
    const t = w.ticker.replace(/[.]/g, '\\.');
    if (new RegExp(`(^|[^A-Za-z0-9])${t}([^A-Za-z0-9]|$)`).test(text)) return w.ticker;
    if (/[A-Za-z]{3}/.test(w.name) && text.toLowerCase().includes(w.name.toLowerCase())) return w.ticker;
  }
  return null;
}

/** รายการใน "3 สิ่งสำคัญสุด": รูปแบบใหม่ (มีป้าย) หรือรูปแบบเก่า "1. **หัวข้อ** (วันที่) — สรุป" */
export function parseTopItems(body, watchlist = []) {
  const items = [];
  const warnings = [];
  for (const raw of lines(body)) {
    const li = raw.match(/^\s{0,3}(?:[-*+]|\d{1,2}[.)])\s+(.+)$/);
    if (!li) continue;
    let text = li[1].trim();
    let tag = null;
    let sources = null;
    let date = null;
    let dateText = null;
    const tm = text.match(/^\[([^\]]+)\]\s*(?:\(([^)]*)\))?\s*(.*)$/);
    const tagged = tm && TAGS[tm[1].trim()];
    if (tagged) {
      tag = tagged;
      const meta = tm[2] || '';
      const sm = meta.match(/(\d+)\s*แหล่ง/);
      sources = sm ? Number(sm[1]) : null;
      const dm = meta.match(/\d{4}-\d{2}-\d{2}/);
      date = dm && realDate(dm[0]) ? dm[0] : null;
      text = tm[3];
    }
    const links = [];
    text = tidy(text.replace(LINK_G, (all, t, href) => {
      const to = mapLink(href);
      if (to && /^https?:/i.test(to)) links.push({ text: plain(t) || 'แหล่ง', href: to });
      return '';
    }));
    let title;
    let line;
    const bold = !tagged && text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (bold) {
      title = bold[1];
      let rest = bold[2];
      const p = rest.match(/^\(([^)]*)\)\s*(.*)$/);
      if (p) {
        dateText = p[1].trim();
        rest = p[2];
      }
      line = rest.replace(/^[—–-]\s*/, '');
    } else {
      const i = text.search(/\s[—–]\s/);
      title = i >= 0 ? text.slice(0, i) : text;
      line = i >= 0 ? text.slice(i).replace(/^\s*[—–]\s*/, '') : '';
    }
    title = plain(title);
    line = plain(line);
    if (!title) continue;
    if (!tagged) warnings.push(`"${title}": รูปแบบเก่า ควรเป็น ${NEW_FORMAT}`);
    else if (sources === null || date === null) warnings.push(`"${title}": หลังป้ายต้องมี (n แหล่ง, YYYY-MM-DD)`);
    if (tag === 'fact' && sources !== null && sources < 2) warnings.push(`"${title}": ป้ายข้อเท็จจริงต้องมีอย่างน้อย 2 แหล่ง (กฎข้อ 2) ถ้ามีแหล่งเดียวใช้ [ยังไม่ยืนยัน]`);
    items.push({ tag, sources, date, dateText, title, line, links, ticker: tickerFor(title, watchlist) });
  }
  return { items, warnings };
}

/** ชื่อหัวข้อ ## ของสรุปข่าว (ทั้งแบบเก่าและแบบใหม่) → ส่วนในแอพ */
export function digestKey(heading) {
  const s = String(heading ?? '');
  if (/สำคัญ/.test(s)) return 'top';
  if (/ไลน์|LINE/i.test(s)) return 'line';
  if (/ข้อเท็จจริง/.test(s)) return 'facts';
  if (/ความเห็น|คาดการณ์/.test(s)) return 'opinions';
  if (/แผน/.test(s)) return 'plan';
  if (/อัปเดต|อัพเดต/.test(s)) return 'update';
  if (/ตรวจสอบไม่ได้|ยืนยันไม่ได้/.test(s)) return 'unverified';
  if (/แหล่งข้อมูล|แหล่งที่มา|ลิงก์/.test(s)) return 'sources';
  return null;
}

// ---------- ลิงก์ + HTML ปลอดภัย ----------

/**
 * ลิงก์ในไฟล์ → ที่อยู่ที่แอพใช้ได้ หรือ null (เหลือแต่ข้อความ)
 * http(s) = เว็บข้างนอก, ไฟล์ .md ในโปรเจกต์ = หน้าในแอพ, inbox/ plan.md สคริปต์ อื่น ๆ = ไม่มีลิงก์
 */
export function mapLink(href) {
  const h = String(href ?? '').trim();
  if (/^https?:\/\/[^/\s]/i.test(h)) return h;
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('//') || h.startsWith('#')) return null;
  const path = h.split(/[?#]/)[0].replace(/\\/g, '/');
  if (/(^|\/)inbox(\/|$)/i.test(path) || /(^|\/)plan\.md$/i.test(path)) return null;
  const base = path.split('/').pop();
  if (base === 'compare.md') return '#/learn/compare';
  if (base === 'accounts.md') return '#/learn/accounts';
  if (base === '00-roadmap.md') return '#/learn';
  let m = base.match(/^(\d{2})-.+\.md$/);
  if (m && Number(m[1]) >= 1) return '#/learn/' + Number(m[1]);
  m = base.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  if (m && realDate(m[1])) return '#/news/' + m[1];
  return null;
}

function safeHref(url) {
  try {
    return encodeURI(url).replace(/%25([0-9A-Fa-f]{2})/g, '%$1');
  } catch {
    return null;
  }
}

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  renderer: {
    html({ text }) {
      return esc(text);
    },
    image({ text }) {
      return esc(text || '');
    },
    link({ href, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const to = mapLink(href);
      if (!to) return inner;
      if (to.startsWith('#')) return `<a href="${esc(to)}">${inner}</a>`;
      const safe = safeHref(to);
      return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner;
    },
    codespan({ text }) {
      const code = `<code>${esc(text)}</code>`;
      const to = /^(?:knowledge\/)?(?:compare|accounts)\.md$/.test(text.trim()) ? mapLink(text.trim()) : null;
      return to ? `<a href="${to}">${code}</a>` : code;
    },
  },
});

/** markdown → HTML ที่ปลอดภัยสำหรับใส่ในแอพ */
export function renderMarkdown(md) {
  const src = String(md ?? '');
  return src.trim() ? marked.parse(src).trim() : '';
}

// ---------- รวมทั้งหมด ----------

function lessonFrom(md, file, warn) {
  const { intro, sections } = splitSections(md);
  const qi = sections.findIndex((s) => /คำถาม|ทดสอบ/.test(s.heading));
  let quiz = [];
  if (qi >= 0) {
    const r = parseQuiz(sections[qi].body);
    quiz = r.questions;
    r.warnings.forEach(warn);
    if (!quiz.length) warn('อ่านคำถามทบทวนไม่ได้สักข้อ (ดูรูปแบบใน /learn)');
  } else warn('ไม่มีหัวข้อ "## คำถามทบทวน"');
  const split = qi >= 0 && quiz.length > 0;
  const before = split ? sections.slice(0, qi) : sections;
  const after = split ? sections.slice(qi + 1) : [];
  const asOf = asOfDate(md);
  if (!asOf) warn('ไม่มี "ข้อมูล ณ วันที่ YYYY-MM-DD" (กฎข้อ 4)');
  return {
    asOf,
    minutes: readMinutes(joinSections(intro, [...before, ...after])),
    html: renderMarkdown(joinSections(intro, before)),
    tail: renderMarkdown(joinSections('', after)),
    quiz,
    glossary: sections.filter((s) => /ศัพท์/.test(s.heading)).flatMap((s) => parseGlossary(s.body)),
  };
}

/** แถวของตาราง → ข้อความคอลัมน์แรก (ไม่เอาหัวตารางและเส้นคั่น) */
function firstColumn(body) {
  const rows = lines(body).filter((l) => /^\s*\|/.test(l));
  return rows.slice(1).filter((r) => !/^\s*\|?\s*:?-{3,}/.test(r)).map((r) => plain(r.split('|')[1] || '')).filter(Boolean);
}

function refFrom(id, md, warn) {
  const { title, intro, sections } = splitSections(md);
  const asOf = asOfDate(md);
  if (!asOf) warn('ไม่มี "ข้อมูล ณ วันที่ YYYY-MM-DD" (กฎข้อ 4)');
  const listed = sections.find((s) => /ตัวที่เทียบ/.test(s.heading));
  return {
    ref: { id, title: plain(title || id), asOf, items: listed ? firstColumn(listed.body) : [], html: renderMarkdown(joinSections(intro, sections)) },
    glossary: sections.filter((s) => /ศัพท์/.test(s.heading)).flatMap((s) => parseGlossary(s.body)),
  };
}

function digestFrom(date, md, watchlist, warn) {
  const { title, intro, sections } = splitSections(md);
  let top = [];
  const out = [];
  for (const s of sections) {
    const key = digestKey(s.heading);
    if (key === 'top' && !top.length) {
      const r = parseTopItems(s.body, watchlist);
      r.warnings.forEach(warn);
      if (r.items.length) {
        top = r.items;
        continue;
      }
      warn('ไม่พบรายการใน "3 สิ่งสำคัญสุด"');
    }
    const html = renderMarkdown(s.body);
    if (html) out.push({ key, heading: plain(s.heading), html });
  }
  if (!sections.some((s) => digestKey(s.heading) === 'top')) warn('ไม่มีหัวข้อ "## 3 สิ่งสำคัญสุด"');
  return { date, title: title ? plain(title) : `สรุปข่าว ${date}`, intro: renderMarkdown(intro), top, sections: out };
}

/**
 * files = { roadmap, watchlist, knowledge: { ชื่อไฟล์: ข้อความ }, digests: { ชื่อไฟล์: ข้อความ } }
 * → { content, warnings } — เอาขึ้นแอพเฉพาะไฟล์ที่รู้จัก (บทเรียน NN-*.md, accounts, compare, glossary, สรุปข่าว YYYY-MM-DD.md)
 */
export function buildContent({ roadmap = null, watchlist = null, knowledge = {}, digests = {} }) {
  const warnings = [];
  const warnFor = (file) => (w) => warnings.push(`${file}: ${w}`);
  const wl = parseWatchlist(watchlist || '');
  if (watchlist == null) warnings.push('ไม่พบ watchlist.md');

  const rm = roadmap == null ? { items: [], warnings: ['ไม่พบ knowledge/00-roadmap.md'] } : parseRoadmap(roadmap);
  warnings.push(...rm.warnings);

  const lessonFiles = new Map();
  const known = new Set(['00-roadmap.md', 'accounts.md', 'compare.md', 'glossary.md']);
  for (const name of Object.keys(knowledge).sort()) {
    const m = name.match(/^(\d{2})-.+\.md$/);
    if (m && Number(m[1]) >= 1) {
      const n = Number(m[1]);
      if (lessonFiles.has(n)) warnings.push(`knowledge/${name}: บทที่ ${n} มีหลายไฟล์ ใช้ ${lessonFiles.get(n)}`);
      else lessonFiles.set(n, name);
    } else if (!known.has(name)) warnings.push(`ข้ามไฟล์ knowledge/${name} (ไม่ใช่บทเรียน NN-ชื่อ.md หรือไฟล์อ้างอิง) ไม่เอาขึ้นแอพ`);
  }

  const glossary = [];
  const terms = new Set();
  const addTerms = (list, src) => {
    for (const g of list) {
      const k = g.term.toLowerCase();
      if (terms.has(k)) continue;
      terms.add(k);
      glossary.push({ term: g.term, def: g.def, src });
    }
  };
  if (knowledge['glossary.md'] != null) addTerms(parseGlossary(knowledge['glossary.md']), 'glossary');

  const lessons = rm.items.map((it) => {
    const base = { n: it.n, id: String(it.n), title: it.title, desc: it.desc };
    const file = lessonFiles.get(it.n);
    if (!file) {
      if (it.checked) warnings.push(`roadmap: บทที่ ${it.n} ติ๊ก [x] แต่ไม่พบไฟล์ knowledge/${pad2(it.n)}-ชื่อ.md`);
      return { ...base, written: false };
    }
    if (!it.checked) warnings.push(`roadmap: บทที่ ${it.n} มีไฟล์ knowledge/${file} แล้วแต่ยังเป็น [ ] (เปลี่ยนเป็น [x])`);
    const L = lessonFrom(knowledge[file], file, warnFor(`knowledge/${file}`));
    addTerms(L.glossary, base.id);
    return { ...base, written: true, asOf: L.asOf, minutes: L.minutes, html: L.html, tail: L.tail, quiz: L.quiz };
  });
  for (const [n, file] of lessonFiles) {
    if (!rm.items.some((i) => i.n === n)) warnings.push(`knowledge/${file}: ไม่มีบทที่ ${n} ใน roadmap ไม่เอาขึ้นแอพ`);
  }

  const refs = {};
  for (const id of ['compare', 'accounts']) {
    const text = knowledge[`${id}.md`];
    if (text == null) continue;
    const R = refFrom(id, text, warnFor(`knowledge/${id}.md`));
    refs[id] = R.ref;
    addTerms(R.glossary, id);
  }

  const list = [];
  for (const name of Object.keys(digests).sort().reverse()) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
    if (!m || !realDate(m[1])) {
      warnings.push(`ข้ามไฟล์ digests/${name} (ชื่อไฟล์ต้องเป็น YYYY-MM-DD.md)`);
      continue;
    }
    if (list.length < MAX_DIGESTS) list.push(digestFrom(m[1], digests[name], wl, warnFor(`digests/${name}`)));
  }

  return {
    content: { version: 1, lessons, refs, glossary, watchlist: wl.map(({ label, ticker }) => ({ label, ticker })), digests: list },
    warnings,
  };
}
