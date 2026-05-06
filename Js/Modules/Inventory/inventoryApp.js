/**
 * Inicializador del Sistema de Inventario
 * Integración con el Dashboard Principal
 */

import { ProductManager } from './productManager.js';
import { PackManager } from './packManager.js';
import { InventoryUIRenderer } from './inventoryUIRenderer.js';
import { GitHubManager } from '../Github/githubManager.js';

export class InventoryApp {
    constructor(githubManager = null) {
        this.productManager = null;
        this.uiRenderer = null;
        this.githubManager = githubManager;
        this.initialized = false;
    }

    /**
     * Inicializa la aplicación de inventario (prepara manager). La UI se inicializa bajo demanda
     */
    async initialize() {
        try {
            console.log('Inicializando Sistema de Inventario (sin UI, inicialización bajo demanda)...');

            // Crear gestor de productos
            this.productManager = new ProductManager(this.githubManager);
            await this.productManager.init();

            // Crear gestor de packs
            this.packManager = new PackManager(this.githubManager);
            await this.packManager.init();

            // Pre-cargar productos e inventarios para que estén listos al abrir la UI
            try {
                await this.productManager.loadProducts();
                console.log('✓ Productos e inventarios precargados');
            } catch (preErr) {
                console.warn('Precarga de productos/inventario falló (se cargará on-demand):', preErr && preErr.message ? preErr.message : preErr);
            }

            this.initialized = true;
            console.log('✓ ProductManager listo (llame a showInventory() para inicializar la UI)');
        } catch (error) {
            console.error('Error al inicializar Sistema de Inventario:', error);
            this.showError(`Error al inicializar inventario: ${error.message}`);
        }
    }

    /**
     * Inicializa la UI del inventario y carga productos si no está inicializada
     */
    async showInventory() {
        try {
            if (!this.productManager) {
                this.productManager = new ProductManager(this.githubManager);
                await this.productManager.init();
            }
            if (!this.packManager) {
                this.packManager = new PackManager(this.githubManager);
                await this.packManager.init();
            }

            if (!this.uiRenderer) {
                this.uiRenderer = new InventoryUIRenderer('#inventory-view');
                await this.uiRenderer.initInventoryUI(this.productManager, this.packManager);
            }

            // Cargar productos y actualizar UI
            await this.productManager.loadProducts();
            await this.packManager.loadPacks();
            this.uiRenderer.renderProductsGrid();
            this.uiRenderer.updateCategoryFilter();
            this.uiRenderer.updateStagingPanel();

        } catch (error) {
            console.error('Error mostrando inventario:', error);
            this.showError(`Error al mostrar inventario: ${error.message}`);
        }
    }

    /**
     * Carga productos desde GitHub (mantiene compatibilidad)
     */
    async loadProducts() {
        try {
            await this.productManager.loadProducts();
            if (this.uiRenderer) {
                this.uiRenderer.renderProductsGrid();
                this.uiRenderer.updateCategoryFilter();
                this.uiRenderer.updateStagingPanel();
            }
        } catch (error) {
            console.error('Error al cargar productos:', error);
            this.showError(`Error al cargar productos: ${error.message}`);
        }
    }

    /**
     * Obtiene estadísticas del staging
     */
    getStagingStats() {
        if (!this.productManager) return null;
        return this.productManager.getStagingStats();
    }

    /**
     * Muestra error en UI
     */
    showError(message) {
        const container = document.querySelector('.inventory-header') || this.uiRenderer.container;
        if (container) {
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert error';
            alertDiv.innerHTML = `
                <i class="fas fa-exclamation-circle"></i>
                <span>${message}</span>
            `;
            container.insertAdjacentElement('afterend', alertDiv);
            setTimeout(() => alertDiv.remove(), 5000);
        }
    }

    /**
     * Obtiene el ProductManager
     */
    getProductManager() {
        return this.productManager;
    }

    /**
     * Obtiene el UIRenderer
     */
    getUIRenderer() {
        return this.uiRenderer;
    }
}

export default InventoryApp;
