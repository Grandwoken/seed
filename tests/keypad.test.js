// แป้นตัวเลขหน้าจดรายการ + ป้ายวันที่
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keypadPress, amountDisplay, dayLabel } from '../app/ui.js';

test('keypad: a digit replaces a lone 0, otherwise appends', () => {
  assert.equal(keypadPress('0', '5'), '5');
  assert.equal(keypadPress('5', '0'), '50');
  assert.equal(keypadPress('0', '0'), '0');
});

test('keypad: one decimal point, at most 2 decimals and 9 whole digits', () => {
  assert.equal(keypadPress('12', '.'), '12.');
  assert.equal(keypadPress('12.', '.'), '12.');
  assert.equal(keypadPress('0', '.'), '0.');
  assert.equal(keypadPress('12.3', '4'), '12.34');
  assert.equal(keypadPress('12.34', '5'), '12.34');
  assert.equal(keypadPress('123456789', '1'), '123456789');
  assert.equal(keypadPress('123456789', '.'), '123456789.');
});

test('keypad: delete removes the last character, down to 0', () => {
  assert.equal(keypadPress('12.3', 'del'), '12.');
  assert.equal(keypadPress('5', 'del'), '0');
  assert.equal(keypadPress('0', 'del'), '0');
});

test('typed amount shows thousands separators and keeps a trailing point', () => {
  assert.equal(amountDisplay('1234.5'), '1,234.5');
  assert.equal(amountDisplay('12.'), '12.');
  assert.equal(amountDisplay('1234567'), '1,234,567');
  assert.equal(amountDisplay('0'), '0');
});

test('date chip says วันนี้, เมื่อวาน, or the day and month', () => {
  assert.equal(dayLabel('2026-11-14', '2026-11-14'), 'วันนี้');
  assert.equal(dayLabel('2026-11-13', '2026-11-14'), 'เมื่อวาน');
  assert.equal(dayLabel('2026-12-31', '2027-01-01'), 'เมื่อวาน');
  assert.equal(dayLabel('2026-11-01', '2026-11-14'), '1 พ.ย.');
});
