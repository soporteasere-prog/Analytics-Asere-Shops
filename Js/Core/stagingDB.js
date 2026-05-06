/**
 * Motor de Base de Datos Local (Staging Engine)
 * Gestiona IndexedDB para almacenar imágenes en Base64
 * y localStorage para metadatos de cambios
 */

export class StagingDB {
    constructor(dbName = 'AsereInventoryStaging', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this.STORES = {
            IMAGES: 'staging_images',
            METADATA: 'staging_metadata'
        };
    }

    /**
     * Inicializa la base de datos IndexedDB
     */
    async initStagingDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('Error al abrir IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Crear almacén para imágenes
                if (!db.objectStoreNames.contains(this.STORES.IMAGES)) {
                    db.createObjectStore(this.STORES.IMAGES, { keyPath: 'key' });
                }

                // Crear almacén para metadatos
                if (!db.objectStoreNames.contains(this.STORES.METADATA)) {
                    db.createObjectStore(this.STORES.METADATA, { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Guarda una imagen en Base64 a IndexedDB
     * @param {string} key - Identificador único de la imagen
     * @param {string} base64Data - Datos Base64 de la imagen (sin prefijo "data:image...")
     * @returns {Promise}
     */
    async saveImageToIDB(key, base64Data) {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.IMAGES], 'readwrite');
            const store = transaction.objectStore(this.STORES.IMAGES);

            const imageData = {
                key,
                base64: base64Data,
                timestamp: Date.now(),
                mimeType: 'image/jpeg' // Por defecto, puede detectarse del archivo original
            };

            const request = store.put(imageData);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                console.log(`Imagen guardada en IDB: ${key}`);
                resolve(imageData);
            };
        });
    }

    /**
     * Obtiene una imagen de IndexedDB
     * @param {string} key - Identificador de la imagen
     * @returns {Promise<Object|null>}
     */
    async getImageFromIDB(key) {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.IMAGES], 'readonly');
            const store = transaction.objectStore(this.STORES.IMAGES);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(request.result || null);
            };
        });
    }

    /**
     * Elimina una imagen de IndexedDB
     * @param {string} key - Identificador de la imagen
     * @returns {Promise}
     */
    async deleteImageFromIDB(key) {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.IMAGES], 'readwrite');
            const store = transaction.objectStore(this.STORES.IMAGES);
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                console.log(`Imagen eliminada de IDB: ${key}`);
                resolve();
            };
        });
    }

    /**
     * Obtiene todas las imágenes en staging
     * @returns {Promise<Array>}
     */
    async getAllStagingImages() {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.IMAGES], 'readonly');
            const store = transaction.objectStore(this.STORES.IMAGES);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Limpia todas las imágenes de IndexedDB
     * @returns {Promise}
     */
    async clearAllImages() {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.IMAGES], 'readwrite');
            const store = transaction.objectStore(this.STORES.IMAGES);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                console.log('Todas las imágenes han sido eliminadas de IDB');
                resolve();
            };
        });
    }

    /**
     * Guarda metadatos en IDB
     * @param {string} key - Identificador del metadato
     * @param {Object} data - Datos a guardar
     * @returns {Promise}
     */
    async saveMetadata(key, data) {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.METADATA], 'readwrite');
            const store = transaction.objectStore(this.STORES.METADATA);

            const metadata = {
                key,
                data,
                timestamp: Date.now()
            };

            const request = store.put(metadata);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(metadata);
        });
    }

    /**
     * Obtiene metadatos de IDB
     * @param {string} key - Identificador del metadato
     * @returns {Promise<Object|null>}
     */
    async getMetadata(key) {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.METADATA], 'readonly');
            const store = transaction.objectStore(this.STORES.METADATA);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || null);
        });
    }

    /**
     * Limpia todos los metadatos de IDB
     * @returns {Promise}
     */
    async clearAllMetadata() {
        if (!this.db) await this.initStagingDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.STORES.METADATA], 'readwrite');
            const store = transaction.objectStore(this.STORES.METADATA);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                console.log('Todos los metadatos han sido eliminados de IDB');
                resolve();
            };
        });
    }
}
