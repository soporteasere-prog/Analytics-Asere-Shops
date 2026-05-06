import { disableBodyScroll, enableBodyScroll, confirm } from '../../UI/modalUtils.js';
import { showAlert } from '../../Core/utils.js';
import { confirm as modalConfirm } from '../../UI/modalUtils.js';

export class GitHubImagesModal {
    constructor(githubManager, productManager) {
        this.githubManager = githubManager;
        this.productManager = productManager;
        this.modalId = 'github-images-modal';
        this.container = null;
        this.groups = [];
        this.selected = new Set();
        this.isLoading = false;
        this.filter = 'all'; // all | used | unused
        this.initDOM();
    }

    ensureCss() {
        const href = 'Css/github-images-modal.css';
        if (!document.querySelector(`link[href*="${href}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
        }
    }

    initDOM() {
        // Evitar crear modal duplicado
        if (document.getElementById(this.modalId)) {
            this.container = document.getElementById(this.modalId);
            return;
        }

        this.ensureCss();

        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = 'github-images-modal overlay hidden';

        modal.innerHTML = `
            <div class="gim-modal-card">
                <div class="gim-header">
                    <div class="gim-title">Imágenes en base de datos <span class="gim-sub">Asereshops / Images</span></div>
                    <div class="gim-actions">
                        <select id="github-images-filter" class="gim-filter">
                            <option value="all">Todas</option>
                            <option value="used">Solo usadas</option>
                            <option value="unused">Solo no usadas</option>
                        </select>
                        <button id="github-images-refresh" class="btn btn-outline">Actualizar</button>
                        <button id="github-images-delete-selected" class="btn btn-danger" disabled>Eliminar seleccionadas</button>
                        <button id="github-images-close" class="btn">Cerrar</button>
                    </div>
                </div>
                <div id="github-images-body" class="gim-body"></div>
                <div id="github-images-footer" class="gim-footer">
                    <div id="github-images-status" class="gim-status"></div>
                    <div class="gim-progress"><div id="github-images-progress-fill" class="gim-progress-fill" style="--pct:0%"></div></div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.container = modal;

        // Event listeners
        modal.querySelector('#github-images-close').addEventListener('click', () => this.hide());
        modal.querySelector('#github-images-refresh').addEventListener('click', () => this.loadAndRender());
        modal.querySelector('#github-images-delete-selected').addEventListener('click', () => this.deleteSelected());
        modal.querySelector('#github-images-filter').addEventListener('change', (e) => {
            this.filter = e.target.value || 'all';
            this.renderGroups();
        });
    }

    show() {
        if (!this.githubManager || !this.githubManager.isConfigured()) {
            showAlert('Llave de acceso no configurada. Ve a ajustes y configura tu llave.', 'error');
            return;
        }

        this.container.classList.remove('hidden');
        disableBodyScroll();
        this.loadAndRender();
    }

    hide() {
        if (this.container) this.container.classList.add('hidden');
        enableBodyScroll();
    }

    formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${sizes[i]}`;
    }

    async loadAndRender() {
        const body = this.container.querySelector('#github-images-body');
        const status = this.container.querySelector('#github-images-status');
        const progressFill = this.container.querySelector('#github-images-progress-fill');

        body.innerHTML = `<div class="gim-loading">Cargando listado de imágenes...</div>`;
        status.textContent = '';
        progressFill.style.width = '0%';
        this.selected.clear();

        try {
            this.isLoading = true;

            // 1) Obtener listados top-level dentro de Images
            const top = await this.githubManager.listRepoDirectory('Images');

            // Separar carpetas y archivos
            const folders = top.filter(i => i.type === 'dir');
            const filesRoot = top.filter(i => i.type === 'file');

            const groups = [];

            // Añadir archivos en la raíz de Images como grupo "root"
            if (filesRoot.length) {
                groups.push({ name: 'root', displayName: 'Raíz', files: filesRoot });
            }

            // Para cada carpeta listar su contenido
            for (const f of folders) {
                const items = await this.githubManager.listRepoDirectory(f.path);
                const onlyFiles = items.filter(i => i.type === 'file');
                groups.push({ name: f.name, displayName: f.name, files: onlyFiles });
            }

            this.groups = groups;

            // 2) Determinar imágenes en uso según products
            const usedNames = new Set();
            const products = this.productManager?.products || [];
            products.forEach(p => {
                if (Array.isArray(p.imagenes)) {
                    p.imagenes.forEach(img => {
                        if (!img) return;
                        const name = img.split('/').pop();
                        usedNames.add(name);
                    });
                }
            });

            this.usedNames = usedNames;

            // 3) Renderizar grupos
            this.renderGroups();

            status.textContent = `Listo — ${groups.reduce((s,g)=>s+g.files.length,0)} imágenes encontradas`;
        } catch (error) {
            body.innerHTML = `<div class="gim-error">Error cargando imágenes: ${error.message}</div>`;
            console.error('Error cargando imágenes desde GitHub:', error);
        } finally {
            this.isLoading = false;
        }
    }

    renderGroups() {
        const body = this.container.querySelector('#github-images-body');
        body.innerHTML = '';

        if (!this.groups || this.groups.length === 0) {
            body.innerHTML = '<div class="gim-empty">No se encontraron imágenes en Images/</div>';
            return;
        }

        for (const group of this.groups) {
            const section = document.createElement('div');
            section.className = 'gim-group';

            const header = document.createElement('div');
            header.className = 'gim-group-header';
            header.innerHTML = `<div class="gim-group-title">${group.displayName}</div><div class="gim-group-count">${group.files.length} archivo(s)</div><button class="gim-group-toggle" aria-expanded="true">▾</button>`;
            section.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'gim-grid';

            // Toggle expand/collapse
            const toggle = header.querySelector('.gim-group-toggle');
            toggle.addEventListener('click', () => {
                const expanded = toggle.getAttribute('aria-expanded') === 'true';
                toggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                section.classList.toggle('collapsed', expanded);
            });

            group.files.forEach(file => {
                const name = file.name;
                const isUsed = this.usedNames && this.usedNames.has(name);
                if (this.filter === 'used' && !isUsed) return;
                if (this.filter === 'unused' && isUsed) return;

                const filePath = file.path;
                const thumbUrl = file.download_url || `https://raw.githubusercontent.com/soporteasere-prog/Asereshops/main/${file.path}`;
                const sizeLabel = this.formatBytes(file.size || 0);

                const card = document.createElement('div');
                card.className = 'gim-card';
                card.innerHTML = `
                    <div class="gim-thumb"><img src="${thumbUrl}" alt="${name}" onerror="this.src='Img/no_image.jpg'" /></div>
                    <div class="gim-meta">
                        <div class="gim-name" title="${name}">${name}</div>
                        <div class="gim-info"><span class="gim-size">${sizeLabel}</span><span class="gim-used ${isUsed? 'used':'unused'}">${isUsed? 'En uso':'No usado'}</span></div>
                    </div>
                    <div class="gim-actions">
                        <input type="checkbox" class="github-image-checkbox" data-path="${filePath}" />
                        <button class="btn btn-small btn-link github-image-open" data-url="${thumbUrl}">Abrir</button>
                    </div>
                `;

                const checkbox = card.querySelector('.github-image-checkbox');
                checkbox.addEventListener('change', (e) => {
                    if (checkbox.checked) this.selected.add(filePath);
                    else this.selected.delete(filePath);
                    this.updateDeleteButton();
                });

                card.querySelector('.github-image-open').addEventListener('click', (e) => {
                    window.open(thumbUrl, '_blank');
                });

                grid.appendChild(card);
            });

