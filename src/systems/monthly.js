/* ==========================================================================
 * monthly.js — 月末结算（分阶段管线）
 *
 * 阶段一重构：把原来一坨顺序执行的代码拆成显式阶段，并在阶段边界留钩子
 * （阶段三的天赋只需注册钩子，不必再回头改本文件）。
 *
 * 行为与重构前逐项一致：阶段之间没有跨弟子依赖，所以「按弟子跑一遍」
 * 改写成「按阶段各跑一遍」结果相同。可用 tools/sim.mjs 对比基线验证。
 * ========================================================================== */
import { S, selected } from '../core/state.js';
import { addLog } from '../core/log.js';
import { aweFactor } from '../core/power.js';
import { changeLoyalty } from '../core/loyalty.js';
import { modsOf, cultivationMul, sectMods, cannotDesert } from '../core/mods.js';
import { runHook, HOOKS } from '../core/hooks.js';
import { pick, randInt } from '../core/utils.js';
import { save } from '../core/save.js';
import { releaseScheduled, hasPendingEvents, queueEvent } from '../core/event-queue.js';
import { processMissing } from './missing.js';
import { runAutoBehavior } from './auto-behavior.js';
import { startTournament } from './tournament.js';
import { maybeEvent, PENDING_HINT, RANDOM_POOL } from './events.js';
import { checkReveals } from './talent-reveal.js';
import { phaseElder as runElderPhase } from './elder.js';
import { TALENTS, hasTrait, replaceTrait, traitLoyaltyMods } from '../core/talents.js';
import { makeItemFromLoot, maybeHide } from '../core/items.js';
import { refreshRecruits } from './recruit.js';
import { handleTraitDefect } from './defect-hooks.js';
import { render } from '../ui/render.js';

/* ---------- 阶段 ---------- */

function phaseBegin() {
  S.month++;
  S.dungeonRuns = {};        /* 新月重置各秘境探索次数 */
  S.elderRuns = {};          /* 长老的独立额度池（仅在 ELDER_SHARES_DUNGEON_QUOTA = false 时使用） */
  releaseScheduled();        /* 到期事件搬进待办列表 */
  for (const d of S.disciples) d.cohabMonths = (d.cohabMonths || 0) + 1;
  runHook(HOOKS.MONTH_BEGIN, { month: S.month });
}

function phaseMissing() {
  processMissing();
}

function phaseGrowth() {
  for (const d of S.disciples) {
    /* 基础 = 悟性×3，再乘灵根（阶段三会叠加天赋系数）。
       取整是为了让修为始终保持整数，UI 与突破阈值都好看。 */
    const gain = Math.round(d.aptitude * 3 * cultivationMul(d));
    d.cultivation += gain;
    runHook(HOOKS.GROWTH, { d, gain });
  }
}

/*
 * 长老阶段（阶段四）——插桩位置是唯一且不可移动的，见《长老机制_实施方案.md》5.1：
 *   · 必须在 phaseAuto **之前**：phaseAuto 会把弟子背包里的材料与丹药全部炼化
 *     （systems/auto-behavior.js），长老若在其后搜刮就什么材料都搜不到；
 *     这也正是文档 4.0 的原始顺序（进本 → 带回 → 搜刮 → 分配）。
 *   · 必须在 phaseRecover **之前**：那时 d.dungeonRuns 还是本月真实值，
 *     长老"每人每月最多 2 次"的判断才正确。
 * 该阶段在没有任何长老时是零 RNG、零状态改动的 no-op（回归基线的硬约束）。
 */
function phaseElder() {
  runElderPhase();
}

function phaseAuto() {
  /* 炼化材料/丹药 → 自动装备 → 尝试突破 */
  for (const d of S.disciples) runAutoBehavior(d);
}

