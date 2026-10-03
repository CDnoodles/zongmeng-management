/* ==========================================================================
 * elders.js (ui) — 「长老」Tab
 *
 * 这个页面同时回答玩家的两个问题：
 *   1) 现在谁能当长老？    → 顶部写明册封条件 + 名额 x/y
 *   2) 为什么这个人不能册封？ → 候选人列表里直接把 canAppointElder().reason 显示出来
 *
 * 长老本人仍是弟子（elder = true 且 pool = 'direct'），所以他同时出现在
 * 「宗门弟子」栏与本页 —— 这是有意的，见《长老机制_实施方案.md》3.1。
 * ========================================================================== */
import { REALMS, REALM_COLORS, ROOT_TIER_COLORS } from '../core/constants.js';
import { ELDER_LIMIT, ELDER_MAX_MEMBERS, SCAVENGE_STRATEGIES, CRUISE_STRATEGIES } from '../core/constants.js';
import { S, poolOf, elderList, elderMembersOf, directDisciples } from '../core/state.js';
import { powerOf } from '../core/power.js';
import { cultInfo } from '../core/utils.js';
import { discipleRealmCap } from '../core/power.js';
import { displayLoyalty } from '../core/loyalty.js';
import { canAppointElder, canAssignDisciple, elderSharePercent, latestElderReport } from '../systems/elder.js';
import { el } from './dom.js';

/*
 * 上月月报（文档第 6 步的"月报分层"）：
 *   汇总层 —— 进本次数 / 等级、搜刮件数、上缴、自留
 *   警告层 —— 受伤跳过、没本可派、忠诚过低跳过、弟子陨落
 *   详情层 —— 折叠的进本明细
 * 数据来自结构化的 S.elderReports，不再从 S.log 里翻（日志上限 80 条会被冲掉）。
 */
function reportHtml(r) {
  if (!r) return '<div class="elder-report dim">尚无月报（长老会在下个月末开始上缴）。</div>';
  const drops = r.cruises.reduce((s, c) => s + c.drops, 0);
  const levels = r.cruises.map(c => c.level).join('/');
  const warnHtml = (r.warnings || []).length
    ? `<div class="elder-warn">${r.warnings.map(w => `⚠ ${w}`).join('<br>')}</div>`
    : '';
  const detailHtml = r.cruises.length
    ? `<div class="elder-detail">${r.cruises.map(c =>
        `· 【${c.dungeon}】难度 ${c.difficulty} → ${c.level}（${c.team.join('、')}）`
        + ` 掉落 ${c.drops} 件 · 灵石 ${c.stones}`
        + (c.dead || c.injured || c.missing || c.deserted
          ? ` · 陨落 ${c.dead} 受伤 ${c.injured} 失踪 ${c.missing} 叛逃 ${c.deserted}` : '')
      ).join('<br>')}</div>`
    : '';
  return `
    <div class="elder-report">
      <div class="elder-report-head">
        <span>第 ${r.month} 月月报</span>
        <span class="sub">进本 ${r.cruises.length} 次${levels ? `（${levels}）` : ''} · 带回 ${drops} 件</span>
      </div>
      <div class="elder-report-body">
        <span>搜刮 <b>${r.scavenged}</b> 件（${r.touched} 人）</span>
        <span>上缴 <b style="color:#5fb85f">${r.tribute}</b> 件</span>
        <span>自留 <b style="color:#d4a843">${r.selfKept}</b> 件（${Math.round((r.share || 0) * 100)}%）</span>
        ${r.gifted ? `<span>送礼安抚 <b style="color:#b06fe0">${r.gifted}</b> 件</span>` : ''}
        <span class="sub">忠诚合计 -${r.loyaltyCost}</span>
      </div>
      ${r.gifted ? `<div class="elder-gift">🎁 安抚了 ${r.appeased.join('、')}</div>` : ''}
      ${warnHtml}
      ${detailHtml}
    </div>`;
}

