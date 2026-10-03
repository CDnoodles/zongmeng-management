/* ==========================================================================
 * items.js — 物品工具（纯函数，不依赖全局状态 S）
 * ========================================================================== */
import { BONUS_FACTOR, RARITY_SECRECY, RARITY_REALM_LIMIT, TECHNIQUE_SLOT_MAX, REALMS, DUNGEONS } from './constants.js';
import { clamp, uid } from './utils.js';
/* 注意：mods.js 也 import 本模块的 hasEquippedTag —— 这是运行时循环（只在函数里互相调用），
   ESM 下安全；不要在任一侧的模块顶层互相取值。 */
import { hideChanceMul } from './mods.js';

/* 战力加成：bonus = floor(value * 系数) */
function itemBonus(item) {
  if (!item) return 0;
  return Math.floor((item.value || 0) * (BONUS_FACTOR[item.type] || 0));
}

/* 功法栏容量：1 + floor(realm/2)，上限 TECHNIQUE_SLOT_MAX */
function techniqueSlots(d) {
  return clamp(1 + Math.floor((d.realm || 0) / 2), 1, TECHNIQUE_SLOT_MAX);
}

/* ---------------- 境界限制（realmLimit） ----------------
 * 规则：弟子的境界 >= realmLimit 才能装备 / 修习该物品。
 * 修炼类物品（武器/法宝/功法）必经此关；丹药走服用、材料走突破，不受此限。
 */

/* 物品境界门槛：显式字段优先，否则按品级查表（RARITY_REALM_LIMIT）。 */
function realmLimitOf(item) {
  if (!item) return 0;
  if (typeof item.realmLimit === 'number') return item.realmLimit;
  return RARITY_REALM_LIMIT[item.rarity] || 0;
}

/* 该物品是否受境界限制约束（只有能"穿上/修习"的类型才受限） */
function isRealmGatedItem(item) {
  if (!item) return false;
  return item.type === '武器' || item.type === '法宝' || item.type === '功法';
}

/* 弟子能否使用该物品。返回 { ok, need, needLabel }，UI 直接用 needLabel 提示。 */
function canUseItem(d, item) {
  const need = realmLimitOf(item);
  if (!isRealmGatedItem(item) || need <= 0) return { ok: true, need: 0, needLabel: '' };
  const have = (d && d.realm) || 0;
  return { ok: have >= need, need, needLabel: REALMS[need] || `境界${need}` };
}

/* 按品级取门槛标签（掉落预览等没有具体物品时用） */
function rarityRealmLabel(rarity) {
  const need = RARITY_REALM_LIMIT[rarity] || 0;
  return need > 0 ? `需${REALMS[need] || need}` : '';
}

/*
 * 掉落表索引：按名字取出「当前常量表」里的物品模板。
 * 用途：(1) 掉落时补 realmLimit；(2) 旧存档按名字校正被改过数值的物品。
 * 注意 constants 是静态表，这里只读不写。
 */
const LOOT_TEMPLATE_BY_NAME = (() => {
  const map = {};
  for (const dg of DUNGEONS) for (const it of dg.loot) map[it.name] = it;
  return map;
})();

/* 掉落表模板 → 该模板应有的境界门槛（无则按品级查表） */
function lootRealmLimit(template) {
  if (!template) return 0;
  if (typeof template.realmLimit === 'number') return template.realmLimit;
  return RARITY_REALM_LIMIT[template.rarity] || 0;
}

/* 由掉落表模板生成物品实例（拷贝，避免污染静态掉落表） */
function makeItemFromLoot(template, ownerId) {
  const value = template.value || 0;
  return {
    id: uid(),
    name: template.name,
    type: template.type,
    rarity: template.rarity || '凡品',
    value,
    refine: template.refine || 0,
    bonus: itemBonus({ value, type: template.type }),
    hidden: false,
    secrecy: 0,
    ownerId,
    /* 境界限制：低境界弟子无法装备 / 修习（见 canUseItem） */
    realmLimit: lootRealmLimit(template),
    /* 搜刮该物品时的额外忠诚倍数（小绿瓶的灵液 = 3）。
       普通物品为 1，不改变原有公式。 */
    loyaltyHeat: template.loyaltyHeat || 1,
    /* 物品标签（剑道…）：供天赋做条件判定，没有则空数组 */
    tags: Array.isArray(template.tags) ? template.tags.slice() : [],
  };
}

