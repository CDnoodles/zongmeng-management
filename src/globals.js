/* ==========================================================================
 * globals.js — inline onclick 兼容层
 * ==========================================================================
 *
 * 原单文件版里，所有按钮都写成 onclick="dispatch('x')" 这种内联形式，
 * 依赖函数处于全局作用域。改成 ES Module 后模块内不再有全局函数，
 * 内联属性会找不到它们，因此在这里显式挂到 window 上。
 *
 * 这是本次拆分唯一的一处兼容妥协。若日后想彻底去掉它，
 * 可把渲染函数里的 onclick="fn(arg)" 改成 data-action / data-arg 属性，
 * 再在 main.js 里用事件委托统一监听，然后删掉本文件。
 */

import { newGame } from './core/state.js';

import { refreshRecruits, recruit } from './systems/recruit.js';
import { toggleSelect } from './systems/selection.js';
import { dispatch } from './systems/dungeon.js';
import { refineItem, grantItemStart, grantCancel, grantItemTo,
         takeFromMountain, refineFromMountain, takeAllFromMountain,
         refineAllFromMountain } from './systems/loot.js';
import { equipItem, unequipItem, learnTechnique,
         forgetTechnique, confiscateItem, useItem } from './systems/inventory.js';
import { toggleDiscipleDetail } from './ui/discipleDetail.js';
import { startTournament, beginTournament,
         forfeitTournament, closeTournament } from './systems/tournament.js';
import { resolveEvent } from './systems/events.js';
import { tryMasterBreakthrough } from './systems/master.js';
import { nextMonth } from './systems/monthly.js';
import { switchTab } from './ui/tabs.js';
import { appointElder, dismissElder, assignDisciple, unassignDisciple,
         setScavengeStrategy, setCruiseStrategy } from './systems/elder.js';
import { toggleDebug,
         dbgMasterRealm, dbgStones, dbgRep,
         dbgRealm, dbgAllRealm, dbgCapAllRealm, dbgLoyalty, dbgMaxLoyaltyAll, dbgHealAll,
         dbgAddDisciples, dbgRecruitAllFree,
         dbgAppointAndFill, dbgDismissAllElders, dbgToggleScavengeOrder } from './ui/debug.js';

Object.assign(window, {
  /* 顶栏 / 底栏 */
  newGame,
  nextMonth,
  refreshRecruits,
  /* 弟子与秘境 */
  toggleSelect,
  dispatch,
  /* 仓库 */
  refineItem,
  grantItemStart,
  grantCancel,
  grantItemTo,
  /* 山头仓库（阶段四） */
  takeFromMountain,
  refineFromMountain,
  takeAllFromMountain,
  refineAllFromMountain,
  /* 弟子背包 / 装备 / 功法 */
  toggleDiscipleDetail,
  equipItem,
  unequipItem,
  learnTechnique,
  forgetTechnique,
  confiscateItem,
  useItem,
  /* 招募 */
  recruit,
  /* 宗门大比 */
  startTournament,
  beginTournament,
  forfeitTournament,
  closeTournament,
  /* 随机事件 */
  resolveEvent,
  /* 宗主 */
  tryMasterBreakthrough,
  /* 长老（阶段四） */
  appointElder,
  dismissElder,
  assignDisciple,
  unassignDisciple,
  setScavengeStrategy,
  setCruiseStrategy,
  /* 调试面板 */
  toggleDebug,
  dbgMasterRealm,
  dbgStones,
  dbgRep,
  dbgRealm,
  dbgAllRealm,
  dbgCapAllRealm,
  dbgLoyalty,
  dbgMaxLoyaltyAll,
  dbgHealAll,
  dbgAddDisciples,
  dbgRecruitAllFree,
  dbgAppointAndFill,
  dbgDismissAllElders,
  dbgToggleScavengeOrder,
  /* 左列 Tab */
  switchTab,
});
