/* ==========================================================================
 * talents.js — 天赋注册表（阶段三 · B1 批次）
 *
 * 设计原则（对齐《天赋与灵根》整理版 三、）：
 *   - 天赋只提供「数值修正 / 标签 / 计数器 / 事件触发条件」，不拥有独立流程
 *   - 所有数值修正由 core/mods.js 汇总，调用方不直接读 TALENTS
 *   - 可见性三态：visible（招募即见）/ disguised（显示表面效果）/ hidden（需解锁）
 *
 * 注意命名：弟子的数值悟性字段是 d.aptitude（旧名 d.talent 已腾给本系统）
 * ========================================================================== */
import { weightedPick } from './utils.js';

/* 天赋稀有度（独立于物品的 凡品~天品，避免混淆） */
const TALENT_RARITY_COLORS = {
  '凡': '#8a8aa0', '灵': '#5fb85f', '宝': '#5a9fe0', '仙': '#b06fe0', '天命': '#e0a54a',
};
const TALENT_RARITY_W = { '凡': 40, '灵': 30, '宝': 20, '仙': 8, '天命': 2 };

/*
 * B1 批次（全部为可见的心性/体质类，接口在阶段一已备好）
 *   mods 字段含义见 core/mods.js
 */
const TALENTS = {

  daoxintongming: {
    id: 'daoxintongming', name: '道心通明', pool: '体质', rarity: '宝', visibility: 'visible',
    desc: '临阵突破成功率 +15%；失踪后不会堕入魔道。',
    mods: { desperateChanceAdd: 0.15, noDemonOnMissing: true },
  },

  zhongquan: {
    id: 'zhongquan', name: '忠犬', pool: '心性', rarity: '灵', visibility: 'visible',
    desc: '搜刮忠诚损失减半，且永不叛逃。',
    mods: { searchLoyaltyMul: 0.5, noDesert: true, elderShare: 0.20 },
  },

  fuxing: {
    id: 'fuxing', name: '福星', pool: '心性', rarity: '灵', visibility: 'visible',
    desc: '宗门忠诚回复 +5（取代默认 +2）；本月未出战的弟子额外 +2。',
    mods: { sectLoyaltyRegen: 5, benchLoyaltyBonus: 2 },
  },

  juanwang: {
    id: 'juanwang', name: '卷王', pool: '心性', rarity: '灵', visibility: 'visible',
    desc: '修炼速度 +25%，但忠诚下降更快。',
    mods: { cultivationMul: 1.25, loyaltyRateMul: 1.5 },
    conflicts: ['landogou', 'foxi'],
  },

  landogou: {
    id: 'landogou', name: '懒狗', pool: '心性', rarity: '凡', visibility: 'visible',
    desc: '修炼速度 -30%，但忠诚下降更慢。',
    mods: { cultivationMul: 0.7, loyaltyRateMul: 0.5 },
    conflicts: ['juanwang'],
  },

  foxi: {
    id: 'foxi', name: '佛系', pool: '心性', rarity: '灵', visibility: 'visible',
    desc: '秘境中更不易受伤/陨落（×0.6），但修炼效率 -30%。',
    mods: { cultivationMul: 0.7, dangerMul: 0.6, elderShare: 0.10 },
    conflicts: ['juanwang'],
  },

  luchi: {
    id: 'luchi', name: '路痴', pool: '心性', rarity: '凡', visibility: 'visible',
    desc: '秘境失踪率 +15%。',
    mods: { missingChanceAdd: 0.15 },
  },

  /*
   * 财迷（阶段四新增）：喂给长老机制 —— 当上长老后自留五成，上缴只有一半。
   * 单独的 elderShare 字段不参与任何战斗/修炼结算，只在 systems/elder.js 的
   * 自留分配里读（经 core/mods.js 汇总，取最大值且被 ELDER_SELF_KEEP_CAP 夹住）。
   */
  caimi: {
    id: 'caimi', name: '财迷', pool: '心性', rarity: '灵', visibility: 'visible',
    desc: '当上长老后自留五成，上缴只有一半。',
    mods: { elderShare: 0.50 },
  },


  /* ---------------- B2：隐藏天赋 ----------------
     reveal 描述解锁条件，由 systems/talent-reveal.js 在月末/没收时检查：
       { type: 'cohab',   months, minLoyalty }  共处月数 + 忠诚
       { type: 'realm',   realm }               突破到指定境界
       { type: 'searches', count }              被搜刮累计次数
       { type: 'event' }                        只能由剧情/道具主动揭示
  ------------------------------------------------ */

  motai: {
    id: 'motai', name: '魔胎', pool: '定时炸弹', rarity: '仙', visibility: 'hidden',
    desc: '战力 +30%，但每月忠诚 -5，魔性难驯。',
    reveal: { type: 'realm', realm: 2 },
    mods: { combatMul: 1.3, monthlyLoyalty: -5 },
  },

  tianshaguxing: {
    id: 'tianshaguxing', name: '天煞孤星', pool: '命格', rarity: '宝', visibility: 'hidden',
    desc: '自身战力 +20%，但周围弟子每月忠诚 -3，还常引来灾祸。',
    reveal: { type: 'cohab', months: 6, minLoyalty: 80 },
    mods: { combatMul: 1.2, othersLoyaltyPerMonth: -3, omenMonthChance: 0.10 },
  },

  chiqing: {
    id: 'chiqing', name: '痴情', pool: '定时炸弹', rarity: '灵', visibility: 'hidden',
    desc: '对老祖心怀爱慕，忠诚上限 90。高忠诚时你搜刮什么他都当恩宠，'
      + '但忠诚越低越心寒：搜刮代价最高 ×3，每月最多自然流失 8 点。'
      + '一旦心凉透顶叛逃，必因爱生恨回头寻仇。',
    reveal: { type: 'searches', count: 1 },
    mods: { loyaltyCap: 90 },
    /*
     * 痴情专属·分档忠诚速率（minLoyalty 从高到低匹配，取第一档）
     *   搜刮损失倍率 searchMul、每月自然变化 monthlyDrift（在基础 +2 之上叠加，
     *   所以这里写的是「净变化 = 设计表数值 - 2」）
     * 取档位走 traitLoyaltyMods()；搜刮在 systems/inventory.js、月末在 systems/monthly.js。
     * 心凉透顶（忠诚归零）叛逃时由 onDefect 触发寻仇。
     */
    loyaltyTiers: [
      { minLoyalty: 70, searchMul: 0.2, monthlyDrift: 0,   note: '老祖拿我的东西，是看得起我。' },
      { minLoyalty: 50, searchMul: 0.5, monthlyDrift: -2,  note: '默默忍受，偶尔失落' },
      { minLoyalty: 30, searchMul: 1.5, monthlyDrift: -5,  note: '开始心寒，觉得被利用' },
      { minLoyalty: 0,  searchMul: 3.0, monthlyDrift: -10, note: '因爱生恨，崩盘式下跌' },
    ],
    /* 因爱生恨：叛逃（不论哪种叛逃）都回头寻仇，事件 id 复用已有的 revenge */
    onDefect: () => ({
      type: 'seekRevenge',
      event: 'revenge',
      log: '💔 {name} 心已凉透，爱意化作杀机 —— 他弃你而去，扬言要回来讨个说法！',
    }),
  },

  dugou: {
    id: 'dugou', name: '赌狗', pool: '定时炸弹', rarity: '凡', visibility: 'visible',
    desc: '每月拿宗门资源去赌，可能暴富，也可能暴亏。',
    mods: { monthlyGamble: true },
  },

  /* ---------------- B3：奇遇型（带延时剧情） ---------------- */

  xiaolvping: {
    id: 'xiaolvping', name: '小绿瓶', pool: '狗血', rarity: '仙', visibility: 'hidden',
    desc: '每月凝出一滴灵液（随境界增强），修炼更快；夺走灵液最伤人心。',
    reveal: { type: 'searches', count: 1 },
    mods: { cultivationMul: 1.2 },
    /* produce：每月往背包里产一件，value/refine 随 (境界+1) 放大 */
    produce: { name: '灵液', type: '丹药', rarity: '玄品', value: 12, refine: 15, loyaltyHeat: 3 },
  },

  laoyeye: {
    id: 'laoyeye', name: '老爷爷戒指', pool: '狗血', rarity: '宝', visibility: 'hidden',
    desc: '战力 +50%，自带一卷上古功法；但每次突破都有一丝被夺舍的风险。',
    reveal: { type: 'realm', realm: 1 },
    possessionChance: 0.10,        /* 每次突破的夺舍概率 */
    mods: { combatMul: 1.5 },
    grantItems: [{ name: '上古残卷', type: '功法', rarity: '地品', value: 70, refine: 55 }],
  },

  /* ---------------- B4：气运型 ----------------
     与 d.luck 的关系定为「叠加」：luck 是天生运气（驱动额外掉落/大比暴击闪避），
     这几条是额外的秘境掉落修正（取队伍最大，不随人数叠加）。
  ------------------------------------------------ */

  ouhuang: {
    id: 'ouhuang', name: '欧皇', pool: '生产', rarity: '宝', visibility: 'hidden',
    desc: '秘境掉落数量 +1，且掉落明显偏向高稀有度。',
    reveal: { type: 'dispatches', count: 3 },
    mods: { dropCountAdd: 1, rarityBias: 0.6 },
  },

  jinli: {
    id: 'jinli', name: '锦鲤', pool: '生产', rarity: '灵', visibility: 'hidden',
    desc: '全队更不容易受伤/陨落，掉落也略微偏向高稀有度。',
    reveal: { type: 'dispatches', count: 1 },
    mods: { teamDangerMul: 0.75, rarityBias: 0.25 },
  },

  xunbaoshu: {
    id: 'xunbaoshu', name: '寻宝鼠', pool: '生产', rarity: '宝', visibility: 'hidden',
    desc: '秘境掉落数量 +2，但更容易受伤；一旦受伤，寻宝鼠就跑掉了。',
    reveal: { type: 'dispatches', count: 2 },
    mods: { dropCountAdd: 2, dangerMul: 1.8 },
  },

  /* ---------------- B5：灵根 / 体质 ----------------
     与阶段二的灵根系统绑定：
       - 天灵根：不额外加数值，而是**强制**该弟子抽到单灵根（倍率由纯度给出 ×2.0）
       - 伪灵根：修炼 ×0.5，但更容易藏着隐藏天赋
       - 先天剑体：战力 +20%；身上带着【剑道】tag 的物品时额外 +30% 修炼
  -------------------------------------------------- */

  tianlinggen: {
    id: 'tianlinggen', name: '天灵根', pool: '灵根', rarity: '仙', visibility: 'visible',
    desc: '天生单灵根，修炼速度 ×2.0（由灵根纯度提供）。',
    conflicts: ['weilinggen'],
    forceRootTier: 1,
  },

  weilinggen: {
    id: 'weilinggen', name: '伪灵根', pool: '灵根', rarity: '凡', visibility: 'visible',
    desc: '修炼速度 ×0.5，但更容易藏着隐藏天赋 —— 也许是封印的天灵根。',
    conflicts: ['tianlinggen'],
    mods: { cultivationMul: 0.5 },
    bonusHiddenChance: 0.5,
  },

  xianjianti: {
    id: 'xianjianti', name: '先天剑体', pool: '体质', rarity: '宝', visibility: 'visible',
    desc: '战力 +20%；身上带着【剑道】之物时，修炼速度额外 +30%。',
    mods: { combatMul: 1.2, swordCultivationMul: 1.3 },
  },

  /* ---------------- B6：伪人池（disguised） ----------------
     统一模式：`surfaceDesc` 是给玩家看的谎话，`desc` + `mods` 才是真相；
     满足 `reveal` 条件后被"看穿"，UI 才改显示 `desc`（见 talent-reveal.js）。
     注意：真数值效果**从一开始就生效**，只是玩家看不见。
  -------------------------------------------------------- */

  bailianhua: {
    id: 'bailianhua', name: '白莲花', pool: '伪人', rarity: '宝', visibility: 'disguised',
    surfaceDesc: '温柔可亲，与同门和睦相处。',
    desc: '同队时暗中截留 25% 的掉落；被搜刮时还会挑拨旁人（其他弟子忠诚 -5）。',
    reveal: { type: 'searches', count: 2 },
    mods: { dropTheft: 0.25, confiscateSplashOthers: -5 },
  },

  lvcha: {
    id: 'lvcha', name: '绿茶', pool: '伪人', rarity: '灵', visibility: 'disguised',
    surfaceDesc: '搜刮她时损失较小，忠诚看起来总是偏高。',
    desc: '忠诚显示虚高 +20（实际并没有）；搜刮代价实为 ×1.5，且每月暗中离间同门（-1）。',
    reveal: { type: 'searches', count: 3 },
    mods: { searchLoyaltyMul: 1.5, othersLoyaltyPerMonth: -1, displayLoyaltyBonus: 20 },
  },

  shengmubiao: {
    id: 'shengmubiao', name: '圣母婊', pool: '伪人', rarity: '灵', visibility: 'disguised',
    surfaceDesc: '为宗门凝聚人心，全体忠诚回复 +2。',
    desc: '确实会凝聚人心，但每月暗耗宗门 40 灵石去"接济旁人"。',
    reveal: { type: 'cohab', months: 6, minLoyalty: 70 },
    mods: { sectLoyaltyRegen: 2, monthlyStonesCost: 40 },
  },

  edunvpei: {
    id: 'edunvpei', name: '恶毒女配', pool: '伪人', rarity: '宝', visibility: 'disguised',
    surfaceDesc: '战力 +15%。',
    desc: '战力 +15% 是真的，但同队时有 35% 概率背刺同门（在秘境中让一人陨落）。',
    reveal: { type: 'dispatches', count: 3 },
    mods: { combatMul: 1.15, teamBackstab: 0.35 },
  },

  weijunzi: {
    id: 'weijunzi', name: '伪君子', pool: '伪人', rarity: '宝', visibility: 'disguised',
    surfaceDesc: '德行高尚，从不私藏。',
    desc: '私藏概率是常人的 3 倍；被搜刮时还会让旁人齿冷（其他弟子忠诚 -4）。',
    reveal: { type: 'searches', count: 2 },
    mods: { hideChanceMul: 3, confiscateSplashOthers: -4 },
  },

  yinghou: {
    id: 'yinghou', name: '影后', pool: '伪人', rarity: '宝', visibility: 'disguised',
    surfaceDesc: '忠诚始终坚挺（永远显示 80 以上）。',
    desc: '忠诚只是"显示"得高，实际多少看不到；真被搜刮时代价是常人的 2 倍。',
    reveal: { type: 'dispatches', count: 5 },
    mods: { displayLoyaltyFloor: 80, searchLoyaltyMul: 2 },
  },

  shuangmianren: {
    id: 'shuangmianren', name: '双面人', pool: '伪人', rarity: '灵', visibility: 'disguised',
    surfaceDesc: '人缘极好，忠诚可靠。',
    desc: '每月暗中拉低其他弟子忠诚 3；一旦自己叛逃，会带走 2~3 名低忠诚弟子。',
    reveal: { type: 'cohab', months: 8, minLoyalty: 75 },
    mods: { othersLoyaltyPerMonth: -3, followerDefect: 3 },
  },

  gaomizhe: {
    id: 'gaomizhe', name: '告密者', pool: '伪人', rarity: '灵', visibility: 'disguised',
    surfaceDesc: '忠诚可靠，行事稳妥。',
    desc: '把秘境行踪卖给了外人：同队时秘境失踪率 +15%。',
    reveal: { type: 'dispatches', count: 4 },
    mods: { missingChanceAdd: 0.15 },
  },

  baiqiehei: {
    id: 'baiqiehei', name: '白切黑', pool: '伪人', rarity: '灵', visibility: 'disguised',
    surfaceDesc: '纯良无害，忠诚偏高。',
    desc: '忠诚一旦跌破 40 就会黑化，转化为「恶毒女配」。',
    reveal: { type: 'searches', count: 3 },
    mods: { darkenBelow: 40 },
  },

  heiqiebai: {
    id: 'heiqiebai', name: '黑切白', pool: '伪人', rarity: '灵', visibility: 'disguised',
    surfaceDesc: '看着心术不正，忠诚偏低。',
    desc: '其实可以被感化：每次出战有 20% 概率转化为「忠犬」。',
    reveal: { type: 'dispatches', count: 2 },
    mods: { enlightenChance: 0.20 },
  },
};

