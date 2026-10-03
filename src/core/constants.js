/* ==========================================================================
 * constants.js — 数据
 * ========================================================================== */
const MAX_DUNGEON_RUNS = 2;          /* 每名弟子每月可出战次数 */
const MAX_DUNGEON_CLEARS = 2;        /* 每个秘境每月可被探索次数 */
const REALMS = ['练气', '筑基', '金丹', '元婴', '出窍', '化神', '合体', '渡劫', '大乘'];
const REALM_POWER  = [15, 60, 200, 700, 2400, 8400, 29000, 100000, 350000];
const BREAKTHROUGH = [30, 80, 200, 500, 1250, 3000, 7500, 18000];
const REALM_COLORS = [
  '#6fbf9a', '#5a9fe0', '#d4a843', '#b06fe0', '#e05555',
  '#8fd45f', '#4aadd0', '#e08a4a', '#d4d4e0',
];
const RARITIES = ['凡品', '黄品', '灵品', '玄品', '地品', '天品', '仙品'];
const RARITY_COLORS = {
  '凡品': '#8a8aa0', '黄品': '#9a8f6a', '灵品': '#5fb85f', '玄品': '#5a9fe0',
  '地品': '#d4a843', '天品': '#b06fe0', '仙品': '#e05fa0',
};
/*
 * 境界限制（realmLimit）：物品只能被「境界 >= 该值」的弟子装备 / 修习。
 * 表按 RARITIES 顺序一一对应，是**唯一口径** —— 想调整某品级的门槛只改这里。
 *   凡/黄品 → 练气(0)      灵品 → 筑基(1)    玄品 → 金丹(2)
 *   地品    → 元婴(3)      天品 → 化神(5)    仙品 → 渡劫(7)
 * 注意天品跨度较大（元婴~合体），这是有意的：天品是中期到后期的通用高档，
 * 仙品才是大后期专属目标。这里只是「品级默认门槛」，具体物品可以在掉落表里
 * 用 realmLimit 单独放宽/收紧（例如紫霄天阙的仙品设成 6，让合体弟子立刻能穿）。
 */
const RARITY_REALM_LIMIT = {
  '凡品': 0, '黄品': 0, '灵品': 1, '玄品': 2, '地品': 3, '天品': 5, '仙品': 7,
};
const TYPE_COLORS = {
  '材料': '#6fbf9a', '灵石': '#5a9fe0', '丹药': '#5fb85f',
  '武器': '#d4a843', '法宝': '#b06fe0', '功法': '#e08a4a'
};
const SURNAMES = ['李','王','张','刘','陈','赵','林','苏','沈','萧','叶','慕容','顾','白','韩','周','吴','郑','秦','许'];
const GIVEN = ['青云','无痕','子墨','星河','雨柔','雪见','无涯','长风','惊鸿','照影','明轩','清瑶','墨白','孤鸿','若水','听风','望舒','昭明','青玄','凌霄'];

/*
 * 秘境难度阶梯 —— 对齐弟子可出战境界（宗主-2）。
 * realmTarget = 该秘境「面向的弟子境界」，物品的 realmLimit 由它反推（见 core/items.js）：
 *   物品门槛 = 秘境面向境界 - 掉落档位（同档 0，低一档 -1…最少不低于 0）
 * 这样低境界秘境稳定产出低门槛材料，玩家突破永远不会被卡死。
 *
 *   秘境                面向弟子      难度     主要掉落
 *   青云洞天            练气(0)       40       凡品/黄品/灵品
 *   万骨窟              筑基(1)       130      黄品/灵品/玄品
 *   太虚遗迹            金丹(2)       450      灵品/玄品/地品
 *   幽冥血海            元婴(3)       1600     玄品/地品/天品
 *   九幽炼狱            出窍(4)       5500     玄品/地品/天品
 *   太初混沌            化神(5)       19000    地品/天品/仙品
 *   紫霄天阙            合体(6)       65000    天品/仙品
 *
 * 数值口径：装备/功法 bonus ≈ value × 系数（武器1.2 / 法宝1.1 / 功法1.0），
 * 每档价值约 ×4，保证高境界弟子拿到对应档位才有明显提升。
 */
