// SEED — ทรัพย์สินสุทธิ, ดอกเบี้ย/เวลาผ่อนหนี้, ส่งออก CSV (ฟังก์ชันล้วน ไม่แตะหน้าจอ)
import { round2, totalBalance } from './calc.js';

/** ทรัพย์สินสุทธิ = เงินในกระเป๋า + ทรัพย์สิน (USD คูณเรท) − หนี้; ไม่มีเรท → ไม่นับส่วน USD และ missingFx = true */
export function netWorth(state, usdRate) {
  const cash = totalBalance(state);
  let assets = 0;
  let missingFx = false;
  for (const a of state.assets || []) {
    if (a.currency === 'USD') {
      if (usdRate > 0) assets += a.value * usdRate;
      else missingFx = true;
    } else assets += a.value;
  }
  const debts = round2((state.debts || []).reduce((t, d) => t + d.balance, 0));
  assets = round2(assets);
  return { cash, assets, debts, total: round2(cash + assets - debts), missingFx };
}

/** ดอกเบี้ยโดยประมาณเดือนนี้ = ยอด × ดอกเบี้ยต่อปี ÷ 12 */
export const monthlyInterest = (balance, ratePct) => round2((balance * ratePct) / 100 / 12);

/** ต้องจ่ายกี่เดือนถึงหมด (จ่ายเท่ากันทุกเดือน) — null = จ่ายไม่ถึงดอกเบี้ย ไม่มีวันหมด */
export function payoffMonths(balance, ratePct, pay) {
  if (!(balance > 0)) return 0;
  if (!(pay > 0)) return null;
  const r = ratePct / 100 / 12;
  if (r === 0) return Math.ceil(balance / pay - 1e-9);
  if (pay <= balance * r) return null;
  return Math.ceil(-Math.log(1 - (r * balance) / pay) / Math.log(1 + r) - 1e-9);
}

const TYPE_TH = { in: 'รายรับ', out: 'รายจ่าย', transfer: 'ย้ายเงิน' };

/** ช่องข้อความใน CSV: กันสูตร Excel (ขึ้นต้นด้วย = + - @) แล้วใส่เครื่องหมายคำพูดเมื่อจำเป็น */
function cell(v) {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n']/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** รายการทั้งหมดเป็น CSV (มี BOM ให้ Excel อ่านภาษาไทยถูก) เรียงตามวันที่ */
export function toCSV(state) {
  const cat = (id) => state.categories.find((c) => c.id === id)?.name || '';
  const wal = (id) => state.wallets.find((w) => w.id === id)?.name || '';
  const rows = [['วันที่', 'ประเภท', 'จำนวนเงิน', 'หมวด', 'กระเป๋า', 'ไปกระเป๋า', 'โน้ต'].join(',')];
  const txs = [...state.transactions].sort((a, b) => a.date.localeCompare(b.date));
  for (const t of txs) {
    const amount = t.type === 'out' ? -t.amount : t.amount;
    const r = t.type === 'transfer'
      ? [t.date, TYPE_TH.transfer, amount, '', cell(wal(t.fromWalletId)), cell(wal(t.toWalletId)), cell(t.note)]
      : [t.date, TYPE_TH[t.type], amount, cell(cat(t.categoryId)), cell(wal(t.walletId)), '', cell(t.note)];
    rows.push(r.join(','));
  }
  return `﻿${rows.join('\r\n')}\r\n`;
}
