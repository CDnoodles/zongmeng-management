/* ==========================================================================
 * dungeons.js — 
 * 由 xiuxiantest.html 拆分而来（原「」段）
 * ========================================================================== */
import { DUNGEONS, RARITY_COLORS, RARITY_REALM_LIMIT, MAX_DUNGEON_RUNS, MAX_DUNGEON_CLEARS, REALMS } from '../core/constants.js';
import { S, selected } from '../core/state.js';
import { powerOf, basePowerOf } from '../core/power.js';
import { clamp, dungeonRates } from '../core/utils.js';
import { el } from './dom.js';

function renderDungeons() {
  const box = el('dungeons');
  const sel = [...selected].map(id => S.disciples.find(d => d.id === id)).filter(Boolean);
  const teamPower = sel.reduce((s, d) => s + powerOf(d), 0);
  const baseTeamPower = sel.reduce((s, d) => s + basePowerOf(d), 0);

  /* 可打秘境数挂在 Tab 按钮上（未选人时不显示分子，避免与「已选」误导） */
  const tabBtn = document.querySelector('.sub-tab[data-tab="dungeons"]');
  if (tabBtn) {
    const available = DUNGEONS.filter(dg => {
      if ((S.dungeonRuns[dg.id] || 0) >= MAX_DUNGEON_CLEARS) return false;   // 本月已探尽
      return !sel.length || teamPower / dg.difficulty >= 0.6;
    }).length;
    tabBtn.textContent = `秘 境 派 遣 ${sel.length ? available + '/' + DUNGEONS.length : ''}`.trim();
  }

  let html = '';
  if (sel.length) {
    /* 队伍里有人本月次数已用完 —— 提前告知，避免点了派遣才发现 */
    const exhausted = sel.filter(d => (d.dungeonRuns || 0) >= MAX_DUNGEON_RUNS);
    if (exhausted.length) {
      html += `<div class="team-info" style="color:#e05555;">⚠ ${exhausted.map(d => d.name).join('、')} 本月派遣次数已用完。</div>`;
    }
    const diff = baseTeamPower - teamPower;
    const totalLuck = sel.reduce((s, d) => s + d.luck, 0);
    html += `<div class="team-info">已选：${sel.map(d => d.name).join('、')} · 总战力 <b>${teamPower}</b>${diff > 0 ? ` <span style="color:#e05555;">(基础 ${baseTeamPower}，忠诚修正 -${diff})</span>` : ''} · 团队幸运 <b style="color:#8fd45f;">${totalLuck}</b></div>`;
    const barPct = clamp(teamPower / 400 * 100, 2, 100);
    const barColor = teamPower >= 600 ? '#d4a843' : teamPower >= 200 ? '#5a9fe0' : '#6fbf9a';
    html += `<div class="team-bar-track"><div class="team-bar-fill" style="width:${barPct}%;background:linear-gradient(90deg,${barColor}88,${barColor})"></div></div>`;
  } else {
    html += `<div class="team-info dim">点击上方弟子选择出战人员（最多 3 人）</div>`;
  }

  const sortedDungeons = [...DUNGEONS].sort((a, b) => a.difficulty - b.difficulty);

  html += sortedDungeons.map(dg => {
    const ratio = sel.length ? teamPower / dg.difficulty : 0;
    const unwinnable = sel.length > 0 && ratio < 0.6;
    const used = S.dungeonRuns[dg.id] || 0;
    const remaining = Math.max(0, MAX_DUNGEON_CLEARS - used);
    const cleared = remaining <= 0;                 // 本月已探尽
    let hint = '', color = '#5a5a70', oddsPct = 0;
    if (sel.length) {
      if (ratio >= 1.5) { hint = '大胜有望'; color = '#5fb85f'; }
      else if (ratio >= 1.0) { hint = '胜算较大'; color = '#8fd45f'; }
      else if (ratio >= 0.6) { hint = '胜负难料'; color = '#d4a843'; }
      else { hint = '凶多吉少'; color = '#e05555'; }
      oddsPct = clamp(ratio / 1.5 * 100, 3, 100);
    }
    const rates = dungeonRates(dg);
    /* 每个品级 chip 直接标明「该品级的装备需要什么境界才能用」，
       玩家一眼看出这个秘境掉的东西自己弟子现在能不能穿上。 */
    const rateHtml = `
      <div class="loot-rates">
        <span class="rate-label">稀有度爆率：</span>
        ${rates.map(r => {
          const need = RARITY_REALM_LIMIT[r.rarity] || 0;
          const needTxt = need > 0 ? `，需${REALMS[need]}` : '，无境界要求';
          return `
          <span class="rate-chip" style="color:${RARITY_COLORS[r.rarity] || '#8a8aa0'}"
                title="${r.rarity} ${r.pct.toFixed(1)}%${needTxt}">
            ${r.rarity.slice(0, 1)}<span class="rate-pct">${r.pct.toFixed(0)}%</span>
          </span>`;
        }).join('')}
      </div>
    `;
    return `
      <div class="dungeon ${unwinnable ? 'unwinnable' : ''} ${cleared ? 'cleared' : ''}">
        <div class="dungeon-row">
          <div class="dungeon-main">
            <div class="dungeon-head">
              <span class="dungeon-name">${dg.name}</span>
              <span class="dungeon-diff">难度 ${dg.difficulty}</span>
              ${typeof dg.realmTarget === 'number'
                ? `<span class="dungeon-diff" style="color:#5a9fe0;" title="该秘境面向的弟子境界">面向 ${REALMS[dg.realmTarget]}弟子</span>`
                : ''}
              <span class="dungeon-runs" style="color:${cleared ? '#e05555' : '#8a8aa0'};"
                    title="本月该秘境已探索 ${used} / ${MAX_DUNGEON_CLEARS} 次">
                本月 ${used}/${MAX_DUNGEON_CLEARS}
              </span>
              ${sel.length ? `<span style="font-size:11px;color:${teamPower >= dg.difficulty ? '#5fb85f' : '#e05555'};">
                队伍 ${teamPower}
              </span>` : ''}
            </div>
            <div class="dungeon-desc">${dg.desc}</div>
            ${sel.length ? `
              <div class="dungeon-odds">
                <div class="odds-track"><div class="odds-fill" style="width:${oddsPct}%;background:${color}"></div></div>
                <span class="odds-text" style="color:${color}">${hint}</span>
              </div>` : ''}
          </div>
          <button class="btn-gold" onclick="dispatch('${dg.id}')"
            ${sel.length && !S.tournament && !cleared ? '' : 'disabled'}>${cleared ? '已探尽' : '派遣'}</button>
        </div>
        ${rateHtml}
      </div>
    `;
  }).join('');
  box.innerHTML = html;
}

export { renderDungeons };
