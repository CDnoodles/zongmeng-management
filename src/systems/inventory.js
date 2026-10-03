/* ==========================================================================
 * inventory.js — 弟子背包 / 装备栏 / 功法栏 动作
 * ========================================================================== */
import { S, selected } from '../core/state.js';
import { addLog } from '../core/log.js';
import { aweFactor } from '../core/power.js';
import { changeLoyalty } from '../core/loyalty.js';
import { modsOf, searchLoyaltyMul, cannotDesert } from '../core/mods.js';
import { save } from '../core/save.js';
import { tryBreakthrough } from './breakthrough.js';
import { render } from '../ui/render.js';
import { SLOT_DEFS, TECHNIQUE_TYPE, REALMS } from '../core/constants.js';
import { techniqueSlots, isSurplusItem, canUseItem } from '../core/items.js';
import { traitLoyaltyMods, hasTrait } from '../core/talents.js';
import { checkReveals } from './talent-reveal.js';
import { handleTraitDefect } from './defect-hooks.js';

function findDisciple(id) { return S.disciples.find(x => x.id === id); }

/* 搜刮导致忠诚跌破 0 → 连夜叛逃（忠犬等 noDesert 天赋免疫） */
function purgeRunaway() {
  S.disciples = S.disciples.filter(x => {
    if (x.loyalty > 0) return true;
    if (cannotDesert(x)) {
      addLog(`${x.name} 忠诚已跌至谷底，却仍不肯离你而去。`, 'warn');
      return true;
    }
    addLog(`✖ ${x.name} 因不满你的搜刮，连夜叛逃！`, 'bad');
    /* 痴情等天赋的叛逃副作用（因爱生恨 → 回头寻仇） */
    handleTraitDefect(x);
    selected.delete(x.id);
    return false;
  });
}

function equipItem(discipleId, itemId, slotKey) {
  const d = findDisciple(discipleId);
  if (!d) return;
  const slot = SLOT_DEFS.find(s => s.key === slotKey);
  if (!slot) return;
  const idx = d.backpack.findIndex(it => it.id === itemId);
  if (idx < 0) return;
  const item = d.backpack[idx];
  if (!slot.accepts.includes(item.type)) {
    addLog(`【${item.name}】不能放入${slot.label}栏。`, 'warn'); render(); return;
  }
  /* 境界限制：低境界弟子穿不上高境界装备（见 core/items.js canUseItem） */
  const gate = canUseItem(d, item);
  if (!gate.ok) {
    addLog(`✖ ${d.name} 只是${REALMS[d.realm]}修为，驾驭不了【${item.name}】（需${gate.needLabel}）。`, 'warn');
    render(); return;
  }
  d.backpack.splice(idx, 1);
  const prev = d.equipment[slotKey];
  if (prev) d.backpack.push(prev);
  d.equipment[slotKey] = item;
  addLog(`${d.name} 装备了【${item.name}】（战力 +${item.bonus}）。`, 'good');
  save(); render();
}

function unequipItem(discipleId, slotKey) {
  const d = findDisciple(discipleId);
  if (!d) return;
  const it = d.equipment && d.equipment[slotKey];
  if (!it) return;
  d.equipment[slotKey] = null;
  d.backpack.push(it);
  addLog(`${d.name} 卸下了【${it.name}】。`, 'warn');
  save(); render();
}

function learnTechnique(discipleId, itemId) {
  const d = findDisciple(discipleId);
  if (!d) return;
  const idx = d.backpack.findIndex(it => it.id === itemId);
  if (idx < 0) return;
  const item = d.backpack[idx];
  if (item.type !== TECHNIQUE_TYPE) {
    addLog(`【${item.name}】不是功法。`, 'warn'); render(); return;
  }
  if (d.techniques.length >= techniqueSlots(d)) {
    addLog(`${d.name} 功法栏已满（${techniqueSlots(d)}）。`, 'warn'); render(); return;
  }
  /* 境界限制：低境界弟子修习不了高境界功法 */
  const gate = canUseItem(d, item);
  if (!gate.ok) {
    addLog(`✖ ${d.name} 只是${REALMS[d.realm]}修为，参悟不了【${item.name}】（需${gate.needLabel}）。`, 'warn');
    render(); return;
  }
  d.backpack.splice(idx, 1);
  d.techniques.push(item);
  addLog(`${d.name} 修习了【${item.name}】（战力 +${item.bonus}）。`, 'good');
  save(); render();
}

function forgetTechnique(discipleId, itemId) {
  const d = findDisciple(discipleId);
  if (!d) return;
  const idx = d.techniques.findIndex(it => it.id === itemId);
  if (idx < 0) return;
  const [it] = d.techniques.splice(idx, 1);
  d.backpack.push(it);
  addLog(`${d.name} 放下功法【${it.name}】。`, 'warn');
  save(); render();
}

