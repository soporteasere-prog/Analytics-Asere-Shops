/**
 * Módulo de renderizado de UI
 */

import { getCurrencySymbol, formatCurrency, formatNumber, getMonthName, getMonthIndex } from '../Core/utils.js';

// --- Avatar helpers: MD5 (for Gravatar), gravatar URL, deterministic gradient, modal preview ---
/* Minimal MD5 implementation (self-contained) */
function md5(s){
    function L(k,d){return (k<<d)|(k>>>(32-d));}
    function K(a,b,c,d,x,s,t){a=a+((b&c)|(~b&d))+x+t|0;a=L(a,s);return (a+b)|0}
    var bytes = unescape(encodeURIComponent(s));
    var i, length = bytes.length, wordArray = [];
    for(i=0;i<length;i+=4) wordArray[i>>2] = bytes.charCodeAt(i) + ((bytes.charCodeAt(i+1)||0)<<8) + ((bytes.charCodeAt(i+2)||0)<<16) + ((bytes.charCodeAt(i+3)||0)<<24);
    wordArray[length>>2] |= 0x80 << ((length)%4)*8;
    wordArray[(((length+8)>>6)<<4)+14] = length*8;
    var a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    function F(a,b,c,d,x,s,t){a=a+((b&c)|(~b&d))+x+t|0;a=L(a,s);return (a+b)|0}
    function G(a,b,c,d,x,s,t){a=a+((b&d)|(c&~d))+x+t|0;a=L(a,s);return (a+b)|0}
    function H(a,b,c,d,x,s,t){a=a+(b^c^d)+x+t|0;a=L(a,s);return (a+b)|0}
    function I(a,b,c,d,x,s,t){a=a+(c^(b|~d))+x+t|0;a=L(a,s);return (a+b)|0}
    for(i=0;i<wordArray.length;i+=16){
        var olda=a, oldb=b, oldc=c, oldd=d;
        a=F(a,b,c,d,wordArray[i+0],7,-680876936);
        d=F(d,a,b,c,wordArray[i+1],12,-389564586);
        c=F(c,d,a,b,wordArray[i+2],17,606105819);
        b=F(b,c,d,a,wordArray[i+3],22,-1044525330);
        a=F(a,b,c,d,wordArray[i+4],7,-176418897);
        d=F(d,a,b,c,wordArray[i+5],12,1200080426);
        c=F(c,d,a,b,wordArray[i+6],17,-1473231341);
        b=F(b,c,d,a,wordArray[i+7],22,-45705983);
        a=F(a,b,c,d,wordArray[i+8],7,1770035416);
        d=F(d,a,b,c,wordArray[i+9],12,-1958414417);
        c=F(c,d,a,b,wordArray[i+10],17,-42063);
        b=F(b,c,d,a,wordArray[i+11],22,-1990404162);
        a=F(a,b,c,d,wordArray[i+12],7,1804603682);
        d=F(d,a,b,c,wordArray[i+13],12,-40341101);
        c=F(c,d,a,b,wordArray[i+14],17,-1502002290);
        b=F(b,c,d,a,wordArray[i+15],22,1236535329);
        a=G(a,b,c,d,wordArray[i+1],5,-165796510);
        d=G(d,a,b,c,wordArray[i+6],9,-1069501632);
        c=G(c,d,a,b,wordArray[i+11],14,643717713);
        b=G(b,c,d,a,wordArray[i+0],20,-373897302);
        a=G(a,b,c,d,wordArray[i+5],5,-701558691);
        d=G(d,a,b,c,wordArray[i+10],9,38016083);
        c=G(c,d,a,b,wordArray[i+15],14,-660478335);
        b=G(b,c,d,a,wordArray[i+4],20,-405537848);
        a=G(a,b,c,d,wordArray[i+9],5,568446438);
        d=G(d,a,b,c,wordArray[i+14],9,-1019803690);
        c=G(c,d,a,b,wordArray[i+3],14,-187363961);
        b=G(b,c,d,a,wordArray[i+8],20,1163531501);
        a=G(a,b,c,d,wordArray[i+13],5,-1444681467);
        d=G(d,a,b,c,wordArray[i+2],9,-51403784);
        c=G(c,d,a,b,wordArray[i+7],14,1735328473);
        b=G(b,c,d,a,wordArray[i+12],20,-1926607734);
        a=H(a,b,c,d,wordArray[i+5],4,-378558);
        d=H(d,a,b,c,wordArray[i+8],11,-2022574463);
        c=H(c,d,a,b,wordArray[i+11],16,1839030562);
        b=H(b,c,d,a,wordArray[i+14],23,-35309556);
        a=H(a,b,c,d,wordArray[i+1],4,-1530992060);
        d=H(d,a,b,c,wordArray[i+4],11,1272893353);
        c=H(c,d,a,b,wordArray[i+7],16,-155497632);
        b=H(b,c,d,a,wordArray[i+10],23,-1094730640);
        a=H(a,b,c,d,wordArray[i+13],4,681279174);
        d=H(d,a,b,c,wordArray[i+0],11,-358537222);
        c=H(c,d,a,b,wordArray[i+3],16,-722521979);
        b=H(b,c,d,a,wordArray[i+6],23,76029189);
        a=H(a,b,c,d,wordArray[i+9],4,-640364487);
        d=H(d,a,b,c,wordArray[i+12],11,-421815835);
        c=H(c,d,a,b,wordArray[i+15],16,530742520);
        b=H(b,c,d,a,wordArray[i+2],23,-995338651);
        a=I(a,b,c,d,wordArray[i+0],6,-198630844);
        d=I(d,a,b,c,wordArray[i+7],10,1126891415);
        c=I(c,d,a,b,wordArray[i+14],15,-1416354905);
        b=I(b,c,d,a,wordArray[i+5],21,-57434055);
        a=I(a,b,c,d,wordArray[i+12],6,1700485571);
        d=I(d,a,b,c,wordArray[i+3],10,-1894986606);
        c=I(c,d,a,b,wordArray[i+10],15,-1051523);
        b=I(b,c,d,a,wordArray[i+1],21,-2054922799);
        a=I(a,b,c,d,wordArray[i+8],6,1873313359);
        d=I(d,a,b,c,wordArray[i+15],10,-30611744);
        c=I(c,d,a,b,wordArray[i+6],15,-1560198380);
        b=I(b,c,d,a,wordArray[i+13],21,1309151649);
        a=I(a,b,c,d,wordArray[i+4],6,-145523070);
        d=I(d,a,b,c,wordArray[i+11],10,-1120210379);
        c=I(c,d,a,b,wordArray[i+2],15,718787259);
        b=I(b,c,d,a,wordArray[i+9],21,-343485551);
        a=(a+olda)|0;b=(b+oldb)|0;c=(c+oldc)|0;d=(d+oldd)|0;
    }
    function toHex(n){
        var s='';for(var j=0;j<4;j++) s+=('0'+((n>>>(j*8))&255).toString(16)).slice(-2);return s;
    }
    return toHex(a)+toHex(b)+toHex(c)+toHex(d);
}

