/* ==========================================================================
 * elder.js — 长老机制（阶段四）
 *
 * 定位：长老 = 弟子 + 管理者标签（见《长老机制_实施方案.md》第 2、3 章）。
 * 长老本身还是弟子：修为、突破、材料、忠诚、叛逃全部走既有逻辑，本模块
 * 只额外负责三件事：
 *   1) 把一部分弟子从主界面「宗门弟子」栏划到某个长老名下（pool = 'elder'）
 *   2) 月末编排名下弟子进本（elderCruise）
 *   3) 月末搜刮名下弟子背包，按自留比例分配到自己背包与山头仓库（elderScavenge）
 *
 * ★ 月末管线有一条硬约束（见实施方案 7.1）：
 *   phaseElder() 在**没有任何长老**时必须是零 RNG、零状态改动的 no-op。
 *   tools/sim.mjs 的回归基线依赖这一点 —— 基线局面里没有长老，
 *   只要这里多消耗一个 Math.random()，12 个月仿真就会整体位移。
 *   往本文件加逻辑时，请把随机调用一律放在 `if (!elders.length) return;` 之后。
 * ========================================================================== */
import { S, selected, poolOf, elderList, elderMembersOf } from '../core/state.js';
import { addLog } from '../core/log.js';
import { save } from '../core/save.js';
import { render } from '../ui/render.js';
import {
  ELDER_LIMIT, ELDER_MAX_MEMBERS,
  SCAVENGE_STRATEGIES, CRUISE_STRATEGIES,
  ELDER_SCAVENGE_MAX_PER_DISCIPLE, ELDER_SCAVENGE_MAX_PER_ELDER, ELDER_REPORT_KEEP,
  ELDER_SCAVENGE_LOYALTY_FLOOR, ELDER_SCAVENGE_ORDER,
  ELDER_APPEASE_BELOW, ELDER_APPEASE_MAX_PER_MONTH,
  ELDER_SHARES_DUNGEON_QUOTA, ELDER_MAX_CLEARS_PER_DUNGEON,
  DUNGEONS, MAX_DUNGEON_CLEARS, MAX_DUNGEON_RUNS, DISCIPLE_BREAKTHROUGH_MATERIALS,
} from '../core/constants.js';
import { elderShareOf, modsOf } from '../core/mods.js';
import { canSeeItem, materialsMissing } from '../core/items.js';
import { powerOf } from '../core/power.js';
import { changeLoyalty } from '../core/loyalty.js';
import { runDungeon } from './dungeon.js';
import { applyConfiscate, scavengePenalty, purgeRunaway } from './inventory.js';

/* ---------- 查询 ---------- */

function findDisciple(id) { return S.disciples.find(x => x.id === id); }

/* 当前长老人数（UI 的「x/y」与册封校验都读这一处） */
function elderCount() { return elderList().length; }

/* ---------- 校验 ---------- */

/*
 * 能不能把这名弟子册封为长老。
 * 返回 { ok, reason }，UI 直接把 reason 当按钮文案 / title。
 */
function canAppointElder(id) {
  const d = findDisciple(id);
  if (!d) return { ok: false, reason: '弟子不存在' };
  if (d.elder) return { ok: false, reason: '已是长老' };
  if (elderCount() >= ELDER_LIMIT) return { ok: false, reason: `长老已满（${elderCount()}/${ELDER_LIMIT}）` };
  return { ok: true, reason: '' };
}

/*
 * 能不能把 discipleId 划到 elderId 名下。
 * 长老不能代管长老（保持"长老 = 弟子"的单层结构，见实施方案 C13）。
 */
function canAssignDisciple(elderId, discipleId) {
  const e = findDisciple(elderId);
  if (!e || !e.elder) return { ok: false, reason: '不是长老' };
  const d = findDisciple(discipleId);
  if (!d) return { ok: false, reason: '弟子不存在' };
  if (d.elder) return { ok: false, reason: '长老不能被代管' };
  if (d.id === e.id) return { ok: false, reason: '不能代管自己' };
  if (d.elderId === e.id) return { ok: false, reason: '已在其名下' };
  /* 换长老时先按"目标长老"判容量 */
  if (elderMembersOf(e.id).length >= ELDER_MAX_MEMBERS) {
    return { ok: false, reason: `名下已满（${ELDER_MAX_MEMBERS} 人）` };
  }
  return { ok: true, reason: '' };
}

