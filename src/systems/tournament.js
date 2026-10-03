/* ==========================================================================
 * tournament.js — 宗门大比
 * 由 xiuxiantest.html 拆分而来（原「宗门大比」段）
 * ========================================================================== */
import { REALMS } from '../core/constants.js';
import { S, selected, tournamentSelected, makeDisciple, makeEnemyDisciple } from '../core/state.js';
import { powerOf } from '../core/power.js';
import { addLog } from '../core/log.js';
import { rootCostMul } from '../core/spirit-root.js';
import { cannotDesert } from '../core/mods.js';
import { rand, clamp } from '../core/utils.js';
import { save } from '../core/save.js';
import { render } from '../ui/render.js';

function startTournament() {
  if (!S.disciples.length) return;

  /* 基准：取战力最高的前 3 名弟子求平均。
     用 powerOf 排序，低忠诚/受伤的弟子会自动靠后，
     这样前几名万一无法出战，基准也不会虚高。 */
  const top3 = [...S.disciples]
    .sort((a, b) => powerOf(b) - powerOf(a))
    .slice(0, 3);
  const avgPower = top3.reduce((s, d) => s + powerOf(d), 0) / top3.length;
  const basePower = Math.max(10, avgPower);

  const count = clamp(S.disciples.length, 1, 3);
  const enemyTeam = [];
  for (let i = 0; i < count; i++) {
    /* 对手梯度：第一个最弱，越往后越强 */
    const scale = basePower * (0.8 + i * 0.15);
    enemyTeam.push(makeEnemyDisciple(scale));
  }

  S.tournament = {
    enemyTeam,
    phase: 'select',
    myTeam: [],
    myWins: 0,
    enemyWins: 0,
    battleLog: [],
    resultSummary: null,
    recruitReward: null,
  };
  tournamentSelected.clear();

  addLog(`⚔ 第 ${S.month} 月宗门大比开启！对手派出 ${enemyTeam.map(e => e.name).join('、')}。`, 'warn');
  save();
  render();
}

/* 单场对决：幸运影响暴击、闪避，战力决定基础 */
function fightDuel(me, en) {
  const myBasePower = powerOf(me);
  const enBasePower = en.power;

  const myCrit = Math.random() < me.luck * 0.03;   // 最多 30%
  const enCrit = Math.random() < en.luck * 0.03;
  const myDodge = Math.random() < me.luck * 0.02;  // 最多 20%
  const enDodge = Math.random() < en.luck * 0.02;

  let myRoll = myBasePower * rand(0.9, 1.1);
  let enRoll = enBasePower * rand(0.9, 1.1);

  if (myCrit) myRoll *= 1.5;
  if (enCrit) enRoll *= 1.5;

  /* 闪避是防守属性：让对方的掷点减半，而不是抬高自己的掷点。
     双方都闪避时两边同时减半，比值不变，等价于不做修正，故直接跳过。 */
  if (myDodge && !enDodge) enRoll *= 0.5;
  else if (enDodge && !myDodge) myRoll *= 0.5;

  const winner = myRoll >= enRoll ? 'me' : 'en';
  return {
    mePower: Math.floor(myBasePower),
    enPower: enBasePower,
    /* 注意属性名是 me* ，而局部变量是 my* ，别写成简写 */
    meCrit: myCrit, enCrit, meDodge: myDodge, enDodge,
    meRoll: Math.floor(myRoll),
    enRoll: Math.floor(enRoll),
    winner,
  };
}

