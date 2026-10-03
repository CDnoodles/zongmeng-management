/* ==========================================================================
 * utils.js — 工具
 * 由 xiuxiantest.html 拆分而来（原「工具」段）
 * ========================================================================== */
import { REALMS, BREAKTHROUGH, RARITIES } from './constants.js';

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function weightedPick(items) {
  const total = items.reduce((s, it) => s + it.w, 0);
  let r = Math.random() * total;
  for (const it of items) { r -= it.w; if (r <= 0) return it; }
  return items[items.length - 1];
}
/*
 * 带稀有度偏向的掉落抽取（欧皇 / 锦鲤）。
 * bias=0 时与 weightedPick 完全等价（消耗同样的随机数个数）；
 * bias 越大，高稀有度条目权重越高：w' = w × (1 + bias × 稀有度序号)
 * 序号直接取自 RARITIES 的顺序，所以以后加品级不用再来改这里。
 */
const RARITY_RANK = (() => {
  const map = {};
  RARITIES.forEach((r, i) => { map[r] = i; });
  return map;
})();
function weightedPickLoot(loot, bias) {
  if (!bias) return weightedPick(loot);
  const biased = loot.map(it => ({ it, w: it.w * (1 + bias * (RARITY_RANK[it.rarity] || 0)) }));
  return weightedPick(biased).it;
}

function pickOwnerByLuck(survivors) {
  if (!survivors.length) return null;
  if (survivors.length === 1) return survivors[0];
  const weights = survivors.map(d => 1 + d.luck * 0.5);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < survivors.length; i++) {
    r -= weights[i];
    if (r <= 0) return survivors[i];
  }
  return survivors[survivors.length - 1];
}
function dungeonRates(dg) {
  const total = dg.loot.reduce((s, it) => s + it.w, 0);
  const byRarity = {};
  for (const it of dg.loot) {
    const r = it.rarity || '凡品';
    byRarity[r] = (byRarity[r] || 0) + it.w;
  }
  return RARITIES
    .filter(r => byRarity[r])
    .map(r => ({ rarity: r, pct: byRarity[r] / total * 100 }));
}
/* cap：弟子境界上限（宗主 - 2）。不传则只按境界表判断。
   maxed  = 已到境界表尽头，修为条走满显示「圆满」；
   blocked = 受宗主境界所限无法突破（还没满修为时不提示，否则新手一开局
             看到的全是「已至上境」，反而看不出修为进度）；
   ready  = blocked 且修为已攒够，这时才提示「已至上境」。 */
function cultInfo(d, cap) {
  const limit = Math.min(cap === undefined ? REALMS.length - 1 : cap, REALMS.length - 1);
  const maxed = d.realm >= REALMS.length - 1;
  const blocked = !maxed && d.realm >= limit;
  const need = maxed ? 0 : BREAKTHROUGH[d.realm];
  const pct = maxed ? 100 : clamp(d.cultivation / need * 100, 0, 100);
  const ready = blocked && d.cultivation >= need;
  return { maxed, blocked, ready, need, pct };
}

export { rand, randInt, pick, uid, clamp, weightedPick, weightedPickLoot, pickOwnerByLuck, dungeonRates, cultInfo };
