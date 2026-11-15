// SEED — จุดเริ่มแอพ: โหลดข้อมูล, เส้นทาง (#/...), แถบเมนูล่าง, ล็อก, รายการประจำ

import { loadState, saveState } from './store.js';
import { todayISO, runRecurring } from './calc.js';
import { refreshFx, readFxCache } from './fx.js';
import { fetchContent } from './content.js';
import { html, toHTML, icon, toast, signed } from './ui.js';
import { SCREENS } from './screens/index.js';

const TABS = [
  ['home', 'หน้าหลัก', 'home'],
  ['money', 'เงิน', 'money'],
  ['plan', 'แผน', 'plan'],
  ['learn', 'เรียนรู้', 'learn'],
  ['news', 'ข่าว', 'news'],
];

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
const appEl = document.getElementById('app');

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = h.split('?');
  const [name = 'home', ...rest] = path.split('/').filter(Boolean);
  return { name, param: rest.join('/') || null, query: Object.fromEntries(new URLSearchParams(qs)), hash: location.hash };
}

const loaded = loadState(localStorage, todayISO());

export const app = {
  state: loaded.state,
  status: loaded.status,
  today: todayISO(),
  route: parseHash(),
  locked: false,
  ui: {},
  content: null, // บทเรียน/ข่าวจาก data/content.json
  contentStatus: 'loading', // loading | ok | error
  fx: null, // ผลดึงค่าเงินล่าสุด { fx, status } — status: cached | fresh | offline | none
  depth: 0,

  /** เรทที่ใช้ได้ตอนนี้: ผลดึงล่าสุด หรือแคชในเครื่องระหว่างรอ (status 'loading') */
  fxNow() {
    if (this.fx && this.fx.fx) return this.fx;
    let cached = null;
    try {
      cached = readFxCache(localStorage);
    } catch {
      /* เบราว์เซอร์ไม่ให้อ่าน storage */
    }
    return { fx: cached, status: this.fx ? this.fx.status : 'loading' };
  },

  /** บันทึกลงเครื่อง */
  save() {
    if (!saveState(localStorage, this.state)) toast('บันทึกไม่ได้ — พื้นที่ในเครื่องอาจเต็ม');
  },
  /** แก้ข้อมูล → บันทึก → วาดใหม่ */
  commit(mutate, { render = true } = {}) {
    mutate(this.state);
    this.save();
    if (render) this.render();
  },
  go(path) {
    const target = path.startsWith('#') ? path : '#/' + path.replace(/^\/+/, '');
    if (location.hash === target) this.render();
    else location.hash = target;
  },
  /** ย้อนกลับในแอพ ถ้าไม่มีประวัติให้ไปหน้า fallback */
  back(fallback = 'home') {
    if (this.depth > 0) history.back();
    else this.go(fallback);
  },
  /** สถานะชั่วคราวของหน้าปัจจุบัน (ล้างเมื่อเปลี่ยนหน้า) */
  get local() {
    const k = this.route.name;
    return (this.ui[k] ||= {});
  },
  render,
};
window.SEED = app; // สำหรับดีบักในเครื่อง

function currentScreen() {
  const s = app.state.settings;
  if (app.status === 'unavailable') return SCREENS.unavailable;
  if (s.lock.enabled && app.locked) return SCREENS.lock;
  if (!s.onboarded) return SCREENS.welcome;
  return SCREENS[app.route.name] || SCREENS.home;
}

let lastRouteKey = '';
let screen = null;
let underSheet = null; // { name, y } หน้าที่อยู่ใต้แผ่นจดรายการ/ออมเข้าเป้า กับตำแหน่งเลื่อนตอนเปิดแผ่น
let restoreY = null; // ตำแหน่งเลื่อนที่จะคืนให้ตอนปิดแผ่น

