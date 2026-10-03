/* ==========================================================================
 * defect-hooks.js — 天赋的「叛逃副作用」解释层
 *
 * core/talents.js 的 onDefect 只返回纯数据描述符（core 不能依赖 systems），
 * 由本文件翻译成实际效果：
 *   { type: 'seekRevenge', event: 'revenge', log }
 *   解释 → 触发寻仇事件 + 写日志
 *
 * 调用点（任何"弟子叛逃"的路径都要过这里，否则痴情就白瞎了）：
 *   - systems/inventory.js  purgeRunaway()   搜刮把忠诚压到 0 → 连夜叛逃
 *   - systems/monthly.js    phaseDesert()    月末自然叛逃
 *
 * isLovestruckDefect() 是配套的纯判定，给调用方决定要不要改写叛逃叙述。
 * ========================================================================== */
import { addLog } from '../core/log.js';
import { queueEvent } from '../core/event-queue.js';
import { traitOnDefect } from '../core/talents.js';

/* 描述符里的 {name} 占位符 */
function fillLog(d, text) {
  return String(text || '').replace(/\{name\}/g, d && d.name ? d.name : '他');
}

/* 弟子叛逃时结算天赋副作用。返回触发的效果数量（0 = 无特殊反应）。 */
function handleTraitDefect(d) {
  if (!d) return 0;
  const effects = traitOnDefect(d);
  let n = 0;
  for (const eff of effects) {
    if (eff.type === 'seekRevenge') {
      if (eff.log) addLog(fillLog(d, eff.log), 'bad');
      if (eff.event) queueEvent(eff.event, { name: d.name });
      n++;
    } else if (eff.log) {
      addLog(fillLog(d, eff.log), 'bad');
      n++;
    }
  }
  return n;
}

/* 纯判定：这名弟子是否带有"因爱生恨"式的叛逃副作用（不写日志、不排事件）。
   给调用方决定要不要改写叛逃叙述，或据此调整后续流程。 */
function isLovestruckDefect(d) {
  return !!(d) && traitOnDefect(d).length > 0;
}

export { handleTraitDefect, isLovestruckDefect };
