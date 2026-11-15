// SEED — หน้าหลัก (#/home): แถบสรุป, เงินทั้งหมด + กราฟ, ทางลัด, เป้า, จ่ายไปกับอะไร, ค่าเงิน, ข่าว/บทเรียน
import { html, icon, int, money, baht, pct, thDay, thDate, thMonth, bool } from '../ui.js';
import {
  totalBalance, monthOf, monthTotals, heroSeries, goalStats, expenseBreakdown, budgetAlerts, categorySpend,
  startSteps, daysLeft, daysBetween, fxChange, thbToUsd,
} from '../calc.js';
import { fxRange, fxTrend } from '../fx.js';
import { ring, area, donut, spark } from '../charts.js';
import { learnProgress, nextLesson, newsBadge } from '../content.js';

const RANGE_BUTTONS = [['1m', '1 ด.'], ['3m', '3 ด.'], ['6m', '6 ด.'], ['1y', '1 ปี']];
const BLUE = '#7C9CFF';

/** ตัวอักษรแรกของชื่อ (ขึ้นต้นด้วยสระหน้า เ แ โ ใ ไ ให้เอาพยัญชนะตัวถัดไปมาด้วย) */
function initial(name) {
  const ch = Array.from(String(name || '').trim());
  if (!ch.length) return '';
  return /[เแโใไ]/.test(ch[0]) && ch[1] ? ch[0] + ch[1] : ch[0].toUpperCase();
}

function strip(ctx) {
  const { total, month, fx, days } = ctx;
  const moved = month.left !== 0 && (month.income > 0 || month.expense > 0);
  return html`<div class="strip" aria-label="สรุปย่อ">
    <span>เงิน <b>${int(total)}</b>${moved ? html` <span class="mono ${month.left < 0 ? 'warn' : 'up'}">${month.left < 0 ? '▼' : '▲'}${int(Math.abs(month.left))}</span>` : ''}</span>
    ${month.income > 0 ? html`<span>เก็บได้ <b>${pct(month.savingsRate)}</b></span>` : ''}
    ${days > 0 ? html`<span>อีก <b style="color:var(--blue)">${days}</b> วัน</span>` : html`<span>ถึงวันเปิดบัญชีแล้ว</span>`}
    ${fx ? html`<span>USD/THB <b>${fx.rate.toFixed(2)}</b></span>` : ''}
    ${ctx.newsNew > 0 ? html`<span>ข่าวใหม่ <b style="color:var(--fact)">${ctx.newsNew}</b></span>` : ''}
  </div>`;
}

function header(app) {
  const name = app.state.settings.name;
  const ini = initial(name);
  return html`<header class="row" style="gap:12px">
    <span class="avatar" aria-hidden="true">${ini || icon('sprout', 20)}</span>
    <span class="grow" style="min-width:0">
      <span class="small muted" style="display:block">สวัสดี</span>
      <span class="ellipsis" style="display:block;font-weight:600">${name || 'SEED'}</span>
    </span>
    <a class="icon-btn filled" href="#/settings" aria-label="ตั้งค่า" id="home-settings">${icon('menu', 20)}</a>
  </header>`;
}

function startCard(steps) {
  if (steps.done === 3) return '';
  const row = (done, text, href, id) => html`<a class="step-row ${done ? 'done' : ''}" href="${href}" id="${id}">
    <span class="step-dot" aria-hidden="true">${done ? icon('check', 14, 2.6) : ''}</span>
    <span class="grow">${text}${done ? html`<span class="sr"> (ทำแล้ว)</span>` : ''}</span>
    <span class="chev" aria-hidden="true">›</span>
  </a>`;
  return html`<section class="card start-card" aria-label="เริ่มต้นใช้งาน">
    <div class="row between base"><h2 class="h-title">เริ่มต้น 3 ขั้น</h2><span class="mono" style="font-size:13px;color:var(--blue-text)">${steps.done}/3</span></div>
    <div class="stack" style="gap:0">
      ${row(steps.entry, 'จดรายการแรก', '#/add?type=out', 'start-entry')}
      ${row(steps.budget, 'ตั้งงบรายหมวด', '#/settings?focus=budgets', 'start-budget')}
      ${row(steps.backup, 'สำรองข้อมูลครั้งแรก', '#/settings', 'start-backup')}
    </div>
  </section>`;
}

