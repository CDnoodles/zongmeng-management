/* ==========================================================================
 * render.js — 
 * 由 xiuxiantest.html 拆分而来（原「」段）
 * ========================================================================== */
import { renderTop, renderEvent } from './topbar.js';
import { renderTournament, renderTournamentPreview } from './tournament.js';
import { renderMaster } from './master.js';
import { renderDisciples } from './disciples.js';
import { renderElders } from './elders.js';
import { renderDungeons } from './dungeons.js';
import { renderStorage } from './loot.js';
import { renderMountain } from './mountain.js';
import { renderRecruits, renderMissing, renderLog } from './side.js';
import { renderDebug } from './debug.js';

function render() {
  renderTop();
  renderEvent();
  renderTournamentPreview();
  renderTournament();
  renderMaster();
  renderDisciples();
  renderElders();
  renderDungeons();
  renderStorage();
  renderMountain();
  renderRecruits();
  renderMissing();
  renderLog();
  renderDebug();
}

export { render };