function render() {
  const next = currentScreen();
  const routeKey = (next === SCREENS[app.route.name] ? app.route.hash : next.id) || '';
  const sameRoute = routeKey === lastRouteKey;

  // จำโฟกัสไว้ วาดใหม่แล้วคืนให้ (ช่องกรอกจะได้ไม่หลุด)
  const active = document.activeElement;
  const focusId = sameRoute && active && active.id && view.contains(active) ? active.id : null;
  const sel = focusId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;

  screen = next;
  view.innerHTML = toHTML(screen.render(app, app.route));
  // tab/title เป็นฟังก์ชันได้ (เช่น หน้ารวมเรียนรู้มีแถบเมนู แต่หน้าบทเรียนไม่มี)
  const tab = (typeof screen.tab === 'function' ? screen.tab(app.route) : screen.tab) || null;
  const title = typeof screen.title === 'function' ? screen.title(app, app.route) : screen.title;
  tabbar.hidden = !tab;
  appEl.classList.toggle('has-tabs', !!tab);
  if (tab) {
    tabbar.innerHTML = toHTML(TABS.map(([id, label, ic]) => html`
      <a href="#/${id}" ${id === tab ? html`aria-current="page"` : ''}>${icon(ic)}${label}</a>`));
  }
  document.title = title ? `${title} · SEED` : 'SEED';
  if (screen.mount) screen.mount(app, view, app.route);

  if (!sameRoute) {
    window.scrollTo(0, restoreY ?? 0);
    restoreY = null;
    const h = view.querySelector('h1');
    if (h && document.activeElement === document.body) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  } else if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch { /* บาง type ไม่รองรับ */ }
    }
  }
  lastRouteKey = routeKey;
}

// ---------- เหตุการณ์ (ส่งต่อให้หน้าปัจจุบัน) ----------
/** ปุ่มที่ใช้ได้ทุกหน้า (หน้าไหนมีชื่อเดียวกันจะใช้ของหน้านั้นก่อน) */
const GLOBAL_ACTIONS = {
  'nav-back': (a, el) => a.back(el.dataset.fallback || 'home'),
  go: (a, el) => a.go(el.dataset.to),
};
function delegate(type, key) {
  view.addEventListener(type, (e) => {
    const el = e.target.closest(`[data-${key}]`);
    if (!el || !view.contains(el) || !screen) return;
    const table = { act: screen.actions, in: screen.inputs, change: screen.changes }[key];
    const name = el.dataset[key];
    const fn = (table && table[name]) || (key === 'act' && GLOBAL_ACTIONS[name]);
    if (!fn) return;
    if (type === 'click') e.preventDefault();
    fn(app, el, e);
  });
}
delegate('click', 'act');
delegate('input', 'in');
delegate('change', 'change');
view.addEventListener('submit', (e) => e.preventDefault());

window.addEventListener('hashchange', () => {
  // จำความลึกของประวัติใน history.state: รายการใหม่ = ลึกขึ้น 1, ย้อน/ไปหน้า = อ่านค่าเดิม
  if (history.state && typeof history.state.d === 'number') app.depth = history.state.d;
  else {
    app.depth += 1;
    history.replaceState({ d: app.depth }, '');
  }
  const prev = app.route;
  app.route = parseHash();
  if (prev.name !== app.route.name) {
    // หน้าแบบแผ่น (จดรายการ, ออมเข้าเป้า) เปิดทับหน้าเดิม: เก็บสถานะหน้าเดิมไว้ เช่น เดือนที่เลือกในหน้าเงิน
    if (SCREENS[app.route.name]?.sheet) {
      if (SCREENS[prev.name]?.sheet) delete app.ui[prev.name];
      else underSheet = { name: prev.name, y: window.scrollY };
    } else {
      for (const k of Object.keys(app.ui)) if (k !== app.route.name) delete app.ui[k];
      restoreY = underSheet && underSheet.name === app.route.name ? underSheet.y : null;
      underSheet = null;
    }
  }
  render();
});

// ---------- รายการประจำ (ทำตอนเปิดแอพ) ----------
export function runRecurringNow() {
  const s = app.state;
  if (!s.settings.onboarded || !s.recurring.length) return;
  const r = runRecurring(s.recurring, s.transactions, app.today);
  const changed = r.added.length || r.recurring.some((x, i) => x.lastRun !== s.recurring[i].lastRun);
  if (!changed) return;
  s.recurring = r.recurring;
  s.transactions.push(...r.added);
  app.save();
  if (r.added.length) {
    const first = r.added[0];
    const name = first.note || 'รายการประจำ';
    const more = r.added.length > 1 ? ` และอีก ${r.added.length - 1} รายการ` : '';
    setTimeout(() => toast(`ลง${name} ${signed(first.amount, first.type)} ให้แล้ว${more}`, 4000), 300);
  }
}
app.runRecurringNow = runRecurringNow;