/* ---------- 册封 / 罢免 / 指派 ---------- */

function appointElder(id) {
  const check = canAppointElder(id);
  if (!check.ok) { addLog(`无法册封：${check.reason}。`, 'warn'); render(); return false; }
  const d = findDisciple(id);
  d.elder = true;
  /* 长老本人留在「宗门弟子」栏 —— 他既是管理者，也是玩家要亲自操心的弟子 */
  d.pool = 'direct';
  d.elderId = null;
  if (!SCAVENGE_STRATEGIES[d.scavenge]) d.scavenge = 'balanced';
  if (!CRUISE_STRATEGIES[d.cruise]) d.cruise = 'rotate';
  addLog(`☗ 你册封 ${d.name} 为长老，代你打理门下弟子。`, 'gold');
  save(); render();
  return true;
}

function dismissElder(id) {
  const e = findDisciple(id);
  if (!e || !e.elder) { addLog('此人并非长老。', 'warn'); render(); return false; }
  const members = elderMembersOf(e.id);
  for (const m of members) { m.elderId = null; m.pool = 'direct'; }
  e.elder = false;
  addLog(`☖ 你罢免了长老 ${e.name}${members.length ? `，名下 ${members.length} 名弟子重归你直接管辖` : ''}。`, 'warn');
  save(); render();
  return true;
}

function assignDisciple(elderId, discipleId) {
  const check = canAssignDisciple(elderId, discipleId);
  if (!check.ok) { addLog(`无法指派：${check.reason}。`, 'warn'); render(); return false; }
  const d = findDisciple(discipleId);
  const e = findDisciple(elderId);
  d.elderId = e.id;
  d.pool = 'elder';
  /* 划归长老门下后就不再是玩家直接派遣的对象，顺手取消选中，
     否则「已选 N 人」的提示条会把他算进去，但弟子栏里已经看不到他了。 */
  selected.delete(d.id);
  addLog(`${d.name} 被划入长老 ${e.name} 门下。`, 'good');
  save(); render();
  return true;
}

function unassignDisciple(discipleId) {
  const d = findDisciple(discipleId);
  if (!d || d.elder) return false;
  const e = d.elderId ? findDisciple(d.elderId) : null;
  if (!e) { d.elderId = null; d.pool = 'direct'; save(); render(); return false; }
  d.elderId = null;
  d.pool = 'direct';
  addLog(`${d.name} 回到你直接管辖。`, 'warn');
  save(); render();
  return true;
}

/* ---------- 策略设置 ---------- */

function setScavengeStrategy(elderId, key) {
  const e = findDisciple(elderId);
  if (!e || !e.elder || !SCAVENGE_STRATEGIES[key]) return false;
  e.scavenge = key;
  addLog(`长老 ${e.name} 的搜刮策略改为「${SCAVENGE_STRATEGIES[key].label}」（自留 ${elderSharePercent(e)}%）。`, 'warn');
  save(); render();
  return true;
}

function setCruiseStrategy(elderId, key) {
  const e = findDisciple(elderId);
  if (!e || !e.elder || !CRUISE_STRATEGIES[key]) return false;
  e.cruise = key;
  addLog(`长老 ${e.name} 的进本策略改为「${CRUISE_STRATEGIES[key].label}」。`, 'warn');
  save(); render();
  return true;
}

/* 该长老的自留比例（天赋决定，UI 显示与月末分配同口径） */
function elderSharePercent(e) {
  return Math.round(elderShareOf(e) * 100);
}

/* ---------- 运行时可调项（调试面板 / 对照仿真） ---------- */

let scavengeOrder = ELDER_SCAVENGE_ORDER === 'roster' ? 'roster' : 'loyalty';

function setScavengeOrder(order) {
  if (order !== 'roster' && order !== 'loyalty') return false;
  scavengeOrder = order;
  return true;
}

function getScavengeOrder() { return scavengeOrder; }

