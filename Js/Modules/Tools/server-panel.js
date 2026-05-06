/* ═══════════════════════════════════════════════════════════
 * SERVER PANEL - Lógica del panel de control del servidor
 * ═══════════════════════════════════════════════════════════ */

import { GitHubManager } from "../Github/githubManager.js";
import { GitHubSaveModal } from "../Github/githubSaveModal.js";
import { showAlert } from "../../Core/utils.js";
import { CONFIG } from "../../Core/config.js";

const BACKEND_URL = CONFIG.BACKEND_URL;


class ServerPanel {
  constructor() {
    this.githubManager = new GitHubManager();
    this.saveModal = new GitHubSaveModal();
    this.allOrdersData = [];
    this.newOrdersData = [];
    this.previousNewOrdersCount = 0;
    this.autoSaveInterval = null;
    this.init();
    this.setupEventListeners();
    this.initAutoRefresh();
    this.initAutoSave();
    // Auto-load server data on page load so dashboard shows metrics immediately
    try { this.loadServerData(); } catch (e) { console.warn('auto loadServerData error', e); }

    // Escuchar cambios globales de pedidos para refrescar new-orders/badges sin recargar
    document.addEventListener('orders:changed', async (e) => {
      try {
        // Solo refrescar sección de new orders (no todo el panel si no está visible)
        const newOrders = await this.fetchNewOrders();
        this.updateNewOrders(newOrders);
      } catch (err) {
        console.warn('orders:changed handler error', err);
      }
    });
  }

  init() {
    this.hamburgerBtn = document.getElementById("hamburger-btn");
    this.sidebarMenu = document.getElementById("sidebar-menu");
    this.menuOverlay = document.getElementById("menu-overlay");
    this.closeMenuBtn = document.getElementById("close-menu");
    this.menuItems = document.querySelectorAll(".menu-item");
    this.viewContents = document.querySelectorAll(".view-content");
    this.refreshServerBtn = document.getElementById("refresh-server-btn");
    this.autoRefreshSelect = document.getElementById("auto-refresh-select");
    this.lastUpdateEl = document.getElementById("last-update-time");
    this.saveOrdersBtn = document.getElementById("save-orders-to-github");
    this.currentView = "dashboard";
    this.autoRefreshInterval = null;
    this.lastUpdateTime = null;
  }

