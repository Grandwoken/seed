// ตัวจัดรูปแบบตัวเลขที่แสดงบนจอ (ไม่ต้องใช้ DOM)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { int, money, money2, baht, signed, parseMoney, bool, pct } from '../app/ui.js';

test('เปอร์เซ็นต์ปัดเป็นจำนวนเต็ม ติดลบใช้ −', () => {
  assert.equal(pct(0.364), '36%');
  assert.equal(pct(-0.2), '−20%');
  assert.equal(pct(-0.004), '0%');
});

test('ตัวเลขบวกใส่จุลภาคหลักพัน', () => {
  assert.equal(int(1234.4), '1,234');
  assert.equal(money(1234.5), '1,234.5');
  assert.equal(money2(1234.5), '1,234.50');
  assert.equal(baht(30000), '฿30,000');
});

test('ตัวเลขติดลบใช้เครื่องหมายลบจริง (−) ไม่ใช่ขีด (-)', () => {
  assert.equal(int(-1234.4), '−1,234');
  assert.equal(money(-65.5), '−65.5');
  assert.equal(money2(-65.5), '−65.50');
  assert.equal(baht(-500), '−฿500');
});

test('ค่าที่ปัดแล้วเป็นศูนย์ ไม่มีเครื่องหมายลบ', () => {
  assert.equal(int(-0.4), '0');
  assert.equal(money(-0.001), '0');
  assert.equal(baht(-0.2), '฿0');
});

test('รายจ่ายขึ้นต้นด้วย − รายรับขึ้นต้นด้วย +', () => {
  assert.equal(signed(65, 'out'), '−65');
  assert.equal(signed(4500, 'in'), '+4,500');
});

test('parseMoney รับจุลภาคและ ฿ ไม่รับข้อความหรือทศนิยมเกิน 2 ตำแหน่ง', () => {
  assert.equal(parseMoney('1,250.50'), 1250.5);
  assert.equal(parseMoney('฿ 300'), 300);
  assert.ok(Number.isNaN(parseMoney('')));
  assert.ok(Number.isNaN(parseMoney('abc')));
  assert.ok(Number.isNaN(parseMoney('1.234')));
  assert.ok(Number.isNaN(parseMoney('-5')));
});

test('bool ให้ "true"/"false" สำหรับ aria-pressed / aria-checked', () => {
  assert.equal(bool(true), 'true');
  assert.equal(bool(false), 'false');
  assert.equal(bool(0), 'false');
});
