/* ==========================================================================
 * debug.js (ui) — 调试面板
 *
 * 用途：快速把局面推到想验证的状态（升境界、给灵石、册封长老），
 *       省掉"为了测试一次册封而先攒三个月资源"的过程。
 *
 * 设计约定：
 *   · 默认折叠，点底栏「🔧 调试面板」展开；展开状态只存在模块内存里，
 *     不进存档（render() 不参与它的状态，所以每月刷新不会被重置）。
 *   · 只做"把状态推到某处"的写操作 + 一个只读的状态概览；
 *     不引入任何新的游戏机制，也不消耗随机数。
 *   · 所有写操作都走既有入口（setLoyalty / appointElder / dismissElder），
 *     不绕过校验，所以调试出来的局面与正常玩法完全同构。
 * ========================================================================== */
import { REALMS, REALM_COLORS, ELDER_LIMIT, ELDER_MAX_MEMBERS } from '../core/constants.js';
import { S, selected, maxDisciples, elderList, poolOf, makeDisciple } from '../core/state.js';
import { powerOf, discipleRealmCap } from '../core/power.js';
import { setLoyalty, displayLoyalty } from '../core/loyalty.js';
import { cultInfo } from '../core/utils.js';
import { save } from '../core/save.js';
import { addLog } from '../core/log.js';
import { appointElder, dismissElder, elderCount, canAppointElder,
         setScavengeOrder, getScavengeOrder } from '../systems/elder.js';
import { render } from './render.js';
import { el } from './dom.js';

let debugOpen = false;

function toggleDebug() {
  debugOpen = !debugOpen;
  render();
}

/* ---------- 通用小工具 ---------- */

function commit(note) {
  if (note) addLog(`🔧 ${note}`, 'warn');
  save();
  render();
}

const clampRealm = (r) => Math.max(0, Math.min(REALMS.length - 1, r));

function findD(id) { return S.disciples.find(d => d.id === id); }

/* ---------- 宗主 / 全局 ---------- */

/*
 * 宗主境界是整局的总闸门：
 *   弟子上限      = 3 + 宗主境界 × 2      （maxDisciples）
 *   弟子境界上限  = 宗主境界 - 2          （discipleRealmCap）
 * 所以"想快速升级弟子"的第一步其实是抬宗主境界，面板里把它放在最上面。
 */
function dbgMasterRealm(delta) {
  S.masterRealm = clampRealm((S.masterRealm || 0) + delta);
  commit(`宗主境界 → ${REALMS[S.masterRealm]}（弟子上限 ${maxDisciples()}，弟子境界上限 ${REALMS[discipleRealmCap()]}）`);
}

function dbgStones(n) {
  S.stones = Math.max(0, S.stones + n);
  commit(`灵石 ${n >= 0 ? '+' : ''}${n} → ${S.stones}`);
}

function dbgRep(n) {
  S.rep = Math.max(0, (S.rep || 0) + n);
  commit(`声望 ${n >= 0 ? '+' : ''}${n} → ${S.rep}`);
}

/* ---------- 弟子：境界 / 忠诚 / 状态 ---------- */

function dbgRealm(id, delta) {
  const d = findD(id);
  if (!d) return;
  d.realm = clampRealm(d.realm + delta);
  /* 升境界后修为条按新境界重算，避免出现"修为远超当前境界阈值"的怪状态 */
  d.cultivation = 0;
  d.capNotified = false;
  commit(`${d.name} 境界 → ${REALMS[d.realm]}`);
}

function dbgAllRealm(delta) {
  let n = 0;
  for (const d of S.disciples) {
    const before = d.realm;
    d.realm = clampRealm(d.realm + delta);
    d.cultivation = 0;
    d.capNotified = false;
    if (d.realm !== before) n++;
  }
  commit(`全体弟子境界 ${delta >= 0 ? '+' : ''}${delta}（${n} 人变化）`);
}

/*
 * 一键把全体弟子抬到"当前允许的上限"（宗主境界 - 2）。
 * 这是"快速升级"最常用的一步：不用一个个点。
 */
function dbgCapAllRealm() {
  const cap = discipleRealmCap();
  let n = 0;
  for (const d of S.disciples) {
    if (d.realm < cap) { d.realm = cap; d.cultivation = 0; d.capNotified = false; n++; }
  }
  commit(`全体弟子抬到当前上限 ${REALMS[cap]}（${n} 人变化）`);
}

function dbgLoyalty(id, value) {
  const d = findD(id);
  if (!d) return;
  setLoyalty(d, value);
  commit(`${d.name} 忠诚 → ${d.loyalty}`);
}

function dbgHealAll() {
  let n = 0;
  for (const d of S.disciples) {
    if (d.status === 'injured') { d.status = 'idle'; n++; }
  }
  commit(`治愈全体伤者（${n} 人）`);
}

/* 免费补人：直接往宗门里塞新弟子（绕过招募价格，但仍受人数上限约束） */
function dbgAddDisciples(n) {
  let added = 0;
  for (let i = 0; i < n; i++) {
    if (S.disciples.length >= maxDisciples()) break;
    S.disciples.push(makeDisciple());
    added++;
  }
  commit(`新增弟子 ${added} 人（${S.disciples.length}/${maxDisciples()}）`);
}

