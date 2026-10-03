/* ==========================================================================
 * talent-reveal.js — 隐藏天赋的解锁
 *
 * 解锁条件写在注册表的 reveal 字段（见 core/talents.js）：
 *   { type: 'cohab',      months, minLoyalty }  共处月数 + 忠诚
 *   { type: 'realm',      realm }               突破到指定境界
 *   { type: 'searches',   count }               被搜刮累计次数
 *   { type: 'dispatches', count }               出战秘境累计次数（气运型天赋用）
 *   { type: 'event' }                           只能由剧情 / 道具主动揭示
 * ========================================================================== */
import { TALENTS, traitVisible, traitExposed } from '../core/talents.js';
import { addLog } from '../core/log.js';

function revealConditionMet(d, id) {
  const t = TALENTS[id];
  if (!t || !t.reveal) return false;
  const r = t.reveal;
  if (r.type === 'cohab') {
    return (d.cohabMonths || 0) >= (r.months || 0) && (d.loyalty || 0) >= (r.minLoyalty || 0);
  }
  if (r.type === 'realm') return (d.realm || 0) >= (r.realm || 0);
  if (r.type === 'searches') return ((d.traitState && d.traitState.searches) || 0) >= (r.count || 1);
  if (r.type === 'dispatches') return ((d.traitState && d.traitState.dispatches) || 0) >= (r.count || 1);
  return false;
}

/* 主动揭示（观气符 / 鉴灵镜 / 剧情事件调用） */
function revealTrait(d, id) {
  if (!d || !TALENTS[id]) return false;
  if (!Array.isArray(d.traits) || !d.traits.includes(id)) return false;
  if (!Array.isArray(d.revealed)) d.revealed = [];
  if (d.revealed.includes(id)) return false;
  d.revealed.push(id);
  addLog(`👁 你识破了 ${d.name} 的隐藏天赋【${TALENTS[id].name}】！`, 'warn');
  return true;
}

/* 看穿伪装天赋（白莲花 / 绿茶 / 影后…）：真面目暴露，之后显示真实描述 */
function exposeTrait(d, id) {
  const t = TALENTS[id];
  if (!d || !t || t.visibility !== 'disguised') return false;
  if (!Array.isArray(d.traits) || !d.traits.includes(id)) return false;
  if (!Array.isArray(d.revealed)) d.revealed = [];
  if (d.revealed.includes(id)) return false;
  d.revealed.push(id);
  addLog(`🎭 ${d.name} 的真面目被看穿了 —— 【${t.name}】：${t.desc}`, 'bad');
  return true;
}

/* 检查并揭示所有已满足条件的天赋（隐藏 = 解锁 / 伪装 = 看穿），返回本次数量 */
function checkReveals(d) {
  if (!d || !Array.isArray(d.traits)) return 0;
  let n = 0;
  for (const id of d.traits) {
    const t = TALENTS[id];
    if (!t || !t.reveal) continue;
    if (t.visibility === 'hidden') {
      if (traitVisible(d, id)) continue;
      if (revealConditionMet(d, id)) { revealTrait(d, id); n++; }
    } else if (t.visibility === 'disguised') {
      if (traitExposed(d, id)) continue;
      if (revealConditionMet(d, id)) { exposeTrait(d, id); n++; }
    }
  }
  return n;
}

export { revealTrait, exposeTrait, checkReveals, revealConditionMet };