/* ==========================================================================
 * 月度收敛：把"孤儿"弟子放回玩家视野
 *
 * 必须覆盖的分支（见实施方案 5.1）：
 *   - elderId 指向的长老已陨落 / 失踪 / 叛逃 / 被罢免
 *   - 长老名下人数超出 ELDER_MAX_MEMBERS（例如上限被调小）
 *   - pool 是 'elder' 却没有 elderId
 *
 * ★ 零 RNG、幂等；没有孤儿时立刻返回，不动 S 的任何字段。
 * 注意：弟子**永远不会因为这条路径消失**，只是回到 'direct' 池。
 * ========================================================================== */
function reconcileElderAssignments() {
  const out = { changed: 0, orphans: [], detached: [], overflow: [], messages: [] };
  if (!Array.isArray(S.disciples) || !S.disciples.length) return out;

  /* 1) elderId 指向不存在 / 已不是长老的人 → 回收 */
  for (const d of S.disciples) {
    if (d.elder === true) continue;
    if (!d.elderId) {
      /* pool 说是代管，却没有归属 → 兜回玩家视野 */
      if (poolOf(d) === 'elder') {
        d.pool = 'direct';
        out.changed++;
        out.detached.push(d.name);
      }
      continue;
    }
    const e = S.disciples.find(x => x.id === d.elderId && x.elder === true);
    if (!e) {
      d.elderId = null;
      d.pool = 'direct';
      out.changed++;
      out.orphans.push(d.name);
    }
  }

  /* 2) 某个长老名下超编 → 超出的部分回到玩家视野（按 S.disciples 顺序，末尾先出） */
  for (const e of elderList()) {
    const members = elderMembersOf(e.id);
    if (members.length <= ELDER_MAX_MEMBERS) continue;
    for (const d of members.slice(ELDER_MAX_MEMBERS)) {
      d.elderId = null;
      d.pool = 'direct';
      out.changed++;
      out.overflow.push(`${d.name}（原属 ${e.name}）`);
    }
  }

  if (out.changed > 0) {
    if (out.orphans.length) {
      out.messages.push(`⚠ 长老已不在宗门，${out.orphans.join('、')} 重归你直接管辖。`);
    }
    if (out.detached.length) {
      out.messages.push(`⚠ ${out.detached.join('、')} 失去了长老归属，已重归你直接管辖。`);
    }
    if (out.overflow.length) {
      out.messages.push(`⚠ ${out.overflow.join('、')} 超出长门户下限额，已重归你直接管辖。`);
    }
    for (const m of out.messages) addLog(m, 'warn');
  }
  return out;
}

/* ==========================================================================
 * S5：月度搜刮
 * ========================================================================== */

/*
 * 秘境额度助手。
 *
 * D2 已确认「与玩家共用」：长老消耗的是 S.dungeonRuns，并留出
 * ELDER_MAX_CLEARS_PER_DUNGEON 次给玩家（"玩家优先，长老只吃剩饭"）。
 * 若把开关改成 false，长老改用独立额度池 S.elderRuns，不抢玩家 —— 改动面
 * 只有这两个函数与 constants 里的一个常量。
 */
function clearsUsed(dgId) {
  return ELDER_SHARES_DUNGEON_QUOTA
    ? (S.dungeonRuns[dgId] || 0)
    : (S.elderRuns[dgId] || 0);
}

function clearsBudget() {
  return ELDER_SHARES_DUNGEON_QUOTA
    ? MAX_DUNGEON_CLEARS - ELDER_MAX_CLEARS_PER_DUNGEON
    : MAX_DUNGEON_CLEARS;
}