/* 一键把招募候选全部买下（照常扣灵石，用来看招募流程） */
function dbgRecruitAllFree() {
  let n = 0;
  for (const cand of [...(S.recruits || [])]) {
    if (S.disciples.length >= maxDisciples()) break;
    const d = { ...cand };
    delete d.cost;
    S.disciples.push(d);
    S.recruits = S.recruits.filter(x => x.id !== cand.id);
    n++;
  }
  commit(`招募候选全部入宗（${n} 人）`);
}

/* ---------- 长老：批量册封 / 罢免 ---------- */

/*
 * 一键册封：先按"战力最高"从可册封弟子里挑满名额，再把剩下的普通弟子
 * 平均分给这些长老（受 ELDER_MAX_MEMBERS 限制）。用来一键造出可测试的局面。
 */
function dbgAppointAndFill() {
  const candidates = S.disciples
    .filter(d => !d.elder && !d.elderId)
    .sort((a, b) => powerOf(b) - powerOf(a));

  let appointed = 0;
  for (const d of candidates) {
    if (elderCount() >= ELDER_LIMIT) break;
    if (appointElder(d.id)) appointed++;
  }

  const elders = elderList();
  let assigned = 0;
  if (elders.length) {
    let i = 0;
    for (const d of S.disciples) {
      if (d.elder || d.elderId) continue;
      /* 轮转分派，避免全塞给第一位长老 */
      for (let guard = 0; guard < elders.length; guard++) {
        const e = elders[i % elders.length];
        i++;
        if (canAssignSilently(e, d)) {
          d.elderId = e.id;
          d.pool = 'elder';
          selected.delete(d.id);
          assigned++;
          break;
        }
      }
    }
  }
  commit(`一键册封 ${appointed} 位长老，划分 ${assigned} 名弟子入门下`);
}

/* 不写日志的指派尝试（批量操作里避免刷屏） */
function canAssignSilently(e, d) {
  if (d.elder || d.id === e.id || d.elderId) return false;
  return S.disciples.filter(x => x.elderId === e.id).length < ELDER_MAX_MEMBERS;
}

function dbgDismissAllElders() {
  const elders = elderList();
  for (const e of elders) dismissElder(e.id);
  commit(`罢免全部长老（${elders.length} 位）`);
}

/*
 * 搜刮对象的挑选顺序（见 constants.ELDER_SCAVENGE_ORDER）。
 * 暴露成调试开关是为了能实时体感两者的差别：
 *   loyalty  先动忠诚高的，把代价摊平（默认）
 *   roster   按名册顺序，谁排前面谁倒霉（早期行为）
 */
function dbgToggleScavengeOrder() {
  const next = getScavengeOrder() === 'loyalty' ? 'roster' : 'loyalty';
  setScavengeOrder(next);
  commit(`长老搜刮顺序 → ${next === 'loyalty' ? '忠诚优先（摊平代价）' : '名册顺序（早期行为）'}`);
}

/* ---------- 渲染 ---------- */

function stat(label, value, color) {
  return `<span class="dbg-stat"><span class="dbg-stat-label">${label}</span>`
    + `<b style="color:${color || '#e6e6f0'}">${value}</b></span>`;
}

