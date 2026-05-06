/**
 * Módulo para gestionar el modal de guardado en GitHub
 * Muestra el estado de la operación: Cargando, Éxito o Error
 */

import { disableBodyScroll, enableBodyScroll } from '../../UI/modalUtils.js';

export class GitHubSaveModal {
    constructor() {
        this.modal = document.getElementById('github-save-modal');
        this.overlay = document.getElementById('modal-overlay');
        this.modalTitle = document.getElementById('modal-title');
        this.modalIcon = document.getElementById('modal-icon');
        this.statusText = document.getElementById('status-text');
        this.detailText = document.getElementById('detail-text');
        this.modalProgress = document.getElementById('modal-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');
        this.retryBtn = document.getElementById('modal-retry-btn');
        this.closeBtn = document.getElementById('modal-close-btn');
        this.closeFinalBtn = document.getElementById('modal-close-final-btn');
        this.onRetry = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.closeBtn?.addEventListener('click', () => this.close());
        this.closeFinalBtn?.addEventListener('click', () => this.close());
        this.overlay?.addEventListener('click', () => this.close());
        this.retryBtn?.addEventListener('click', () => {
            if (this.onRetry) this.onRetry();
            this.showLoading();
        });
    }

    /**
     * Muestra el modal en estado de carga
     */
    showLoading() {
        this.setModalState('loading');
        this.modalTitle.textContent = 'Guardando pedidos...';
        this.modalIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        this.statusText.textContent = 'Conectando con base de datos...';
        this.detailText.textContent = 'Por favor espera';
        this.modalProgress.style.display = 'none';
        this.retryBtn.style.display = 'none';
        this.closeFinalBtn.style.display = 'none';
        this.show();
    }

    /**
     * Muestra el modal en estado de éxito
     * @param {String} message - Mensaje de éxito
     * @param {Number} orderCount - Cantidad de pedidos guardados
     */
    showSuccess(message, orderCount = 0) {
        this.setModalState('success');
        this.modalTitle.textContent = '✅ ¡Guardado Exitoso!';
        this.modalIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
        this.statusText.textContent = message;
        this.detailText.textContent = `${orderCount} pedido(s) guardado(s) correctamente`;
        this.modalProgress.style.display = 'none';
        this.retryBtn.style.display = 'none';
        this.closeFinalBtn.style.display = 'block';
        // only show if not already visible (show() handles this check)
        this.show();
    }

    /**
     * Muestra el modal en estado de error
     * @param {String} errorMessage - Mensaje de error
     * @param {Function} retryCallback - Función a ejecutar al reintentar
     */
    showError(errorMessage, retryCallback = null) {
        this.setModalState('error');
        this.modalTitle.textContent = '❌ Error al Guardar';
        this.modalIcon.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
        this.statusText.textContent = 'No se pudo guardar los pedidos';
        this.detailText.textContent = errorMessage;
        this.modalProgress.style.display = 'none';
        this.retryBtn.style.display = retryCallback ? 'block' : 'none';
        this.closeFinalBtn.style.display = 'block';
        this.onRetry = retryCallback;
        this.show();
    }

    /**
     * Muestra progreso en tiempo real
     * @param {Number} percent - Porcentaje completado (0-100)
     * @param {String} message - Mensaje de estado
     */
    showProgress(percent, message) {
        this.modalProgress.style.display = 'block';
        const validPercent = Math.min(100, Math.max(0, percent));
        this.progressFill.style.width = `${validPercent}%`;
        this.progressText.textContent = `${validPercent}%`;
        this.statusText.textContent = message;
    }

    /**
     * Actualiza el texto de detalle
     * @param {String} text - Nuevo texto
     */
    updateDetail(text) {
        this.detailText.textContent = text;
    }

    /**
     * Establece el estado visual del modal
     * @param {String} state - 'loading', 'success' o 'error'
     */
    setModalState(state) {
        this.modal?.classList.remove('loading', 'success', 'error');
        if (state) {
            this.modal?.classList.add(state);
        }
    }

    /**
     * Muestra el modal
     */
    show() {
        // avoid incrementing scroll lock if already visible
        if (this.modal?.classList.contains('active')) {
            return;
        }
        this.modal?.classList.add('active');
        disableBodyScroll();
    }

    /**
     * Cierra el modal
     */
    close() {
        this.modal?.classList.remove('active');
        this.setModalState(null);
        enableBodyScroll();
    }

    /**
     * Valida que el modal esté visible
     */
    isVisible() {
        return this.modal?.classList.contains('active');
    }
}