const TALENT_IDS = Object.keys(TALENTS);

function traitDef(id) { return TALENTS[id] || null; }
function traitName(id) { const t = TALENTS[id]; return t ? t.name : id; }

/* 该天赋对玩家是否可见：hidden 需已解锁；visible / disguised 直接可见 */
function traitVisible(d, id) {
  const t = TALENTS[id];
  if (!t) return false;
  if (t.visibility !== 'hidden') return true;
  return !!(d && Array.isArray(d.revealed) && d.revealed.includes(id));
}

/* 伪装天赋是否已被看穿（看穿后显示真实描述） */
function traitExposed(d, id) {
  return !!(d && Array.isArray(d.revealed) && d.revealed.includes(id));
}

/* UI 用：伪装天赋在看穿前只给"表面描述" */
function traitDesc(d, id) {
  const t = TALENTS[id];
  if (!t) return '';
  if (t.visibility === 'disguised' && !traitExposed(d, id)) return t.surfaceDesc || t.desc;
  return t.desc;
}

/* 用另一个天赋替换掉当前天赋（白切黑 → 恶毒女配；黑切白 → 忠犬） */
function replaceTrait(d, from, to) {
  if (!d || !Array.isArray(d.traits) || !TALENTS[to]) return false;
  const i = d.traits.indexOf(from);
  if (i < 0) return false;
  if (d.traits.includes(to)) d.traits.splice(i, 1);
  else d.traits[i] = to;
  return true;
}

