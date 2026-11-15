// SEED — รหัสผ่านหน้าล็อก
// เก็บแค่ hash แบบ PBKDF2-SHA256 + salt สุ่ม 16 ไบต์ ไม่เก็บ/ไม่ log ตัวรหัสเด็ดขาด
// หมายเหตุ: นี่คือหน้าจอกันคนเปิดดู ข้อมูลในเครื่องยังไม่ได้เข้ารหัส (v1)

export const ITERATIONS = 310000;
const MAX_FAILS = 5;
const WAIT_MS = 30000;

const subtle = () => globalThis.crypto.subtle;
const b64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const unb64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function derive(passcode, salt, iterations) {
  const key = await subtle().importKey('raw', new TextEncoder().encode(passcode), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return b64(new Uint8Array(bits));
}

/** ตัวอักษรภาษาอังกฤษหรือตัวเลข อย่างน้อย 4 ตัว; ผ่าน → '' */
export function validatePasscode(p) {
  if (!/^[A-Za-z0-9]*$/.test(p)) return 'ใช้ได้แค่ตัวอักษรภาษาอังกฤษกับตัวเลข';
  if (p.length < 4) return 'อย่างน้อย 4 ตัว';
  return '';
}

export async function hashPasscode(passcode, iterations = ITERATIONS) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: await derive(passcode, salt, iterations), iterations };
}

export async function verifyPasscode(passcode, rec) {
  if (!rec || !rec.salt || !rec.hash || !passcode) return false;
  const h = await derive(passcode, unb64(rec.salt), rec.iterations);
  let diff = h.length ^ rec.hash.length;
  for (let i = 0; i < Math.min(h.length, rec.hash.length); i++) diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

/** ใส่ผิดครั้งที่ 5 → รอ 30 วินาที แล้วเริ่มนับใหม่ */
export function registerFail(s, now) {
  const fails = (s.fails || 0) + 1;
  return fails >= MAX_FAILS ? { fails: 0, until: now + WAIT_MS } : { fails, until: s.until || 0 };
}
/** ต้องรออีกกี่วินาที (0 = ใส่ได้เลย) */
export function lockedFor(s, now) {
  return s.until > now ? Math.ceil((s.until - now) / 1000) : 0;
}
