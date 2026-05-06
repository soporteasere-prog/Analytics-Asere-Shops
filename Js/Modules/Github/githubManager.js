/**
 * Módulo de gestión de GitHub
 * Maneja la integración con la API de GitHub para guardar y cargar datos
 */

import { CONFIG } from "../../Core/config.js";

// Constantes de configuración
const GITHUB_CONFIG = CONFIG.GITHUB;

export class GitHubManager {
  constructor() {
    this.token = localStorage.getItem("github_token_asere_new") || null;
    this.apiBase = "https://api.github.com";
  }

  /**
   * Valida que la configuración necesaria esté presente
   */
  isConfigured() {
    return this.token !== null && this.token !== "";
  }

  /**
   * Obtiene la configuración actual
   */
  getConfig() {
    return {
      token: this.token ? "***" : null,
      repo: GITHUB_CONFIG.REPO,
      filePath: GITHUB_CONFIG.FILE_PATH,
    };
  }

  /**
   * Guarda el token de GitHub
   */
  saveToken(token) {
    this.token = token;
    localStorage.setItem("github_token_asere_new", token);
    return true;
  }

  /**
   * Limpia el token de GitHub
   */
  clearToken() {
    this.token = null;
    localStorage.removeItem("github_token_asere_new");
  }

  /**
   * Prueba la conexión con GitHub
   */
  async testConnection() {
    if (!this.isConfigured()) {
      throw new Error(
        "Configuración incompleta. Por favor, configura tu llave de acceso.",
      );
    }

    try {
      const response = await fetch(
        `${this.apiBase}/repos/${GITHUB_CONFIG.REPO}`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Repositorio no encontrado. Verifica el nombre.");
        } else if (response.status === 401) {
          throw new Error("Llave de acceso inválida o expirada.");
        }
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        success: true,
        repoName: data.name,
        repoUrl: data.html_url,
        isPrivate: data.private,
      };
    } catch (error) {
      throw new Error(`Error de conexión: ${error.message}`);
    }
  }

  /**
   * Obtiene el contenido actual del archivo desde GitHub
   * @param {number} retries - Número de reintentos
   */
  async getFileContent(retries = 3) {
    if (!this.isConfigured()) {
      throw new Error("Configuración incompleta.");
    }

    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(
          `${this.apiBase}/repos/${GITHUB_CONFIG.REPO}/contents/${GITHUB_CONFIG.FILE_PATH}`,
          {
            headers: {
              Authorization: `token ${this.token}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );

        if (!response.ok) {
          if (response.status === 404) {
            return null; // Archivo no existe
          }
          if (response.status === 429) {
            // Rate limit - esperar y reintentar
            const retryAfter = response.headers.get('Retry-After') || (30 * (attempt + 1));
            console.warn(`Rate limit. Esperando ${retryAfter}s antes de reintentar...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        // Decodificar base64 preservando UTF-8
        const binaryString = atob(data.content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const decoder = new TextDecoder("utf-8");
        const content = decoder.decode(bytes);

        return {
          content: JSON.parse(content),
          sha: data.sha,
        };
      } catch (error) {
        lastError = error;
        if (attempt < retries - 1) {
          // Esperar antes de reintentar (backoff exponencial)
          const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    throw new Error(`Error al obtener archivo después de ${retries} intentos: ${lastError.message}`);
  }

  /**
   * Limpia los datos para evitar referencias circulares y serializar correctamente
   * @param {*} obj - Objeto a limpiar
   * @param {WeakSet} seen - Set de objetos ya procesados
   * @param {number} depth - Profundidad actual de recursión
   * @param {number} maxDepth - Profundidad máxima permitida
   * @returns {*} Objeto limpio
   */
  cleanData(obj, seen = new WeakSet(), depth = 0, maxDepth = 10) {
    // Límite de profundidad para evitar recursión infinita
    if (depth > maxDepth) return undefined;

    // Valores primitivos
    if (obj === null) return null;
    if (obj === undefined) return undefined;
    if (typeof obj !== "object") {
      // Primitivos: string, number, boolean, etc
      if (
        typeof obj === "string" ||
        typeof obj === "number" ||
        typeof obj === "boolean"
      ) {
        return obj;
      }
      // Ignorar funciones, symbols y otros tipos especiales
      return undefined;
    }

    // Detectar referencias circulares
    if (seen.has(obj)) {
      return undefined;
    }

    // Marcar este objeto como visto
    seen.add(obj);

    // Manejar Arrays
    if (Array.isArray(obj)) {
      return obj
        .map((item) => this.cleanData(item, seen, depth + 1, maxDepth))
        .filter((item) => item !== undefined);
    }

    // Ignorar objetos especiales que no son serializables
    if (obj instanceof Date || obj instanceof Error || obj instanceof Function) {
      return undefined;
    }

    // Procesar objetos planos
    const cleaned = {};
    let hasProperties = false;

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        // Ignorar funciones
        if (typeof value === "function" || typeof value === "symbol") {
          continue;
        }

        const cleanedValue = this.cleanData(value, seen, depth + 1, maxDepth);

        // Solo incluir propiedades que tengan valor
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
          hasProperties = true;
        }
      }
    }

    return hasProperties ? cleaned : undefined;
  }

  /**
   * Guarda los pedidos en GitHub con reintentos automáticos
   * @param {Array} pedidos - Array de pedidos a guardar
   * @param {String} commitMessage - Mensaje del commit
   * @param {number} retries - Número de reintentos en caso de conflicto
   */
  async savePedidos(
    pedidos,
    commitMessage = "Actualizar pedidos - Analytics Dashboard",
    retries = 5,
  ) {
    if (!this.isConfigured()) {
      throw new Error(
        "Configuración incompleta. Por favor, configura tu llave de acceso.",
      );
    }

    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Obtener el contenido actual para obtener el SHA más reciente
        let sha = null;
        let existing = null;
        
        try {
          existing = await this.getFileContent(3);
          if (existing) {
            sha = existing.sha;
          }
        } catch (error) {
          console.log("Archivo no existe, se creará uno nuevo:", error.message);
        }

        // Limpiar datos antes de stringify para evitar referencias circulares
        const cleanedPedidos = this.cleanData(pedidos);
        const fileContent = JSON.stringify(cleanedPedidos, null, 2);

        // Codificar a Base64 preservando UTF-8 (sin usar apply para evitar stack overflow)
        const encoder = new TextEncoder();
        const data = encoder.encode(fileContent);
        
        // Convertir Uint8Array a string sin usar apply
        let binaryString = "";
        for (let i = 0; i < data.length; i++) {
          binaryString += String.fromCharCode(data[i]);
        }
        const encodedContent = btoa(binaryString);

        // Preparar el body de la solicitud
        const body = {
          message: commitMessage,
          content: encodedContent,
          branch: GITHUB_CONFIG.BRANCH,
        };

        if (sha) {
          body.sha = sha; // Necesario para actualizar archivo existente
        }

        // Hacer la solicitud PUT a GitHub
        const response = await fetch(
          `${this.apiBase}/repos/${GITHUB_CONFIG.REPO}/contents/${GITHUB_CONFIG.FILE_PATH}`,
          {
            method: "PUT",
            headers: {
              Authorization: `token ${this.token}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          if (response.status === 409) {
            // Conflicto: reintentar con backoff exponencial
            lastError = new Error(`Conflicto 409 (intento ${attempt + 1}/${retries}): ${errorData.message || response.statusText}`);
            console.warn(lastError.message);
            
            if (attempt < retries - 1) {
              // Esperar antes de reintentar (backoff exponencial)
              const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
              console.log(`Esperando ${delayMs}ms antes de reintentar...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            }
          } else if (response.status === 429) {
            // Rate limit
            lastError = new Error(`Rate limit ${response.status}`);
            const retryAfter = response.headers.get('Retry-After') || (30 * (attempt + 1));
            console.warn(`Rate limit. Esperando ${retryAfter}s...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
          
          throw new Error(
            `Error ${response.status}: ${errorData.message || response.statusText}`,
          );
        }

        const result = await response.json();
        return {
          success: true,
          message: "Pedidos guardados exitosamente en base de datos",
          commit: result.commit.html_url,
          sha: result.content.sha,
          attempt: attempt + 1,
        };
      } catch (error) {
        lastError = error;
        
        // Si es un error que no es 409, no reintentar
        if (error.message && !error.message.includes("409") && !error.message.includes("Rate limit")) {
          throw error;
        }
        
        if (attempt < retries - 1) {
          console.warn(`Intento ${attempt + 1} fallido: ${error.message}`);
        }
      }
    }
    
    throw new Error(`Error al guardar pedidos después de ${retries} intentos: ${lastError.message}`);
  }

  /**
   * Carga los pedidos desde GitHub
   */
  async loadPedidos() {
    if (!this.isConfigured()) {
      throw new Error("Configuración incompleta.");
    }

    try {
      const result = await this.getFileContent();
      if (!result) {
        return [];
      }
      return result.content;
    } catch (error) {
      throw new Error(`Error al cargar pedidos: ${error.message}`);
    }
  }

  /**
   * Obtiene el historial de commits del archivo
   */
  async getCommitHistory(limit = 10) {
    if (!this.isConfigured()) {
      throw new Error("Configuración incompleta.");
    }

    try {
      const response = await fetch(
        `${this.apiBase}/repos/${GITHUB_CONFIG.REPO}/commits?path=${GITHUB_CONFIG.FILE_PATH}&per_page=${limit}`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const commits = await response.json();
      return commits.map((commit) => ({
        sha: commit.sha.substring(0, 7),
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: new Date(commit.commit.author.date),
        url: commit.html_url,
      }));
    } catch (error) {
      throw new Error(`Error al obtener historial: ${error.message}`);
    }
  }

  /**
   * Sube un archivo a GitHub usando la API con reintentos (para repositorio Asere)
   * @param {string} filePath - Ruta del archivo en el repositorio
   * @param {string} base64Content - Contenido en Base64
   * @param {string} message - Mensaje del commit
   * @param {number} retries - Número de reintentos en caso de conflicto
   */
  async uploadFile(filePath, base64Content, message = "Actualizar archivo", retries = 5) {
    if (!this.isConfigured()) {
      throw new Error("Llave de acceso no configurada. Por favor, configura tu llave de acceso.");
    }

    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Obtener SHA del archivo si existe (para actualización)
        let sha = null;
        try {
          const response = await fetch(
            `${this.apiBase}/repos/soporteasere-prog/Asereshops/contents/${filePath}`,
            {
              headers: {
                Authorization: `token ${this.token}`,
                Accept: "application/vnd.github.v3+json",
              },
            },
          );

          if (response.ok) {
            const data = await response.json();
            sha = data.sha;
          } else if (response.status !== 404) {
            console.warn(`Error ${response.status} al obtener SHA de ${filePath}`);
          }
        } catch (error) {
          console.log(`Archivo no existe: ${filePath}`);
        }

        // Preparar el body
        const body = {
          message: message,
          content: base64Content,
          branch: "main",
        };

        if (sha) {
          body.sha = sha;
        }

        // Hacer PUT a GitHub
        const response = await fetch(
          `${this.apiBase}/repos/soporteasere-prog/Asereshops/contents/${filePath}`,
          {
            method: "PUT",
            headers: {
              Authorization: `token ${this.token}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          if (response.status === 409) {
            // Conflicto: reintentar con backoff exponencial
            lastError = new Error(`Conflicto 409 (intento ${attempt + 1}/${retries})`);
            console.warn(`${lastError.message}: ${errorData.message || response.statusText}`);
            
            if (attempt < retries - 1) {
              const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
              console.log(`Esperando ${delayMs}ms antes de reintentar...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            }
          } else if (response.status === 401) {
            throw new Error("Token de GitHub inválido o expirado");
          } else if (response.status === 429) {
            // Rate limit
            lastError = new Error(`Rate limit ${response.status}`);
            const retryAfter = response.headers.get('Retry-After') || (30 * (attempt + 1));
            console.warn(`Rate limit. Esperando ${retryAfter}s...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
          
          throw new Error(
            `Error ${response.status}: ${errorData.message || response.statusText}`,
          );
        }

        const result = await response.json();
        return {
          success: true,
          message: `Archivo subido: ${filePath}`,
          commit: result.commit,
          sha: result.content.sha,
          attempt: attempt + 1,
        };
      } catch (error) {
        lastError = error;
        
        // Si es un error no recuperable, no reintentar
        if (error.message && !error.message.includes("409") && !error.message.includes("Rate limit")) {
          console.error("Error en uploadFile:", error);
          throw error;
        }
        
        if (attempt < retries - 1) {
          console.warn(`Intento ${attempt + 1} fallido: ${error.message}`);
        }
      }
    }
    
    console.error("Error en uploadFile:", lastError);
    throw lastError;
  }

  /**
   * Guarda los datos de notificación en el repositorio Asere con reintentos
   * @param {Object} notificationData - Objeto con id, titulo, mensaje, subtitulo, tipo, icono
   * @param {String} commitMessage - Mensaje del commit
   * @param {number} retries - Número de reintentos en caso de conflicto
   */
  async saveNotificationData(
    notificationData,
    commitMessage = "Actualizar notificación desde editor",
    retries = 5,
  ) {
    if (!this.isConfigured()) {
      throw new Error(
        "Configuración incompleta. Por favor, configura tu token de GitHub.",
      );
    }

    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Ruta del archivo en el repositorio Asere
        const filePath = "Json/data.json";
        const repoPath = "soporteasere-prog/Asereshops";

        // Obtener SHA del archivo si existe
        let sha = null;
        try {
          const response = await fetch(
            `${this.apiBase}/repos/${repoPath}/contents/${filePath}`,
            {
              headers: {
                Authorization: `token ${this.token}`,
                Accept: "application/vnd.github.v3+json",
              },
            },
          );

          if (response.ok) {
            const data = await response.json();
            sha = data.sha;
          } else if (response.status !== 404) {
            throw new Error(`Error ${response.status} al obtener SHA: ${response.statusText}`);
          }
        } catch (error) {
          console.log(`Archivo no existe, se creará uno nuevo: ${filePath}`);
        }

        // Preparar contenido con UTF-8
        const fileContent = JSON.stringify(notificationData, null, 4);

        // Codificar a Base64 preservando UTF-8 (sin usar apply para evitar stack overflow)
        const encoder = new TextEncoder();
        const data = encoder.encode(fileContent);
        
        // Convertir Uint8Array a string sin usar apply
        let binaryString = "";
        for (let i = 0; i < data.length; i++) {
          binaryString += String.fromCharCode(data[i]);
        }
        const encodedContent = btoa(binaryString);

        // Preparar body de la solicitud
        const body = {
          message: commitMessage,
          content: encodedContent,
          branch: "main",
        };

        if (sha) {
          body.sha = sha;
        }

        // Hacer PUT a GitHub
        const response = await fetch(
          `${this.apiBase}/repos/${repoPath}/contents/${filePath}`,
          {
            method: "PUT",
            headers: {
              Authorization: `token ${this.token}`,
              Accept: "application/vnd.github.v3+json",
              "Content-Type": "application/json; charset=utf-8",
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          if (response.status === 409) {
            // Conflicto: reintentar con backoff exponencial
            lastError = new Error(`Conflicto 409 (intento ${attempt + 1}/${retries}): ${errorData.message || response.statusText}`);
            console.warn(lastError.message);
            
            if (attempt < retries - 1) {
              const delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);
              console.log(`Esperando ${delayMs}ms antes de reintentar...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              continue;
            }
          } else if (response.status === 429) {
            // Rate limit
            lastError = new Error(`Rate limit ${response.status}`);
            const retryAfter = response.headers.get('Retry-After') || (30 * (attempt + 1));
            console.warn(`Rate limit. Esperando ${retryAfter}s...`);
            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
            continue;
          }
          
          throw new Error(
            `Error ${response.status}: ${errorData.message || response.statusText}`,
          );
        }

        const result = await response.json();
        return {
          success: true,
          message: "Notificación guardada exitosamente",
          commit: result.commit.html_url,
          sha: result.content.sha,
          file: filePath,
          attempt: attempt + 1,
        };
      } catch (error) {
        lastError = error;
        
        // Si es un error que no es 409, no reintentar
        if (error.message && !error.message.includes("409") && !error.message.includes("Rate limit")) {
          throw error;
        }
        
        if (attempt < retries - 1) {
          console.warn(`Intento ${attempt + 1} fallido: ${error.message}`);
        }
      }
    }
    
    throw new Error(`Error al guardar notificación después de ${retries} intentos: ${lastError.message}`);
  }

  /**
   * Lista el contenido de un directorio en el repositorio Buquenque
   * @param {string} dirPath - Ruta dentro del repo (e.g., 'Images' o 'Images/products')
   * @returns {Promise<Array>} - Array de objetos con { name, path, type, sha, download_url }
   */
  async listRepoDirectory(dirPath = "") {
    if (!this.isConfigured()) {
      throw new Error("Llave de acceso no configurada. Por favor, configura tu llave de acceso.");
    }

    try {
      const repoPath = `soporteasere-prog/Asereshops`;
      const url = `${this.apiBase}/repos/${repoPath}/contents/${dirPath}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `token ${this.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      // Si es un archivo único, devolverlo como array
      if (!Array.isArray(data)) return [data];
      return data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type,
        sha: item.sha,
        download_url: item.download_url,
        size: item.size || 0,
      }));
    } catch (error) {
      throw new Error(`Error listando directorio: ${error.message}`);
    }
  }

  /**
   * @param {string} filePath - Ruta completa del archivo en el repo (ej: 'Images/foo.jpg')
   * @param {string} commitMessage - Mensaje del commit de borrado
   */
  async deleteFileFromRepo(
    filePath,
    commitMessage = "Eliminar archivo desde panel",
  ) {
    if (!this.isConfigured()) {
      throw new Error("Llave de acceso no configurada. Por favor, configura tu llave de acceso.");
    }

    try {
      const repoPath = `soporteasere-prog/Asereshops`;

      // Obtener SHA del archivo
      const getResp = await fetch(
        `${this.apiBase}/repos/${repoPath}/contents/${filePath}`,
        {
          headers: {
            Authorization: `token ${this.token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!getResp.ok) {
        const err = await getResp.json().catch(() => ({}));
        throw new Error(
          `No se pudo obtener SHA: ${getResp.status} ${err.message || getResp.statusText}`,
        );
      }

      const fileData = await getResp.json();
      const sha = fileData.sha;

      // Ejecutar DELETE con body
      const delResp = await fetch(
        `${this.apiBase}/repos/${repoPath}/contents/${filePath}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `token ${this.token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: commitMessage, sha, branch: "main" }),
        },
      );

      if (!delResp.ok) {
        const errBody = await delResp.json().catch(() => ({}));
        throw new Error(
          `Error eliminando: ${delResp.status} ${errBody.message || delResp.statusText}`,
        );
      }

      const result = await delResp.json();
      return { success: true, commit: result.commit, content: result.content };
    } catch (error) {
      throw new Error(`Error eliminando archivo: ${error.message}`);
    }
  }
}
