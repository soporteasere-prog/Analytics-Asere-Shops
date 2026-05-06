/**
 * Editor de Notificaciones - UI Manager
 * Gestiona la interfaz para crear y editar notificaciones
 * Carga el JSON desde GitHub y permite editarlo en tiempo real
 */

import { GitHubManager } from "../Github/githubManager.js";
import { showAlert } from "../../Core/utils.js";
import { confirm as modalConfirm } from '../../UI/modalUtils.js';

export class NotificationEditorUI {
  constructor() {
    this.githubManager = new GitHubManager();
    this.notificationData = null;
    this.previousId = null;
    this.init();
  }

  /**
   * Inicializa el editor de notificaciones
   */
  async init() {
    try {
      this.initElements();
      this.setupEventListeners();
      await this.loadNotificationData();
      this.populateFormFromData();
      this.setupIconSelector();
      this.updatePreview();
    } catch (error) {
      console.error("Error inicializando NotificationEditorUI:", error);
      showAlert(`❌ Error al inicializar: ${error.message}`, "error");
    }
  }

  /**
   * Inicializa referencias a elementos del DOM
   */
  initElements() {
    // Inputs del formulario
    this.titleInput = document.getElementById("notification-title");
    this.messageInput = document.getElementById("notification-message");
    this.subtitleInput = document.getElementById("notification-subtitle");
    this.typeSelect = document.getElementById("notification-type");
    this.iconBtn = document.getElementById("notification-icon-btn");
    this.iconSelectorModal = document.getElementById("icon-selector-modal");
    this.iconSearchInput = document.getElementById("icon-search");

    // Botones
    this.saveBtn = document.getElementById("save-notification-btn");
    this.resetBtn = document.getElementById("reset-notification-btn");
    this.generateIdBtn = document.getElementById("generate-notification-id");
    this.idDisplay = document.getElementById("notification-id-display");
    this.currentIconDisplay = document.getElementById("current-icon-display");

    // Preview
    this.previewContainer = document.getElementById(
      "notification-preview-container",
    );
    this.previewBanner = document.getElementById("preview-notification-banner");

    // Status
    this.statusMsg = document.getElementById("notification-editor-status");
  }

  /**
   * Configura los event listeners
   */
  setupEventListeners() {
    // Eventos de input para actualizar preview en tiempo real
    this.titleInput?.addEventListener("input", () => this.updatePreview());
    this.messageInput?.addEventListener("input", () => this.updatePreview());
    this.subtitleInput?.addEventListener("input", () => this.updatePreview());
    this.typeSelect?.addEventListener("change", () => this.updatePreview());

    // Selector de icono
    this.iconBtn?.addEventListener("click", () => this.openIconSelector());

    // Botones
    this.saveBtn?.addEventListener("click", () => this.saveNotification());
    this.resetBtn?.addEventListener("click", () => this.resetForm());
    this.generateIdBtn?.addEventListener("click", () => this.generateNewId());

    // Búsqueda de iconos
    this.iconSearchInput?.addEventListener("input", (e) =>
      this.filterIcons(e.target.value),
    );

    // Cerrar modal de iconos
    document
      .getElementById("icon-selector-overlay")
      ?.addEventListener("click", () => this.closeIconSelector());
    document
      .getElementById("icon-selector-close")
      ?.addEventListener("click", () => this.closeIconSelector());
  }

  /**
   * Carga los datos de notificación desde GitHub
   */
  async loadNotificationData() {
    try {
      const response = await fetch(
        "https://raw.githubusercontent.com/soporteasere-prog/Asereshops/refs/heads/main/Json/data.json",
      );

      if (!response.ok) {
        throw new Error(`Error ${response.status}: No se pudo cargar el JSON`);
      }

      this.notificationData = await response.json();
      this.previousId = this.notificationData.id;

      showAlert("✅ Datos de notificación cargados", "success", 1500);
    } catch (error) {
      console.warn(
        "Error cargando desde GitHub, usando datos por defecto:",
        error.message,
      );
      this.notificationData = {
        id: 1,
        titulo: "",
        mensaje: "",
        subtitulo: "",
        tipo: "info",
        icono: "fas fa-bell",
      };
    }
  }

