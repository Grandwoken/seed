// SEED — รายชื่อหน้าจอทั้งหมด (ชื่อ = ส่วนแรกของ #/...)
import { html } from '../ui.js';
import welcome from './welcome.js';
import lock from './lock.js';
import settings from './settings.js';
import add from './add.js';
import money from './money.js';
import saveGoal from './save-goal.js';
import home from './home.js';
import plan from './plan.js';
import sim from './sim.js';
import fx from './fx.js';
import learn from './learn.js';
import news from './news.js';

export const SCREENS = {
  home,
  money,
  plan,
  learn,
  news,
  add,
  'save-goal': saveGoal,
  sim,
  fx,
  settings,
  welcome,
  lock,
  unavailable: {
    id: 'unavailable',
    title: 'เปิดไม่ได้',
    render: () => html`<div class="screen"><h1>เบราว์เซอร์นี้ไม่ให้เก็บข้อมูล</h1>
      <p class="sub">SEED เก็บข้อมูลในเครื่องเท่านั้น ลองปิดโหมดไม่ระบุตัวตน หรือเปิดด้วย Chrome</p></div>`,
  },
};
