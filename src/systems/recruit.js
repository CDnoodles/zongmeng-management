/* ==========================================================================
 * recruit.js — 招募
 * 由 xiuxiantest.html 拆分而来（原「招募」段）
 * ========================================================================== */
import { REALMS } from '../core/constants.js';
import { S, makeDisciple, maxDisciples } from '../core/state.js';
import { addLog } from '../core/log.js';
import { rootCostMul } from '../core/spirit-root.js';
import { save } from '../core/save.js';
import { render } from '../ui/render.js';

/* 招募价：悟性 / 境界 / 幸运 三项基础值，再乘灵根档位倍率。 */
function discipleCost(d) {
  return Math.round((20 + d.aptitude * 12 + d.realm * 70 + d.luck * 3) * rootCostMul(d));
}

function refreshRecruits(paid) {
  if (paid) {
    if (S.stones < 20) { addLog('灵石不足，无法刷新招募。', 'bad'); render(); return; }
    S.stones -= 20;
    addLog('你花费 20 灵石打探消息，换了一批招募人选。', 'warn');
  }
  S.recruits = [];
  for (let i = 0; i < 3; i++) {
    const d = makeDisciple();
    d.cost = discipleCost(d);
    S.recruits.push(d);
  }
  save();
  render();
}
function recruit(id) {
  const idx = S.recruits.findIndex(r => r.id === id);
  if (idx < 0) return;
  const d = S.recruits[idx];
  if (S.disciples.length >= maxDisciples()) {
    addLog(`宗门已满（${S.disciples.length}/${maxDisciples()}），需提升宗主境界方能再收弟子。`, 'bad');
    render(); return;
  }
  if (S.stones < d.cost) { addLog('灵石不足，无法招募。', 'bad'); render(); return; }
  S.stones -= d.cost;
  const newD = { ...d };
  delete newD.cost;
  S.disciples.push(newD);
  S.recruits.splice(idx, 1);
  addLog(`${newD.name}（${REALMS[newD.realm]}）拜入宗门。`, 'good');
  save();
  render();
}

export { refreshRecruits, recruit, discipleCost };