const DUNGEONS = [
  /* ---- 1. 练气弟子 ---- */
  { id:'qingyun', name:'青云洞天', difficulty:40, realmTarget:0, desc:'灵气充沛的低阶秘境。',
    loot:[
      { name:'青灵草',   type:'材料', rarity:'凡品', refine:3,   value:2,   w:26 },
      { name:'下品灵石', type:'灵石', rarity:'凡品', refine:5,   value:3,   w:26 },
      { name:'黄芽草',   type:'材料', rarity:'黄品', refine:8,   value:5,   w:18 },
      { name:'聚气丹',   type:'丹药', rarity:'灵品', refine:9,   value:7,   w:16 },
      { name:'吐纳诀',   type:'功法', rarity:'黄品', refine:18,  value:30,  w:12, realmLimit:0 },
      { name:'青锋剑',   type:'武器', rarity:'灵品', refine:12,  value:10,  w:12, tags:['剑道'], realmLimit:0 },
    ]},

  /* ---- 2. 筑基弟子 ---- */
  { id:'wangu', name:'万骨窟', difficulty:130, realmTarget:1, desc:'阴气森森的凶险之地。',
    loot:[
      { name:'骨灵花',   type:'材料', rarity:'黄品', refine:10,  value:6,   w:18 },
      { name:'中品灵石', type:'灵石', rarity:'灵品', refine:15,  value:10,  w:24 },
      { name:'凝元丹',   type:'丹药', rarity:'灵品', refine:28,  value:22,  w:22 },
      { name:'白骨幡',   type:'法宝', rarity:'灵品', refine:35,  value:30,  w:15, realmLimit:0 },
      { name:'龙骨剑',   type:'武器', rarity:'玄品', refine:55,  value:45,  w:13, tags:['剑道'], realmLimit:1 },
      { name:'万骨真经', type:'功法', rarity:'玄品', refine:70,  value:75,  w:8,  realmLimit:1 },
    ]},

  /* ---- 3. 金丹弟子 ---- */
  { id:'taixu', name:'太虚遗迹', difficulty:450, realmTarget:2, desc:'上古大能陨落之所。',
    loot:[
      { name:'太虚石',   type:'材料', rarity:'灵品', refine:30,  value:15,  w:18 },
      { name:'上品灵石', type:'灵石', rarity:'灵品', refine:45,  value:25,  w:18 },
      { name:'九转金丹', type:'丹药', rarity:'玄品', refine:90,  value:70,  w:22 },
      { name:'太虚剑',   type:'武器', rarity:'玄品', refine:120, value:100, w:22, tags:['剑道'], realmLimit:1 },
      { name:'太虚道经', type:'功法', rarity:'玄品', refine:250, value:130, w:15, realmLimit:1 },
      { name:'混沌珠',   type:'法宝', rarity:'地品', refine:400, value:320, w:5,  realmLimit:2 },
    ]},

  /* ---- 4. 元婴弟子 ---- */
  { id:'xuehai', name:'幽冥血海', difficulty:1600, realmTarget:3, desc:'血雾弥漫的远古战场。',
    loot:[
      { name:'血莲',     type:'材料', rarity:'玄品', refine:80,  value:60,  w:20 },
      { name:'血魄石',   type:'材料', rarity:'玄品', refine:100, value:75,  w:18 },
      { name:'幽冥丹',   type:'丹药', rarity:'地品', refine:130, value:95,  w:17 },
      { name:'血魔刀',   type:'武器', rarity:'地品', refine:180, value:130, w:20, realmLimit:2 },
      { name:'幽冥鬼幡', type:'法宝', rarity:'地品', refine:220, value:160, w:15, realmLimit:2 },
      { name:'血海真经', type:'功法', rarity:'天品', refine:350, value:260, w:10, realmLimit:3 },
    ]},

  /* ---- 5. 出窍弟子 ---- */
  { id:'jiuyou', name:'九幽炼狱', difficulty:5500, realmTarget:4, desc:'烈焰与寒渊交织的炼狱。',
    loot:[
      { name:'九幽寒铁', type:'材料', rarity:'地品', refine:200, value:150, w:20 },
      { name:'炼狱火种', type:'材料', rarity:'地品', refine:250, value:185, w:18 },
      { name:'九幽魂丹', type:'丹药', rarity:'地品', refine:320, value:235, w:18 },
      { name:'炼狱魔剑', type:'武器', rarity:'天品', refine:500, value:380, w:22, tags:['剑道'], realmLimit:4 },
      { name:'九幽宝典', type:'功法', rarity:'天品', refine:650, value:500, w:20, realmLimit:4 },
    ]},

  /* ---- 6. 化神弟子 ---- */
  { id:'chaos', name:'太初混沌', difficulty:19000, realmTarget:5, desc:'天地未开时的混沌残迹。',
    loot:[
      { name:'混沌石',   type:'材料', rarity:'地品', refine:500,  value:400,  w:15 },
      { name:'太初之气', type:'材料', rarity:'天品', refine:800,  value:600,  w:22 },
      { name:'混沌金丹', type:'丹药', rarity:'天品', refine:1000, value:750,  w:20 },
      { name:'混沌灵剑', type:'武器', rarity:'天品', refine:1500, value:1100, w:23, tags:['剑道'], realmLimit:5 },
      { name:'太初道经', type:'功法', rarity:'天品', refine:2000, value:1500, w:20, realmLimit:5 },
    ]},

  /* ---- 7. 合体弟子（唯一产出仙品的秘境；仙品需渡劫，正好是下一步目标） ---- */
  { id:'zixiao', name:'紫霄天阙', difficulty:65000, realmTarget:6, desc:'九天之上，紫霄为尊。',
    loot:[
      { name:'紫霄神石', type:'材料', rarity:'天品', refine:2000, value:1500, w:24 },
      { name:'紫霄雷精', type:'材料', rarity:'仙品', refine:3000, value:2200, w:22 },
      { name:'紫霄仙丹', type:'丹药', rarity:'仙品', refine:4000, value:3000, w:20 },
      { name:'紫霄神剑', type:'武器', rarity:'仙品', refine:6000, value:5800, w:18, tags:['剑道'], realmLimit:6 },
      { name:'紫霄仙幡', type:'法宝', rarity:'仙品', refine:5600, value:5200, w:15, realmLimit:6 },
      { name:'紫霄天书', type:'功法', rarity:'仙品', refine:8000, value:7000, w:12, realmLimit:6 },
    ]},
];

