/* ==========================================================================
 * master.js (ui) — 宗主面板
 * ========================================================================== */
import { REALMS, REALM_COLORS, RARITY_COLORS, DUNGEONS } from '../core/constants.js';
import { S } from '../core/state.js';
import { aweFactor, discipleRealmCap } from '../core/power.js';
import { getNextBreakthrough, canMasterBreakthrough } from '../systems/master.js';
import { el } from './dom.js';

function renderMaster() {
  const box = el('master');
  if (!box) return;

  const realm = S.masterRealm || 0;
  const rc = REALM_COLORS[realm] || '#8a8aa0';
  const awePercent = Math.round((1 - aweFactor()) * 100);
  const next = getNextBreakthrough();

  let nextHtml = '';
  if (!next) {
    nextHtml = `<div style="color:#d4a843;font-size:12px;margin-top:6px;">宗主已达最高境界，威压圆满。</div>`;
  } else {
    const check = canMasterBreakthrough();
    const matHtml = next.materials.map(m => {
      const owned = S.storage.filter(it => it.rarity === m.rarity).length;
      const enough = owned >= m.count;
      const color = RARITY_COLORS[m.rarity] || '#8a8aa0';
      /* 每档材料提示它从哪个秘境产出，避免玩家卡在"这天品到底打哪儿" */
      const src = DUNGEONS.filter(dg => dg.loot.some(it => it.rarity === m.rarity)).map(dg => dg.name);
      const srcTxt = src.length ? `产出于：${src.join('、')}` : '';
      /* 颜色一律用品级自己的颜色，够/不够只调明暗：够了实心，不够压暗 + 写明还缺多少。
         不用红色 —— 整排材料全红看起来像 bug，也丢掉了品级的视觉标识。 */
      const title = enough
        ? `${m.rarity} 已齐 ${owned}/${m.count}。${srcTxt}`
        : `${m.rarity} 还缺 ${m.count - owned} 件（${owned}/${m.count}）。${srcTxt}`;
      return `<span class="rate-chip" style="color:${color}${enough ? '' : ';opacity:.45;'}" title="${title}">
        ${m.rarity} ${owned}/${m.count}${enough ? '' : ` <span class="mat-short">缺${m.count - owned}</span>`}
      </span>`;
    }).join(' ');

    nextHtml = `
      <div style="margin-top:8px;font-size:12px;color:#8a8aa0;">
        下次突破：<b style="color:${REALM_COLORS[next.to]}">${REALMS[next.to]}</b>
        · 灵石 <b style="color:${S.stones >= next.stones ? '#d4a843' : '#e05555'}">${next.stones}</b>
      </div>
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:11px;color:#6a6a80;">材料：</span>
        ${matHtml}
      </div>
      <div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <button class="btn-gold" onclick="tryMasterBreakthrough()" ${check.ok ? '' : 'disabled'}>
          ${check.ok ? '突 破' : (check.reason || '条件不足')}
        </button>
        <span style="font-size:11px;color:#6a6a80;">弟子境界上限：${REALMS[discipleRealmCap()]}</span>
      </div>
    `;
  }

  box.innerHTML = `
    <div class="disciple" style="border-left-color:${rc};cursor:default;">
      <div class="d-head">
        <span class="d-name">宗主</span>
        <span class="realm-badge" style="color:${rc}">${REALMS[realm]}</span>
        <span class="d-power">威压 <b style="color:#d4a843;">${awePercent}%</b></span>
      </div>
      ${nextHtml}
    </div>
  `;
}

export { renderMaster };