function beginTournament() {
  const t = S.tournament;
  if (!t) return;
  const mine = [...tournamentSelected].map(id => S.disciples.find(d => d.id === id)).filter(Boolean);
  if (!mine.length) { addLog('请先选择报名弟子。', 'warn'); render(); return; }

  t.myTeam = mine;
  t.myWins = 0;
  t.enemyWins = 0;
  t.battleLog = [];
  t.phase = 'fight';
  tournamentSelected.clear();

  addLog(`—— 宗门大比开战！我方出战：${mine.map(d => d.name).join('、')} ——`, 'gold');

  let myIdx = 0, enemyIdx = 0;
  let round = 0;
  const maxRounds = 5;

  while (myIdx < mine.length && enemyIdx < t.enemyTeam.length && round < maxRounds) {
    if (t.myWins >= 2 || t.enemyWins >= 2) break;

    const me = mine[myIdx];
    const en = t.enemyTeam[enemyIdx];
    const result = fightDuel(me, en);

    t.battleLog.push({
      round: round + 1,
      me: me.name, mePower: result.mePower,
      en: en.name, enPower: result.enPower,
      meCrit: result.meCrit, enCrit: result.enCrit,
      meDodge: result.meDodge, enDodge: result.enDodge,
      /* 掷点必须一起存，否则战果面板只能显示 undefined */
      meRoll: result.meRoll, enRoll: result.enRoll,
      winner: result.winner,
    });

    addLog(`第 ${round + 1} 场：${me.name}(${result.mePower}) vs ${en.name}(${result.enPower}) → ${result.winner === 'me' ? me.name : en.name} 胜`,
      result.winner === 'me' ? 'good' : 'bad');

    if (result.winner === 'me') {
      t.myWins++;
      enemyIdx++;
    } else {
      t.enemyWins++;
      myIdx++;
    }
    round++;
  }

  /* 结算 */
  const won = t.myWins > t.enemyWins;
  t.phase = 'result';

  if (won) {
    S.rep += 15;
    S.stones += 80;
    t.resultSummary = { won: true, rep: 15, stones: 80 };

    /* 高资质弟子招募机会 */
    const recruit = makeDisciple();
    recruit.aptitude = Math.min(5, recruit.aptitude + 2);
    recruit.luck = Math.min(10, recruit.luck + 3);
    recruit.cost = Math.round((30 + recruit.aptitude * 15 + recruit.realm * 80 + recruit.luck * 4) * rootCostMul(recruit));
    S.recruits.push(recruit);
    t.recruitReward = { name: recruit.name, realm: recruit.realm, cost: recruit.cost };

    addLog(`✦ 宗门大比获胜！声望 +15，灵石 +80。`, 'gold');
    addLog(`✨ 一位高资质散修【${recruit.name}】慕名而来，已加入招募候选。`, 'good');
  } else {
    S.rep = Math.max(0, S.rep - 10);
    t.resultSummary = { won: false, rep: -10 };

    addLog(`✖ 宗门大比失利。声望 -10。`, 'bad');

    /* 低忠诚弟子可能被挖走 */
    const poached = [];
    for (const d of t.myTeam) {
      if (d.loyalty >= 40) continue;
      if (cannotDesert(d)) continue;        /* 忠犬：不会被挖走 */
      const chance = 0.5 + (40 - d.loyalty) / 80;
      if (Math.random() < chance) {
        poached.push(d);
      }
    }
    if (poached.length) {
      for (const d of poached) {
        S.disciples = S.disciples.filter(x => x.id !== d.id);
        selected.delete(d.id);
        addLog(`💔 ${d.name} 在大比后被对手以重利挖走，叛出宗门！`, 'bad');
      }
      t.resultSummary.poached = poached.map(d => d.name);
    } else {
      addLog('所幸无人叛离。', 'warn');
    }
  }

  save();
  render();
}

function forfeitTournament() {
  if (!S.tournament) return;
  const t = S.tournament;
  S.rep = Math.max(0, S.rep - 20);
  addLog('你选择弃权认输。声望 -20。', 'bad');

  const poached = [];
  for (const d of S.disciples) {
    if (d.loyalty >= 50) continue;
    if (cannotDesert(d)) continue;          /* 忠犬：因怯战也不会失望离去 */
    if (Math.random() < 0.5) poached.push(d);
  }
  for (const d of poached) {
    S.disciples = S.disciples.filter(x => x.id !== d.id);
    addLog(`💔 ${d.name} 因宗门怯战而失望离去。`, 'bad');
  }

  t.phase = 'result';
  t.resultSummary = { won: false, forfeit: true, rep: -20, poached: poached.map(d => d.name) };
  save();
  render();
}

function closeTournament() {
  S.tournament = null;
  tournamentSelected.clear();
  save();
  render();
}

export { startTournament, fightDuel, beginTournament, forfeitTournament, closeTournament };
