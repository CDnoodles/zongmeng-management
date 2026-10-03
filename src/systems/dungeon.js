/* ==========================================================================
 * dungeon.js — 秘境派遣
 * 由 xiuxiantest.html 拆分而来（原「秘境派遣」段）
 * ========================================================================== */
import { DUNGEONS, MAX_DUNGEON_RUNS, MAX_DUNGEON_CLEARS, REALMS, DESPERATE_BREAKTHROUGH_CHANCE } from '../core/constants.js';
import { S, selected } from '../core/state.js';
import { addLog } from '../core/log.js';
import { powerOf, assessDanger, discipleRealmCap } from '../core/power.js';
import { pick, randInt, weightedPick, weightedPickLoot, pickOwnerByLuck } from '../core/utils.js';
import { makeItemFromLoot, maybeHide } from '../core/items.js';
import { modsOf, dangerMul, missingChanceAdd, desperateChanceAdd, cannotDesert } from '../core/mods.js';
import { hasTrait, dropTrait, replaceTrait } from '../core/talents.js';
import { checkReveals } from './talent-reveal.js';
import { save } from '../core/save.js';
import { render } from '../ui/render.js';

/* ==========================================================================
 * runDungeon(dg, team, opts) —— 秘境结算的纯逻辑层（阶段四抽出）
 *
 * 抽取目的：让长老的自动安排进本（systems/elder.js）能复用同一套结算，
 * 而不必继承"每件一条日志 + 每次存盘渲染"。
 *
 * ★ 本函数是 dispatch() 结算体的**逐字搬运**：所有 Math.random() 的调用
 *   次序与个数、所有分支顺序都与改造前完全一致。tools/sim.mjs 的基线
 *   依赖这一点，改动本函数前请先读《长老机制_实施方案.md》7.1。
 *
 * opts：
 *   log   默认 true。false 时不写任何单条日志（长老批量安排用）。
 *
 * 返回：结算摘要。removed 是本次从 S.disciples 里消失的弟子 id
 *       （陨落 + 暗中消失 + 携款叛逃），调用方自行清理 selected。
 * ========================================================================== */
