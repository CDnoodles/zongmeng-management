/* ==========================================================================
 * discipleDetail.js — 弟子背包 / 装备栏 / 功法栏（内联在弟子卡片下方）
 * ========================================================================== */
import { S } from '../core/state.js';
import { SLOT_DEFS, TECHNIQUE_TYPE, RARITY_COLORS, TYPE_COLORS, REALMS, REALM_COLORS, ROOT_TIER_COLORS, DISCIPLE_BREAKTHROUGH_MATERIALS } from '../core/constants.js';
import { canSeeItem, techniqueSlots, canUseItem, realmLimitOf } from '../core/items.js';
import { rootTypeName, rootTier, rootPurity, rootCultivationMul } from '../core/spirit-root.js';
import { cultivationMul } from '../core/mods.js';
import { traitDetailHtml } from './traits.js';
import { render } from './render.js';

let expandedId = null;

function toggleDiscipleDetail(id) {
  expandedId = expandedId === id ? null : id;
  render();
}

/* 供 disciples.js 判断某弟子是否处于展开态 */
function isDiscipleExpanded(id) {
  return expandedId === id;
}

/* 背包物品可执行的动作：装备 / 修习 / 服用 / 没收。
   注意：这里**没有**「炼化」。炼化会把弟子的东西直接变成老祖的灵石却不扣忠诚，
   等于白嫖；统一改为「没收 → 入库」，炼化只在宗门仓库里进行。
   境界不够（realmLimit）的武器/法宝/功法按钮置灰，并挂 title 说明需要什么境界。 */
function itemActions(d, it) {
  const btn = [];
  const gate = canUseItem(d, it);
  const disabled = gate.ok ? '' : ' disabled';
  const gateTitle = gate.ok ? '' : ` title="需${gate.needLabel}方可驾驭"`;
  if (it.type === '武器') btn.push(`<button${disabled}${gateTitle} onclick="equipItem('${d.id}','${it.id}','weapon')">装备</button>`);
  if (it.type === '法宝') btn.push(`<button${disabled}${gateTitle} onclick="equipItem('${d.id}','${it.id}','artifact')">装备</button>`);
  if (it.type === TECHNIQUE_TYPE) btn.push(`<button${disabled}${gateTitle} onclick="learnTechnique('${d.id}','${it.id}')">修习</button>`);
  if (it.type === '丹药') btn.push(`<button onclick="useItem('${d.id}','${it.id}')">服用</button>`);
  btn.push(`<button class="btn-red" onclick="confiscateItem('${d.id}','${it.id}')">没收</button>`);
  return btn.join('');
}

