/* ==========================================================================
 * power.js — 核心数值
 * 由 xiuxiantest.html 拆分而来（原「核心数值」段）
 * ========================================================================== */
import { REALM_POWER } from './constants.js';
import { clamp } from './utils.js';
import { combatMul } from './mods.js';
import { S } from './state.js';

function basePowerOf(d) {
  if (!d) return 0;
  let p = REALM_POWER[d.realm] + (d.cultivation || 0);
  /* 装备栏 + 功法栏：各槽 bonus 累加（卡境界弟子可靠换装涨战力） */
  const eq = d.equipment;
  if (eq) {
    if (eq.weapon) p += eq.weapon.bonus || 0;
    if (eq.artifact) p += eq.artifact.bonus || 0;
    if (eq.armor) p += eq.armor.bonus || 0;
    if (eq.accessory) p += eq.accessory.bonus || 0;
  }
  if (Array.isArray(d.techniques)) {
    p += d.techniques.reduce((s, it) => s + (it && it.bonus ? it.bonus : 0), 0);
  }
  /* 兼容旧存档未迁移的 d.equip（迁移后会移除） */
  if (d.equip) p += d.equip.bonus || 0;
  /* 天赋战力倍率（魔胎 +30% / 天煞孤星 +20%）；放在基础值里，
     这样「基础战力 / 忠诚修正」两处显示口径一致。 */
  return p * combatMul(d);
}
function loyaltyModifier(d) {
  return 0.6 + (clamp(d.loyalty, 0, 100) / 100) * 0.4;
}
function powerOf(d) {
  if (!d) return 0;
  let p = basePowerOf(d) * loyaltyModifier(d);
  if (d.status === 'injured') p *= 0.5;
  return Math.floor(p);
}
function aweFactor() {
  const r = S.masterRealm || 0;
  return Math.max(0.2, 1 / (1 + r * 0.45));
}
/* 弟子境界上限 = 宗主境界 - 2。突破、修为条、宗主面板都读这一处。 */
function discipleRealmCap() {
  return Math.max(0, (S.masterRealm || 0) - 2);
}
/*
 * dangerMul：来自天赋的受伤/陨落倍率（佛系 0.6 等），由调用方从 core/mods.js 取。
 * 这里用参数传入而不是 import mods，是为了让 power.js 保持无副作用纯函数。
 */
function assessDanger(personalPower, difficulty, teamLevel, dangerMul = 1) {
  let baseDeath, baseInjure;
  if (teamLevel === '大胜') { baseDeath = 0.00; baseInjure = 0.02; }
  else if (teamLevel === '小胜') { baseDeath = 0.02; baseInjure = 0.10; }
  else if (teamLevel === '惨胜') { baseDeath = 0.10; baseInjure = 0.30; }
  else { baseDeath = 0.30; baseInjure = 0.35; }
  const r = personalPower / difficulty;
  let factor = 1 / clamp(r, 0.4, 3.0);
  factor = clamp(factor, 0.3, 2.5);
  const death = clamp(baseDeath * factor * dangerMul, 0, 0.6);
  const injure = clamp(baseInjure * factor * dangerMul, 0, 0.7);
  let label;
  if (r >= 1.2) label = '安全';
  else if (r >= 0.8) label = '均势';
  else if (r >= 0.5) label = '险境';
  else if (r >= 0.3) label = '危局';
  else label = '绝境';
  return { death, injure, label };
}

export { basePowerOf, loyaltyModifier, powerOf, aweFactor, discipleRealmCap, assessDanger };
