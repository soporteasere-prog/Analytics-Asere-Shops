/**
 * Módulo de gráficos
 */

import { getCurrencySymbol } from '../Core/utils.js';

export class ChartManager {
    constructor() {
        this.charts = {
            products: null,
            salesTrend: null
        };
    }

    /**
     * Inicializa los gráficos
     */
    initCharts() {
        const gridColor = 'rgba(107, 114, 128, 0.1)';
        const textColor = '#1F2937';
        const tooltipBg = 'rgba(255, 255, 255, 0.95)';
        const tooltipTextColor = '#1F2937';

        this.initProductsChart(gridColor, textColor, tooltipBg, tooltipTextColor);
        this.initSalesTrendChart(gridColor, textColor, tooltipBg, tooltipTextColor);
    }

    /**
     * Inicializa gráfico de productos
     */
    initProductsChart(gridColor, textColor, tooltipBg, tooltipTextColor) {
        const productsCtx = document.getElementById('products-chart')?.getContext('2d');
        if (productsCtx) {
            this.charts.products = new Chart(productsCtx, {
                type: 'bar',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Unidades Vendidas',
                        data: [],
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderRadius: 8,
                        borderWidth: 0,
                        hoverBackgroundColor: 'rgba(59, 130, 246, 1)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${context.raw} unidades vendidas`
                            },
                            backgroundColor: tooltipBg,
                            titleColor: tooltipTextColor,
                            bodyColor: tooltipTextColor,
                            borderColor: '#E5E7EB',
                            borderWidth: 1,
                            padding: 10,
                            displayColors: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: gridColor },
                            ticks: { color: textColor }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: textColor }
                        }
                    }
                }
            });
        }
    }

    /**
     * Inicializa gráfico de tendencia de ventas
     */
    initSalesTrendChart(gridColor, textColor, tooltipBg, tooltipTextColor) {
        const trendCtx = document.getElementById('sales-trend-chart')?.getContext('2d');
        if (trendCtx) {
            this.charts.salesTrend = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: `Ventas (${getCurrencySymbol()})`,
                        data: [],
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#10B981',
                        pointBorderColor: '#FFFFFF',
                        pointBorderWidth: 2,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `${getCurrencySymbol()} ${context.raw.toFixed(2)}`
                            },
                            backgroundColor: tooltipBg,
                            titleColor: tooltipTextColor,
                            bodyColor: tooltipTextColor,
                            borderColor: '#E5E7EB',
                            borderWidth: 1,
                            padding: 10,
                            displayColors: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: gridColor },
                            ticks: { 
                                color: textColor,
                                callback: (value) => `${getCurrencySymbol()} ${value}`
                            }
                        },
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor }
                        }
                    }
                }
            });
        }
    }

    /**
     * Actualiza los datos de los gráficos
     */
    updateCharts(productsData, trendData) {
        if (this.charts.products) {
            this.charts.products.data.labels = productsData.map(p => p.product || 'Sin nombre');
            this.charts.products.data.datasets[0].data = productsData.map(p => p.quantity || 0);
            this.charts.products.update();
        }

        if (this.charts.salesTrend) {
            this.charts.salesTrend.data.labels = trendData.map(d => d.date);
            this.charts.salesTrend.data.datasets[0].data = trendData.map(d => d.total);
            this.charts.salesTrend.update();
        }
    }

    /**
     * Destruye los gráficos
     */
    destroyCharts() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
    }
}
