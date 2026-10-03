/* ==========================================================================
 * save.js — 存档
 * ========================================================================== */
import { DUNGEONS, SCAVENGE_STRATEGIES, CRUISE_STRATEGIES } from './constants.js';
import { uid } from './utils.js';
import { itemBonus, realmLimitOf, lootRealmLimit, LOOT_TEMPLATE_BY_NAME } from './items.js';
import { ROOT_DEFAULT_TIER, ROOT_DEFAULT_VECTOR, rollRootTier, makeRoots } from './spirit-root.js';
import { rollTraits } from './talents.js';
import { S, setS } from './state.js';

const KEY = 'xiuxian_save_v2';
const OLD_KEY = 'xiuxian_save_v1';

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}

/* 把任意形态的物品（掉落表条目 / 旧 loot 条目 / 旧 equip）规范化为实例 */
function normalizeItem(base) {
  if (!base) return null;
  const value = base.value || 0;
  const item = {
    id: base.id || uid(),
    name: base.name,
    type: base.type || '材料',
    rarity: base.rarity || '凡品',
    value,
    refine: base.refine || 0,
    bonus: typeof base.bonus === 'number' ? base.bonus : itemBonus({ value, type: base.type || '材料' }),
    hidden: !!base.hidden,
    secrecy: base.secrecy || 0,
    originalOwnerId: base.originalOwnerId || null,
    loyaltyHeat: base.loyaltyHeat || 1,
    tags: Array.isArray(base.tags) ? base.tags.slice() : [],
  };
  /* 境界限制：老存档物品没有这个字段，一律回填。
     掉落表里认识的物品直接对齐当前常量表 —— 这样"被重排过品级/数值"的物品
     （紫霄天书 value 6000 → 7000、品级抬到仙品、门槛抬到渡劫）在老档里也会被修正，
     否则玩家带着旧档还能用练气弟子装备那本超模功法。 */
  const tpl = LOOT_TEMPLATE_BY_NAME[item.name];
  if (tpl) {
    item.rarity = tpl.rarity || item.rarity;
    item.value = tpl.value;
    item.refine = tpl.refine;
    item.bonus = itemBonus({ value: tpl.value, type: item.type });
    item.realmLimit = lootRealmLimit(tpl);
  } else {
    item.realmLimit = typeof base.realmLimit === 'number' ? base.realmLimit : realmLimitOf(item);
  }
  return item;
}

function migrateDisciple(d) {
  if (!d) return;
  if (!Array.isArray(d.backpack)) d.backpack = [];
  if (!d.equipment) d.equipment = { weapon: null, artifact: null, armor: null, accessory: null };
  if (!Array.isArray(d.techniques)) d.techniques = [];
  /* 旧单一 equip 字段 → 武器槽 */
  if (d.equip) {
    if (!d.equipment.weapon) {
      d.equipment.weapon = normalizeItem({ ...d.equip, type: '武器' });
    }
    delete d.equip;
  }
  d.backpack = d.backpack.map(it => normalizeItem(it)).filter(Boolean);
  for (const k of ['weapon', 'artifact', 'armor', 'accessory']) {
    if (d.equipment[k]) d.equipment[k] = normalizeItem(d.equipment[k]);
  }
  d.techniques = d.techniques.map(it => normalizeItem(it)).filter(Boolean);
  /* 灵根：老档补三灵根 —— 纯度 1/3 ⇒ 修炼倍率恰好 ×1.0，等价于改造前的行为 */
  if (typeof d.rootTier !== 'number' || !d.roots) {
    d.rootTier = ROOT_DEFAULT_TIER;
    d.roots = { ...ROOT_DEFAULT_VECTOR };
  }
  /* 字段改名：d.talent（数值悟性）→ d.aptitude，"天赋"一词腾给 traits */
  if (typeof d.aptitude !== 'number') {
    d.aptitude = typeof d.talent === 'number' ? d.talent : 3;
  }
  delete d.talent;
  /* 天赋：老档不补随机天赋（否则读一次档就凭空多出效果），给空数组即可 */
  if (!Array.isArray(d.traits)) d.traits = [];
  if (!Array.isArray(d.revealed)) d.revealed = [];
  if (!d.traitState || typeof d.traitState !== 'object') d.traitState = {};
  if (typeof d.tier !== 'string') d.tier = 'normal';

  /* ---------- 长老机制（阶段四）迁移 ----------
     老档所有弟子一律回落到 'direct'：主界面按 pool 过滤，
     缺字段若按 'elder' 兜底会让整屏弟子消失。elderId 指向不存在的人
     由 systems/elder.js 的 reconcileElderAssignments() 在月末收敛。 */
  if (d.elder !== true) d.elder = false;
  if (typeof d.elderId !== 'string') d.elderId = null;
  if (d.pool !== 'elder' && d.pool !== 'idle') d.pool = 'direct';
  if (!SCAVENGE_STRATEGIES[d.scavenge]) d.scavenge = 'balanced';
  if (!CRUISE_STRATEGIES[d.cruise]) d.cruise = 'rotate';
}