/*
 * 宗主突破配方 —— 材料稀有度与「该境界可打的秘境产出」严格对齐（见 DUNGEONS 表）：
 *   2→3 灵品/玄品          太虚遗迹（金丹弟子）就能凑齐
 *   3→4 玄品/地品          幽冥血海
 *   4→5 地品/天品          九幽炼狱
 *   5→6 天品               太初混沌
 *   6→7 天品/仙品          紫霄天阙首次产出仙品
 *   7→8 仙品               大后期目标：只有紫霄天阙产仙品
 */
const MASTER_BREAKTHROUGH = [
  /* 保留前两条以兼容“宗主从练气起步”的调试选项，若确定不用可删 */
  { from: 0, to: 1, stones: 150,    materials: [ { rarity: '凡品', count: 3 } ] },
  { from: 1, to: 2, stones: 300,    materials: [ { rarity: '黄品', count: 3 }, { rarity: '灵品', count: 2 } ] },

  /* 开局实际起点：宗主金丹(2) */
  { from: 2, to: 3, stones: 500,    materials: [ { rarity: '灵品', count: 5 }, { rarity: '玄品', count: 1 } ] },
  { from: 3, to: 4, stones: 1500,   materials: [ { rarity: '玄品', count: 5 }, { rarity: '地品', count: 2 } ] },
  { from: 4, to: 5, stones: 5000,   materials: [ { rarity: '地品', count: 6 }, { rarity: '天品', count: 2 } ] },
  { from: 5, to: 6, stones: 18000,  materials: [ { rarity: '天品', count: 6 } ] },
  { from: 6, to: 7, stones: 60000,  materials: [ { rarity: '天品', count: 8 }, { rarity: '仙品', count: 1 } ] },
  { from: 7, to: 8, stones: 200000, materials: [ { rarity: '仙品', count: 5 } ] },
];

