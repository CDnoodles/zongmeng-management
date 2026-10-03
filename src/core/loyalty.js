/* ==========================================================================
 * loyalty.js — 忠诚的唯一入口
 *
 * 收口原因：忠诚此前在 7 处被直接赋值
 *   monthly.js / loot.js / inventory.js / events.js(×3) / state.js(×2)
 * 且上限 100 硬编码在多处、另有几处 -= 完全不截断。
 * 天赋/灵根阶段只需要覆盖 d.loyaltyCap / d.loyaltyRateMul 即可，
 * 不必再去改那些散落的调用点。
 * ========================================================================== */
import { clamp } from './utils.js';
import { modsOf, loyaltyCapOf, loyaltyRateMulOf } from './mods.js';

const DEFAULT_CAP = 100;

/*
 * 忠诚上限：取「显式字段 d.loyaltyCap」与「天赋上限」的较小值。
 * 天赋（龙傲天 70 / 重生者 80 / 痴情 90）走 core/mods.js 汇总。
 */
function loyaltyCap(d) {
  const explicit = d && typeof d.loyaltyCap === 'number' ? d.loyaltyCap : DEFAULT_CAP;
  return Math.min(explicit, loyaltyCapOf(d));
}

/* 下降速率倍率（只作用于负向变化）：显式字段 × 天赋倍率（卷王 >1、懒狗 <1） */
function loyaltyRateMul(d) {
  const explicit = d && typeof d.loyaltyRateMul === 'number' ? d.loyaltyRateMul : 1;
  return explicit * loyaltyRateMulOf(d);
}

/*
 * 唯一入口：
 *   负向变化先乘 loyaltyRateMul → 结果按 [0, cap] 截断 → 返回「真实变化量」。
 * 调用方应当用返回值写日志，因为倍率与截断都可能让实际值与传入的 delta 不同。
 */
function changeLoyalty(d, delta, reason) {
  if (!d || !delta) return 0;
  const eff = delta < 0 ? delta * loyaltyRateMul(d) : delta;
  const before = typeof d.loyalty === 'number' ? d.loyalty : 0;
  const after = clamp(Math.round(before + eff), 0, loyaltyCap(d));
  d.loyalty = after;
  return after - before;
}

/* 绝对赋值：新弟子出场忠诚、事件强制设定 */
function setLoyalty(d, v) {
  if (!d) return 0;
  d.loyalty = clamp(Math.round(v), 0, loyaltyCap(d));
  return d.loyalty;
}

/*
 * UI 只读入口：伪装天赋会在这里说谎
 *   displayLoyaltyFloor（影后）：显示值永远不低于 80
 *   displayLoyaltyBonus（绿茶）：显示值虚高 +20
 * 真实数值一律走 d.loyalty（结算、叛逃判定都用它）。
 */
function displayLoyalty(d) {
  if (!d) return 0;
  const m = modsOf(d);
  let v = typeof d.loyalty === 'number' ? d.loyalty : 0;
  if (m.displayLoyaltyFloor) v = Math.max(v, m.displayLoyaltyFloor);
  if (m.displayLoyaltyBonus) v = Math.min(loyaltyCap(d), v + m.displayLoyaltyBonus);
  return Math.round(v);
}

export { loyaltyCap, loyaltyRateMul, changeLoyalty, setLoyalty, displayLoyalty };
