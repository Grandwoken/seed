// สคริปต์รวมเนื้อหา: knowledge/ digests/ watchlist.md → app/data/content.json (ขึ้นเว็บสาธารณะ)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitSections, asOfDate, readMinutes, parseRoadmap, parseWatchlist, parseGlossary, parseQuiz,
  parseTopItems, digestKey, mapLink, renderMarkdown, buildContent, MAX_DIGESTS,
} from '../scripts/content-lib.mjs';

const ROADMAP = `# Roadmap บทเรียน (ลำดับที่แนะนำ)

> รัน \`/learn\` ครั้งละ 1 บท (~10 นาทีอ่าน)

1. [ ] **หุ้นคืออะไร** — เป็นเจ้าของบริษัทยังไง, ได้เงินจาก 2 ทาง (ราคาขึ้น + ปันผล)
2. [x] **ETF และกองทุนรวม** — ซื้อหลายบริษัทในทีเดียว, ต่างกันยังไง → [02-etf-and-funds.md](02-etf-and-funds.md) (2026-11-20)
3. [ ] **ความเสี่ยงกับการกระจายความเสี่ยง** — ทำไมไม่ควรเอาไข่ทุกฟองใส่ตะกร้าใบเดียว (และเมื่อไหร่คนยังเลือกทำ)

## ไฟล์อ้างอิง (ไม่ใช่บทเรียน)
- \`accounts.md\` — เปิดบัญชีตอนอายุ 18 ทำได้ทางไหน
- \`compare.md\` — หุ้นเดี่ยว vs ETF vs กองทุน
`;

const WATCHLIST = `# Watchlist — หัวข้อที่ติดตาม

## หัวข้อ

1. **Nvidia (NVDA)**
   - CEO ใหม่ — บอร์ดจะเลือกใคร
   - **งบ** รายไตรมาส

2. **กลุ่ม AI & เซมิคอนดักเตอร์ (ชิป)**
   - AMD, TSMC

5. **ดอกเบี้ยสหรัฐฯ (Fed)**

## หัวข้อที่อยากเพิ่ม (เขียนเพิ่มได้)
- **Tesla (TSLA)**
`;

const LESSON2 = `# บทที่ 2 · ETF และกองทุนรวม

> ข้อมูล ณ วันที่ 2026-11-20

ETF (กองทุนที่ซื้อขายในตลาดหุ้นเหมือนหุ้น) รวมหุ้นหลายบริษัทไว้ในก้อนเดียว อ่านต่อใน [ตารางเทียบ](compare.md)

## ตัวอย่างเป็นเงินบาท
สมมติลงเดือนละ ฿1,000

## คำศัพท์
- **ETF** = กองทุนที่ซื้อขายในตลาดหุ้นเหมือนหุ้น
- **Expense ratio** = ค่าบริหารกองทุนต่อปี

## คำถามทบทวน
1. ETF ต่างจากหุ้นตัวเดียวยังไง?
   - [ ] รับประกันว่าไม่ขาดทุน
   - [x] ถือหุ้นหลายบริษัทรวมในก้อนเดียว
   - [ ] ซื้อได้เฉพาะคนอายุ 20 ขึ้นไป
   - เฉลย: ETF รวมหุ้นหลายตัวไว้ ถ้าตัวหนึ่งแย่ ตัวอื่นช่วยพยุง แต่ยังขาดทุนได้
2. ค่าธรรมเนียม 0.5% ต่อปี หักจากอะไร?
   - [x] เงินในกองทุน
   - [ ] บัญชีธนาคารของเรา
   - เฉลย: หักจากมูลค่ากองทุนอัตโนมัติ

## แหล่งที่มา
- [SEC](https://www.sec.or.th/) (2026-11-20)
`;

const COMPARE = `# เปรียบเทียบ: หุ้นตัวเดียว vs ETF vs กองทุน

> ข้อมูล ณ วันที่ 2026-11-14 (ราคาปิด 13 พ.ย. 2026)

## ศัพท์ในไฟล์นี้
- **ETF** = กองทุน ETF (ซ้ำ ต้องไม่ทับของบทเรียน)
- **Max drawdown** = ร่วงหนักสุดจากจุดสูงสุดลงไปจุดต่ำสุด

## ตัวที่เทียบ
| ตัว | คืออะไร |
|---|---|
| **NVDA** | หุ้น Nvidia ตัวเดียว |
| **VOO** | ETF ดัชนี S&P 500 |

## ตาราง 1
| ตัว | ค่าธรรมเนียม/ปี |
|---|---|
| VOO | 0.03% |
`;

