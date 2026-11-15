// SEED — กราฟ SVG เล็ก ๆ ทำเอง ไม่ใช้ไลบรารี (สีตาม design tokens ใน styles.css)
import { raw, esc } from './ui.js';

const C = { track: '#262A31', text: '#F1F3F6', dim: '#2F3542', orange: '#FF9F6B' };
const f1 = (n) => (Math.round(n * 10) / 10).toString();

/**
 * วงแหวนความคืบหน้า
 * arcs = [{ frac 0–1, color, opacity? }] วาดตามลำดับ (อันหลังทับอันก่อน)
 */
export function ring({ size = 84, r = 34, stroke = 8, arcs = [], text = '', textSize = 15, label = '' }) {
  const c = size / 2;
  const len = 2 * Math.PI * r;
  const arc = (a) => {
    const f = Math.min(Math.max(Number(a.frac) || 0, 0), 1);
    if (f <= 0) return '';
    const op = a.opacity != null ? ` stroke-opacity="${a.opacity}"` : '';
    return `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${a.color}"${op} stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${f1(f * len)} ${f1(len)}" transform="rotate(-90 ${c} ${c})"/>`;
  };
  const t = text ? `<text x="${c}" y="${f1(c + textSize / 3)}" text-anchor="middle" fill="${C.text}" font-size="${textSize}" font-weight="600" font-family="IBM Plex Mono, monospace">${esc(text)}</text>` : '';
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}" style="flex:none"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${C.track}" stroke-width="${stroke}"/>${arcs.map(arc).join('')}${t}</svg>`);
}

/**
 * กราฟแท่ง (เช่น รายจ่ายรายวัน) — hot(v) = true → สีส้ม
 * กว้างเต็มการ์ด สัดส่วนคงที่ตาม viewBox
 */
export function bars({ values, width = 354, height = 70, label = '', hot = () => false }) {
  const n = values.length || 1;
  const step = width / n;
  const bw = step * 0.72;
  const max = Math.max(0, ...values);
  const base = height - 2;
  const rects = values.map((v, i) => {
    const h = max > 0 ? Math.max(4, (v / max) * (height - 4)) : 4;
    return `<rect x="${f1(i * step + (step - bw) / 2)}" y="${f1(base - h)}" width="${f1(bw)}" height="${f1(h)}" rx="4" fill="${hot(v) ? C.orange : C.dim}"/>`;
  });
  return raw(`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${rects.join('')}</svg>`);
}

const BLUE = '#7C9CFF';
const MUTED = '#9AA1AC';
const BG = '#0B0C0F';
const GRID = '#1D2027';
const SANS = 'IBM Plex Sans Thai, sans-serif';

/**
 * กราฟพื้นที่เงินทั้งหมด: เส้นฟ้า + พื้นจาง + จุดปลาย + ป้ายวันแรก/วันสุดท้าย
 * แกนตั้งเริ่มที่ 0 (ไม่ขยายความต่างให้ดูเกินจริง)
 */
export function area({ values, width = 354, height = 150, label = '', fromLabel = '', toLabel = '' }) {
  const top = 20;
  const base = 130;
  const right = width - 2;
  const n = values.length;
  const max = Math.max(...values, 0) * 1.08;
  const min = Math.min(...values, 0) * 1.08;
  const span = max - min || 1;
  const x = (i) => (n > 1 ? 2 + (i * (right - 2)) / (n - 1) : right);
  const y = (v) => base - ((v - min) / span) * (base - top);
  const pts = values.map((v, i) => `${f1(x(i))},${f1(y(v))}`).join(' ');
  const zero = f1(y(0));
  const grid = [40, 85, 130].map((gy) => `<line x1="0" y1="${gy}" x2="${width}" y2="${gy}" stroke="${GRID}"/>`).join('');
  const txt = (tx, anchor, s) => `<text x="${tx}" y="${height - 4}" text-anchor="${anchor}" fill="${MUTED}" font-size="11" font-family="${SANS}">${esc(s)}</text>`;
  return raw(`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${grid}`
    + `<polygon points="${pts} ${f1(x(n - 1))},${zero} ${f1(x(0))},${zero}" fill="${BLUE}" fill-opacity="0.12"/>`
    + `<polyline points="${pts}" fill="none" stroke="${BLUE}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<circle cx="${f1(x(n - 1))}" cy="${f1(y(values[n - 1]))}" r="5" fill="${BG}" stroke="${BLUE}" stroke-width="2.5"/>`
    + `${txt(2, 'start', fromLabel)}${txt(width - 2, 'end', toLabel)}</svg>`);
}

/** โดนัทสัดส่วน items = [{ amount, color }] — ไม่มีข้อมูล = วงเทา */
export function donut({ items = [], size = 120, label = '', text = '', sub = '' }) {
  const len = 2 * Math.PI * 44;
  const total = items.reduce((s, i) => s + i.amount, 0);
  let acc = 0;
  const segs = total > 0
    ? items.map((i) => {
      const l = (i.amount / total) * len;
      const seg = `<circle cx="60" cy="60" r="44" stroke="${i.color}" stroke-dasharray="${f1(Math.max(l - 2, 0))} ${f1(len)}" stroke-dashoffset="${f1(-acc)}"/>`;
      acc += l;
      return seg;
    }).join('')
    : `<circle cx="60" cy="60" r="44" stroke="${C.track}"/>`;
  const t1 = text ? `<text x="60" y="${sub ? 58 : 65}" text-anchor="middle" fill="${C.text}" font-size="16" font-weight="600" font-family="IBM Plex Mono, monospace">${esc(text)}</text>` : '';
  const t2 = sub ? `<text x="60" y="76" text-anchor="middle" fill="${MUTED}" font-size="11" font-family="${SANS}">${esc(sub)}</text>` : '';
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 120 120" role="img" aria-label="${esc(label)}" style="flex:none">`
    + `<g transform="rotate(-90 60 60)" fill="none" stroke-width="14">${segs}</g>${t1}${t2}</svg>`);
}

