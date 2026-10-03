/* ==========================================================================
 * topbar.js — 
 * 由 xiuxiantest.html 拆分而来（原「」段）
 * ========================================================================== */
import { S } from '../core/state.js';
import { REALMS } from '../core/constants.js';
import { aweFactor } from '../core/power.js';
import { buildEvent } from '../systems/events.js';
import { pendingList } from '../core/event-queue.js';
import { el } from './dom.js';

function renderTop() {
  const awePercent = Math.round((1 - aweFactor()) * 100);
  el('topbar').innerHTML = `
    <span class="stat"><span class="ico">📅</span>第 <b>${S.month}</b> 月</span>
    <span class="stat"><span class="ico">💎</span>灵石 <b>${S.stones}</b></span>
    <span class="stat"><span class="ico">🏔</span>声望 <b>${S.rep}</b></span>
    <span class="stat"><span class="ico">☯</span>宗主 <b>${REALMS[S.masterRealm || 0]}</b></span>
    <span class="stat"><span class="ico">👁</span>威压 <b>${awePercent}%</b></span>
    <span class="stat"><span class="ico">👥</span>弟子 <b>${S.disciples.length}</b> 人</span>
  `;
}
/*
 * 待办清单（D2）：月末可能产出多条事件，这里逐条列出、逐条处理。
 * 列表清空后「进入下月」才会恢复可用（门禁在 monthly.js）。
 */
function renderEvent() {
  const box = el('event');
  const list = pendingList();
  if (!list.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';

  const itemsHtml = list.map((item, pi) => {
    const ev = buildEvent(item.id, item.data);
    if (!ev) {
      /* 未知事件 id（例如旧存档残留）：给个丢弃按钮，避免把待办列表卡死 */
      return `
        <div class="event-item">
          <div class="event-item-title">（无效事件 ${item.id}）</div>
          <div class="event-options">
            <button onclick="resolveEvent(${pi}, -1)">丢弃</button>
          </div>
        </div>`;
    }
    return `
      <div class="event-item">
        <div class="event-item-title">${ev.title}</div>
        <div class="event-item-desc">${ev.desc}</div>
        <div class="event-options">
          ${ev.options.map((o, oi) =>
            `<button class="btn-gold" onclick="resolveEvent(${pi}, ${oi})">${o.label}</button>`).join('')}
        </div>
      </div>`;
  }).join('');

  box.innerHTML = `
    <div class="event-box">
      <div class="event-title">⚡ 待处理事件 <span class="count">${list.length} 件</span></div>
      ${itemsHtml}
    </div>
  `;
}

export { renderTop, renderEvent };