/*
 * 搜刮计划（纯函数，不产生任何副作用）—— 便于单测。
 *
 * 规则（文档 4.4 + 实施方案 5.3）：
 *   1) 候选 = 背包里「老祖看得见」的物品（与手动搜刮同口径，用 S.masterRealm，
 *      不引入新的信息不对称；被私藏物品照常吃 ×2 惩罚）；
 *   2) 免罚物品（弟子用不上的 / 次级装备 / 灵石）永远拿 —— 任何策略下都拿；
 *   3) 非免罚物品按策略取：只拿上缴 0% / 温和 只拿价值 ≤ valueCap / 平衡 50% / 激进 80%；
 *   4) 每人每月最多 ELDER_SCAVENGE_MAX_PER_DISCIPLE 件，且受长老当月剩余额度约束；
 *   5) 忠诚已低于 ELDER_SCAVENGE_LOYALTY_FLOOR 的弟子本月跳过 —— 长老是自动搜刮的，
 *      玩家没有逐次决策的机会，不能让他被悄悄逼到叛逃（见 constants 里的说明）。
 *
 * 返回 { items, mul }，mul 是该策略的忠诚损失倍率。
 */
function planScavenge(elder, d, strategyKey, budget) {
  const cfg = SCAVENGE_STRATEGIES[strategyKey] || SCAVENGE_STRATEGIES.balanced;
  const cap = Math.min(ELDER_SCAVENGE_MAX_PER_DISCIPLE, Math.max(0, budget));
  if (cap <= 0) return { items: [], mul: cfg.mul, skipped: '' };
  /* 忠诚保护线：自动搜刮不能把弟子悄悄逼到叛逃（见 constants 里的说明） */
  if (ELDER_SCAVENGE_LOYALTY_FLOOR > 0
      && typeof d.loyalty === 'number' && d.loyalty < ELDER_SCAVENGE_LOYALTY_FLOOR) {
    return { items: [], mul: cfg.mul, skipped: 'low-loyalty' };
  }

  const bag = Array.isArray(d.backpack) ? d.backpack : [];
  const exempt = [];
  const taxable = [];
  for (const it of bag) {
    if (!canSeeItem(S.masterRealm, it)) continue;      /* 老祖看不穿的私藏，长老也拿不到 */
    if (scavengePenalty(d, it).exempt) exempt.push(it);
    else taxable.push(it);
  }

  let picked = exempt.slice();
  if (!cfg.exemptOnly) {
    const byValue = taxable.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
    const chosen = typeof cfg.valueCap === 'number'
      ? byValue.filter(it => (it.value || 0) <= cfg.valueCap)          /* 温和：只拿便宜的 */
      : byValue.slice(0, Math.ceil(byValue.length * cfg.pick));        /* 平衡 / 激进：按价值取前 N% */
    picked = picked.concat(chosen);
  }
  return { items: picked.slice(0, cap), mul: cfg.mul, skipped: '' };
}

/*
 * 分配：搜刮所得按"自留比例"分给自己与山头仓库。
 *
 * 两个关键口径：
 *   · 按**价值**而不是件数切分 —— 件数口径会让高价值物品的归属出现明显偏差；
 *   · 长老的"唯一优势"（文档 5.2 / 5.3）：先拿走自己突破确实还缺的材料，
 *     再按比例分其余的。判缺口一律走 items.materialsMissing，与弟子自动突破同口径。
 */
function distributeScavenge(elder, entries) {
  const share = elderShareOf(elder);
  const totalValue = entries.reduce((s, x) => s + (x.entry.value || 0), 0);
  let selfKept = 0;
  let tribute = 0;
  let keptValue = 0;

  /* 1) 先补自己缺的突破材料
     注意 materialsMissing 返回的是 { rarity, need, have }（不是 count），
     写错字段会让缺口算成 NaN，整条"优先补料"静默失效。 */
  const need = DISCIPLE_BREAKTHROUGH_MATERIALS[elder.realm] || [];
  const missing = new Map(materialsMissing(elder, need).map(m => [m.rarity, m.need - m.have]));
  const rest = [];
  for (const x of entries) {
    const left = missing.get(x.entry.rarity) || 0;
    if (left > 0) {
      missing.set(x.entry.rarity, left - 1);
      elder.backpack.push(x.entry);
      keptValue += x.entry.value || 0;
      selfKept++;
    } else {
      rest.push(x);
    }
  }

  /*
   * 2) 其余按价值降序、按自留比例切分。
   *
   * 口径是"自留到**不少于**目标价值为止"，而不是"逐件试放、放不下就跳过"：
   * 后者在高价值物品面前会退化 —— 例如自留 10%、5 件各值 100 的物品，
   * 目标 50，而任何一件都放不下，长老于是一件都拿不到，比例形同虚设。
   * 现在保证：share > 0 且有东西可分时至少自留 1 件，且比例越高自留越多（单调）。
   * 代价是最多超出目标一件的价值，对"贪"的直觉而言可以接受。
   */
  const sorted = rest.slice().sort((a, b) => (b.entry.value || 0) - (a.entry.value || 0));
  const restValue = sorted.reduce((s, x) => s + (x.entry.value || 0), 0);
  const target = restValue * share;

  let keepCount = 0;
  if (sorted.length && share > 0) {
    keepCount = 1;
    let acc = sorted[0].entry.value || 0;
    while (keepCount < sorted.length && acc < target) {
      acc += sorted[keepCount].entry.value || 0;
      keepCount++;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i].entry.value || 0;
    if (i < keepCount) {
      elder.backpack.push(sorted[i].entry);
      keptValue += v;
      selfKept++;
    } else {
      S.mountainStorage.push(sorted[i].entry);
      tribute++;
    }
  }
  return { selfKept, tribute, keptValue, totalValue, share };
}

