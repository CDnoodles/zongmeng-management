/* ==========================================================================
 * breakthrough.js — 弟子突破（修为 + 材料 + 宗主境界上限）
 * ========================================================================== */
import { REALMS, BREAKTHROUGH, DISCIPLE_BREAKTHROUGH_MATERIALS } from '../core/constants.js';
import { addLog } from '../core/log.js';
import { discipleRealmCap } from '../core/power.js';
import { hasMaterials, consumeMaterials } from '../core/items.js';
import { TALENTS, hasTrait } from '../core/talents.js';
import { queueEvent } from '../core/event-queue.js';

function tryBreakthrough(d) {
  const cap = discipleRealmCap();
  let leveled = false;

  while (
    d.realm < cap &&
    d.realm < REALMS.length - 1 &&
    d.cultivation >= BREAKTHROUGH[d.realm]
  ) {
    const materials = DISCIPLE_BREAKTHROUGH_MATERIALS[d.realm] || [];
    if (!hasMaterials(d, materials)) break;   // 材料不足，卡住

    consumeMaterials(d, materials);
    d.cultivation = 0;                        // 经验不继承
    d.realm++;
    leveled = true;
    addLog(`✦ ${d.name} 突破至 ${REALMS[d.realm]}！`, 'gold');
  }

  /* 修为满却被卡（宗主境界 or 材料不够）只提示一次 */
  if (leveled) {
    d.capNotified = false;

    /* 老爷爷戒指：每次突破都有概率被夺舍，延后 2 个月发作（走 S.scheduled 延时队列） */
    const ring = TALENTS.laoyeye;
    if (hasTrait(d, 'laoyeye') && ring && ring.possessionChance) {
      if (!d.traitState || typeof d.traitState !== 'object') d.traitState = {};
      if (!d.traitState.possessionPending && Math.random() < ring.possessionChance) {
        d.traitState.possessionPending = true;
        queueEvent('possession', { id: d.id, name: d.name, realm: d.realm }, 2);
        addLog(`💍 ${d.name} 突破时，指上那枚旧戒微微发烫……`, 'warn');
      }
    }
  } else if (
    d.realm >= cap &&
    d.realm < REALMS.length - 1 &&
    d.cultivation >= BREAKTHROUGH[d.realm] &&
    !d.capNotified
  ) {
    d.capNotified = true;
    addLog(`✧ ${d.name} 修为已满，但受宗主境界所限，无法再进一步。`, 'warn');
  }
  return leveled;
}

export { tryBreakthrough };
