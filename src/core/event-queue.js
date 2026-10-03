/* ==========================================================================
 * event-queue.js — 事件队列
 *
 * 阶段一改动：
 *   S.event（单条阻塞弹窗）  →  S.pending（待办列表，D2）
 *   新增 S.scheduled（延时调度，多回合剧情的前置：命定之战 / 突破夺舍 …）
 * ========================================================================== */
import { S } from './state.js';

function pendingList() {
  if (!Array.isArray(S.pending)) S.pending = [];
  return S.pending;
}

function scheduledList() {
  if (!Array.isArray(S.scheduled)) S.scheduled = [];
  return S.scheduled;
}

/* delayMonths > 0 → 进延时队列；否则立刻进待办列表 */
function queueEvent(id, data, delayMonths) {
  if (!id) return;
  const payload = data || {};
  const delay = delayMonths || 0;
  if (delay > 0) {
    scheduledList().push({ id, data: payload, dueMonth: (S.month || 0) + delay });
  } else {
    pendingList().push({ id, data: payload });
  }
}

function hasPendingEvents() {
  return pendingList().length > 0;
}

/* 月初调用：把到期事件搬进待办列表，返回搬了几条 */
function releaseScheduled() {
  const now = S.month || 0;
  const all = scheduledList();
  const due = all.filter(e => (e.dueMonth || 0) <= now);
  if (!due.length) return 0;
  S.scheduled = all.filter(e => (e.dueMonth || 0) > now);
  for (const e of due) pendingList().push({ id: e.id, data: e.data || {} });
  return due.length;
}

function clearPending() { S.pending = []; }

export { queueEvent, hasPendingEvents, releaseScheduled, pendingList, scheduledList, clearPending };