/*
 * 招募候选 / 失踪弟子：走同一条迁移，但这两类"临时弟子"若缺灵根/天赋，
 * 直接补一套**随机**的（而不是三灵根 / 空天赋的兜底值），
 * 否则旧档会因为缺字段一直显示"悟性 undefined、无天赋"。
 * 必须在 migrateDisciple 之前判定"是否缺失"，否则会被兜底值覆盖。
 */
function migrateTemporaryDisciple(d) {
  if (!d) return;
  const needRoots = typeof d.rootTier !== 'number' || !d.roots;
  const needTraits = !Array.isArray(d.traits) || d.traits.length === 0;
  migrateDisciple(d);
  if (needRoots) {
    const tier = rollRootTier();
    d.rootTier = tier;
    d.roots = makeRoots(tier);
  }
  if (needTraits) d.traits = rollTraits();
}

function load() {
  try {
    let raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || !data.disciples) return false;
    setS(data);

    /* 通用补齐（沿用旧逻辑） */
    if (!S.storage) S.storage = [];
    if (!S.missing) S.missing = [];
    if (!Array.isArray(S.recruits)) S.recruits = [];
    if (!S.tournamentHistory) S.tournamentHistory = [];
    if (S.tournament === undefined) S.tournament = null;
    if (!S.dungeonRuns || typeof S.dungeonRuns !== 'object') S.dungeonRuns = {};
    if (typeof S.masterRealm !== 'number') S.masterRealm = 2;
    if ('dao' in S) delete S.dao;

    /* 事件模型迁移：S.event / S.eventQueue → S.pending 待办列表（+ S.scheduled 延时队列） */
    if (!Array.isArray(S.pending)) {
      const carried = [];
      if (S.event && S.event.id) carried.push({ id: S.event.id, data: S.event.data || {} });
      if (Array.isArray(S.eventQueue)) {
        for (const e of S.eventQueue) if (e && e.id) carried.push({ id: e.id, data: e.data || {} });
      }
      S.pending = carried;
    }
    delete S.event;
    delete S.eventQueue;
    if (!Array.isArray(S.scheduled)) S.scheduled = [];

    /* 长老机制（阶段四）全局状态补齐 */
    if (!Array.isArray(S.mountainStorage)) S.mountainStorage = [];
    if (!Array.isArray(S.elderReports)) S.elderReports = [];
    if (!S.elderRuns || typeof S.elderRuns !== 'object') S.elderRuns = {};

    /* 旧掉落表条目名 → 补 rarity（历史兼容） */
    const itemLookup = {};
    for (const dg of DUNGEONS) for (const it of dg.loot) itemLookup[it.name] = it;

    /* 旧 S.loot 待分配队列 → 迁入发现者背包（找不到原主则入仓库） */
    if (Array.isArray(S.loot)) {
      for (const l of S.loot) {
        const base = (l && l.item) || l;
        if (!base || !base.name) continue;
        const owner = S.disciples.find(x => x.id === l.ownerId);
        if (owner) {
          if (!Array.isArray(owner.backpack)) owner.backpack = [];
          const item = normalizeItem(base);
          item.ownerId = owner.id;
          owner.backpack.push(item);
        } else {
          S.storage.push(normalizeItem(base));
        }
      }
    }
    delete S.loot;

    /* 迁移弟子：在场 / 失踪 / 招募候选 三类都要走，否则旧档的招募候选会缺字段 */
    const migrateList = (arr, fn) => {
      if (!Array.isArray(arr)) return;
      for (const d of arr) {
        fn(d);
        if (typeof d.dungeonRuns !== 'number') d.dungeonRuns = 0;
        if (typeof d.cohabMonths !== 'number') d.cohabMonths = 0;
      }
    };
    migrateList(S.disciples, migrateDisciple);
    migrateList(S.missing, migrateDisciple);
    migrateList(S.recruits, migrateTemporaryDisciple);

    /* 仓库物品规范化（山头仓库同口径，否则旧档里的山头上缴物会缺 bonus/realmLimit） */
    S.storage = S.storage.map(it => normalizeItem(it)).filter(Boolean);
    S.mountainStorage = S.mountainStorage.map(it => normalizeItem(it)).filter(Boolean);

    return true;
  } catch (e) { return false; }
}

export { save, load };
