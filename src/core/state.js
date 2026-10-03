/* ==========================================================================
 * state.js — 状态
 * 由 xiuxiantest.html 拆分而来（原「状态」段）
 * ========================================================================== */
import { SURNAMES, GIVEN } from './constants.js';
import { uid, pick, randInt, rand } from './utils.js';
import { discipleRealmCap } from './power.js';
import { rollRootTier, makeRoots } from './spirit-root.js';
import { rollTraits, TALENTS } from './talents.js';
import { makeItemFromLoot } from './items.js';
import { setLoyalty } from './loyalty.js';
import { addLog } from './log.js';
import { save } from './save.js';
import { refreshRecruits } from '../systems/recruit.js';
import { render } from '../ui/render.js';

let S = null;
let selected = new Set();
let tournamentSelected = new Set();
let grantingItemIndex = -1;

function newGame() {
  S = {
    month: 1, stones: 120, rep: 0, masterRealm: 2,   // 宗主开局金丹
    disciples: [], storage: [], missing: [],
    log: [], recruits: [],
    pending: [], scheduled: [],   /* 事件：待办列表 + 延时调度（原 event/eventQueue） */
    tournament: null, tournamentHistory: [],
    dungeonRuns: {},   /* 本月各秘境已探索次数（key = 秘境 id，月末清空） */
    /* ---------- 长老机制（阶段四） ---------- */
    mountainStorage: [],  /* 山头仓库：长老上缴的物品（玩家取用不掉任何好感） */
    elderReports: [],     /* 长老月报（结构化，只留最近 ELDER_REPORT_KEEP 条） */
    elderRuns: {},        /* 仅当 ELDER_SHARES_DUNGEON_QUOTA = false 时使用的独立额度池 */
  };
  selected.clear();
  tournamentSelected.clear();
  grantingItemIndex = -1;
  addLog('【宗门初立】你以金丹宗主之身开创宗门，广纳弟子，积蓄资源，以图大道。', 'gold');
  const d1 = makeDisciple(); setLoyalty(d1, 75);
  const d2 = makeDisciple(); setLoyalty(d2, 65);
  S.disciples.push(d1, d2);
  addLog(`${d1.name}、${d2.name} 拜入宗门。`, 'good');
  refreshRecruits();
  save();
  render();
}
function makeDisciple(realm) {
  /* 起始境界不能超过宗主允许的上限（宗主 - 2），
     否则新弟子一出场就高于上限，永远卡在门槛外。 */
  const roll = Math.random() < 0.12 ? 1 : 0;
  const traits = rollTraits();
  /* 天灵根等天赋可以强制灵根档位（先抽天赋，再定灵根） */
  let tier = rollRootTier();
  for (const id of traits) {
    const t = TALENTS[id];
    if (t && t.forceRootTier) tier = t.forceRootTier;
  }

  /* 有的天赋出生自带东西（老爷爷戒指 → 上古残卷） */
  const backpack = [];
  for (const id of traits) {
    const t = TALENTS[id];
    if (t && Array.isArray(t.grantItems)) {
      for (const tpl of t.grantItems) backpack.push(makeItemFromLoot(tpl));
    }
  }

  return {
    id: uid(),
    name: pick(SURNAMES) + pick(GIVEN),
    realm: realm !== undefined ? realm : Math.min(roll, discipleRealmCap()),
    cultivation: 0,
    luck: randInt(1, 10),
    loyalty: randInt(55, 85),
    aptitude: randInt(1, 5),        /* 数值悟性（原字段名 talent，已腾给天赋系统） */
    rootTier: tier,                 /* 灵根条数（1=单灵根）；决定修炼倍率 */
    roots: makeRoots(tier),         /* 五行向量 */
    traits,                         /* 天赋 id 列表 */
    revealed: [],                   /* 已解锁的隐藏天赋 id */
    traitState: {},                 /* 天赋私有计数器（如痴情被搜刮次数） */
    tier: 'normal',                 /* 档次（普通/精英/天才）；阶段三后续批次使用 */
    status: 'idle',
    backpack,
    equipment: { weapon: null, artifact: null, armor: null, accessory: null },
    techniques: [],
    dungeonRuns: 0,
    cohabMonths: 0,      /* 与老祖共处月数（隐藏天赋解锁条件用，月末 +1） */

    /* ---------- 长老机制（阶段四）：全部为字面量，不消耗任何随机数 ---------- */
    elder: false,        /* 是否被册封为长老（管理者标签） */
    elderId: null,       /* 归属的长老 id；null = 无人代管 */
    pool: 'direct',      /* 'direct' | 'elder' | 'idle'；只决定主界面以什么身份出现 */
    scavenge: 'balanced',/* 该长老的搜刮策略（只在 elder = true 时有意义） */
    cruise: 'rotate',    /* 该长老的进本策略（只在 elder = true 时有意义） */
  };
}
function makeEnemyDisciple(scalePower) {
  const realm = scalePower >= 500 ? 3 : scalePower >= 180 ? 2 : scalePower >= 50 ? 1 : 0;
  const baseLuck = randInt(1, 10);
  const variance = rand(0.9, 1.1);
  const power = Math.floor(scalePower * variance);
  return {
    id: uid(),
    name: pick(SURNAMES) + pick(GIVEN),
    realm,
    power,
    luck: baseLuck,
    loyalty: randInt(50, 85),
  };
}

/*
 * ESM 中，从别的模块 import 进来的绑定是只读的，不能被赋值。
 * 原单文件版里 save.js 会写 S、loot.js 会写 grantingItemIndex，
 * 拆分后这两处必须经由本模块提供的 setter 写回。
 */
function setS(v) { S = v; }
function setGrantingItemIndex(v) { grantingItemIndex = v; }

/*
 * 宗门可容纳的弟子数 = 3 + 宗主境界 × 2（开局宗主金丹(2)，即 7 人）。
 * 与 discipleRealmCap() 同理：宗门随宗主修为扩张。
 * 招募入口（systems/recruit.js）和弟子 Tab 的「x/y」都读这一处。
 */
function maxDisciples() {
  return 3 + (S.masterRealm || 0) * 2;
}

/* ==========================================================================
 * 长老机制的查询助手（阶段四）
 *
 * 一律做成"读的时候才解析"的纯查询，不做缓存 —— S 会被 save.js 整个替换
 * （setS），缓存会在读档后指向旧对象。
 * ========================================================================== */

/* 未知/缺失的 pool 一律按 'direct' 兜底：老存档的弟子绝不能因为缺字段就消失 */
function poolOf(d) {
  const p = d && d.pool;
  return (p === 'elder' || p === 'idle') ? p : 'direct';
}

/* 当前所有长老（保持 S.disciples 的顺序，UI 与月报都依赖这个顺序稳定） */
function elderList() {
  return S.disciples.filter(d => d.elder === true);
}

/* 某位长老名下的弟子 */
function elderMembersOf(elderId) {
  if (!elderId) return [];
  return S.disciples.filter(d => d.elder !== true && d.elderId === elderId);
}

/* 进主界面「宗门弟子」栏的弟子（长老本人也在其中：elder = true 时仍是 'direct'） */
function directDisciples() {
  return S.disciples.filter(d => poolOf(d) === 'direct');
}

export { S, selected, tournamentSelected, grantingItemIndex, newGame, makeDisciple, makeEnemyDisciple, setS, setGrantingItemIndex, maxDisciples, poolOf, elderList, elderMembersOf, directDisciples };