/* 策略下拉：用原生 <select>，变更即写回（走 globals 暴露的 setter） */
function strategySelect(d, kind, table, setterName) {
  return `<select onchange="${setterName}('${d.id}', this.value)" `
    + `style="font-size:11px;background:#22222e;color:#c8c8d4;border:1px solid #2e2e3e;border-radius:3px;padding:1px 4px;">`
    + Object.keys(table).map(k =>
        `<option value="${k}"${d[kind] === k ? ' selected' : ''}>${table[k].label}</option>`).join('')
    + `</select>`;
}

/* 名下弟子一行 */
function memberRow(d) {
  const rc = REALM_COLORS[d.realm] || '#8a8aa0';
  const shown = displayLoyalty(d);
  const lc = shown >= 60 ? '#5fb85f' : shown >= 30 ? '#d4a843' : '#e05555';
  const ci = cultInfo(d, discipleRealmCap());
  const cultText = ci.maxed ? '圆满' : `${d.cultivation}/${ci.need}`;
  const runs = d.dungeonRuns || 0;
  return `
    <div class="elder-member" style="border-left-color:${rc}">
      <span class="d-name">${d.name}</span>
      <span class="realm-badge" style="color:${rc}">${REALMS[d.realm]}</span>
      ${d.status === 'injured' ? '<span class="tag-red">受伤</span>' : ''}
      <span class="sub">战力 ${powerOf(d)} · 修为 ${cultText} · 忠诚 <b style="color:${lc}">${shown}</b> · 派遣 ${runs}/2</span>
      <button style="margin-left:auto;font-size:11px;padding:1px 8px;"
              onclick="unassignDisciple('${d.id}')">解除代管</button>
    </div>`;
}