  /**
   * Rellena el formulario con los datos actuales
   */
  populateFormFromData() {
    if (!this.notificationData) return;

    this.titleInput.value = this.notificationData.titulo || "";
    this.messageInput.value = this.notificationData.mensaje || "";
    this.subtitleInput.value = this.notificationData.subtitulo || "";
    this.typeSelect.value = this.notificationData.tipo || "info";
    this.idDisplay.textContent = this.notificationData.id || 1;
    this.currentIconDisplay.innerHTML = `<i class="${this.notificationData.icono}"></i>`;

    // Guardar icono actual
    this.currentIcon = this.notificationData.icono || "fas fa-bell";
  }

  /**
   * Actualiza los datos desde el formulario
   */
  updateDataFromForm() {
    this.notificationData.titulo = this.titleInput.value;
    this.notificationData.mensaje = this.messageInput.value;
    this.notificationData.subtitulo = this.subtitleInput.value;
    this.notificationData.tipo = this.typeSelect.value;
    this.notificationData.icono = this.currentIcon || "fas fa-bell";
  }

  /**
   * Genera un nuevo ID aleatorio entre 1 y 3 (diferente al anterior)
   */
  generateNewId() {
    let newId;
    do {
      newId = Math.floor(Math.random() * 3) + 1; // 1-3
    } while (newId === this.previousId);

    this.notificationData.id = newId;
    this.idDisplay.textContent = newId;
    this.previousId = newId;

    showAlert(`✅ ID generado: ${newId}`, "success", 1500);
    this.updatePreview();
  }

  /**
   * Actualiza el preview en tiempo real
   */
  updatePreview() {
    this.updateDataFromForm();

    const titulo = this.notificationData.titulo || "Título de la notificación";
    const mensaje =
      this.notificationData.mensaje || "Mensaje de la notificación";
    const subtitulo = this.notificationData.subtitulo || "";
    const tipo = this.notificationData.tipo || "info";
    const icono = this.notificationData.icono || "fas fa-bell";

    const subtituloHTML = subtitulo
      ? `<p class="notification-subtitle">${this.escapeHtml(subtitulo)}</p>`
      : "";

    this.previewBanner.innerHTML = `
            <div class="notification-wrapper">
                <div class="notification-background"></div>
                <div class="notification-content">
                    <div class="notification-main">
                        <div class="notification-icon-wrapper">
                            <div class="notification-icon ${tipo}">
                                <i class="${this.escapeHtml(icono)}"></i>
                            </div>
                            <div class="notification-glow"></div>
                        </div>
                        <div class="notification-text">
                            <h3 class="notification-title">${this.escapeHtml(titulo)}</h3>
                            <p class="notification-message">${this.escapeHtml(mensaje)}</p>
                            ${subtituloHTML}
                        </div>
                    </div>
                    <div class="notification-actions">
                        <button class="notification-btn-accept" disabled>
                            <span class="btn-text">Entendido</span>
                            <span class="btn-icon"><i class="fas fa-check"></i></span>
                        </button>
                        <button class="notification-btn-close" disabled title="Cerrar notificación">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="notification-progress"></div>
            </div>
        `;

    this.previewContainer?.classList.add("active");
  }

  /**
   * Abre el selector de iconos
   */
  openIconSelector() {
    this.iconSelectorModal?.classList.add("active");
    this.populateIconGrid();
  }

  /**
   * Cierra el selector de iconos
   */
  closeIconSelector() {
    this.iconSelectorModal?.classList.remove("active");
  }

