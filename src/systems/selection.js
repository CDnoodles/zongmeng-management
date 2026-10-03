/* ==========================================================================
 * selection.js — 弟子选中（秘境 / 大比共用）
 * 由 xiuxiantest.html 拆分而来（原「弟子选中（秘境 / 大比共用）」段）
 * ========================================================================== */
import { S, selected, tournamentSelected } from '../core/state.js';
import { addLog } from '../core/log.js';
import { render } from '../ui/render.js';
import { MAX_DUNGEON_RUNS } from '../core/constants.js'; 

function toggleSelect(id) {
  const d = S.disciples.find(x => x.id === id);
  if (!d || d.status === 'injured') return;

  if (S.tournament && S.tournament.phase === 'select') {
    if (tournamentSelected.has(id)) tournamentSelected.delete(id);
    else {
      if (tournamentSelected.size >= 3) { addLog('宗门大比最多报名 3 人。', 'warn'); render(); return; }
      tournamentSelected.add(id);
    }
    render();
    return;
  }

  if (!selected.has(id) && (d.dungeonRuns || 0) >= MAX_DUNGEON_RUNS) {
    addLog(`${d.name} 本月派遣次数已用完，需等下月。`, 'warn');
    render();
    return;
  }

  if (selected.has(id)) selected.delete(id);
  else {
    if (selected.size >= 3) { addLog('一次最多派遣 3 名弟子。', 'warn'); render(); return; }
    selected.add(id);
  }
  render();
}

export { toggleSelect };
