/* ==========================================================================
 * loot.js —
 * 由 xiuxiantest.html 拆分而来（原「」段）
 * ========================================================================== */
import { REALMS, REALM_COLORS, RARITIES, RARITY_COLORS, TYPE_COLORS } from '../core/constants.js';
import { realmLimitOf } from '../core/items.js';
import { S, grantingItemIndex, setGrantingItemIndex } from '../core/state.js';
import { cultInfo } from '../core/utils.js';
import { discipleRealmCap } from '../core/power.js';
import { displayLoyalty } from '../core/loyalty.js';
import { el } from './dom.js';

function renderStorage() {
  const box = el('storage');
  if (!box) return;

  /* 库存数量挂在 Tab 按钮上（原 panel-title 里的 #storage-count 已随面板合并移除） */
  const tabBtn = document.querySelector('.sub-tab[data-tab="storage"]');
  if (tabBtn) {
    tabBtn.textContent = `宗 门 仓 库 ${S.storage.length ? S.storage.length : ''}`.trim();
  }

  /* 顶部稀有度统计条 */
  const rarityStats = {};
  for (const it of S.storage) {
    const r = it.rarity || '凡品';
    rarityStats[r] = (rarityStats[r] || 0) + 1;
  }
  const statsHtml = Object.keys(rarityStats).length
    ? `<div class="loot-rates" style="margin:0 0 8px 0;padding:6px 0;">
        <span class="rate-label">库存：</span>
        ${[...RARITIES].reverse().filter(r => rarityStats[r]).map(r => `
          <span class="rate-chip" style="color:${RARITY_COLORS[r] || '#8a8aa0'}">
            ${r}<span class="rate-pct">${rarityStats[r]}</span>
          </span>
        `).join('')}
      </div>`
    : '';

  let pickerHtml = '';
  if (grantingItemIndex >= 0) {
    const item = S.storage[grantingItemIndex];
    if (!item) { setGrantingItemIndex(-1); }
    else {
      pickerHtml = `
        <div class="grant-picker">
          <div class="grant-picker-title">赏赐【${item.name}】给：</div>
          <div class="grant-picker-list">
            ${S.disciples.map(d => {
              const rc = REALM_COLORS[d.realm] || '#8a8aa0';
              /* 赏赐面板就是当初"看不到当前修为和忠诚度"的地方，这里一并走 displayLoyalty */
              const shownLoyalty = displayLoyalty(d);
              const lc = shownLoyalty >= 60 ? '#5fb85f' : shownLoyalty >= 30 ? '#d4a843' : '#e05555';
              const ci = cultInfo(d, discipleRealmCap());
              const cultText = ci.maxed ? '圆满' : `${d.cultivation}/${ci.need}`;
              return `<button style="font-size:11px;" onclick="grantItemTo('${d.id}')">
                ${d.name} <span style="color:${rc}">${REALMS[d.realm]}</span>
                <span style="color:#8a8aa0;">· 修为 ${cultText}</span>
                <span style="color:${lc};">· 忠诚 ${shownLoyalty}</span>
              </button>`;
            }).join('')}
            <button style="font-size:11px;" onclick="grantCancel()">取消</button>
          </div>
        </div>
      `;
    }
  }
  if (!S.storage.length) {
    box.innerHTML = pickerHtml + statsHtml + '<p class="empty">仓库空空如也。</p>';
    return;
  }

  /* 展示顺序：稀有度降序 → 同稀有度按 refine 降序。
     稀有度顺序直接由 constants 的 RARITIES 反推，新增品级不必再改这里。
     按钮回调仍带原始下标 i，否则 refineItem / grantItemStart 会打到错的物品。 */
  const rarityOrder = {};
  RARITIES.forEach((r, idx) => { rarityOrder[r] = RARITIES.length - 1 - idx; });
  const indexedStorage = S.storage
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ra = rarityOrder[a.it.rarity] ?? -1;
      const rb = rarityOrder[b.it.rarity] ?? -1;
      if (ra !== rb) return rb - ra;
      return b.it.refine - a.it.refine;
    });

  box.innerHTML = pickerHtml + statsHtml + indexedStorage.map(({ it, i }) => {
    const tc = TYPE_COLORS[it.type] || '#8a8aa0';
    const rc = RARITY_COLORS[it.rarity] || '#8a8aa0';
    /* 仓库里的装备/功法也标出境界门槛，避免赏赐下去才发现弟子用不了 */
    const rl = realmLimitOf(it);
    const needLabel = (rl > 0 && REALMS[rl]) ? `需${REALMS[rl]}` : '';
    const origOwner = it.originalOwnerId
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
        ${origOwner ? `<span class="loot-owner">来自 ${origOwner.name}</span>` : ''}
      </div>
      <div class="loot-actions">
        <button onclick="refineItem(${i})">炼化 +${it.refine} 灵石</button>
        <button class="btn-gold" onclick="grantItemStart(${i})">赏赐</button>
      </div>
    </div>
  `;
  }).join('');
}

export { renderStorage };
