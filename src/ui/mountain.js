/* ==========================================================================
 * mountain.js (ui) — 「山头仓库」Tab
 *
 * 长老月末搜刮上缴的东西都堆在这里。与「宗门仓库」的关键差别只有一条：
 * **从这里取用不掉任何弟子的好感** —— 这是长老机制的核心红利，页面上写明。
 *
 * 渲染上限：共用秘境额度下每月可能进几十件，全量渲染会让长列表拖慢
 * 每次 render()（render() 每月被调用多次）。所以默认只画前 RENDER_LIMIT 件，
 * 其余折叠成一个提示 + 「全部取出 / 全部炼化」两个批量按钮兜底。
 * ========================================================================== */
import { REALMS, RARITIES, RARITY_COLORS, TYPE_COLORS } from '../core/constants.js';
import { realmLimitOf } from '../core/items.js';
import { S } from '../core/state.js';
import { el } from './dom.js';

const RENDER_LIMIT = 60;

function renderMountain() {
  const box = el('mountain');
  if (!box) return;

  const items = Array.isArray(S.mountainStorage) ? S.mountainStorage : [];

  const tabBtn = document.querySelector('.sub-tab[data-tab="mountain"]');
  if (tabBtn) tabBtn.textContent = `山 头 仓 库 ${items.length || ''}`.trim();

  /* 顶部提示：这里是全游戏唯一"取用不掉好感"的资源入口 */
  const help = `
    <div class="elder-help">
      <div class="elder-help-title">山头仓库 · 取用不掉任何好感</div>
      <div class="sub">长老每月搜刮门下的所得，扣除自留后都上缴到这里。
        从这里<b>取出</b>或<b>炼化</b>不会影响任何弟子的忠诚 —— 代价已经由长老在搜刮时代付过了。</div>
      <div class="sub">想要最好的东西，仍要亲自去搜刮亲传弟子（掉好感）；图省心就来这里拿。</div>
    </div>`;

  if (!items.length) {
    box.innerHTML = help + '<p class="empty">山头仓库空空如也。册封长老并派他代管弟子后，月末就会有东西上缴。</p>';
    return;
  }

  /* 稀有度汇总条（与宗门仓库同一样式） */
  const rarityStats = {};
  for (const it of items) {
    const r = it.rarity || '凡品';
    rarityStats[r] = (rarityStats[r] || 0) + 1;
  }
  const statsHtml = `
    <div class="loot-rates" style="margin:8px 0;padding:6px 0;">
      <span class="rate-label">库存：</span>
      ${[...RARITIES].reverse().filter(r => rarityStats[r]).map(r => `
        <span class="rate-chip" style="color:${RARITY_COLORS[r] || '#8a8aa0'}">
          ${r}<span class="rate-pct">${rarityStats[r]}</span>
        </span>`).join('')}
    </div>`;

  /* 批量按钮：件数多的时候比逐件点省事 */
  const bulk = `
    <div class="dbg-row">
      <span class="dbg-label">批量</span>
      <button onclick="takeAllFromMountain()">全部转入宗门仓库</button>
      <button class="btn-gold" onclick="refineAllFromMountain()">全部炼化</button>
      <span class="sub">当前 ${items.length} 件，全部炼化可得
        ${items.reduce((s, it) => s + (it.refine || 0), 0)} 灵石</span>
    </div>`;

  /* 展示顺序与宗门仓库一致：稀有度降序 → 同稀有度按 refine 降序。
     按钮回调带原始下标 i，否则会打到错的物品。 */
  const rarityOrder = {};
  RARITIES.forEach((r, idx) => { rarityOrder[r] = RARITIES.length - 1 - idx; });
  const indexed = items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ra = rarityOrder[a.it.rarity] ?? -1;
      const rb = rarityOrder[b.it.rarity] ?? -1;
      if (ra !== rb) return rb - ra;
      return (b.it.refine || 0) - (a.it.refine || 0);
    });

  const shown = indexed.slice(0, RENDER_LIMIT);
  const restCount = indexed.length - shown.length;

  const listHtml = shown.map(({ it, i }) => {
    const tc = TYPE_COLORS[it.type] || '#8a8aa0';
    const rc = RARITY_COLORS[it.rarity] || '#8a8aa0';
    const rl = realmLimitOf(it);
    const needLabel = (rl > 0 && REALMS[rl]) ? `需${REALMS[rl]}` : '';
    const owner = it.originalOwnerId
      ? S.disciples.find(d => d.id === it.originalOwnerId)
      : null;
    return `
      <div class="loot-item" style="border-left-color:${rc}">
        <div class="loot-info">
          <span class="loot-name">${it.name}</span>
          <span class="loot-type" style="color:${tc}">${it.type}</span>
          <span class="loot-rarity" style="color:${rc}">${it.rarity || '凡品'}</span>
          ${needLabel ? `<span class="tag-red">${needLabel}</span>` : ''}
          ${it.bonus ? `<span class="sub" style="color:#d4a843">+${it.bonus}</span>` : ''}
          <span class="loot-owner">${owner ? `来自 ${owner.name} 的上缴` : '长头上缴'}</span>
        </div>
        <div class="loot-actions">
          <button class="btn-gold" onclick="takeFromMountain(${i})">取出</button>
          <button onclick="refineFromMountain(${i})">炼化 +${it.refine || 0}</button>
        </div>
      </div>`;
  }).join('');

  const moreHtml = restCount > 0
    ? `<p class="empty">另有 ${restCount} 件未显示（列表上限 ${RENDER_LIMIT} 件）。用上面的「全部转入宗门仓库 / 全部炼化」处理。</p>`
    : '';

  box.innerHTML = help + statsHtml + bulk + listHtml + moreHtml;
}

export { renderMountain };