/* 互斥检查：a 与 b 是否不能共存 */
function traitConflicts(a, b) {
  const ta = TALENTS[a], tb = TALENTS[b];
  if (!ta || !tb) return false;
  return (ta.conflicts || []).includes(b) || (tb.conflicts || []).includes(a);
}

function hasTrait(d, id) {
  return !!(d && Array.isArray(d.traits) && d.traits.includes(id));
}

/* 弟子当前忠诚（真实值，不看伪装天赋的显示值） */
function loyaltyValue(d) {
  return Math.max(0, Math.round(d && typeof d.loyalty === 'number' ? d.loyalty : 0));
}

/*
 * 命中的「分档忠诚」档位：从高到低取第一个 minLoyalty 达标的档。
 * 前提是这名弟子真的拥有该天赋 —— 否则返回 null（防止把别的天赋的档位表算到别人头上）。
 * tiers 结构见痴情（loyaltyTiers）。
 */
function traitLoyaltyTier(d, id) {
  if (!hasTrait(d, id)) return null;
  const t = TALENTS[id];
  const tiers = t ? t.loyaltyTiers : null;
  if (!Array.isArray(tiers) || !tiers.length) return null;
  const lv = loyaltyValue(d);
  for (const tier of tiers) {
    if (lv >= (tier.minLoyalty || 0)) return tier;
  }
  return tiers[tiers.length - 1];
}

