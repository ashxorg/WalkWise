// utils.js — shared helpers used across flow modules.

/** Strip the "data:...;base64," prefix from a data URL, leaving only the base64 payload. */
export function stripDataUrl(s) {
  if (!s) return '';
  const i = s.indexOf(',');
  return i >= 0 ? s.slice(i + 1) : s;
}

/** Convert a raw error into a short, user-facing message. */
export function friendlyError(err) {
  const msg = (err && (err.message || err.toString())) || 'Something went wrong';
  if (/permission|denied/i.test(msg)) return 'Permission denied — please allow camera/microphone access.';
  if (/api key|401|403/i.test(msg))   return 'API key rejected — please check the configured keys.';
  if (/network|fetch/i.test(msg))     return 'Network error — check your connection and try again.';
  return msg.length > 140 ? msg.slice(0, 140) + '…' : msg;
}