  setupEventListeners() {
    // Hamburger menu toggle
    this.hamburgerBtn?.addEventListener("click", () => this.toggleMenu());
    this.menuOverlay?.addEventListener("click", () => this.closeMenu());
    this.closeMenuBtn?.addEventListener("click", () => this.closeMenu());

    // Menu items
    this.menuItems.forEach((item) => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        this.switchView(view);
        this.closeMenu();
      });
    });

    // Refresh server button
    this.refreshServerBtn?.addEventListener("click", () =>
      this.loadServerData(),
    );

    // Save orders to GitHub button
    this.saveOrdersBtn?.addEventListener("click", () =>
      this.saveOrdersToGitHub(),
    );

    // Auto-refresh select
    this.autoRefreshSelect?.addEventListener("change", (e) => {
      const interval = parseInt(e.target.value);
      this.setAutoRefresh(interval);
    });

    // Initial data load if server view is loaded
    if (this.currentView === "server") {
      this.loadServerData();
    }
  }

  initAutoRefresh() {
    // Load saved preference from localStorage
    const savedInterval = localStorage.getItem("serverAutoRefreshIntervalAsere");
    if (savedInterval && this.autoRefreshSelect) {
      this.autoRefreshSelect.value = savedInterval;
      const interval = parseInt(savedInterval);
      if (interval > 0) {
        this.setAutoRefresh(interval);
      }
    }
  }

  initAutoSave() {
    // Load auto-save preferences
    const autoSaveEnabled =
      localStorage.getItem("auto_save_enabled") === "true";
    const autoSaveIntervalMin = parseInt(
      localStorage.getItem("auto_save_interval") || "5",
    );
    const autoSaveIntervalMs = autoSaveIntervalMin * 60 * 1000; // Convertir minutos a milisegundos

    if (!autoSaveEnabled) {
      return;
    }

    // Configurar intervalo de auto-guardado
    this.autoSaveInterval = setInterval(() => {
      this.checkAndAutoSave();
    }, autoSaveIntervalMs);
  }

  async checkAndAutoSave() {
    // Solo guardar si hay nuevos pedidos
    if (!this.newOrdersData || this.newOrdersData.length === 0) {
      return;
    }

    const currentNewOrdersCount = this.newOrdersData.length;

    // Guardar solo si hay nuevos pedidos que no hemos guardado
    if (currentNewOrdersCount > this.previousNewOrdersCount) {
      this.previousNewOrdersCount = currentNewOrdersCount;
      await this.saveOrdersToGitHub(true); // true = auto-save silencioso
    }
  }

  setAutoRefresh(interval) {
    // Clear existing interval
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }

    // Save preference to localStorage
    localStorage.setItem("serverAutoRefreshIntervalAsere", interval.toString());

    // Set new interval if > 0
    if (interval > 0 && this.currentView === "server") {
      this.autoRefreshInterval = setInterval(() => {
        this.loadServerData();
      }, interval * 1000);
    }
  }

  toggleMenu() {
    this.sidebarMenu?.classList.toggle("active");
    this.menuOverlay?.classList.toggle("active");
    this.hamburgerBtn?.classList.toggle("active");
  }

  closeMenu() {
    this.sidebarMenu?.classList.remove("active");
    this.menuOverlay?.classList.remove("active");
    this.hamburgerBtn?.classList.remove("active");
  }

  switchView(view) {
    this.currentView = view;

    // Update menu items
    this.menuItems.forEach((item) => {
      item.classList.toggle("active", item.dataset.view === view);
    });

    // Update view contents
    this.viewContents.forEach((content) => {
      content.classList.toggle("active", content.id === `${view}-view`);
    });

    // Load data if switching to server view
    if (view === "server") {
      this.loadServerData();
      // Resume auto-refresh if enabled
      const savedInterval = localStorage.getItem("serverAutoRefreshIntervalAsere");
      if (savedInterval && parseInt(savedInterval) > 0) {
        this.setAutoRefresh(parseInt(savedInterval));
      }
      // Resume auto-save if enabled
      this.initAutoSave();
    } else {
      // Clear auto-refresh when leaving server view
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = null;
      }
    }
  }

  async loadServerData() {
    try {
      this.showLoadingStates();

      // Fetch all required data
      const [statusData, statsData, newOrdersData] = await Promise.all([
        this.fetchServerStatus(),
        this.fetchStatistics(),
        this.fetchNewOrders(),
      ]);

      // Guardar SOLO los pedidos nuevos (no las estadísticas)
      this.newOrdersData = newOrdersData;

      // Guardar todas las estadísticas para análisis
      this.allOrdersData = statsData;

      // Update UI with data
      this.updateServerStatus(statusData);
      this.updateRuntimeStats(statusData);
      this.updateStatistics(statsData);
      this.updateNewOrders(newOrdersData);
      this.updateUserActivity(statsData);
      // Calculate and render peak/average entry hours
      try { this.updatePeakHours(statsData); } catch (e) { console.warn('updatePeakHours error', e); }
      this.updateTrafficSources(statsData);
      this.updateCountriesDistribution(statsData);
      this.updateBrowserStats(statsData);
      this.updateConversionAnalytics(statsData);
      this.updatePerformanceMetrics(statsData);

      // Update last update time
      this.updateLastUpdateTime();
    } catch (error) {
      console.error("Error loading server data:", error);
      this.showError("Error al cargar datos del servidor");
    }
  }

  updateLastUpdateTime() {
    const now = new Date();
    this.lastUpdateTime = now;

    const timeString = now.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    if (this.lastUpdateEl) {
      this.lastUpdateEl.textContent = `Actualizado a las ${timeString}`;
    }
  }

  async fetchServerStatus() {
    const response = await fetch(`${BACKEND_URL}/api/server-status`);
    if (!response.ok) throw new Error("Error fetching server status");
    return response.json();
  }

  async fetchStatistics() {
    const response = await fetch(`${BACKEND_URL}/obtener-estadisticas`);
    if (!response.ok) throw new Error("Error fetching statistics");
    return response.json();
  }

  async fetchNewOrders() {
    const response = await fetch(`${BACKEND_URL}/api/new-orders`);
    if (!response.ok) throw new Error("Error fetching new orders");
    const data = await response.json();
    return data.newOrders || [];
  }

  updateServerStatus(data) {
    const statusEl = document.getElementById("server-status-content");
    if (!statusEl) return;

    const startTime = new Date(data.startTime);
    const uptime = this.calculateUptime(startTime);

    statusEl.innerHTML = `
            <div class="status-item">
                <span class="label">Estado:</span>
                <span class="value status-running">${data.status || "Running"}</span>
            </div>
            <div class="status-item">
                <span class="label">Hora de Inicio:</span>
                <span class="value">${startTime.toLocaleString("es-ES")}</span>
            </div>
            <div class="status-item">
                <span class="label">Tiempo de Actividad:</span>
                <span class="value">${uptime}</span>
            </div>
        `;

    // Store logs
    this.updateLogs(data.logs || []);
  }

  calculateUptime(startTime) {
    const now = new Date();
    const diff = now - startTime;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    let uptime = [];
    if (days > 0) uptime.push(`${days}d`);
    if (hours > 0) uptime.push(`${hours}h`);
    if (minutes > 0) uptime.push(`${minutes}m`);

    return uptime.join(" ") || "Menos de 1 minuto";
  }

  updateLogs(logs) {
    const logsContainer = document.getElementById("server-logs-container");
    if (!logsContainer) return;

    if (logs.length === 0) {
      logsContainer.innerHTML = '<p class="no-data">Sin logs disponibles</p>';
      return;
    }

    const logsHTML = logs
      .slice(-50) // Show last 50 logs
      .reverse()
      .map((log) => {
        const messageClass = log.includes("ERROR")
          ? "error"
          : log.includes("WARN")
            ? "warning"
            : "success";
        const parts = log.match(/\[(.*?)\](.*)/);

        if (!parts)
          return `<div class="log-entry"><div class="log-message ${messageClass}">${log}</div></div>`;

        const timestamp = parts[1];
        const message = parts[2].trim();

        return `
                    <div class="log-entry">
                        <span class="log-timestamp">[${timestamp}]</span>
                        <span class="log-message ${messageClass}">${message}</span>
                    </div>
                `;
      })
      .join("");

    logsContainer.innerHTML = logsHTML;
  }

  updateRuntimeStats(data) {
    const container = document.getElementById("server-runtime-stats");
    if (!container || !data) return;

    try {
      const cpu = data.cpu || {};
      const memory = data.memory || {};

      const cpuText = `${cpu.percent != null ? cpu.percent + "%" : "N/A"} (${cpu.cores || "N/A"} cores)`;
      const memText =
        memory.heapUsed != null
          ? `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`
          : "N/A";
      const coresText = cpu.cores || "N/A";
      const sample = cpu.sampleMs || 100;

      const html = `
                <div class="stat-row">
                    <span class="label">CPU</span>
                    <span class="value">${cpuText}</span>
                </div>
                <div class="stat-row">
                    <span class="label">Memoria (heapUsed)</span>
                    <span class="value">${memText}</span>
                </div>
                <div class="stat-row">
                    <span class="label">Cores</span>
                    <span class="value">${coresText}</span>
                </div>
                <div class="stat-row">
                    <span class="label">Muestra CPU (ms)</span>
                    <span class="value">${sample}</span>
                </div>
            `;

      container.innerHTML = html;
    } catch (err) {
      console.warn("Error actualizando runtime stats", err);
    }
  }

  updateStatistics(stats) {
    const totalStats = document.getElementById("total-stats");
    const uniqueUsers = document.getElementById("unique-users");
    const totalOrders = document.getElementById("total-orders-server");
    const totalRevenue = document.getElementById("total-revenue");

    if (totalStats) totalStats.textContent = stats.length;

    // Calculate unique IPs
    const uniqueIPs = new Set(stats.map((s) => s.ip)).size;
    if (uniqueUsers) uniqueUsers.textContent = uniqueIPs;

    // Calculate orders
    const orders = stats.filter(
      (s) => Array.isArray(s.compras) && s.compras.length > 0,
    );
    if (totalOrders) totalOrders.textContent = orders.length;

    // Calculate revenue
    const revenue = stats.reduce(
      (sum, s) => sum + (s.precio_compra_total || 0),
      0,
    );
    if (totalRevenue)
      totalRevenue.textContent = `$ ${revenue.toLocaleString("es-ES")}`;
  }

  updateNewOrders(orders) {
    const container = document.getElementById("new-orders-container");
    const count = document.getElementById("new-orders-count");

    if (!container) return;

    if (count) count.textContent = orders.length;

    if (orders.length === 0) {
      container.innerHTML = '<p class="no-data">No hay pedidos nuevos</p>';
      return;
    }

    const tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Teléfono</th>
                        <th>Productos</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${orders
                      .map(
                        (order) => `
                        <tr>
                            <td>${new Date(order.fecha_hora_entrada).toLocaleString("es-ES")}</td>
                            <td>${order.nombre_comprador || "N/A"}</td>
                            <td>${order.telefono_comprador || "N/A"}</td>
                            <td>${(order.compras || []).length}</td>
                            <td>$ ${(order.precio_compra_total || 0).toLocaleString("es-ES")}</td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;

    container.innerHTML = tableHTML;
  }

  updateUserActivity(stats) {
    const container = document.getElementById("users-activity-container");
    if (!container) return;

    if (stats.length === 0) {
      container.innerHTML =
        '<p class="no-data">No hay actividad de usuarios</p>';
      return;
    }

    // Show last 20 users
    const tableHTML = `
            <table>
                <thead>
                    <tr>
                        <th>IP</th>
                        <th>País</th>
                        <th>Entrada</th>
                        <th>Origen</th>
                        <th>Tipo</th>
                        <th>Duración (s)</th>
                    </tr>
                </thead>
                <tbody>
                    ${stats
                      .slice(-20)
                      .reverse()
                      .map(
                        (user) => `
                        <tr>
                            <td class="ip-col">${user.ip}</td>
                            <td>${user.pais || "N/A"}</td>
                            <td class="date-col">${new Date(user.fecha_hora_entrada).toLocaleString("es-ES")}</td>
                            <td class="origen-col">${user.origen || "N/A"}</td>
                            <td><span class="badge">${user.tipo_usuario || "N/A"}</span></td>
                            <td>${user.duracion_sesion_segundos || 0}</td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;

    container.innerHTML = tableHTML;
  }

  /**
   * Calcula la hora promedio de entrada usando media circular
   * y muestra horas pico y valle en el dashboard.
   */
  updatePeakHours(stats) {
    const avgEl = document.getElementById('avg-entry-time');
    const peaksEl = document.getElementById('peak-hours-list');
    const histEl = document.getElementById('entry-hours-histogram');

    if (!avgEl && !peaksEl && !histEl) return;

    if (!Array.isArray(stats) || stats.length === 0) {
      if (avgEl) avgEl.textContent = '—';
      if (peaksEl) peaksEl.textContent = 'No hay datos';
      if (histEl) histEl.innerHTML = '';
      return;
    }

    const hourCounts = new Array(24).fill(0);
    let sumX = 0, sumY = 0, total = 0;

    stats.forEach((s) => {
      const ts = s.fecha_hora_entrada;
      if (!ts) return;
      // try to parse robustly
      let d = new Date(ts);
      if (isNaN(d.getTime())) {
        // try replacing space with T
        try { d = new Date(ts.replace(' ', 'T')); } catch (e) { d = new Date(ts); }
      }
      if (isNaN(d.getTime())) return;
      const h = d.getHours();
      const m = d.getMinutes();
      const frac = h + m / 60;
      hourCounts[h] = (hourCounts[h] || 0) + 1;
      const angle = (frac / 24) * (2 * Math.PI);
      sumX += Math.cos(angle);
      sumY += Math.sin(angle);
      total++;
    });

    if (total === 0) {
      if (avgEl) avgEl.textContent = '—';
      if (peaksEl) peaksEl.textContent = 'No hay datos';
      if (histEl) histEl.innerHTML = '';
      return;
    }

    // Circular mean
    const meanAngle = Math.atan2(sumY, sumX);
    let meanHour = (meanAngle / (2 * Math.PI)) * 24;
    if (meanHour < 0) meanHour += 24;
    const meanH = Math.floor(meanHour) % 24;
    const meanM = Math.round((meanHour - meanH) * 60);
    const pad = (n) => String(n).padStart(2, '0');
    if (avgEl) {
      // Format with AM/PM and include short timezone name when possible
      try {
        const now = new Date();
        const avgDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(meanHour), Math.round((meanHour - Math.floor(meanHour)) * 60));
        const timeStr = avgDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true, timeZoneName: 'short' });
        avgEl.textContent = timeStr;
      } catch (e) {
        avgEl.textContent = `${pad(meanH)}:${pad(meanM)}`;
      }
    }

    // Peaks and valleys
    const hoursArr = hourCounts.map((c, h) => ({ hour: h, count: c }));
    const sortedDesc = [...hoursArr].sort((a, b) => b.count - a.count);
    const sortedAsc = [...hoursArr].sort((a, b) => a.count - b.count);
    const top = sortedDesc.slice(0, 3).filter(i => i.count > 0);
    const low = sortedAsc.slice(0, 3);

    if (peaksEl) {
      const topHtml = top.length > 0
        ? top
            .map(
              (t) =>
                `<div class="peak-hour-item"><div class="peak-hour-hour">${pad(
                  t.hour,
                )}:00</div><div class="peak-hour-count">${t.count}</div></div>`,
            )
            .join("")
        : '<div class="no-data">No hay horas pico</div>';

      const lowHtml = low.length > 0
        ? low
            .map(
              (t) =>
                `<div class="peak-hour-item"><div class="peak-hour-hour">${pad(
                  t.hour,
                )}:00</div><div class="peak-hour-count">${t.count}</div></div>`,
            )
            .join("")
        : '';

      peaksEl.innerHTML = `
        <div class="peak-hours">
          <div class="peak-hours-title">Horas Pico</div>
          <div class="peak-hours-list">${topHtml}</div>
          <div class="peak-hours-title small">Horas Baja</div>
          <div class="peak-hours-list low">${lowHtml}</div>
        </div>
      `;
    }

    // If Chart.js is available, render a bar chart; otherwise fall back to simple bars
    const canvas = document.getElementById('entry-hours-canvas');
    const legendEl = document.getElementById('entry-hours-legend');
    if (typeof Chart !== 'undefined' && canvas && canvas.getContext) {
      try {
        // create labels
        const labels = hourCounts.map((_, i) => `${pad(i)}:00`);
        const bg = hourCounts.map(c => c > 0 ? '#3B7CD6' : '#d6e9ff');
        if (this.entryHoursChart) {
          try { this.entryHoursChart.destroy(); } catch (e) { /* ignore */ }
        }
        const ctx = canvas.getContext('2d');
        // ensure canvas height is reasonable
        canvas.height = 160;
        this.entryHoursChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: 'Visitas', data: hourCounts, backgroundColor: bg, borderRadius: 6 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.dataset.data[ctx.dataIndex]} visita(s)`
                }
              }
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
              y: { beginAtZero: true, ticks: { precision: 0 } }
            },
            onHover: (evt, elements) => {
              if (!legendEl) return;
              if (elements && elements.length > 0) {
                const idx = elements[0].index;
                legendEl.textContent = `${pad(idx)}:00 — ${hourCounts[idx]} visita(s)`;
              } else {
                legendEl.textContent = '';
              }
            }
          }
        });
      } catch (e) {
        console.warn('Chart render error', e);
      }
    } else if (histEl) {
      const maxCount = Math.max(...hourCounts, 1);
      const bars = hourCounts
        .map((c, h) => {
          const pct = Math.round((c / maxCount) * 100);
          return `
            <div class="peak-hour-row">
              <div class="peak-hour-label">${pad(h)}:00</div>
              <div class="peak-hour-bar"><div class="peak-hour-bar-fill" style="--pct:${pct}%"></div></div>
              <div class="peak-hour-number">${c}</div>
            </div>
          `;
        })
        .join("");
      histEl.style.display = "";
      histEl.innerHTML = bars;
    }
  }

  updateTrafficSources(stats) {
    const container = document.getElementById("traffic-sources");
    if (!container) return;

    // Group by origen
    const sources = {};
    stats.forEach((s) => {
      const origin = s.origen || "Desconocido";
      sources[origin] = (sources[origin] || 0) + 1;
    });

    const total = stats.length;
    const sorted = Object.entries(sources)
      .sort(([, a], [, b]) => b - a)
      .map(([source, count]) => ({
        source,
        count,
        percentage: ((count / total) * 100).toFixed(1),
      }));

    if (sorted.length === 0) {
      container.innerHTML =
        '<p class="no-data">Sin datos de fuentes de tráfico</p>';
      return;
    }

    // store for pagination and render first page
    this.trafficSourcesSorted = sorted;
    this.trafficSourcesPageSize = 8;
    this.trafficSourcesCurrentPage = 0;
    this.renderTrafficSourcesPage(0);
  }

  renderTrafficSourcesPage(page = 0) {
    const container = document.getElementById("traffic-sources");
    if (!container) return;
    const data = this.trafficSourcesSorted || [];
    const pageSize = this.trafficSourcesPageSize || 8;
    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
    const current = Math.min(Math.max(0, page), totalPages - 1);
    this.trafficSourcesCurrentPage = current;

    const start = current * pageSize;
    const slice = data.slice(start, start + pageSize);

    const listHtml = slice
      .map(
        (item) => `
          <div class="stat-row">
            <span class="label">${item.source}</span>
            <span class="value">
              <span class="percentage">${item.count} (${item.percentage}%)</span>
              <div class="progress-bar-server">
                <div class="progress-fill" style="--pct: ${item.percentage}%"></div>
              </div>
            </span>
          </div>
        `,
      )
      .join("");

    // pager controls
    const pagerHtml = `
      <div class="traffic-pager">
        <button class="pager-btn" data-action="prev" ${current === 0 ? 'disabled' : ''}>‹ Prev</button>
        <div class="pager-info">Página ${current + 1} / ${totalPages}</div>
        <button class="pager-btn" data-action="next" ${current === totalPages - 1 ? 'disabled' : ''}>Next ›</button>
      </div>
    `;

    container.innerHTML = `<div class="traffic-list">${listHtml}</div>${pagerHtml}`;

    // attach handlers
    const prevBtn = container.querySelector('.pager-btn[data-action="prev"]');
    const nextBtn = container.querySelector('.pager-btn[data-action="next"]');
    if (prevBtn) prevBtn.addEventListener('click', () => this.renderTrafficSourcesPage(this.trafficSourcesCurrentPage - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => this.renderTrafficSourcesPage(this.trafficSourcesCurrentPage + 1));
  }

  updateCountriesDistribution(stats) {
    const container = document.getElementById("countries-distribution");
    if (!container) return;

    // Group by country
    const countries = {};
    stats.forEach((s) => {
      const country = s.pais || "Desconocido";
      countries[country] = (countries[country] || 0) + 1;
    });

    const total = stats.length;
    const sorted = Object.entries(countries)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([country, count]) => ({
        country,
        count,
        percentage: ((count / total) * 100).toFixed(1),
      }));

    if (sorted.length === 0) {
      container.innerHTML = '<p class="no-data">Sin datos de países</p>';
      return;
    }

    const html = sorted
      .map(
        (item) => `
            <div class="stat-row">
                <span class="label">${item.country}</span>
                <span class="value">
                    <span class="percentage">${item.count} (${item.percentage}%)</span>
                    <div class="progress-bar-server">
                        <div class="progress-fill" style="--pct: ${item.percentage}%"></div>
                    </div>
                </span>
            </div>
        `,
      )
      .join("");

    container.innerHTML = html;
  }

  updateBrowserStats(stats) {
    const container = document.getElementById("browser-os-stats");
    if (!container) return;

    // Group by browser and OS
    const browsers = {};
    const oses = {};

    stats.forEach((s) => {
      const browser = s.navegador || "Desconocido";
      const os = s.sistema_operativo || "Desconocido";

      browsers[browser] = (browsers[browser] || 0) + 1;
      oses[os] = (oses[os] || 0) + 1;
    });

    const total = stats.length;

    const browserEntries = Object.entries(browsers)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const osEntries = Object.entries(oses)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    let html =
      '<div style="margin-bottom: 1rem;"><strong>Navegadores:</strong>';
    if (browserEntries.length === 0) {
      html += '<p class="no-data">Sin datos</p>';
    } else {
      html += browserEntries
        .map(
          ([browser, count]) => `
                <div class="stat-row">
                    <span class="label">${browser}</span>
                    <span class="value">
                        <span class="percentage">${count} (${((count / total) * 100).toFixed(1)}%)</span>
                    </span>
                </div>
            `,
        )
        .join("");
    }
    html += "</div>";

    html += "<div><strong>Sistemas Operativos:</strong>";
    if (osEntries.length === 0) {
      html += '<p class="no-data">Sin datos</p>';
    } else {
      html += osEntries
        .map(
          ([os, count]) => `
                <div class="stat-row">
                    <span class="label">${os}</span>
                    <span class="value">
                        <span class="percentage">${count} (${((count / total) * 100).toFixed(1)}%)</span>
                    </span>
                </div>
            `,
        )
        .join("");
    }
    html += "</div>";

    container.innerHTML = html;
  }

  updateConversionAnalytics(stats) {
    const container = document.getElementById("conversion-analytics");
    if (!container) return;

    const totalVisits = stats.length;
    const conversions = stats.filter(
      (s) => Array.isArray(s.compras) && s.compras.length > 0,
    ).length;
    const conversionRate = ((conversions / totalVisits) * 100).toFixed(2);

    const recurringUsers = stats.filter(
      (s) => s.tipo_usuario === "Recurrente",
    ).length;
    const newUsers = stats.filter((s) => s.tipo_usuario === "Único").length;

    const avgSessionDuration = (
      stats.reduce((sum, s) => sum + (s.duracion_sesion_segundos || 0), 0) /
      totalVisits
    ).toFixed(2);
    const avgPageLoadTime = (
      stats.reduce((sum, s) => sum + (s.tiempo_carga_pagina_ms || 0), 0) /
      totalVisits
    ).toFixed(2);

    const html = `
            <div class="metric-card">
                <div class="metric-label">Tasa de Conversión</div>
                <div class="metric-value">${conversionRate}%</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Usuarios Nuevos</div>
                <div class="metric-value">${newUsers}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Usuarios Recurrentes</div>
                <div class="metric-value">${recurringUsers}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Duración Promedio (s)</div>
                <div class="metric-value">${avgSessionDuration}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Carga Promedio (ms)</div>
                <div class="metric-value">${avgPageLoadTime}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Visitas Totales</div>
                <div class="metric-value">${totalVisits}</div>
            </div>
        `;

    container.innerHTML = html;
  }

  updatePerformanceMetrics(stats) {
    const container = document.getElementById("performance-metrics");
    if (!container) return;

    const totalLoadTime = stats.reduce(
      (sum, s) => sum + (s.tiempo_carga_pagina_ms || 0),
      0,
    );
    const avgLoadTime = (totalLoadTime / stats.length).toFixed(2);

    const fastLoads = stats.filter(
      (s) => (s.tiempo_carga_pagina_ms || 0) < 1000,
    ).length;
    const mediumLoads = stats.filter(
      (s) =>
        (s.tiempo_carga_pagina_ms || 0) >= 1000 &&
        (s.tiempo_carga_pagina_ms || 0) < 3000,
    ).length;
    const slowLoads = stats.filter(
      (s) => (s.tiempo_carga_pagina_ms || 0) >= 3000,
    ).length;

    const avgSessionDuration = (
      stats.reduce((sum, s) => sum + (s.duracion_sesion_segundos || 0), 0) /
      stats.length
    ).toFixed(2);

    const html = `
            <div class="metric-card">
                <div class="metric-label">Tiempo Promedio de Carga</div>
                <div class="metric-value">${avgLoadTime}ms</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Cargas Rápidas (&lt;1s)</div>
                <div class="metric-value">${fastLoads}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Cargas Medias (1-3s)</div>
                <div class="metric-value">${mediumLoads}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Cargas Lentas (&gt;3s)</div>
                <div class="metric-value">${slowLoads}</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Duración Promedio Sesión</div>
                <div class="metric-value">${avgSessionDuration}s</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Tiempo Promedio por Página</div>
                <div class="metric-value">${(stats.reduce((sum, s) => sum + (s.tiempo_promedio_pagina || 0), 0) / stats.length).toFixed(2)}s</div>
            </div>
        `;

    container.innerHTML = html;
  }

  showLoadingStates() {
    const containers = [
      "server-status-content",
      "server-runtime-stats",
      "stats-summary",
      "new-orders-container",
      "server-logs-container",
      "users-activity-container",
      "traffic-sources",
      "countries-distribution",
      "browser-os-stats",
      "conversion-analytics",
      "performance-metrics",
      "affiliate-performance",
    ];

    containers.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<p class="no-data">Cargando...</p>';
    });
  }

  showError(message) {
    const containers = [
      "server-status-content",
      "stats-summary",
      "new-orders-container",
    ];

    containers.forEach((id) => {
      const el = document.getElementById(id);
      if (el)
        el.innerHTML = `<p class="no-data" style="color: #ff6b6b;">❌ ${message}</p>`;
    });
  }

  /**
   * Guarda los pedidos actuales en GitHub
   */
  async saveOrdersToGitHub(isSilent = false) {
    // Verificar si GitHub está configurado
    if (!this.githubManager.isConfigured()) {
      if (!isSilent) {
        showAlert(
          "❌ Por favor, configura tu token de GitHub en Ajustes",
          "error",
          3000,
        );
      }
      return;
    }

    // Verificar si hay pedidos nuevos para guardar
    if (!this.newOrdersData || this.newOrdersData.length === 0) {
      if (!isSilent) {
        showAlert("❌ No hay pedidos nuevos para guardar", "warning", 2000);
      }
      return;
    }

    // Solo mostrar modal si no es guardado silencioso (auto-save)
    if (!isSilent) {
      this.saveModal.showLoading();
    }

    try {
      // 1. Obtener los datos existentes de GitHub
      this.saveModal.updateDetail("Obteniendo datos actuales de base de datos...");

      let existingData = [];
      try {
        existingData = await this.githubManager.loadPedidos();
      } catch (error) {
        existingData = [];
      }

      // 2. Combinar con los nuevos pedidos (evitar duplicados)
      this.saveModal.updateDetail("Procesando pedidos nuevos...");
      const allPedidos = this.mergePedidos(existingData, this.newOrdersData);

      // 3. Guardar en GitHub
      this.saveModal.updateDetail("Guardando en base de datos...");
      const timestamp = new Date().toLocaleString("es-ES");
      const commitMessage = `Actualizar pedidos - ${timestamp} (${this.newOrdersData.length} pedidos nuevos)`;

      const result = await this.githubManager.savePedidos(
        allPedidos,
        commitMessage,
      );

      // 4. Éxito
      if (!isSilent) {
        this.saveModal.showSuccess(result.message, this.newOrdersData.length);
        showAlert(`✅ ${result.message}`, "success", 3000);
      } else {
        console.log("Auto-save completado:", result.message);
      }
    } catch (error) {

      if (!isSilent) {
        this.saveModal.showError(error.message, null);
      }

      showAlert(`❌ Error: ${error.message}`, "error", 4000);
    }
  }

  /**
   * Combina pedidos nuevos con los existentes, evitando duplicados
   * @param {Array} existingData - Pedidos existentes en GitHub
   * @param {Array} newOrders - Pedidos nuevos del backend
   * @returns {Array} Pedidos combinados sin duplicados
   */
  mergePedidos(existingData, newOrders) {
    if (!Array.isArray(existingData)) {
      existingData = [];
    }
    if (!Array.isArray(newOrders)) {
      newOrders = [];
    }

    // Crear un mapa de pedidos existentes para evitar duplicados
    // Usamos IP + fecha_hora_entrada como clave única
    const existingMap = {};
    existingData.forEach((pedido) => {
      const key = `${pedido.ip}_${pedido.fecha_hora_entrada}`;
      existingMap[key] = pedido;
    });

    // Agregar nuevos pedidos que no estén duplicados
    newOrders.forEach((newPedido) => {
      const key = `${newPedido.ip}_${newPedido.fecha_hora_entrada}`;
      if (!existingMap[key]) {
        existingMap[key] = newPedido;
      }
    });

    // Retornar array de valores
    return Object.values(existingMap);
  }
}

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new ServerPanel();
});
