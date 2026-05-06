/**
 * Gestor de Packs con Lógica de Staging
 * Modelo basado en productManager.js pero adaptado a packs.json y Images/Packs/
 */

import { StagingDB } from '../../Core/stagingDB.js';
import {
    fileToDataURL,
    base64ToDataURL,
    sanitizeFileName,
    objectToBase64,
    base64ToObject,
    isValidImageFile,
    isValidFileSize,
    generateProductId,
    validateProduct,
    createObjectURL,
    revokeObjectURL
} from './inventoryUtils.js';

const CONFIG = {
    GITHUB_API: {
        REPO_OWNER: "soporteasere-prog",
        REPO_NAME: "Asereshops",
        BRANCH: "main",
        PACKS_FILE_PATH: "Json/packs.json",
        IMAGE_PATH_PREFIX: "Images/Packs/"
    }
};

export class PackManager {
    constructor(githubManager = null) {
        this.packs = [];
        this.stagingDB = new StagingDB();
        this.githubManager = githubManager;
        this.stagedChanges = [];
        this.isLoading = false;
        this.lastSync = null;

        this.loadStagedChanges();
    }

    async init() {
        await this.stagingDB.initStagingDB();
        console.log('PackManager inicializado');
    }

    async loadPacks() {
        if (this.isLoading) return this.packs;
        this.isLoading = true;
        try {
            const url = `${this.getPacksFileUrl()}?t=${Date.now()}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.packs && Array.isArray(data.packs)) {
                this.packs = data.packs;
                this.normalizePacks();
                // Reconcile staged changes against freshly loaded packs
                try { this.reconcileStagedChangesWithRemote(); } catch(e) { console.warn('reconcileStagedChangesWithRemote error', e); }
            } else {
                throw new Error('Estructura JSON inválida: se esperaba { packs: [...] }');
            }
            this.isLoading = false;
            console.log(`${this.packs.length} packs cargados desde GitHub`);
            return this.packs;
        } catch (error) {
            this.isLoading = false;
            console.error('Error al cargar packs:', error);
            throw error;
        }
    }

    reconcileStagedChangesWithRemote() {
        // Remove staged 'delete' changes if the pack no longer exists in remote packs
        const existingIds = new Set((this.packs || []).map(p => String(p.id)));
        const beforeCount = this.stagedChanges.length;
        this.stagedChanges = this.stagedChanges.filter(change => {
            if (!change || !change.type) return false;
            if (change.type === 'delete') {
                // If remote already doesn't have the pack, drop the staged delete
                if (change.packId && !existingIds.has(String(change.packId))) {
                    // also remove any staged image if present
                    if (change.imageKey) {
                        try { this.stagingDB.deleteImageFromIDB(change.imageKey); } catch(e) { console.warn('delete staged image failed', e); }
                    }
                    return false;
                }
            }
            // keep other changes
            return true;
        });
        if (this.stagedChanges.length !== beforeCount) this.saveStagedChanges();
    }

    normalizePacks() {
        this.packs.forEach((pack) => {
            // Ensure pack has a stable numeric string id when possible
            if (!pack.id) pack.id = String(this.getNextPackId());
            else pack.id = String(pack.id);
            pack.precio = parseFloat(pack.precio) || 0;
            pack.descuento = parseFloat(pack.descuento) || 0;
            if (pack.oferta === true) {
                const precioConDescuento = pack.precio * (1 - pack.descuento / 100);
                pack.precioFinal = parseFloat(precioConDescuento.toFixed(2));
            } else {
                pack.precioFinal = pack.precio;
            }
            pack.disponible = pack.disponible !== false;

            // Normalizar imagen: packs usan campo 'imagen' (string) -> convertir a imagenes array
            if (pack.imagen) {
                pack.imagenes = [pack.imagen];
            }

            if (pack.imagenes && Array.isArray(pack.imagenes) && pack.imagenes.length > 0) {
                pack.imagenUrl = `${this.getImageUrl(pack.imagenes[0])}`;
            } else {
                pack.imagenUrl = 'Img/no_image.jpg';
            }

            pack.searchText = `${pack.nombre} ${pack.categoria || ''} ${pack.descripcion || ''}`.toLowerCase();
            pack.created_at = pack.created_at || pack.hora || null;
            pack.modified_at = pack.modified_at || pack.created_at || null;
        });
    }

    getMaxNumericPackId() {
        let maxId = 0;
        // Check existing packs
        this.packs.forEach(p => {
            const asNum = parseInt(p.id, 10);
            if (!isNaN(asNum) && asNum > maxId) maxId = asNum;
        });
        // Also consider staged new packs
        this.stagedChanges.forEach(c => {
            if (c.type === 'new' && c.packId) {
                const asNum = parseInt(c.packId, 10);
                if (!isNaN(asNum) && asNum > maxId) maxId = asNum;
            }
        });
        return maxId;
    }

    getNextPackId() {
        const max = this.getMaxNumericPackId();
        return max + 1;
    }

    async stageChange(type, packData, imageFile = null) {
        if (!['new', 'modify', 'delete'].includes(type)) throw new Error('Tipo de cambio inválido');

        const validation = validateProduct(packData);
        if (!validation.isValid) throw new Error(`Pack inválido: ${validation.errors.join(', ')}`);

        if (type === 'new' && !packData.id) packData.id = String(this.getNextPackId());

        let originalPackName = null;
        if (type === 'modify') {
            const existing = this.packs.find(p => p.id === packData.id);
            if (existing) originalPackName = existing.nombre;
        }

        const change = {
            id: `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            timestamp: Date.now(),
            packId: packData.id,
            productData: JSON.parse(JSON.stringify(packData)),
            originalPackName,
            hasNewImage: false,
            imageKey: null,
            originalImagePath: null
        };

        if (imageFile) {
            if (!isValidImageFile(imageFile)) throw new Error('El archivo debe ser una imagen válida (JPEG, PNG, GIF, WebP)');
            if (!isValidFileSize(imageFile)) throw new Error('El archivo excede 5MB');
            try {
                const base64 = await fileToDataURL(imageFile);
                const imageKey = sanitizeFileName(imageFile.name);
                change.imageKey = imageKey;
                change.hasNewImage = true;
                await this.stagingDB.saveImageToIDB(imageKey, base64);
                change.productData.imagenes = [imageKey];
                console.log(`Imagen procesada y guardada: ${imageKey}`);
            } catch (error) {
                console.error('Error procesando imagen:', error);
                throw error;
            }
        }

        this.stagedChanges.push(change);
        this.saveStagedChanges();
        return change;
    }

