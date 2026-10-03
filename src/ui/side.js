/* ==========================================================================
 * side.js — 
 * 由 xiuxiantest.html 拆分而来（原「」段）
 * ========================================================================== */
import { REALMS, REALM_COLORS, REALM_POWER, ROOT_TIER_COLORS } from '../core/constants.js';
import { S } from '../core/state.js';
import { rootTypeName, rootTier, rootPurity } from '../core/spirit-root.js';
import { cultivationMul } from '../core/mods.js';
import { traitChipsHtml } from './traits.js';
import { el } from './dom.js';

function renderRecruits() {
  const box = el('recruits');
  if (!S.recruits.length) {
    box.innerHTML = '<p class="empty">本月暂无合适人选。</p>';
    return;
  }
  box.innerHTML = S.recruits.map(d => {
    const p = REALM_POWER[d.realm] + d.cultivation;
    const afford = S.stones >= d.cost;
    const rc = REALM_COLORS[d.realm] || '#8a8aa0';
    const rtc = ROOT_TIER_COLORS[rootTier(d)] || '#8a8aa0';
    const mul = cultivationMul(d);
    const purity = (rootPurity(d) * 100).toFixed(0);
    const chips = traitChipsHtml(d, 3);
    return `
      <div class="recruit-item" style="border-left-color:${rc}">
        <div class="recruit-info">
          <b>${d.name}</b>
          <span class="realm-badge" style="color:${rc}">${REALMS[d.realm]}</span>
          <span class="realm-badge" style="color:${rtc}"
                title="纯度 ${purity}%，纯度越高修炼越快">${rootTypeName(d)}</span><br>
          <span class="sub">战力 ${p} · <span style="color:#8fd45f;">幸运 ${d.luck}</span> · 悟性 ${d.aptitude} · 修炼 ×${mul.toFixed(2)}</span>
          ${chips ? `<div class="trait-row">${chips}</div>` : ''}
          <span style="color:${afford ? '#d4a843' : '#e05555'};">${d.cost} 灵石</span>
        </div>
        <button class="${afford ? 'btn-gold' : ''}" onclick="recruit('${d.id}')" ${afford ? '' : 'disabled'}>招募</button>
      </div>
    `;
  }).join('');
}
function renderMissing() {
  const box = el('missing');
  const count = el('missing-count');
  if (!box) return;
  count.textContent = S.missing.length ? `${S.missing.length} 人` : '';
  if (!S.missing.length) {
    box.innerHTML = '<p class="empty">无失踪弟子。</p>';
    return;
  }
  box.innerHTML = S.missing.map(d => {
    const rc = REALM_COLORS[d.realm] || '#8a8aa0';
    return `
      <div class="disciple missing-card" style="border-left-color:${rc}">
        <div class="d-head">
          <span class="d-name">${d.name}</span>
          <span class="realm-badge" style="color:${rc}">${REALMS[d.realm]}</span>
          <span class="tag-miss">失踪</span>
        </div>
        <div class="d-meta">
          <span>失踪于第 ${d.missingStart || '?'} 月</span>
        </div>
      </div>
    `;
  }).join('');
}
function renderLog() {
  el('log').innerHTML = S.log.map(l =>
    `<div class="log-line ${l.type}"><span class="log-month">${l.month}月</span>${l.msg}</div>`
  ).join('');
}

export { renderRecruits, renderMissing, renderLog };
