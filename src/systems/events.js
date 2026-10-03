/* ==========================================================================
 * events.js — 事件系统
 *
 * 阶段一重构：
 * - 数据驱动：每条事件带 weight / condition，maybeEvent 改为加权抽取
 *   （当前权重全等，抽取结果与旧的 pick() 分布一致，保证重构不改行为）
 * - 待办列表模型（D2）：事件进 S.pending，玩家逐条处理，清空前不许进下月
 * - 修 BUG-2：resolveEvent 不再用「队首覆盖」，run() 里新产生的事件不会丢
 * - 修 BUG-1：删掉引用已废弃 S.dao 的「老祖出手 / 耗费修为救治」死选项
 *
 * TODO(待你决定)：qi / demon 删掉老祖选项后只剩一个选项，成了「强制事件」。
 *   需要的话可以给它们补一个不用老祖修为的第二选项。
 * ========================================================================== */
import { REALMS, REALM_POWER } from '../core/constants.js';
import { S, selected, makeDisciple } from '../core/state.js';
import { addLog } from '../core/log.js';
import { powerOf } from '../core/power.js';
import { setLoyalty, changeLoyalty } from '../core/loyalty.js';
import { pick, randInt, weightedPick } from '../core/utils.js';
import { save } from '../core/save.js';
import { queueEvent, hasPendingEvents, pendingList } from '../core/event-queue.js';
import { render } from '../ui/render.js';

const PENDING_HINT = '还有待处理的事件，请先处理完再进入下月。';

/* 把被夺舍的弟子从宗门名册里摘掉 —— 那具肉身已经不是你的人了 */
function stripPossessed(data) {
  const id = data && data.id;
  if (!id) return;
  const idx = S.disciples.findIndex(x => x.id === id);
  if (idx < 0) return;
  addLog(`💔 ${S.disciples[idx].name} 的肉身已被夺舍，不再是你的人。`, 'bad');
  S.disciples.splice(idx, 1);
  selected.delete(id);
}

/*
 * 随机事件池。
 * 已移除：qi（弟子走火入魔）—— 删掉依赖 S.dao 的「耗费修为救治」后只剩一个选项，
 *         退化成"强制事件"，先摘掉，等事件系统专项重做时再补第二选项。
 */
const RANDOM_POOL = ['beast', 'rogue', 'vein', 'enemy'];

/*
 * 事件定义：
 *   id / title / desc / weight / condition? / build(data) -> { title?, desc?, options }
 * condition(ctx) 返回 false 则不进随机池（当前全部省略 = 永远可触发）
 */
