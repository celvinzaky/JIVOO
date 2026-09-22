/**
 * js/modal.js (ES module)
 * Minimal modal + confirmation dialog helper. Replaces window.confirm()
 * the same way toast.js replaces window.alert() (§40 forbids relying on
 * native browser dialogs as primary UI).
 */

/**
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.confirmLabel='Confirm']
 * @param {string} [opts.cancelLabel='Cancel']
 * @param {'default'|'danger'} [opts.tone='default']
 * @returns {Promise<boolean>} resolves true if confirmed, false if cancelled
 */
export function confirmDialog({ title, message, confirmLabel = 'Konfirmasi', cancelLabel = 'Batal', tone = 'default' }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-body">
          <div class="confirm-icon ${tone === 'danger' ? 'danger' : 'warning'}">${tone === 'danger' ? '⚠' : '?'}</div>
          <h3>${title}</h3>
          <p class="text-sm">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="cancel">${cancelLabel}</button>
          <button class="btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${confirmLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    function close(result) {
      backdrop.remove();
      resolve(result);
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    backdrop.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
    backdrop.querySelector('[data-action="confirm"]').addEventListener('click', () => close(true));
  });
}

/**
 * Generic modal with custom inner HTML (used for the "Create Client" form).
 * Returns { backdrop, close } so the caller can wire up its own form
 * submit handling and close the modal on success.
 */
export function openModal({ title, bodyHtml, footerHtml }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" data-action="close">&times;</button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>`;
  document.body.appendChild(backdrop);

  function close() {
    backdrop.remove();
  }
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('[data-action="close"]').addEventListener('click', close);

  return { backdrop, close };
}