function runDungeon(dg, team, opts) {
  const o = opts || {};
  const log = o.log !== false;
  const say = (msg, type) => { if (log) addLog(msg, type); };

  const dead = new Set();
  const injured = [];
  const missing = [];
  const deserted = [];

  /* 参与即消耗一次派遣机会（无论胜败、无论是否受伤） */
  for (const d of team) {
    d.dungeonRuns = (d.dungeonRuns || 0) + 1;
    /* 出战次数：气运型天赋（欧皇/锦鲤/寻宝鼠）的解锁条件 */
    if (!d.traitState || typeof d.traitState !== 'object') d.traitState = {};
    d.traitState.dispatches = (d.traitState.dispatches || 0) + 1;
  }

  /* 派遣即消耗一次该秘境的探索次数 */
  S.dungeonRuns[dg.id] = (S.dungeonRuns[dg.id] || 0) + 1;

  say(`—— 派遣 ${team.map(d => d.name).join('、')} 前往【${dg.name}】——`, 'gold');

  let teamPower = team.reduce((s, d) => s + powerOf(d), 0);

  let slackLoss = 0;
  for (const d of team) {
    if (d.loyalty < 40) {
      const chance = (40 - d.loyalty) / 200;
      if (Math.random() < chance) {
        const loss = Math.floor(powerOf(d) * 0.5);
        slackLoss += loss;
        say(`⚠ ${d.name} 心怀不满，出工不出力，队伍战力 -${loss}。`, 'warn');
      }
    }
  }
  teamPower = Math.max(1, teamPower - slackLoss);
  say(`总战力 ${teamPower} / 难度 ${dg.difficulty}`, 'warn');

  const ratio = teamPower / dg.difficulty;
  let level;
  if (ratio >= 1.5) level = '大胜';
  else if (ratio >= 1.0) level = '小胜';
  else if (ratio >= 0.6) level = '惨胜';
  else level = '大败';

  const resultText = {
    '大胜': '队伍势如破竹，满载而归！',
    '小胜': '队伍顺利完成任务。',
    '惨胜': '队伍付出代价才勉强脱身。',
    '大败': '队伍遭遇重创，几乎全军覆没……',
  };
  say(`结果：【${level}】${resultText[level]}`, level === '大败' ? 'bad' : level === '惨胜' ? 'warn' : 'good');

  /* 锦鲤：全队存活率提升（取队伍里最好的一个，不叠加） */
  const teamDangerMul = team.reduce((m, d) => Math.min(m, modsOf(d).teamDangerMul), 1);

  const alive = [];
  for (const d of team) {
    const personalPower = powerOf(d);
    const risk = assessDanger(personalPower, dg.difficulty, level, dangerMul(d) * teamDangerMul);
    say(`· ${d.name}（战力 ${personalPower}，${risk.label}）`, 'warn');
    if (Math.random() < risk.death) {
      say(`☠ ${d.name} 陨落于【${dg.name}】。`, 'bad');
      dead.add(d.id);
      continue;
    }
    if (Math.random() < risk.injure) {
      d.status = 'injured';
      injured.push(d.id);
      say(`✚ ${d.name} 受伤而归，需休养一月。`, 'warn');
      /* 寻宝鼠：受伤后那只灵鼠就跑掉了（天赋被移除） */
      if (hasTrait(d, 'xunbaoshu') && dropTrait(d, 'xunbaoshu')) {
        say(`🐭 ${d.name} 受伤后，寻宝鼠受惊逃走，再不肯回来。`, 'bad');
      }
    }
    alive.push(d);
  }

  /* 绝境突破：惨胜/大败时，个人处于险境及以下的弟子有概率直接突破
     这是唯一不需要材料的突破路径，是绝境中的回报。 */
  if (level === '惨胜' || level === '大败') {
    for (const d of alive) {
      if (dead.has(d.id)) continue;
      const personalPower = powerOf(d);
      const risk = assessDanger(personalPower, dg.difficulty, level);
      if (risk.label === '安全' || risk.label === '均势') continue;
      if (d.realm >= discipleRealmCap()) continue;
      if (d.realm >= REALMS.length - 1) continue;

      /* 道心通明等天赋直接加在概率上（+0.15 绝对值） */
      const p = (d.aptitude || 1) * DESPERATE_BREAKTHROUGH_CHANCE + desperateChanceAdd(d);
      if (Math.random() < p) {
        d.realm++;
        d.cultivation = 0;
        say(`🔥 ${d.name} 在绝境中豁然贯通，当场突破至 ${REALMS[d.realm]}！`, 'gold');
      }
    }
  }

  for (const d of alive) {
    if (dead.has(d.id)) continue;
    if (d.loyalty >= 20) continue;
    if (cannotDesert(d)) continue;          /* 忠犬：不会背后捅刀 */
    const stabChance = (20 - d.loyalty) / 200;
    if (Math.random() >= stabChance) continue;
    const targets = alive.filter(x => x.id !== d.id && !dead.has(x.id));
    if (!targets.length) continue;
    const victim = pick(targets);
    dead.add(victim.id);
    say(`🗡 ${d.name} 在秘境中暗算同门，${victim.name} 陨落。`, 'bad');
  }

  /* 恶毒女配：同队背刺跟忠诚无关，纯看天赋 */
  for (const d of alive) {
    if (dead.has(d.id)) continue;
    const bs = modsOf(d).teamBackstab;
    if (!bs || Math.random() >= bs) continue;
    const targets = alive.filter(x => x.id !== d.id && !dead.has(x.id));
    if (!targets.length) continue;
    const victim = pick(targets);
    dead.add(victim.id);
    say(`🗡 ${d.name} 从背后下了手，${victim.name} 陨落于秘境。`, 'bad');
  }

  if (dead.size > 0) {
    S.disciples = S.disciples.filter(x => !dead.has(x.id));
  }

  const survivors = alive.filter(d => !dead.has(d.id));
  const returningSurvivors = [];
  for (const d of survivors) {
    let missingChance = 0;
    if (level === '大败') missingChance = 0.15;
    else if (level === '惨胜') missingChance = 0.10;
    else if (level === '小胜') missingChance = 0.05;
    else missingChance = 0.02;
    if (d.loyalty < 30) missingChance += 0.10;
    missingChance += missingChanceAdd(d);        /* 路痴：失踪率 +15% */
    if (Math.random() < missingChance) {
      const months = randInt(3, 6);
      d.status = 'missing';
      d.missingStart = S.month;
      d.returnMonth = S.month + months;
      S.missing.push(d);
      S.disciples = S.disciples.filter(x => x.id !== d.id);
      missing.push(d.id);
      say(`❓ ${d.name} 在【${dg.name}】中失去踪迹，下落不明……`, 'warn');
    } else {
      returningSurvivors.push(d);
    }
  }

  let dropCount = 0;
  if (level === '大胜') dropCount = 3;
  else if (level === '小胜') dropCount = 2;
  else if (level === '惨胜') dropCount = 1;
  else dropCount = Math.random() < 0.5 ? 1 : 0;
  if (returningSurvivors.length === 0) dropCount = 0;

  let luckyBonus = 0;
  for (const d of returningSurvivors) {
    if (Math.random() < d.luck / 25) luckyBonus++;
  }
  if (luckyBonus > 0) {
    dropCount += luckyBonus;
    say(`🍀 幸运儿的直觉让队伍多寻得 ${luckyBonus} 件宝物。`, 'good');
  }

  /* 气运型天赋（欧皇 / 寻宝鼠 / 锦鲤）：数量与稀有度偏向都取队伍最大值，不叠加。
     注意与 d.luck 是「叠加」关系 —— luck 是天生运气，这些是额外的秘境修正。 */
  const teamDropAdd = returningSurvivors.reduce((m, d) => Math.max(m, modsOf(d).dropCountAdd), 0);
  const teamRarityBias = returningSurvivors.reduce((m, d) => Math.max(m, modsOf(d).rarityBias), 0);
  if (teamDropAdd > 0) {
    dropCount += teamDropAdd;
    say(`🎏 气运加身，队伍又多寻得 ${teamDropAdd} 件宝物。`, 'good');
  }

  /* 掉落直接进发现者背包；低忠诚弟子按概率私藏（见 items.maybeHide） */
  /* 白莲花：同队时暗中截留掉落 */
  const thieves = returningSurvivors.filter(d => modsOf(d).dropTheft > 0);

  for (let i = 0; i < dropCount; i++) {
    let owner = pickOwnerByLuck(returningSurvivors);
    for (const t of thieves) {
      if (owner === t) break;
      if (Math.random() < modsOf(t).dropTheft) { owner = t; break; }
    }
    const item = makeItemFromLoot(weightedPickLoot(dg.loot, teamRarityBias), owner.id);
    maybeHide(owner, item);
    if (!owner.backpack) owner.backpack = [];
    owner.backpack.push(item);
  }

  let stoneGain = 0;
  if (level === '大胜') stoneGain = Math.floor(dg.difficulty * 1.6);
  else if (level === '小胜') stoneGain = Math.floor(dg.difficulty * 0.8);
  else if (level === '惨胜') stoneGain = Math.floor(dg.difficulty * 0.3);
  if (stoneGain > 0) {
    S.stones += stoneGain;
    say(`弟子带回灵石 ${stoneGain}。`, 'good');
  }

  for (const d of [...returningSurvivors]) {
    if (d.loyalty >= 20) continue;
    if (cannotDesert(d)) continue;          /* 忠犬：不会携款叛逃 */
    const desertChance = (20 - d.loyalty) / 200;
    if (Math.random() >= desertChance) continue;
    const maxSteal = stoneGain > 0 ? Math.max(5, Math.floor(stoneGain / 2)) : 0;
    const steal = maxSteal > 0 ? randInt(5, maxSteal) : 0;
    S.stones = Math.max(0, S.stones - steal);
    S.disciples = S.disciples.filter(x => x.id !== d.id);
    const idx = returningSurvivors.indexOf(d);
    if (idx >= 0) returningSurvivors.splice(idx, 1);
    deserted.push(d.id);
    say(`💸 ${d.name} 携带 ${steal} 灵石叛逃，再未归来！`, 'bad');
  }

  if (dropCount > 0) {
    say(`归来的弟子带回 ${dropCount} 件战利品，已放入各人背包。`, 'good');
  } else if (returningSurvivors.length && level !== '大败') {
    say('此行一无所获。', 'warn');
  }

  /* 黑切白：出战时有概率被同门感化，转化为「忠犬」 */
  for (const d of returningSurvivors) {
    const ec = modsOf(d).enlightenChance;
    if (!ec || !hasTrait(d, 'heiqiebai')) continue;
    if (Math.random() < ec && replaceTrait(d, 'heiqiebai', 'zhongquan')) {
      say(`🕊 ${d.name} 被同门感化，心性大变。`, 'good');
    }
  }

  /* 出战次数刚涨过，检查气运型隐藏天赋是否够条件曝光 / 伪装是否被看穿 */
  for (const d of returningSurvivors) checkReveals(d);

  return {
    level, ratio, teamPower, dropCount, stoneGain,
    dead: [...dead],
    injured,
    missing,
    deserted,
    removed: [...dead, ...missing, ...deserted],
    survivors: returningSurvivors.map(d => d.id),
  };
}