function renderElders() {
  const box = el('elders');
  if (!box) return;

  const elders = elderList();
  const used = elders.length;
  const full = used >= ELDER_LIMIT;

  /* 人数挂到 Tab 按钮上 */
  const tabBtn = document.querySelector('.sub-tab[data-tab="elders"]');
  if (tabBtn) tabBtn.textContent = `长 老 ${used}/${ELDER_LIMIT}`;

  /* ---------- 顶部：册封条件说清楚 ---------- */
  const head = `
    <div class="elder-help">
      <div class="elder-help-title">册封条件</div>
      <div>① 该弟子<b>还不是长老</b>　② 长老名额<b>未满</b>（${used}/${ELDER_LIMIT}）</div>
      <div class="sub">长老名额上限由常量 <b>ELDER_LIMIT</b> 决定；每位长老最多代管 ${ELDER_MAX_MEMBERS} 人。</div>
      <div class="sub">长老本人仍是弟子：留在「宗门弟子」栏，可以被派遣、被搜刮、被罢免。</div>
      ${full ? `<div style="color:#e05555;margin-top:4px;">⚠ 长老名额已满，先罢免一位才能册封新的。</div>` : ''}
    </div>`;

  /* ---------- 长老卡片 ---------- */
  let eldersHtml = '';
  if (!elders.length) {
    eldersHtml = '<p class="empty">还没有长老。在下方「可册封」里挑一名弟子册封。</p>';
  } else {
    eldersHtml = elders.map(e => {
      const rc = REALM_COLORS[e.realm] || '#8a8aa0';
      const members = elderMembersOf(e.id);
      const share = elderSharePercent(e);
      const rtc = ROOT_TIER_COLORS[e.rootTier] || '#8a8aa0';
      return `
      <div class="elder-card" style="border-left-color:${rc}">
        <div class="d-head">
          <span class="d-name">${e.name}</span>
          <span class="realm-badge" style="color:${rc}">${REALMS[e.realm]}</span>
          <span class="tag-sel">长老</span>
          <span class="d-power">战力 <b style="color:#d4a843">${powerOf(e)}</b></span>
          <button class="btn-red" style="margin-left:auto;font-size:11px;padding:2px 10px;"
                  onclick="dismissElder('${e.id}')">罢免</button>
        </div>
        <div class="d-meta">
          <span style="color:${rtc};">自留 <b>${share}%</b></span>
          <span style="color:${share >= 50 ? '#e05555' : share <= 10 ? '#5fb85f' : '#8a8aa0'};"
                title="由天赋决定（财迷 50% / 忠犬 20% / 佛系 10%），没有相关天赋时默认 30%">
            上缴 ${100 - share}%
          </span>
          <span>门下 ${members.length}/${ELDER_MAX_MEMBERS}</span>
          <span>搜刮 ${strategySelect(e, 'scavenge', SCAVENGE_STRATEGIES, 'setScavengeStrategy')}</span>
          <span>进本 ${strategySelect(e, 'cruise', CRUISE_STRATEGIES, 'setCruiseStrategy')}</span>
        </div>
        <div class="elder-members">
          ${members.length ? members.map(memberRow).join('') : '<p class="empty">名下暂无弟子。</p>'}
        </div>
        ${reportHtml(latestElderReport(e.id))}
      </div>`;
    }).join('');
  }

  /* ---------- 可册封候选人 ---------- */
  const candidates = directDisciples().filter(d => !d.elder);
  const candHtml = candidates.length
    ? candidates.map(d => {
        const chk = canAppointElder(d.id);
        const rc = REALM_COLORS[d.realm] || '#8a8aa0';
        return `
        <div class="elder-member" style="border-left-color:${rc}">
          <span class="d-name">${d.name}</span>
          <span class="realm-badge" style="color:${rc}">${REALMS[d.realm]}</span>
          <span class="sub">战力 ${powerOf(d)} · 忠诚 ${displayLoyalty(d)}</span>
          <button class="${chk.ok ? 'btn-gold' : ''}" style="margin-left:auto;font-size:11px;padding:2px 10px;"
                  onclick="appointElder('${d.id}')" ${chk.ok ? '' : 'disabled'}
                  title="${chk.ok ? '册封为长老' : chk.reason}">
            ${chk.ok ? '册封长老' : chk.reason}
          </button>
        </div>`;
      }).join('')
    : '<p class="empty">没有可册封的弟子（不在场 / 已全部是长老或被代管）。</p>';

  /* ---------- 指派：把某个未代管的弟子划到某位长老名下 ---------- */
  let assignHtml = '';
  if (elders.length && candidates.length) {
    assignHtml = `
      <div class="elder-help" style="margin-top:10px;">
        <div class="elder-help-title">指派门下</div>
        <div class="sub">先选弟子、再点长老即可划入门下；长老本人不能被代管，长老人数也不会互相代管。</div>
        <div class="assign-grid">
          ${elders.map(e => `
            <div class="assign-col">
              <div class="assign-title">${e.name}<span class="sub">（${elderMembersOf(e.id).length}/${ELDER_MAX_MEMBERS}）</span></div>
              ${candidates.map(d => {
                const chk = canAssignDisciple(e.id, d.id);
                return `<button style="font-size:11px;display:block;width:100%;text-align:left;margin-bottom:2px;"
                          onclick="assignDisciple('${e.id}','${d.id}')" ${chk.ok ? '' : 'disabled'}
                          title="${chk.ok ? `把 ${d.name} 划入 ${e.name} 门下` : chk.reason}">
                  ${d.name}${chk.ok ? '' : ` · ${chk.reason}`}
                </button>`;
              }).join('')}
            </div>`).join('')}
        </div>
      </div>`;
  }

  box.innerHTML = head
    + `<div class="elder-section-title">现任长老 ${used}/${ELDER_LIMIT}</div>` + eldersHtml
    + `<div class="elder-section-title">可册封（${candidates.length} 人）</div>` + candHtml
    + assignHtml;
}

export { renderElders };