/*
 * 长老搜刮一下名下弟子，把所得分给自己与山头仓库。
 *
 * 副作用收尾的两个粒度决定（见实施方案 5.3 第四步）：
 *   · purgeRunaway 每名弟子调一次，**不能每件都调**（它会触发天赋叛逃副作用）；
 *   · 伪人天赋的"挑拨旁人"同样每名弟子结算一次，与手动逐件没收的总量对齐。
 */
function elderScavenge(e, report) {
  const key = SCAVENGE_STRATEGIES[e.scavenge] ? e.scavenge : 'balanced';
  const cfg = SCAVENGE_STRATEGIES[key];
  if (!Array.isArray(S.mountainStorage)) S.mountainStorage = [];

  let budget = ELDER_SCAVENGE_MAX_PER_ELDER;
  const collected = [];
  const touched = [];
  const lowLoyalty = [];
  const floorHit = [];

  /*
   * 搜刮顺序由 scavengeOrder 决定（见 core/constants.js 的说明）：
   *   'loyalty' 忠诚从高到低 —— 每月额度有限，优先动扛得住的人，把代价摊平；
   *             忠诚已经低的排在后面，往往还没轮到额度就用完了。
   *   'roster'  名册顺序（早期行为，保留作对照）。
   * 配合下面的"触及保护线即停手"，同一名弟子不会被连续几个月薅到崩盘。
   */
  const members = elderMembersOf(e.id).slice();
  if (scavengeOrder === 'loyalty') {
    members.sort((a, b) => (b.loyalty || 0) - (a.loyalty || 0));
  }

  for (const m of members) {
    if (budget <= 0) break;
    const d = findDisciple(m.id);
    if (!d) continue;
    const plan = planScavenge(e, d, key, budget);
    if (plan.skipped === 'low-loyalty') { lowLoyalty.push(d.name); continue; }
    if (!plan.items.length) continue;

    const entries = [];
    for (const it of plan.items) {
      const r = applyConfiscate(d, it, {
        countSearches: false,          /* D4：走 elderSearches，不曝光隐藏天赋 */
        strategyMul: plan.mul,
        reason: 'elder.confiscate',
      });
      if (!r) continue;
      entries.push(r);
      /* 触及保护线立刻停手：单件代价最高可到 25（私藏物品翻倍后 50），
         只看"进屋前"的忠诚会让一次搜刮直接把人打到叛逃区间。 */
      if (ELDER_SCAVENGE_LOYALTY_FLOOR > 0 && d.loyalty <= ELDER_SCAVENGE_LOYALTY_FLOOR) {
        floorHit.push(d.name);
        break;
      }
    }
    if (!entries.length) continue;

    budget -= entries.length;
    collected.push(...entries);
    touched.push({ id: d.id, name: d.name, entries: entries.length });
    report.scavenged += entries.length;
    report.loyaltyCost += entries.reduce((s, x) => s + x.penalty, 0);

    purgeRunaway();                    /* 每人一次：忠诚归零 → 连夜叛逃 */
  }

  /* 伪人：被搜刮时挑拨旁人。每人每月只结算一次，不随件数放大 */
  for (const t of touched) {
    const d = findDisciple(t.id);
    if (!d) continue;
    const splash = modsOf(d).confiscateSplashOthers;
    if (!splash) continue;
    let n = 0;
    for (const x of S.disciples) {
      if (x.id === d.id) continue;
      changeLoyalty(x, splash, 'elder.confiscate.splash');
      n++;
    }
    if (n > 0) report.warnings.push(`${d.name} 心怀怨怼，四处挑拨（众人忠诚 ${splash}）`);
  }

  const dist = distributeScavenge(e, collected);
  report.selfKept = dist.selfKept;
  report.tribute = dist.tribute;
  report.keptValue = dist.keptValue;
  report.totalValue = dist.totalValue;
  report.share = dist.share;
  report.touched = touched.length;
  report.skippedLowLoyalty = lowLoyalty.length;
  report.floorStops = floorHit.length;

  /* 最后一步：把被薅狠了的弟子安抚一下（送礼回去） */
  elderAppease(e, touched, report);

  if (lowLoyalty.length) {
    report.warnings.push(`${lowLoyalty.join('、')} 忠诚已低，本月未搜刮`);
  }
  if (report.totalValue > 0 && report.keptValue / report.totalValue > dist.share + 0.35) {
    /* 自留远超比例通常是"优先补了自己的突破材料"，值得提示但不当作异常 */
    report.warnings.push(`自留偏高（占搜刮总值 ${Math.round(report.keptValue / report.totalValue * 100)}%，其中含自己突破所需材料）`);
  }
}