const ACCOUNTS = `# เปิดบัญชีลงทุนตอนอายุ 18 ทำได้ทางไหน

> ข้อมูล ณ วันที่ 2026-11-14 (ค้นโดย Claude)

## สรุปสั้น (อ่านก่อน)
- DR (Depositary Receipt) ซื้อได้ในตลาดหุ้นไทย
`;

const OLD_DIGEST = `# Digest 14 พ.ย. 2026 (ข่าว 7–14 พ.ย.)

## 3 สิ่งสำคัญสุด
1. **Jensen Huang ลาออกจาก CEO Nvidia แล้ว** (12 พ.ย.) — CFO Colette Kress รักษาการ CEO
2. **Nvidia ประกาศงบ 17 พ.ย.** (เวลาไทย ~เช้ามืด 18 พ.ย.) — งบแรกหลัง CEO ออก
3. **Fed คงดอกเบี้ย 3.75–4.00%** แต่ 2 เสียงอยากขึ้นดอกเบี้ย → ดอกเบี้ยอาจไม่ลงเร็ว

## ข้อเท็จจริง
- 12 พ.ย.: Huang ลาออก ([TechCrunch](https://techcrunch.com/a), [NBC](https://www.nbcnews.com/b))

## ความเห็น/การคาดการณ์
- คลิปเช็กแล้ว → [รายละเอียด](../inbox/processed/chat-notes.md)

## ความเห็นจากกลุ่มไลน์
- ไม่มีไฟล์ใน \`inbox/\` ([บันทึก](../inbox/processed/chat-notes.md))

## เรื่องนี้เกี่ยวกับแผนเรายังไง
- ใน VOO มี Nvidia แค่ ~8% (ดู \`compare.md\`)

## ควรอัปเดต
- ข้อมูลเดิม **ล้าสมัยแล้ว**

## ตรวจสอบไม่ได้
- เงินเฟ้อสหรัฐฯ เดือน ต.ค.
`;

const NEW_DIGEST = `# สรุปข่าว 21 พ.ย. 2569

## 3 สิ่งสำคัญสุด
- [ข้อเท็จจริง] (2 แหล่ง, 2026-11-18) บอร์ด Nvidia เปิดสอบสวนอิสระ — บริษัทยืนยันว่ายังเป็น CEO ต่อ ([CNBC](https://www.cnbc.com/x), [NBC](https://www.nbcnews.com/y))
- [คาดการณ์] (1 แหล่ง, 2026-11-19) ตลาดคาดการณ์ให้โอกาสราว 16% ที่ CEO จะหลุดตำแหน่ง — เป็นความเห็นของคนในตลาด ([Polymarket](https://polymarket.com/z))
- [ยังไม่ยืนยัน] (1 แหล่ง, 2026-11-20) Fed อาจลดดอกเบี้ย — มีแหล่งเดียว ([Blog](https://example.com/b))

## ข้อเท็จจริง
- 18 พ.ย.: บอร์ดสอบสวน ([CNBC](https://www.cnbc.com/x))

## ความเห็น
- นักวิเคราะห์บางคนมองว่า... ([MGR](https://mgronline.com/a))

## ความเห็นจากกลุ่มไลน์
- คุยเรื่องงบเยอะ
- อ่านไลน์ถึง: 2026-11-21 20:15

## เกี่ยวกับแผนเรา
- ถ้าจะลงตัวเดียว ข่าวคนเดียวขยับราคาได้มาก

## ควรอัปเดต
- ไม่มี

## แหล่งข้อมูล
- [CNBC](https://www.cnbc.com/x)
`;

// ---------- แยกหัวข้อ ----------