/* 弟子突破材料表：索引 = 弟子当前境界，长度 8。比宗主少一档。 */
const DISCIPLE_BREAKTHROUGH_MATERIALS = [
  [ { rarity: '凡品', count: 1 } ],                                // 0→1 练气→筑基
  [ { rarity: '黄品', count: 2 } ],                                // 1→2 筑基→金丹
  [ { rarity: '灵品', count: 2 } ],                                // 2→3 金丹→元婴
  [ { rarity: '玄品', count: 2 } ],                                // 3→4 元婴→出窍
  [ { rarity: '地品', count: 2 }, { rarity: '天品', count: 1 } ],  // 4→5 出窍→化神
  [ { rarity: '天品', count: 3 } ],                                // 5→6 化神→合体
  [ { rarity: '天品', count: 4 }, { rarity: '仙品', count: 1 } ],  // 6→7 合体→渡劫
  [ { rarity: '仙品', count: 3 } ],                                // 7→8 渡劫→大乘
];

/* 绝境突破：秘境中惨胜/大败时，个人处于险境及以下的弟子有概率直接突破。
   概率 = talent × DESPERATE_BREAKTHROUGH_CHANCE */
const DESPERATE_BREAKTHROUGH_CHANCE = 0.015;

/*
 * 装备栏 / 功法栏（Phase 1：武器 + 法宝；防具/饰品留 Phase 2）
 * accepts 表示该槽能放哪些 type 的物品。
 */
const SLOT_DEFS = [
  { key: 'weapon',   label: '武器', accepts: ['武器'] },
  { key: 'artifact', label: '法宝', accepts: ['法宝'] },
];
const TECHNIQUE_TYPE = '功法';
/* 战力加成系数：bonus = floor(value * 系数)。武器沿用现有 value*1.2。 */
const BONUS_FACTOR = { '武器': 1.2, '法宝': 1.1, '功法': 1.0 };
/* 藏匿等级：越稀有越难藏。老祖境界 >= 该值即可看穿私藏。与 RARITIES 顺序一一对应。 */
const RARITY_SECRECY = { '凡品': 1, '黄品': 2, '灵品': 3, '玄品': 4, '地品': 5, '天品': 6, '仙品': 7 };
const TECHNIQUE_SLOT_MAX = 3;

/* ==========================================================================
 * 长老机制（阶段四）
 *
 * 定位：长老 = 弟子 + 管理者标签（见《长老机制_实施方案.md》第 3 章）。
 * 弟子侧字段（pool / elder / elderId / scavenge / cruise）在 core/state.js，
 * 弟子池归属的语义：
 *   pool = 'direct' 进主界面「宗门弟子」栏，玩家手动操心
 *   pool = 'elder'  不进主界面，只在「长老」Tab 按长老归组显示
 *   pool = 'idle'   预留（本轮无逻辑），未知值一律按 'direct' 兜底
 * 长老本人：elder = true 且 pool = 'direct'（他既是管理者，也是玩家要操心的弟子）。
 * ========================================================================== */

const ELDER_LIMIT = 4;                 /* 长老人数上限 */
const ELDER_MAX_MEMBERS = 6;           /* 每位长老名下弟子上限 */
const ELDER_DEFAULT_SHARE = 0.30;      /* 长老默认自留比例 */
const ELDER_SELF_KEEP_CAP = 0.50;      /* 自留比例硬上限（防止天赋叠加出怪物） */

/*
 * 搜刮策略（文档 4.4）：
 *   mul        忠诚损失倍率（再乘在现有公式之外，见 systems/inventory.js）
 *   pick       「非免罚物品」按价值降序的取用比例
 *   valueCap   只拿价值不超过此值的物品（温和）
 *   exemptOnly 只拿免罚物品（弟子用不上的 / 次级装备 / 灵石）
 */