/*
 * 该弟子「当前档位」的数值修正，供搜刮 / 月末结算直接取用。
 *   searchMul     搜刮忠诚损失倍率
 *   monthlyDrift  在基础忠诚回复之上的额外月度变化
 *   note          该档位的表现文本（日志 / UI 用）
 */
function traitLoyaltyMods(d, id) {
  const tier = traitLoyaltyTier(d, id);
  if (!tier) return null;
  return {
    searchMul: typeof tier.searchMul === 'number' ? tier.searchMul : 1,
    monthlyDrift: typeof tier.monthlyDrift === 'number' ? tier.monthlyDrift : 0,
    note: tier.note || '',
  };
}

/*
 * 叛逃钩子：天赋自带的"临走一脚"。
 * 目前只有痴情 —— 只要是因爱生恨自己走的（搜刮逼反 / 忠诚归零 / 月末叛逃），
 * 都要回头寻仇。返回效果描述符数组（纯数据，不碰 state / 事件队列），
 * 由 systems/defect-hooks.js 解释执行，避免 core 反向依赖 systems。
 */
function traitOnDefect(d) {
  const out = [];
  if (!d) return out;
  for (const id of (d.traits || [])) {
    const t = TALENTS[id];
    if (!t || typeof t.onDefect !== 'function') continue;
    const eff = t.onDefect(d);
    if (eff) out.push(Object.assign({ trait: id }, eff));
  }
  return out;
}

