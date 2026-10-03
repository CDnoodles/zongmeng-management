/* ==========================================================================
 * spirit-root.js — 灵根（阶段二）
 *
 * 设计（对齐《天赋与灵根》整理版 4.1 / 4.2）：
 *   主属性纯度 = 最大灵根值 / 总灵根值
 *   修炼倍率   = 0.5 + 纯度 × 1.5
 *   → 单灵根 ×2.0 / 双 ×1.25 / 三 ×1.0 / 四 ×0.875 / 五 ×0.8
 *
 * 明确不做：五行相生、五行机关、克制、组队抗性、变异灵根（需元素战斗系统）。
 * ========================================================================== */
import { ELEMENTS, ROOT_TIER_WEIGHTS, ROOT_TIER_NAMES, ROOT_COST_MUL } from './constants.js';
import { clamp, weightedPick } from './utils.js';

/* 老存档兜底用的三灵根向量：纯度 1/3 ⇒ 修炼倍率恰好 ×1.0（等于改造前的行为） */
const ROOT_DEFAULT_TIER = 3;
const ROOT_DEFAULT_VECTOR = { 金: 1 / 3, 木: 1 / 3, 水: 1 / 3, 火: 0, 土: 0 };

/* 按权重抽档位（数字越小越好） */
function rollRootTier() {
  const chosen = weightedPick(ROOT_TIER_WEIGHTS.map(x => ({ tier: x.tier, w: x.w })));
  return chosen.tier;
}

/* 生成向量：从五行里不重复抽 tier 个，各占 1/tier */
function makeRoots(tier) {
  const n = clamp(tier || ROOT_DEFAULT_TIER, 1, ELEMENTS.length);
  const pool = ELEMENTS.slice();
  const picked = [];
  for (let i = 0; i < n; i++) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  const v = 1 / n;
  const roots = {};
  for (const k of ELEMENTS) roots[k] = 0;
  for (const k of picked) roots[k] = v;
  return roots;
}

/* 灵根条数：优先读缓存字段，读不到就从向量数非零项（老档兜底） */
function rootTier(d) {
  if (d && typeof d.rootTier === 'number') return d.rootTier;
  const r = d && d.roots;
  if (!r) return ROOT_DEFAULT_TIER;
  const n = ELEMENTS.filter(k => (r[k] || 0) > 0).length;
  return n > 0 ? n : ROOT_DEFAULT_TIER;
}

/* 非零灵根，按「金木水火土」固定顺序排列 */
function rootElements(d) {
  const r = d && d.roots;
  if (!r) return [];
  return ELEMENTS.filter(k => (r[k] || 0) > 0);
}

/*
 * 灵根全名 —— 光看名字就能读懂，不必再打向量：
 *   水单灵根 / 金木双灵根 / 金木水三灵根 / 金木水土四灵根 / 五灵根
 * （五行全占时不必逐个列出）
 */
function rootTypeName(d) {
  const list = rootElements(d);
  const n = list.length || rootTier(d);
  if (n >= ELEMENTS.length) return ROOT_TIER_NAMES[ELEMENTS.length] || '五灵根';
  const base = ROOT_TIER_NAMES[n] || '杂灵根';
  return list.length ? list.join('') + base : base;
}

/* 主属性纯度 = 最大灵根值 / 总灵根值 */
function rootPurity(d) {
  const r = d && d.roots;
  if (!r) return 1 / ROOT_DEFAULT_TIER;
  let max = 0, total = 0;
  for (const k of ELEMENTS) {
    const v = r[k] || 0;
    if (v > max) max = v;
    total += v;
  }
  return total > 0 ? max / total : 1 / ROOT_DEFAULT_TIER;
}

function rootMainElement(d) {
  const r = d && d.roots;
  if (!r) return '—';
  let best = '—', bv = 0;
  for (const k of ELEMENTS) if ((r[k] || 0) > bv) { bv = r[k]; best = k; }
  return best;
}

/* 灵根带来的修炼倍率（整理版 4.2） */
function rootCultivationMul(d) {
  return 0.5 + rootPurity(d) * 1.5;
}

/*
 * 修炼倍率总入口 —— 月末 growth 阶段用它。
 * 阶段三的天赋系数（卷王 / 懒狗 / 佛系…）会在这里叠加。
 */
function cultivationMul(d) {
  return rootCultivationMul(d);
}

function rootCostMul(d) {
  return ROOT_COST_MUL[rootTier(d)] || 1;
}

/* 五行向量转文本：默认 金1 · 木0.5；compact 模式 金1木.5（省空间、去前导 0） */
function rootVectorText(d, compact) {
  const r = d && d.roots;
  if (!r) return '—';
  const parts = ELEMENTS
    .filter(k => (r[k] || 0) > 0)
    .map(k => {
      const v = r[k];
      let shown;
      if (Math.abs(v - 1) < 1e-9) shown = '1';
      else {
        shown = v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
        if (compact) shown = shown.replace(/^0/, '');
      }
      return `${k}${shown}`;
    });
  return parts.join(compact ? '·' : ' · ');
}

export {
  ROOT_DEFAULT_TIER, ROOT_DEFAULT_VECTOR,
  rollRootTier, makeRoots, rootTier, rootTypeName, rootElements, rootPurity,
  rootMainElement, rootCultivationMul, cultivationMul, rootCostMul, rootVectorText,
};