const SCAVENGE_STRATEGIES = {
  gentle:     { label: '温和',     mul: 0.5, pick: 0.00, valueCap: 30 },
  balanced:   { label: '平衡',     mul: 1.0, pick: 0.50 },
  aggressive: { label: '激进',     mul: 1.5, pick: 0.80 },
  tribute:    { label: '只拿上缴', mul: 0.0, pick: 0.00, exemptOnly: true },
};

/*
 * 进本策略（文档 4.2）。
 *
 * 四种策略的差别**同时**体现在两处，缺一不可：
 *   minRatio  挑哪个本：队伍战力 / 秘境难度 的最低门槛
 *   maxRuns   派几次：null = ceil(门下人数 / 3)，数字 = 每月硬上限
 *   fullTeam  true = 凑不满 3 人就不派（不拿一两个人去冒险）
 *
 * 「安全第一」之所以要限次数而不是只抬门槛：门槛抬到 1.5 之后，能满足它的
 * 低阶秘境反而更多、更容易刷，实测跑的次数比「平均轮换」还多（18 次 vs 16 次），
 * 而"多打"本身就是折损来源 —— 结果折损反而更高（3 人 vs 2 人）。
 * 所以它必须是"少冒险 + 少派人"两条一起，才符合文档 4.2 表格里"保命"的意图。
 */
const CRUISE_STRATEGIES = {
  rotate: { label: '平均轮换', minRatio: 1.0, maxRuns: null, fullTeam: false },
  elite:  { label: '精英优先', minRatio: 1.0, maxRuns: null, fullTeam: false },
  safe:   { label: '安全第一', minRatio: 1.5, maxRuns: 1,    fullTeam: true },
  risky:  { label: '激进冒险', minRatio: 0.6, maxRuns: null, fullTeam: false },
};

const ELDER_SCAVENGE_MAX_PER_DISCIPLE = 3;   /* 每人每月被长老搜刮的件数上限 */
const ELDER_SCAVENGE_MAX_PER_ELDER = 12;     /* 每位长老每月上缴的件数上限 */
const ELDER_REPORT_KEEP = 12;                /* 月报保留条数 */
/*
 * 搜刮忠诚保护线：忠诚已低于此值的弟子，长老本月不再搜刮他。
 *
 * 为什么需要它：叛逃判定是忠诚 < 20（monthly.phaseDesert）与忠诚归零
 * （inventory.purgeRunaway）。长老是**自动**搜刮的，玩家没有逐次决策的机会；
 * 若不加这条线，一个高价值物品集中、又恰好每次都被挑中的弟子会被反复搜刮，
 * 在玩家毫无察觉的情况下被逼到叛逃 —— 那等于机制替玩家做了他没做的决定。
 * 设成 0 即可关闭（恢复"完全按策略搜刮"的行为）。
 */
const ELDER_SCAVENGE_LOYALTY_FLOOR = 25;

/*
 * 搜刮对象的挑选顺序（每月额度有限，先动谁决定了代价落在谁头上）：
 *   'loyalty' 忠诚从高到低 —— 优先动扛得住的人，把代价摊平（默认）
 *   'roster'  按名册顺序 —— 早期行为，谁排在前面谁倒霉
 * 可在调试面板里实时切换，用来体感两者的差别。
 */
const ELDER_SCAVENGE_ORDER = 'loyalty';

/*
 * 长老安抚（送礼）。
 *
 * 起因：单纯"按忠诚高低挑搜刮对象"解决不了代管池被**均匀**薅薄的问题 ——
 * 默认「平衡」策略下每人才拿 2 件，6 人 ×2 正好等于每月额度上限 12，
 * 人人有份，排序根本无从体现（实测对照臂数值完全一致）。
 * 所以再加一层：搜刮把谁的忠诚压到 ELDER_APPEASE_BELOW 以下，
 * 长老就从**自己自留的东西**里挑一件还回去，把忠诚补一点回来。
 *
 * 这条设计的自平衡性来自"自留比例"：
 *   激进（自留多）→ 掉忠诚多，但手上有货可送 → 能安抚
 *   只拿上缴（自留 0）→ 本来就不掉忠诚 → 也不需要安抚
 * 代价是长老自己的成长变慢（送出去的正是他要拿来修炼的东西）。
 */