function getGravatarUrl(email, size=128) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    const hash = md5(clean);
    // Use 'identicon' as default to avoid 404 responses (prevents console errors)
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=identicon`;
}

function generateGradient(seed) {
    let h = 0;
    for (let i=0;i<seed.length;i++) h = (h*31 + seed.charCodeAt(i)) % 360;
    const h2 = (h + 40) % 360;
    const c1 = `hsl(${h} 70% 50%)`;
    const c2 = `hsl(${h2} 65% 45%)`;
    return `linear-gradient(135deg, ${c1}, ${c2})`;
}

function getInitials(name) {
    if (!name) return '';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length-1].charAt(0)).toUpperCase();
}

function ensureAvatarFallbacks(container){
    container.querySelectorAll('.customer-avatar').forEach(el => {
        if (el.querySelector('.avatar-img')) return;
        const email = el.getAttribute('data-email') || el.getAttribute('data-tooltip') || '';
        const gravUrl = getGravatarUrl(email, 200);
        if (!gravUrl) { el.style.background = generateGradient(el.textContent || email); return; }
        const img = new Image();
        img.onload = () => {
            img.className = 'avatar-img';
            img.alt = el.getAttribute('data-tooltip') || '';
            el.innerHTML = '';
            el.appendChild(img);
        };
        img.onerror = () => {
            el.style.background = generateGradient(email || (el.textContent||'user'));
        };
        img.src = gravUrl;
    });
}

function createAvatarModal(){
    if (document.getElementById('avatar-preview-modal')) return;
    
    // Importar funciones de scroll
    const { disableBodyScroll, enableBodyScroll } = (() => {
        return {
            disableBodyScroll: () => {
                try {
                    const count = parseInt(document.documentElement.getAttribute('data-modal-count') || '0', 10) || 0;
                    document.documentElement.setAttribute('data-modal-count', String(count + 1));
                    document.documentElement.style.overflow = 'hidden';
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('modal-open');
                } catch (e) {
                    console.warn('disableBodyScroll error', e);
                }
            },
            enableBodyScroll: () => {
                try {
                    const count = parseInt(document.documentElement.getAttribute('data-modal-count') || '0', 10) || 0;
                    const next = Math.max(0, count - 1);
                    document.documentElement.setAttribute('data-modal-count', String(next));
                    if (next === 0) {
                        document.documentElement.style.overflow = '';
                        document.body.style.overflow = '';
                        document.body.classList.remove('modal-open');
                        document.documentElement.removeAttribute('data-modal-count');
                    }
                } catch (e) {
                    console.warn('enableBodyScroll error', e);
                }
            }
        };
    })();
    
    const modal = document.createElement('div'); 
    modal.id = 'avatar-preview-modal'; 
    modal.className='avatar-modal';
    modal.innerHTML = `
        <div class="avatar-modal-overlay"></div>
        <div class="avatar-modal-content">
            <button class="avatar-modal-close" aria-label="Cerrar imagen">&times;</button>
            <div class="avatar-modal-body"></div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const closeBtn = modal.querySelector('.avatar-modal-close');
    const overlay = modal.querySelector('.avatar-modal-overlay');
    
    // Función para cerrar modal
    const closeModal = (e) => {
        if (e) e.preventDefault();
        modal.classList.remove('open');
        enableBodyScroll();
    };
    
    // Event listeners
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', closeModal);
    
    // Cerrar con Escape
    const escapeHandler = (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeModal();
        }
    };
    document.addEventListener('keydown', escapeHandler);
    
    // Guardar referencia para limpiar si es necesario
    modal.escapeHandler = escapeHandler;
}