/* ==========================================================================
 * 没收（搜刮）—— 三层结构（阶段四拆分，行为与拆分前逐字一致）
 *
 *   第 1 层 scavengePenalty()   纯计算：豁免判定 + 基础忠诚代价，不产生副作用
 *   第 2 层 applyConfiscate()   施加一次没收：出背包 + 计数 + 扣忠诚，返回结果
 *   第 3 层 confiscateItem()   现有公开 API：原样保留日志 / 挑拨旁人 / 连夜叛逃 / 存盘
 *
 * 拆分的唯一目的：让长老的批量自动搜刮（systems/elder.js）能复用同一套
 * 豁免规则与代价公式，而不必复制粘贴，也不必继承"每件一条日志 + 每次存盘"。
 * ========================================================================== */

/*
 * 第 1 层：该物品对这名弟子的"没收代价"。
 *
 * 豁免（不扣忠诚）三种情况，沿用改造前的语义：
 *   1) 弟子境界不够，根本用不了（realmLimit）—— 拿走一件他穿不上的东西没理由心疼；
 *   2) 弟子已装备了更好的同类物品（次级装备）；
 *   3) 灵石是宗门货币，弟子只是顺手带回，不是他的私产。
 * 私藏被查获（wasHidden）时性质变成"私吞/私藏被没收"，一律照常重罚，不适用豁免。
 *
 * 注意：isSurplusItem 对"用不了的装备"本身就返回 true，所以 surplus ⊇ unusable，
 * 豁免判定沿用原实现的 `surplus || currency` 即可（unusable 只是用来选日志文案）。
 */
function scavengePenalty(d, item) {
  const out = { exempt: false, exemptReason: '', raw: 0, unusable: false, surplus: false, currency: false };
  if (!d || !item) return out;
  const wasHidden = !!item.hidden;
  out.unusable = !wasHidden && !canUseItem(d, item).ok;
  out.surplus = !wasHidden && isSurplusItem(d, item);
  out.currency = !wasHidden && item.type === '灵石';
  out.exempt = out.surplus || out.currency;
  out.exemptReason = !out.exempt ? '' : (out.currency ? 'currency' : (out.unusable ? 'unusable' : 'surplus'));
  /* 原式逐字保留：refine 缺失时原实现会走到 NaN → changeLoyalty 视作 0 代价，
     这里不能"顺手修"，否则老档里 refine 为 undefined 的物品会凭空开始掉忠诚。 */
  out.raw = Math.min(25, Math.ceil(item.refine / 2));
  return out;
}

/*
 * 第 2 层：施加一次没收。
 *
 * opts：
 *   countSearches  默认 true。false 时改记 d.traitState.elderSearches（长老搜刮专用，
 *                  见《长老机制_实施方案.md》D4）—— 这样痴情 / 小绿瓶 / 白莲花 /
 *                  绿茶 / 影后 这些以"被搜刮次数"为条件的隐藏天赋不会被长老一次性曝光。
 *   strategyMul    默认 1。搜刮策略的忠诚倍率（温和 0.5 / 平衡 1.0 / 激进 1.5 / 只拿上缴 0）。
 *                  ★ 保底 1 的 Math.max 必须放在乘它之前，否则"只拿上缴"会被兜底成 1。
 *   reason         changeLoyalty 的原因标签。
 *
 * 返回值：{ entry, penalty, ... } —— entry 是"入库形态"的物品副本，由调用方决定
 * 放进 S.storage 还是 S.mountainStorage；背包里那一件已经被移除。
 * 找不到物品时返回 null。
 *
 * 本函数**不写日志、不存盘、不渲染、不处理挑拨旁人、不调用 purgeRunaway**——
 * 那四件事由各调用方按自己的粒度决定（单件没收 = 每件一次；长老批量 = 每人一次）。
 */
function applyConfiscate(d, item, opts) {
  if (!d || !item) return null;
  const o = opts || {};
  if (!Array.isArray(d.backpack)) d.backpack = [];
  const idx = d.backpack.findIndex(it => it.id === item.id);
  if (idx < 0) return null;

  const wasHidden = !!item.hidden;
  const p = scavengePenalty(d, item);

  d.backpack.splice(idx, 1);
  /* 入库形态：私藏标记清掉，记下原主（山头仓库要能显示"来自 XX 的上缴"） */
  const entry = { ...item, hidden: false, secrecy: 0, originalOwnerId: d.id, ownerId: null };

  /* 搜刮计数：痴情既是「被搜刮」的解锁条件，也是它心凉的累计证据。
     长老搜刮走独立计数器，避免批量搜刮把伪人池一次性全部曝光（D4）。 */
  if (!d.traitState || typeof d.traitState !== 'object') d.traitState = {};
  if (o.countSearches === false) {
    d.traitState.elderSearches = (d.traitState.elderSearches || 0) + 1;
  } else {
    d.traitState.searches = (d.traitState.searches || 0) + 1;
    checkReveals(d);
  }

  /* 痴情：按当前忠诚分档，高忠诚时几乎不介意（×0.2），心凉后代价暴涨（×3） */
  const loyaltyMod = hasTrait(d, 'chiqing') ? traitLoyaltyMods(d, 'chiqing') : null;
  const tierMul = loyaltyMod ? loyaltyMod.searchMul : 1;
  const strategyMul = typeof o.strategyMul === 'number' ? o.strategyMul : 1;

  let penalty = 0;
  if (!p.exempt) {
    /* 保底 1 点：档位倍率（如痴情高忠诚 ×0.2）不能把损失四舍五入抹平，
       否则"搜刮"会变成完全无代价的白嫖。 */
    penalty = Math.max(1, Math.ceil(p.raw * aweFactor() * searchLoyaltyMul(d) * tierMul));
    /* 有的物品被夺走会格外伤感情（小绿瓶的灵液 loyaltyHeat = 3） */
    if (item.loyaltyHeat && item.loyaltyHeat > 1) penalty *= item.loyaltyHeat;
    if (wasHidden) penalty *= 2;
    /* 策略倍率放在保底之后：只拿上缴（0）必须能真正归零 */
    penalty = Math.round(penalty * strategyMul);
    penalty = Math.abs(changeLoyalty(d, -penalty, o.reason || 'confiscate'));
  }

  return {
    entry, penalty, exempt: p.exempt, exemptReason: p.exemptReason,
    unusable: p.unusable, surplus: p.surplus, currency: p.currency,
    wasHidden, loyaltyMod,
  };
}