            section.appendChild(grid);
            body.appendChild(section);
        }

        this.updateDeleteButton();
    }

    updateDeleteButton() {
        const btn = this.container.querySelector('#github-images-delete-selected');
        if (!btn) return;
        btn.disabled = this.selected.size === 0;
        btn.textContent = this.selected.size > 0 ? `Eliminar seleccionadas (${this.selected.size})` : 'Eliminar seleccionadas';
    }

    async deleteSelected() {
        if (this.selected.size === 0) return;
        const ok = await (typeof modalConfirm === 'function' ? modalConfirm(`¿Eliminar ${this.selected.size} archivo(s) del repositorio? Esta acción es irreversible.`) : Promise.resolve(window.confirm(`¿Eliminar ${this.selected.size} archivo(s) del repositorio? Esta acción es irreversible.`)));
        if (!ok) return;

        const status = this.container.querySelector('#github-images-status');
        const progressFill = this.container.querySelector('#github-images-progress-fill');

        const items = Array.from(this.selected);
        const total = items.length;
        let done = 0;
        const failures = [];

        this.container.querySelector('#github-images-delete-selected').disabled = true;

        for (const path of items) {
            try {
                status.textContent = `Eliminando ${path}...`;
                await this.githubManager.deleteFileFromRepo(path, `Eliminar imagen ${path} desde panel`);
                done++;
                progressFill.style.width = `${Math.round((done/total)*100)}%`;
            } catch (err) {
                console.error('Error eliminando', path, err);
                failures.push({ path, error: err.message || String(err) });
            }
        }

        if (failures.length === 0) {
            status.textContent = `Eliminadas ${done}/${total} imágenes correctamente.`;
            // Recargar listado
            this.selected.clear();
            await this.loadAndRender();
        } else {
            status.innerHTML = `Eliminadas ${done}/${total}. Errores: ${failures.length}. Comprueba la consola para más detalles.`;
            console.warn('Fallos al eliminar imágenes:', failures);
        }

        this.container.querySelector('#github-images-delete-selected').disabled = false;
    }
}
