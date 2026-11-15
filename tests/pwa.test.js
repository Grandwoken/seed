// PWA: service worker เก็บไฟล์แอพครบ, manifest ติดตั้งได้, ไอคอนมีจริง, deploy แทนเลขเวอร์ชันแคช
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const APP = fileURLToPath(new URL('../app/', import.meta.url));
const read = (p) => readFileSync(join(APP, p), 'utf8');
const exists = (p) => existsSync(join(APP, p));

function listFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full));
    else out.push(relative(APP, full).split(sep).join('/'));
  }
  return out;
}
const sw = read('sw.js');
const shellList = () => {
  const m = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(m, 'ไม่เจอ const SHELL = [...] ใน sw.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};
// ไฟล์ที่แอพไม่ได้โหลด (ใบอนุญาตฟอนต์, marked ที่ใช้ตอน build) และเนื้อหาที่สร้างทีหลัง (data/ — เก็บแยกแบบไม่บังคับ)
const NOT_SHELL = (f) => f === 'sw.js' || f === 'fonts/LICENSE.txt' || f.startsWith('vendor/') || f.startsWith('data/');

test('sw.js: รายการไฟล์ที่เก็บไว้ใช้ออฟไลน์ ตรงกับไฟล์แอพทุกไฟล์ (ไม่ขาด ไม่เกิน ไม่ซ้ำ)', () => {
  const list = shellList();
  assert.equal(new Set(list).size, list.length, 'มีชื่อซ้ำ');
  const files = listFiles(APP).filter((f) => !NOT_SHELL(f));
  assert.deepEqual([...list].sort(), files.sort());
});

test('sw.js: เวอร์ชันแคชเป็นตัวแทนที่ deploy แทนด้วย commit, content.json เก็บแบบไม่บังคับ', () => {
  assert.match(sw, /const BUILD = '__SEED_BUILD__';/);
  assert.match(sw, /data\/content\.json/);
  assert.match(sw, /X-SEED-Offline/);
  assert.doesNotMatch(sw, /localStorage|seed\.v1/, 'service worker ต้องไม่แตะข้อมูลเงิน');
});

test('deploy: GitHub Actions รันเทสต์ก่อน แทนเลขเวอร์ชัน แล้วอัปเฉพาะโฟลเดอร์ app/', () => {
  const wf = readFileSync(fileURLToPath(new URL('../.github/workflows/pages.yml', import.meta.url)), 'utf8');
  assert.match(wf, /node --test/);
  assert.match(wf, /__SEED_BUILD__/);
  assert.match(wf, /actions\/upload-pages-artifact@v\d+[\s\S]*?path: app\s*$/m);
  assert.match(wf, /actions\/deploy-pages@v\d+/);
});

test('manifest.json: ติดตั้งได้ (ชื่อ, start_url, standalone, สีธีม, ไอคอน 192/512/maskable)', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.short_name, 'SEED');
  assert.ok(m.name && m.name.includes('SEED'));
  assert.equal(m.lang, 'th');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#0B0C0F');
  assert.equal(m.background_color, '#0B0C0F');
  const kinds = m.icons.map((i) => `${i.sizes} ${i.purpose || 'any'}`);
  for (const k of ['192x192 any', '512x512 any', '512x512 maskable']) assert.ok(kinds.includes(k), 'ขาดไอคอน ' + k);
});

test('ไอคอน: ไฟล์มีจริง PNG ขนาดตรงกับที่บอกใน manifest', () => {
  const m = JSON.parse(read('manifest.json'));
  const pngs = [...m.icons.filter((i) => i.type === 'image/png'), { src: 'icons/apple-touch-icon.png', sizes: '180x180' }];
  for (const i of pngs) {
    assert.ok(exists(i.src), 'ไม่มีไฟล์ ' + i.src);
    const b = readFileSync(join(APP, i.src));
    assert.equal(b.toString('latin1', 1, 4), 'PNG', i.src);
    assert.equal(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`, i.sizes, i.src);
  }
  assert.match(read('icons/icon.svg'), /^<svg[^>]+viewBox="0 0 512 512"/);
});

test('index.html: ลิงก์ manifest + ไอคอน, CSP ยังเรียกเน็ตได้แค่ Frankfurter', () => {
  const h = read('index.html');
  assert.match(h, /<link rel="manifest" href="manifest.json">/);
  assert.match(h, /<link rel="icon" href="icons\/icon.svg" type="image\/svg\+xml">/);
  assert.match(h, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon.png">/);
  const csp = h.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /connect-src 'self' https:\/\/api\.frankfurter\.dev https:\/\/api\.frankfurter\.app;/);
});