// ---------- ค่าเงิน USD/THB (เรียกเน็ตอย่างเดียวของแอพ: ส่งแค่สกุลเงินกับวันที่ ไม่รอ ไม่บล็อกแอพ) ----------
let fxBusy = false;
let fxTriedAt = 0;
/** ดึงเรทถ้าแคชเก่าเกิน 6 ชม. (เช็กใน refreshFx) — ลองไม่เกินนาทีละครั้ง ยกเว้น force (กดลองใหม่ / เน็ตกลับมา) */
async function refreshFxNow({ force = false } = {}) {
  if (fxBusy || typeof fetch !== 'function') return;
  if (!force && Date.now() - fxTriedAt < 60 * 1000) return;
  fxBusy = true;
  fxTriedAt = Date.now();
  try {
    const r = await refreshFx({ fetchFn: (url, opts) => fetch(url, opts), storage: localStorage, now: Date.now(), today: todayISO() });
    app.fx = r;
    // วาดใหม่เฉพาะเมื่อหน้าที่เปิดอยู่เปลี่ยนจริง: หน้าค่าเงิน (ป้ายออฟไลน์/ลองใหม่) หรือหน้าหลักเมื่อได้เรทใหม่
    // ไม่วาดทับหน้าล็อก/หน้าเริ่มต้น (ช่องที่กำลังพิมพ์จะหาย)
    const shown = currentScreen();
    if ((shown === SCREENS.fx && r.status !== 'cached') || (shown === SCREENS.home && r.status === 'fresh')) render();
  } catch {
    /* ไม่มีเรทก็ใช้แอพต่อได้ */
  } finally {
    fxBusy = false;
  }
}
app.refreshFxNow = refreshFxNow;
window.addEventListener('online', () => {
  refreshFxNow({ force: true });
  if (app.contentStatus === 'error') loadContent();
});

// ---------- บทเรียน/ข่าว (data/content.json จากเว็บเดียวกัน: ไม่มีข้อมูลส่วนตัว ไม่ส่งอะไรออกไป) ----------
let contentBusy = false;
let contentAt = 0;
let contentSig = '';
async function loadContent() {
  if (contentBusy || typeof fetch !== 'function') return;
  contentBusy = true;
  contentAt = Date.now();
  let changed = false;
  try {
    const c = await fetchContent((url, opts) => fetch(url, opts));
    const sig = JSON.stringify(c);
    changed = sig !== contentSig || app.contentStatus !== 'ok';
    contentSig = sig;
    app.content = c;
    app.contentStatus = 'ok';
  } catch {
    // มีของเดิมอยู่แล้วก็ใช้ต่อ ไม่มีเลย = บอกว่าโหลดไม่ได้
    if (!app.content) {
      changed = app.contentStatus !== 'error';
      app.contentStatus = 'error';
    }
  } finally {
    contentBusy = false;
  }
  // วาดใหม่เฉพาะหน้าที่ใช้เนื้อหา (ไม่วาดทับหน้าล็อก/หน้าเริ่มต้น/แผ่นจดรายการ)
  const shown = currentScreen();
  if (changed && (shown === SCREENS.home || shown === SCREENS.learn || shown === SCREENS.news)) render();
}
app.loadContent = loadContent;

// ---------- ล็อกเมื่อกลับมาหลังออกไปนาน ----------
let hiddenAt = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  const lock = app.state.settings.lock;
  if (lock.enabled && hiddenAt && Date.now() - hiddenAt > lock.autoLockMin * 60000) app.locked = true;
  hiddenAt = null;
  const t = todayISO();
  if (t !== app.today) app.today = t;
  if (!app.locked) runRecurringNow();
  render();
  refreshFxNow();
  if (Date.now() - contentAt > 10 * 60 * 1000) loadContent(); // กลับมาหลังออกไปนาน: อาจมีสรุปข่าวใหม่
});

// ---------- เปิดได้ตอนไม่มีเน็ต (sw.js เก็บไฟล์แอพไว้ในเครื่อง ไม่แตะข้อมูลเงิน) ----------
function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return; // https หรือ localhost เท่านั้น
  const go = () => navigator.serviceWorker.register('sw.js').catch(() => {});
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

// ---------- เริ่ม ----------
function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; // แอพจัดตำแหน่งเลื่อนเอง
  history.replaceState({ d: 0 }, '', location.hash ? undefined : '#/home');
  app.route = parseHash();
  app.locked = app.state.settings.lock.enabled;
  if (!app.locked) runRecurringNow();
  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((p) => { if (!p && navigator.storage.persist) navigator.storage.persist(); }).catch(() => {});
  }
  render();
  refreshFxNow();
  loadContent();
  registerSW();
}
boot();
