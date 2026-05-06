/**
 * Módulo de manejo de inventario de productos
 * Carga productos desde GitHub y renderiza la tienda
 */


export class InventoryManager {
    constructor(githubManager = null) {
        this.products = [];
        this.filteredProducts = [];
        this.categories = [];
        this.modifiedProducts = []; // Productos en staging (sin guardar)
        this.baseImageUrl = 'https://raw.githubusercontent.com/soporteasere-prog/Asereshops/refs/heads/main/Images/products/';
        this.productsJsonUrl = 'https://raw.githubusercontent.com/soporteasere-prog/Asereshops/refs/heads/main/Json/products.json';
        this.categoriesJsonUrl = './Json/category.json';
        this.githubManager = githubManager;
        this.lastSyncTime = null;
        this.syncInProgress = false;
        this.loadCategoriesFromStorage();
        // Productos modificados solo en memoria (no persistir en localStorage)
        // Se pierden al recargar página, lo cual es intencional por requisito del usuario
    }

    /**
     * Carga categorías del localStorage
     */
    loadCategoriesFromStorage() {
        const stored = localStorage.getItem('asereshops_categories');
        if (stored) {
            try {
                this.categories = JSON.parse(stored);
            } catch (e) {
                console.warn('Error parsing categories from storage');
                this.categories = [];
            }
        }
    }



    /**
     * Carga las categorías desde JSON local
     */
    async loadCategories() {
        try {
            const response = await fetch(this.categoriesJsonUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.categories && Array.isArray(data.categories)) {
                this.categories = data.categories;
                localStorage.setItem('asereshops_categories', JSON.stringify(this.categories));
            } else {
                throw new Error('Estructura de JSON inválida: se esperaba { categories: [...] }');
            }
            
            return this.categories;
        } catch (error) {
            console.error('Error al cargar categorías:', error);
            throw error;
        }
    }

    /**
     * Obtiene lista de nombres de categorías
     */
    getCategoryNames() {
        return this.categories.map(cat => cat.nombre).sort();
    }