/** เตือนสำรองข้อมูลเมื่อส่งออกครั้งล่าสุดเกิน 30 วัน (ยังไม่เคยสำรอง = อยู่ในการ์ดเริ่มต้นแล้ว) */
function backupNote(app) {
  const last = app.state.settings.lastExport;
  if (!last) return '';
  const d = daysBetween(last, app.today);
  if (d <= 30) return '';
  return html`<a class="note warn row" href="#/settings" id="home-backup" style="text-decoration:none;gap:10px">
    ${icon('download', 18)}<span class="grow">สำรองข้อมูลล่าสุดเมื่อ ${d} วันก่อน แตะเพื่อไปสำรอง</span>${icon('next', 16)}
  </a>`;
}

function hero(app, ctx) {
  const range = app.local.range || '6m';
  const h = heroSeries(app.state, app.today, range);
  const big = html`<span class="big-num" id="home-total">${baht(ctx.total)}</span>`;
  if (!h) {
    return html`<section aria-label="เงินทั้งหมด" class="stack" style="gap:6px">
      <div class="muted" style="font-size:13px">เงินทั้งหมด</div>${big}
      <div class="empty-box" style="margin-top:8px">กราฟจะเริ่มขึ้นหลังจดรายการแรก</div>
    </section>`;
  }
  const ch = h.change;
  const chip = ch > 0 ? html`<span class="delta" id="home-change">▲ ${baht(ch)} ช่วงนี้</span>`
    : ch < 0 ? html`<span class="delta down" id="home-change">▼ ${baht(-ch)} ช่วงนี้</span>`
      : html`<span class="delta flat" id="home-change">เท่าเดิม ช่วงนี้</span>`;
  const values = h.points.map((p) => p.total);
  return html`<section aria-label="เงินทั้งหมด" class="stack" style="gap:6px">
    <div class="muted" style="font-size:13px">เงินทั้งหมด</div>
    <div class="row" style="gap:10px;flex-wrap:wrap">${big}${chip}</div>
    <div style="margin-top:8px">${area({
      values, fromLabel: thDay(h.from), toLabel: 'วันนี้',
      label: `กราฟเงินทั้งหมด ${thDay(h.from)} ฿${money(values[0])} ถึงวันนี้ ฿${money(values[values.length - 1])}`,
    })}</div>
    <div class="seg" role="group" aria-label="ช่วงเวลาของกราฟ">
      ${RANGE_BUTTONS.map(([k, label]) => html`<button data-act="range" data-r="${k}" id="range-${k}" aria-pressed="${bool(k === range)}">${label}</button>`)}
    </div>
  </section>`;
}

const quickActions = () => html`<section class="qa" aria-label="ทางลัด">
  <a href="#/add?type=out" id="qa-out"><span class="circle primary">${icon('minus', 22, 2.2)}</span>รายจ่าย</a>
  <a href="#/add?type=in" id="qa-in"><span class="circle">${icon('plus', 22, 2.2)}</span>รายรับ</a>
  <a href="#/save-goal" id="qa-save"><span class="circle">${icon('goal', 22)}</span>ออมเข้าเป้า</a>
  <a href="#/sim" id="qa-sim"><span class="circle">${icon('sim', 22)}</span>จำลอง</a>
</section>`;

function goalCard(app, steps) {
  const g = app.state.goals.find((x) => x.id === 'g1') || app.state.goals.find((x) => x.kind !== 'emergency');
  if (!g) return '';
  const st = goalStats(app.state, g, app.today);
  const p = Math.round(st.progress * 100);
  const arcs = [{ frac: st.progress, color: BLUE }];
  if (!steps.entry) {
    // ยังไม่มีรายการ: การ์ดย่อ (ยังไม่มี "ทำได้/ด." ให้เทียบ)
    return html`<a class="card row" href="#/plan" id="home-goal" style="flex-direction:row;gap:16px">
      ${ring({ size: 72, r: 29, stroke: 7, textSize: 14, arcs, text: `${p}%`, label: `${g.name} ความคืบหน้า ${p}%` })}
      <span class="grow stack" style="gap:2px;min-width:0">
        <span class="small muted">${/^[฀-๿]/.test(g.name) ? `เป้า${g.name}` : `เป้า ${g.name}`}</span>
        <span class="mono" style="font-size:20px;font-weight:600">${int(st.saved)}<span class="muted" style="font-size:14px;font-weight:400"> / ${int(st.target)}</span></span>
        ${st.need !== null ? html`<span class="small muted">ต้องเก็บเดือนละ ฿${int(st.need)}</span>` : ''}
      </span>
    </a>`;
  }
  const short = st.gap > 0;
  return html`<a class="card" href="#/plan" id="home-goal">
    <span class="row between label" style="gap:8px"><span class="ellipsis">GOAL · ${g.name}</span><span style="flex:none">${st.days !== null ? `เหลือ ${st.days} วัน` : ''}</span></span>
    <span class="row" style="gap:16px">
      ${ring({ arcs, text: `${p}%`, label: `${g.name} ความคืบหน้า ${p}%` })}
      <span class="grow stack" style="gap:2px;min-width:0">
        <span class="mono" style="font-size:22px;font-weight:600">${int(st.saved)}<span class="muted" style="font-size:14px;font-weight:400"> / ${int(st.target)}</span></span>
        ${g.deadline ? html`<span class="small muted">${thDate(g.deadline)}</span>` : ''}
      </span>
    </span>
    <span class="grid3" style="gap:8px">
      <span class="inner"><span class="label">ต้องเก็บ/ด.</span><span class="v" id="goal-need">${int(st.need)}</span></span>
      <span class="inner"><span class="label">ทำได้/ด.</span><span class="v" id="goal-avg">${int(st.avgLeft)}</span></span>
      ${short
        ? html`<span class="inner"><span class="label">ขาด/ด.</span><span class="v warn" id="goal-gap">−${int(st.gap)}</span></span>`
        : html`<span class="inner"><span class="label">เทียบแผน</span><span class="v up" id="goal-gap">ตามแผน</span></span>`}
    </span>
  </a>`;
}