  /**
   * Configura el selector de iconos (lista de iconos comunes)
   */
  setupIconSelector() {
    // Iconos comunes de Font Awesome para seleccionar
    const commonIcons = [
      // --- Acción y Estado ---
      "fas fa-plus",
      "fas fa-minus",
      "fas fa-times",
      "fas fa-check",
      "fas fa-search",
      "fas fa-download",
      "fas fa-upload",
      "fas fa-sync",
      "fas fa-external-link-alt",
      "fas fa-link",
      "fas fa-trash-alt",
      "fas fa-edit",
      "fas fa-save",
      "fas fa-cog",
      "fas fa-wrench",
      "fas fa-filter",

      // --- Navegación y Estructura ---
      "fas fa-home",
      "fas fa-bars",
      "fas fa-ellipsis-h",
      "fas fa-ellipsis-v",
      "fas fa-arrow-right",
      "fas fa-arrow-left",
      "fas fa-chevron-down",
      "fas fa-chevron-up",
      "fas fa-folder",
      "fas fa-folder-open",
      "fas fa-th-large",
      "fas fa-list",

      // --- Alertas y Mensajes ---
      "fas fa-bell",
      "fas fa-bell-slash",
      "fas fa-exclamation-circle",
      "fas fa-exclamation-triangle",
      "fas fa-info-circle",
      "fas fa-question-circle",
      "fas fa-check-circle",
      "fas fa-times-circle",
      "fas fa-envelope",
      "fas fa-envelope-open",
      "fas fa-comment",
      "fas fa-comments",
      "fas fa-bullhorn",
      "fas fa-megaphone",

      // --- Comercio y Finanzas ---
      "fas fa-shopping-cart",
      "fas fa-shopping-bag",
      "fas fa-store",
      "fas fa-tag",
      "fas fa-tags",
      "fas fa-wallet",
      "fas fa-credit-card",
      "fas fa-dollar-sign",
      "fas fa-euro-sign",
      "fas fa-percent",
      "fas fa-chart-line",
      "fas fa-chart-bar",
      "fas fa-box",
      "fas fa-truck",
      "fas fa-receipt",
      "fas fa-barcode",

      // --- Usuarios y Social ---
      "fas fa-user",
      "fas fa-users",
      "fas fa-user-plus",
      "fas fa-user-minus",
      "fas fa-user-circle",
      "fas fa-user-shield",
      "fas fa-user-check",
      "fas fa-id-card",
      "fas fa-heart",
      "fas fa-thumbs-up",
      "fas fa-thumbs-down",
      "fas fa-share-alt",
      "fas fa-handshake",
      "fas fa-eye",
      "fas fa-eye-slash",

      // --- Gamificación y Logros ---
      "fas fa-star",
      "fas fa-star-half-alt",
      "fas fa-trophy",
      "fas fa-medal",
      "fas fa-crown",
      "fas fa-gift",
      "fas fa-fire",
      "fas fa-rocket",
      "fas fa-target",
      "fas fa-award",
      "fas fa-gem",
      "fas fa-magic",

      // --- Tiempo y Productividad ---
      "fas fa-clock",
      "fas fa-calendar-alt",
      "fas fa-calendar-check",
      "fas fa-history",
      "fas fa-hourglass-half",
      "fas fa-stopwatch",
      "fas fa-lightbulb",
      "fas fa-briefcase",
      "fas fa-file-alt",
      "fas fa-file-pdf",
      "fas fa-clipboard-list",
      "fas fa-tasks",

      // --- Dispositivos y Otros ---
      "fas fa-mobile-alt",
      "fas fa-desktop",
      "fas fa-print",
      "fas fa-camera",
      "fas fa-microphone",
      "fas fa-video",
      "fas fa-map-marker-alt",
      "fas fa-globe",
    ];

    // Guardar en data attribute para búsqueda
    this.availableIcons = commonIcons;
  }

