/* ==========================================================================
 * tabs.js — 主 Tab 切换（弟子 / 秘境 / 仓库）
 * ========================================================================== */
const TABS = ['disciples', 'elders', 'dungeons', 'storage', 'mountain'];
let activeTab = 'disciples';

function switchTab(name) {
  if (!TABS.includes(name)) return;
  activeTab = name;

  /* 按钮状态 */
  document.querySelectorAll('.sub-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === name);
  });

  /* 面板状态 */
  TABS.forEach(t => {
    const el = document.getElementById('tab-' + t);
    if (el) el.classList.toggle('hidden', t !== name);
  });
}

function initTabs() {
  const container = document.getElementById('main-tabs');
  if (!container) return;
  container.addEventListener('click', e => {
    const btn = e.target.closest('.sub-tab');
    if (!btn) return;
    switchTab(btn.dataset.tab);
  });
}

export { switchTab, initTabs };
