/**
 * Utilidades para manejo de modales: bloqueo de scroll y confirm dialog.
 */

export function disableBodyScroll() {
    try {
        const count = parseInt(document.documentElement.getAttribute('data-modal-count') || '0', 10) || 0;
        document.documentElement.setAttribute('data-modal-count', String(count + 1));
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        document.body.classList.add('modal-open');
    } catch (e) {
        console.warn('disableBodyScroll error', e);
    }
}

export function enableBodyScroll() {
    try {
        const count = parseInt(document.documentElement.getAttribute('data-modal-count') || '0', 10) || 0;
        const next = Math.max(0, count - 1);
        document.documentElement.setAttribute('data-modal-count', String(next));
        if (next === 0) {
            document.documentElement.style.overflow = '';
            document.body.style.overflow = '';
            document.body.classList.remove('modal-open');
            document.documentElement.removeAttribute('data-modal-count');
        }
    } catch (e) {
        console.warn('enableBodyScroll error', e);
    }
}

export function confirm(message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box">
                <div class="confirm-message">${message}</div>
                <div class="confirm-actions">
                    <button class="btn-confirm-no">No</button>
                    <button class="btn-confirm-yes btn">Sí</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        disableBodyScroll();
        const yes = overlay.querySelector('.btn-confirm-yes');
        const no = overlay.querySelector('.btn-confirm-no');
        const cleanup = (val) => { overlay.remove(); enableBodyScroll(); resolve(val); };
        yes.addEventListener('click', () => cleanup(true));
        no.addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
        // Cerrar con Escape
        const onKey = (ev) => { if (ev.key === 'Escape') { cleanup(false); } };
        document.addEventListener('keydown', onKey, { once: true });
    });
}
