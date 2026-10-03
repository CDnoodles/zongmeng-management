/* ==========================================================================
 * hooks.js — 钩子分发（阶段一只有骨架：注册表为空 = no-op）
 *
 * 目的：把「扩展点」提前留在月末管线 / 秘境 / 没收 / 突破 等位置，
 *       阶段三的天赋系统只需注册钩子，不必再回头改那些文件。
 *
 * 约定：
 * - ctx 是普通对象，原地传给每个钩子，钩子可往 ctx 里写结果（如 mods）
 * - 钩子抛错不打断主流程（钩子是增强，不是主逻辑）
 * ========================================================================== */

const registry = new Map();

function on(name, fn) {
  if (typeof fn !== 'function') return;
  if (!registry.has(name)) registry.set(name, []);
  registry.get(name).push(fn);
}

function runHook(name, ctx) {
  const list = registry.get(name);
  if (!list || !list.length) return ctx;
  for (const fn of list) {
    try {
      fn(ctx);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[hook]', name, e);
    }
  }
  return ctx;
}

function clearHooks() { registry.clear(); }

/* 阶段一预留的钩子名（阶段三按需注册） */
const HOOKS = {
  MONTH_BEGIN: 'onMonthBegin',
  MONTH_END: 'onMonthEnd',
  DISCIPLE_MONTHLY: 'onDiscipleMonthly',
  GROWTH: 'onGrowth',
  LOYALTY: 'onLoyalty',
  TEAM_FORMED: 'onTeamFormed',
  DANGER: 'onDanger',
  CONFISCATE: 'onConfiscate',
  BREAKTHROUGH: 'onBreakthrough',
  REVEAL: 'onReveal',
};

export { on, runHook, clearHooks, HOOKS };