function renderDebug() {
  const box = el('debug');
  if (!box) return;
  if (!debugOpen) { box.innerHTML = ''; return; }

  const masters = S.masterRealm || 0;
  const cap = discipleRealmCap();
  const used = elderCount();

  /* ---- 状态概览 ---- */
  const overview = `
    <div class="dbg-stats">
      ${stat('月份', S.month)}
      ${stat('宗主', REALMS[masters], REALM_COLORS[masters])}
      ${stat('灵石', S.stones, '#d4a843')}
      ${stat('声望', S.rep || 0)}
      ${stat('弟子', `${S.disciples.length}/${maxDisciples()}`, S.disciples.length >= maxDisciples() ? '#e05555' : '#5fb85f')}
      ${stat('弟子境界上限', REALMS[cap], '#5a9fe0')}
      ${stat('长老名额', `${used}/${ELDER_LIMIT}`, used >= ELDER_LIMIT ? '#e05555' : '#5fb85f')}
      ${stat('长老可代管', `${ELDER_MAX_MEMBERS} 人/位`)}
    </div>`;

  /* ---- 全局操作 ---- */
  const globalOps = `
    <div class="dbg-row">
      <span class="dbg-label">宗主境界</span>
      <button onclick="dbgMasterRealm(-1)">−1</button>
      <button class="btn-gold" onclick="dbgMasterRealm(1)">+1</button>
      <button onclick="dbgMasterRealm(10)">拉满</button>
      <span class="sub">抬宗主境界 = 同时抬高<b>弟子上限</b>与<b>弟子境界上限</b>（这是升级弟子的总闸门）</span>
    </div>
    <div class="dbg-row">
      <span class="dbg-label">资源</span>
      <button onclick="dbgStones(1000)">灵石 +1000</button>
      <button onclick="dbgStones(100000)">灵石 +10万</button>
      <button onclick="dbgRep(50)">声望 +50</button>
    </div>
    <div class="dbg-row">
      <span class="dbg-label">弟子境界</span>
      <button onclick="dbgAllRealm(1)">全体 +1</button>
      <button onclick="dbgAllRealm(-1)">全体 −1</button>
      <button class="btn-gold" onclick="dbgCapAllRealm()">全体抬到上限</button>
      <span class="sub">上限 = 宗主境界 − 2</span>
    </div>
    <div class="dbg-row">
      <span class="dbg-label">弟子管理</span>
      <button onclick="dbgAddDisciples(1)">+1 弟子</button>
      <button onclick="dbgAddDisciples(5)">+5 弟子</button>
      <button onclick="dbgRecruitAllFree()">候选全收</button>
      <button onclick="dbgHealAll()">治愈全体</button>
      <button onclick="dbgMaxLoyaltyAll()">忠诚全体拉满</button>
    </div>
    <div class="dbg-row">
      <span class="dbg-label">长老</span>
      <button class="btn-gold" onclick="dbgAppointAndFill()">一键册封并分派</button>
      <button onclick="dbgDismissAllElders()">罢免全部长老</button>
      <span class="sub">一键册封按战力从高到低挑满名额，再把剩余弟子轮转分派</span>
    </div>
    <div class="dbg-row">
      <span class="dbg-label">搜刮对象</span>
      <button onclick="dbgToggleScavengeOrder()">切到${getScavengeOrder() === 'loyalty' ? '名册顺序' : '忠诚优先'}</button>
      <span class="sub">当前：<b>${getScavengeOrder() === 'loyalty' ? '忠诚从高到低（摊平代价）' : '名册顺序（早期行为）'}</b>
        —— 每月搜刮额度有限，先动谁决定了代价落在谁头上</span>
    </div>`;

  /* ---- 弟子逐个操作 ---- */
  const rows = S.disciples.map(d => {
    const rc = REALM_COLORS[d.realm] || '#8a8aa0';
    const ci = cultInfo(d, cap);
    const cultText = ci.maxed ? '圆满' : (ci.blocked ? `已至上境 ${d.cultivation}` : `${d.cultivation}/${ci.need}`);
    const shown = displayLoyalty(d);
    const lc = shown >= 60 ? '#5fb85f' : shown >= 30 ? '#d4a843' : '#e05555';
    const poolTag = d.elder ? '<span class="tag-sel">长老</span>'
      : poolOf(d) === 'elder' ? '<span class="tag-miss">代管</span>' : '';
    const chk = canAppointElder(d.id);
    return `
      <div class="dbg-disciple">
        <span class="d-name">${d.name}</span>
        <span class="realm-badge" style="color:${rc}">${REALMS[d.realm]}</span>
        ${poolTag}
        <span class="sub">战力 ${powerOf(d)} · 修为 ${cultText} · 忠诚 <b style="color:${lc}">${shown}</b></span>
        <span class="dbg-actions">
          <button onclick="dbgRealm('${d.id}',-1)">境−</button>
          <button onclick="dbgRealm('${d.id}',1)">境+</button>
          <button onclick="dbgLoyalty('${d.id}',100)">忠100</button>
          ${d.elder
            ? `<button class="btn-red" onclick="dismissElder('${d.id}')">罢免</button>`
            : `<button class="btn-gold" onclick="appointElder('${d.id}')" ${chk.ok ? '' : 'disabled'}
                 title="${chk.ok ? '册封为长老' : chk.reason}">${chk.ok ? '册封' : chk.reason}</button>`}
        </span>
      </div>`;
  }).join('');

  box.innerHTML = `
    <div class="dbg-panel">
      <div class="dbg-head">
        <span class="dbg-title">🔧 调试面板</span>
        <span class="sub">改动即时存盘；本面板不参与游戏结算</span>
        <button style="margin-left:auto;" onclick="toggleDebug()">收起 ✕</button>
      </div>
      ${overview}
      ${globalOps}
      <div class="dbg-section-title">弟子逐个调整（共 ${S.disciples.length} 人）</div>
      <div class="dbg-list">${rows || '<p class="empty">宗门里还没有弟子。</p>'}</div>
    </div>`;
}

/* 一个按钮把全体忠诚拉满（渲染里被引用，单独定义以免行内写太长） */
function dbgMaxLoyaltyAll() {
  let n = 0;
  for (const d of S.disciples) { setLoyalty(d, 100); n++; }
  commit(`全体忠诚拉满（${n} 人）`);
}

export {
  toggleDebug, renderDebug,
  dbgMasterRealm, dbgStones, dbgRep,
  dbgRealm, dbgAllRealm, dbgCapAllRealm, dbgLoyalty, dbgMaxLoyaltyAll, dbgHealAll,
  dbgAddDisciples, dbgRecruitAllFree,
  dbgAppointAndFill, dbgDismissAllElders, dbgToggleScavengeOrder,
};
