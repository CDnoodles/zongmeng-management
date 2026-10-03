/* ==========================================================================
 * auto-behavior.js — 月末自动行为
 * 顺序：炼化材料/丹药 → 自动装备升级 → 尝试突破
 * ========================================================================== */
import { addLog } from '../core/log.js';
import { tryBreakthrough } from './breakthrough.js';
import { techniqueSlots, canUseItem } from '../core/items.js';

/* 1. 炼化材料与丹药 → 修为 */
function autoRefine(d) {
  let gained = 0;
  for (const it of [...d.backpack]) {
    if (it.hidden) continue;
    if (it.type !== '材料' && it.type !== '丹药') continue;
    d.cultivation += it.value || 0;
    gained += it.value || 0;
    const idx = d.backpack.indexOf(it);
    if (idx >= 0) d.backpack.splice(idx, 1);
  }
  if (gained > 0) {
    addLog(`${d.name} 自行炼化背包材料，修为 +${gained}。`, 'good');
  }
}

/* 2. 自动装备升级：只看 bonus，高的换低的。
   境界限制（realmLimit）在这里同样生效 —— 弟子不会去穿自己驾驭不了的东西，
   否则"月末自动装备"会成为绕过境界限制的后门。 */
function autoEquip(d) {
  repairIllegalEquips(d);
  autoSwapSlot(d, 'weapon', '武器', '换上了');
  autoSwapSlot(d, 'artifact', '法宝', '祭起了');
  autoLearnTechniques(d);
}

/*
 * 回填/修正：旧存档可能已经让低境界弟子穿上了高境界装备
 * （改版前没有 realmLimit 这道闸）。这里把"现在不合规"的物品退回背包，
 * 战力立刻回落到正确值，不需要玩家手动脱。
 */
function repairIllegalEquips(d) {
  const eq = d.equipment;
  if (eq) {
    for (const key of ['weapon', 'artifact']) {
      const it = eq[key];
      if (it && !canUseItem(d, it).ok) {
        eq[key] = null;
        d.backpack.push(it);
        addLog(`⚖ ${d.name} 的境界已不足以驾驭【${it.name}】，此物自动退回背包。`, 'warn');
      }
    }
  }
  if (Array.isArray(d.techniques)) {
    for (const it of [...d.techniques]) {
      if (!canUseItem(d, it).ok) {
        d.techniques.splice(d.techniques.indexOf(it), 1);
        d.backpack.push(it);
        addLog(`⚖ ${d.name} 的境界已不足以参悟【${it.name}】，此功法被搁下了。`, 'warn');
      }
    }
  }
}

/* 弟子当前能用的物品（境界够 + 未私藏） */
function usableCandidates(d, typeName) {
  return d.backpack
    .filter(it => !it.hidden && it.type === typeName && canUseItem(d, it).ok)
    .sort((a, b) => b.bonus - a.bonus);
}

function autoSwapSlot(d, slotKey, typeName, verbText) {
  const candidates = usableCandidates(d, typeName);

  for (const it of candidates) {
    const cur = d.equipment[slotKey];
    if (cur && cur.bonus >= it.bonus) continue;
    if (cur) d.backpack.push(cur);
    d.equipment[slotKey] = it;
    const idx = d.backpack.indexOf(it);
    if (idx >= 0) d.backpack.splice(idx, 1);
    addLog(`${d.name} 自行${verbText}【${it.name}】（战力 +${it.bonus}）。`, 'good');
    return;   // 一次只换一件，避免同批互相挤下
  }
}

function autoLearnTechniques(d) {
  const slots = techniqueSlots(d);
  const candidates = usableCandidates(d, '功法');

  for (const it of candidates) {
    if (d.techniques.length < slots) {
      d.techniques.push(it);
      const idx = d.backpack.indexOf(it);
      if (idx >= 0) d.backpack.splice(idx, 1);
      addLog(`${d.name} 自行修习了【${it.name}】（战力 +${it.bonus}）。`, 'good');
    } else {
      const worst = d.techniques.reduce((a, b) => a.bonus < b.bonus ? a : b);
      if (it.bonus > worst.bonus) {
        d.techniques.splice(d.techniques.indexOf(worst), 1);
        d.backpack.push(worst);
        d.techniques.push(it);
        const idx = d.backpack.indexOf(it);
        if (idx >= 0) d.backpack.splice(idx, 1);
        addLog(`${d.name} 自行修习了【${it.name}】，放下【${worst.name}】。`, 'good');
      }
    }
  }
}

/* 3. 尝试突破（材料够就升，不够就卡住） */
function autoBreakthrough(d) {
  tryBreakthrough(d);
}

function runAutoBehavior(d) {
  autoRefine(d);
  autoEquip(d);
  autoBreakthrough(d);
}

export { runAutoBehavior };