const ELDER_APPEASE_BELOW = 40;          /* 被搜刮后忠诚低于此值 → 触发安抚 */
const ELDER_APPEASE_MAX_PER_MONTH = 2;   /* 每位长老每月最多安抚几人 */

/*
 * 秘境额度：已确认与玩家共用（S.dungeonRuns / MAX_DUNGEON_CLEARS）。
 * 共用时长老对单个秘境最多用掉 ELDER_MAX_CLEARS_PER_DUNGEON 次，
 * 保证玩家永远至少还有 1 次可打 —— 即"玩家优先，长老只吃剩饭"。
 *
 * 注意：**长老之间会互相抢这份额度**（每个秘境每月只剩 1 个长老名额）。
 * 这是有意为之，不是缺陷：后续计划让长老把"本月想打哪个本"作为**申请**
 * 提交给玩家定夺，玩家批给谁就成了派系斗争的导火索。
 * 在那之前，若只想先观察纯净的资源循环，可以把下面的开关改成 false：
 * 长老改用独立额度池 S.elderRuns（phaseBegin 每月重置），
 * 改动面只有这个常量与 systems/elder.js 里的两个额度助手。
 */
const ELDER_SHARES_DUNGEON_QUOTA = true;
const ELDER_MAX_CLEARS_PER_DUNGEON = 1;

/* ==========================================================================
 * 灵根（阶段二）
 * 说明：只做「五行向量 + 纯度 → 修炼速度」。相生/克制/五行机关需要元素战斗
 *       系统，当前战斗只是 powerOf() 求和，暂不实装（见整理版 ⚠C7）。
 * ========================================================================== */
const ELEMENTS = ['金', '木', '水', '火', '土'];
/* 档位权重：tier = 灵根条数（1=单灵根最强）。单灵根 3% 稀有。 */
const ROOT_TIER_WEIGHTS = [
  { tier: 5, w: 40 },
  { tier: 4, w: 25 },
  { tier: 3, w: 20 },
  { tier: 2, w: 12 },
  { tier: 1, w: 3 },
];
const ROOT_TIER_NAMES = { 1: '单灵根', 2: '双灵根', 3: '三灵根', 4: '四灵根', 5: '五灵根' };
/* 招募价格倍率：灵根越好越贵（否则永远只买最好的那档） */
const ROOT_COST_MUL = { 1: 3.0, 2: 2.0, 3: 1.4, 4: 1.1, 5: 1.0 };
const ROOT_TIER_COLORS = {
  1: '#b06fe0', 2: '#5a9fe0', 3: '#6fbf9a', 4: '#8a8aa0', 5: '#6a6a80',
};

export { REALMS, REALM_POWER, BREAKTHROUGH, REALM_COLORS, RARITIES, RARITY_COLORS, RARITY_REALM_LIMIT, TYPE_COLORS, SURNAMES, GIVEN, DUNGEONS, MAX_DUNGEON_RUNS, MAX_DUNGEON_CLEARS, MASTER_BREAKTHROUGH, DISCIPLE_BREAKTHROUGH_MATERIALS, DESPERATE_BREAKTHROUGH_CHANCE, SLOT_DEFS, TECHNIQUE_TYPE, BONUS_FACTOR, RARITY_SECRECY, TECHNIQUE_SLOT_MAX, ELEMENTS, ROOT_TIER_WEIGHTS, ROOT_TIER_NAMES, ROOT_COST_MUL, ROOT_TIER_COLORS, ELDER_LIMIT, ELDER_MAX_MEMBERS, ELDER_DEFAULT_SHARE, ELDER_SELF_KEEP_CAP, SCAVENGE_STRATEGIES, CRUISE_STRATEGIES, ELDER_SCAVENGE_MAX_PER_DISCIPLE, ELDER_SCAVENGE_MAX_PER_ELDER, ELDER_REPORT_KEEP, ELDER_SCAVENGE_LOYALTY_FLOOR, ELDER_SCAVENGE_ORDER, ELDER_APPEASE_BELOW, ELDER_APPEASE_MAX_PER_MONTH, ELDER_SHARES_DUNGEON_QUOTA, ELDER_MAX_CLEARS_PER_DUNGEON };