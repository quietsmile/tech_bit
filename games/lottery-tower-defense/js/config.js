/* ============================================================
 * 炫酷抽奖塔防 · 数值配置表（平衡设计的唯一数据源）
 * ============================================================ */
const CONFIG = {
  spinCost: 10,          // 单次抽奖消耗
  startCoins: 120,       // 开局金币
  maxLevel: 10,          // 抽奖等级上限
  waveInterval: 8,       // 每波野怪间隔（秒）
  unitDeployMinX: 240,
  unitDeployMaxX: 700,

  // 抽奖等级 lv -> 升到 lv+1 的费用
  levelUpCost(lv) { return 60 + lv * 40; },

  tierNames:  ['普通', '稀有', '史诗', '传说'],
  tierColors: ['#9aa5b1', '#3fa7ff', '#c04cff', '#ffb020'],

  // 抽奖等级 1~10 对应 [普通, 稀有, 史诗, 传说] 概率
  tierProb: [
    [0.56, 0.30, 0.11, 0.03],
    [0.52, 0.31, 0.13, 0.04],
    [0.48, 0.32, 0.15, 0.05],
    [0.44, 0.33, 0.17, 0.06],
    [0.40, 0.33, 0.19, 0.08],
    [0.36, 0.34, 0.21, 0.09],
    [0.33, 0.34, 0.23, 0.10],
    [0.31, 0.34, 0.24, 0.11],
    [0.29, 0.34, 0.25, 0.12],
    [0.27, 0.34, 0.26, 0.13],
  ],

  // 奖池：0普通 / 1稀有 / 2史诗 / 3传说（每个等级含 1 个士兵 + 1 个武器）
  items: {
    0: [
      { name: '民兵',       kind: 'soldier', dps: 8,   range: 120, sell: 20 },
      { name: '石弹投石机', kind: 'weapon',  dps: 13,  range: 160, sell: 30 },
    ],
    1: [
      { name: '精灵弓箭手', kind: 'soldier', dps: 20,  range: 150, sell: 55 },
      { name: '连弩炮塔',   kind: 'weapon',  dps: 32,  range: 190, sell: 70 },
    ],
    2: [
      { name: '圣殿骑士',   kind: 'soldier', dps: 48,  range: 130, sell: 120 },
      { name: '奥术火炮',   kind: 'weapon',  dps: 70,  range: 210, sell: 160 },
    ],
    3: [
      { name: '龙骑士',     kind: 'soldier', dps: 95,  range: 160, sell: 260 },
      { name: '毁灭光棱塔', kind: 'weapon',  dps: 140, range: 240, sell: 320 },
    ],
  },

  // 野怪图鉴（hp 为基础值，随波次成长）
  monsters: {
    slime:    { name: '史莱姆',   hp: 30,  speed: 38, reward: 8,  r: 14 },
    bat:      { name: '暗影蝠',   hp: 22,  speed: 66, reward: 7,  r: 11 },
    orc:      { name: '兽人兵',   hp: 90,  speed: 30, reward: 14, r: 17 },
    gargoyle: { name: '石像鬼',   hp: 190, speed: 26, reward: 22, r: 19 },
    boss:     { name: '深渊魔王', hp: 700, speed: 20, reward: 60, r: 30 },
  },
  hpScalePerWave: 0.18,   // 每波野怪生命成长系数
  escapePenaltyCoins: 0,  // 野怪逃脱（仅统计，不扣分）

  // 抽奖转盘 12 个扇区对应的奖品等级（5 普通 / 5 稀有 / 1 史诗 / 1 传说）
  wheelSegments: [0, 1, 0, 1, 3, 0, 1, 2, 0, 1, 0, 1],
};

/* 按抽奖等级随机抽取奖品等级（rng 可注入，便于自动测试） */
function pickTier(level, rng) {
  const rand = rng || Math.random;
  const probs = CONFIG.tierProb[Math.min(Math.max(level, 1), CONFIG.maxLevel) - 1];
  let r = rand();
  for (let i = 0; i < probs.length; i++) {
    if (r < probs[i]) return i;
    r -= probs[i];
  }
  return probs.length - 1;
}

/* 从某等级奖池随机抽一件道具 */
function pickItem(tier, rng) {
  const rand = rng || Math.random;
  const pool = CONFIG.items[tier];
  return { ...pool[Math.floor(rand() * pool.length) % pool.length] };
}

/* 排名比较：击杀数优先，总伤害次之，金币保底 */
function rankCompare(a, b) {
  if (b.kills !== a.kills) return b.kills - a.kills;
  if (b.damage !== a.damage) return b.damage - a.damage;
  return b.coins - a.coins;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, pickTier, pickItem, rankCompare };
}