test('splitSections: แยก # ชื่อเรื่อง / ส่วนนำ / หัวข้อ ## (### อยู่ในหัวข้อเดิม, ## ในบล็อกโค้ดไม่นับ)', () => {
  const r = splitSections('# ชื่อ\n\n> ข้อมูล ณ วันที่ 2026-11-14\n\nนำ\n\n## A\nข้อความ\n### ย่อย\nต่อ\n```\n## ไม่ใช่หัวข้อ\n```\n## B\nจบ\n');
  assert.equal(r.title, 'ชื่อ');
  assert.equal(r.intro.trim(), '> ข้อมูล ณ วันที่ 2026-11-14\n\nนำ');
  assert.deepEqual(r.sections.map((s) => s.heading), ['A', 'B']);
  assert.match(r.sections[0].body, /### ย่อย/);
  assert.match(r.sections[0].body, /## ไม่ใช่หัวข้อ/);
  assert.equal(r.sections[1].body.trim(), 'จบ');
});

test('asOfDate: อ่าน "ข้อมูล ณ วันที่ YYYY-MM-DD" (วันที่ผิดหรือไม่มี → null)', () => {
  assert.equal(asOfDate(COMPARE), '2026-11-14');
  assert.equal(asOfDate('# x\n\nไม่มีวันที่'), null);
  assert.equal(asOfDate('> ข้อมูล ณ วันที่ 2026-13-40'), null);
});

test('readMinutes: ไทยนับ 4.5 ตัวอักษรเป็น 1 คำ อ่าน 120 คำ/นาที ปัดขึ้น ไม่นับ URL อย่างน้อย 1 นาที', () => {
  assert.equal(readMinutes('ก'.repeat(1080)), 2); // 240 คำ
  assert.equal(readMinutes('ก'.repeat(1081)), 3);
  assert.equal(readMinutes('word '.repeat(240)), 2);
  assert.equal(readMinutes(`[ลิงก์](https://example.com/${'a'.repeat(5000)})`), 1);
  assert.equal(readMinutes(''), 1);
});

// ---------- roadmap / watchlist ----------

test('parseRoadmap: เลขบท ชื่อ คำอธิบาย และ [x] (ตัดลิงก์ไฟล์/วันที่ท้ายบรรทัด ไม่เอารายการไฟล์อ้างอิง)', () => {
  const { items, warnings } = parseRoadmap(ROADMAP);
  assert.deepEqual(warnings, []);
  assert.deepEqual(items.map((i) => [i.n, i.title, i.checked]), [
    [1, 'หุ้นคืออะไร', false], [2, 'ETF และกองทุนรวม', true], [3, 'ความเสี่ยงกับการกระจายความเสี่ยง', false],
  ]);
  assert.equal(items[0].desc, 'เป็นเจ้าของบริษัทยังไง, ได้เงินจาก 2 ทาง (ราคาขึ้น + ปันผล)');
  assert.equal(items[1].desc, 'ซื้อหลายบริษัทในทีเดียว, ต่างกันยังไง');
  assert.equal(items[2].desc, 'ทำไมไม่ควรเอาไข่ทุกฟองใส่ตะกร้าใบเดียว (และเมื่อไหร่คนยังเลือกทำ)');
});

test('parseRoadmap: เลขบทซ้ำ → ใช้อันแรก + คำเตือน', () => {
  const { items, warnings } = parseRoadmap('1. [ ] **ก** — a\n1. [ ] **ข** — b\n');
  assert.deepEqual(items.map((i) => i.title), ['ก']);
  assert.equal(warnings.length, 1);
});

test('parseWatchlist: หัวข้อตัวหนาที่มีเลขนำ (ไม่เอาข้อย่อย / หัวข้อที่อยากเพิ่ม) + ticker ในวงเล็บถ้าเป็นตัวพิมพ์ใหญ่', () => {
  assert.deepEqual(parseWatchlist(WATCHLIST), [
    { label: 'Nvidia (NVDA)', ticker: 'NVDA', name: 'Nvidia' },
    { label: 'กลุ่ม AI & เซมิคอนดักเตอร์ (ชิป)', ticker: null, name: 'กลุ่ม AI & เซมิคอนดักเตอร์' },
    { label: 'ดอกเบี้ยสหรัฐฯ (Fed)', ticker: null, name: 'ดอกเบี้ยสหรัฐฯ' },
  ]);
  assert.deepEqual(parseWatchlist(''), []);
});

// ---------- คำศัพท์ / คำถามทบทวน ----------

test('parseGlossary: - **คำ** = / — / : / คือ ความหมาย (ตัดตัวหนาและลิงก์ในความหมาย)', () => {
  const g = parseGlossary([
    '- **ETF** = กองทุนที่ซื้อขายในตลาดหุ้นเหมือนหุ้น',
    '- **DCA** — ทยอยลงทุนเดือนละเท่า ๆ กัน ([อ่าน](https://x.com))',
    '* **P/E**: ราคาหุ้น ÷ **กำไร**ต่อหุ้น',
    '- **Drawdown** คือ ช่วงที่ร่วงจากจุดสูงสุด',
    '- ไม่ใช่คำศัพท์',
    '- **ไม่มีความหมาย**',
  ].join('\n'));
  assert.deepEqual(g, [
    { term: 'ETF', def: 'กองทุนที่ซื้อขายในตลาดหุ้นเหมือนหุ้น' },
    { term: 'DCA', def: 'ทยอยลงทุนเดือนละเท่า ๆ กัน (อ่าน)' },
    { term: 'P/E', def: 'ราคาหุ้น ÷ กำไรต่อหุ้น' },
    { term: 'Drawdown', def: 'ช่วงที่ร่วงจากจุดสูงสุด' },
  ]);
});

test('parseQuiz: ข้อ + ตัวเลือก [ ]/[x] + เฉลย → คำตอบเป็นเลขตำแหน่ง', () => {
  const body = splitSections(LESSON2).sections.find((s) => s.heading === 'คำถามทบทวน').body;
  const { questions, warnings } = parseQuiz(body);
  assert.deepEqual(warnings, []);
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0], {
    q: 'ETF ต่างจากหุ้นตัวเดียวยังไง?',
    options: ['รับประกันว่าไม่ขาดทุน', 'ถือหุ้นหลายบริษัทรวมในก้อนเดียว', 'ซื้อได้เฉพาะคนอายุ 20 ขึ้นไป'],
    answer: 1,
    explain: 'ETF รวมหุ้นหลายตัวไว้ ถ้าตัวหนึ่งแย่ ตัวอื่นช่วยพยุง แต่ยังขาดทุนได้',
  });
  assert.equal(questions[1].answer, 0);
});