function phaseLoyalty() {
  /* 宗门级光环（福星）：满足条件时把基础忠诚回复从 +2 提升，并给板凳弟子补一份。
     取全场最大，多个福星不叠加（避免堆叠导致忠诚立刻回满）。 */
  const sect = sectMods(S.disciples.map(d => d.traits));
  const baseRegen = sect.sectLoyaltyRegen > 0 ? sect.sectLoyaltyRegen : 2;
  const benchBonus = sect.benchLoyaltyBonus;

  for (const d of S.disciples) {
    changeLoyalty(d, baseRegen, 'monthly');
    /* phaseRecover 在本阶段之后才重置 dungeonRuns，所以这里读到的还是本月出战次数 */
    if (benchBonus > 0 && (d.dungeonRuns || 0) === 0) {
      changeLoyalty(d, benchBonus, 'monthly.bench');
    }
    /* 分档忠诚的自然变化（痴情：高忠诚不变 / 心寒后 -3 / 心凉后 -8）。
       月度自然变化不是"被搜刮"，所以直接结算，不乘 searchLoyaltyMul；
       但用 changeLoyalty 收口，保证仍然受 loyaltyRateMul 与上下限约束。
       档位按"回复之后"的忠诚判定，保证表里的净变化与档位一致。 */
    const tier = hasTrait(d, 'chiqing') ? traitLoyaltyMods(d, 'chiqing') : null;
    if (tier && tier.monthlyDrift) {
      const actual = changeLoyalty(d, tier.monthlyDrift, 'talent.loyaltyTier');
      if (actual <= -3) {
        addLog(`💔 ${d.name} 越来越心寒 —— ${tier.note}（忠诚 ${actual}）。`, 'bad');
      }
    }
    runHook(HOOKS.LOYALTY, { d });
    runHook(HOOKS.DISCIPLE_MONTHLY, { d });
  }
}

/*
 * 天赋月度结算：魔胎自蚀 / 天煞孤星光环 / 赌狗 / 隐藏天赋解锁
 * 放在忠诚阶段之后 —— 这样"忠诚 ≥ 80"这类解锁条件看到的是回复后的值。
 */
function phaseTalentMonthly() {
  /* 天煞孤星：全场只需一人即可对"其他弟子"产生 -3/月，不随人数叠加 */
  const cursers = S.disciples.filter(d => modsOf(d).othersLoyaltyPerMonth !== 0);
  const aura = cursers.length ? modsOf(cursers[0]).othersLoyaltyPerMonth : 0;

  let omenChance = 0;
  for (const d of S.disciples) {
    const m = modsOf(d);
    if (m.monthlyLoyalty) changeLoyalty(d, m.monthlyLoyalty, 'talent.monthly');   /* 魔胎 -5 */
    if (m.monthlyGamble) gambleMonthly(d);                                        /* 赌狗 */
    if (aura && m.othersLoyaltyPerMonth === 0) changeLoyalty(d, aura, 'talent.aura');
    if (m.omenMonthChance > omenChance) omenChance = m.omenMonthChance;
    produceMonthly(d);                                                            /* 小绿瓶产灵液 */

    /* 圣母婊：每月暗耗宗门灵石 */
    if (m.monthlyStonesCost) {
      const cost = Math.min(S.stones, m.monthlyStonesCost);
      if (cost > 0) {
        S.stones -= cost;
        addLog(`💸 ${d.name} 以接济旁人为名，从库房支走了 ${cost} 灵石。`, 'bad');
      }
    }

    /* 白切黑：忠诚跌破阈值即黑化，转化为「恶毒女配」 */
    if (m.darkenBelow && d.loyalty < m.darkenBelow && hasTrait(d, 'baiqiehei')) {
      if (replaceTrait(d, 'baiqiehei', 'edunvpei')) {
        addLog(`🖤 ${d.name} 终于藏不住另一面 —— 他黑化了。`, 'bad');
      }
    }

    checkReveals(d);                                                              /* 隐藏天赋解锁 / 伪装看穿 */
  }

  /* 天煞孤星引来的灾祸 */
  if (omenChance > 0 && Math.random() < omenChance) {
    addLog('🌑 天煞孤星冲撞气运，祸事上门……', 'bad');
    queueEvent(pick(RANDOM_POOL));
  }
}