function spendCard(app) {
  const s = app.state;
  const ym = monthOf(app.today);
  const b = expenseBreakdown(s.transactions, s.categories, ym);
  if (!b.total) {
    return html`<a class="card row" href="#/money" id="home-spend" style="flex-direction:row;gap:16px">
      ${donut({ size: 72, label: 'ยังไม่มีรายจ่ายเดือนนี้' })}
      <span class="muted" style="font-size:14px;line-height:1.6">ยังไม่มีรายจ่ายเดือนนี้ จดแล้วจะเห็นว่าเงินไปไหน</span>
    </a>`;
  }
  const alerts = budgetAlerts(s.categories, categorySpend(s.transactions, ym));
  const MAX = 5;
  const shown = b.items.length > MAX ? b.items.slice(0, MAX - 1) : b.items;
  const rest = b.items.slice(shown.length);
  const restSum = rest.reduce((n, i) => n + i.amount, 0);
  const label = `สัดส่วนรายจ่ายเดือนนี้ รวม ฿${money(b.total)}: ${b.items.map((i) => `${i.name} ฿${money(i.amount)}`).join(', ')}`;
  return html`<a class="card" href="#/money" id="home-spend">
    <span class="row between base"><span class="h-title">จ่ายไปกับอะไร</span><span class="small muted">${thMonth(ym)}</span></span>
    <span class="row" style="gap:16px">
      ${donut({ items: b.items, label, text: int(b.total), sub: 'จ่ายเดือนนี้' })}
      <span class="grow stack" style="gap:9px;font-size:13px;min-width:0">
        ${shown.map((i) => html`<span class="row" style="gap:8px"><span class="dot" style="background:${i.color}"></span><span class="grow ellipsis">${i.name}</span><span class="mono">${int(i.amount)}</span></span>`)}
        ${rest.length ? html`<span class="row muted" style="gap:8px"><span class="dot" style="background:var(--track)"></span><span class="grow ellipsis">อีก ${rest.length} หมวด</span><span class="mono">${int(restSum)}</span></span>` : ''}
      </span>
    </span>
    ${alerts.slice(0, 3).map((a) => html`<span class="note warn" style="font-size:12px;padding:8px 12px">${a.name} ${a.over ? `เกินงบแล้ว ฿${money(a.overBy)}` : `ใช้ไป ${a.pct}% ของงบแล้ว`}</span>`)}
  </a>`;
}

/** การ์ดค่าเงิน (แสดงเมื่อมีเรทเก็บไว้แล้วเท่านั้น) */
function fxCard(app, fx) {
  if (!fx) return '';
  const hist = fxRange(fx, '30d');
  const t = hist.length >= 2 ? fxTrend(fxChange(hist)) : null;
  const chg = !t ? ''
    : t.dir === 'down' ? html` <span class="up nowrap" style="font-size:12px;font-weight:500">▼${t.pct} 30 วัน</span>`
      : t.dir === 'up' ? html` <span class="warn nowrap" style="font-size:12px;font-weight:500">▲${t.pct} 30 วัน</span>`
        : html` <span class="muted nowrap" style="font-size:12px;font-weight:500">เท่าเดิม 30 วัน</span>`;
  const g = app.state.goals.find((x) => x.id === 'g1');
  return html`<a class="card row" href="#/fx" id="home-fx" style="flex-direction:row;gap:14px;padding:16px 18px">
    <span class="grow stack" style="gap:2px;min-width:0">
      <span class="label">USD / THB</span>
      <span class="mono" style="font-size:24px;font-weight:600">${fx.rate.toFixed(2)}${chg}</span>
      <span class="small muted">${g ? html`<span class="nowrap">เป้า ${baht(g.target)} ≈ $${int(thbToUsd(g.target, fx.rate))}</span> · ` : ''}<span class="nowrap">เรท ${thDay(fx.date)}</span></span>
    </span>
    <span class="fx-spark">${spark({ values: hist.map((h) => h.rate) })}</span>
  </a>`;
}

