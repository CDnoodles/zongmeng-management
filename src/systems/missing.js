/* ==========================================================================
 * missing.js — 失踪回归
 * 由 xiuxiantest.html 拆分而来（原「失踪回归」段）
 * ========================================================================== */
import { DUNGEONS } from '../core/constants.js';
import { S } from '../core/state.js';
import { addLog } from '../core/log.js';
import { pick, weightedPick } from '../core/utils.js';
import { makeItemFromLoot, maybeHide } from '../core/items.js';
import { queueEvent } from '../core/event-queue.js';
import { noDemonOnMissing } from '../core/mods.js';

/* 平安归来并带回一件战利品 */
function returnWithItem(d, duration, note) {
  d.status = 'idle';
  delete d.missingStart;
  delete d.returnMonth;
  S.disciples.push(d);
  const dg = pick(DUNGEONS);
  const item = makeItemFromLoot(weightedPick(dg.loot), d.id);
  maybeHide(d, item);
  if (!d.backpack) d.backpack = [];
  d.backpack.push(item);
  addLog(`✨ ${d.name} 失踪 ${duration} 月后归来，带回【${item.name}】！${note || ''}`, 'good');
}

/* 归来但引来强敌 */
function returnWithEnemy(d) {
  d.status = 'idle';
  delete d.missingStart;
  delete d.returnMonth;
  S.disciples.push(d);
  addLog(`⚔ ${d.name} 归来，却引来了强敌！`, 'warn');
  queueEvent('revenge', { name: d.name });
}

function processMissing() {
  const remaining = [];
  for (const d of S.missing) {
    if (S.month < d.returnMonth) { remaining.push(d); continue; }
    const duration = S.month - (d.missingStart || S.month);
    const roll = Math.random();

    let outcome;
    if (roll < 0.35) outcome = 'item';
    else if (roll < 0.55) outcome = 'enemy';
    else if (roll < 0.75) outcome = 'dead';
    else outcome = 'demon';

    /* 道心通明：不会堕入魔道 —— 把最坏的结局转成平安归来 */
    let savedByDao = false;
    if (outcome === 'demon' && noDemonOnMissing(d)) { outcome = 'item'; savedByDao = true; }

    if (outcome === 'item') {
      returnWithItem(d, duration, savedByDao ? '（道心通明，于魔障中安然脱身）' : '');
    } else if (outcome === 'enemy') {
      returnWithEnemy(d);
    } else if (outcome === 'dead') {
      addLog(`💀 有人在山野间发现了 ${d.name} 的遗物……他已陨落。`, 'bad');
    } else {
      /* TODO(事件专项)：原本有专属的「入魔之敌」事件，删掉老祖选项后只剩一个选项，
         暂时改走 revenge 保住"入魔者回来叫阵"这个威胁，重做事件时再恢复。 */
      addLog(`😈 ${d.name} 归来时已入魔，化身仇敌在门外叫阵！`, 'bad');
      queueEvent('revenge', { name: d.name });
    }
  }
  S.missing = remaining;
}

export { processMissing };
