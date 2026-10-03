/* ==========================================================================
 * mods.js — 天赋/灵根的数值汇总层（唯一出口）
 *
 * 调用方（monthly / loyalty / inventory / dungeon / missing / tournament）一律
 * 通过这里取值，不直接读 TALENTS 的 mods —— 以后加天赋只改注册表。
 * ========================================================================== */
import { TALENTS } from './talents.js';
import { rootCultivationMul } from './spirit-root.js';
import { hasEquippedTag } from './items.js';
import { ELDER_DEFAULT_SHARE, ELDER_SELF_KEEP_CAP } from './constants.js';
import { clamp } from './utils.js';

const DEFAULT_LOYALTY_CAP = 100;

/* 汇总一名弟子所有天赋的修正。乘法项相乘，加法项相加，布尔项取或。 */
function modsOf(d) {
  const out = {
    cultivationMul: 1,
    combatMul: 1,
    loyaltyRateMul: 1,
    loyaltyCap: DEFAULT_LOYALTY_CAP,
    searchLoyaltyMul: 1,
    dangerMul: 1,
    missingChanceAdd: 0,
    desperateChanceAdd: 0,
    monthlyLoyalty: 0,
    othersLoyaltyPerMonth: 0,
    omenMonthChance: 0,
    noDesert: false,
    noDemonOnMissing: false,
    monthlyGamble: false,
    sectLoyaltyRegen: 0,
    benchLoyaltyBonus: 0,
    /* B4 气运型 */
    dropCountAdd: 0,
    rarityBias: 0,
    teamDangerMul: 1,
    /* B5 体质型 */
    swordCultivationMul: 1,
    /* B6 伪人型 */
    hideChanceMul: 1,              /* 私藏概率倍率（伪君子） */
    displayLoyaltyFloor: 0,        /* 显示忠诚的下限（影后：永远 ≥80） */
    displayLoyaltyBonus: 0,        /* 显示忠诚虚高（绿茶 +20） */
    confiscateSplashOthers: 0,     /* 被搜刮时连带其他弟子掉的忠诚 */
    monthlyStonesCost: 0,          /* 每月暗耗宗门灵石（圣母婊） */
    teamBackstab: 0,               /* 同队背刺概率（恶毒女配） */
    dropTheft: 0,                  /* 同队时偷走掉落的概率（白莲花） */
    followerDefect: 0,             /* 叛逃时带走的人数上限（双面人） */
    enlightenChance: 0,            /* 被感化概率（黑切白 → 忠犬） */
    darkenBelow: 0,                /* 忠诚低于此值即黑化（白切黑） */
    /*
     * 长老自留比例（阶段四）。null = 没有任何天赋指定它，
     * 由 caller 兜底成 constants.ELDER_DEFAULT_SHARE。
     * 用 null 而不是 0 —— 0 是合法自留比例（只拿上缴的长老自留 0）。
     */
    elderShare: null,
  };
  if (!d || !Array.isArray(d.traits)) return out;
  for (const id of d.traits) {
    const m = TALENTS[id] && TALENTS[id].mods;
    if (!m) continue;
    if (typeof m.cultivationMul === 'number') out.cultivationMul *= m.cultivationMul;
    if (typeof m.combatMul === 'number') out.combatMul *= m.combatMul;
    if (typeof m.monthlyLoyalty === 'number') out.monthlyLoyalty += m.monthlyLoyalty;
    if (typeof m.othersLoyaltyPerMonth === 'number') out.othersLoyaltyPerMonth += m.othersLoyaltyPerMonth;
    if (typeof m.omenMonthChance === 'number') out.omenMonthChance = Math.max(out.omenMonthChance, m.omenMonthChance);
    if (m.monthlyGamble === true) out.monthlyGamble = true;
    if (typeof m.loyaltyRateMul === 'number') out.loyaltyRateMul *= m.loyaltyRateMul;
    if (typeof m.loyaltyCap === 'number') out.loyaltyCap = Math.min(out.loyaltyCap, m.loyaltyCap);
    if (typeof m.searchLoyaltyMul === 'number') out.searchLoyaltyMul *= m.searchLoyaltyMul;
    if (typeof m.dangerMul === 'number') out.dangerMul *= m.dangerMul;
    if (typeof m.missingChanceAdd === 'number') out.missingChanceAdd += m.missingChanceAdd;
    if (typeof m.desperateChanceAdd === 'number') out.desperateChanceAdd += m.desperateChanceAdd;
    if (m.noDesert === true) out.noDesert = true;
    if (m.noDemonOnMissing === true) out.noDemonOnMissing = true;
    if (typeof m.sectLoyaltyRegen === 'number') out.sectLoyaltyRegen = Math.max(out.sectLoyaltyRegen, m.sectLoyaltyRegen);
    if (typeof m.benchLoyaltyBonus === 'number') out.benchLoyaltyBonus = Math.max(out.benchLoyaltyBonus, m.benchLoyaltyBonus);
    if (typeof m.dropCountAdd === 'number') out.dropCountAdd += m.dropCountAdd;
    if (typeof m.rarityBias === 'number') out.rarityBias = Math.max(out.rarityBias, m.rarityBias);
    if (typeof m.teamDangerMul === 'number') out.teamDangerMul *= m.teamDangerMul;
    if (typeof m.swordCultivationMul === 'number') out.swordCultivationMul *= m.swordCultivationMul;
    if (typeof m.hideChanceMul === 'number') out.hideChanceMul *= m.hideChanceMul;
    if (typeof m.displayLoyaltyFloor === 'number') out.displayLoyaltyFloor = Math.max(out.displayLoyaltyFloor, m.displayLoyaltyFloor);
    if (typeof m.displayLoyaltyBonus === 'number') out.displayLoyaltyBonus += m.displayLoyaltyBonus;
    if (typeof m.confiscateSplashOthers === 'number') out.confiscateSplashOthers += m.confiscateSplashOthers;
    if (typeof m.monthlyStonesCost === 'number') out.monthlyStonesCost += m.monthlyStonesCost;
    if (typeof m.teamBackstab === 'number') out.teamBackstab = Math.max(out.teamBackstab, m.teamBackstab);
    if (typeof m.dropTheft === 'number') out.dropTheft = Math.max(out.dropTheft, m.dropTheft);
    if (typeof m.followerDefect === 'number') out.followerDefect = Math.max(out.followerDefect, m.followerDefect);
    if (typeof m.enlightenChance === 'number') out.enlightenChance = Math.max(out.enlightenChance, m.enlightenChance);
    if (typeof m.darkenBelow === 'number') out.darkenBelow = Math.max(out.darkenBelow, m.darkenBelow);
    /* 自留比例取最大值：多个天赋叠加时"最贪的那个说了算" */
    if (typeof m.elderShare === 'number') {
      out.elderShare = out.elderShare === null ? m.elderShare : Math.max(out.elderShare, m.elderShare);
    }
  }
  return out;
}

