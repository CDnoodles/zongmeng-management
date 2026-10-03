/* ==========================================================================
 * main.js — 入口
 * 由 xiuxiantest.html 拆分而来（原「启动」段）
 * ========================================================================== */

/* 必须先引入兼容层，它会把内联 onclick 需要的函数挂到 window 上 */
import './globals.js';

import { load } from './core/save.js';
import { S, newGame } from './core/state.js';
import { EVENTS } from './systems/events.js';
import { pendingList } from './core/event-queue.js';
import { refreshRecruits } from './systems/recruit.js';
import { reconcileElderAssignments } from './systems/elder.js';
import { render } from './ui/render.js';
import { initTabs } from './ui/tabs.js';

/* 左列 Tab 切换：只绑一次事件，render() 不参与 tab 状态，
   所以点过 tab 之后不会被每月的 render 重置。 */
initTabs();

if (!load()) {
  newGame();
} else {
  /* 丢掉读档后已不存在 id 的事件，避免待办列表被死条目卡住 */
  const list = pendingList();
  const valid = list.filter(e => e && EVENTS[e.id]);
  if (valid.length !== list.length) S.pending = valid;
  /* 读档后收敛一次长老关系：elderId 指向已不在名册里的长老时，
     把弟子放回玩家直接管辖，避免他们卡在「长老」栏里看不见。
     放在这里而不是 save.js —— 后者被 systems/ 反向依赖，会形成循环。 */
  reconcileElderAssignments();
  if (!S.recruits || !S.recruits.length) refreshRecruits(false);
  render();
}
