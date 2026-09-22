/**
 * js/toast.js (ES module)
 * Non-blocking toast notifications. The master prompt explicitly forbids
 * using browser alert() as primary UI (§40) — this is the replacement,
 * plus modal.js for anything that needs a blocking confirmation.
 */
let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

const ICONS = { success: '✓', error: '✕', info: 'ℹ' };

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} [type='info']
 * @param {number} [durationMs=3500]
 */
export function showToast(message, type = 'info', durationMs = 3500) {
  const el = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${ICONS[type] || ''}</span><span>${message}</span>`;
  el.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, durationMs);
}