/* 运行时摘掉一个天赋（寻宝鼠受伤后灵鼠跑掉）。返回是否真的摘掉了。 */
function dropTrait(d, id) {
  if (!d || !Array.isArray(d.traits)) return false;
  const i = d.traits.indexOf(id);
  if (i < 0) return false;
  d.traits.splice(i, 1);
  if (Array.isArray(d.revealed)) d.revealed = d.revealed.filter(x => x !== id);
  return true;
}

/*
 * 隐藏天赋抽取权重倍率。默认 1（不打折）—— 稀有度权重本身已经让仙/宝很稀有，
 * 再打折会让隐藏天赋在整局里几乎抽不到，失去"发现"的乐趣。
 * 想让它更神秘就往 0.5 调。
 */
const HIDDEN_WEIGHT_MUL = 1;

/*
 * 伪装（伪人池）抽取权重倍率。
 * 伪人条目多（10 条）且稀有度不低，不打折会变成"每三个弟子一个戏精"。
 * 实测：不打折 ≈ 40%；0.25 ≈ 15.7% 的弟子；0.12 ≈ 8% —— 落在设计文档
 * 「中度戏剧 5%~8%」的上沿，即大约 1/12 的弟子是伪人。
 */
const DISGUISED_WEIGHT_MUL = 0.12;