/**
 * กราฟเส้นค่าเงิน: แกนตั้งจากต่ำสุดถึงสูงสุดของช่วง (ค่าเงินขยับแคบ ๆ ถ้าเริ่มที่ 0 จะเห็นเป็นเส้นตรง)
 * จึงมีเส้นบอกระดับ + ตัวเลขสูงสุด/ต่ำสุดอยู่ขอบขวา (นอกพื้นที่เส้น ไม่ทับกัน)
 */
export function fxLine({ values, width = 354, height = 150, label = '', fromLabel = '', toLabel = '' }) {
  const n = values.length;
  const x0 = 2;
  const x1 = width - 50; // ขวาสุดเว้นที่ให้ตัวเลข
  const yHi = 25;
  const yLo = 125;
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const flat = hi - lo < 1e-9;
  const x = (i) => (n > 1 ? x0 + (i * (x1 - x0)) / (n - 1) : x1);
  const y = (v) => (flat ? (yHi + yLo) / 2 : yLo - ((v - lo) / (hi - lo)) * (yLo - yHi));
  const pts = values.map((v, i) => `${f1(x(i))},${f1(y(v))}`).join(' ');
  const gl = (gy) => `<line x1="0" y1="${gy}" x2="${width}" y2="${gy}" stroke="${GRID}"/>`;
  const val = (gy, v) => `<text x="${width - 2}" y="${f1(gy + 4)}" text-anchor="end" fill="${MUTED}" font-size="11" font-family="IBM Plex Mono, monospace">${v.toFixed(2)}</text>`;
  const txt = (tx, anchor, s) => `<text x="${tx}" y="${height - 4}" text-anchor="${anchor}" fill="${MUTED}" font-size="11" font-family="${SANS}">${esc(s)}</text>`;
  const levels = flat ? gl(75) + val(75, hi) : gl(yHi) + gl(75) + gl(yLo) + val(yHi, hi) + val(yLo, lo);
  const line = n > 1 ? `<polyline points="${pts}" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  return raw(`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${levels}${line}`
    + `<circle cx="${f1(x(n - 1))}" cy="${f1(y(values[n - 1]))}" r="4.5" fill="${BG}" stroke="${BLUE}" stroke-width="2"/>`
    + `${n > 1 ? txt(x0, 'start', fromLabel) : ''}${txt(x1, 'end', toLabel)}</svg>`);
}

export const SIM_COLORS = { good: '#3DDC97', mid: BLUE, bad: C.orange, invested: '#5A616D' };

/**
 * เครื่องจำลอง: 3 กรณี + เส้นประเงินที่ใส่ (ค่ารายปี ปีที่ 0 = ตอนนี้)
 * แกนตั้งเริ่มที่ 0 เพื่อให้เห็นขนาดจริงของส่วนต่าง
 */
export function simChart({ good, mid, bad, invested, label = '', width = 354, height = 192 }) {
  const base = 175;
  const years = invested.length - 1;
  const max = Math.max(1, ...good, ...mid, ...bad, ...invested);
  const x = (i) => 2 + (years > 0 ? (i * (width - 4)) / years : width - 4);
  const y = (v) => base - (Math.max(v, 0) / max) * 160;
  const pts = (arr) => arr.map((v, i) => `${f1(x(i))},${f1(y(v))}`).join(' ');
  const line = (arr, color) => `<polyline points="${pts(arr)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  const txt = (tx, anchor, s) => `<text x="${tx}" y="${height - 3}" text-anchor="${anchor}" fill="${MUTED}" font-size="11" font-family="${SANS}">${esc(s)}</text>`;
  return raw(`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">`
    + `<line x1="0" y1="55" x2="${width}" y2="55" stroke="${GRID}"/><line x1="0" y1="115" x2="${width}" y2="115" stroke="${GRID}"/>`
    + `<line x1="0" y1="${base}" x2="${width}" y2="${base}" stroke="${C.track}"/>`
    + `<polygon points="${pts(good)} ${f1(x(years))},${base} ${f1(x(0))},${base}" fill="${BLUE}" fill-opacity="0.08"/>`
    + `<polyline points="${pts(invested)}" fill="none" stroke="${SIM_COLORS.invested}" stroke-width="1.5" stroke-dasharray="4 4"/>`
    + line(bad, SIM_COLORS.bad) + line(mid, SIM_COLORS.mid) + line(good, SIM_COLORS.good)
    + txt(2, 'start', 'ตอนนี้') + txt(width - 2, 'end', `${years} ปี`) + '</svg>');
}

/** เส้นเล็ก ๆ ไม่มีแกน (เช่น ค่าเงิน 30 วัน) — ข้อมูลไม่ถึง 2 จุดไม่วาด */
export function spark({ values, width = 110, height = 44 }) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${f1((i * width) / (values.length - 1))},${f1(4 + (1 - (v - min) / span) * (height - 8))}`).join(' ');
  return raw(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true" style="flex:none">`
    + `<polyline points="${pts}" fill="none" stroke="${BLUE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
}
