/* ==========================================================================
 * loot.js — 仓库（炼化 / 赏赐）
 * 由 xiuxiantest.html 拆分而来（原「战利品 / 仓库」段）
 *
 * 注意：战利品现在不再进全局待分配队列，而是直接进发现者背包（见
 * dungeon.js / missing.js）。本模块只负责宗门仓库（S.storage）的
 * 炼化与赏赐；「没收」弟子背包物品在 systems/inventory.js 里。
 * ========================================================================== */
import { S, grantingItemIndex, setGrantingItemIndex } from '../core/state.js';
import { addLog } from '../core/log.js';
import { uid } from '../core/utils.js';
import { changeLoyalty } from '../core/loyalty.js';
import { save } from '../core/save.js';
import { render } from '../ui/render.js';

function refineItem(i) {
  const it = S.storage[i];
  if (!it) return;
  S.stones += it.refine;                  // 1 refine = 1 灵石
  addLog(`你将【${it.name}】炼化为 ${it.refine} 灵石。`, 'good');
  S.storage.splice(i, 1);
  save();
  render();
}
function grantItemStart(i) { setGrantingItemIndex(i); render(); }
function grantCancel() { setGrantingItemIndex(-1); render(); }
function grantItemTo(discipleId) {
  if (grantingItemIndex < 0) return;
  const it = S.storage[grantingItemIndex];
  const d = S.disciples.find(x => x.id === discipleId);
  if (!it || !d) { setGrantingItemIndex(-1); render(); return; }

  const isReturn = it.originalOwnerId === discipleId;   // 是否物归原主

  /* 赏赐进背包（不再隐式装备，装备由老祖在弟子背包里手动操作） */
  const item = { ...it, id: it.id || uid(), hidden: false, secrecy: 0, ownerId: d.id };
  if (!d.backpack) d.backpack = [];
  d.backpack.push(item);

  if (isReturn) {
    addLog(`你将【${it.name}】还给 ${d.name}，他面无表情地收下了。`, 'warn');
  } else {
    const gain = Math.min(20, 5 + Math.floor(it.value / 5));
    const actual = changeLoyalty(d, gain, 'grant');   // 真实增量（可能被上限截断）
    addLog(`你将仓库中的【${it.name}】赏赐给 ${d.name}，忠诚 +${Math.max(0, actual)}。`, 'good');
  }

  S.storage.splice(grantingItemIndex, 1);
  setGrantingItemIndex(-1);
  save();
  render();
}

/* ==========================================================================
 * 山头仓库（阶段四）—— 长老搜刮上缴的东西
 *
 * 机制红利就在这里：玩家从山头仓库取用，**不掉任何弟子的好感**。
 * 所以这里只有"取出 / 炼化"两个动作，没有任何忠诚结算 —— 不是漏了，是设计。
 * ========================================================================== */

function mountainList() {
  if (!Array.isArray(S.mountainStorage)) S.mountainStorage = [];
  return S.mountainStorage;
}

/* 取出：进宗门仓库，之后照常炼化 / 赏赐（赏赐才会加忠诚） */
function takeFromMountain(i) {
  const list = mountainList();
  const it = list[i];
  if (!it) return;
  S.storage.push(it);
  list.splice(i, 1);
  save(); render();
}

/* 炼化：直接换灵石（1 refine = 1 灵石，与宗门仓库同口径） */
function refineFromMountain(i) {
  const list = mountainList();
  const it = list[i];
  if (!it) return;
  S.stones += it.refine || 0;
  list.splice(i, 1);
  addLog(`你将山头上缴的【${it.name}】炼化为 ${it.refine || 0} 灵石。`, 'good');
  save(); render();
}

function takeAllFromMountain() {
  const list = mountainList();
  if (!list.length) return;
  const n = list.length;
  S.storage.push(...list);
  S.mountainStorage = [];
  addLog(`你把山头仓库的 ${n} 件物品全部转入宗门仓库。`, 'good');
  save(); render();
}

function refineAllFromMountain() {
  const list = mountainList();
  if (!list.length) return;
  const n = list.length;
  const gain = list.reduce((s, it) => s + (it.refine || 0), 0);
  S.stones += gain;
  S.mountainStorage = [];
  addLog(`你把山头仓库的 ${n} 件物品全部炼化，共得 ${gain} 灵石。`, 'good');
  save(); render();
}

export {
  refineItem, grantItemStart, grantCancel, grantItemTo,
  takeFromMountain, refineFromMountain, takeAllFromMountain, refineAllFromMountain,
};
