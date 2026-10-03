/* ==========================================================================
 * disciples.js — 弟子列表
 * ========================================================================== */
import { REALMS, REALM_COLORS, MAX_DUNGEON_RUNS, ROOT_TIER_COLORS, DISCIPLE_BREAKTHROUGH_MATERIALS } from '../core/constants.js';
import { S, selected, tournamentSelected, maxDisciples, directDisciples, elderMembersOf, elderList } from '../core/state.js';
import { powerOf, basePowerOf, discipleRealmCap } from '../core/power.js';
import { displayLoyalty } from '../core/loyalty.js';
import { rootTypeName, rootTier, rootPurity } from '../core/spirit-root.js';
import { materialsMissing } from '../core/items.js';
import { traitChipsHtml } from './traits.js';
import { clamp, cultInfo } from '../core/utils.js';
import { isDiscipleExpanded, discipleDetailHtml } from './discipleDetail.js';
import { canAppointElder } from '../systems/elder.js';
import { el } from './dom.js';

/*
 * 弟子卡上的长老入口。
 *
 * 这里刻意把"能不能册封"直接摆在按钮上：
 *   可册封   → 金色「册封长老」按钮
 *   已是长老 → 「长老」标签
 *   名额已满 → 置灰的「名额已满」，悬浮 title 给出完整理由
 * 完整规则说明在「长老」Tab 顶部（ui/elders.js），这里只做就近提示。
 */
function elderTagHtml(d) {
  if (d.elder) {
    return '<span class="tag-sel" title="长老：仍留在本栏，但会在月末替你代管门下弟子">长老</span>';
  }
  const chk = canAppointElder(d.id);
  return `<button class="bag-btn" style="font-size:10px;"
            onclick="event.stopPropagation();appointElder('${d.id}')"
            ${chk.ok ? '' : 'disabled'}
            title="${chk.ok ? '册封为长老' : chk.reason}">
            ${chk.ok ? '👑 册封长老' : chk.reason}
          </button>`;
}