/* ==========================================================================
 * 长老安抚（送礼）
 *
 * 搜刮把弟子忠诚压到 ELDER_APPEASE_BELOW 以下时，长老从**自己自留的东西**
 * 里挑一件还回去，把忠诚补一点回来（补的量沿用仓库「赏赐」的公式，见
 * systems/loot.js grantItemTo，口径统一）。
 *
 * 挑哪一件：优先送**自己突破用不上**的（不补缺口），同条件下送最便宜的 ——
 * 长老不会把关键材料送人，但也不至于吝啬到只送垃圾。
 *
 * 返回送出的件数。一切从简：没有可送的东西就不送，不做"口头安抚"之类的兜底。
 * ========================================================================== */
function elderAppease(e, touched, report) {
  if (!Array.isArray(e.backpack) || !e.backpack.length) return 0;
  const needy = touched
    .map(t => findDisciple(t.id))
    .filter(d => d && typeof d.loyalty === 'number' && d.loyalty < ELDER_APPEASE_BELOW)
    .sort((a, b) => a.loyalty - b.loyalty);      /* 最危险的先安抚 */
  if (!needy.length) return 0;

  const need = DISCIPLE_BREAKTHROUGH_MATERIALS[e.realm] || [];
  const lack = new Set(materialsMissing(e, need).map(m => m.rarity));

  let given = 0;
  for (const d of needy) {
    if (given >= ELDER_APPEASE_MAX_PER_MONTH) break;
    /* 送"自己用不上"的里面最便宜的那件 */
    const pick = e.backpack
      .map((it, i) => ({ it, i }))
      .filter(x => !lack.has(x.it.rarity))
      .sort((a, b) => (a.it.value || 0) - (b.it.value || 0))[0];
    if (!pick) break;

    const [item] = e.backpack.splice(pick.i, 1);
    if (!Array.isArray(d.backpack)) d.backpack = [];
    d.backpack.push({ ...item, hidden: false, secrecy: 0, ownerId: d.id });
    const gain = Math.min(20, 5 + Math.floor((item.value || 0) / 5));
    const actual = changeLoyalty(d, gain, 'elder.appease');
    given++;
    report.gifted = (report.gifted || 0) + 1;
    report.appeased.push(`${d.name}（+${Math.max(0, actual)}）`);
  }
  return given;
}

/* ==========================================================================
 * S6：安排门下弟子进本
 * ========================================================================== */