    getStagedChanges() { return this.stagedChanges; }

    getStagingStats() {
        return {
            total: this.stagedChanges.length,
            new: this.stagedChanges.filter(c => c.type === 'new').length,
            modify: this.stagedChanges.filter(c => c.type === 'modify').length,
            delete: this.stagedChanges.filter(c => c.type === 'delete').length,
            withImages: this.stagedChanges.filter(c => c.hasNewImage).length
        };
    }

    async discardChange(changeId) {
        const idx = this.stagedChanges.findIndex(c => c.id === changeId);
        if (idx === -1) throw new Error('Cambio no encontrado');
        const change = this.stagedChanges[idx];
        if (change.imageKey) await this.stagingDB.deleteImageFromIDB(change.imageKey);
        this.stagedChanges.splice(idx, 1);
        this.saveStagedChanges();
        return true;
    }

    async discardAllChanges() {
        await this.stagingDB.clearAllImages();
        this.stagedChanges = [];
        this.saveStagedChanges();
        return true;
    }

    async saveAllStagedChanges(progressCallback = null) {
        if (!this.githubManager) throw new Error('GitHubManager no está configurado');
        if (!this.githubManager.isConfigured()) throw new Error('Token de GitHub no configurado');
        if (this.stagedChanges.length === 0) return { success: true, message: 'No hay cambios para sincronizar' };

        try {
            const processedPacks = JSON.parse(JSON.stringify(this.packs));
            const report = (percent, message) => { try { if (typeof progressCallback === 'function') progressCallback(percent, message); } catch(e){} };
            report(5, 'Iniciando procesamiento de cambios...');

            let processedCount = 0;
            for (const change of this.stagedChanges) {
                processedCount++;
                report(Math.round((processedCount / this.stagedChanges.length) * 50), `Procesando cambios (${processedCount}/${this.stagedChanges.length})...`);

                if (change.hasNewImage && change.imageKey) {
                    const imageData = await this.stagingDB.getImageFromIDB(change.imageKey);
                    if (imageData) {
                        const uploadPath = `${CONFIG.GITHUB_API.IMAGE_PATH_PREFIX}${change.imageKey}`;
                        await this.githubManager.uploadFile(uploadPath, imageData.base64);
                    }
                }

                if (change.type === 'new') {
                    const exists = processedPacks.some(p => p.nombre === change.productData.nombre);
                    if (!exists) {
                        const packToAdd = this.preparePackForExport(change.productData);
                        const nowIso = new Date().toISOString();
                        packToAdd.created_at = packToAdd.created_at || nowIso;
                        packToAdd.modified_at = packToAdd.modified_at || nowIso;
                        processedPacks.push(packToAdd);
                    }
                } else if (change.type === 'modify') {
                    const searchName = change.originalPackName || change.productData.nombre;
                    const index = processedPacks.findIndex(p => p.nombre === searchName);
                    if (index !== -1) {
                        const packToUpdate = this.preparePackForExport(change.productData);
                        const existing = processedPacks[index] || {};
                        packToUpdate.created_at = packToUpdate.created_at || existing.created_at || existing.hora || null;
                        packToUpdate.modified_at = new Date().toISOString();
                        processedPacks[index] = packToUpdate;
                        try {
                            if (change.hasNewImage && existing && Array.isArray(existing.imagenes) && existing.imagenes.length > 0) {
                                const oldImages = existing.imagenes.filter(n => !!n && n !== change.imageKey);
                                for (const oldImg of oldImages) {
                                    const oldPath = `${CONFIG.GITHUB_API.IMAGE_PATH_PREFIX}${oldImg}`;
                                    try { await this.githubManager.deleteFileFromRepo(oldPath, `Eliminar imagen antigua ${oldImg} al modificar pack ${change.productData.nombre}`); } catch(e) { console.warn('No se pudo eliminar imagen antigua', e); }
                                }
                            }
                        } catch (err) { console.warn('Error al intentar eliminar imagen anterior durante modify:', err); }
                    } else {
                        throw new Error(`No se pudo encontrar el pack "${searchName}" para modificar`);
                    }
                } else if (change.type === 'delete') {
                    const searchName = change.originalPackName || change.productData.nombre;
                    const index = processedPacks.findIndex(p => p.nombre === searchName);
                    if (index !== -1) {
                        try {
                            const prod = processedPacks[index];
                            if (prod && Array.isArray(prod.imagenes) && prod.imagenes.length > 0) {
                                for (const imgName of prod.imagenes) {
                                    if (!imgName) continue;
                                    const imgPath = `${CONFIG.GITHUB_API.IMAGE_PATH_PREFIX}${imgName}`;
                                    try { await this.githubManager.deleteFileFromRepo(imgPath, `Eliminar imagen ${imgName} al borrar pack ${searchName}`); } catch (err) { console.warn(`No se pudo eliminar imagen ${imgName}:`, err.message || err); }
                                }
                            }
                        } catch (err) { console.warn('Error al intentar eliminar imágenes asociadas durante delete:', err); }
                        processedPacks.splice(index, 1);
                    } else {
                        throw new Error(`No se pudo encontrar el pack "${searchName}" para eliminar`);
                    }
                }
            }

            const fileContent = { packs: processedPacks };
            if (!Array.isArray(fileContent.packs)) throw new Error('Error crítico: La estructura de packs no es un array válido');

            let uploadResult = null;
            try {
                const jsonString = JSON.stringify(fileContent, null, 2);
                const reParsed = JSON.parse(jsonString);
                if (!reParsed.packs || !Array.isArray(reParsed.packs)) throw new Error('JSON no es válido después de serialización');
                if (reParsed.packs.length !== processedPacks.length) throw new Error('Mismatch de cantidad de packs');
                // Codificar a Base64 preservando UTF-8 de forma segura
                const base64Content = objectToBase64(fileContent);
                uploadResult = await this.githubManager.uploadFile(CONFIG.GITHUB_API.PACKS_FILE_PATH, base64Content, `Actualizar packs - ${processedPacks.length} items (${this.stagedChanges.length} cambios)`);
            } catch (error) { console.error('Error validando o serializando JSON:', error); throw error; }

            await this.discardAllChanges();
            this.lastSync = new Date();
            return { success: true, message: 'Sincronización packs completada', filesUpdated: this.stagedChanges.length + 1, commitSha: uploadResult?.commit?.sha || null };
        } catch (error) {
            console.error('Error sincronizando cambios packs:', error);
            throw error;
        }
    }

