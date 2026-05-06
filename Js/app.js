
import { DataManager } from './Core/dataManager.js';
import { ChartManager } from './UI/chartManager.js';
import { UIRenderer } from './UI/uiRenderer.js';
import { SettingsUI } from './Modules/Settings/settingsUI.js';
import { InventoryApp } from './Modules/Inventory/inventoryApp.js';
import { GitHubManager } from './Modules/Github/githubManager.js';
import { NotificationEditorUI } from './Modules/Notifications/notificationEditorUI.js';
import { showAlert, getCurrencySymbol, formatCurrency } from './Core/utils.js';
import { CONFIG } from './Core/config.js';

/**
 * Manager para controlar el loading panel con animaciones mejoradas
 */
class LoadingManager {
    constructor() {
        this.panel = document.getElementById('loading-panel');
        this.percentEl = document.getElementById('loading-percent');
        this.progressFillEl = document.getElementById('loading-progress-fill');
        this.stepEl = document.getElementById('loading-step');
        this.timeEl = document.getElementById('loading-time');
        this.statusServerEl = document.getElementById('loading-status-server');
        this.statusDataEl = document.getElementById('loading-status-data');
        this.statusSpeedEl = document.getElementById('loading-status-speed');
        
        this.steps = [];
        this.currentStep = 0;
        this.startTime = Date.now();
        this.timeInterval = null;
        
        // Mapeo de fases a mensajes de estado
        this.statusMap = {
            0: { server: 'Conectando...', data: 'Preparando...', speed: 'Optimizando...' },
            1: { server: 'Conectado', data: 'Cargando...', speed: 'Optimizando...' },
            2: { server: 'Conectado', data: 'Procesando...', speed: 'Optimizando...' },
            3: { server: 'Conectado', data: 'Cargando inv...', speed: 'Optimizando...' },
            4: { server: 'Conectado', data: 'Finanzas...', speed: 'Optimizando...' },
            5: { server: 'Conectado', data: 'Notificaciones...', speed: 'Optimizando...' },
            6: { server: 'Conectado', data: 'Sincronizando...', speed: 'Optimizando...' },
            7: { server: 'Listo', data: 'Completado', speed: 'Óptimo' }
        };
        
        this.startTimeTracking();
    }

    setSteps(stepsArray) {
        this.steps = stepsArray;
        this.currentStep = 0;
        this.startTime = Date.now();
        this.updateProgress();
    }

    startTimeTracking() {
        // Actualizar tiempo transcurrido cada 100ms
        this.timeInterval = setInterval(() => {
            if (this.panel && !this.panel.classList.contains('hidden')) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                if (this.timeEl) {
                    this.timeEl.textContent = `${elapsed}s`;
                }
            }
        }, 100);
    }

    updateStep(stepIndex, message) {
        this.currentStep = Math.min(stepIndex, this.steps.length - 1);
        
        // Actualizar progreso
        this.updateProgress();
        
        // Actualizar estados según la fase
        if (this.statusMap[this.currentStep]) {
            const status = this.statusMap[this.currentStep];
            if (this.statusServerEl) this.statusServerEl.textContent = status.server;
            if (this.statusDataEl) this.statusDataEl.textContent = status.data;
            if (this.statusSpeedEl) this.statusSpeedEl.textContent = status.speed;
        }
        
        const elapsed = Date.now() - this.startTime;
        console.log(`⏱ [${elapsed}ms] Paso ${this.currentStep + 1}/${this.steps.length}: ${message || this.steps[this.currentStep]}`);
    }

    updateProgress() {
        const percent = Math.round(((this.currentStep + 1) / this.steps.length) * 100);
        
        // Actualizar porcentaje
        if (this.percentEl) {
            this.percentEl.textContent = `${percent}%`;
        }
        
        // Actualizar barra de progreso
        if (this.progressFillEl) {
            this.progressFillEl.style.width = `${percent}%`;
        }
        
        // Actualizar paso actual
        if (this.stepEl) {
            this.stepEl.textContent = `${this.currentStep + 1}/${this.steps.length}`;
        }
    }

    hide() {
        if (this.panel) {
            this.panel.classList.add('hidden');
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            console.log(`✅ Loading completado en ${elapsed}s`);
            
            // Detener actualización de tiempo
            if (this.timeInterval) {
                clearInterval(this.timeInterval);
            }
            
            // Pequeño delay para asegurar que se vea la transición
            setTimeout(() => {
                if (this.panel) this.panel.style.pointerEvents = 'none';
            }, 600);
        }
    }

    show() {
        if (this.panel) {
            this.panel.classList.remove('hidden');
            this.panel.style.pointerEvents = 'auto';
            this.startTime = Date.now();
            this.startTimeTracking();
        }
    }
}