/* 挑出战的人：策略只影响"谁先上"，不改变"每人每月最多 2 次"的硬规则 */
function pickCruiseTeam(avail, strategy) {
  const list = avail.slice();
  if (strategy === 'rotate') {
    /* 平均轮换：本月出战少的优先；同次数时战力高的先上（保证打得过） */
    list.sort((a, b) => (a.dungeonRuns || 0) - (b.dungeonRuns || 0) || powerOf(b) - powerOf(a));
  } else {
    /* 精英优先 / 安全第一 / 激进冒险：一律战力降序，差别在"挑哪个本" */
    list.sort((a, b) => powerOf(b) - powerOf(a));
  }
  return list.slice(0, 3);
}

/*
 * 挑秘境：统一取"打得过的里面最难的"（收益最大）。
 * "打得过"的门槛由策略表的 minRatio 给出（见 constants.CRUISE_STRATEGIES）：
 *   安全第一 1.5（只打能碾压的）｜ 精英优先 / 平均轮换 1.0 ｜ 激进冒险 0.6（敢越级）
 * 额度上还必须满足 clearsUsed < clearsBudget —— 共用额度时这就意味着
 * "长老只用玩家本月还没碰过的秘境"，玩家永远至少还剩 1 次。
 */
function pickCruiseDungeon(teamPower, strategy) {
  const cfg = CRUISE_STRATEGIES[strategy] || CRUISE_STRATEGIES.rotate;
  const minRatio = typeof cfg.minRatio === 'number' ? cfg.minRatio : 1.0;
  const budget = clearsBudget();
  const cands = DUNGEONS
    .filter(dg => clearsUsed(dg.id) < budget)
    .filter(dg => teamPower / dg.difficulty >= minRatio);
  if (!cands.length) return null;
  return cands.sort((a, b) => b.difficulty - a.difficulty)[0];
}

/* 该策略每月最多派几队 */
function maxCruiseRuns(strategy, memberCount) {
  const cfg = CRUISE_STRATEGIES[strategy] || CRUISE_STRATEGIES.rotate;
  const natural = Math.ceil(memberCount / 3);
  return typeof cfg.maxRuns === 'number' ? Math.min(cfg.maxRuns, natural) : natural;
}

function elderCruise(e, report) {
  const strategy = CRUISE_STRATEGIES[e.cruise] ? e.cruise : 'rotate';
  const cfg = CRUISE_STRATEGIES[strategy];
  /* 每月最多编排这么多次，保证每个人都轮得到（"安全第一"另有更低的硬上限） */
  const maxRuns = maxCruiseRuns(strategy, elderMembersOf(e.id).length);

  for (let r = 0; r < maxRuns; r++) {
    /* 每轮重新取名单：runDungeon 可能让人陨落 / 失踪 / 叛逃 */
    const avail = elderMembersOf(e.id).filter(d =>
      d.status !== 'injured' && (d.dungeonRuns || 0) < MAX_DUNGEON_RUNS);
    if (!avail.length) {
      if (r === 0) report.warnings.push('门下弟子都在休养或本月次数已用完，未安排进本');
      break;
    }
    /* 安全第一：凑不满一队就不派 —— 不拿一两个人去冒险 */
    if (cfg.fullTeam && avail.length < 3) {
      if (r === 0) report.warnings.push(`只有 ${avail.length} 人可出战，安全第一不派残缺队伍`);
      break;
    }

    const team = pickCruiseTeam(avail, strategy);
    const teamPower = team.reduce((s, d) => s + powerOf(d), 0);
    const dg = pickCruiseDungeon(teamPower, strategy);
    if (!dg) {
      if (r === 0) {
        report.warnings.push(strategy === 'safe'
          ? '没有能碾压的秘境，本月未安排进本'
          : '没有合适的秘境可派（秘境额度不足，或无人扛得住）');
      }
      break;
    }

    const res = runDungeon(dg, team, { log: false });
    report.cruises.push({
      dungeon: dg.name, difficulty: dg.difficulty, level: res.level,
      team: team.map(d => d.name),
      drops: res.dropCount, stones: res.stoneGain,
      dead: res.dead.length, injured: res.injured.length,
      missing: res.missing.length, deserted: res.deserted.length,
    });
    if (res.dead.length) {
      const names = res.dead.map(id => (team.find(t => t.id === id) || {}).name).filter(Boolean);
      report.warnings.push(`${names.join('、')} 陨落于【${dg.name}】`);
    }
  }
}