test('parseQuiz: ไม่มีข้อถูก / ถูก 2 ข้อ / ตัวเลือกน้อยกว่า 2 → ข้ามข้อนั้น + คำเตือน', () => {
  const { questions, warnings } = parseQuiz([
    '1. ไม่มีข้อถูก', '   - [ ] ก', '   - [ ] ข',
    '2. ถูกสองข้อ', '   - [x] ก', '   - [X] ข',
    '3. ตัวเลือกเดียว', '   - [x] ก',
    '4. ใช้ได้', '   - [ ] ก', '   - [x] ข', '   > เฉลย: เพราะ ข',
  ].join('\n'));
  assert.deepEqual(questions.map((q) => [q.q, q.answer, q.explain]), [['ใช้ได้', 1, 'เพราะ ข']]);
  assert.equal(warnings.length, 3);
});

// ---------- 3 เรื่องสำคัญ ----------

const WL = parseWatchlist(WATCHLIST);

test('parseTopItems: รูปแบบใหม่ - [ป้าย] (n แหล่ง, วันที่) หัวข้อ — สรุป (ลิงก์) + ticker จาก watchlist', () => {
  const body = splitSections(NEW_DIGEST).sections[0].body;
  const { items, warnings } = parseTopItems(body, WL);
  assert.deepEqual(warnings, []);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    tag: 'fact', sources: 2, date: '2026-11-18', dateText: null,
    title: 'บอร์ด Nvidia เปิดสอบสวนอิสระ', line: 'บริษัทยืนยันว่ายังเป็น CEO ต่อ',
    links: [{ text: 'CNBC', href: 'https://www.cnbc.com/x' }, { text: 'NBC', href: 'https://www.nbcnews.com/y' }],
    ticker: 'NVDA',
  });
  assert.equal(items[1].tag, 'forecast');
  assert.equal(items[1].ticker, null);
  assert.equal(items[2].tag, 'unconfirmed');
  assert.equal(items[2].line, 'มีแหล่งเดียว');
});

