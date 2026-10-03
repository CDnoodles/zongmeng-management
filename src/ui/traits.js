/* ==========================================================================
 * traits.js — 天赋的 UI 渲染（芯片 + 详情条目）
 *
 * UI 约定：
 *   招募候选 / 弟子卡 —— 只列「已可见」的天赋，最多 N 枚，超出折叠成 …+N；
 *                        未解锁的隐藏天赋统一显示为 〔？？？〕
 *   弟子详情   —— 列出全部天赋：可见的展开效果文本，未解锁的仍是 〔？？？〕
 *   芯片悬浮   —— title 里给出 名称（稀有度·池）效果
 *
 * 伪装（disguised）三态：
 *   未看穿 → 芯片带 `?`、效果文本用 surfaceDesc（谎话）
 *   已看穿 → 标记变「真相」、效果文本用真实 desc
 * ========================================================================== */
import { TALENTS, TALENT_RARITY_COLORS, traitVisible, traitExposed, traitDesc } from '../core/talents.js';

function chipTitle(d, t, id) {
  return `${t.name}（${t.rarity}·${t.pool}）${traitDesc(d, id)}`;
}

/* 单枚可见天赋芯片 */
function traitChip(id, d) {
  const t = TALENTS[id];
  if (!t) return '';
  const c = TALENT_RARITY_COLORS[t.rarity] || '#8a8aa0';
  /* disguised 且未看穿：加个小标记提示"这人可能有问题" */
  const mark = (t.visibility === 'disguised' && !traitExposed(d, id)) ? '?' : '';
  return `<span class="trait-chip" style="color:${c}" title="${chipTitle(d, t, id)}">〔${t.name}${mark}〕</span>`;
}

/* 未解锁的隐藏天赋占位 */
function hiddenTraitChip() {
  return '<span class="trait-chip is-hidden" title="隐藏天赋，需要解锁后才能查看">〔？？？〕</span>';
}

/*
 * 紧凑列表（招募卡 / 弟子卡）
 *   max 省略时全部显示
 */
function traitChipsHtml(d, max) {
  const list = (d && d.traits) || [];
  if (!list.length) return '';
  const shown = list.filter(id => traitVisible(d, id));
  const hiddenCount = list.length - shown.length;
  const cap = max === undefined ? shown.length : Math.max(0, max);
  let html = shown.slice(0, cap).map(id => traitChip(id, d)).join('');
  if (shown.length > cap) {
    html += `<span class="trait-chip is-more" title="还有 ${shown.length - cap} 个可见天赋">…+${shown.length - cap}</span>`;
  }
  if (hiddenCount > 0) html += hiddenTraitChip();
  return html;
}

/* 详情列表：名称 + 效果文本（伪装未看穿时给的是表面描述） */
function traitDetailHtml(d) {
  const list = (d && d.traits) || [];
  if (!list.length) return '<span class="slot-empty">— 无 —</span>';
  return list.map(id => {
    const t = TALENTS[id];
    if (!t) return '';
    if (!traitVisible(d, id)) return hiddenTraitChip();
    const c = TALENT_RARITY_COLORS[t.rarity] || '#8a8aa0';
    let mark = '';
    if (t.visibility === 'disguised') mark = traitExposed(d, id) ? '（真相）' : '（表面）';
    return `<span class="trait-detail-item">
      <span class="trait-chip" style="color:${c}">〔${t.name}${mark}〕</span>
      <span class="trait-detail-desc">${traitDesc(d, id)}</span>
    </span>`;
  }).join('');
}

export { traitChip, hiddenTraitChip, traitChipsHtml, traitDetailHtml };
