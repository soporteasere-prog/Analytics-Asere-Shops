/**
 * Módulo de manejo de datos
 */

import { getMonthName, formatDate, getMonthIndex } from './utils.js';

export class DataManager {
    constructor() {
        this.data = [];
        this.filteredData = [];
    }

    /**
     * Carga los datos desde el archivo JSON
     */
    async loadData() {
        try {
            const response = await fetch('Json/my_data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.data = await response.json();
            
            if (!Array.isArray(this.data)) {
                throw new Error('Datos inválidos: el JSON no es un array');
            }
            
            this.normalizeData();
            this.filteredData = [...this.data];
            return this.data;
        } catch (error) {
            console.error('Error al cargar los datos:', error);
            throw error;
        }
    }

    /**
     * Normaliza la estructura de los datos
     */
    normalizeData() {
        this.data.forEach(item => {
            // Convierte fecha a objeto Date
            item.date = new Date(item.fecha_hora_entrada);
            item.dateStr = formatDate(item.date);
            
            // Parsea el precio
            item.total = parseFloat(item.precio_compra_total) || 0;
            
            // Conteo de productos
            item.productsCount = item.compras.reduce((acc, curr) => acc + (curr.quantity || 0), 0);

            // Mapea propiedades
            item.userType = item.tipo_usuario || 'No especificado';
            item.affiliate = item.afiliado || 'Sin afiliado';
            item.country = item.pais || 'No especificado';
            item.buyerName = item.nombre_comprador || 'Desconocido';
            item.buyerPhone = item.telefono_comprador || 'No especificado';
            item.buyerEmail = item.correo_comprador || 'No especificado';
            item.shippingAddress = item.direccion_envio || 'No especificada';
            item.browser = item.navegador || 'No especificado';
            item.operatingSystem = item.sistema_operativo || 'No especificado';
            item.trafficSource = item.fuente_trafico || 'No especificado';

            // Campo de búsqueda
            item.searchText = `${item.buyerName} ${item.country} ${item.userType} ${item.affiliate} ${item.buyerPhone} ${item.buyerEmail} ${item.shippingAddress} ${item.browser} ${item.operatingSystem} ${item.trafficSource}`.toLowerCase();

            // Origen: normalizar la propiedad especial "buquenqe.com" (si existe)
            // - si la clave existe y es false => no viene desde la web
            // - por defecto tratamos como proveniente de Asere
            item.isFromBuquenqe = item.hasOwnProperty('asereshops') ? Boolean(item['asereshops.com']) : true;
            item.sourceLabel = item.isFromBuquenqe ? 'Asere' : 'Externo';

            // Normaliza productos
            item.compras = item.compras.map(product => {
                const cantidad = product.cantidad || 0;
                const precio_unitario = product.precio_unitario || 0;
                const precio_total = product.precio_total || 0;
                return {
                    ...product,
                    name: product.producto || product.name,
                    quantity: cantidad,
                    unitPrice: precio_unitario,
                    totalPrice: precio_total
                };
            });
        });
    }

    /**
     * Filtra los datos por rango de fechas y período
     * Si se especifica un rango de fechas, tiene prioridad sobre el período
     */
    filterByDateRange(startDate = null, endDate = null, period = 'all') {
        const now = new Date();
        let periodStart, periodEnd;
        
        // Normalizar valores vacíos a null
        startDate = startDate && typeof startDate === 'string' && startDate.trim() ? startDate.trim() : null;
        endDate = endDate && typeof endDate === 'string' && endDate.trim() ? endDate.trim() : null;
        
        let hasDateRange = startDate || endDate;
        
        // Si se especifica un rango de fechas, usarlo directamente sin período
        if (hasDateRange) {
            periodStart = null;
            periodEnd = null;
        } else {
            // Solo aplicar período si NO hay rango de fechas especificado
            switch (period) {
                case 'month':
                    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    periodEnd.setHours(23, 59, 59, 999);
                    break;
                case 'last-month':
                    periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
                    periodEnd.setHours(23, 59, 59, 999);
                    break;
                case 'year':
                    periodStart = new Date(now.getFullYear(), 0, 1);
                    periodEnd = new Date(now.getFullYear(), 11, 31);
                    periodEnd.setHours(23, 59, 59, 999);
                    break;
                default:
                    periodStart = null;
                    periodEnd = null;
            }
        }
        
        this.filteredData = this.data.filter(item => {
            const itemDate = item.date;
            
            // Verificar rango de fechas: comparar usando fechas completas (Date objects)
            // Normalizar las fechas a medianoche para comparación correcta
            let dateInRange = true;
            
            if (startDate) {
                try {
                    // Parsear startDate (formato YYYY-MM-DD desde input HTML)
                    const parts = startDate.split('-');
                    if (parts.length === 3) {
                        const year = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10);
                        const day = parseInt(parts[2], 10);
                        const rangeStart = new Date(year, month - 1, day, 0, 0, 0, 0);
                        dateInRange = itemDate >= rangeStart;
                    }
                } catch (e) {
                    console.warn('Error al parsear startDate:', startDate, e);
                    dateInRange = true; // Si hay error, permitir el item
                }
            }
            
            if (endDate && dateInRange) {
                try {
                    // Parsear endDate (formato YYYY-MM-DD desde input HTML)
                    const parts = endDate.split('-');
                    if (parts.length === 3) {
                        const year = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10);
                        const day = parseInt(parts[2], 10);
                        const rangeEnd = new Date(year, month - 1, day, 23, 59, 59, 999);
                        dateInRange = itemDate <= rangeEnd;
                    }
                } catch (e) {
                    console.warn('Error al parsear endDate:', endDate, e);
                    dateInRange = true; // Si hay error, permitir el item
                }
            }
            
            // Verificar período
            const periodInRange =
                !periodStart ||
                (itemDate >= periodStart && itemDate <= periodEnd);
            
            // Debug logs (comentar después de verificar)
            // console.log(`Item: ${item.dateStr} | DateInRange: ${dateInRange} | PeriodInRange: ${periodInRange}`);
            
            // Si hay rango de fechas, ignora el período; si no, aplica el período
            if (hasDateRange) {
                return dateInRange;
            } else {
                return dateInRange && periodInRange;
            }
        });
        