    saveStagedChanges() {
        const stagedMetadata = this.stagedChanges.map(change => ({
            id: change.id,
            type: change.type,
            timestamp: change.timestamp,
            packId: change.packId,
            productData: change.productData,
            hasNewImage: change.hasNewImage,
            imageKey: change.imageKey
        }));
        localStorage.setItem('asere_packs_staged_changes', JSON.stringify(stagedMetadata));
    }

    loadStagedChanges() {
        const stored = localStorage.getItem('asere_packs_staged_changes');
        if (stored) {
            try {
                const metadata = JSON.parse(stored);
                this.stagedChanges = metadata.map(meta => ({ ...meta, id: meta.id || `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }));
            } catch (error) {
                console.warn('Error cargando cambios packs:', error);
                this.stagedChanges = [];
            }
        }
    }

    getPacksFileUrl() {
        return `https://raw.githubusercontent.com/${CONFIG.GITHUB_API.REPO_OWNER}/${CONFIG.GITHUB_API.REPO_NAME}/${CONFIG.GITHUB_API.BRANCH}/${CONFIG.GITHUB_API.PACKS_FILE_PATH}`;
    }

    getImageUrl(imageName) {
        return `https://raw.githubusercontent.com/${CONFIG.GITHUB_API.REPO_OWNER}/${CONFIG.GITHUB_API.REPO_NAME}/${CONFIG.GITHUB_API.BRANCH}/${CONFIG.GITHUB_API.IMAGE_PATH_PREFIX}${imageName}`;
    }

    searchPacks(term) {
        const t = term.toLowerCase();
        return this.packs.filter(p => p.searchText.includes(t));
    }

    filterByCategory(category) {
        if (!category || category === 'todos') return this.packs;
        return this.packs.filter(p => (p.categoria || '').toLowerCase() === category.toLowerCase());
    }

    getAllCategories() { const cats = new Set(this.packs.map(p => p.categoria || '')); return Array.from(cats).sort(); }

    getPackById(id) { return this.packs.find(p => p.id === id) || null; }

    preparePackForExport(packData) {
        if (!packData.nombre || typeof packData.nombre !== 'string') throw new Error('El campo "nombre" es requerido y debe ser texto');
        return {
            // Preserve id when exporting (as string)
            id: packData.id ? String(packData.id) : undefined,
            nombre: String(packData.nombre).trim(),
            categoria: String(packData.categoria || '').trim(),
            precio: parseFloat(packData.precio) || 0,
            descuento: parseFloat(packData.descuento || 0),
            top: Boolean(packData.top || false),
            nuevo: Boolean(packData.nuevo || false),
            oferta: Boolean(packData.oferta || false),
            disponible: packData.disponible !== false,
            // Export as single 'imagen' to match existing packs.json structure
            imagenes: Array.isArray(packData.imagenes) ? packData.imagenes : (packData.imagen ? [packData.imagen] : []),
            imagen: (Array.isArray(packData.imagenes) && packData.imagenes.length > 0) ? packData.imagenes[0] : (packData.imagen || null),
            descripcion: String(packData.descripcion || '').trim(),
            caracteristicas: Array.isArray(packData.caracteristicas) ? packData.caracteristicas : [],
            created_at: packData.created_at || packData.hora || null,
            modified_at: packData.modified_at || packData.hora || null
        };
    }
}