/* 抽一套天赋：保底 1 个，35% 概率再抽 1 个；按稀有度加权，且遵守互斥 */
function rollTraits() {
  const count = Math.random() < 0.35 ? 2 : 1;
  const chosen = [];
  const pool = TALENT_IDS.slice();
  for (let i = 0; i < count && pool.length; i++) {
    const cands = pool
      .filter(id => !chosen.some(cid => traitConflicts(cid, id)))
      .map(id => {
        const t = TALENTS[id];
        const base = TALENT_RARITY_W[t.rarity] || 1;
        let w = base;
        if (t.visibility === 'hidden') w *= HIDDEN_WEIGHT_MUL;
        if (t.visibility === 'disguised') w *= DISGUISED_WEIGHT_MUL;
        return { id, w };
      });
    if (!cands.length) break;
    const picked = weightedPick(cands);
    chosen.push(picked.id);
    pool.splice(pool.indexOf(picked.id), 1);
  }

  /* 伪灵根：更容易"实际藏着"一个隐藏天赋（封印的天灵根 / 天命之子） */
  const wei = TALENTS.weilinggen;
  if (wei && chosen.includes('weilinggen')
      && !chosen.some(id => TALENTS[id] && TALENTS[id].visibility === 'hidden')
      && Math.random() < (wei.bonusHiddenChance || 0)) {
    const hiddenPool = TALENT_IDS.filter(id =>
      TALENTS[id].visibility === 'hidden'
      && !chosen.includes(id)
      && !chosen.some(c => traitConflicts(c, id)));
    if (hiddenPool.length) {
      chosen.push(weightedPick(hiddenPool.map(id => ({ id, w: TALENT_RARITY_W[TALENTS[id].rarity] || 1 }))).id);
    }
  }
  return chosen;
}

export {
  TALENTS, TALENT_IDS, TALENT_RARITY_COLORS, TALENT_RARITY_W,
  HIDDEN_WEIGHT_MUL, DISGUISED_WEIGHT_MUL,
  traitDef, traitName, traitVisible, traitExposed, traitDesc, traitConflicts,
  hasTrait, dropTrait, replaceTrait, rollTraits,
  loyaltyValue, traitLoyaltyTier, traitLoyaltyMods, traitOnDefect,
};