class DashboardApp {
    constructor() {
        this.dataManager = new DataManager();
        this.chartManager = new ChartManager();
        this.inventoryApp = null;
        this.notificationEditor = null;
        this.githubManager = new GitHubManager();
        this.loadingManager = new LoadingManager();
        this.initialize();
    }

    async initialize() {
        try {
            // Definir pasos de carga
            this.loadingManager.setSteps([
                'Conectando con servidores...',
                'Cargando datos de transacciones...',
                'Inicializando gráficos...',
                'Cargando inventario...',
                'Configurando finanzas...',
                'Inicializando notificaciones...',
                'Finalizando configuración...',
                'Activando interfaz...'
            ]);

            // Paso 1: Cargar datos
            this.loadingManager.updateStep(0, 'Conectando con servidores...');
            await this.dataManager.loadData();
            
            // Paso 2: Inicializar gráficos
            this.loadingManager.updateStep(2, 'Inicializando gráficos...');
            this.chartManager.initCharts();

            // Paso 3: Inicializar Sistema de Inventario
            this.loadingManager.updateStep(3, 'Cargando inventario...');
            this.inventoryApp = new InventoryApp(this.githubManager);
            await this.inventoryApp.initialize();

            // Paso 5: Inicializar Editor de Notificaciones
            this.loadingManager.updateStep(5, 'Inicializando notificaciones...');
            this.notificationEditor = new NotificationEditorUI();
            
            // Paso 6: Configurar event listeners
            this.loadingManager.updateStep(6, 'Finalizando configuración...');
            this.setupEventListeners();
            this.setupViewNavigation();

            // Forzar estado inicial de vistas: ocultar todas excepto la activa del menú
            this.switchView(document.querySelector('.menu-item.active')?.dataset.view || 'dashboard');

            // Cargar datos iniciales
            // Por defecto usar este mes
            document.getElementById('filter-period').value = 'month';

            // Poblar opciones dinámicas de filtros (países, afiliados, navegadores, OS)
            this.populateFilterOptions();

            this.applyFilters();

            // Configurar modal de filtros
            const openFiltersBtn = document.getElementById('open-filters');
            const filtersModal = document.getElementById('filters-modal');
            const filtersOverlay = document.getElementById('filters-modal-overlay');
            const filtersClose = document.getElementById('filters-modal-close');
            const filtersCloseFooter = document.getElementById('filters-close');
            const filtersApply = document.getElementById('filters-apply');

            function openFilters() {
                if (filtersModal) {
                    // Hacer el modal interactivo y accesible
                    filtersModal.classList.add('active');
                    filtersModal.removeAttribute('inert');
                    filtersModal.setAttribute('aria-hidden', 'false');
                    // Focus al primer control
                    const firstControl = filtersModal.querySelector('select, input, button');
                    if (firstControl) firstControl.focus();
                }
            }
            function closeFilters() {
                if (filtersModal) {
                    // Si el foco está dentro del modal, reubicarlo al botón que lo abre (evita aria-hidden sobre elemento con foco)
                    if (filtersModal.contains(document.activeElement)) {
                        if (openFiltersBtn) openFiltersBtn.focus();
                        else document.activeElement.blur();
                    }
                    filtersModal.classList.remove('active');
                    // Marcar como inert para evitar acceso por teclado/lectores (mejor con polyfill si es necesario)
                    try { filtersModal.inert = true; } catch (e) { filtersModal.setAttribute('inert', ''); }
                    filtersModal.setAttribute('aria-hidden', 'true');
                }
            }

            if (openFiltersBtn) openFiltersBtn.addEventListener('click', () => openFilters());
            if (filtersOverlay) filtersOverlay.addEventListener('click', () => closeFilters());
            if (filtersClose) filtersClose.addEventListener('click', () => closeFilters());
            if (filtersCloseFooter) filtersCloseFooter.addEventListener('click', () => closeFilters());
            if (filtersApply) filtersApply.addEventListener('click', () => { this.applyFilters(); closeFilters(); });

            // Cerrar con Escape
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFilters(); });
            