  /**
   * Rellena la grilla de iconos
   */
  populateIconGrid(icons = null) {
    const grid = document.getElementById("icons-grid");
    if (!grid) return;

    const iconsToShow = icons || this.availableIcons;
    grid.innerHTML = "";

    iconsToShow.forEach((icon) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-option";
      if (icon === this.currentIcon) {
        btn.classList.add("selected");
      }
      btn.innerHTML = `<i class="${icon}"></i>`;
      btn.onclick = (e) => {
        e.preventDefault();
        this.selectIcon(icon);
      };
      grid.appendChild(btn);
    });
  }

  /**
   * Selecciona un icono
   */
  selectIcon(icon) {
    this.currentIcon = icon;
    this.currentIconDisplay.innerHTML = `<i class="${icon}"></i>`;

    // Actualizar selección visual
    document.querySelectorAll(".icon-option").forEach((btn) => {
      btn.classList.remove("selected");
    });
    event.target.closest(".icon-option").classList.add("selected");

    this.updatePreview();
    showAlert(`✅ Icono seleccionado: ${icon}`, "success", 1000);
  }

  /**
   * Filtra iconos por búsqueda
   */
  filterIcons(searchTerm) {
    if (!searchTerm) {
      this.populateIconGrid(this.availableIcons);
      return;
    }

    const filtered = this.availableIcons.filter((icon) =>
      icon.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    this.populateIconGrid(filtered);
  }

  /**
   * Guarda la notificación en GitHub
   */
  async saveNotification() {
    if (!this.validateForm()) return;

    try {
      this.saveBtn.disabled = true;
      this.saveBtn.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Guardando...';

      this.updateDataFromForm();

      // Guardar en GitHub
      const result = await this.githubManager.saveNotificationData(
        this.notificationData,
        "Actualizar notificación desde editor",
      );

      this.showStatus(
        "✅ Notificación guardada exitosamente en base de datos",
        "success",
      );
      showAlert("✅ Notificación guardada", "success", 2000);

      // Actualizar el ID previo
      this.previousId = this.notificationData.id;

      setTimeout(() => {
        this.statusMsg.style.display = "none";
      }, 4000);
    } catch (error) {
      this.showStatus(`❌ Error al guardar: ${error.message}`, "error");
      showAlert(`❌ Error: ${error.message}`, "error");
    } finally {
      this.saveBtn.disabled = false;
      this.saveBtn.innerHTML =
        '<i class="fas fa-save"></i> Guardar Notificación';
    }
  }

  /**
   * Valida el formulario
   */
  validateForm() {
    if (!this.titleInput.value.trim()) {
      this.showStatus("❌ El título es requerido", "error");
      return false;
    }

    if (!this.messageInput.value.trim()) {
      this.showStatus("❌ El mensaje es requerido", "error");
      return false;
    }

    if (!this.githubManager.isConfigured()) {
      this.showStatus(
        "❌ Debes configurar tu llave de acceso en Ajustes",
        "error",
      );
      showAlert("❌ Configura tu llave de acceso primero", "error");
      return false;
    }

    return true;
  }

  /**
   * Resetea el formulario
   */
  async resetForm() {
    const reloadOk = await (typeof modalConfirm === 'function' ? modalConfirm('¿Seguro que quieres recargar los datos? Se descartarán los cambios no guardados.') : Promise.resolve(window.confirm('¿Seguro que quieres recargar los datos? Se descartarán los cambios no guardados.')));
    if (!reloadOk) return;

    try {
      await this.loadNotificationData();
      this.populateFormFromData();
      this.updatePreview();
      showAlert("✅ Formulario reestablecido", "success", 1500);
    } catch (error) {
      showAlert(`❌ Error: ${error.message}`, "error");
    }
  }

  /**
   * Muestra mensaje de estado
   */
  showStatus(message, type = "info") {
    if (!this.statusMsg) return;

    this.statusMsg.style.display = "block";
    this.statusMsg.className = `notification-editor-status status-${type}`;
    this.statusMsg.textContent = message;
  }

  /**
   * Escapa caracteres HTML
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}
