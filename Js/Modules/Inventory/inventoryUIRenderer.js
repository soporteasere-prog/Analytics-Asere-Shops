/**
 * Renderizador de UI para el Sistema de Inventario
 * Genera HTML dinámico para productos, modales y staging panel
 */

import { createObjectURL, revokeObjectURL, base64ToDataURL } from './inventoryUtils.js';
import { formatDate } from '../../Core/utils.js';
import { GitHubSaveModal } from '../Github/githubSaveModal.js';
import { GitHubImagesModal } from '../Github/githubImagesModal.js';

export class InventoryUIRenderer {
    constructor(containerSelector = '#inventory-view') {
        this.container = document.querySelector(containerSelector);
        this.productManager = null;
        this.packManager = null;
        this.currentView = 'products'; // 'products' or 'packs' or 'changes'
        this._backgroundInventoryFetches = new Set(); // evitar fetchs concurrentes por producto
    }

    /**
     * Normaliza valores de inventario para visualización (maneja objetos y strings JSON)
     * @private
     */
    _normalizeInventoryField(value) {
        // Reusar lógica del client si está disponible (si se exporta)
        try {
            // Si es objeto o número o booleano, extraer primitivo razonable
            if (value === null || value === undefined) return null;
            if (typeof value === 'number' || typeof value === 'boolean') return value;
            if (typeof value === 'object') {
                // buscar campos comunes
                const keys = ['value','valor','cantidad','stock','amount','precio','precio_compra','proveedor','notes','notas'];
                for (const k of keys) if (value[k] !== undefined) return this._normalizeInventoryField(value[k]);
                // si no, intentar stringify para mostrar algo útil
                try { return JSON.stringify(value); } catch (e) { return null; }
            }
            // Si es string, intentar parsear JSON
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try { const parsed = JSON.parse(trimmed); return this._normalizeInventoryField(parsed); } catch (e) { /* not JSON */ }
                }
                // Si es número en string, devolver número
                const n = Number(value);
                if (!isNaN(n)) return n;
                return value;
            }
            return null;
        } catch (e) { return null; }
    }

    /**
     * Inicializa la UI del inventario
     */
    async initInventoryUI(productManager, packManager = null) {
        this.productManager = productManager;
        this.packManager = packManager;
        // contador de modales abiertos para controlar scroll de fondo
        this._modalOpenCount = 0;
        this.renderInventoryTemplate();
        this.setupEventListeners();

        // Modal de guardado en GitHub
        try {
            this.githubSaveModal = new GitHubSaveModal();
        } catch (e) {
            console.warn('No se pudo inicializar GitHubSaveModal', e);
            this.githubSaveModal = null;
        }

        // Estado inicial: mostrar Productos (grid visible), ocultar Cambios (staging panel hidden)
        const btnProducts = document.getElementById('btn-view-products');
        const btnPacks = document.getElementById('btn-view-packs');
        const btnChanges = document.getElementById('btn-view-changes');
        const productsGrid = document.getElementById('products-grid');
        const packsGrid = document.getElementById('packs-grid');
        const stagingPanel = document.getElementById('staging-panel');

        // Botones: Productos activo, Cambios inactivo
        if (btnProducts) btnProducts.classList.add('active');
        if (btnChanges) btnChanges.classList.remove('active');

        // Vistas: Productos visible, Cambios (panel) oculto
        if (productsGrid) productsGrid.classList.remove('hidden');
        if (stagingPanel) stagingPanel.classList.add('hidden'); // FUERZA: panel siempre inicia oculto

        // Notar: NO cargamos productos aquí para evitar doble-fetch. La carga se realiza desde InventoryApp.showInventory()
        // Sólo actualizamos UI básica y escuchamos actualizaciones parciales de inventario
        this.updateCategoryFilter();
        this.renderProductsGrid();

        // Escuchar actualizaciones parciales de inventarios y actualizar solo tarjetas afectadas
        document.addEventListener('inventories:updated', (e) => {
            try {
                const ids = (e && e.detail && Array.isArray(e.detail.ids)) ? e.detail.ids : [];
                console.log('📣 Inventories updated:', ids.length ? `${ids.length} ids` : 'ids not provided');
                if (!ids || ids.length === 0) {
                    // Si no hay ids, re-renderizar por seguridad
                    return this.renderProductsGrid();
                }

                // Actualizar solo las tarjetas correspondientes
                ids.forEach(id => {
                    try {
                        const payloads = (e && e.detail && e.detail.payloads) ? e.detail.payloads : null;
                        const payload = payloads && payloads[id] ? payloads[id] : null;

                        const product = this.productManager.getProductById ? this.productManager.getProductById(id) : null;
                        const card = document.querySelector(`.product-card[data-product-id="${id}"]`);
                        if (!card) return;

                        const stockEl = card.querySelector('.product-inventory-stock');
                        const precioEl = card.querySelector('.product-inventory-precio');

                        if (payload) {
                            // Si viene payload con datos normalizados, usarlo y actualizar productManager si existe
                            const stockVal = (payload.stock !== undefined && payload.stock !== null) ? payload.stock : (payload.quantity ?? null);
                            const precioVal = payload.precio_compra ?? payload.price ?? null;

                            if (product) {
                                product.inventory = payload;
                                product.stock = (stockVal !== null && stockVal !== undefined) ? stockVal : product.stock;
                                product.precio_compra = (precioVal !== null && precioVal !== undefined) ? precioVal : product.precio_compra;
                            }

                            if (stockEl) stockEl.textContent = `Stock: ${stockVal !== null && stockVal !== undefined ? stockVal : '—'}`;
                            if (precioEl) precioEl.textContent = `Costo: ${precioVal !== null && precioVal !== undefined ? `$${(parseFloat(precioVal)||0).toFixed(2)}` : '—'}`;

                            if (payload.hasData) card.classList.add('has-inventory-data'); else card.classList.remove('has-inventory-data');

                        } else if (product) {
                            const stockText = (product.stock !== null && product.stock !== undefined) ? product.stock : '—';
                            const precioText = (product.precio_compra !== null && product.precio_compra !== undefined) ? `$${(parseFloat(product.precio_compra)||0).toFixed(2)}` : '—';

                            if (stockEl) stockEl.textContent = `Stock: ${stockText}`;
                            if (precioEl) precioEl.textContent = `Costo: ${precioText}`;

                            if (product.inventory && product.inventory.hasData) {
                                card.classList.add('has-inventory-data');
                            } else {
                                card.classList.remove('has-inventory-data');
                            }
                        } else {
                            if (stockEl) stockEl.textContent = 'Stock: —';
                            if (precioEl) precioEl.textContent = 'Costo: —';
                        }
                    } catch (err) { /* ignore individual card failures */ }
                });
            } catch (err) {
                console.warn('Error al procesar evento inventories:updated', err);
            }
        });

        // Actualizar contenido y badge del panel de staging (SIN cambiar su visibilidad)
        this.updateStagingPanel();
    }

    /**
     * Renderiza el template principal del inventario
     */
    renderInventoryTemplate() {
        this.container.innerHTML = `
            <div class="inventory-header">
                <h2><i class="fas fa-boxes"></i> Gestión de Inventario</h2>
                <div class="inventory-actions">
                    <div class="inventory-view-toggle">
                        <button class="btn btn-outline active" id="btn-view-products">Productos</button>
                        <button class="btn btn-outline" id="btn-view-packs">Packs</button>
                        <button class="btn btn-outline" id="btn-view-changes">Cambios</button>
                    </div>

                    <button class="btn btn-primary" id="btn-add-product">
                        <i class="fas fa-plus"></i> Nuevo Producto
                    </button>
                    <button class="btn btn-outline" id="btn-manage-repo-images">
                        <i class="fas fa-images"></i> Imágenes Repo
                    </button>
                    <button class="btn btn-secondary" id="btn-refresh-products">
                        <i class="fas fa-sync-alt"></i> Recargar
                    </button>
                </div>
            </div>

            <!-- Panel de Staging -->
            <div class="staging-panel hidden" id="staging-panel">
                <div class="staging-header">
                    <div class="staging-title">
                        <i class="fas fa-code-branch"></i>
                        <span>Cambios Pendientes en Staging</span>
                    </div>
                </div>

                <div class="staging-stats" id="staging-stats"></div>

                <!-- Las pestañas se crean dinámicamente -->
                <!-- staging-tabs, staging-tab-content se insertan aquí -->

                <div class="staging-actions">
                    <button class="btn-discard-all" id="btn-discard-all">
                        <i class="fas fa-trash"></i> Descartar Todos
                    </button>
                    <button class="btn-sync-github" id="btn-sync-github">
                        <i class="fas fa-cloud-upload-alt"></i> Sincronizar con Base de Datos
                    </button>
                </div>
            </div>

            <!-- Toolbar -->
            <div class="inventory-toolbar">
                <div class="search-box">
                    <i class="fas fa-search"></i>
                    <input type="text" id="search-products" placeholder="Buscar productos..." autocomplete="off" autocapitalize="off" spellcheck="false">
                </div>
                <div class="filter-controls">
                    <select class="filter-select" id="filter-category">
                        <option value="">Todas las categorías</option>
                    </select>

                    <select class="filter-select" id="filter-modified">
                        <option value="all">Todos</option>
                        <option value="modified">Solo Modificados</option>
                        <option value="new">Solo Nuevos</option>
                    </select>

                    <select class="filter-select" id="sort-products">
                        <option value="default">Orden: Predeterminado</option>
                        <option value="price_desc">Precio ↓</option>
                        <option value="price_asc">Precio ↑</option>
                        <option value="date_modified">Últ. Modificación</option>
                        <option value="date_created">Fecha Creación</option>
                    </select>

                    <button class="btn btn-outline" id="btn-export-csv">Exportar CSV</button>
                    <button class="btn btn-outline" id="btn-clear-filters">Limpiar filtros</button>
                </div>

                <div class="toolbar-stats" id="toolbar-stats">
                    <div class="stat small" id="stat-total">Total: 0</div>
                    <div class="stat small" id="stat-available">Disponibles: 0</div>
                    <div class="stat small" id="stat-unavailable">No disponibles: 0</div>
                    <div class="stat small" id="stat-modified-count">Modificados: 0</div>
                    <div class="stat small" id="stat-packs-sep">|</div>
                    <div class="stat small" id="stat-packs-total">Packs: 0</div>
                    <div class="stat small" id="stat-packs-available">P.Disponibles: 0</div>
                    <div class="stat small" id="stat-packs-modified">P.Modificados: 0</div>
                </div>
            </div>

            <!-- Grid de Productos -->
            <div class="products-grid" id="products-grid">
                <div class="empty-state">
                    <i class="fas fa-spinner-third"></i>
                    <p>Cargando productos...</p>
                </div>
            </div>
            <div class="products-grid hidden" id="packs-grid">
                <div class="empty-state">
                    <i class="fas fa-spinner-third"></i>
                    <p>Cargando packs...</p>
                </div>
            </div>
        `;

        // Agregar estilos si no existen
        if (!document.querySelector('link[href*="inventory.css"]')) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'Css/inventory.css';
            document.head.appendChild(link);
        }
        if (!document.querySelector('link[href*="packs.css"]')) {
            const link2 = document.createElement('link');
            link2.rel = 'stylesheet';
            link2.href = 'Css/packs.css';
            document.head.appendChild(link2);
        }
    }

    /**
     * Renderiza la grid de productos
     */
    renderProductsGrid(products = null) {
        const grid = document.getElementById('products-grid');
        const productsToRender = products || this.productManager.products;

        if (!grid) return;

        if (productsToRender.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No hay productos para mostrar</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = productsToRender.map(product => this.createProductCard(product)).join('');

        // Event listeners para acciones de productos
        grid.querySelectorAll('.btn-product-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = btn.dataset.productId;
                this.openProductModal(productId, 'edit');
            });
        });

        grid.querySelectorAll('.btn-product-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const productId = btn.dataset.productId;
                const product = this.productManager.getProductById(productId);
                if (!product) return;
                
                // Mostrar previsualización del producto a eliminar
                const ok = await this.showDeleteProductPreview(product);
                if (ok) this.handleDeleteProduct(productId);
            });
        });

        // Aplicar previews de imágenes almacenadas en staging (si existen)
        this.applyStagedImagesToGrid();

        // Completar tamaños de imagen (no bloqueante)
        try { this.populateProductImageSizes(); } catch (e) { console.warn('populateProductImageSizes call error', e); }

        // Actualizar estadísticas del toolbar
        try { this.updateToolbarStats(); } catch (e) { console.warn('updateToolbarStats error', e); }
        
        // Setup listeners para abrir imagen en modal al hacer clic
        try { this.setupProductImageModalListeners(); } catch (e) { console.warn('setupProductImageModalListeners error', e); }
    }

    /**
     * Crea el HTML de una tarjeta de producto
     */
    createProductCard(product) {
        const discount = product.descuento ? `<span class="product-price-original">$${product.precio.toFixed(2)}</span>` : '';
        const isModified = this.productManager.getStagedChanges().some(c => c.productId === product.id && c.type === 'modify');
        const isDeleted = this.productManager.getStagedChanges().some(c => c.productId === product.id && c.type === 'delete');

        // Lógica de Badge de Stock
        const stockVal = product.stock !== null && product.stock !== undefined ? Number(product.stock) : null;
        let stockBadge = '';
        if (stockVal !== null) {
            if (stockVal === 0) {
                stockBadge = '<span class="product-badge stock-out">Sin Stock</span>';
            } else if (stockVal < 5) {
                stockBadge = '<span class="product-badge stock-low">Bajo Stock</span>';
            } else if (stockVal < 20) {
                stockBadge = '<span class="product-badge stock-medium">Stock Medio</span>';
            } else {
                stockBadge = '<span class="product-badge stock-high">Stock Alto</span>';
            }
        }

        // Mostrar both created_at y modified_at si existen (o marcador si null)
        let dateHtml = '';
        try {
            const createdStr = product.created_at ? formatDate(new Date(product.created_at)) : '—';
            const modifiedStr = product.modified_at ? formatDate(new Date(product.modified_at)) : '—';
            dateHtml = `
                <div class="product-meta">
                    <small>Creado: ${createdStr}</small><br>
                    <small>Última modificación: ${modifiedStr}</small>
                    ${stockBadge}
                </div>
                
                <div class="product-inventory" ${product.inventory && product.inventory.last_updated ? `title="Última actualización: ${product.inventory.last_updated}"` : ''}>
                            ${ (this.productManager && this.productManager._loadingInventories && (product.stock === null || product.stock === undefined)) ? `
                                <small class="product-inventory-loading">Cargando...</small>
                            ` : `
                                <small class="product-inventory-stock">Stock: ${product.stock !== null && product.stock !== undefined ? product.stock : '—'}</small>
                                <small class="product-inventory-precio">Costo: ${product.precio_compra !== null && product.precio_compra !== undefined ? `$${(parseFloat(product.precio_compra) || 0).toFixed(2)}` : '—'}</small>
                                ${ product.inventory && product.inventory.proveedor ? `<small class="product-inventory-proveedor">Proveedor: ${product.inventory.proveedor}</small>` : '' }
                            ` }
                        </div>
            `;
        } catch (e) {
            dateHtml = '';
        }
        return `
            <div class="product-card ${isModified ? 'modified' : ''} ${isDeleted ? 'deleted' : ''}" data-product-id="${product.id}">
                <div class="product-image">
                        <div class="contenedor-imagen">
                        ${product.disponibilidad === false ? '<span class="product-badge unavailable">No disponible</span>' : ''}
                        <div class="product-image-size" data-src="${product.imagenUrl}"></div>
                        <img src="${product.imagenUrl}" alt="${product.nombre}" onerror="this.src='Img/no_image.jpg'">
                        
                        ${product.nuevo ? '<span class="product-badge new">Nuevo</span>' : ''}
                        ${product.oferta ? '<span class="product-badge sale">Oferta</span>' : ''}
                        ${isModified ? '<span class="product-badge modified">Modificado</span>' : ''}
                        ${isDeleted ? '<span class="product-badge deleted">Eliminado</span>' : ''}
                    </div>
                </div>
                <div class="product-info">
                    <div class="product-name">${product.nombre}</div>
                    <div class="product-category">${product.categoria}</div>
                    <div class="product-description">${product.descripcion || 'Sin descripción'}</div>
                    ${dateHtml}
                    <div class="product-footer">
                        <div class="product-price">
                            <div class="product-price-final">$${product.precioFinal.toFixed(2)}</div>
                            ${discount}
                        </div>
                        
                        <div class="product-actions">
                            <button class="btn-product-edit" data-product-id="${product.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-product-delete" data-product-id="${product.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renderiza la grid de packs
     */
    renderPacksGrid(packs = null) {
        const grid = document.getElementById('packs-grid');
        const packsToRender = packs || (this.packManager ? this.packManager.packs : []);

        if (!grid) return;

        if (!packsToRender || packsToRender.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>No hay packs para mostrar</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = packsToRender.map(pack => this.createPackCard(pack)).join('');

        // Event listeners
        grid.querySelectorAll('.btn-pack-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const packId = btn.dataset.packId;
                this.openPackModal(packId, 'edit');
            });
        });

        grid.querySelectorAll('.btn-pack-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const packId = btn.dataset.packId;
                const ok = await this.showConfirmDialog('¿Estás seguro de que deseas eliminar este pack?');
                if (ok) this.handleDeletePack(packId);
            });
        });
        // Actualizar métricas del toolbar
        try { this.updateToolbarStats(); } catch (e) { console.warn('updateToolbarStats error', e); }
    }

    createPackCard(pack) {
        const discount = pack.descuento ? `<span class="product-price-original">$${pack.precio.toFixed(2)}</span>` : '';
        const staged = this.packManager ? this.packManager.getStagedChanges() : [];
        const isModified = staged && staged.some(c => c.packId === pack.id && c.type === 'modify');
        const isDeleted = staged && staged.some(c => c.packId === pack.id && c.type === 'delete');
        let features = '';
        if (Array.isArray(pack.caracteristicas)) {
            features = `<ul class="pack-features">${pack.caracteristicas.map(f => `<li>${f}</li>`).join('')}</ul>`;
        }

        const createdStr = pack.created_at ? formatDate(new Date(pack.created_at)) : '—';
        const modifiedStr = pack.modified_at ? formatDate(new Date(pack.modified_at)) : '—';

        return `
            <div class="pack-card ${isModified ? 'modified' : ''} ${isDeleted ? 'deleted' : ''}" data-pack-id="${pack.id}">
                <div class="pack-image">
                    <div class="pack-image-size" data-src="${pack.imagenUrl}"></div>
                    <img src="${pack.imagenUrl}" alt="${pack.nombre}" onerror="this.src='Img/no_image.jpg'">
                    ${pack.nuevo ? '<span class="pack-badge new">Nuevo</span>' : ''}
                    ${pack.oferta ? '<span class="pack-badge sale">Oferta</span>' : ''}
                    ${isModified ? '<span class="pack-badge modified">Modificado</span>' : ''}
                    ${isDeleted ? '<span class="pack-badge deleted">Eliminado</span>' : ''}
                </div>
                <div class="pack-info">
                    <div class="pack-name">${pack.nombre}</div>
                    <div class="pack-category">${pack.categoria || ''}</div>
                    <div class="pack-description">${pack.descripcion || 'Sin descripción'}</div>
                    <div class="pack-meta"><small>Creado: ${createdStr}</small><br><small>Últ. modificación: ${modifiedStr}</small></div>
                    ${features}
                    <div class="pack-footer">
                        <div class="pack-price">
                            <div class="pack-price-final">$${pack.precioFinal.toFixed(2)}</div>
                            ${discount}
                        </div>
                        <div class="pack-actions">
                            <button class="btn-pack-edit" data-pack-id="${pack.id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-pack-delete" data-pack-id="${pack.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Actualiza el panel de staging (SOLO contenido, NO visibilidad)
     * La visibilidad es controlada ÚNICAMENTE por los botones Productos/Cambios
     */
    updateStagingPanel() {
        const panel = document.getElementById('staging-panel');
        const statsA = this.productManager ? this.productManager.getStagingStats() : { total:0,new:0,modify:0,delete:0,withImages:0 };
        const statsB = this.packManager ? this.packManager.getStagingStats() : { total:0,new:0,modify:0,delete:0,withImages:0 };
        const stats = {
            total: (statsA.total || 0) + (statsB.total || 0),
            new: (statsA.new || 0) + (statsB.new || 0),
            modify: (statsA.modify || 0) + (statsB.modify || 0),
            delete: (statsA.delete || 0) + (statsB.delete || 0),
            withImages: (statsA.withImages || 0) + (statsB.withImages || 0)
        };


        // Actualizar badge en la cabecera
        const headerChangesBtn = document.getElementById('btn-view-changes');
        if (headerChangesBtn) {
            let badge = headerChangesBtn.querySelector('.header-changes-badge');
            if (stats.total > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'header-changes-badge';
                    headerChangesBtn.appendChild(badge);
                }
                badge.textContent = stats.total;
            } else if (badge) {
                badge.remove();
            }
        }

        // Limpiar lista anterior
        const existingList = panel.querySelector('.staging-changes-simple');
        if (existingList) existingList.remove();
        const existingEmpty = panel.querySelector('.staging-empty-message');
        if (existingEmpty) existingEmpty.remove();

        // Si no hay cambios, mostrar mensaje vacío y ocultar acciones
        const actions = panel.querySelector('.staging-actions');
        if (stats.total === 0) {
            // Mostrar estadísticas (principalmente imagenes)
            document.getElementById('staging-stats').innerHTML = `
                <div class="stat-badge images">
                    <i class="fas fa-image"></i>
                    <span>${stats.withImages} Con imagen${stats.withImages !== 1 ? 's' : ''}</span>
                </div>
            `;

            // Mensaje vacío más informativo
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'staging-empty-message';
            emptyMsg.style.padding = '1rem';
            emptyMsg.style.color = '#7f8c8d';
            emptyMsg.textContent = 'No hay cambios en staging — crea o edita productos o packs para verlos aquí.';

            if (actions) {
                actions.insertAdjacentElement('beforebegin', emptyMsg);
                actions.style.display = 'none';
            }

            return;
        } else {
            if (actions) actions.style.display = '';
        }

        // Actualizar estadísticas
        const statsHtml = `
            <div class="stat-badge new">
                <i class="fas fa-plus-circle"></i>
                <span>${stats.new} Nuevo${stats.new !== 1 ? 's' : ''}</span>
            </div>
            <div class="stat-badge modify">
                <i class="fas fa-edit"></i>
                <span>${stats.modify} Modificado${stats.modify !== 1 ? 's' : ''}</span>
            </div>
            <div class="stat-badge delete">
                <i class="fas fa-trash"></i>
                <span>${stats.delete} Eliminado${stats.delete !== 1 ? 's' : ''}</span>
            </div>
            <div class="stat-badge images">
                <i class="fas fa-image"></i>
                <span>${stats.withImages} Con imagen${stats.withImages !== 1 ? 's' : ''}</span>
            </div>
        `;

        document.getElementById('staging-stats').innerHTML = statsHtml;

        // Renderizar cambios
        this.renderStagedChanges();
    }

    /**
     * Renderiza la lista de cambios en staging (SIN TABS)
     */
    renderStagedChanges() {
        const stagingPanel = document.getElementById('staging-panel');
        if (!stagingPanel) return;

        const changesProd = this.productManager ? this.productManager.getStagedChanges().map(c => ({...c, kind: 'product'})) : [];
        const changesPacks = this.packManager ? this.packManager.getStagedChanges().map(c => ({...c, kind: 'pack'})) : [];
        const changes = [...changesProd, ...changesPacks];

        // Si no hay cambios, no renderizar nada (el panel ya muestra "Sin cambios")
        if (changes.length === 0) {
            return;
        }

        // Limpiar lista anterior
        const existingList = stagingPanel.querySelector('.staging-changes-simple');
        if (existingList) existingList.remove();

        // Construir HTML de cambios
        const changesHTML = changes.map(change => `
            <div class="change-item ${change.type} " data-change-id="${change.id}">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span class="change-type ${change.type}">
                        <i class="fas ${this.getChangeIcon(change.type)}"></i>
                        ${change.type.charAt(0).toUpperCase() + change.type.slice(1)} ${change.kind === 'pack' ? '(Pack)' : ''}
                    </span>
                    <div class="change-product-name">${change.productData.nombre}</div>
                    <div style="margin-left:auto; color:#7f8c8d; font-size:0.85rem;">
                        ${change.timestamp ? formatDate(new Date(change.timestamp)) : ''}
                    </div>
                    ${change.hasNewImage ? '<i class="fas fa-image" style="color: #3498db; font-size: 0.9rem;"></i>' : ''}
                </div>
                <div class="change-actions">
                    <button class="btn-view-change" data-change-id="${change.id}"><i class="fas fa-eye"></i> Ver</button>
                    ${change.type === 'modify' ? `<button class="btn-edit-change" data-change-id="${change.id}"><i class="fas fa-pen"></i> Editar</button>` : ''}
                    <button class="btn-discard-change" data-change-id="${change.id}">
                        <i class="fas fa-times"></i> Descartar
                    </button>
                </div>
                <div class="change-preview" id="change-preview-${change.id}" style="display:none; margin-top:0.5rem; padding:0.75rem; border:1px solid #eee; border-radius:4px;">
                    <div style="display:flex; gap:0.75rem; align-items:flex-start;">
                        <div style="flex:1;">
                            <div><strong>Categoría:</strong> ${change.productData.categoria || '—'}</div>
                            <div><strong>Precio:</strong> $${change.productData.precio || '—'}</div>
                            <div><strong>Descuento:</strong> ${change.productData.descuento || 0}%</div>
                            <div><strong>Oferta:</strong> ${change.productData.oferta ? 'Sí' : 'No'}</div>
                            <div style="margin-top:0.5rem;"><strong>Descripción:</strong><div>${change.productData.descripcion || '—'}</div></div>
                        </div>
                        <div style="width:120px;">
                            <div id="change-preview-img-${change.id}"></div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Crear contenedor y agregar HTML
        const changesContent = `<div id="staging-changes-list" class="staging-changes-simple">${changesHTML}</div>`;

        // Insertar cambios después del stats
        const statsDiv = stagingPanel.querySelector('.staging-stats');
        if (statsDiv) {
            statsDiv.insertAdjacentHTML('afterend', changesContent);
        }

        // Event listeners para Ver previews
        const changesList = stagingPanel.querySelector('#staging-changes-list');
        if (changesList) {
            changesList.querySelectorAll('.btn-view-change').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.dataset.changeId;
                    const preview = document.getElementById(`change-preview-${id}`);
                    if (!preview) return;
                    preview.style.display = preview.style.display === 'none' ? 'block' : 'none';

                    // Buscar el cambio en productManager o packManager
                    let change = this.productManager ? this.productManager.getStagedChanges().find(c => c.id === id) : null;
                    let manager = this.productManager;
                    if (!change && this.packManager) {
                        change = this.packManager.getStagedChanges().find(c => c.id === id);
                        manager = this.packManager;
                    }
                    if (!change) return;

                    const imgContainer = document.getElementById(`change-preview-img-${id}`);
                    if (!imgContainer) return;

                    imgContainer.innerHTML = '';

                    if (change.hasNewImage && change.imageKey) {
                        try {
                            const img = await manager.stagingDB.getImageFromIDB(change.imageKey);
                            if (img && img.base64) {
                                const src = base64ToDataURL(img.base64, img.mimeType || 'image/jpeg');
                                imgContainer.innerHTML = `<img src="${src}" style="max-width:100%; border-radius:4px; border:1px solid #ddd;">`;
                            }
                        } catch (err) {
                            console.warn('No se pudo cargar imagen:', err);
                        }
                    } else if (change.productData.imagenes && change.productData.imagenes.length > 0) {
                        const imgName = change.productData.imagenes[0];
                        try {
                            const src = imgName.startsWith('http') ? imgName : manager.getImageUrl(imgName);
                            imgContainer.innerHTML = `<img src="${src}" style="max-width:100%; border-radius:4px; border:1px solid #ddd;">`;
                        } catch (err) {
                            console.warn('No se pudo cargar URL:', err);
                        }
                    }
                });
            });

            // Descartar cambio
            changesList.querySelectorAll('.btn-discard-change').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.dataset.changeId;
                    try {
                        await this.handleDiscardChange(id);
                    } catch (error) {
                        this.showNotification(`Error: ${error.message}`, 'error');
                    }
                });
            });

            // Editar cambio (reabrir modal pre-llenado)
            changesList.querySelectorAll('.btn-edit-change').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = btn.dataset.changeId;
                    try {
                        await this.handleEditChange(id);
                    } catch (error) {
                        this.showNotification(`Error: ${error.message}`, 'error');
                    }
                });
            });
        }
    }

    /**
     * Obtiene el icono según el tipo de cambio
     */
    getChangeIcon(type) {
        switch (type) {
            case 'new': return 'fa-plus-circle';
            case 'modify': return 'fa-edit';
            case 'delete': return 'fa-trash';
            default: return 'fa-circle';
        }
    }

    /**
     * Abre modal de producto (crear/editar)
     */
    openProductModal(productId = null, mode = 'create') {
        const product = mode === 'edit' ? this.productManager.getProductById(productId) : null;
        const title = mode === 'edit' ? `Editar: ${product.nombre}` : 'Nuevo Producto';

        const categories = this.productManager.getAllCategories();
        const categoryOptions = categories.map(cat => `<option value="${cat}" ${product?.categoria === cat ? 'selected' : ''}>${cat}</option>`).join('');

        const modalHTML = `
            <div class="modal-overlay active" id="product-modal-overlay">
                <div class="product-modal" id="product-modal">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>

                    <div class="modal-content">
                        <form id="product-form">
                            <div class="form-group">
                                <label for="product-name-input">Nombre del Producto *</label>
                                <input id="product-name-input" type="text" name="nombre" value="${product?.nombre || ''}" required>
                            </div>

                            <div class="form-group">
                                <label for="product-category-select">Categoría *</label>
                                <select id="product-category-select" name="categoria" required>
                                    <option value="">Seleccionar categoría</option>
                                    ${categoryOptions}
                                </select>
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                                <div class="form-group">
                                    <label for="input-precio-original">Precio Original *</label>
                                    <input type="number" id="input-precio-original" name="precio" value="${product?.precio || ''}" step="0.01" min="0" required>
                                </div>

                                <div class="form-group">
                                    <label for="input-precio-final">Precio Final Deseado</label>
                                    <input id="input-precio-final" type="number" name="precio_final_deseado" value="${product?.precioFinal || ''}" step="0.01" min="0" placeholder="Ingresa el precio final deseado">
                                </div>
                            </div>

                            <div class="form-group" style="display: none;">
                                <input type="hidden" name="descuento" id="input-descuento" value="${product?.descuento || 0}">
                            </div>

                            <div class="form-group">
                                <label for="input-descripcion">Descripción</label>
                                <textarea id="input-descripcion" name="descripcion" maxlength="500">${product?.descripcion || ''}</textarea>
                            </div>

                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="disponibilidad" ${product?.disponibilidad !== false ? 'checked' : ''}>
                                    Disponible
                                </label>
                            </div>

                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="nuevo" ${product?.nuevo ? 'checked' : ''}>
                                    Marcar como Nuevo
                                </label>
                            </div>

                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="oferta" ${product?.oferta ? 'checked' : ''}>
                                    Marcar como Oferta
                                </label>
                            </div>

                            <div class="form-group">
                                <label>
                                    <input type="checkbox" name="mas_vendido" ${product?.mas_vendido ? 'checked' : ''}>
                                    Marcar como Más Vendido
                                </label>
                            </div>

                            <div class="image-upload-group">
                                <label for="image-upload-input" class="image-upload-label">Imagen del Producto</label>
                                <div class="image-upload-area" id="image-upload-area">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <div class="image-upload-text">
                                        Arrastra una imagen aquí o haz clic para seleccionar
                                    </div>
                                </div>
                                <input type="file" id="image-upload-input" class="image-upload-input" accept="image/*">
                                <div class="image-preview" id="image-preview"></div>
                            </div>

                            ${product?.imagenUrl && product.imagenUrl !== 'Img/no_image.jpg' ? `
                                <div class="form-group">
                                    <div class="form-label">Imagen actual</div>
                                    <div style="margin-top: 0.5rem;">
                                        <img src="${product.imagenUrl}" alt="Imagen actual" style="max-width: 150px; max-height: 150px; border-radius: 0.3rem; border: 1px solid #ddd;">
                                    </div>
                                </div>
                            ` : ''}

                        </form>
                    </div>

                    <div class="form-actions">
                        <button class="btn-form-cancel" id="btn-modal-cancel">Cancelar</button>
                        <button class="btn-form-submit" id="btn-modal-submit">
                            ${mode === 'edit' ? 'Actualizar Producto' : 'Crear Producto'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remover modal anterior si existe
        const oldModal = document.getElementById('product-modal-overlay');
        if (oldModal) oldModal.remove();

        // Agregar modal al DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Evitar scroll del fondo mientras el modal está abierto
        this.disableBodyScroll();

        // Setup event listeners del modal
        this.setupModalListeners(mode, productId);
    }

    /**
     * Abre modal de pack (crear/editar)
     */
    openPackModal(packId = null, mode = 'create') {
        const pack = mode === 'edit' && this.packManager ? this.packManager.getPackById(packId) : null;
        const title = mode === 'edit' ? `Editar: ${pack.nombre}` : 'Nuevo Pack';

        const featuresText = pack && Array.isArray(pack.caracteristicas) ? pack.caracteristicas.join('\n') : '';

        const modalHTML = `
            <div class="modal-overlay active" id="pack-modal-overlay">
                <div class="product-modal" id="pack-modal">
                    <div class="modal-header"><h3 class="modal-title">${title}</h3></div>
                    <div class="modal-content">
                        <form id="pack-form">
                            <div class="form-group">
                                <label>Nombre del Pack *</label>
                                <input type="text" name="nombre" value="${pack?.nombre || ''}" required>
                            </div>
                            <div class="form-group">
                                <label>Precio</label>
                                <input id="input-pack-precio-original" type="number" name="precio" value="${pack?.precio || ''}" step="0.01" min="0">
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                                <div class="form-group">
                                    <label>Descuento (ingresa el precio final deseado)</label>
                                    <input id="input-pack-descuento" type="number" name="precio_final_deseado" value="${pack?.precioFinal || ''}" step="0.01" min="0" placeholder="Ej: 19.99">
                                </div>
                                <div class="form-group">
                                    <label>Disponible</label>
                                    <br>
                                    <label><input type="checkbox" name="disponible" ${pack?.disponible !== false ? 'checked' : ''}> Disponible</label>
                                </div>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                                <div class="form-group"><label><input type="checkbox" name="top" ${pack?.top ? 'checked' : ''}> Top</label></div>
                                <div class="form-group"><label><input type="checkbox" name="nuevo" ${pack?.nuevo ? 'checked' : ''}> Nuevo</label></div>
                            </div>
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                                <div class="form-group"><label><input type="checkbox" name="oferta" ${pack?.oferta ? 'checked' : ''}> Oferta</label></div>
                                <div class="form-group"><!-- placeholder --></div>
                            </div>
                            <div class="form-group">
                                <label>Descripción</label>
                                <textarea name="descripcion">${pack?.descripcion || ''}</textarea>
                            </div>
                            <div class="form-group">
                                <label>Características / Productos del Pack (una por línea)</label>
                                <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem; align-items:center;">
                                    <input id="pack-feature-input" list="pack-product-list" placeholder="Ej: x1 Arroz 1kg" style="flex:1; padding:0.5rem; border:1px solid #e6eef6; border-radius:6px;">
                                    <datalist id="pack-product-list">
                                        ${ (this.productManager && Array.isArray(this.productManager.products)) ? this.productManager.products.map(p=>`<option value="x1 ${p.nombre}"></option>`).join('') : '' }
                                    </datalist>
                                    <button type="button" id="btn-add-feature" class="btn">Agregar</button>
                                </div>
                                <textarea id="pack-features-textarea" name="caracteristicas" placeholder="Ejemplo:\nx1 Producto A\nx2 Algo más\nx3 Algo más">${featuresText}</textarea>
                            </div>
                            <div class="image-upload-group">
                                <label class="image-upload-label">Imagen del Pack</label>
                                <div class="image-upload-area" id="pack-image-upload-area">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <div class="image-upload-text">Arrastra una imagen aquí o haz clic para seleccionar</div>
                                </div>
                                <input type="file" id="pack-image-upload-input" class="image-upload-input" accept="image/*">
                                <div class="image-preview" id="pack-image-preview"></div>
                                ${pack?.imagenUrl ? `
                                    <div class="form-group">
                                        <div class="form-label">Imagen actual</div>
                                        <div style="margin-top:0.5rem;"><img src="${pack.imagenUrl}" style="max-width:150px; border:1px solid #ddd; border-radius:4px;"></div>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="form-group">
                                <label>Metadatos</label>
                                <div style="font-size:0.85rem; color:#666;">
                                    <div>Creado: ${pack?.created_at ? formatDate(new Date(pack.created_at)) : '—'}</div>
                                    <div>Última modificación: ${pack?.modified_at ? formatDate(new Date(pack.modified_at)) : '—'}</div>
                                </div>
                            </div>
                        </form>
                    </div>
                    <div class="form-actions">
                        <button class="btn-form-cancel" id="btn-pack-modal-cancel">Cancelar</button>
                        <button class="btn-form-submit" id="btn-pack-modal-submit">${mode === 'edit' ? 'Actualizar Pack' : 'Crear Pack'}</button>
                    </div>
                </div>
            </div>
        `;

        const old = document.getElementById('pack-modal-overlay'); if (old) old.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        // Evitar scroll del fondo mientras el modal está abierto
        this.disableBodyScroll();

        // Setup listeners simple: reuse product modal handlers pattern but custom for packs
        const overlay = document.getElementById('pack-modal-overlay');
        const form = document.getElementById('pack-form');
        const cancelBtn = document.getElementById('btn-pack-modal-cancel');
        const submitBtn = document.getElementById('btn-pack-modal-submit');
        const imageArea = document.getElementById('pack-image-upload-area');
        const imageInput = document.getElementById('pack-image-upload-input');
        const preview = document.getElementById('pack-image-preview');
        let selectedImage = null;

        const closeModal = () => { const o = document.getElementById('pack-modal-overlay'); if (o) o.remove(); this.enableBodyScroll(); };
        cancelBtn.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        imageArea.addEventListener('click', () => imageInput.click());
        imageArea.addEventListener('dragover', (e) => { e.preventDefault(); imageArea.classList.add('dragover'); });
        imageArea.addEventListener('dragleave', () => imageArea.classList.remove('dragover'));
        imageArea.addEventListener('drop', (e) => { e.preventDefault(); imageArea.classList.remove('dragover'); const files = e.dataTransfer.files; if (files.length) { selectedImage = files[0]; this.updatePackImagePreview(selectedImage); } });
        imageInput.addEventListener('change', (e) => { if (e.target.files.length) { selectedImage = e.target.files[0]; this.updatePackImagePreview(selectedImage); } });

        // Helper to add feature/product lines into the textarea
        const featureInput = document.getElementById('pack-feature-input');
        const addFeatureBtn = document.getElementById('btn-add-feature');
        const featuresTextarea = document.getElementById('pack-features-textarea');
        if (addFeatureBtn && featureInput && featuresTextarea) {
            addFeatureBtn.addEventListener('click', () => {
                const v = featureInput.value && featureInput.value.trim();
                if (!v) return;
                featuresTextarea.value = (featuresTextarea.value ? featuresTextarea.value + '\n' : '') + v;
                featureInput.value = '';
            });
            featureInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFeatureBtn.click(); } });
        }

        // Cálculo automático: el campo 'precio_final_deseado' (input-pack-descuento) se usa
        // para ingresar el precio final que desea el usuario; calculamos el porcentaje
        // de descuento antes de enviar el formulario.
        const precioOriginalInput = document.getElementById('input-pack-precio-original');
        const descuentoInput = document.getElementById('input-pack-descuento');

        const calcularDescuentoPack = () => {
            const precioOriginal = parseFloat(precioOriginalInput?.value) || 0;
            const precioDeseado = parseFloat(descuentoInput?.value) || 0;
            if (precioOriginal > 0 && precioDeseado > 0) {
                if (precioDeseado > precioOriginal) {
                        this.showNotification('El precio final no puede ser mayor al precio original', 'error');
                    descuentoInput.value = '';
                    return;
                }
                const descuentoPorcentaje = ((precioOriginal - precioDeseado) / precioOriginal) * 100;
                // Guardamos el porcentaje calculado como atributo data en el input para poder
                // usarlo en el submit handler.
                descuentoInput.dataset.calculated = parseFloat(descuentoPorcentaje.toFixed(2));
            } else {
                descuentoInput.dataset.calculated = '0';
            }
        };

        if (precioOriginalInput) precioOriginalInput.addEventListener('change', calcularDescuentoPack);
        if (descuentoInput) descuentoInput.addEventListener('input', calcularDescuentoPack);
        if (descuentoInput) descuentoInput.addEventListener('change', calcularDescuentoPack);

        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handlePackFormSubmit(mode, packId, form, selectedImage);
            closeModal();
        });
    }

    updatePackImagePreview(fileOrUrl) {
        const preview = document.getElementById('pack-image-preview'); if (!preview) return;
        if (typeof fileOrUrl === 'string') {
            preview.innerHTML = `<div class="image-preview-item"><img src="${fileOrUrl}" class="image-preview-img"><button type="button" class="image-preview-remove">×</button></div>`;
            preview.querySelector('.image-preview-remove').addEventListener('click', () => { preview.innerHTML = ''; const input = document.getElementById('pack-image-upload-input'); if (input) input.value = ''; });
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `<div class="image-preview-item"><img src="${e.target.result}" class="image-preview-img"><button type="button" class="image-preview-remove">×</button></div>`;
            preview.querySelector('.image-preview-remove').addEventListener('click', () => { preview.innerHTML = ''; const input = document.getElementById('pack-image-upload-input'); if (input) input.value = ''; });
        };
        reader.readAsDataURL(fileOrUrl);
    }

    /**
     * Setup de event listeners del modal
     */
    setupModalListeners(mode, productId) {
        const overlay = document.getElementById('product-modal-overlay');
        const form = document.getElementById('product-form');
        const closeBtn = document.querySelector('.modal-close');
        const cancelBtn = document.getElementById('btn-modal-cancel');
        const submitBtn = document.getElementById('btn-modal-submit');
        const imageUploadArea = document.getElementById('image-upload-area');
        const imageInput = document.getElementById('image-upload-input');
        const precioOriginalInput = document.getElementById('input-precio-original');
        const precioFinalInput = document.getElementById('input-precio-final');
        const descuentoInput = document.getElementById('input-descuento');
        let selectedImage = null;

        const product = mode === 'edit' ? this.productManager.getProductById(productId) : null;
        // Asegurar que la categoría del producto quede seleccionada cuando se edita
        const categorySelect = form.querySelector('select[name="categoria"]');
        if (categorySelect && product && product.categoria) {
            categorySelect.value = product.categoria;
        }

        // Mostrar preview de imagen existente (si existe) al editar
        if (product && product.imagenUrl && product.imagenUrl !== 'Img/no_image.jpg') {
            this.updateImagePreview(product.imagenUrl);
        }

        // Lógica de cálculo automático del descuento
        const calcularDescuento = () => {
            const precioOriginal = parseFloat(precioOriginalInput.value) || 0;
            const precioFinal = parseFloat(precioFinalInput.value) || 0;

            if (precioOriginal > 0 && precioFinal > 0) {
                if (precioFinal > precioOriginal) {
                    this.showNotification('El precio final no puede ser mayor al precio original', 'error');
                    precioFinalInput.value = '';
                    descuentoInput.value = 0;
                    return;
                }
                const descuentoPorcentaje = ((precioOriginal - precioFinal) / precioOriginal) * 100;
                descuentoInput.value = parseFloat(descuentoPorcentaje.toFixed(2));
            } else if (precioFinal === 0) {
                descuentoInput.value = 0;
            }
        };

        precioOriginalInput.addEventListener('change', calcularDescuento);
        precioFinalInput.addEventListener('input', calcularDescuento);
        precioFinalInput.addEventListener('change', calcularDescuento);

        // Cerrar modal
        const closeModal = () => {
            if (overlay && overlay.parentElement) {
                overlay.remove();
            }
            this.enableBodyScroll();
        };

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            });
        }
        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        // Manejo de imagen
        imageUploadArea.addEventListener('click', () => imageInput.click());

        imageUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            imageUploadArea.classList.add('dragover');
        });

        imageUploadArea.addEventListener('dragleave', () => {
            imageUploadArea.classList.remove('dragover');
        });

        imageUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            imageUploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                selectedImage = files[0];
                this.updateImagePreview(selectedImage);
            }
        });

        imageInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                selectedImage = e.target.files[0];
                this.updateImagePreview(selectedImage);
            }
        });

        // Enviar formulario
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.handleProductFormSubmit(mode, productId, form, selectedImage);
            closeModal();
        });
    }

    /**
     * Actualiza preview de imagen
     */
    updateImagePreview(fileOrUrl) {
        const preview = document.getElementById('image-preview');
        if (!preview) return;

        // Si se pasa una URL de imagen (imagen existente al editar)
        if (typeof fileOrUrl === 'string') {
            preview.innerHTML = `
                <div class="image-preview-item">
                    <img src="${fileOrUrl}" alt="Preview" class="image-preview-img">
                    <button type="button" class="image-preview-remove">×</button>
                </div>
            `;
            preview.querySelector('.image-preview-remove').addEventListener('click', () => {
                preview.innerHTML = '';
                const imageInput = document.getElementById('image-upload-input');
                if (imageInput) imageInput.value = '';
            });
            return;
        }

        // Si es un File
        const reader = new FileReader();
        reader.onload = (e) => {
            preview.innerHTML = `
                <div class="image-preview-item">
                    <img src="${e.target.result}" alt="Preview" class="image-preview-img">
                    <button type="button" class="image-preview-remove">×</button>
                </div>
            `;

            preview.querySelector('.image-preview-remove').addEventListener('click', () => {
                preview.innerHTML = '';
                const imageInput = document.getElementById('image-upload-input');
                if (imageInput) imageInput.value = '';
            });
        };
        reader.readAsDataURL(fileOrUrl);
    }

    /**
     * Setup de event listeners del modal de inventario
     */
    setupInventoryModalListeners(productId) {
        const overlay = document.getElementById('inventory-modal-overlay');
        const form = document.getElementById('inventory-form');
        const cancelBtn = document.getElementById('btn-inv-modal-cancel');
        const submitBtn = document.getElementById('btn-inv-modal-submit');

        const closeModal = () => {
            const o = document.getElementById('inventory-modal-overlay');
            if (o) o.remove();
            this.enableBodyScroll();
        };

        cancelBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });

        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const success = await this.handleInventoryModalSubmit(productId, form);
            // Solo cerrar si fue exitoso y se completó el guardado
            if (success) {
                // Esperar un poco después de que se complete el guardado
                setTimeout(() => {
                    closeModal();
                }, 1600);
            }
        });

        // Cargar datos de inventario
        this.loadInventoryInModal(productId);
    }

    /**
     * Carga datos de inventario en el modal de inventario
     * Ahora es consciente de los datos desde el backend
     */
    async loadInventoryInModal(productId) {
        const stockInput = document.getElementById('inv-modal-stock');
        const precioInput = document.getElementById('inv-modal-precio-compra');
        const proveedorInput = document.getElementById('inv-modal-proveedor');
        const notasInput = document.getElementById('inv-modal-notas');
        const loadingEl = document.getElementById('inv-modal-loading');
        const lastUpdatedEl = document.getElementById('inv-modal-last-updated');
        
        // Si los datos ya están precargados en productManager, rellenar inmediatamente (apertura instantánea)
        try {
            const product = this.productManager ? this.productManager.getProductById(productId) : null;
            const cached = product ? product.inventory : null;
            if (cached) {
                const stockVal = this._normalizeInventoryField(cached.stock);
                const precioVal = this._normalizeInventoryField(cached.precio_compra);
                const provVal = this._normalizeInventoryField(cached.proveedor);
                const notasVal = this._normalizeInventoryField(cached.notas);
                const lastVal = this._normalizeInventoryField(cached.last_updated);

                if (stockInput) stockInput.value = stockVal !== null && stockVal !== undefined ? stockVal : '';
                if (precioInput) precioInput.value = precioVal !== null && precioVal !== undefined ? precioVal : '';
                if (proveedorInput) proveedorInput.value = provVal !== null && provVal !== undefined ? provVal : '';
                if (notasInput) notasInput.value = notasVal !== null && notasVal !== undefined ? notasVal : '';

                if (lastUpdatedEl) {
                    if (lastVal) {
                        lastUpdatedEl.textContent = `📅 Última actualización: ${lastVal}`;
                        lastUpdatedEl.style.display = 'block';
                    } else {
                        lastUpdatedEl.style.display = 'block';
                        lastUpdatedEl.textContent = `➕ Sin datos de inventario - Puedes agregar información ahora`;
                    }
                }

                if (stockInput) stockInput.disabled = false;
                if (precioInput) precioInput.disabled = false;
                if (proveedorInput) proveedorInput.disabled = false;
                if (notasInput) notasInput.disabled = false;
                if (loadingEl) loadingEl.style.display = 'none';



                return; // ya rellenamos instantáneamente
            }
        } catch (err) { console.warn('Error leyendo caché de producto para modal:', err); }

        try {
            // Mostrar loading y deshabilitar todos los inputs
            if (loadingEl) {
                loadingEl.style.display = 'block';
                loadingEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando datos...';
                loadingEl.style.color = '#4a90e2';
            }
            
            if (stockInput) stockInput.disabled = true;
            if (precioInput) precioInput.disabled = true;
            if (proveedorInput) proveedorInput.disabled = true;
            if (notasInput) notasInput.disabled = true;

            console.log(`📂 Cargando inventario para producto: ${productId}`);
            const inventoryData = null; // Removed inventoryApiClient usage

            console.log(`📊 Datos de inventario cargados:`, inventoryData);
            console.log(`✔️ ¿Tiene datos? ${inventoryData ? inventoryData.hasData : 'null'}`);

            // Llenar stock (normalizar valores complejos)
            if (stockInput) {
                const stockVal = inventoryData ? this._normalizeInventoryField(inventoryData.stock) : null;
                stockInput.value = (stockVal !== null && stockVal !== undefined) ? stockVal : '';
                console.log(`📦 Stock input value: "${stockInput.value}"`);
            }

            // Llenar precio (normalizar)
            if (precioInput) {
                const precioVal = inventoryData ? this._normalizeInventoryField(inventoryData.precio_compra) : null;
                precioInput.value = (precioVal !== null && precioVal !== undefined) ? precioVal : '';
                console.log(`💰 Precio input value: "${precioInput.value}"`);
            }

            // Llenar proveedor (normalizar)
            if (proveedorInput) {
                const provVal = inventoryData ? this._normalizeInventoryField(inventoryData.proveedor) : null;
                proveedorInput.value = (provVal !== null && provVal !== undefined) ? provVal : '';
                console.log(`🏢 Proveedor input value: "${proveedorInput.value}"`);
            }

            // Llenar notas (normalizar)
            if (notasInput) {
                const notasVal = inventoryData ? this._normalizeInventoryField(inventoryData.notas) : null;
                notasInput.value = (notasVal !== null && notasVal !== undefined) ? notasVal : '';
                console.log(`📝 Notas input value: "${notasInput.value}"`);
            }

            // 🎯 ACTUALIZAR LA TARJETA DEL PRODUCTO EN TIEMPO REAL (mientras carga)
            const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
            if (productCard && inventoryData) {
                const stockEl = productCard.querySelector('.product-inventory-stock');
                const precioEl = productCard.querySelector('.product-inventory-precio');
                const provEl = productCard.querySelector('.product-inventory-proveedor');
                
                const stockVal = this._normalizeInventoryField(inventoryData.stock);
                const precioVal = this._normalizeInventoryField(inventoryData.precio_compra);
                const provVal = this._normalizeInventoryField(inventoryData.proveedor);

                if (stockEl && stockVal !== null && stockVal !== undefined && stockVal !== '') {
                    stockEl.textContent = `Stock: ${stockVal}`;
                    console.log(`✅ Stock actualizado en tarjeta: ${stockVal}`);
                }
                
                if (precioEl && precioVal !== null && precioVal !== undefined && precioVal !== '') {
                    precioEl.textContent = `Costo: $${parseFloat(precioVal).toFixed(2)}`;
                    console.log(`✅ Precio actualizado en tarjeta: $${precioVal}`);
                }

                if (provEl) {
                    if (provVal) provEl.textContent = `Proveedor: ${provVal}`;
                    else provEl.textContent = '';
                }
            }

            // Actualizar producto en memoria (productManager) para consistencia global y notificar UI
            try {
                if (this.productManager) {
                    const prod = this.productManager.getProductById(productId);
                    if (prod) {
                        if (inventoryData && inventoryData.hasData) {
                            prod.inventory = inventoryData;
                            prod.stock = inventoryData.stock !== undefined ? inventoryData.stock : null;
                            prod.precio_compra = inventoryData.precio_compra !== undefined && inventoryData.precio_compra !== null ? parseFloat(inventoryData.precio_compra) : null;
                        } else {
                            prod.inventory = null;
                            prod.stock = null;
                            prod.precio_compra = null;
                        }
                        document.dispatchEvent(new CustomEvent('inventories:updated', { detail: { ids: [productId] } }));
                    }
                }
            } catch (e) { console.warn('No se pudo actualizar productManager desde modal:', e); }

            // Mostrar última actualización
            if (lastUpdatedEl) {
                const last = inventoryData ? this._normalizeInventoryField(inventoryData.last_updated) : null;
                if (inventoryData && inventoryData.hasData && last) {
                    lastUpdatedEl.textContent = `📅 Última actualización: ${last}`;
                    lastUpdatedEl.style.display = 'block';
                    lastUpdatedEl.style.backgroundColor = '#e8f5e9';
                    lastUpdatedEl.style.borderLeftColor = '#4caf50';
                    lastUpdatedEl.style.borderLeftWidth = '4px';
                    lastUpdatedEl.style.paddingLeft = '0.75rem';
                    console.log(`✅ Datos de inventario encontrados`);
                } else if (inventoryData && inventoryData.hasData) {
                    lastUpdatedEl.textContent = `📅 Registro actualizado (sin fecha exacta)`;
                    lastUpdatedEl.style.display = 'block';
                    lastUpdatedEl.style.backgroundColor = '#e8f5e9';
                    lastUpdatedEl.style.borderLeftColor = '#4caf50';
                    lastUpdatedEl.style.borderLeftWidth = '4px';
                    lastUpdatedEl.style.paddingLeft = '0.75rem';
                } else {
                    lastUpdatedEl.textContent = `➕ Sin datos de inventario - Puedes agregar información ahora`;
                    lastUpdatedEl.style.display = 'block';
                    lastUpdatedEl.style.backgroundColor = '#fff3e0';
                    lastUpdatedEl.style.borderLeftColor = '#ff9800';
                    lastUpdatedEl.style.borderLeftWidth = '4px';
                    lastUpdatedEl.style.paddingLeft = '0.75rem';
                    console.log(`⚠️ Sin datos de inventario previos`);
                }
            }

            // RE-HABILITAR TODOS LOS INPUTS EXPLÍCITAMENTE
            if (stockInput) stockInput.disabled = false;
            if (precioInput) precioInput.disabled = false;
            if (proveedorInput) proveedorInput.disabled = false;
            if (notasInput) notasInput.disabled = false;
            
            if (loadingEl) loadingEl.style.display = 'none';
            console.log('✅ Modal de inventario listo para editar');
            
        } catch (error) {
            console.error('❌ Error al cargar inventario:', error);
            if (loadingEl) {
                loadingEl.style.display = 'block';
                loadingEl.innerHTML = '<span style="color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i> Error: ' + (error.message || 'desconocido') + '</span>';
            }
            // RE-HABILITAR INCLUSO CON ERROR
            if (stockInput) stockInput.disabled = false;
            if (precioInput) precioInput.disabled = false;
            if (proveedorInput) proveedorInput.disabled = false;
            if (notasInput) notasInput.disabled = false;
        }
    }

    /**
     * Guarda datos de inventario desde el modal separado
     */
    async handleInventoryModalSubmit(productId, form) {
        try {
            const submitBtn = document.getElementById('btn-inv-modal-submit');
            const formInputs = document.querySelectorAll('#inventory-form input, #inventory-form textarea');
            const savingIndicator = document.getElementById('inv-modal-loading');
            
            // Deshabilitar inputs y botón
            formInputs.forEach(input => input.disabled = true);
            if (submitBtn) submitBtn.disabled = true;
            
            // Mostrar panel "Guardando"
            if (savingIndicator) {
                savingIndicator.style.display = 'block';
                savingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando datos...';
                savingIndicator.style.color = '#4a90e2';
            }
            
            // Capturar valores DIRECTAMENTE de los inputs por ID (más confiable que FormData)
            const stockInput = document.getElementById('inv-modal-stock');
            const precioInput = document.getElementById('inv-modal-precio-compra');
            const proveedorInput = document.getElementById('inv-modal-proveedor');
            const notasInput = document.getElementById('inv-modal-notas');
            
            const inventoryData = {
                stock: (stockInput ? stockInput.value : '') || '',
                precio_compra: (precioInput ? precioInput.value : '') || '',
                proveedor: (proveedorInput ? proveedorInput.value : '') || '',
                notas: (notasInput ? notasInput.value : '') || ''
            };

            console.log(`📝 Datos capturados del formulario:`, inventoryData);

            // Validar que hay al menos un campo lleno
            const hasData = Object.values(inventoryData).some(value => value !== '' && value !== null);
            if (!hasData) {
                console.warn('⚠️ No hay datos para guardar');
                this.showNotification('Debes llenar al menos un campo', 'warning');
                if (savingIndicator) savingIndicator.style.display = 'none';
                formInputs.forEach(input => input.disabled = false);
                if (submitBtn) submitBtn.disabled = false;
                return false; // No fue exitoso
            }

            console.log(`💾 Guardando inventario para producto ${productId}:`, inventoryData);
            
            // Guardar datos en el backend (usar la respuesta normalizada si está disponible)
            const saved = null; // Removed inventoryApiClient usage
            console.log(`🔄 Datos guardados en backend para ${productId}`, saved);

            // Actualizar el producto en memoria con los datos guardados (preferir respuesta del servidor)
            const product = this.productManager.getProductById(productId);
            if (product) {
                const s = (saved && saved.stock !== undefined && saved.stock !== null) ? saved.stock : (inventoryData.stock ? parseInt(inventoryData.stock) : null);
                const p = (saved && saved.precio_compra !== undefined && saved.precio_compra !== null) ? saved.precio_compra : (inventoryData.precio_compra ? parseFloat(inventoryData.precio_compra) : null);
                product.stock = s !== null ? s : null;
                product.precio_compra = p !== null ? p : null;
                product.inventory = (saved && saved.hasData) ? saved : {
                    product_id: productId,
                    stock: product.stock,
                    precio_compra: product.precio_compra,
                    proveedor: inventoryData.proveedor || null,
                    notas: inventoryData.notas || null,
                    last_updated: (saved && saved.last_updated) ? saved.last_updated : (new Date()).toISOString(),
                    hasData: true
                };
                // Notificar al resto de la UI que los datos cambiaron (tarjetas, contadores...)
                document.dispatchEvent(new CustomEvent('inventories:updated', { detail: { ids: [productId] } }));
            }

            // Actualizar la tarjeta del producto en la grid
            const productCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
            if (productCard) {
                const stockEl = productCard.querySelector('.product-inventory-stock');
                const precioEl = productCard.querySelector('.product-inventory-precio');
                if (stockEl) {
                    stockEl.textContent = `Stock: ${inventoryData.stock || '—'}`;
                }
                if (precioEl) {
                    precioEl.textContent = `Costo: ${inventoryData.precio_compra ? `$${parseFloat(inventoryData.precio_compra).toFixed(2)}` : '—'}`;
                }
                console.log(`🔄 Tarjeta de producto ${productId} actualizada en UI`);
            }

            // Mostrar éxito
            if (savingIndicator) {
                savingIndicator.style.display = 'block';
                savingIndicator.innerHTML = '<span style="color: #27ae60;"><i class="fas fa-check-circle"></i> ¡Guardado exitosamente!</span>';
            }

            console.log('✅ Inventario guardado correctamente para:', productId);
            this.showNotification('Datos de inventario guardados exitosamente', 'success');

            // Re-habilitar después de mostrar éxito
            setTimeout(() => {
                formInputs.forEach(input => input.disabled = false);
                if (submitBtn) submitBtn.disabled = false;
                if (savingIndicator) savingIndicator.style.display = 'none';
            }, 1500);
            
            return true; // Fue exitoso
        } catch (error) {
            console.error('❌ Error al guardar inventario:', error);
            
            const submitBtn = document.getElementById('btn-inv-modal-submit');
            const formInputs = document.querySelectorAll('#inventory-form input, #inventory-form textarea');
            const savingIndicator = document.getElementById('inv-modal-loading');
            
            // Re-habilitar en caso de error
            formInputs.forEach(input => input.disabled = false);
            if (submitBtn) submitBtn.disabled = false;
            if (savingIndicator) {
                savingIndicator.style.display = 'block';
                savingIndicator.innerHTML = '<span style="color: #e74c3c;"><i class="fas fa-exclamation-circle"></i> Error al guardar</span>';
            }
            this.showNotification(`Error: ${error.message}`, 'error');
            
            return false; // No fue exitoso
        }
    }

    /**
     * Carga datos de inventario interno en el modal de creación
     */
    async loadInventoryDataInModal(productId) {
        try {
            const loadingEl = document.getElementById('inventory-loading');
            if (loadingEl) loadingEl.style.display = 'block';

            const inventoryData = null; // Removed inventoryApiClient usage

            // Llenar campos del formulario con los datos obtenidos
            const stockInput = document.getElementById('inventory-stock');
            const precioCompraInput = document.getElementById('inventory-precio-compra');
            const proveedorInput = document.getElementById('inventory-proveedor');
            const notasInput = document.getElementById('inventory-notas');
            const lastUpdatedEl = document.getElementById('inventory-last-updated');

            if (stockInput && inventoryData.stock !== null && inventoryData.stock !== undefined) {
                stockInput.value = inventoryData.stock;
            }

            if (precioCompraInput && inventoryData.precio_compra !== null && inventoryData.precio_compra !== undefined) {
                precioCompraInput.value = inventoryData.precio_compra;
            }

            if (proveedorInput && inventoryData.proveedor) {
                proveedorInput.value = inventoryData.proveedor;
            }

            if (notasInput && inventoryData.notas) {
                notasInput.value = inventoryData.notas;
            }

            if (lastUpdatedEl && inventoryData.last_updated) {
                lastUpdatedEl.textContent = `Última actualización: ${inventoryData.last_updated}`;
            }

            if (loadingEl) loadingEl.style.display = 'none';
        } catch (error) {
            console.error('Error al cargar datos de inventario:', error);
            const loadingEl = document.getElementById('inventory-loading');
            if (loadingEl) {
                loadingEl.style.display = 'block';
                loadingEl.innerHTML = '<span style="color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i> Error al cargar inventario</span>';
            }
        }
    }

    /**
     * Setup de event listeners generales
     */
    setupEventListeners() {
        // Botón agregar (producto o pack según vista)
        const addBtn = document.getElementById('btn-add-product');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (this.currentView === 'packs' && this.packManager) return this.openPackModal(null, 'create');
                return this.openProductModal(null, 'create');
            });
        }

        // Botón recargar
        const refreshBtn = document.getElementById('btn-refresh-products');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.handleRefreshProducts());
        }

        // Botón administrar imágenes del repo
        const imagesBtn = document.getElementById('btn-manage-repo-images');
        if (imagesBtn) {
            imagesBtn.addEventListener('click', () => {
                try {
                        if (!this.productManager) return this.showNotification('ProductManager no inicializado', 'error');
                        const ghManager = this.productManager.githubManager;
                        if (!ghManager || !ghManager.isConfigured()) {
                            return this.showNotification('Token de GitHub no configurado. Ve a Ajustes para configurarlo.', 'error');
                        }

                    if (!this.githubImagesModal) {
                        this.githubImagesModal = new GitHubImagesModal(ghManager, this.productManager);
                    }
                    this.githubImagesModal.show();
                } catch (err) {
                    console.error('Error abriendo modal de imágenes:', err);
                    this.showNotification('No se pudo abrir el modal de imágenes: ' + err.message, 'error');
                }
            });
        }

        // Búsqueda
        const searchInput = document.getElementById('search-products');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const q = e.target.value || '';
                if (this.currentView === 'packs' && this.packManager) {
                    const results = this.packManager.searchPacks(q);
                    this.renderPacksGrid(results);
                } else {
                    const results = this.productManager.searchProducts(q);
                    this.renderProductsGrid(results);
                }
            });
        }

        // Filtro de categoría
        this.updateCategoryFilter();
        const categoryFilter = document.getElementById('filter-category');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                const val = e.target.value;
                if (this.currentView === 'packs' && this.packManager) {
                    const results = this.packManager.filterByCategory(val);
                    this.renderPacksGrid(results);
                } else {
                    const results = this.productManager.filterByCategory(val);
                    this.renderProductsGrid(results);
                }
            });
        }

        // Filtro por modificado / nuevos
        const modifiedFilter = document.getElementById('filter-modified');
        if (modifiedFilter) {
            modifiedFilter.addEventListener('change', (e) => {
                const v = e.target.value;
                let results = this.productManager.products;
                if (v === 'modified') {
                    const modifiedIds = new Set(this.productManager.getStagedChanges().filter(c=>c.type==='modify').map(c=>c.productId));
                    results = results.filter(p => modifiedIds.has(p.id));
                } else if (v === 'new') {
                    const newIds = new Set(this.productManager.getStagedChanges().filter(c=>c.type==='new').map(c=>c.productId));
                    results = results.filter(p => newIds.has(p.id));
                }
                this.renderProductsGrid(results);
            });
        }

        // Sort
        const sortSelect = document.getElementById('sort-products');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                const v = e.target.value;
                let results = [...this.productManager.products];
                if (v === 'price_desc') results.sort((a,b)=>b.precioFinal - a.precioFinal);
                else if (v === 'price_asc') results.sort((a,b)=>a.precioFinal - b.precioFinal);
                else if (v === 'date_modified') results.sort((a,b)=>new Date(b.modified_at || 0) - new Date(a.modified_at || 0));
                else if (v === 'date_created') results.sort((a,b)=>new Date(b.created_at || 0) - new Date(a.created_at || 0));
                this.renderProductsGrid(results);
            });
        }

        // Export CSV
        const exportBtn = document.getElementById('btn-export-csv');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                try {
                    const products = this.productManager.products || [];
                    const headers = ['nombre','categoria','precio','descuento','disponibilidad','created_at','modified_at'];
                    const rows = products.map(p => headers.map(h => (p[h]===null?"": String(p[h] || ''))).join(','));
                    const csv = [headers.join(','), ...rows].join('\n');
                    const dataUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = 'products_export.csv';
                    a.click();
                    } catch (err) { console.error('export csv error', err); this.showNotification('Error exportando CSV: '+err.message, 'error'); }
            });
        }

        // Clear filters
        const clearFiltersBtn = document.getElementById('btn-clear-filters');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                const search = document.getElementById('search-products'); if (search) search.value = '';
                const cat = document.getElementById('filter-category'); if (cat) cat.value = '';
                const mod = document.getElementById('filter-modified'); if (mod) mod.value = 'all';
                const sort = document.getElementById('sort-products'); if (sort) sort.value = 'default';
                this.renderProductsGrid();
            });
        }

        // Botones de staging
        const discardAllBtn = document.getElementById('btn-discard-all');
        if (discardAllBtn) {
            discardAllBtn.addEventListener('click', () => this.handleDiscardAll());
        }

        const syncBtn = document.getElementById('btn-sync-github');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.handleSyncGitHub());
        }

        // Toggle Productos / Cambios (vista en la cabecera)
        const btnProducts = document.getElementById('btn-view-products');
        const btnPacks = document.getElementById('btn-view-packs');
        const btnChanges = document.getElementById('btn-view-changes');
        const productsGrid = document.getElementById('products-grid');
        const packsGrid = document.getElementById('packs-grid');
        const stagingPanel = document.getElementById('staging-panel');

        if (btnProducts && btnPacks && btnChanges) {
            btnProducts.addEventListener('click', () => {
                this.currentView = 'products';
                btnProducts.classList.add('active');
                btnPacks.classList.remove('active');
                btnChanges.classList.remove('active');
                if (productsGrid) productsGrid.classList.remove('hidden');
                if (packsGrid) packsGrid.classList.add('hidden');
                if (stagingPanel) stagingPanel.classList.add('hidden');
                const toolbar = document.querySelector('.inventory-toolbar'); if (toolbar) toolbar.classList.remove('hidden');
                this.updateCategoryFilter();
                this.renderProductsGrid();
                // Ajustar texto del botón agregar
                const addBtn = document.getElementById('btn-add-product'); if (addBtn) addBtn.innerHTML = '<i class="fas fa-plus"></i> Nuevo Producto';
            });

            btnPacks.addEventListener('click', () => {
                this.currentView = 'packs';
                btnPacks.classList.add('active');
                btnProducts.classList.remove('active');
                btnChanges.classList.remove('active');
                if (packsGrid) packsGrid.classList.remove('hidden');
                if (productsGrid) productsGrid.classList.add('hidden');
                if (stagingPanel) stagingPanel.classList.add('hidden');
                const toolbar = document.querySelector('.inventory-toolbar'); if (toolbar) toolbar.classList.remove('hidden');
                this.updateCategoryFilter();
                this.renderPacksGrid();
                const addBtn = document.getElementById('btn-add-product'); if (addBtn) addBtn.innerHTML = '<i class="fas fa-plus"></i> Nuevo Pack';
            });

            btnChanges.addEventListener('click', () => {
                this.currentView = 'changes';
                btnChanges.classList.add('active');
                btnProducts.classList.remove('active');
                btnPacks.classList.remove('active');
                if (productsGrid) productsGrid.classList.add('hidden');
                if (packsGrid) packsGrid.classList.add('hidden');
                if (stagingPanel) stagingPanel.classList.remove('hidden');
                const toolbar = document.querySelector('.inventory-toolbar'); if (toolbar) toolbar.classList.add('hidden');
                this.updateStagingPanel();
            });
        }
    }

    /**
     * Actualiza el filtro de categorías
     */
    getActiveManager() {
        if (this.currentView === 'packs' && this.packManager) return this.packManager;
        return this.productManager;
    }

    updateCategoryFilter() {
        const categoryFilter = document.getElementById('filter-category');
        if (!categoryFilter) return;

        const manager = this.getActiveManager();
        const categories = manager ? (manager.getAllCategories ? manager.getAllCategories() : []) : [];
        const currentValue = categoryFilter.value;

        const options = `
            <option value="">Todas las categorías</option>
            ${categories.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
        `;

        categoryFilter.innerHTML = options;
        categoryFilter.value = currentValue;
    }

    /**
     * Aplica previews de imágenes almacenadas en staging a las tarjetas de productos
     * Esto permite que al marcar un cambio con nueva imagen la vista muestre
     * inmediatamente la imagen seleccionada desde IndexedDB (Base64).
     */
    async applyStagedImagesToGrid() {
        const allManagers = [this.productManager, this.packManager].filter(Boolean);
        for (const mgr of allManagers) {
            try {
                const changesWithImages = (mgr.getStagedChanges ? mgr.getStagedChanges() : []).filter(c => c.hasNewImage && c.imageKey);
                if (!changesWithImages || changesWithImages.length === 0) continue;

                for (const change of changesWithImages) {
                    try {
                        const imgData = await mgr.stagingDB.getImageFromIDB(change.imageKey);
                        if (!imgData || !imgData.base64) continue;

                        const src = base64ToDataURL(imgData.base64, imgData.mimeType || 'image/jpeg');
                        const selectorId = change.productId || change.packId || change.productId;
                        const card = document.querySelector(`.product-card[data-product-id="${selectorId}"], .pack-card[data-pack-id="${selectorId}"]`);
                        if (!card) continue;

                        const imgEl = card.querySelector('.product-image img');
                        if (imgEl) imgEl.src = src;

                        try {
                            const sizeLabelEl = card.querySelector('.product-image-size');
                            if (sizeLabelEl && imgData.base64) {
                                const b64 = imgData.base64;
                                let padding = 0;
                                if (b64.endsWith('==')) padding = 2;
                                else if (b64.endsWith('=')) padding = 1;
                                const bytes = Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
                                sizeLabelEl.textContent = this.formatBytes ? this.formatBytes(bytes) : '';
                                sizeLabelEl.title = `${bytes} bytes`;
                            }
                        } catch (e) { /* ignore */ }

                        if (!card.querySelector('.product-badge.modified')) {
                            const imgWrap = card.querySelector('.product-image');
                            if (imgWrap) {
                                const badge = document.createElement('span');
                                badge.className = 'product-badge modified';
                                badge.textContent = 'Modificado';
                                imgWrap.appendChild(badge);
                            }
                        }
                    } catch (err) {
                        console.warn('applyStagedImagesToGrid error', err);
                    }
                }
            } catch (e) { /* ignore manager failures */ }
        }
    }

    /**
     * Formatea bytes a cadena legible (B, KB, MB)
     */
    formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${sizes[i]}`;
    }

    /**
     * Intenta obtener el tamaño de las imágenes (HEAD) y completar las etiquetas
     */
    async populateProductImageSizes() {
        try {
            const els = Array.from(document.querySelectorAll('.product-image-size'));
            if (!els || els.length === 0) return;

            const tasks = els.map(async (el) => {
                try {
                    const src = el.dataset.src;
                    if (!src) return;

                    // Skip local placeholder
                    if (src.includes('no_image.jpg')) {
                        el.textContent = '';
                        return;
                    }

                    // Try HEAD first
                    let size = null;
                    try {
                        const resp = await fetch(src, { method: 'HEAD' });
                        if (resp && resp.ok) {
                            const cl = resp.headers.get('content-length');
                            if (cl) size = parseInt(cl, 10);
                        }
                    } catch (headErr) {
                        // ignore
                    }

                    // If HEAD didn't return size, avoid heavy GET; leave blank
                    if (size != null && !isNaN(size)) {
                        el.textContent = this.formatBytes(size);
                        el.title = `${size} bytes`;
                    } else {
                        el.textContent = '';
                    }
                } catch (err) {
                    // avoid bubbling errors
                    console.warn('populateProductImageSizes error', err);
                }
            });

            await Promise.allSettled(tasks);
        } catch (err) {
            console.warn('populateProductImageSizes outer error', err);
        }
    }

    /**
     * Añade listeners a las miniaturas de producto para abrir un modal con la imagen grande
     */
    setupProductImageModalListeners() {
        try {
            const imgs = Array.from(document.querySelectorAll('.product-image img'));
            imgs.forEach(img => {
                img.style.cursor = 'pointer';
                if (img.dataset.listenerAdded) return;
                img.addEventListener('click', (e) => {
                    const src = img.src;
                    const alt = img.alt || '';
                    this.showProductImageModal(src, alt);
                });
                img.dataset.listenerAdded = '1';
            });
        } catch (err) {
            console.warn('setupProductImageModalListeners error', err);
        }
    }

    /**
     * Muestra un modal simple con la imagen (clic para cerrar, ESC para cerrar)
     */
    showProductImageModal(src, alt = '') {
        try {
            // Remover modal previo si existe
            const existing = document.getElementById('product-image-modal-overlay');
            if (existing) existing.remove();

            const modalHtml = `
                <div id="product-image-modal-overlay" class="modal-overlay active" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);z-index:2000;">
                    <div role="dialog" aria-modal="true" style="max-width:90%;max-height:90%;display:flex;flex-direction:column;gap:0.5rem;align-items:center;">
                        <img src="${src}" alt="${alt}" style="max-width:100%;max-height:calc(100vh - 120px);border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,0.5);">
                        <button id="product-image-modal-close" style="background:#fff;border:none;padding:0.4rem 0.6rem;border-radius:6px;cursor:pointer;">Cerrar</button>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            // Bloquear scroll del fondo
            this.disableBodyScroll();

            const overlay = document.getElementById('product-image-modal-overlay');
            if (!overlay) return;

            const onClose = () => { const o = document.getElementById('product-image-modal-overlay'); if (o) o.remove(); document.removeEventListener('keydown', escListener); this.enableBodyScroll(); };

            const escListener = (e) => { if (e.key === 'Escape') onClose(); };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) onClose();
            });

            const closeBtn = document.getElementById('product-image-modal-close');
            if (closeBtn) closeBtn.addEventListener('click', onClose);

            document.addEventListener('keydown', escListener);
        } catch (err) {
            console.warn('showProductImageModal error', err);
        }
    }

    /**
     * Manejadores de eventos
     */

    async handleProductFormSubmit(mode, productId, form, imageFile) {
        const formData = new FormData(form);
        const descuentoCalculado = parseFloat(formData.get('descuento')) || 0;
        
        // Si es un producto NUEVO, generar el ID temprano para poder asociar el inventario después
        let workingProductId = productId;
        if (mode === 'new') {
            if (typeof generateProductId === 'function') {
                workingProductId = generateProductId();
            } else {
                workingProductId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
        }
        
        // SEGURIDAD: Construcción explícita de productData (whitelist de campos)
        // Los campos de inventario (inventory_*) se incluyen TEMPORALMENTE para pasarlos al staging,
        // pero se eliminarán durante prepareProductForExport
        const productData = {
            id: workingProductId,
            nombre: formData.get('nombre'),
            categoria: formData.get('categoria'),
            precio: parseFloat(formData.get('precio')),
            descuento: descuentoCalculado,
            descripcion: formData.get('descripcion'),
            disponibilidad: formData.get('disponibilidad') === 'on',
            nuevo: formData.get('nuevo') === 'on',
            oferta: formData.get('oferta') === 'on',
            mas_vendido: formData.get('mas_vendido') === 'on',
            // Incluir campos de inventario temporalmente (se descartarán en prepareProductForExport)
            // para que estén disponibles cuando se guarde el inventario
            inventory_stock: formData.get('inventory_stock'),
            inventory_precio_compra: formData.get('inventory_precio_compra'),
            inventory_proveedor: formData.get('inventory_proveedor'),
            inventory_notas: formData.get('inventory_notas')
        };

        // Si estamos editando, mantener las imagenes actuales si no se selecciona una nueva
        if (mode === 'edit') {
            const existingProduct = this.productManager.getProductById(productId);
            productData.imagenes = existingProduct?.imagenes ? [...existingProduct.imagenes] : (existingProduct?.imagenes || []);
        }

        try {
            const changeType = mode === 'edit' ? 'modify' : 'new';
            await this.productManager.stageChange(changeType, productData, imageFile);
            
            // Guardar datos privados de inventario si existen (SEPARADAMENTE)
            // Ahora también para productos nuevos (con el ID que se acaba de asignar)
            if (workingProductId) {
                await this.saveInventoryData(workingProductId, formData);
            }
            
            this.updateStagingPanel();
            this.renderProductsGrid();
            
            this.showNotification('Producto guardado en staging', 'success');
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Guarda datos privados del inventario interno (SEPARADOS del producto)
     * IMPORTANTE: Los datos de inventario se guardan en Google Apps Script backend, NOT en GitHub
     * Si el backend no está disponible, se guardan en localStorage como respaldo
     * @param {string} productId - ID del producto
     * @param {FormData} formData - Datos del formulario (contiene campos con prefijo inventory_*)
     */
    async saveInventoryData(productId, formData) {
        try {
            // SEGURIDAD: Solo extraer campos de inventario (con prefijo inventory_)
            // Aplicar valores por defecto si están vacíos
            const inventoryData = {
                stock: formData.get('inventory_stock') !== '' && formData.get('inventory_stock') !== null ? formData.get('inventory_stock') : 0,
                precio_compra: formData.get('inventory_precio_compra') !== '' && formData.get('inventory_precio_compra') !== null ? formData.get('inventory_precio_compra') : 0,
                proveedor: (formData.get('inventory_proveedor') !== '' && formData.get('inventory_proveedor') !== null) ? formData.get('inventory_proveedor') : null,
                notas: (formData.get('inventory_notas') !== '' && formData.get('inventory_notas') !== null) ? formData.get('inventory_notas') : 'nota'
                // ❌ NUNCA incluir campos de producto: nombre, categoria, precio, etc.
            };

            // Solo guardar si hay al menos un campo con datos (siempre guardar si hay algo rellenado)
            const stockFilled = formData.get('inventory_stock') !== '' && formData.get('inventory_stock') !== null;
            const precioFilled = formData.get('inventory_precio_compra') !== '' && formData.get('inventory_precio_compra') !== null;
            const proveedorFilled = formData.get('inventory_proveedor') !== '' && formData.get('inventory_proveedor') !== null;
            const notasFilled = formData.get('inventory_notas') !== '' && formData.get('inventory_notas') !== null;
            
            const hasData = stockFilled || precioFilled || proveedorFilled || notasFilled;
            if (!hasData) {
                console.log(`ℹ️ No hay datos de inventario para guardar para producto ${productId}`);
                return;
            }

            console.log(`🔄 Intentando guardar inventario para ${productId} en backend...`, inventoryData);

            // Removed backend save, inventoryApiClient no longer used
            // Guardar en localStorage como respaldo temporal
            this._saveInventoryToLocalStorage(productId, inventoryData);

            console.log(`💾 Datos de inventario guardados en localStorage para ${productId}. Se sincronizarán al guardar en GitHub.`);
        } catch (error) {
            console.error(`❌ Error procesando datos de inventario para ${productId}:`, error);
            // No lanzamos el error para que no bloquee el guardado del producto
        }
    }

    /**
     * Guarda datos de inventario en localStorage como respaldo
     * @private
     */
    _saveInventoryToLocalStorage(productId, inventoryData) {
        try {
            const storageKey = `asere_inventory_${productId}`;
            const dataToStore = {
                productId,
                inventoryData,
                timestamp: new Date().toISOString(),
                synced: false
            };
            localStorage.setItem(storageKey, JSON.stringify(dataToStore));
            console.log(`Datos guardados en localStorage: ${storageKey}`);
        } catch (err) {
            console.error('Error guardando en localStorage:', err);
        }
    }

    /**
     * Elimina datos de inventario del localStorage
     * @private
     */
    _removeInventoryFromLocalStorage(productId) {
        try {
            const storageKey = `asere_inventory_${productId}`;
            localStorage.removeItem(storageKey);
        } catch (err) {
            console.warn('Error eliminando del localStorage:', err);
        }
    }

    /**
     * Recupera todos los datos de inventario del localStorage (respaldos pendientes)
     * @private
     */
    _getPendingInventoryFromLocalStorage() {
        try {
            const pending = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('asere_inventory_')) {
                    const stored = JSON.parse(localStorage.getItem(key));
                    if (stored && !stored.synced) {
                        pending[stored.productId] = stored.inventoryData;
                    }
                }
            }
            return pending;
        } catch (err) {
            console.warn('Error recuperando inventario de localStorage:', err);
            return {};
        }
    }

    async handlePackFormSubmit(mode, packId, form, imageFile) {
        const formData = new FormData(form);
        const packData = {
            id: mode === 'edit' ? packId : undefined,
            nombre: formData.get('nombre'),
            categoria: 'Pack',
            precio: parseFloat(formData.get('precio')) || 0,
            // descuento se calculará a partir de 'precio_final_deseado' si está presente
            descuento: 0,
            descripcion: formData.get('descripcion'),
            caracteristicas: (formData.get('caracteristicas') || '').split('\n').map(s => s.trim()).filter(s => s.length > 0),
            disponible: formData.get('disponible') === 'on',
            top: formData.get('top') === 'on',
            nuevo: formData.get('nuevo') === 'on',
            oferta: formData.get('oferta') === 'on'
        };

        // Si el formulario trae 'precio_final_deseado', calcular porcentaje de descuento
        const precioOriginal = parseFloat(formData.get('precio')) || 0;
        const precioFinalDeseado = parseFloat(formData.get('precio_final_deseado')) || null;
        if (precioOriginal > 0 && precioFinalDeseado && precioFinalDeseado >= 0) {
            if (precioFinalDeseado > precioOriginal) {
                this.showNotification('El precio final no puede ser mayor al precio original', 'error');
                return;
            }
            const descuentoPorc = ((precioOriginal - precioFinalDeseado) / precioOriginal) * 100;
            packData.descuento = parseFloat(descuentoPorc.toFixed(2));
        } else {
            // fallback: si existe un campo descuento numérico (compatibilidad), usarlo
            const fallback = parseFloat(formData.get('descuento'));
            packData.descuento = !isNaN(fallback) ? fallback : 0;
        }

        if (mode === 'edit') {
            const existing = this.packManager.getPackById(packId);
            packData.imagenes = existing?.imagenes ? [...existing.imagenes] : (existing?.imagen ? [existing.imagen] : []);
        }

        try {
            const changeType = mode === 'edit' ? 'modify' : 'new';
            await this.packManager.stageChange(changeType, packData, imageFile);
            this.updateStagingPanel();
            this.renderPacksGrid();
            this.showNotification('Pack guardado en staging', 'success');
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async handleDeleteProduct(productId) {
        const product = this.productManager.getProductById(productId);
        if (!product) return;

        try {
            await this.productManager.stageChange('delete', product);
            this.updateStagingPanel();
            this.renderProductsGrid();
            this.showNotification('Producto marcado para eliminar', 'success');
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async handleDeletePack(packId) {
        if (!this.packManager) return;
        const pack = this.packManager.getPackById(packId);
        if (!pack) return;

        try {
            await this.packManager.stageChange('delete', pack);
            this.updateStagingPanel();
            this.renderPacksGrid();
            this.showNotification('Pack marcado para eliminar', 'success');
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async handleDiscardChange(changeId) {
        try {
            // Determinar a qué manager pertenece el cambio
            let handled = false;
            if (this.productManager && this.productManager.getStagedChanges().some(c => c.id === changeId)) {
                await this.productManager.discardChange(changeId);
                handled = true;
            }
            if (!handled && this.packManager && this.packManager.getStagedChanges().some(c => c.id === changeId)) {
                await this.packManager.discardChange(changeId);
                handled = true;
            }

            if (!handled) throw new Error('Cambio no encontrado');

            this.updateStagingPanel();
            this.showNotification('Cambio descartado', 'info');
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async handleEditChange(changeId) {
        try {
            // Buscar el cambio en productManager o packManager
            let change = this.productManager ? this.productManager.getStagedChanges().find(c => c.id === changeId) : null;
            let manager = this.productManager;
            let kind = 'product';
            if (!change && this.packManager) {
                change = this.packManager.getStagedChanges().find(c => c.id === changeId);
                manager = this.packManager;
                kind = 'pack';
            }

            if (!change) throw new Error('Cambio no encontrado');
            if (change.type !== 'modify') {
                this.showNotification('Solo se pueden editar cambios de tipo modificar', 'warning');
                return;
            }

            // Reabrir modal correspondiente
            if (kind === 'product') {
                const productId = change.productId;
                this.openProductModal(productId, 'edit');
                // Esperar a que el modal sea insertado
                await new Promise(r => setTimeout(r, 60));

                const form = document.getElementById('product-form');
                if (!form) return;

                // Rellenar campos con datos staged
                const nameInput = document.getElementById('product-name-input'); if (nameInput) nameInput.value = change.productData.nombre || '';
                const categorySelect = document.getElementById('product-category-select'); if (categorySelect) categorySelect.value = change.productData.categoria || '';
                const precioInput = document.getElementById('input-precio-original'); if (precioInput) precioInput.value = (change.productData.precio !== undefined ? change.productData.precio : '');
                const precioFinalInput = document.getElementById('input-precio-final');
                if (precioFinalInput) {
                    let precioFinal = change.productData.precioFinal;
                    if (precioFinal === undefined || precioFinal === null) {
                        const p = parseFloat(change.productData.precio) || 0;
                        const d = parseFloat(change.productData.descuento) || 0;
                        if (p > 0) precioFinal = parseFloat((p * (1 - d / 100)).toFixed(2));
                        else precioFinal = '';
                    }
                    precioFinalInput.value = precioFinal;
                }
                const descripcion = document.getElementById('input-descripcion'); if (descripcion) descripcion.value = change.productData.descripcion || '';

                const setChk = (name, val) => { const el = form.querySelector(`input[name="${name}"]`); if (el) el.checked = !!val; };
                setChk('disponibilidad', change.productData.disponibilidad !== false);
                setChk('nuevo', change.productData.nuevo);
                setChk('oferta', change.productData.oferta);
                setChk('mas_vendido', change.productData.mas_vendido);

                // Imagen staged o existente
                if (change.hasNewImage && change.imageKey) {
                    try {
                        const img = await manager.stagingDB.getImageFromIDB(change.imageKey);
                        if (img && img.base64) {
                            const src = base64ToDataURL(img.base64, img.mimeType || 'image/jpeg');
                            this.updateImagePreview(src);
                        }
                    } catch (err) {
                        console.warn('No se pudo cargar imagen staged:', err);
                    }
                } else if (change.productData.imagenes && change.productData.imagenes.length > 0) {
                    const imgName = change.productData.imagenes[0];
                    try {
                        const src = imgName.startsWith('http') ? imgName : manager.getImageUrl(imgName);
                        this.updateImagePreview(src);
                    } catch (err) { console.warn('No se pudo cargar imagen existente:', err); }
                }
            } else {
                // Pack
                const packId = change.productId || change.productData.id;
                this.openPackModal(packId, 'edit');
                await new Promise(r => setTimeout(r, 60));

                const form = document.getElementById('pack-form');
                if (!form) return;

                const nameInput = form.querySelector('input[name="nombre"]'); if (nameInput) nameInput.value = change.productData.nombre || '';
                const precioInput = document.getElementById('input-pack-precio-original'); if (precioInput) precioInput.value = (change.productData.precio !== undefined ? change.productData.precio : '');

                // Calcular precio final deseado desde descuento si es posible
                const descuento = parseFloat(change.productData.descuento) || 0;
                const pOrig = parseFloat(change.productData.precio) || 0;
                const precioFinalDesiredInput = document.getElementById('input-pack-descuento');
                if (precioFinalDesiredInput) {
                    if (pOrig > 0) {
                        const precioFinal = parseFloat((pOrig * (1 - descuento / 100)).toFixed(2));
                        precioFinalDesiredInput.value = precioFinal;
                        precioFinalDesiredInput.dataset.calculated = descuento.toFixed(2);
                    } else {
                        precioFinalDesiredInput.value = '';
                        precioFinalDesiredInput.dataset.calculated = '0';
                    }
                }

                const descText = document.getElementsByName('descripcion')[0]; if (descText) descText.value = change.productData.descripcion || '';
                const featuresTextarea = document.getElementById('pack-features-textarea'); if (featuresTextarea) featuresTextarea.value = Array.isArray(change.productData.caracteristicas) ? change.productData.caracteristicas.join('\n') : (change.productData.caracteristicas || '');

                const setChk = (name, val) => { const el = form.querySelector(`input[name="${name}"]`); if (el) el.checked = !!val; };
                setChk('disponible', change.productData.disponible !== false);
                setChk('top', change.productData.top);
                setChk('nuevo', change.productData.nuevo);
                setChk('oferta', change.productData.oferta);

                // Imagen
                if (change.hasNewImage && change.imageKey) {
                    try {
                        const img = await manager.stagingDB.getImageFromIDB(change.imageKey);
                        if (img && img.base64) {
                            const src = base64ToDataURL(img.base64, img.mimeType || 'image/jpeg');
                            this.updatePackImagePreview(src);
                        }
                    } catch (err) {
                        console.warn('No se pudo cargar imagen staged pack:', err);
                    }
                } else if (change.productData.imagenes && change.productData.imagenes.length > 0) {
                    const imgName = change.productData.imagenes[0];
                    try {
                        const src = imgName.startsWith('http') ? imgName : manager.getImageUrl(imgName);
                        this.updatePackImagePreview(src);
                    } catch (err) { console.warn('No se pudo cargar imagen existente pack:', err); }
                }
            }

        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async handleDiscardAll() {
        const ok = await this.showConfirmDialog('¿Descartar todos los cambios en staging?');
        if (!ok) return;
        try {
            if (this.productManager) await this.productManager.discardAllChanges();
            if (this.packManager) await this.packManager.discardAllChanges();
            this.updateStagingPanel();
            this.showNotification('Todos los cambios han sido descartados', 'info');
        } catch (error) {
            this.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async handleSyncGitHub() {
        const syncBtn = document.getElementById('btn-sync-github');
        if (!syncBtn) return;
        const originalText = syncBtn.innerHTML;
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span class="loading-spinner"></span> Sincronizando...';

        // Use modal if available
        const modal = this.githubSaveModal || null;
        if (modal) modal.showLoading();

        const progressCb = (percent, message) => {
            try {
                if (modal) {
                    if (percent != null) modal.showProgress(percent, message || 'Procesando...');
                    else modal.updateDetail(message || 'Procesando...');
                }
            } catch (e) { console.warn('progressCb error', e); }
        };

        const doSync = async () => {
            try {
                let combinedMsg = '';
                if (this.productManager) {
                    try { const resultP = await this.productManager.saveAllStagedChanges(progressCb); combinedMsg += resultP && resultP.message ? resultP.message : ''; } catch(e) { console.warn('product sync failed', e); }
                }
                if (this.packManager) {
                    try { const resultK = await this.packManager.saveAllStagedChanges(progressCb); combinedMsg += (combinedMsg ? ' | ' : '') + (resultK && resultK.message ? resultK.message : 'Packs sincronizados'); } catch(e) { console.warn('pack sync failed', e); }
                }

                // Fuerza recarga desde GitHub para reflejar exactamente el estado remoto
                try {
                    if (this.productManager) await this.productManager.loadProducts();
                } catch (e) { console.warn('reload products after sync failed', e); }
                try {
                    if (this.packManager) await this.packManager.loadPacks();
                } catch (e) { console.warn('reload packs after sync failed', e); }

                // Actualizar UI según datos recargados
                this.updateCategoryFilter();
                this.updateStagingPanel();
                if (this.currentView === 'packs') this.renderPacksGrid();
                else this.renderProductsGrid();
                const msg = combinedMsg || 'Sincronización completada exitosamente';
                if (modal) modal.showSuccess(msg, 0);
                this.showNotification(`✓ ${msg}`, 'success');
            } catch (error) {
                if (modal) modal.showError(error.message || 'Error desconocido', () => doSync());
                this.showNotification(`Error en sincronización: ${error.message}`, 'error');
            } finally {
                syncBtn.disabled = false;
                syncBtn.innerHTML = originalText;
            }
        };

        // Ejecutar sincronización
        doSync();
    }

    async handleRefreshProducts() {
        const refreshBtn = document.getElementById('btn-refresh-products');
        if (!refreshBtn) return;

        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner-third"></i> Cargando...';

        try {
            // Mostrar modal de recarga
            this.showLoadingModal('Recargando datos desde el servidor...');

            if (this.productManager) await this.productManager.loadProducts(true); // force reload from server
            if (this.packManager) await this.packManager.loadPacks();

            // Actualizar filtros y UI con los datos recargados
            this.updateCategoryFilter();
            if (this.currentView === 'packs') this.renderPacksGrid(); else this.renderProductsGrid();

            // Ensure staging panel and badges reflect reconciled staged changes
            try { this.updateStagingPanel(); } catch(e) { console.warn('updateStagingPanel error', e); }
            this.showNotification('Datos recargados', 'success');
        } catch (error) {
            this.showNotification(`Error al cargar productos: ${error.message}`, 'error');
        } finally {
            this.hideLoadingModal();
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Recargar';
        }
    }

    /**
     * Actualiza los badges y números del toolbar (counts)
     */
    updateToolbarStats() {
        const products = this.productManager.products || [];
        const total = products.length;
        const available = products.filter(p => p.disponibilidad).length;
        const unavailable = total - available;
        const staged = this.productManager.getStagedChanges ? (this.productManager.getStagedChanges() || []) : [];
        const modifiedCount = staged.filter(c => c.type === 'modify').length;

        // Packs metrics
        const packs = this.packManager ? (this.packManager.packs || []) : [];
        const packsTotal = packs.length;
        const packsAvailable = packs.filter(p => p.disponible !== false).length;
        const packsStaged = this.packManager && this.packManager.getStagedChanges ? (this.packManager.getStagedChanges() || []) : [];
        const packsModified = packsStaged.filter(c => c.type === 'modify').length;

        const elTotal = document.getElementById('stat-total');
        const elAvailable = document.getElementById('stat-available');
        const elUnavailable = document.getElementById('stat-unavailable');
        const elModified = document.getElementById('stat-modified-count');
        const elPacksSep = document.getElementById('stat-packs-sep');
        const elPacksTotal = document.getElementById('stat-packs-total');
        const elPacksAvailable = document.getElementById('stat-packs-available');
        const elPacksModified = document.getElementById('stat-packs-modified');

        if (elTotal) elTotal.textContent = `Total: ${total}`;
        if (elAvailable) elAvailable.textContent = `Disponibles: ${available}`;
        if (elUnavailable) elUnavailable.textContent = `No disponibles: ${unavailable}`;
        if (elModified) elModified.textContent = `Modificados: ${modifiedCount}`;
        if (elPacksSep) elPacksSep.textContent = '|';
        if (elPacksTotal) elPacksTotal.textContent = `Packs: ${packsTotal}`;
        if (elPacksAvailable) elPacksAvailable.textContent = `P.Disponibles: ${packsAvailable}`;
        if (elPacksModified) elPacksModified.textContent = `P.Modificados: ${packsModified}`;
    }

    /**
     * Muestra notificaciones
     */
    showNotification(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert ${type}`;
        
        const iconClass = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        }[type] || 'fa-info-circle';

        alertDiv.innerHTML = `
            <i class="fas ${iconClass}"></i>
            <span>${message}</span>
        `;

        const container = document.querySelector('.inventory-header') || this.container;
        container.insertAdjacentElement('afterend', alertDiv);

        setTimeout(() => {
            alertDiv.remove();
        }, 4000);
    }

    /**
     * Muestra un modal de carga simple con mensaje (usar para recargas)
     * @param {string} message
     * @param {string} id
     */
    showLoadingModal(message = 'Recargando...', id = 'refresh-loading-modal') {
        // Remover si existe
        const old = document.getElementById(id);
        if (old) old.remove();
        const overlay = document.createElement('div');
        overlay.id = id;
        overlay.className = 'modal-overlay active';
        overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:3000;';
        overlay.innerHTML = `
            <div style="background:#fff;padding:1.25rem 1.5rem;border-radius:8px;display:flex;align-items:center;gap:0.75rem;min-width:240px;box-shadow:0 8px 24px rgba(0,0,0,0.25);">
                <span class="loading-spinner" style="width:28px;height:28px;display:inline-block;"></span>
                <div style="font-weight:600;">${message}</div>
            </div>
        `;
        document.body.appendChild(overlay);
        try { this.disableBodyScroll(); } catch (e) { /* ignore */ }
    }

    hideLoadingModal(id = 'refresh-loading-modal') {
        const el = document.getElementById(id);
        if (el) el.remove();
        try { this.enableBodyScroll(); } catch (e) { /* ignore */ }
    }

    // Bloqueo de scroll del background cuando hay modales abiertos
    disableBodyScroll() {
        try {
            this._modalOpenCount = (this._modalOpenCount || 0) + 1;
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
            document.body.classList.add('modal-open');
        } catch (e) { console.warn('disableBodyScroll error', e); }
    }

    enableBodyScroll() {
        try {
            this._modalOpenCount = Math.max(0, (this._modalOpenCount || 0) - 1);
            if (this._modalOpenCount === 0) {
                document.documentElement.style.overflow = '';
                document.body.style.overflow = '';
                document.body.classList.remove('modal-open');
            }
        } catch (e) { console.warn('enableBodyScroll error', e); }
    }

    /**
     * Muestra una previsualización del producto a eliminar con diálogo de confirmación
     * @param {Object} product - Producto a eliminar
     * @returns {Promise<boolean>}
     */
    showDeleteProductPreview(product) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'delete-preview-overlay';
            
            const discountText = product.descuento > 0 
                ? `<div class="product-discount-info">Descuento: ${product.descuento}%</div>` 
                : '';
            
            const badges = `
                ${product.nuevo ? '<span class="product-badge new">Nuevo</span>' : ''}
                ${product.oferta ? '<span class="product-badge sale">Oferta</span>' : ''}
            `;
            
            overlay.innerHTML = `
                <div class="delete-preview-box">
                    <div class="delete-preview-header">
                        <h3>Confirmar Eliminación de Producto</h3>
                    </div>
                    <div class="delete-preview-content">
                        <div class="delete-preview-image-container">
                            <img src="${product.imagenUrl}" alt="${product.nombre}" class="delete-preview-image" onerror="this.src='Img/no_image.jpg'">
                            <div class="delete-preview-badges">${badges}</div>
                        </div>
                        <div class="delete-preview-info">
                            <div class="delete-preview-name">${product.nombre}</div>
                            <div class="delete-preview-category">${product.categoria}</div>
                            <div class="delete-preview-description">${product.descripcion || 'Sin descripción'}</div>
                            <div class="delete-preview-price">
                                <span class="price-label">Precio:</span>
                                <span class="price-value">$${product.precioFinal.toFixed(2)}</span>
                            </div>
                            ${discountText}
                            <div class="delete-preview-warning">
                                <i class="fas fa-exclamation-triangle"></i>
                                <span>Esta acción eliminará el producto y sus datos de inventario</span>
                            </div>
                        </div>
                    </div>
                    <div class="delete-preview-actions">
                        <button class="btn-delete-confirm">
                            <i class="fas fa-trash"></i> Eliminar Producto
                        </button>
                        <button class="btn-delete-cancel">Cancelar</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            this.disableBodyScroll();
            
            const confirmBtn = overlay.querySelector('.btn-delete-confirm');
            const cancelBtn = overlay.querySelector('.btn-delete-cancel');
            
            const cleanup = (val) => { 
                overlay.remove(); 
                this.enableBodyScroll(); 
                resolve(val); 
            };
            
            confirmBtn.addEventListener('click', () => cleanup(true));
            cancelBtn.addEventListener('click', () => cleanup(false));
            overlay.addEventListener('click', (e) => { 
                if (e.target === overlay) cleanup(false); 
            });
        });
    }

    /**
     * Muestra un diálogo de confirmación custom y devuelve Promise<boolean>
     * @param {string} message
     * @returns {Promise<boolean>}
     */
    showConfirmDialog(message) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-box">
                    <div class="confirm-message">${message}</div>
                    <div class="confirm-actions">
                        <button class="btn-confirm-yes">Sí</button>
                        <button class="btn-confirm-no">No</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            // Bloquear scroll del fondo mientras está el diálogo
            this.disableBodyScroll();
            const yes = overlay.querySelector('.btn-confirm-yes');
            const no = overlay.querySelector('.btn-confirm-no');
            const cleanup = (val) => { overlay.remove(); this.enableBodyScroll(); resolve(val); };
            yes.addEventListener('click', () => cleanup(true));
            no.addEventListener('click', () => cleanup(false));
            overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
        });
    }
}