test('parseTopItems: ป้ายข้อเท็จจริงแต่มีแหล่งเดียว → คำเตือน (กฎข้อ 2), ลิงก์ที่ไม่ใช่ http(s) ไม่เอา', () => {
  const { items, warnings } = parseTopItems('- [ข้อเท็จจริง] (1 แหล่ง, 2026-11-18) ก — ข ([x](javascript:alert(1)), [y](../inbox/a.md))', WL);
  assert.deepEqual(items[0].links, []);
  assert.equal(items[0].line, 'ข');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /2 แหล่ง/);
});

test('parseTopItems: รูปแบบเก่า 1. **หัวข้อ** (วันที่) — สรุป → อ่านได้ ไม่มีป้าย + คำเตือนให้ใช้รูปแบบใหม่', () => {
  const body = splitSections(OLD_DIGEST).sections[0].body;
  const { items, warnings } = parseTopItems(body, WL);
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], {
    tag: null, sources: null, date: null, dateText: '12 พ.ย.',
    title: 'Jensen Huang ลาออกจาก CEO Nvidia แล้ว', line: 'CFO Colette Kress รักษาการ CEO', links: [], ticker: 'NVDA',
  });
  assert.equal(items[1].dateText, 'เวลาไทย ~เช้ามืด 18 พ.ย.');
  assert.equal(items[2].title, 'Fed คงดอกเบี้ย 3.75–4.00%');
  assert.equal(items[2].line, 'แต่ 2 เสียงอยากขึ้นดอกเบี้ย → ดอกเบี้ยอาจไม่ลงเร็ว');
  assert.equal(warnings.length, 3);
});

test('digestKey: ชื่อหัวข้อเก่าและใหม่ → ส่วนเดียวกัน ("ความเห็นจากกลุ่มไลน์" ไม่ใช่ "ความเห็น")', () => {
  const cases = {
    '3 สิ่งสำคัญสุด': 'top', 'ข้อเท็จจริง': 'facts', 'ความเห็น': 'opinions', 'ความเห็น/การคาดการณ์': 'opinions',
    'ความเห็นจากกลุ่มไลน์': 'line', 'เกี่ยวกับแผนเรา': 'plan', 'เรื่องนี้เกี่ยวกับแผนเรายังไง': 'plan',
    'ควรอัปเดต': 'update', 'ตรวจสอบไม่ได้': 'unverified', 'แหล่งข้อมูล': 'sources', 'ลิงก์ทั้งหมด': 'sources', 'อื่น ๆ': null,
  };
  for (const [h, k] of Object.entries(cases)) assert.equal(digestKey(h), k, h);
});

// ---------- ลิงก์ + HTML ปลอดภัย ----------

test('mapLink: เว็บ http(s) ได้, ไฟล์ .md ในโปรเจกต์ → หน้าในแอพ, inbox/ plan.md สคริปต์ → ไม่มีลิงก์', () => {
  const cases = {
    'https://www.cnbc.com/x?a=1': 'https://www.cnbc.com/x?a=1',
    'HTTP://Example.com': 'HTTP://Example.com',
    'javascript:alert(1)': null, ' JavaScript:alert(1)': null, 'data:text/html,x': null, 'mailto:a@b.c': null,
    '../inbox/processed/chat-notes.md': null, 'inbox/x.txt': null,
    'plan.md': null, '../plan.md': null, '#anchor': null, 'watchlist.md': null, '//evil.com/x': null,
    'compare.md': '#/learn/compare', 'knowledge/compare.md': '#/learn/compare', './accounts.md': '#/learn/accounts',
    '../knowledge/accounts.md#dime': '#/learn/accounts', '03-diversification.md': '#/learn/3', '12-scams.md': '#/learn/12',
    '00-roadmap.md': '#/learn', '../digests/2026-11-14.md': '#/news/2026-11-14', '2026-11-21.md': '#/news/2026-11-21',
  };
  for (const [href, want] of Object.entries(cases)) assert.equal(mapLink(href), want, href);
});