/* 返回该弟子展开详情的 HTML（由 renderDisciples 拼接在卡片之后） */
function discipleDetailHtml(d) {
  const rc = REALM_COLORS[d.realm] || '#8a8aa0';

  const slotHtml = SLOT_DEFS.map(slot => {
    const eq = d.equipment[slot.key];
    return `
      <div class="slot-row">
        <span class="slot-label">${slot.label}</span>
        <span class="slot-content">
          ${eq
            ? `<span class="equip" style="color:${RARITY_COLORS[eq.rarity] || '#b06fe0'}">${eq.name} +${eq.bonus}</span>
               <button onclick="unequipItem('${d.id}','${slot.key}')">卸下</button>`
            : '<span class="slot-empty">— 空 —</span>'}
        </span>
      </div>`;
  }).join('');

  const tSlots = techniqueSlots(d);
  const techHtml = `
    <div class="slot-row">
      <span class="slot-label">功法 ${d.techniques.length}/${tSlots}</span>
      <span class="slot-content">
        ${d.techniques.length
          ? d.techniques.map(t => `
              <span class="equip" style="color:${RARITY_COLORS[t.rarity] || '#e08a4a'}">${t.name} +${t.bonus}</span>
              <button onclick="forgetTechnique('${d.id}','${t.id}')">放下</button>
            `).join(' ')
          : '<span class="slot-empty">— 空 —</span>'}
      </span>
    </div>`;

  const nextMats = DISCIPLE_BREAKTHROUGH_MATERIALS[d.realm] || [];
  const matRowHtml = nextMats.length
    ? nextMats.map(m => {
        const have = (d.backpack || []).filter(it => !it.hidden && it.rarity === m.rarity).length;
        const ok = have >= m.count;
        const color = RARITY_COLORS[m.rarity] || '#8a8aa0';
        const short = m.count - have;
        /* 与宗主面板同口径：颜色一律用品级自己的颜色，够/不够只调明暗。
           够了实心，不够压暗 + 补一个「缺N」红标。 */
        const title = ok
          ? `${m.rarity} 突破需求已齐 ${have}/${m.count}`
          : `${m.rarity} 突破还缺 ${short} 件（${have}/${m.count}）`;
        return `<span class="rate-chip" style="color:${color}${ok ? '' : ';opacity:.45;'}"
                      title="${title}">${m.rarity} ${have}/${m.count}${ok ? '' : ` <span class="mat-short">缺${short}</span>`}</span>`;
      }).join(' ')
    : '<span class="slot-empty">— 无需材料 —</span>';

  const visible = d.backpack.filter(it => canSeeItem(S.masterRealm, it));
  const hiddenCount = d.backpack.length - visible.length;

  const backpackHtml = visible.map(it => {
    const tc = TYPE_COLORS[it.type] || '#8a8aa0';
    const ic = RARITY_COLORS[it.rarity] || '#8a8aa0';
    const gate = canUseItem(d, it);
    const need = realmLimitOf(it);
    /* 境界不够：物品边框变警示色，并在名字后标「需XX」，玩家一眼看出为什么按钮灰了 */
    const border = gate.ok ? ic : '#c05050';
    const lockTag = (!gate.ok && need > 0)
      ? `<span class="tag-red" title="境界不足，无法装备/修习">需${gate.needLabel}</span>`
      : '';
    return `
      <div class="loot-item" style="border-left-color:${border}">
        <div class="loot-info">
          <span class="loot-name">${it.name}</span>
          <span class="loot-type" style="color:${tc}">${it.type}</span>
          <span class="loot-rarity" style="color:${ic}">${it.rarity || '凡品'}</span>
          ${it.bonus ? `<span class="sub" style="color:#d4a843">+${it.bonus}</span>` : ''}
          ${lockTag}
          ${it.hidden ? '<span class="tag-red">私藏</span>' : ''}
        </div>
        <div class="loot-actions">${itemActions(d, it)}</div>
      </div>`;
  }).join('');

  const hiddenHtml = hiddenCount > 0
    ? `<div class="hidden-hint">❓ 还有 ${hiddenCount} 件物品被私藏，老祖神识不足、无法查看。（境界越高，能看穿的藏匿越多）</div>`
    : '';

  return `
    <div class="disciple-detail">
      <div class="detail-head">
        <span class="d-name">${d.name}</span>
        <span class="realm-badge" style="color:${rc}">${REALMS[d.realm]}</span>
        <span class="sub" style="color:#8a8aa0;">背包 ${d.backpack.length} 件</span>
        <button class="bag-btn" style="margin-left:auto;" onclick="event.stopPropagation();toggleDiscipleDetail('${d.id}')">收起 ▲</button>
      </div>
      <div class="detail-slots">
        <div class="slot-row">
          <span class="slot-label">灵根</span>
          <span class="slot-content">
            <span class="equip" style="color:${ROOT_TIER_COLORS[rootTier(d)] || '#8a8aa0'}">${rootTypeName(d)}</span>
            <span class="sub" style="color:#8a8aa0;">
              纯度 ${(rootPurity(d) * 100).toFixed(0)}% · 灵根倍率 ×${rootCultivationMul(d).toFixed(2)}
            </span>
          </span>
        </div>
        <div class="slot-row">
          <span class="slot-label">天赋</span>
          <span class="slot-content">
            ${traitDetailHtml(d)}
            <span class="sub" style="color:#6a6a80;">合计修炼 ×${cultivationMul(d).toFixed(2)}</span>
          </span>
        </div>
        <div class="slot-row">
          <span class="slot-label">突破</span>
          <span class="slot-content">${matRowHtml}</span>
        </div>
        ${slotHtml}${techHtml}</div>
      <div class="detail-backpack">
        ${backpackHtml || '<p class="empty">背包空空如也。</p>'}
        ${hiddenHtml}
      </div>
    </div>`;
}

export { toggleDiscipleDetail, isDiscipleExpanded, discipleDetailHtml };
