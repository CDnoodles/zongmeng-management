/* ==========================================================================
 * tournament.js — 
 * 由 xiuxiantest.html 拆分而来（原「」段）
 * ========================================================================== */
import { REALMS, REALM_COLORS } from '../core/constants.js';
import { S, tournamentSelected } from '../core/state.js';
import { el } from './dom.js';

function renderTournament() {
  const box = el('tournament');
  const t = S.tournament;
  if (!t) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'block';

  if (t.phase === 'select') {
    const selNames = [...tournamentSelected]
      .map(id => S.disciples.find(d => d.id === id))
      .filter(Boolean).map(d => d.name);
    box.innerHTML = `
      <div class="tournament-box">
        <div class="tournament-title">⚔ 宗门大比 · 报名</div>
        <div class="tournament-desc">
          对手弟子已抵达山门，请从下方弟子列表中点击选择 <b>1~3 名</b> 报名应战。<br>
          比赛采取三局两胜 / 车轮战：败者淘汰，胜者留场，先取两胜者获胜。
        </div>
        <div class="enemy-team">
          ${t.enemyTeam.map(e => `
            <div class="enemy-card">
              <span class="realm-badge" style="color:${REALM_COLORS[e.realm]}">${REALMS[e.realm]}</span>
              <b>${e.name}</b>
              <span class="sub">战力 ${e.power} · 幸运 ${e.luck}</span>
            </div>
          `).join('')}
        </div>
        <div class="event-options">
          <span style="color:#8a8aa0;font-size:12px;">
            已报名 <b style="color:#5a9fe0;">${tournamentSelected.size}</b>/3 人
            ${selNames.length ? '：' + selNames.join('、') : ''}
          </span>
          <button class="btn-gold" onclick="beginTournament()" ${tournamentSelected.size ? '' : 'disabled'}>开始比试</button>
          <button class="btn-red" onclick="if(confirm('弃权将损失声望并可能流失弟子，确定？')) forfeitTournament()">弃权认输</button>
        </div>
      </div>
    `;
    return;
  }

  if (t.phase === 'fight') {
    box.innerHTML = `
      <div class="tournament-box">
        <div class="tournament-title">⚔ 宗门大比 · 交战</div>
        <div class="tournament-desc">战斗进行中……</div>
      </div>
    `;
    return;
  }

  /* result */
  const myWins = t.myWins, enWins = t.enemyWins;
  const won = myWins > enWins;
  const summary = t.resultSummary || {};
  let resultHtml = '';

  if (summary.forfeit) {
    resultHtml = `<div style="color:#e05555;">你选择了弃权。声望 -20。</div>`;
  } else if (won) {
    resultHtml = `<div style="color:#5fb85f;">大比获胜！声望 +15，灵石 +80。</div>`;
    if (t.recruitReward) {
      resultHtml += `<div style="color:#8fd45f;font-size:12px;margin-top:4px;">
        ✨ 高资质散修【${t.recruitReward.name}（${REALMS[t.recruitReward.realm]}）】慕名而来，已加入招募候选（${t.recruitReward.cost} 灵石）。
      </div>`;
    }
  } else {
    resultHtml = `<div style="color:#e05555;">大比失利。声望 -10。</div>`;
    if (summary.poached && summary.poached.length) {
      resultHtml += `<div style="color:#e05555;font-size:12px;margin-top:4px;">
        💔 被挖走的弟子：${summary.poached.join('、')}
      </div>`;
    } else {
      resultHtml += `<div style="color:#d4a843;font-size:12px;margin-top:4px;">所幸无人叛离。</div>`;
    }
  }

  const logRows = t.battleLog.map(r => `
    <div class="duel-row">
      <div class="duel-side ${r.winner === 'me' ? 'duel-winner' : 'duel-loser'}">
        ${r.me}（${r.mePower} → 掷点 ${r.meRoll}）
        ${r.meCrit ? '<span class="duel-tag">暴击</span>' : ''}${r.meDodge ? '<span class="duel-tag dodge">闪避</span>' : ''}
      </div>
      <div class="duel-vs">VS</div>
      <div class="duel-side ${r.winner === 'en' ? 'duel-winner' : 'duel-loser'}" style="text-align:right;">
        ${r.en}（${r.enPower} → 掷点 ${r.enRoll}）
        ${r.enCrit ? '<span class="duel-tag">暴击</span>' : ''}${r.enDodge ? '<span class="duel-tag dodge">闪避</span>' : ''}
      </div>
    </div>
  `).join('');

  box.innerHTML = `
    <div class="tournament-box">
      <div class="tournament-title">⚔ 宗门大比 · 战果</div>
      <div class="tournament-desc">
        比分：我方 <b style="color:#5fb85f;">${myWins}</b> : <b style="color:#e05555;">${enWins}</b> 对手
      </div>
      <div class="battle-log">${logRows || '<div>无对战记录。</div>'}</div>
      ${resultHtml}
      <div class="event-options" style="margin-top:10px;">
        <button class="btn-gold" onclick="closeTournament()">结束</button>
      </div>
    </div>
  `;
}

function renderTournamentPreview() {
  const box = el('tournament-preview');
  if (!box) return;

  /* 大比进行中时，预告条让位给正式面板 */
  if (S.tournament) {
    box.className = 'hidden';
    box.innerHTML = '';
    return;
  }

  /* 大比在 S.month % 3 === 0 时触发。
     余数为 1 → 还有 2 个月；余数为 2 → 还有 1 个月；余数为 0 → 还有 3 个月（本月的已打完） */
  const r = S.month % 3;
  const monthsUntil = r === 0 ? 3 : 3 - r;

  box.className = monthsUntil <= 1 ? 'soon' : '';
  box.innerHTML = `
    <span class="ico">⚔</span>
    距下次宗门大比还有 <b>${monthsUntil}</b> 个月
  `;
}

export { renderTournament, renderTournamentPreview };