            showAlert('✅ Dashboard cargado correctamente', 'success', 2000);

            // Paso 7: Ocultar loading panel
            this.loadingManager.updateStep(7, 'Activando interfaz...');
            setTimeout(() => {
                this.loadingManager.hide();
            }, 600);
        } catch (error) {
            console.error('Error al inicializar:', error);
            showAlert(`❌ Error: ${error.message}`, 'error');
            // Ocultar loading panel incluso si hay error
            setTimeout(() => {
                this.loadingManager.hide();
            }, 1000);
        }
    }

    /**
     * Configurar navegación entre vistas
     */
    setupViewNavigation() {
        document.querySelectorAll('.menu-item[data-view]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewName = item.dataset.view;
                this.switchView(viewName);
            });
        });
    }

    /**
     * Cambiar vista activa
     */
    switchView(viewName) {
        // Ocultar todas las vistas (usar clase .hidden para control explícito)
        document.querySelectorAll('.view-content').forEach(view => {
            view.classList.add('hidden');
            view.classList.remove('active');
        });

        // Mostrar vista seleccionada
        const selectedView = document.getElementById(`${viewName}-view`);
        if (selectedView) {
            selectedView.classList.remove('hidden');
            selectedView.classList.add('active');
        }

        // Si la vista es inventario, inicializar la UI bajo demanda
        if (viewName === 'inventory' && this.inventoryApp) {
            this.inventoryApp.showInventory().catch(err => console.warn('Error mostrando inventario:', err));
        }

        // Si la vista es notificaciones, reinicializar el editor
        if (viewName === 'notifications' && this.notificationEditor) {
            // Reiniciar para cargar datos frescos
            this.notificationEditor.init().catch(err => console.warn('Error inicializando notificaciones:', err));
        }

        // Actualizar menu activo
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`.menu-item[data-view="${viewName}"]`)?.classList.add('active');

        // Cerrar menu en mobile
        const sidebar = document.getElementById('sidebar-menu');
        if (sidebar && sidebar.classList.contains('active')) sidebar.classList.remove('active');
    }

    setupEventListeners() {
        // Botón de actualizar
        document.getElementById('refresh-data')?.addEventListener('click', async () => {
            const refreshBtn = document.getElementById('refresh-data');
            const originalText = refreshBtn.innerHTML;
            
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
            refreshBtn.disabled = true;
            
            try {
                await this.dataManager.loadData();
                this.applyFilters();
                showAlert('✅ Datos actualizados', 'success');
            } catch (error) {
                showAlert(`❌ Error: ${error.message}`, 'error');
            } finally {
                setTimeout(() => {
                    refreshBtn.innerHTML = originalText;
                    refreshBtn.disabled = false;
                }, 1000);
            }
        });

        // Filtros
        document.querySelectorAll('.filter-group select, .filter-group input').forEach(el =>
            el.addEventListener('change', () => this.applyFilters()));

        // Búsqueda
        const searchInput = document.getElementById('search-data');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                this.dataManager.search(searchTerm);
                this.updateDashboard();
            });
        }

        // Pestañas de transacciones
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const tab = btn.dataset.tab;
                const filtered = this.dataManager.filterByTransactionType(tab);
                UIRenderer.renderTransactions(document.getElementById('data-list'), filtered, 
                    (order, idx) => UIRenderer.generateReceipt(order));
            });
        });
    }

    populateFilterOptions() {
        try {
            const countries = Array.from(new Set(this.dataManager.data.map(d => d.country).filter(Boolean))).sort();
            const affiliates = Array.from(new Set(this.dataManager.data.map(d => d.affiliate).filter(Boolean))).sort();
            const browsers = Array.from(new Set(this.dataManager.data.map(d => d.browser).filter(Boolean))).sort();
            const oses = Array.from(new Set(this.dataManager.data.map(d => d.operatingSystem).filter(Boolean))).sort();

            const countryEl = document.getElementById('filter-country');
            const affiliateEl = document.getElementById('filter-affiliate');
            const browserEl = document.getElementById('filter-browser');
            const osEl = document.getElementById('filter-os');

            if (countryEl) {
                countries.forEach(c => {
                    const opt = document.createElement('option'); opt.value = c; opt.textContent = c; countryEl.appendChild(opt);
                });
            }
            if (affiliateEl) {
                affiliates.forEach(a => {
                    const opt = document.createElement('option'); opt.value = a; opt.textContent = a; affiliateEl.appendChild(opt);
                });
            }
            if (browserEl) {
                browsers.forEach(b => {
                    const opt = document.createElement('option'); opt.value = b; opt.textContent = b; browserEl.appendChild(opt);
                });
            }
            if (osEl) {
                oses.forEach(o => {
                    const opt = document.createElement('option'); opt.value = o; opt.textContent = o; osEl.appendChild(opt);
                });
            }
        } catch (err) {
            console.warn('Error poblando opciones de filtros', err);
        }
    }

    applyFilters() {
        // Obtener valores de filtros de fecha - convertir cadenas vacías a null
        const startDate = document.getElementById('filter-date-start')?.value || null;
        const endDate = document.getElementById('filter-date-end')?.value || null;
        const period = document.getElementById('filter-period')?.value || 'all';

        const country = document.getElementById('filter-country')?.value || 'all';
        const affiliate = document.getElementById('filter-affiliate')?.value || 'all';
        const userType = document.getElementById('filter-user-type')?.value || 'all';
        const browser = document.getElementById('filter-browser')?.value || 'all';
        const os = document.getElementById('filter-os')?.value || 'all';
        const minTotal = document.getElementById('filter-min-total')?.value;
        const maxTotal = document.getElementById('filter-max-total')?.value;
        const hasPurchase = document.getElementById('filter-has-purchase')?.value || 'all';

        this.dataManager.filterByCriteria({ startDate, endDate, period, country, affiliate, userType, browser, os, minTotal, maxTotal, hasPurchase });
        this.updateDashboard();
    }

    updateDashboard() {
        // Actualizar estadísticas
        const stats = this.dataManager.getStats();
        UIRenderer.updateStats(stats);

        // Mostrar 'Visitas Totales' obtenidas desde el backend (/obtener-estadisticas).
        (function updateVisitsFromBackend(self) {
            const BACKEND_URL = CONFIG.BACKEND_URL;
            fetch(`${BACKEND_URL}/obtener-estadisticas`)
                .then(resp => {
                    if (!resp.ok) throw new Error('Backend response not OK');
                    return resp.json();
                })
                .then(serverStats => {
                    const totalVisits = Array.isArray(serverStats) ? serverStats.length : 0;
                    const el = document.getElementById('server-available-users');
                    if (el) el.textContent = totalVisits;
                })
                .catch(err => {
                    console.warn('No se pudo obtener visitas totales desde backend, usando local', err);
                    const totalVisits = Array.isArray(self.dataManager.data) ? self.dataManager.data.length : 0;
                    const el = document.getElementById('server-available-users');
                    if (el) el.textContent = totalVisits;
                });
        })(this);

        // Actualizar resumen general
        const monthlyData = this.dataManager.getMonthlyComparison();
        const period = document.getElementById('filter-period')?.value || 'all';
        UIRenderer.renderGeneralSummary(
            document.getElementById('general-summary'),
            monthlyData,
            this.dataManager.filteredData,
            period
        );

        // Actualizar resumen diario
        const dailySummary = this.dataManager.getDailySummary();
        UIRenderer.renderDailySummary(document.getElementById('daily-summary'), dailySummary);

        // Actualizar productos top
        const topProducts = this.dataManager.getTopProducts(this.dataManager.filteredData, 5);
        UIRenderer.renderTopProducts(document.getElementById('top-products'), topProducts);

        // Actualizar transacciones
        UIRenderer.renderTransactions(
            document.getElementById('data-list'),
            this.dataManager.filteredData,
            (order, idx) => UIRenderer.generateReceipt(order)
        );

        // Actualizar gráficos
        const trendData = this.dataManager.getSalesTrend();
        this.chartManager.updateCharts(topProducts, trendData);
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new DashboardApp();
    new SettingsUI();
});