/*
 * 小绿瓶：每月往背包里凝一滴灵液。
 * value / refine 随 (境界+1) 放大；低忠诚弟子会把它私藏起来（走 maybeHide）。
 */
function produceMonthly(d) {
  for (const id of (d.traits || [])) {
    const t = TALENTS[id];
    if (!t || !t.produce) continue;
    const scale = (d.realm || 0) + 1;
    const item = makeItemFromLoot({
      name: t.produce.name,
      type: t.produce.type,
      rarity: t.produce.rarity,
      value: t.produce.value * scale,
      refine: t.produce.refine * scale,
      loyaltyHeat: t.produce.loyaltyHeat,
      /* 产出的灵液是丹药（走"服用"），不受境界限制 */
      realmLimit: 0,
    }, d.id);
    maybeHide(d, item);
    if (!Array.isArray(d.backpack)) d.backpack = [];
    d.backpack.push(item);
    addLog(`💧 ${d.name} 的小绿瓶凝出一滴【${item.name}】。`, 'good');
  }
}

/* 赌狗：每月拿宗门资源赌一把（期望略偏负，方差大） */
function gambleMonthly(d) {
  const base = 30 + (S.masterRealm || 0) * 40;
  if (Math.random() < 0.45) {
    const gain = base * 2;
    S.stones += gain;
    addLog(`🎲 ${d.name} 赌运亨通，为宗门赢回 ${gain} 灵石。`, 'good');
  } else {
    const loss = Math.min(S.stones, Math.round(base * 1.5));
    S.stones -= loss;
    addLog(`🎲 ${d.name} 赌输了，宗门损失 ${loss} 灵石。`, 'bad');
  }
}

function phaseRecover() {
  for (const d of S.disciples) {
    if (d.status === 'injured') d.status = 'idle';
    d.dungeonRuns = 0;       /* 新月重置派遣次数 */
  }
}

function phaseDesert() {
  const awe = aweFactor();
  const defected = [];
  S.disciples = S.disciples.filter(d => {
    if (d.loyalty < 20 && !cannotDesert(d)) {   /* 忠犬：永不叛逃 */
      const chance = ((20 - d.loyalty) / 20) * 0.5 * awe;
      if (Math.random() < chance) {
        addLog(`✖ ${d.name} 对宗门心生怨怼，叛逃而去。`, 'bad');
        /* 痴情等天赋的叛逃副作用：因爱生恨 → 回头寻仇 */
        handleTraitDefect(d);
        selected.delete(d.id);
        defected.push(d);
        return false;
      }
    }
    return true;
  });

  /* 双面人：临走时拉走一批低忠诚弟子（团体叛逃） */
  for (const d of defected) {
    const maxTake = modsOf(d).followerDefect;
    if (!maxTake) continue;
    const followers = S.disciples.filter(x => x.loyalty < 40).slice(0, Math.min(maxTake, randInt(2, maxTake)));
    if (!followers.length) continue;
    for (const f of followers) {
      S.disciples = S.disciples.filter(x => x.id !== f.id);
      selected.delete(f.id);
    }
    addLog(`👥 ${d.name} 临走时还带走了 ${followers.map(f => f.name).join('、')}。`, 'bad');
  }
}

function phaseEvent() {
  if (S.month % 3 === 0 && S.disciples.length > 0) {
    startTournament();
  } else {
    maybeEvent();
  }
}

function phaseRecruit() {
  refreshRecruits(false);
}

/* ---------- 对外入口 ---------- */

function nextMonth() {
  if (hasPendingEvents()) { addLog(PENDING_HINT, 'warn'); render(); return; }
  if (S.tournament) { addLog('宗门大比进行中，请先完成。', 'warn'); render(); return; }

  phaseBegin();
  phaseMissing();
  phaseGrowth();
  phaseElder();
  phaseAuto();
  phaseLoyalty();
  phaseTalentMonthly();
  phaseRecover();
  phaseDesert();
  phaseEvent();
  phaseRecruit();

  runHook(HOOKS.MONTH_END, { month: S.month });
  save();
  render();
}

export { nextMonth };