/* 弟子身上所有"在用"的物品：装备四槽 + 已修习功法 */
function equippedItems(d) {
  if (!d) return [];
  const out = [];
  const eq = d.equipment;
  if (eq) for (const k of ['weapon', 'artifact', 'armor', 'accessory']) if (eq[k]) out.push(eq[k]);
  if (Array.isArray(d.techniques)) for (const it of d.techniques) if (it) out.push(it);
  return out;
}

/* 是否装备/修习了带某标签的物品（先天剑体判定"剑道"用） */
function hasEquippedTag(d, tag) {
  return equippedItems(d).some(it => Array.isArray(it.tags) && it.tags.includes(tag));
}

/*
 * 私藏判定：仅 loyalty < 45 时可能私藏。
 * 越不忠（sneak 越大）越爱藏；越贵重（valueWeight 越大）越优先藏。
 * 上界约 0.8，保证不会逢物必藏。
 */
function maybeHide(d, item) {
  if ((d.loyalty || 0) >= 45) return false;
  const sneak = clamp((45 - d.loyalty) / 45, 0, 1);
  const valueWeight = clamp((item.value || 0) / 300, 0, 1);
  /* 伪君子：私藏概率是常人的数倍（mods.hideChanceMul） */
  const p = clamp(sneak * (0.3 + 0.5 * valueWeight) * hideChanceMul(d), 0, 1);
  if (Math.random() < p) {
    item.hidden = true;
    item.secrecy = RARITY_SECRECY[item.rarity] || 1;
    return true;
  }
  return false;
}

/* 老祖能否看到该物品：非私藏永远可见；私藏需境界 >= 藏匿等级 */
function canSeeItem(masterRealm, item) {
  if (!item.hidden) return true;
  return (masterRealm || 0) >= (item.secrecy || 0);
}

/* 返回突破材料缺口清单；齐全时返回空数组。与 hasMaterials 同口径：只算背包里「可见」物品。 */
function materialsMissing(d, materials) {
  const out = [];
  if (!materials || !materials.length) return out;
  const bag = Array.isArray(d.backpack) ? d.backpack : [];
  for (const m of materials) {
    const have = bag.filter(it => !it.hidden && it.rarity === m.rarity).length;
    if (have < m.count) out.push({ rarity: m.rarity, need: m.count, have });
  }
  return out;
}

function hasMaterials(d, materials) {
  return materialsMissing(d, materials).length === 0;
}

/* 从背包扣除材料（从后往前删，避免索引错乱） */
function consumeMaterials(d, materials) {
  if (!materials || !materials.length) return;
  for (const m of materials) {
    let need = m.count;
    for (let i = d.backpack.length - 1; i >= 0 && need > 0; i--) {
      if (!d.backpack[i].hidden && d.backpack[i].rarity === m.rarity) {
        d.backpack.splice(i, 1);
        need--;
      }
    }
  }
}

/* 判断物品对弟子是否"当不了宝"：搜刮时不扣忠诚。
   三种情况：
     1) 弟子境界不够，根本用不了（realmLimit）—— 拿走一件他穿不上的东西，
        他没理由心疼，这是物品品级/境界限制上线后新增的豁免；
     2) 弟子已装备了更好的同类物品（次级装备）；
     3) 材料/丹药/灵石永远不算次级。 */
function isSurplusItem(d, item) {
  /* 用不了的装备：直接豁免 */
  if (!canUseItem(d, item).ok) return true;
  if (item.type === '武器') {
    return d.equipment.weapon && d.equipment.weapon.bonus >= item.bonus;
  }
  if (item.type === '法宝') {
    return d.equipment.artifact && d.equipment.artifact.bonus >= item.bonus;
  }
  if (item.type === '功法') {
    const slots = techniqueSlots(d);
    if (d.techniques.length < slots) return false;
    const worst = d.techniques.reduce((a, b) => a.bonus < b.bonus ? a : b);
    return worst.bonus >= item.bonus;
  }
  return false;
}

export {
  itemBonus, techniqueSlots, makeItemFromLoot, maybeHide, canSeeItem,
  hasMaterials, materialsMissing, consumeMaterials, isSurplusItem, equippedItems, hasEquippedTag,
  realmLimitOf, isRealmGatedItem, canUseItem, rarityRealmLabel, lootRealmLimit,
  LOOT_TEMPLATE_BY_NAME,
};
