// SEED — service worker: เปิดแอพได้แม้ไม่มีเน็ต (หลังเปิดครั้งแรก)
// - ไฟล์แอพ ฟอนต์ ไอคอน: เก็บทั้งชุดตอนติดตั้ง แล้วเปิดจากเครื่อง (ได้ชุดใหม่ทุกครั้งที่ deploy)
// - data/content.json (บทเรียน/ข่าว) และค่าเงินจาก Frankfurter: ถามเน็ตก่อน ไม่ได้ค่อยใช้ของที่เก็บไว้
// - ไม่แตะข้อมูลเงินของเจ้าของ (อยู่ในหน้าแอพ ไม่ใช่ที่นี่) และไม่เรียกเน็ตที่อื่นเพิ่ม

const BUILD = '__SEED_BUILD__'; // GitHub Actions แทนด้วยเลข commit ตอน deploy (.github/workflows/pages.yml)
const DEV = BUILD.startsWith('__'); // รันในเครื่อง (npm run serve): ถามเน็ตก่อนเสมอ ไฟล์ที่แก้จะขึ้นทันที
const SHELL_CACHE = 'seed-shell-' + BUILD;
const DATA_CACHE = 'seed-data';
const FX_CACHE = 'seed-fx';
const CONTENT = 'data/content.json';
const FX_HOSTS = ['api.frankfurter.dev', 'api.frankfurter.app'];
const FX_KEEP = 4; // เก็บคำตอบค่าเงินล่าสุดไม่เกิน 4 อัน
const NET_WAIT = 4000; // เน็ตค้าง/สัญญาณอ่อน: รอไม่เกิน 4 วิ แล้วใช้ของที่เก็บไว้ (ถ้ามี)
const MATCH = { ignoreSearch: true, ignoreVary: true };

// ทุกไฟล์ที่แอพใช้ (tests/pwa.test.js เช็กว่าตรงกับไฟล์ใน app/ จริง)
const SHELL = [
  'index.html',
  'manifest.json',
  'styles.css',
  'app.js',
  'calc.js',
  'charts.js',
  'content.js',
  'fx.js',
  'passcode.js',
  'store.js',
  'ui.js',
  'version.js',
  'wealth.js',
  'screens/add.js',
  'screens/common.js',
  'screens/fx.js',
  'screens/home.js',
  'screens/index.js',
  'screens/learn.js',
  'screens/lock.js',
  'screens/money.js',
  'screens/news.js',
  'screens/plan.js',
  'screens/save-goal.js',
  'screens/settings.js',
  'screens/sim.js',
  'screens/wealth.js',
  'screens/welcome.js',
  'fonts/plex-mono-latin-400.woff2',
  'fonts/plex-mono-latin-500.woff2',
  'fonts/plex-mono-latin-600.woff2',
  'fonts/plex-sans-thai-latin-400.woff2',
  'fonts/plex-sans-thai-latin-500.woff2',
  'fonts/plex-sans-thai-latin-600.woff2',
  'fonts/plex-sans-thai-thai-400.woff2',
  'fonts/plex-sans-thai-thai-500.woff2',
  'fonts/plex-sans-thai-thai-600.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })));
    // บทเรียน/ข่าว: เก็บไว้ด้วยถ้ามี (ไม่มีไฟล์ก็ยังติดตั้งได้)
    try {
      const r = await fetch(new Request(CONTENT, { cache: 'reload' }));
      if (r.ok) await (await caches.open(DATA_CACHE)).put(CONTENT, r);
    } catch {
      /* ไม่มีเน็ตหรือไม่มีไฟล์ */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('seed-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FX_HOSTS.includes(url.hostname)) {
    return freshFirst(event, { cacheName: FX_CACHE, key: req, keep: FX_KEEP, match: { ignoreVary: true }, mark: markOffline });
  }
  if (url.origin !== self.location.origin) return; // เว็บอื่น: ไม่ยุ่ง
  const path = url.pathname;
  if (path.endsWith('/' + CONTENT)) return freshFirst(event, { cacheName: DATA_CACHE, key: CONTENT, match: MATCH });
  if (req.mode === 'navigate' && (path.endsWith('/') || path.endsWith('/index.html'))) {
    return event.respondWith(DEV ? networkFirst(req, 'index.html') : cacheFirst(req, 'index.html'));
  }
  event.respondWith(DEV ? networkFirst(req) : cacheFirst(req));
});

/** ไฟล์แอพ (ตอนใช้จริง): เปิดจากเครื่องก่อน ไม่มีค่อยโหลดแล้วเก็บ */
async function cacheFirst(req, key = req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(key, MATCH);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok && r.type === 'basic') await cache.put(key, r.clone());
  return r;
}

/** ไฟล์แอพ (ในเครื่องตอนพัฒนา): โหลดใหม่ก่อน เน็ตหลุดค่อยใช้ที่เก็บไว้ */
async function networkFirst(req, key = req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const r = await fetch(req);
    if (r.ok && r.type === 'basic') await cache.put(key, r.clone());
    return r;
  } catch (err) {
    const hit = await cache.match(key, MATCH);
    if (hit) return hit;
    throw err;
  }
}

/**
 * บทเรียน/ข่าว และค่าเงิน: ถามเน็ตก่อน (มีของใหม่จะได้เห็น)
 * เน็ตล่ม ตอบไม่ ok หรือช้าเกิน NET_WAIT และมีของที่เก็บไว้ → ใช้ของที่เก็บไว้ (mark ใส่ป้ายได้)
 * เน็ตที่ตอบมาทีหลังยังถูกเก็บไว้ใช้รอบหน้า
 */
function freshFirst(event, { cacheName, key, keep = 0, match, mark = (r) => r }) {
  const net = fetch(event.request).then(async (r) => {
    if (r.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(key, r.clone());
      if (keep) {
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - keep))) await cache.delete(k);
      }
    }
    return r;
  });
  event.waitUntil(net.catch(() => {})); // ให้ SW อยู่จนเก็บคำตอบเสร็จ แม้ตอบหน้าแอพไปก่อนแล้ว
  const saved = async () => {
    const hit = await (await caches.open(cacheName)).match(key, match);
    return hit ? mark(hit) : null;
  };
  event.respondWith((async () => {
    let timer;
    const slow = new Promise((res) => { timer = setTimeout(res, NET_WAIT, null); });
    try {
      const r = await Promise.race([net, slow]);
      if (r && r.ok) return r;
      return (await saved()) || r || (await net); // ไม่มีของเก็บไว้: รอเน็ตต่อ หรือส่งคำตอบเดิม (เช่น 404)
    } catch (err) {
      const hit = await saved();
      if (hit) return hit;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  })());
}

/** คำตอบค่าเงินเก่าจากแคช: ติดป้าย X-SEED-Offline ให้แอพรู้ว่าไม่ใช่ของใหม่ (แอพจะบอกว่าออฟไลน์) */
async function markOffline(hit) {
  const headers = new Headers(hit.headers);
  headers.set('X-SEED-Offline', '1');
  return new Response(await hit.blob(), { status: hit.status, statusText: hit.statusText, headers });
}