test('renderMarkdown: HTML ดิบถูก escape, รูปภาพเป็นข้อความ, ลิงก์อันตราย/ส่วนตัวเหลือแต่ข้อความ', () => {
  const h = renderMarkdown('<script>alert(1)</script>\n\nก <img src=x onerror=alert(1)> [a](javascript:alert(1)) [b](../inbox/x.md) ![รูป](https://t.co/p.png)');
  assert.doesNotMatch(h, /<script|<img|href="javascript|inbox/i); // แท็กดิบไม่เหลือ (onerror= เหลือเป็นข้อความเฉย ๆ)
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(h, /\ba\b/);
  assert.match(h, /รูป/);
});

test('renderMarkdown: ลิงก์เว็บเปิดแท็บใหม่ไม่ส่ง referrer, ไฟล์ในโปรเจกต์เป็นหน้าในแอพ, `compare.md` เป็นลิงก์', () => {
  const h = renderMarkdown('[CNBC](https://cnbc.com/a?x=1&y="2") [ตาราง](compare.md) ดู `compare.md` และ `plan.md`');
  assert.match(h, /<a href="https:\/\/cnbc\.com\/a\?x=1&amp;y=%222%22" target="_blank" rel="noopener noreferrer">CNBC<\/a>/);
  assert.match(h, /<a href="#\/learn\/compare">ตาราง<\/a>/);
  assert.match(h, /<a href="#\/learn\/compare"><code>compare\.md<\/code><\/a>/);
  assert.match(h, /<code>plan\.md<\/code>/);
  assert.doesNotMatch(h, /href="[^"]*plan\.md/);
});