        return this.filteredData;
    }

    /**
     * Filtra por múltiples criterios: fechas, país, afiliado, tipo usuario, navegador, OS, rango de precio y si contiene compra
     */
    filterByCriteria({ startDate = null, endDate = null, period = 'all', country = 'all', affiliate = 'all', userType = 'all', browser = 'all', os = 'all', minTotal = null, maxTotal = null, hasPurchase = 'all' } = {}) {
        // Primero filtrar por rango/periodo usando la función existente
        this.filterByDateRange(startDate, endDate, period);

        this.filteredData = this.filteredData.filter(item => {
            if (country && country !== 'all' && (item.country || '').toLowerCase() !== (country || '').toLowerCase()) return false;
            if (affiliate && affiliate !== 'all' && (item.affiliate || '').toLowerCase() !== (affiliate || '').toLowerCase()) return false;
            if (userType && userType !== 'all' && (item.userType || '').toLowerCase() !== (userType || '').toLowerCase()) return false;
            if (browser && browser !== 'all' && (item.browser || '').toLowerCase() !== (browser || '').toLowerCase()) return false;
            if (os && os !== 'all' && (item.operatingSystem || '').toLowerCase() !== (os || '').toLowerCase()) return false;

            if (minTotal !== null && minTotal !== '' && !isNaN(Number(minTotal))) {
                if ((item.total || 0) < Number(minTotal)) return false;
            }
            if (maxTotal !== null && maxTotal !== '' && !isNaN(Number(maxTotal))) {
                if ((item.total || 0) > Number(maxTotal)) return false;
            }

            if (hasPurchase === 'with') {
                if (!Array.isArray(item.compras) || item.compras.length === 0) return false;
            } else if (hasPurchase === 'without') {
                if (Array.isArray(item.compras) && item.compras.length > 0) return false;
            }

            return true;
        });

        return this.filteredData;
    }

    /**
     * Busca en los datos
     */
    search(searchTerm) {
        const term = searchTerm.toLowerCase();
        this.filteredData = this.data.filter(item =>
            item.searchText.includes(term)
        );
        return this.filteredData;
    }

    /**
     * Filtra por tipo de transacción (afiliado/directo)
     */
    filterByTransactionType(type = 'all') {
        if (type === 'affiliated') {
            return this.filteredData.filter(order => 
                order.afiliado && order.afiliado !== 'Sin afiliado'
            );
        } else if (type === 'direct') {
            return this.filteredData.filter(order => 
                !order.afiliado || order.afiliado === 'Sin afiliado'
            );
        }
        return this.filteredData;
    }

    /**
     * Calcula estadísticas generales
     */
    getStats(data = this.filteredData) {
        const totalSales = data.reduce((acc, order) => acc + (order.total || 0), 0);
        const avgOrderValue = data.length > 0 ? totalSales / data.length : 0;
        const totalProducts = data.reduce((acc, order) => acc + (order.productsCount || 0), 0);
        const uniqueCustomers = new Set(data.map(order => order.correo_comprador).filter(Boolean)).size;

        return {
            totalSales,
            avgOrderValue,
            totalProducts,
            totalOrders: data.length,
            uniqueCustomers
        };
    }

    /**
     * Obtiene el rango de fechas para Pago del Programador basado en el último día del mes anterior y el penúltimo día del mes seleccionado.
     * monthOffset = 0 -> mes actual, 1 -> mes anterior, etc.
     */
    getProgrammerPaymentData(monthOffset = 0) {
        const now = new Date();
        const targetMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
        const previousMonth = new Date(targetMonth.getFullYear(), targetMonth.getMonth() - 1, 1);

        const rangeStartDate = new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0, 0, 0, 0, 0);
        const lastDayOfTarget = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0);
        const rangeEndDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), Math.max(1, lastDayOfTarget.getDate() - 1), 23, 59, 59, 999);

        const formatYYYYMMDD = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        const startDateStr = formatYYYYMMDD(rangeStartDate);
        const endDateStr = formatYYYYMMDD(rangeEndDate);

        const currentFiltered = this.filteredData;

        this.filterByDateRange(startDateStr, endDateStr, 'all');
        const rangeStats = this.getStats(this.filteredData);

        // Restaurar filtro previo para no afectar interfaces externas
        this.filteredData = currentFiltered;

        const pagoProgramadorUSD = Number(rangeStats.totalSales || 0) * 0.05;
        const pagoProgramadorCUP = pagoProgramadorUSD * 1; // Sin conversión de moneda en datos de pedidos

        const periodLabel = monthOffset === 0 ? 'Mes actual' : `${monthOffset} meses atrás`;

        return {
            startDate: startDateStr,
            endDate: endDateStr,
            totalOrders: rangeStats.totalOrders,
            totalSales: rangeStats.totalSales,
            pagoProgramadorUSD,
            pagoProgramadorCUP,
            periodLabel
        };
    }

    /**
     * Obtiene datos mensuales comparativos
     */
    getMonthlyComparison(data = this.data) {
        const monthlyData = {};
        const currentYear = new Date().getFullYear();
        
        for (let month = 0; month < 12; month++) {
            const key = `${currentYear}-${month}`;
            monthlyData[key] = {
                month: getMonthName(month),
                orders: 0,
                sales: 0,
                products: 0,
                hasData: false
            };
        }
        
        data.forEach(order => {
            const orderDate = order.date;
            const year = orderDate.getFullYear();
            const month = orderDate.getMonth();
            
            if (year === currentYear) {
                const key = `${year}-${month}`;
                monthlyData[key].orders++;
                monthlyData[key].sales += order.total || 0;
                monthlyData[key].products += order.productsCount || 0;
                monthlyData[key].hasData = true;
            }
        });
        
        return Object.values(monthlyData).sort((a, b) => {
            const monthA = getMonthIndex(a.month);
            const monthB = getMonthIndex(b.month);
            return monthA - monthB;
        });
    }

    /**
     * Obtiene los productos más vendidos
     */
    getTopProducts(data = this.filteredData, limit = 10) {
        const products = data.reduce((acc, order) => {
            order.compras.forEach(product => {
                acc[product.name] = (acc[product.name] || 0) + product.quantity;
            });
            return acc;
        }, {});

        return Object.entries(products)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([product, quantity]) => ({ product, quantity }));
    }

    /**
     * Obtiene la tendencia de ventas por día
     */
    getSalesTrend(data = this.filteredData) {
        const dailySales = data.reduce((acc, order) => {
            const dateStr = order.date.toISOString().split('T')[0];
            acc[dateStr] = (acc[dateStr] || 0) + order.total;
            return acc;
        }, {});

        return Object.entries(dailySales)
            .map(([date, total]) => ({ date, total }))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    /**
     * Obtiene resumen diario (hoy y ayer)
     */
    getDailySummary() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
    
        const todayOrders = this.data.filter(order => {
            const orderDate = new Date(order.date.getFullYear(), order.date.getMonth(), order.date.getDate());
            return orderDate.getTime() === today.getTime();
        });
    
        const yesterdayOrders = this.data.filter(order => {
            const orderDate = new Date(order.date.getFullYear(), order.date.getMonth(), order.date.getDate());
            return orderDate.getTime() === yesterday.getTime();
        });
    
        const todaySales = todayOrders.reduce((sum, order) => sum + order.total, 0);
        const yesterdaySales = yesterdayOrders.reduce((sum, order) => sum + order.total, 0);
    
        let salesChange = "N/A";
        let salesChangeClass = "";
        if (yesterdaySales > 0) {
            const change = ((todaySales - yesterdaySales) / yesterdaySales * 100).toFixed(1);
            salesChange = `${change}%`;
            salesChangeClass = change >= 0 ? 'positive' : 'negative';
        }

        return {
            todaySales,
            todayOrders: todayOrders.length,
            yesterdaySales,
            yesterdayOrders: yesterdayOrders.length,
            salesChange,
            salesChangeClass
        };
    }
}