/*
 * 第 3 层：公开 API（UI 的「没收」按钮 / tools 脚本）。
 * 单人单件：写日志 → 挑拨旁人 → 连夜叛逃 → 存盘渲染。
 */
function confiscateItem(discipleId, itemId) {
  const d = findDisciple(discipleId);
  if (!d) return;
  const idx = d.backpack.findIndex(it => it.id === itemId);
  if (idx < 0) return;
  const r = applyConfiscate(d, d.backpack[idx], { countSearches: true, strategyMul: 1 });
  if (!r) return;
  S.storage.push(r.entry);

  const { penalty, exempt, unusable, surplus, currency, wasHidden, loyaltyMod } = r;
  if (exempt) {
    let what = '用不上的';
    if (currency) what = '带回的';
    else if (unusable) what = '穿不上的';
    addLog(`你取走 ${d.name} ${what}【${r.entry.name}】入库，他并无异议。`, 'good');
  } else {
    const shown = penalty;
    /* 痴情：高忠诚档位的"恩宠"文案 */
    if (loyaltyMod && d.loyalty >= 70) {
      addLog(`💗 你取走 ${d.name} 的【${r.entry.name}】入库。他不但不恼，反倒觉得是恩宠`
        + `（忠诚 -${shown}，${loyaltyMod.note}）`, 'good');
    } else if (wasHidden) {
      addLog(`🔍 你识破了 ${d.name} 私藏的【${r.entry.name}】，没收充公。忠诚 -${shown}（被抓现行，重罚）。`, 'bad');
    } else if (loyaltyMod && d.loyalty < 30) {
      addLog(`💔 你取走 ${d.name} 的【${r.entry.name}】。他眼里的光彻底灭了（忠诚 -${shown}，${loyaltyMod.note}）。`, 'bad');
    } else {
      addLog(`你取走 ${d.name} 的【${r.entry.name}】入库。忠诚 -${shown}。`, 'warn');
    }
  }

  /* 伪人：被搜刮时挑拨旁人（白莲花 -5 / 伪君子 -4） */
  {
    const splash = modsOf(d).confiscateSplashOthers;
    if (splash) {
      let n = 0;
      for (const x of S.disciples) {
        if (x.id === d.id) continue;
        changeLoyalty(x, splash, 'confiscate.splash');
        n++;
      }
      if (n > 0) addLog(`😾 ${d.name} 的遭遇让其他弟子也心寒了（众人忠诚 ${splash}）。`, 'warn');
    }
  }

  /* 痴情等天赋的叛逃副作用统一在 purgeRunaway() 结算：
     忠诚归零 → 连夜叛逃 → 因爱生恨回头寻仇（不再按"搜刮满 N 次"硬触发）。 */

  purgeRunaway();
  save(); render();
}

/* 服用丹药：从背包消耗、涨修为。
   其余类型一律不在背包里处理（炼化只在宗门仓库进行），
   否则会绕过「没收」的忠诚代价，等于白嫖。 */
function useItem(discipleId, itemId) {
  const d = findDisciple(discipleId);
  if (!d) return;
  const idx = d.backpack.findIndex(it => it.id === itemId);
  if (idx < 0) return;
  const item = d.backpack[idx];
  if (item.type !== '丹药') {
    addLog(`【${item.name}】不能直接服用，请先没收入库再处理。`, 'warn');
    render(); return;
  }
  d.backpack.splice(idx, 1);
  d.cultivation += item.value;
  addLog(`${d.name} 服用了【${item.name}】，修为 +${item.value}。`, 'good');
  tryBreakthrough(d);
  save(); render();
}

export {
  equipItem, unequipItem, learnTechnique, forgetTechnique, confiscateItem, useItem,
  /* 阶段四：供 systems/elder.js 复用的两层 */
  scavengePenalty, applyConfiscate, purgeRunaway,
};