function showAvatarPreview(el){
    createAvatarModal();
    const modal = document.getElementById('avatar-preview-modal');
    const body = modal.querySelector('.avatar-modal-body');
    body.innerHTML = '';
    
    const img = el.querySelector('.avatar-img');
    if (img) {
        const big = document.createElement('img'); 
        big.src = img.src; 
        big.alt = img.alt || ''; 
        big.className = 'avatar-modal-image';
        body.appendChild(big);
    } else {
        const tile = document.createElement('div'); 
        tile.className = 'avatar-modal-tile';
        tile.innerText = (el.querySelector('.avatar-initials')?.innerText) || el.textContent.trim().slice(0,2).toUpperCase();
        tile.style.background = el.style.background || generateGradient(el.getAttribute('data-email')|| el.textContent);
        body.appendChild(tile);
    }
    
    // Importar funciones de scroll
    const disableBodyScroll = () => {
        try {
            const count = parseInt(document.documentElement.getAttribute('data-modal-count') || '0', 10) || 0;
            document.documentElement.setAttribute('data-modal-count', String(count + 1));
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
            document.body.classList.add('modal-open');
        } catch (e) {
            console.warn('disableBodyScroll error', e);
        }
    };
    
    modal.classList.add('open');
    disableBodyScroll();
}