    /**
     * Carga los productos desde el JSON remoto
     */
    async loadProducts() {
        try {
            const response = await fetch(this.productsJsonUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            
            // La estructura es { products: [...] }
            if (data.products && Array.isArray(data.products)) {
                this.products = data.products;
            } else {
                throw new Error('Estructura de JSON inválida: se esperaba { products: [...] }');
            }
            
            this.normalizeProducts();
            this.filteredProducts = [...this.products];
            return this.products;
        } catch (error) {
            console.error('Error al cargar productos:', error);
            throw error;
        }
    }

    /**
     * Normaliza la estructura de los productos
     */
    normalizeProducts() {
        this.products.forEach((product, index) => {
            // Generar ID único si no existe
            product.id = product.id || `prod_${index}_${Date.now()}`;
            
            // Asegurar que el precio es numérico
            product.precio = parseFloat(product.precio) || 0;
            product.descuento = parseFloat(product.descuento) || 0;
            
            // Calcular precio con descuento
            const precioConDescuento = product.precio * (1 - product.descuento / 100);
            product.precioFinal = parseFloat(precioConDescuento.toFixed(2));
            
            // Asegurar disponibilidad
            product.disponibilidad = product.disponibilidad !== false;
            
            // Construir URL de imagen
            if (product.imagenes && Array.isArray(product.imagenes) && product.imagenes.length > 0) {
                product.imagenUrl = `${this.baseImageUrl}${product.imagenes[0]}`;
            } else {
                // Imagen por defecto si no hay imagen
                product.imagenUrl = 'Img/no_image.jpg';
            }
            
            // Crear campo de búsqueda
            product.searchText = `${product.nombre} ${product.categoria} ${product.descripcion}`.toLowerCase();
            // Normalizar timestamps si existen o mapear campo legacy 'hora'
            product.created_at = product.created_at || product.hora || null;
            product.modified_at = product.modified_at || product.created_at || null;
        });
    }

    /**
     * Filtra productos por término de búsqueda
     */
    search(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredProducts = this.products.filter(product =>
            product.searchText.includes(term)
        );
        return this.filteredProducts;
    }

    /**
     * Filtra productos por categoría
     */
    filterByCategory(category) {
        if (category === 'todos') {
            this.filteredProducts = [...this.products];
        } else {
            this.filteredProducts = this.products.filter(product =>
                product.categoria.toLowerCase() === category.toLowerCase()
            );
        }
        return this.filteredProducts;
    }

    /**
     * Obtiene todas las categorías únicas
     */
    getCategories() {
        const categories = new Set(this.products.map(p => p.categoria));
        return Array.from(categories).sort();
    }

    /**
     * Filtra por rango de precio
     */
    filterByPrice(minPrice, maxPrice) {
        this.filteredProducts = this.products.filter(product =>
            product.precioFinal >= minPrice && product.precioFinal <= maxPrice
        );
        return this.filteredProducts;
    }

    /**
     * Filtra por disponibilidad
     */
    filterByAvailability(available) {
        this.filteredProducts = this.products.filter(product =>
            available ? product.disponibilidad : !product.disponibilidad
        );
        return this.filteredProducts;
    }

    /**
     * Obtiene productos destacados (nuevos, ofertas, más vendidos)
     */
    getHighlightedProducts(type = 'todos') {
        let highlighted = this.products;
        
        if (type === 'nuevos') {
            highlighted = this.products.filter(p => p.nuevo === true);
        } else if (type === 'ofertas') {
            highlighted = this.products.filter(p => p.oferta === true);
        } else if (type === 'mas_vendidos') {
            highlighted = this.products.filter(p => p.mas_vendido === true);
        }
        
        return highlighted.sort((a, b) => b.precio - a.precio);
    }

    /**
     * Obtiene estadísticas del inventario
     */
    getStats() {
        const totalProducts = this.products.length;
        const availableProducts = this.products.filter(p => p.disponibilidad).length;
        const unavailableProducts = totalProducts - availableProducts;
        const averagePrice = this.products.length > 0 
            ? this.products.reduce((sum, p) => sum + p.precioFinal, 0) / this.products.length 
            : 0;
        const categories = this.getCategories().length;
        const productsWithDiscount = this.products.filter(p => p.descuento > 0).length;

        return {
            totalProducts,
            availableProducts,
            unavailableProducts,
            averagePrice: parseFloat(averagePrice.toFixed(2)),
            categories,
            productsWithDiscount
        };
    }

    /**
     * Agrega un producto a la lista de modificados (staging)
     * Los cambios se mantienen solo en memoria hasta guardar/sincronizar
     */
    addModifiedProduct(product) {
        // Buscar si ya existe
        const existingIndex = this.modifiedProducts.findIndex(p => p.id === product.id);
        
        if (existingIndex >= 0) {
            // Actualizar el existente
            this.modifiedProducts[existingIndex] = { ...product, modified_at: new Date().toISOString() };
        } else {
            // Agregar nuevo
            const nowIso = new Date().toISOString();
            // Si no tiene created_at, asignarla al crear por primera vez en staging
            const created = product.created_at || nowIso;
            this.modifiedProducts.push({ ...product, created_at: created, modified_at: nowIso });
        }
        
        // NO guardar en localStorage - solo en memoria por requisito del usuario
        return this.modifiedProducts;
    }

    /**
     * Obtiene todos los productos modificados
     */
    getModifiedProducts() {
        return this.modifiedProducts;
    }

    /**
     * Limpia la lista de productos modificados
     */
    clearModifiedProducts() {
        this.modifiedProducts = [];
    }

    /**
     * Elimina un producto de la lista de modificados
     */
    removeModifiedProduct(productId) {
        this.modifiedProducts = this.modifiedProducts.filter(p => p.id !== productId);
        // NO guardar en localStorage - solo en memoria
        return this.modifiedProducts;
    }

    /**
     * Descarga productos desde GitHub y sincroniza
     */
    async syncWithGitHub() {
        if (!this.githubManager) {
            throw new Error('GitHubManager no está configurado');
        }

        if (this.syncInProgress) {
            console.log('Sincronización ya en progreso...');
            return;
        }

        try {
            this.syncInProgress = true;
            console.log('🔄 Sincronizando productos desde GitHub...');

            // Descargar productos del repo
            const remoteData = await this.githubManager.getProducts();
            
            if (remoteData && remoteData.products) {
                // Comparar y resolver conflictos
                const updatedProducts = this.mergeProducts(this.products, remoteData.products);
                this.products = updatedProducts;
                this.normalizeProducts();
                this.filteredProducts = [...this.products];
                
                this.lastSyncTime = new Date().toISOString();
                console.log('✅ Productos sincronizados correctamente');
                return { success: true, syncTime: this.lastSyncTime };
            }
        } catch (error) {
            console.error('Error en sincronización:', error.message);
            throw error;
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * Fusiona productos locales con remotos (resuelve conflictos)
     * Estrategia: Local gana si más reciente, sino remoto
     */
    mergeProducts(localProducts, remoteProducts) {
        if (!remoteProducts || remoteProducts.length === 0) {
            return localProducts;
        }

        const remoteMap = new Map(remoteProducts.map(p => [p.nombre, p]));
        const result = [];

        // Procesar productos locales
        for (const local of localProducts) {
            const remote = remoteMap.get(local.nombre);
            
            if (remote) {
                // Producto existe en ambos lados
                const localTime = new Date(local.modified_at || 0);
                const remoteTime = new Date(remote.modified_at || 0);

                // Usar el más reciente
                result.push(localTime > remoteTime ? local : remote);
                remoteMap.delete(local.nombre);
            } else {
                // Producto solo en local
                result.push(local);
            }
        }

        // Agregar productos que solo existen en remoto
        for (const remote of remoteMap.values()) {
            result.push(remote);
        }

        return result;
    }

    /**
     * Prepara los datos para guardar en GitHub
     */
    /**
     * Obtiene SOLO los cambios pendientes (productos nuevos + modificados)
     * SIN los campos internos (_previousNombre, _imageFile, etc)
     * El merge con el JSON existente se hace en GitHub
     */
    getPendingChangesAsJSON() {
        const changes = this.modifiedProducts.map(p => {
            // ⭐ IMPORTANTE: Crear objeto limpio con solo los campos del JSON
            // Incluir _previousNombre si existe (es importante para merge)
            const cleanProduct = {
                nombre: p.nombre || '',
                categoria: p.categoria || '',
                precio: parseFloat(p.precio) || 0,
                descuento: parseFloat(p.descuento) || 0,
                mas_vendido: p.mas_vendido || false,
                nuevo: p.nuevo || false,
                oferta: p.oferta || false,
                imagenes: Array.isArray(p.imagenes) ? p.imagenes : [],
                descripcion: p.descripcion || '',
                disponibilidad: p.disponibilidad !== false,
                // Mantener timestamps ISO para sincronización
                created_at: p.created_at || new Date().toISOString(),
                modified_at: p.modified_at || new Date().toISOString(),
                // Campo legacy de visualización local (formato legible)
            };

            // ⭐ Agregar _previousNombre si existe (necesario para identificar renombramientos)
            if (p._previousNombre) {
                cleanProduct._previousNombre = p._previousNombre;
            }

            return cleanProduct;
        });
        return changes;
    }

    /**
     * ⭐ NUEVO: Valida la integridad de los datos de un producto
     * Asegura que no hay datos corruptos o inconsistentes
     * @returns {Object} { valid: boolean, errors: string[] }
     */
    validateProductData(product) {
        const errors = [];

        // Validar campos requeridos
        if (!product.nombre || product.nombre.trim() === '') {
            errors.push('Nombre vacío');
        }
        if (!product.categoria || product.categoria.trim() === '') {
            errors.push('Categoría vacía');
        }

        // Validar tipos de datos
        if (isNaN(parseFloat(product.precio))) {
            errors.push('Precio no es numérico');
        }
        if (isNaN(parseFloat(product.descuento))) {
            errors.push('Descuento no es numérico');
        }

        // Validar rangos
        if (parseFloat(product.precio) < 0) {
            errors.push('Precio no puede ser negativo');
        }
        if (parseFloat(product.descuento) < 0 || parseFloat(product.descuento) > 100) {
            errors.push('Descuento debe estar entre 0 y 100');
        }

        // Validar imagenes
        if (!Array.isArray(product.imagenes)) {
            errors.push('Imágenes no es un array');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * ⭐ NUEVO: Obtiene datos clasificados para sincronización
     * Separa productos nuevos de modificados y valida cada uno
     * @returns {Object} { newProducts: [], modifiedProducts: [], errors: [] }
     */
    getClassifiedPendingChanges() {
        const result = {
            newProducts: [],
            modifiedProducts: [],
            errors: []
        };

        for (const product of this.modifiedProducts) {
            // Validar datos
            const validation = this.validateProductData(product);
            if (!validation.valid) {
                result.errors.push({
                    producto: product.nombre,
                    errores: validation.errors
                });
                continue;
            }

            // Clasificar como nuevo o modificado
            const existingInOriginal = this.products.some(
                p => p.nombre === product.nombre || p.id === product.id
            );

            if (existingInOriginal) {
                result.modifiedProducts.push(product);
            } else {
                result.newProducts.push(product);
            }
        }
        return result;
    }

    /**
     * Obtiene estadísticas de cambios pendientes
     */
    getPendingStats() {
        return {
            totalChanges: this.modifiedProducts.length,
            newProducts: this.modifiedProducts.filter(p => !this.products.some(op => op.nombre === p.nombre)).length,
            modifiedProducts: this.modifiedProducts.filter(p => this.products.some(op => op.nombre === p.nombre && op.id === p.id)).length,
            hasChanges: this.modifiedProducts.length > 0,
            lastSyncTime: this.lastSyncTime
        };
    }
}