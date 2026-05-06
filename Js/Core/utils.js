/**
 * Utilidades generales para el Dashboard
 */

// Función para obtener el símbolo de moneda
export function getCurrencySymbol() {
    return '$';
}

// Obtener el nombre del mes
export function getMonthName(monthIndex) {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[monthIndex];
}

// Obtener índice del mes a partir del nombre
export function getMonthIndex(monthName) {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months.indexOf(monthName);
}

// Formatear números a moneda
export function formatCurrency(value) {
    return `${getCurrencySymbol()} ${parseFloat(value).toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// Formatear números con separador de miles
export function formatNumber(value) {
    return parseInt(value || 0).toLocaleString('es-ES');
}

// Formatear fecha
export function formatDate(date, options = {}) {
    if (!date) return '';
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const defaultOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    };
    return d.toLocaleString('es-ES', { ...defaultOptions, ...options });
}

// Validar rango de fechas
export function isDateInRange(date, startDate, endDate) {
    const itemDate = new Date(date);
    
    // Normalizar a medianoche en zona horaria local para comparación correcta
    const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
    
    if (startDate) {
        let compareStart;
        if (typeof startDate === 'string') {
            // Si es string en formato YYYY-MM-DD (de input HTML type=date)
            const [year, month, day] = startDate.split('-').map(Number);
            compareStart = new Date(year, month - 1, day, 0, 0, 0, 0);
        } else {
            compareStart = new Date(startDate);
            compareStart = new Date(compareStart.getFullYear(), compareStart.getMonth(), compareStart.getDate());
        }
        if (itemDateOnly < compareStart) return false;
    }
    
    if (endDate) {
        let compareEnd;
        if (typeof endDate === 'string') {
            // Si es string en formato YYYY-MM-DD (de input HTML type=date)
            const [year, month, day] = endDate.split('-').map(Number);
            compareEnd = new Date(year, month - 1, day, 23, 59, 59, 999);
        } else {
            compareEnd = new Date(endDate);
            compareEnd = new Date(compareEnd.getFullYear(), compareEnd.getMonth(), compareEnd.getDate(), 23, 59, 59, 999);
        }
        if (itemDateOnly > compareEnd) return false;
    }
    
    return true;
}

// Calcular porcentaje de cambio
export function calculatePercentageChange(current, previous) {
    if (previous === 0) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
}

// Mostrar notificaciones
export function showAlert(message, type = 'success', duration = 4000) {
    const alert = document.createElement('div');
    alert.className = `alert ${type}`;
    alert.innerHTML = `
        ${type === 'loading' ? 
            '<i class="fas fa-spinner fa-spin"></i>' : 
            type === 'success' ? 
            '<i class="fas fa-check-circle"></i>' : 
            '<i class="fas fa-exclamation-circle"></i>'}
        <span>${message}</span>
        ${type !== 'loading' ? '<button class="close-alert"><i class="fas fa-times"></i></button>' : ''}
    `;
    
    document.body.appendChild(alert);
    
    if (type !== 'loading') {
        setTimeout(() => {
            alert.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }, duration);
    } else {
        alert.classList.add('show');
    }
    
    alert.querySelector('.close-alert')?.addEventListener('click', () => {
        alert.classList.remove('show');
        setTimeout(() => alert.remove(), 300);
    });
    
    return alert;
}

// Descargar archivo
export async function downloadFile(dataUrl, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
}

// Copiar al portapapeles
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Error al copiar al portapapeles:', err);
        return false;
    }
}