export class UIRenderer {
    /**
     * Renderiza resumen general
     */
    static renderGeneralSummary(container, monthlyData, filteredData, period) {
        if (!container) return;

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let referenceMonth = currentMonth;
        let title = `Resumen ${currentYear}`;
        let periodBadgeText = 'Anual';

        if (period === 'month') {
            title = `Resumen ${getMonthName(currentMonth)}`;
            periodBadgeText = getMonthName(currentMonth);
        } else if (period === 'last-month') {
            referenceMonth = (currentMonth - 1 + 12) % 12;
            title = `Resumen ${getMonthName(referenceMonth)}`;
            periodBadgeText = getMonthName(referenceMonth);
        } else {
            referenceMonth = null;
        }

        const referenceData = referenceMonth !== null ?
            monthlyData.find(m => getMonthIndex(m.month) === referenceMonth) ||
            { month: getMonthName(referenceMonth), orders: 0, sales: 0, products: 0 }
            : null;

        const yearlyData = {
            sales: monthlyData.reduce((sum, month) => sum + month.sales, 0),
            orders: monthlyData.reduce((sum, month) => sum + month.orders, 0),
            products: monthlyData.reduce((sum, month) => sum + month.products, 0)
        };

        const displaySales = referenceMonth !== null && referenceData ? referenceData.sales : yearlyData.sales;
        const displayOrders = referenceMonth !== null && referenceData ? referenceData.orders : yearlyData.orders;
        const displayProducts = referenceMonth !== null && referenceData ? referenceData.products : yearlyData.products;

        const hasOrdersForPeriod = filteredData.length > 0;

        const monthlySummaryContent = hasOrdersForPeriod ? `
            <div class="summary-item highlight">
                <div class="stat-value">${formatCurrency(displaySales)}</div>
                <div class="stat-label">${referenceMonth !== null ? 'Ventas del mes' : 'Ventas anuales'}</div>
            </div>
            
            <div class="summary-item">
                <div class="stat-value">${formatNumber(displayOrders)}</div>
                <div class="stat-label">${referenceMonth !== null ? 'Pedidos' : 'Pedidos anuales'}</div>
            </div>
            
            <div class="summary-item">
                <div class="stat-value">${formatNumber(displayProducts)}</div>
                <div class="stat-label">Productos</div>
            </div>
        ` : `
            <div class="summary-item highlight" style="grid-column: 1 / -1; text-align: center;">
                <p>No hay pedidos para este periodo seleccionado.</p>
                <p class="stat-label">Intenta cambiar los filtros de fecha o periodo.</p>
            </div>
        `;

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-header">
                    <h3><i class="fas fa-chart-line"></i> ${title}</h3>
                    <span class="period-badge">${periodBadgeText}</span>
                </div>
                
                <div class="summary-grid">
                    ${monthlySummaryContent}
                    <div class="summary-item yearly">
                        <div class="stat-value">${formatCurrency(yearlyData.sales)}</div>
                        <div class="stat-label">Ventas anuales totales</div>
                        <div class="stat-sub">${formatNumber(yearlyData.orders)} pedidos, ${formatNumber(yearlyData.products)} productos</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Renderiza resumen diario
     */
    static renderDailySummary(container, dailySummary) {
        if (!container) return;

        const { todaySales, todayOrders, yesterdaySales, yesterdayOrders, salesChange, salesChangeClass } = dailySummary;

        container.innerHTML = `
            <div class="summary-item">
                <h4><i class="fas fa-sun"></i> Hoy</h4>
                <div class="stat-value">${formatCurrency(todaySales)}</div>
                <div class="stat-label">${formatNumber(todayOrders)} pedidos</div>
            </div>
            <div class="summary-item">
                <h4><i class="fas fa-moon"></i> Ayer</h4>
                <div class="stat-value">${formatCurrency(yesterdaySales)}</div>
                <div class="stat-change ${salesChangeClass}">
                    ${salesChange !== "N/A" ? `${salesChange}` : 'Sin datos previos'}
                </div>
            </div>
        `;
    }

    /**
     * Actualiza estadísticas
     */
    static updateStats(stats) {
        document.getElementById('total-sales').textContent = formatCurrency(stats.totalSales);
        document.getElementById('avg-order-value').textContent = formatCurrency(stats.avgOrderValue);
        document.getElementById('total-orders').textContent = formatNumber(stats.totalOrders);
        document.getElementById('unique-customers').textContent = formatNumber(stats.uniqueCustomers);
    }

    /**
     * Renderiza lista de productos top
     */
    static renderTopProducts(container, productsData) {
        if (!container) return;

        container.innerHTML = productsData
            .map(({ product, quantity }) => `
                <div class="ranking-item">
                    <span>${product}</span>
                    <span>${formatNumber(quantity)} unidades</span>
                </div>
            `).join('');
    }

    /**
     * Renderiza transacciones
     */
    static renderTransactions(container, data, onReceiptClick) {
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = `
                <div class="text-center p-4" style="color: var(--text-secondary);">
                    <p><i class="fas fa-box-open"></i> No hay transacciones para mostrar con los filtros aplicados.</p>
                    <p>Intenta ajustar el rango de fechas o el periodo.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = data
            .sort((a, b) => b.date - a.date)
            .map((order, idx) => `
                <div class="order-card ${order.isFromBuquenqe ? 'internal-source' : 'external-source'}" data-order-idx="${idx}" data-source-label="${order.sourceLabel}">
                    ${order.isFromBuquenqe ? `<div class="internal-ribbon" aria-hidden="true">WEB</div>` : `<div class="external-ribbon" aria-hidden="true">EXTERNO</div>`}
                    <div class="order-header">
                        <div class="order-main-info">
                            <div class="customer-header">
                                <div class="customer-avatar" aria-label="${order.nombre_comprador || ''}" data-tooltip="${order.nombre_comprador}" data-email="${order.correo_comprador || ''}">
                                    ${order.avatarUrl ? `
                                        <img src="${order.avatarUrl}" alt="${order.nombre_comprador}" class="avatar-img" />
                                    ` : `
                                        <span class="avatar-initials">${getInitials(order.nombre_comprador)}</span>
                                    `}
                                </div>
                                <h4>${order.nombre_comprador}</h4>
                            </div>
                            <div class="order-meta">
                                <span class="meta-item">
                                    <i class="fas fa-calendar"></i>
                                    ${order.dateStr}
                                </span>
                                <span class="meta-item">
                                    <i class="fas fa-user-tag"></i>
                                    ${order.tipo_usuario}
                                </span>
                            </div>
                            ${order.afiliado && order.afiliado !== 'Sin afiliado' ? `
                            <div class="affiliate-info">
                                <i class="fas fa-handshake"></i>
                                <span>Afiliado: ${order.afiliado}</span>
                            </div>
                            ` : ''}
                            <div class="traffic-source">
                                <i class="fas fa-route"></i>
                                <span>Origen: ${order.fuente_trafico}</span>
                                ${order.isFromBuquenqe ? `<span class="source-badge internal"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"3\"></circle><path d=\"M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 0 1 2.34 17.7l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.7 0 1.3-.4 1.51-1a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 6.7 2.34l.06.06c.5.5 1.2.7 1.82.33.5-.3 1-.5 1.51-.5H12c.5 0 1 .2 1.51.5.62.37 1.32.17 1.82-.33l.06-.06A2 2 0 0 1 19.66 6.3l-.06.06c-.3.5-.5 1-.33 1.82.3.5.5 1.3.5 1.82V12c0 .5-.2 1-.5 1.51z\"></path></svg> Asere</span>` : `<span class="source-badge external"><svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\"></path><polyline points=\"15 3 21 3 21 9\"></polyline><line x1=\"10\" y1=\"14\" x2=\"21\" y2=\"3\"></line></svg> Externo</span>`}
                            </div>
                        </div>
                        <div class="order-stats">
                            <div class="stat-value">${formatCurrency(order.total)}</div>
                            <div class="stat-label">${formatNumber(order.productsCount)} productos</div>
                        </div>
                    </div>
                    <div class="order-details">
                        <div class="products-list">
                            ${order.compras.map(product => `
                                <div class="product-item">
                                    <span>${product.name}</span>
                                    <span>${product.quantity} × ${getCurrencySymbol()} ${product.unitPrice.toFixed(2)}</span>
                                    ${product.discount > 0 ? `<span style="color: var(--error);">(-${product.discount}%)</span>` : ''}
                                </div>
                            `).join('')}
                        </div>
                        <div class="order-footer">
                            <div class="meta-item">
                                <i class="fas fa-map-marker-alt"></i>
                                ${order.direccion_envio}
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-desktop"></i>
                                ${order.navegador} / ${order.sistema_operativo}
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-phone"></i>
                                ${order.telefono_comprador}
                            </div>
                            <div class="meta-item">
                                <i class="fas fa-envelope"></i>
                                ${order.correo_comprador}
                            </div>
                        </div>
                        <div class="receipt-btn-container" style="text-align:right;margin-top:10px;">
                            <button class="btn btn-secondary download-receipt-btn" data-order-idx="${idx}"><i class="fas fa-file-download"></i> Descargar Recibo</button>
                        </div>
                    </div>
                </div>
            `).join('');

        // Agregar listeners
        container.querySelectorAll('.download-receipt-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = btn.getAttribute('data-order-idx');
                onReceiptClick(data[idx], idx);
            });
        });

        // Listeners para expandir/contraer detalles
        container.querySelectorAll('.order-header').forEach(header => {
            header.addEventListener('click', () => {
                const details = header.closest('.order-card').querySelector('.order-details');
                details.classList.toggle('active');
            });
        });

                // Avatar fallbacks (Gravatar or generated gradient) and preview modal
                ensureAvatarFallbacks(container);
                container.querySelectorAll('.customer-avatar').forEach(av => {
                    av.style.cursor = 'pointer';
                    av.addEventListener('click', (e) => { e.stopPropagation(); showAvatarPreview(av); });
                });
    }

    /**
     * Genera recibo descargable
     */
    static async generateReceipt(order) {
        const now = new Date();
        const fechaDescarga = now.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
        }) + ' ' + now.toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        const orderDate = order.fecha_hora_entrada ? new Date(order.fecha_hora_entrada) : null;
        const fechaPedido = orderDate ? orderDate.toLocaleDateString('es-ES', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

        const receiptHtml = `
            <div id="receipt-content" style="width:400px;padding:18px;background:#fff;border:1.5px solid #e3e6e8;border-radius:10px;box-shadow:0 2px 12px #0001;font-family:'Courier New',monospace;color:#222;">
                <!-- header -->
                <div style="text-align:center;margin-bottom:14px;">
                    <div style="font-size:24px;font-weight:900;color:#000;letter-spacing:1px;">Asere</div>
                    <div style="font-size:13px;color:#333;font-weight:600;">Recibo de Pago</div>
                    ${fechaPedido ? `<div style="font-size:11px;color:#333;margin-top:2px;">${fechaPedido}</div>` : ''}
                </div>

                <!-- customer info -->
                <div style="font-size:13px;font-weight:600;margin-bottom:3px;"><b>Cliente:</b> ${order.nombre_comprador || ''}</div>
                <div style="font-size:12px;color:#555;margin-bottom:5px;line-height:1.3;">
                    ${order.telefono_comprador ? `<div>Tel: ${order.telefono_comprador}</div>` : ''}
                    ${order.correo_comprador ? `<div>${order.correo_comprador}</div>` : ''}
                    ${order.direccion_envio ? `<div>${order.direccion_envio}</div>` : ''}
                </div>

                <div style="border-top:1px dashed #aaa;margin:10px 0;"></div>

                <!-- products table -->
                <table style="width:100%;font-size:14px;border-collapse:collapse;">
                    <thead>
                        <tr style="color:#000;">
                            <th style="width:60%;text-align:left;padding-bottom:6px;font-weight:700;">Producto</th>
                            <th style="width:20%;text-align:center;padding-bottom:6px;font-weight:700;">Cant.</th>
                            <th style="width:20%;text-align:right;padding-bottom:6px;font-weight:700;">Precio</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${order.compras.map(p => {
                            const subtotal = formatCurrency(p.unitPrice * p.quantity * (1 - (p.discount || 0)/100));
                            const name = p.name + (p.discount > 0 ? ` <span style='color:#EF4444;'>(-${p.discount}%)</span>` : '');
                            return `
                                <tr>
                                    <td style="padding:4px 0;font-weight:600;">${name}</td>
                                    <td style="text-align:center;font-weight:600;">${p.quantity}</td>
                                    <td style="text-align:right;font-weight:600;">${subtotal}</td>
                                </tr>
                            `;
                        }).join('')}
                        <tr><td colspan="3" style="border-top:1px dashed #aaa;padding-top:5px;"></td></tr>
                    </tbody>
                </table>

                <div style="border-top:1px dashed #aaa;margin:10px 0;"></div>

                <!-- totals -->
                <div style="text-align:right;font-size:16px;margin-bottom:4px;font-weight:800;">
                    <b>Total:</b> <span style="font-weight:900;color:#10B981;">${formatCurrency(order.total)}</span>
                </div>

                <!-- footer info -->
                <div style="font-size:10px;text-align:center;color:#666;margin-top:6px;line-height:1.3;">
                    ${order.ip ? `Pedido ID: ${order.ip}` : ''}${order.ip ? '<br>' : ''}
                    ${order.fecha_hora_entrada ? `Fecha pedido: ${new Date(order.fecha_hora_entrada).toLocaleString('es-ES')}` : ''}${(order.ip || order.fecha_hora_entrada) ? '<br>' : ''}
                    Fecha emisión: ${fechaDescarga}
                </div>
                <div style="font-size:12px;text-align:center;margin-top:14px;color:#3B82F6;font-weight:600;">
                    ¡Gracias por su compra!
                </div>
            </div>
        `;

        let preview = document.createElement('div');
        preview.style.position = 'fixed';
        preview.style.left = '-9999px';
        preview.innerHTML = receiptHtml;
        document.body.appendChild(preview);

        await new Promise(r => setTimeout(r, 100));

        if (window.html2canvas) {
            const canvas = await window.html2canvas(preview.querySelector('#receipt-content'));
            const filename = `recibo_asere_${order.nombre_comprador.replace(/\s+/g,'_')}_${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}.png`;
            
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }

        document.body.removeChild(preview);
    }
}