function renderDisciples() {
  const box = el('disciples');
  if (!box) return;

  /*
   * 只渲染"玩家直接操心"的弟子（pool = 'direct'）：
   *   长老本人 → 在（elder = true 但 pool 仍是 'direct'）
   *   长老代管的弟子 → 不在，去「长老」Tab 里按长老归组看
   * 人数仍按 S.disciples 总数报，避免玩家以为弟子被机制吃掉了。
   */
  const roster = directDisciples();
  const managed = S.disciples.length - roster.length;

  const tabBtn = document.querySelector('.sub-tab[data-tab="disciples"]');
  if (tabBtn) {
    tabBtn.textContent = `宗 门 弟 子 ${roster.length}/${maxDisciples()}`
      + (managed > 0 ? `（${managed} 人代管）` : '');
  }

  if (!roster.length) {
    box.innerHTML = '<p class="empty">宗门内空无一人……去招募弟子吧。</p>';
    return;
  }

  const inTSelection = S.tournament && S.tournament.phase === 'select';

  /* ---------- 1. 先渲染弟子卡片列表 ---------- */
  box.innerHTML = roster.map(d => {
    const p = powerOf(d);
    const bp = basePowerOf(d);
    const rc = REALM_COLORS[d.realm] || '#8a8aa0';
    /* 忠诚一律走 displayLoyalty —— 伪装天赋（影后/绿茶）会在这里说谎。
       注意：战力仍按真实忠诚结算，所以显示值与实际战力会有细微出入，这正是"破绽"。 */
    const shownLoyalty = displayLoyalty(d);
    const lc = shownLoyalty >= 60 ? '#5fb85f' : shownLoyalty >= 30 ? '#d4a843' : '#e05555';
    const ci = cultInfo(d, discipleRealmCap());
    const loyaltyPct = Math.round((0.6 + clamp(shownLoyalty, 0, 100) / 100 * 0.4) * 100);
    const isSel = inTSelection ? tournamentSelected.has(d.id) : selected.has(d.id);

    const cls = ['disciple'];
    if (isSel) cls.push('selected');
    if (d.status === 'injured') cls.push('injured');

    const cultText = ci.maxed
      ? '圆满'
      : ci.ready
        ? '已至上境'
        : `${d.cultivation}/${ci.need}`;
    const cultStyle = ci.blocked ? ' style="color:#8a8aa0;" title="受宗主境界所限，无法突破"' : '';

    /* 修为已满、又没被宗主上限卡住，却迟迟不升 —— 只可能是材料不够 */
    const missingMats = (!ci.maxed && !ci.blocked && d.cultivation >= ci.need)
      ? materialsMissing(d, DISCIPLE_BREAKTHROUGH_MATERIALS[d.realm] || [])
      : [];
    const matTag = missingMats.length
      ? `<span class="tag-mat" title="突破材料不足：${
          missingMats.map(m => `${m.rarity} ${m.have}/${m.need}`).join('，')
        }">缺 ${
          missingMats.map(m => `${m.rarity}×${m.need - m.have}`).join(' ')
        }</span>`
      : '';

    return `
      <div class="${cls.join(' ')}" style="border-left-color:${rc}" onclick="toggleSelect('${d.id}')">
        <div class="d-head">
          <span class="d-name">${d.name}</span>
          <span class="realm-badge" style="color:${rc}">${REALMS[d.realm]}</span>
          ${d.status === 'injured' ? '<span class="tag-red">受伤</span>' : ''}
          ${isSel ? `<span class="tag-sel">${inTSelection ? '报名' : '出战'}</span>` : ''}
          <span class="d-power">战力 <b style="color:#d4a843">${p}</b> <span style="color:#5a5a70;">/ ${bp}</span></span>
        </div>
        <div class="prog">
          <span class="prog-label">修为</span>
          <div class="prog-track">
            <div class="prog-fill" style="width:${ci.pct}%;background:linear-gradient(90deg,${rc}77,${rc})"></div>
          </div>
          <span class="prog-val"${cultStyle}>${cultText}</span>
        </div>
        <div class="prog">
          <span class="prog-label">忠诚</span>
          <div class="prog-track">
            <div class="prog-fill" style="width:${clamp(shownLoyalty, 0, 100)}%;background:${lc}"></div>
          </div>
          <span class="prog-val" style="color:${lc}">${shownLoyalty} · ${loyaltyPct}%</span>
        </div>
        <div class="d-meta">
          <span style="color:#8fd45f;">🍀 幸运 ${d.luck}</span>
          <span>悟性 ${d.aptitude}</span>
          ${matTag}
          <span style="color:${ROOT_TIER_COLORS[rootTier(d)] || '#8a8aa0'};"
                title="灵根纯度 ${(rootPurity(d) * 100).toFixed(0)}%">${rootTypeName(d)}</span>
          ${traitChipsHtml(d, 2)}
          <span style="color:${(d.dungeonRuns || 0) >= MAX_DUNGEON_RUNS ? '#e05555' : '#8a8aa0'};">
            派遣 ${MAX_DUNGEON_RUNS - (d.dungeonRuns || 0)}/${MAX_DUNGEON_RUNS}
          </span>
          ${(d.equipment?.weapon) ? `<span class="equip">⚔${d.equipment.weapon.name}+${d.equipment.weapon.bonus}</span>` : ''}
          ${(d.equipment?.artifact) ? `<span class="equip">🔮${d.equipment.artifact.name}+${d.equipment.artifact.bonus}</span>` : ''}
          ${(d.techniques?.length) ? `<span class="equip">📖功法×${d.techniques.length}</span>` : ''}
          <button class="bag-btn" onclick="event.stopPropagation();toggleDiscipleDetail('${d.id}')">🎒 背包 ${(d.backpack || []).length}</button>
          ${elderTagHtml(d)}
        </div>
      </div>
      ${isDiscipleExpanded(d.id) ? discipleDetailHtml(d) : ''}
    `;
  }).join('');

  /* ---------- 2. 再追加"选择秘境"提示条（不能写进 map 里） ---------- */
  if (!inTSelection && selected.size > 0) {
    /* 只看还在「宗门弟子」栏里的人：被划到长老门下后就不该再出现在派遣队列里 */
    const selDisciples = roster.filter(d => selected.has(d.id));
    const available = selDisciples.filter(d =>
      d.status !== 'injured' && (d.dungeonRuns || 0) < MAX_DUNGEON_RUNS
    ).length;

    const hint = document.createElement('div');
    hint.className = 'dispatch-hint';
    hint.innerHTML = `
      <span class="dispatch-hint-text">
        已选 <b>${selDisciples.length}</b> 人${
          available < selDisciples.length ? `（${selDisciples.length - available} 人无法出战）` : ''
        }
      </span>
      <button class="btn-gold" onclick="switchTab('dungeons')" ${available ? '' : 'disabled'}>
        选择秘境 →
      </button>
    `;
    box.appendChild(hint);
  }
}

export { renderDisciples };