/* ==========================================================================
 * 月末阶段：长老编排
 *
 * 插桩位置见 systems/monthly.js —— 必须在 phaseGrowth 之后、phaseAuto 之前
 * （phaseAuto 会把弟子背包里的材料与丹药全部炼化，放在它后面就搜不到东西），
 * 同时也在 phaseRecover 之前（那时 dungeonRuns 还是本月的真实值）。
 *
 * 单月流程严格照文档 4.0：安排进本 → 弟子带回战利品 → 搜刮 → 分配 → 剩余留在背包。
 * ========================================================================== */
function phaseElder() {
  /* 先收敛孤儿弟子 —— 本身零 RNG、无孤儿时零状态改动 */
  reconcileElderAssignments();

  /* ★ 硬约束：没有长老就到此为止，不得消耗任何随机数、不得改动任何状态 */
  const elders = elderList();
  if (!elders.length) return;

  if (!Array.isArray(S.mountainStorage)) S.mountainStorage = [];
  if (!Array.isArray(S.elderReports)) S.elderReports = [];

  const produced = [];
  for (const e of elders) {
    if (!elderMembersOf(e.id).length) continue;
    const report = {
      elderId: e.id, elderName: e.name, month: S.month,
      cruises: [], warnings: [],
      scavenged: 0, touched: 0, skippedLowLoyalty: 0, floorStops: 0,
      selfKept: 0, tribute: 0, gifted: 0, appeased: [],
      keptValue: 0, totalValue: 0, loyaltyCost: 0, share: elderShareOf(e),
    };

    elderCruise(e, report);     /* ① 进本 */
    elderScavenge(e, report);   /* ②③④ 搜刮 → 自留 + 上缴 */

    /* 日志保持汇总粒度：每位长老最多 2 条 + 最多 2 条警告。
       S.log 上限 80 条（core/log.js），逐件打印会把玩家关心的信息冲掉。 */
    if (report.cruises.length) {
      const lv = report.cruises.map(c => c.level).join('/');
      const drops = report.cruises.reduce((s, c) => s + c.drops, 0);
      addLog(`⛰ 长老 ${e.name} 安排门下进本 ${report.cruises.length} 次（${lv}），带回 ${drops} 件战利品。`, 'good');
    }
    if (report.scavenged > 0) {
      addLog(`📦 长老 ${e.name} 搜刮门下 ${report.touched} 人共 ${report.scavenged} 件：`
        + `上缴 ${report.tribute} 件入山头仓库，自留 ${report.selfKept} 件（${Math.round(report.share * 100)}%）。`, 'good');
    }
    for (const w of report.warnings.slice(0, 2)) addLog(`⚠ ${e.name}：${w}`, 'warn');
    if (report.gifted > 0) {
      addLog(`🎁 长老 ${e.name} 见 ${report.appeased.join('、')} 被薅得狠了，各送回一件东西安抚。`, 'good');
    }

    produced.push(report);
  }

  if (produced.length) {
    S.elderReports = produced.concat(S.elderReports).slice(0, ELDER_REPORT_KEEP);
  }
}

/* 最近一条（或指定长老的最近一条）月报，供 UI 读取 */
function latestElderReport(elderId) {
  const list = Array.isArray(S.elderReports) ? S.elderReports : [];
  if (!elderId) return list[0] || null;
  return list.find(r => r.elderId === elderId) || null;
}

export {
  elderCount, canAppointElder, canAssignDisciple,
  appointElder, dismissElder, assignDisciple, unassignDisciple,
  setScavengeStrategy, setCruiseStrategy, elderSharePercent,
  setScavengeOrder, getScavengeOrder,
  reconcileElderAssignments, phaseElder, latestElderReport,
  /* S5 / S6 的内部函数导出给测试与 elder-sim 用 */
  planScavenge, distributeScavenge, elderScavenge, elderAppease, elderCruise,
  pickCruiseTeam, pickCruiseDungeon, maxCruiseRuns, clearsUsed, clearsBudget,
};
