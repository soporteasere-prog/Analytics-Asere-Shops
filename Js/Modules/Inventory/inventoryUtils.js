/**
 * Utilidades para el Sistema de Gestión de Productos
 * Conversión de archivos, sanitización, encoding, etc.
 */

/**
 * Convierte un File a Base64 limpio (sin prefijo "data:image...")
 * @param {File} file - Archivo de imagen
 * @returns {Promise<string>} - Base64 sin prefijo
 */
export function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        // Validar que file sea válido
        if (!file || !(file instanceof File)) {
            reject(new Error('Debe proporcionar un archivo válido'));
            return;
        }

        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                // reader.result o e.target.result es algo como: "data:image/jpeg;base64,/9j/4AAQSkZJ..."
                const base64WithPrefix = reader.result || (e && e.target && e.target.result) || e?.result;
                
                if (!base64WithPrefix || typeof base64WithPrefix !== 'string') {
                    throw new Error('No se pudo leer el archivo');
                }
                
                // Extraer solo la parte Base64
                const parts = base64WithPrefix.split(',');
                if (parts.length < 2) {
                    throw new Error('Formato de archivo inválido');
                }
                
                const base64Clean = parts[1];
                resolve(base64Clean);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = (error) => {
            reject(error);
        };
        
        reader.readAsDataURL(file);
    });
}

/**
 * Convierte Base64 limpio a Data URL
 * @param {string} base64 - Base64 sin prefijo
 * @param {string} mimeType - Tipo MIME (por defecto: image/jpeg)
 * @returns {string} - Data URL completo
 */
export function base64ToDataURL(base64, mimeType = 'image/jpeg') {
    return `data:${mimeType};base64,${base64}`;
}

/**
 * Limpia nombres de archivos (quita espacios, caracteres especiales)
 * @param {string} fileName - Nombre original del archivo
 * @returns {string} - Nombre sanitizado
 */
export function sanitizeFileName(fileName) {
    // Remover extensión temporalmente
    const ext = fileName.substring(fileName.lastIndexOf('.'));
    let name = fileName.substring(0, fileName.lastIndexOf('.'));
    
    // Reemplazar espacios con guiones
    name = name.replace(/\s+/g, '-');
    
    // Remover caracteres especiales (mantener solo alfanuméricos, guiones, guiones bajos)
    name = name.replace(/[^a-zA-Z0-9\-_]/g, '');
    
    // Convertir a minúsculas
    name = name.toLowerCase();
    
    // Remover guiones múltiples
    name = name.replace(/-+/g, '-');
    
    // Agregar timestamp para unicidad
    const timestamp = Date.now();
    
    return `${name}_${timestamp}${ext}`;
}

/**
 * Convierte un objeto a JSON Base64
 * @param {Object} obj - Objeto a convertir
 * @returns {string} - JSON codificado en Base64 con UTF-8
 */
export function uint8ArrayToBase64(uint8Array) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

export function objectToBase64(obj) {
    const jsonString = JSON.stringify(obj, null, 2);
    // Codificar a Base64 preservando UTF-8
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonString);
    return uint8ArrayToBase64(data);
}

/**
 * Decodifica JSON Base64
 * @param {string} base64String - String Base64
 * @returns {Object} - Objeto decodificado con UTF-8
 */
export function base64ToObject(base64String) {
    // Decodificar base64 preservando UTF-8
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(bytes);
    return JSON.parse(jsonString);
}

/**
 * Obtiene el MIME type de un archivo
 * @param {File} file - Archivo
 * @returns {string} - MIME type
 */
export function getFileMimeType(file) {
    return file.type || 'application/octet-stream';
}

/**
 * Valida que un archivo sea imagen
 * @param {File} file - Archivo a validar
 * @returns {boolean}
 */
export function isValidImageFile(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    return validTypes.includes(file.type);
}

/**
 * Valida el tamaño del archivo (máximo 5MB)
 * @param {File} file - Archivo a validar
 * @param {number} maxSizeMB - Tamaño máximo en MB (por defecto 5)
 * @returns {boolean}
 */
export function isValidFileSize(file, maxSizeMB = 5) {
    const maxBytes = maxSizeMB * 1024 * 1024;
    return file.size <= maxBytes;
}

/**
 * Formatea bytes a unidad legible
 * @param {number} bytes - Cantidad de bytes
 * @returns {string} - Tamaño formateado
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Genera un ID único para productos
 * @returns {string} - ID único
 */
export function generateProductId() {
    return `prod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Valida estructura de producto
 * @param {Object} product - Producto a validar
 * @returns {Object} - { isValid: boolean, errors: string[] }
 */
export function validateProduct(product) {
    const errors = [];

    if (!product.nombre || product.nombre.trim() === '') {
        errors.push('El nombre del producto es requerido');
    }

    if (product.precio === undefined || product.precio === null || product.precio < 0) {
        errors.push('El precio debe ser un número positivo');
    }

    if (!product.categoria || product.categoria.trim() === '') {
        errors.push('La categoría es requerida');
    }

    if (product.descripcion && product.descripcion.length > 500) {
        errors.push('La descripción no puede exceder 500 caracteres');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Crea una URL temporal para una imagen Base64 (para vista previa)
 * @param {string} base64 - Base64 sin prefijo
 * @param {string} mimeType - MIME type
 * @returns {string} - URL de Blob
 */
export function createObjectURL(base64, mimeType = 'image/jpeg') {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
}

/**
 * Libera una URL de Blob
 * @param {string} objectURL - URL creada con createObjectURL
 */
export function revokeObjectURL(objectURL) {
    URL.revokeObjectURL(objectURL);
}
