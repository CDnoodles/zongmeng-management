/* ==========================================================================
 * master.js — 宗主突破
 * ========================================================================== */
import { REALMS, MASTER_BREAKTHROUGH } from '../core/constants.js';
import { S } from '../core/state.js';
import { addLog } from '../core/log.js';
import { save } from '../core/save.js';
import { tryBreakthrough } from './breakthrough.js';
import { render } from '../ui/render.js';

function getNextBreakthrough() {
  const cur = S.masterRealm || 0;
  return MASTER_BREAKTHROUGH.find(b => b.from === cur) || null;
}

function canMasterBreakthrough() {
  const recipe = getNextBreakthrough();
  if (!recipe) return { ok: false, reason: '已达最高境界' };
  if (S.stones < recipe.stones) return { ok: false, reason: '灵石不足' };
  for (const m of recipe.materials) {
    const owned = S.storage.filter(it => it.rarity === m.rarity).length;
    if (owned < m.count) return { ok: false, reason: `${m.rarity}不足` };
  }
  return { ok: true, recipe };
}

function tryMasterBreakthrough() {
  const recipe = getNextBreakthrough();
  if (!recipe) { addLog('宗主已是最高境界。', 'warn'); render(); return; }

  if (S.stones < recipe.stones) {
    addLog(`灵石不足，需要 ${recipe.stones} 灵石。`, 'bad'); render(); return;
  }
  for (const m of recipe.materials) {
    const owned = S.storage.filter(it => it.rarity === m.rarity).length;
    if (owned < m.count) {
      addLog(`突破需要 ${m.rarity} × ${m.count}，当前仅有 ${owned} 件。`, 'bad');
      render(); return;
    }
  }

  /* 扣除灵石 */
  S.stones -= recipe.stones;

  /* 扣除材料：从后往前删，避免索引错乱 */
  for (const m of recipe.materials) {
    let remaining = m.count;
    for (let i = S.storage.length - 1; i >= 0 && remaining > 0; i--) {
      if (S.storage[i].rarity === m.rarity) {
        S.storage.splice(i, 1);
        remaining--;
      }
    }
  }

  /* 提升境界 */
  S.masterRealm = recipe.to;
  addLog(`✦ 宗主突破至 ${REALMS[recipe.to]}！宗门气运大涨。`, 'gold');

  /* 弟子境界上限随之提高，立刻尝试突破 */
  for (const d of S.disciples) tryBreakthrough(d);

  save();
  render();
}

export { tryMasterBreakthrough, getNextBreakthrough, canMasterBreakthrough };
