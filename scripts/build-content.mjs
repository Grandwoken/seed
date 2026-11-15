// สร้าง app/data/content.json จาก knowledge/ digests/ watchlist.md — รันท้าย /digest /learn /compare
// usage: npm run build:content   (ทดสอบ: node scripts/build-content.mjs --root <โฟลเดอร์> --out <ไฟล์>)
// ไฟล์นี้ขึ้นเว็บพร้อมแอพ: อ่านเฉพาะไฟล์ที่รู้จัก ไม่อ่าน plan.md หรือ inbox/
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent } from './content-lib.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const root = resolve(opt('--root', join(dirname(fileURLToPath(import.meta.url)), '..')));
const out = resolve(opt('--out', join(root, 'app', 'data', 'content.json')));

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
function readDir(dir) {
  const files = {};
  if (!existsSync(dir)) return files;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isFile() && f.name.endsWith('.md')) files[f.name] = readFileSync(join(dir, f.name), 'utf8');
  }
  return files;
}

const knowledge = readDir(join(root, 'knowledge'));
const { content, warnings } = buildContent({
  roadmap: knowledge['00-roadmap.md'] ?? null,
  watchlist: read(join(root, 'watchlist.md')),
  knowledge,
  digests: readDir(join(root, 'digests')),
});

const json = JSON.stringify(content) + '\n';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json);

const written = content.lessons.filter((l) => l.written).length;
const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
console.log(`เขียน ${relative(process.cwd(), out) || out} (${kb} KB): บทเรียน ${written}/${content.lessons.length} บท, ไฟล์อ้างอิง ${Object.keys(content.refs).length}, สรุปข่าว ${content.digests.length} ฉบับ, คำศัพท์ ${content.glossary.length}, watchlist ${content.watchlist.length} หัวข้อ`);
if (warnings.length) console.log(`คำเตือน ${warnings.length} ข้อ (แก้ไฟล์แล้วรันใหม่):\n` + warnings.map((w) => '- ' + w).join('\n'));