/*
 * 修炼倍率总入口 = 灵根倍率 × 天赋倍率 ×（先天剑体的剑道加成，仅当身上带着剑道之物）
 */
function cultivationMul(d) {
  const m = modsOf(d);
  let mul = rootCultivationMul(d) * m.cultivationMul;
  if (m.swordCultivationMul !== 1 && hasEquippedTag(d, '剑道')) mul *= m.swordCultivationMul;
  return mul;
}

function combatMul(d) { return modsOf(d).combatMul; }
function loyaltyCapOf(d) { return modsOf(d).loyaltyCap; }
function loyaltyRateMulOf(d) { return modsOf(d).loyaltyRateMul; }
function searchLoyaltyMul(d) { return modsOf(d).searchLoyaltyMul; }
function hideChanceMul(d) { return modsOf(d).hideChanceMul; }
function dangerMul(d) { return modsOf(d).dangerMul; }
function missingChanceAdd(d) { return modsOf(d).missingChanceAdd; }
function desperateChanceAdd(d) { return modsOf(d).desperateChanceAdd; }
function cannotDesert(d) { return modsOf(d).noDesert; }
function noDemonOnMissing(d) { return modsOf(d).noDemonOnMissing; }

/*
 * 长老自留比例：天赋没指定时回落到默认值，最后被硬上限夹住。
 * 依赖 constants 而不是在 mods.js 里写死数字，调参只改一处。
 */
function elderShareOf(d) {
  const raw = modsOf(d).elderShare;
  const v = typeof raw === 'number' ? raw : ELDER_DEFAULT_SHARE;
  return clamp(v, 0, ELDER_SELF_KEEP_CAP);
}

/*
 * 宗门级光环（福星）：为避免 mods.js 依赖 state.js 造成循环，
 * 由调用方把全体弟子的 traits 列表传进来，这里合并后取最大值。
 *   sectMods(S.disciples.map(d => d.traits))
 */
function sectMods(traitsList) {
  const merged = [];
  for (const list of traitsList || []) {
    if (Array.isArray(list)) merged.push(...list);
  }
  return modsOf({ traits: merged });
}

export {
  modsOf, cultivationMul, combatMul, sectMods,
  loyaltyCapOf, loyaltyRateMulOf, searchLoyaltyMul, hideChanceMul, dangerMul,
  missingChanceAdd, desperateChanceAdd, cannotDesert, noDemonOnMissing,
  elderShareOf,
};
