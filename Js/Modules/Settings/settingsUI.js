/**
 * Módulo de interfaz de Ajustes
 * Maneja la interacción de la UI en la sección de Settings
 */

import { GitHubManager } from '../Github/githubManager.js';
import { showAlert } from '../../Core/utils.js';
import { confirm as modalConfirm } from '../../UI/modalUtils.js';

export class SettingsUI {
    constructor() {
        this.githubManager = new GitHubManager();
        this.init();
    }

    init() {
        this.initElements();
        this.setupEventListeners();
        this.loadSavedSettings();
    }

    initElements() {
        // GitHub Settings Elements
        this.tokenInput = document.getElementById('github-token-input');
        this.toggleTokenBtn = document.getElementById('toggle-token-visibility');
        this.saveSettingsBtn = document.getElementById('save-github-settings');
        this.testConnectionBtn = document.getElementById('test-github-connection');
        this.clearSettingsBtn = document.getElementById('clear-github-settings');
        this.settingsStatus = document.getElementById('github-settings-status');

        // General Preferences
        this.autoSaveCheckbox = document.getElementById('auto-save-enabled');
        this.autoSaveInterval = document.getElementById('auto-save-interval');
        this.savePreferencesBtn = document.getElementById('save-preferences');
    }

    setupEventListeners() {
        // GitHub Settings
        this.toggleTokenBtn?.addEventListener('click', () => this.toggleTokenVisibility());
        this.saveSettingsBtn?.addEventListener('click', () => this.saveGitHubSettings());
        this.testConnectionBtn?.addEventListener('click', () => this.testGitHubConnection());
        this.clearSettingsBtn?.addEventListener('click', () => this.clearGitHubSettings());

        // General Preferences
        this.savePreferencesBtn?.addEventListener('click', () => this.savePreferences());
    }

    loadSavedSettings() {
        // Load GitHub Settings (solo token, lo demás es constante)
        // No hay nada que cargar para repo y filePath porque son constantes

        // Load Preferences
        const autoSaveEnabled = localStorage.getItem('auto_save_enabled') === 'true';
        const autoSaveIntervalValue = localStorage.getItem('auto_save_interval') || '5';

        if (this.autoSaveCheckbox) {
            this.autoSaveCheckbox.checked = autoSaveEnabled;
        }
        if (this.autoSaveInterval) {
            this.autoSaveInterval.value = autoSaveIntervalValue;
        }
    }

    toggleTokenVisibility() {
        const isPassword = this.tokenInput.type === 'password';
        this.tokenInput.type = isPassword ? 'text' : 'password';
        
        // Cambiar el icono
        const icon = this.toggleTokenBtn.querySelector('i');
        if (icon) {
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
        }
    }

    showStatus(message, type = 'info') {
        if (!this.settingsStatus) return;

        this.settingsStatus.style.display = 'block';
        this.settingsStatus.className = `settings-status status-${type}`;
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        this.settingsStatus.innerHTML = `<span>${icons[type] || ''} ${message}</span>`;
    }

    async saveGitHubSettings() {
        const token = this.tokenInput?.value.trim();

        if (!token) {
            this.showStatus('Por favor, ingresa tu llave de acceso', 'error');
            return;
        }

        try {
            this.saveSettingsBtn.disabled = true;
            this.saveSettingsBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            this.githubManager.saveToken(token);
            
            this.showStatus('Llave de acceso guardada correctamente', 'success');
            
            setTimeout(() => {
                this.settingsStatus.style.display = 'none';
            }, 3000);
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.saveSettingsBtn.disabled = false;
            this.saveSettingsBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Llave de Acceso';
        }
    }

    async testGitHubConnection() {
        if (!this.githubManager.isConfigured()) {
            this.showStatus('Primero debes guardar tu configuración', 'error');
            return;
        }

        try {
            this.testConnectionBtn.disabled = true;
            this.testConnectionBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Probando...';

            const result = await this.githubManager.testConnection();
            
            const message = `✅ Conexión exitosa con <strong>${result.repoName}</strong> ${result.isPrivate ? '(Privado)' : '(Público)'}`;
            this.showStatus(message, 'success');

            setTimeout(() => {
                this.settingsStatus.style.display = 'none';
            }, 5000);
        } catch (error) {
            this.showStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.testConnectionBtn.disabled = false;
            this.testConnectionBtn.innerHTML = '<i class="fas fa-plug"></i> Probar Conexión';
        }
    }

    async clearGitHubSettings() {
        const _ok = await (typeof modalConfirm === 'function' ? modalConfirm('¿Estás seguro de que deseas limpiar tu llave de acceso? Esta acción no se puede deshacer.') : Promise.resolve(window.confirm('¿Estás seguro de que deseas limpiar tu llave de acceso? Esta acción no se puede deshacer.')));
        if (!_ok) return;

        this.githubManager.clearToken();
        this.tokenInput.value = '';
        
        this.showStatus('Token eliminado correctamente', 'success');
        
        setTimeout(() => {
            this.settingsStatus.style.display = 'none';
        }, 3000);
    }

    savePreferences() {
        const autoSaveEnabled = this.autoSaveCheckbox?.checked || false;
        const autoSaveInterval = this.autoSaveInterval?.value || '5';

        localStorage.setItem('auto_save_enabled', autoSaveEnabled.toString());
        localStorage.setItem('auto_save_interval', autoSaveInterval);

        showAlert('✅ Preferencias guardadas correctamente', 'success', 2000);
    }
}