/* ==========================================================================
 * dispatch(dungeonId) —— 玩家手动派遣
 * 只负责"校验 + 读 selected + 调 runDungeon + 存盘渲染"。
 * ========================================================================== */
function dispatch(dungeonId) {
  const dg = DUNGEONS.find(d => d.id === dungeonId);
  if (!dg) return;
  if (S.tournament) { addLog('宗门大比进行中，无法派遣秘境。', 'warn'); render(); return; }
  const ids = [...selected];
  if (!ids.length) return;
  const team = ids.map(id => S.disciples.find(d => d.id === id)).filter(Boolean);
  if (!team.length) { selected.clear(); render(); return; }

  /* 二次校验：selection.js 已在点击时挡过一次，这里防止绕过选择直接调用 */
  for (const d of team) {
    if ((d.dungeonRuns || 0) >= MAX_DUNGEON_RUNS) {
      addLog(`${d.name} 本月派遣次数已用完，无法出战。`, 'warn');
      selected.clear();
      render();
      return;
    }
  }

  /* 二次校验：本月该秘境已被探尽（不影响已选队伍，可改派其它秘境） */
  if ((S.dungeonRuns[dungeonId] || 0) >= MAX_DUNGEON_CLEARS) {
    addLog(`【${dg.name}】本月已探索 ${MAX_DUNGEON_CLEARS} 次，需等下月再探。`, 'warn');
    render();
    return;
  }

  selected.clear();

  const result = runDungeon(dg, team, { log: true });

  /* 队伍里有人已经不在宗门名册里（陨落/失踪/叛逃）→ 一并取消选中 */
  for (const id of result.removed) selected.delete(id);

  save();
  render();
}

export { dispatch, runDungeon };
