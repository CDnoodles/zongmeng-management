/* ==========================================================================
 * log.js — 日志
 * 由 xiuxiantest.html 拆分而来（原「日志」段）
 * ========================================================================== */
import { S } from './state.js';

function addLog(msg, type) {
  S.log.unshift({ msg, type: type || '', month: S.month });
  if (S.log.length > 80) S.log.pop();
}

export { addLog };