test('renderMarkdown: ตาราง GFM', () => {
  assert.match(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'), /<table>[\s\S]*<td>1<\/td>/);
});

// ---------- รวมทั้งหมด ----------

const FILES = {
  roadmap: ROADMAP,
  watchlist: WATCHLIST,
  knowledge: {
    '00-roadmap.md': ROADMAP,
    '02-etf-and-funds.md': LESSON2,
    'compare.md': COMPARE,
    'accounts.md': ACCOUNTS,
    'notes-private.md': '# โน้ต\n\nเป้าเรา ฿99,999',
  },
  digests: { '2026-11-14.md': OLD_DIGEST, '2026-11-21.md': NEW_DIGEST, 'draft.md': '# ร่าง' },
};

test('buildContent: บทเรียน 12 บทจาก roadmap (เขียนแล้ว = มีไฟล์ NN-*.md) ไม่มีหัว # ซ้ำ, แยกคำถามทบทวนออกจากเนื้อหา', () => {
  const { content } = buildContent(FILES);
  assert.equal(content.version, 1);
  assert.deepEqual(content.lessons.map((l) => [l.id, l.n, l.written]), [['1', 1, false], ['2', 2, true], ['3', 3, false]]);
  const l2 = content.lessons[1];
  assert.equal(l2.title, 'ETF และกองทุนรวม');
  assert.equal(l2.asOf, '2026-11-20');
  assert.ok(l2.minutes >= 1);
  assert.doesNotMatch(l2.html, /<h1/);
  assert.match(l2.html, /คำศัพท์/);
  assert.match(l2.html, /href="#\/learn\/compare"/);
  assert.doesNotMatch(l2.html, /คำถามทบทวน|รับประกันว่าไม่ขาดทุน/);
  assert.match(l2.tail, /แหล่งที่มา/);
  assert.equal(l2.quiz.length, 2);
  assert.deepEqual(Object.keys(content.lessons[0]).sort(), ['desc', 'id', 'n', 'title', 'written']);
});

test('buildContent: ไฟล์อ้างอิง accounts/compare (วันที่อัปเดต + ตัวที่เทียบ) และคำศัพท์ไม่ซ้ำ (บทเรียนมาก่อน)', () => {
  const { content } = buildContent(FILES);
  assert.equal(content.refs.compare.title, 'เปรียบเทียบ: หุ้นตัวเดียว vs ETF vs กองทุน');
  assert.equal(content.refs.compare.asOf, '2026-11-14');
  assert.deepEqual(content.refs.compare.items, ['NVDA', 'VOO']);
  assert.equal(content.refs.accounts.title, 'เปิดบัญชีลงทุนตอนอายุ 18 ทำได้ทางไหน');
  assert.doesNotMatch(content.refs.compare.html, /<h1/);
  assert.deepEqual(content.glossary, [
    { term: 'ETF', def: 'กองทุนที่ซื้อขายในตลาดหุ้นเหมือนหุ้น', src: '2' },
    { term: 'Expense ratio', def: 'ค่าบริหารกองทุนต่อปี', src: '2' },
    { term: 'Max drawdown', def: 'ร่วงหนักสุดจากจุดสูงสุดลงไปจุดต่ำสุด', src: 'compare' },
  ]);
});

test('buildContent: สรุปข่าวใหม่สุดก่อน, ส่วนต่าง ๆ ตามชื่อหัวข้อ, ลิงก์ไป inbox/ ถูกตัด', () => {
  const { content } = buildContent(FILES);
  assert.deepEqual(content.digests.map((d) => d.date), ['2026-11-21', '2026-11-14']);
  const [d1, d0] = content.digests;
  assert.equal(d1.title, 'สรุปข่าว 21 พ.ย. 2569');
  assert.equal(d1.top[0].ticker, 'NVDA');
  assert.deepEqual(d1.sections.map((s) => s.key), ['facts', 'opinions', 'line', 'plan', 'update', 'sources']);
  assert.ok(d1.sections.every((s) => s.heading && s.html));
  assert.deepEqual(d0.sections.map((s) => s.key), ['facts', 'opinions', 'line', 'plan', 'update', 'unverified']);
  const all = JSON.stringify(content);
  assert.doesNotMatch(all, /inbox\/processed/);
  assert.match(d0.sections.find((s) => s.key === 'plan').html, /href="#\/learn\/compare"/);
});

test('buildContent: ไฟล์ที่ไม่รู้จักไม่ถูกเอาขึ้นแอพ (เช่นโน้ตส่วนตัวใน knowledge/) + คำเตือน', () => {
  const { content, warnings } = buildContent(FILES);
  assert.doesNotMatch(JSON.stringify(content), /99,999|โน้ต/);
  assert.ok(warnings.some((w) => w.includes('notes-private.md')));
  assert.ok(warnings.some((w) => w.includes('draft.md')));
  assert.ok(warnings.some((w) => w.includes('2026-11-14.md')), 'รูปแบบเก่าของ 3 สิ่งสำคัญสุด');
  assert.ok(!warnings.some((w) => w.includes('2026-11-21.md')), 'ฉบับรูปแบบใหม่ไม่ควรมีคำเตือน');
});

test('buildContent: roadmap ติ๊ก [x] แต่ไม่มีไฟล์ / มีไฟล์แต่ยังไม่ติ๊ก → คำเตือน', () => {
  const { content, warnings } = buildContent({
    ...FILES,
    roadmap: ROADMAP.replace('1. [ ]', '1. [x]').replace('2. [x]', '2. [ ]'),
  });
  assert.equal(content.lessons[0].written, false);
  assert.equal(content.lessons[1].written, true);
  assert.ok(warnings.some((w) => w.includes('บทที่ 1')));
  assert.ok(warnings.some((w) => w.includes('บทที่ 2')));
});

test(`buildContent: เก็บสรุปข่าวล่าสุดไม่เกิน ${MAX_DIGESTS} ฉบับ (ไฟล์ไม่โตไม่สิ้นสุด)`, () => {
  const digests = {};
  for (let i = 1; i <= MAX_DIGESTS + 4; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i * 7)).toISOString().slice(0, 10);
    digests[`${d}.md`] = NEW_DIGEST;
  }
  const { content } = buildContent({ ...FILES, digests });
  assert.equal(content.digests.length, MAX_DIGESTS);
  assert.equal(content.digests[0].date, Object.keys(digests).sort().at(-1).replace('.md', ''));
});

test('buildContent: ไม่มีไฟล์อะไรเลย → โครงว่างที่แอพแสดง empty state ได้', () => {
  const { content } = buildContent({ roadmap: null, watchlist: null, knowledge: {}, digests: {} });
  assert.deepEqual(content, { version: 1, lessons: [], refs: {}, glossary: [], watchlist: [], digests: [] });
});