const EVENTS = {

  /* ---------------- 妖兽袭山 ---------------- */
  beast: {
    weight: 10,
    title: '妖兽袭山',
    desc: '一头三阶妖兽闯入山门，弟子们人心惶惶。',
    build: () => ({
      options: [
        { label: '派最强弟子迎战', run: () => {
          if (!S.disciples.length) {
            S.stones = Math.max(0, S.stones - 30);
            addLog('宗门无人可战，妖兽肆虐而去。灵石 -30。', 'bad');
            return;
          }
          const best = S.disciples.reduce((a, b) => powerOf(a) > powerOf(b) ? a : b);
          const p = powerOf(best);
          if (p >= 100) {
            S.stones += 50; S.rep += 5;
            addLog(`${best.name} 斩杀妖兽！灵石 +50，声望 +5。`, 'good');
          } else if (p >= 50) {
            best.status = 'injured';
            S.stones += 20;
            addLog(`${best.name} 苦战击退妖兽，但身受重伤。灵石 +20。`, 'warn');
          } else {
            best.status = 'injured';
            S.stones = Math.max(0, S.stones - 40);
            addLog(`${best.name} 被妖兽重创，山门损失惨重。灵石 -40。`, 'bad');
          }
        }},
        /* 原「老祖出手（消耗 30 修为）」已删除：S.dao 早已废弃，该选项恒为死按钮 */
        { label: '闭门不出', run: () => {
          S.stones = Math.max(0, S.stones - 30);
          S.rep = Math.max(0, S.rep - 5);
          addLog('宗门避战，灵石 -30，声望 -5。', 'bad');
        }},
      ],
    }),
  },

  /* ---------------- 散修来投 ---------------- */
  rogue: {
    weight: 10,
    title: '散修来投',
    desc: '一位散修慕名而来，希望加入宗门。',
    build: () => ({
      options: [
        { label: '收下他', run: () => {
          const d = makeDisciple();
          setLoyalty(d, randInt(30, 50));
          S.disciples.push(d);
          addLog(`${d.name}（${REALMS[d.realm]}）加入宗门，但忠诚较低。`, 'warn');
        }},
        { label: '婉言拒绝', run: () => addLog('散修失望离去。') },
      ],
    }),
  },

  /* 「弟子走火入魔」已移除：删掉依赖 S.dao 的「耗费修为救治」后只剩一个选项，
     等事件系统专项重做时再补一个不用老祖修为的第二选项。 */

  /* ---------------- 灵脉异动 ---------------- */
  vein: {
    weight: 10,
    title: '灵脉异动',
    desc: '宗门地下的灵脉出现异动，似有宝物出世。',
    build: () => ({
      options: [
        { label: '派弟子探查', run: () => {
          if (!S.disciples.length) { addLog('无人可派。', 'warn'); return; }
          if (Math.random() < 0.6) {
            const gain = randInt(60, 150);
            S.stones += gain;
            addLog(`弟子在灵脉中掘出灵石矿脉！灵石 +${gain}。`, 'good');
          } else {
            const d = pick(S.disciples);
            d.status = 'injured';
            addLog(`灵脉中暗藏杀机，${d.name} 受伤而归。`, 'bad');
          }
        }},
        { label: '按兵不动', run: () => addLog('你按兵不动，灵脉异动渐渐平息。') },
      ],
    }),
  },

  /* ---------------- 仇家上门 ---------------- */
  enemy: {
    weight: 10,
    title: '仇家上门',
    desc: '一名修士寻仇上门，在山门外叫阵。',
    build: () => ({
      options: [
        { label: '应战', run: () => {
          if (!S.disciples.length) { S.rep = Math.max(0, S.rep - 10); addLog('无人应战，声望 -10。', 'bad'); return; }
          const best = S.disciples.reduce((a, b) => powerOf(a) > powerOf(b) ? a : b);
          const enemyP = randInt(60, 140);
          if (powerOf(best) >= enemyP) {
            S.rep += 8;
            addLog(`${best.name} 击退仇家，声望 +8。`, 'good');
          } else {
            best.status = 'injured';
            S.stones = Math.max(0, S.stones - 50);
            addLog(`${best.name} 不敌仇家，灵石 -50。`, 'bad');
          }
        }},
        { label: '赔礼道歉（-60 灵石）', run: () => {
          if (S.stones < 60) { S.rep = Math.max(0, S.rep - 8); addLog('灵石不足，仇家破门而入，声望 -8。', 'bad'); return; }
          S.stones -= 60;
          addLog('你奉上灵石赔礼，仇家悻悻离去。', 'warn');
        }},
      ],
    }),
  },

  /* ---------------- 仇敌寻踪（失踪回归触发） ---------------- */
  revenge: {
    title: '仇敌寻踪',
    build: (data) => ({
      desc: `${(data && data.name) || '失踪的弟子'} 归来时引来了一个仇敌，对方正在山门外叫阵。`,
      options: [
        { label: '派最强弟子迎战', run: () => {
          if (!S.disciples.length) {
            S.rep = Math.max(0, S.rep - 15);
            S.stones = Math.max(0, S.stones - 40);
            addLog('无人应战，山门被掠。灵石 -40，声望 -15。', 'bad');
            return;
          }
          const best = S.disciples.reduce((a, b) => powerOf(a) > powerOf(b) ? a : b);
          const enemyP = randInt(80, 180);
          if (powerOf(best) >= enemyP) {
            S.rep += 12; S.stones += 60;
            addLog(`${best.name} 力克强敌！声望 +12，灵石 +60。`, 'good');
          } else {
            best.status = 'injured';
            S.stones = Math.max(0, S.stones - 60);
            S.rep = Math.max(0, S.rep - 5);
            addLog(`${best.name} 不敌强敌，灵石 -60，声望 -5。`, 'bad');
          }
        }},
        /* 原「老祖出手（消耗 40 修为）」已删除（S.dao 废弃） */
        { label: '破财免灾（-80 灵石）', run: () => {
          if (S.stones < 80) {
            S.stones = Math.max(0, S.stones - 40);
            S.rep = Math.max(0, S.rep - 15);
            addLog('灵石不足，仇敌破门而入。灵石 -40，声望 -15。', 'bad');
            return;
          }
          S.stones -= 80;
          addLog('你奉上灵石，仇敌退去。', 'warn');
        }},
      ],
    }),
  },

  /* ---------------- 旧戒夺舍（老爷爷戒指 · 突破后延时 2 月触发） ---------------- */
  possession: {
    title: '旧戒夺舍',
    build: (data) => {
      const name = (data && data.name) || '某弟子';
      const realm = (data && data.realm) || 1;
      const enemyP = Math.floor(REALM_POWER[realm] * 2.2 + 80);
      return {
        desc: `${name} 指上的旧戒终于发作——上古修士的残魂夺舍了他的肉身，`
          + `实力暴涨至 ${enemyP}，正朝山门而来。`,
        options: [
          { label: '派最强弟子镇压', run: () => {
            stripPossessed(data);
            if (!S.disciples.length) {
              S.rep = Math.max(0, S.rep - 20);
              S.stones = Math.max(0, S.stones - 80);
              addLog('无人可战，被夺舍者破门而入，宗门遭重创。灵石 -80，声望 -20。', 'bad');
              return;
            }
            const best = S.disciples.reduce((a, b) => powerOf(a) > powerOf(b) ? a : b);
            if (powerOf(best) >= enemyP) {
              S.rep += 15;
              addLog(`${best.name} 力斩被夺舍的 ${name}，声望 +15。`, 'good');
            } else {
              best.status = 'injured';
              S.stones = Math.max(0, S.stones - 80);
              S.rep = Math.max(0, S.rep - 10);
              addLog(`${best.name} 不敌被夺舍的 ${name}，灵石 -80，声望 -10。`, 'bad');
            }
          }},
          { label: '耗 150 灵石布阵逼出残魂', run: () => {
            if (S.stones < 150) {
              stripPossessed(data);
              S.rep = Math.max(0, S.rep - 10);
              addLog('灵石不足，法阵未成，被夺舍者扬长而去。声望 -10。', 'bad');
              return;
            }
            S.stones -= 150;
            const d = S.disciples.find(x => data && x.id === data.id);
            if (d) {
              d.status = 'injured';
              changeLoyalty(d, 25, 'event.possession');
              addLog(`你耗 150 灵石布阵，硬生生把残魂从 ${d.name} 体内逼出。他元气大伤，却对你死心塌地。`, 'good');
            } else {
              addLog('你耗 150 灵石布阵，将残魂彻底封入旧戒。', 'warn');
            }
          }},
        ],
      };
    },
  },

  /* 「入魔之敌」已移除：删掉依赖 S.dao 的「老祖出手」后只剩一个选项。
     失踪入魔的分支（missing.js）暂时改走 revenge，等事件专项重做时再恢复专属事件。 */
};