/** ข่าว / บทเรียน — ข้อมูลจริงมาจาก content.json (ขั้น 6) ตอนนี้แสดงว่ายังว่าง */
/** ข่าวสัปดาห์นี้ (+ ป้าย n ใหม่ + เรื่องแรก) / บทถัดไป — เนื้อหาจาก content.json */
function tiles(app, steps) {
  const c = app.content;
  const waiting = app.contentStatus === 'error' ? 'โหลดไม่ได้ตอนนี้' : 'กำลังโหลด…';
  const d = c && c.digests[0];
  const top = d && d.top[0];
  const badge = newsBadge(c, app.state.news);
  const news = html`<a class="tile home-tile" href="#/news" id="home-news">
      <span class="row between small muted" style="gap:6px">${d ? 'ข่าวสัปดาห์นี้' : 'ข่าว'}${badge ? html`<span class="pill fact mono" id="home-news-badge">${badge} ใหม่</span>` : ''}</span>
      ${d ? html`<span class="tile-text">${top && top.ticker ? html`<b class="mono">${top.ticker}</b> ` : ''}${top ? top.title : d.title}</span>`
        : html`<span class="muted tile-note">${c ? 'ยังไม่มีสรุป สั่ง /digest ใน Claude Code' : waiting}</span>`}
    </a>`;

  const prog = learnProgress(c, app.state.learn);
  const L = c && nextLesson(c, app.state.learn);
  let learn;
  if (!c || !c.lessons.length) {
    learn = html`<a class="tile home-tile" href="#/learn" id="home-learn">
      <span class="small muted">บทเรียน · ${prog.done}/${prog.total}</span>
      <span class="muted tile-note">${c ? 'ยังไม่มีบทเรียน สั่ง /learn ใน Claude Code' : waiting}</span>
    </a>`;
  } else if (!L) {
    learn = html`<a class="tile home-tile" href="#/learn" id="home-learn">
      <span class="small muted">บทเรียน · ${prog.done}/${prog.total}</span>
      <span class="tile-text" style="font-weight:600">อ่านครบทุกบทแล้ว</span>
    </a>`;
  } else {
    learn = html`<a class="tile home-tile" href="#/learn/${L.id}" id="home-learn">
      <span class="small muted">${prog.done ? 'บทถัดไป' : 'บทแรก'} · <span class="mono">${L.n}/${prog.total}</span></span>
      <span class="stack s4"><span class="tile-text" style="font-weight:600">${L.title}</span>${L.written ? '' : html`<span class="small muted">ยังไม่เขียน สั่ง /learn</span>`}</span>
    </a>`;
  }
  // ยังไม่มีรายการ: บทเรียนขึ้นก่อน (เริ่มจากเรียน) / มีข้อมูลแล้ว: ข่าวขึ้นก่อน
  return html`<div class="grid2" style="gap:10px">${steps.entry ? html`${news}${learn}` : html`${learn}${news}`}</div>`;
}

export default {
  id: 'home',
  title: 'หน้าหลัก',
  tab: 'home',
  render(app) {
    const s = app.state;
    const ctx = {
      total: totalBalance(s),
      month: monthTotals(s.transactions, monthOf(app.today)),
      fx: app.fxNow().fx,
      days: daysLeft(s.settings.accountDate, app.today),
      newsNew: newsBadge(app.content, s.news),
    };
    const steps = startSteps(s);
    return html`${strip(ctx)}<div class="screen">
      <h1 class="sr">หน้าหลัก</h1>
      ${header(app)}
      ${startCard(steps)}
      ${backupNote(app)}
      ${hero(app, ctx)}
      ${quickActions()}
      ${goalCard(app, steps)}
      ${spendCard(app)}
      ${fxCard(app, ctx.fx)}
      ${tiles(app, steps)}
    </div>`;
  },
  actions: {
    range(app, el) {
      app.local.range = el.dataset.r;
      app.render();
    },
  },
};