/* 由 id + data 构建可渲染的事件（标题/描述/选项） */
function buildEvent(id, data) {
  const def = EVENTS[id];
  if (!def) return null;
  let built = {};
  if (typeof def.build === 'function') {
    try { built = def.build(data || {}) || {}; }
    catch (e) { built = {}; }
  }
  return {
    title: built.title || def.title || id,
    desc: built.desc || def.desc || '',
    options: Array.isArray(built.options) ? built.options : [],
  };
}

/* 月末：按权重抽一条随机事件（等权重 ⇒ 与旧版 pick() 序列一致） */
function maybeEvent() {
  if (hasPendingEvents()) return;
  if (Math.random() < 0.45) return;
  const ctx = { S };
  const cands = RANDOM_POOL
    .map(id => (EVENTS[id] ? { id, ev: EVENTS[id] } : null))
    .filter(x => x && (!x.ev.condition || x.ev.condition(ctx)))
    .map(x => ({ id: x.id, w: x.ev.weight || 1 }));
  if (!cands.length) return;
  const chosen = weightedPick(cands);
  queueEvent(chosen.id);
  addLog('⚡ 有事件发生，请处理。', 'warn');
}

/*
 * 结算待办列表里第 pendingIdx 条的 optionIdx 选项。
 * 先移除本条再执行：run() 里若 queueEvent，会安全追加到列表尾部，
 * 不会像旧实现那样被「事后从队首取一条覆盖」而丢失（BUG-2）。
 */
function resolveEvent(pendingIdx, optionIdx) {
  const list = pendingList();
  const item = list[pendingIdx];
  if (!item) return;
  const built = buildEvent(item.id, item.data);
  const opt = built && built.options[optionIdx];
  list.splice(pendingIdx, 1);
  if (opt) {
    try {
      opt.run();
    } catch (e) {
      addLog(`事件【${built.title}】结算出错：${(e && e.message) || e}`, 'bad');
    }
  }
  save();
  render();
}

export { EVENTS, RANDOM_POOL, buildEvent, maybeEvent, resolveEvent, hasPendingEvents, PENDING_HINT };
