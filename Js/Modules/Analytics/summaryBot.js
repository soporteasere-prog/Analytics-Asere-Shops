/*
 * Summary Bot - Lee my_data.json y genera estadísticas resumidas de pedidos,
 * productos y clientes. Muestra un widget flotante (burbuja) draggable que
 * despliega un panel con la información.
 */

export const SummaryBot = (() => {
    let bubble, panel, notificationBadge;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let bubbleStartLeft = 0;
    let bubbleStartTop = 0;
    let isPanelVisible = false;
    let panelManual = false; // whether user has manually moved the panel
    let currentStats = null;
    let notificationIndex = 0;
    let notificationInterval = null;
    let notificationHideTimeout = null;

    // Funciones para bloquear/desbloquear scroll del body
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

    const enableBodyScroll = () => {
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
    };

    async function init() {
        createElements();
        addEventListeners();
        try {
            const data = await loadData();
            const stats = computeStats(data);
            currentStats = stats;
            renderStats(stats);
            updateNotification(); // initial notification
            startNotificationRotation(); // start rotating notifications
        } catch (e) {
            console.error('SummaryBot init error', e);
            const content = panel.querySelector('.content');
            if (content) {
                content.innerHTML = '<p style="color:red;">Error cargando datos</p>';
            }
        }
    }

    function createElements() {
        // bubble
        bubble = document.createElement('div');
        bubble.id = 'summary-bot-bubble';
        bubble.innerHTML = `
            <svg width="50" height="50" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" class="bot-icon">
              <rect x="24" y="28" width="80" height="68" rx="6" ry="6" fill="#FFFFFF" stroke="#ffffff" stroke-width="4"/>
              <line x1="34" y1="28" x2="34" y2="16" stroke="#1E88E5" stroke-width="4" stroke-linecap="round"/>
              <circle cx="34" cy="10" r="6" fill="#1E88E5"/>
              <line x1="94" y1="28" x2="94" y2="16" stroke="#1E88E5" stroke-width="4" stroke-linecap="round"/>
              <circle cx="94" cy="10" r="6" fill="#1E88E5"/>
              <g class="bot-eye left-eye">
                <circle cx="42" cy="60" r="9" fill="#1E88E5"/>
                <circle cx="42" cy="60" r="4" fill="#FFFFFF"/>
              </g>
              <g class="bot-eye right-eye">
                <circle cx="86" cy="60" r="9" fill="#1E88E5"/>
                <circle cx="86" cy="60" r="4" fill="#FFFFFF"/>
              </g>
              <path d="M55 78 Q64 82 75 78" fill="none" stroke="#1E88E5" stroke-width="6" stroke-linecap="round"/>
            </svg>
        `;
        // default position: bottom-right corner with margin
        document.body.appendChild(bubble);
        const margin = 20;
        // compute after appending so offsetWidth is available
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        bubble.style.left = (vw - bubble.offsetWidth - margin) + 'px';
        bubble.style.top = (vh - bubble.offsetHeight - margin) + 'px';

        // notification chat bubble (floats outside bot)
        notificationBadge = document.createElement('div');
        notificationBadge.id = 'summary-bot-chat-bubble';
        notificationBadge.innerHTML = '<span class="badge-text">—</span>';
        notificationBadge.style.display = 'none';
        document.body.appendChild(notificationBadge);

        // panel
        panel = document.createElement('div');
        panel.id = 'summary-bot-panel';
        panel.innerHTML = `
            <div class="bot-header">
                <span>Resumen</span>
                <button class="bot-close" aria-label="Cerrar">&times;</button>
            </div>
            <div class="content"></div>
        `;
        document.body.appendChild(panel);
    }

    function addEventListeners() {
        // drag handlers using pointer events for unified handling
        let dragDistance = 0;
        let dragStartTime = 0;
        const startDrag = (e) => {
            e.preventDefault();
            isDragging = true;
            dragDistance = 0;
            dragStartTime = Date.now();
            const evt = e.touches ? e.touches[0] : e;
            dragStartX = evt.clientX;
            dragStartY = evt.clientY;
            bubbleStartLeft = parseInt(bubble.style.left, 10) || 0;
            bubbleStartTop = parseInt(bubble.style.top, 10) || 0;
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', endDrag);
            document.addEventListener('touchmove', onDrag, {passive:false});
            document.addEventListener('touchend', endDrag);
        };
        bubble.addEventListener('mousedown', startDrag);
        bubble.addEventListener('touchstart', startDrag, {passive:false});

        // panelManual declared in outer scope
        function onDrag(e) {
            if (!isDragging) return;
            const evt = e.touches ? e.touches[0] : e;
            const dx = evt.clientX - dragStartX;
            const dy = evt.clientY - dragStartY;
            dragDistance = Math.hypot(dx, dy);
            const newLeft = bubbleStartLeft + dx;
            const newTop = bubbleStartTop + dy;
            bubble.style.left = newLeft + 'px';
            bubble.style.top = newTop + 'px';
            // move notification bubble along
            if (notificationBadge) {
                notificationBadge.style.left = (newLeft + 60) + 'px';
                notificationBadge.style.top = (newTop - 20) + 'px';
            }
            // move panel accordingly (keep offset) only if not manually repositioned
            if (!panelManual) {
                panel.style.left = (newLeft + 60) + 'px';
                panel.style.top = (newTop + 10) + 'px';
            }
            e.preventDefault();
        }

        function repositionPanel() {
            if (panelManual) return;
            const rect = bubble.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let x = rect.left + rect.width + 10;
            let y = rect.top;
            // if panel would escape right edge, place on left side
            if (x + panel.offsetWidth > vw - 10) {
                x = rect.left - panel.offsetWidth - 10;
            }
            // ensure x within horizontal bounds
            if (x < 10) x = 10;
            if (x + panel.offsetWidth > vw - 10) x = vw - panel.offsetWidth - 10;
            // clamp vertically
            if (y + panel.offsetHeight > vh - 10) {
                y = vh - panel.offsetHeight - 10;
            }
            if (y < 10) y = 10;
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
        }





        function endDrag(e) {
            if (!isDragging) return;
            isDragging = false;
            // snap bubble to nearest screen edge with margin
            try {
                const rect = bubble.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const MARGIN = 15; // margin from screen edge
                
                // horizontal: choose left or right depending on center location
                const centerX = rect.left + rect.width / 2;
                let left = centerX < vw / 2 ? MARGIN : vw - rect.width - MARGIN;
                
                // vertical: optionally snap top/bottom if near either edge
                const centerY = rect.top + rect.height / 2;
                let top;
                const vertThreshold = 40;
                if (centerY < vertThreshold) {
                    top = MARGIN;
                } else if (vh - centerY < vertThreshold) {
                    top = vh - rect.height - MARGIN;
                } else {
                    // keep current y
                    top = rect.top;
                    // also clamp inside viewport with margin
                    if (top + rect.height > vh - MARGIN) top = vh - rect.height - MARGIN;
                    if (top < MARGIN) top = MARGIN;
                }
                bubble.style.left = left + 'px';
                bubble.style.top = top + 'px';
                repositionPanel();
                repositionChatBubble();
            } catch (err) {}

            // treat as click if moved very little
            const elapsed = Date.now() - dragStartTime;
            if (dragDistance < 5 && elapsed < 300) {
                togglePanel();
            }

            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', endDrag);
            document.removeEventListener('touchmove', onDrag);
            document.removeEventListener('touchend', endDrag);
        }

        // close button
        panel.querySelector('.bot-close')?.addEventListener('click', () => togglePanel());
        // reposition panel/chat on resize so it stays near bubble
        window.addEventListener('resize', () => {
            if (isPanelVisible) repositionPanel();
            repositionChatBubble();
        });

        // allow dragging panel by its header only (keep users free to click links inside)
        let panelDrag = false;
        let panelDragStartX, panelDragStartY, panelStartLeft, panelStartTop;
        panel.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.bot-header')) return;
            panelDrag = true;
            panelDragStartX = e.clientX;
            panelDragStartY = e.clientY;
            panelStartLeft = parseInt(panel.style.left,10) || panel.offsetLeft;
            panelStartTop = parseInt(panel.style.top,10) || panel.offsetTop;
            panel.classList.add('dragging');
            document.addEventListener('mousemove', panelMove);
            document.addEventListener('mouseup', panelEnd);
        });
        panel.addEventListener('touchstart', (e) => {
            if (!e.target.closest('.bot-header')) return;
            panelDrag = true;
            const evt = e.touches[0];
            panelDragStartX = evt.clientX;
            panelDragStartY = evt.clientY;
            panelStartLeft = parseInt(panel.style.left,10) || panel.offsetLeft;
            panelStartTop = parseInt(panel.style.top,10) || panel.offsetTop;
            panel.classList.add('dragging');
            document.addEventListener('touchmove', panelMove, {passive:false});
            document.addEventListener('touchend', panelEnd);
        });
        function panelMove(e) {
            if (!panelDrag) return;
            const evt = e.touches ? e.touches[0] : e;
            const dx = evt.clientX - panelDragStartX;
            const dy = evt.clientY - panelDragStartY;
            panel.style.left = (panelStartLeft + dx) + 'px';
            panel.style.top = (panelStartTop + dy) + 'px';
            e.preventDefault();
        }
        function panelEnd() {
            panelDrag = false;
            panelManual = true;
            panel.classList.remove('dragging');
            document.removeEventListener('mousemove', panelMove);
            document.removeEventListener('mouseup', panelEnd);
            document.removeEventListener('touchmove', panelMove);
            document.removeEventListener('touchend', panelEnd);
        }
    }



    // placeable utility outside event listeners
    function repositionChatBubble() {
        if (!bubble || !notificationBadge) return;
        const rect = bubble.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const orientRight = (rect.left + rect.width / 2) < vw / 2;
        // if bubble is on left side, place chat to the right -> arrow should point left
        notificationBadge.classList.toggle('left', orientRight);
        notificationBadge.classList.toggle('right', !orientRight);
        let x;
        const gap = 8;
        if (orientRight) {
            x = rect.left + rect.width + gap;
        } else {
            x = rect.left - notificationBadge.offsetWidth - gap;
        }
        if (x < gap) x = gap;
        if (x + notificationBadge.offsetWidth > vw - gap) x = vw - notificationBadge.offsetWidth - gap;
        let y = rect.top - notificationBadge.offsetHeight - 12;
        if (y < gap) y = rect.bottom + gap;
        notificationBadge.style.left = x + 'px';
        notificationBadge.style.top = y + 'px';
    }

    function startNotificationRotation() {
        if (notificationInterval) clearInterval(notificationInterval);
        if (isPanelVisible) return; // do not start while panel is open
        notificationInterval = setInterval(() => {
            updateNotification();
        }, 5000); // rotate every 5 seconds
    }

    function updateNotification() {
        if (!currentStats || !notificationBadge) return;

        const notifications = generateNotifications(currentStats);
        if (!notifications || notifications.length === 0) return;

        // cycle through notifications
        notificationIndex = (notificationIndex + 1) % notifications.length;
        const message = notifications[notificationIndex];
        
        const badgeText = notificationBadge.querySelector('.badge-text');
        if (badgeText) {
            badgeText.textContent = message;
        }
        notificationBadge.style.display = 'block';
        notificationBadge.style.opacity = '1';
        
        repositionChatBubble();
        // auto-hide after a few seconds
        if (notificationHideTimeout) clearTimeout(notificationHideTimeout);
        notificationHideTimeout = setTimeout(() => {
            if (notificationBadge) {
                notificationBadge.style.opacity = '0';
                setTimeout(() => {
                    if (notificationBadge) notificationBadge.style.display = 'none';
                }, 200);
            }
        }, 4000);

    }

    function generateNotifications(stats) {
        const notifs = [];
        
        // Format numbers with separators
        const formatNumber = (num) => {
            if (!num && num !== 0) return '0';
            return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        };
        
        // Total revenue notification - CORRECTED
        notifs.push(`💰 Ingresos: $${formatNumber(stats.totalRevenue)}`);
        
        // Order count notification
        notifs.push(`📦 ${formatNumber(stats.totalOrders)} pedidos`);
        
        // Unique customers
        notifs.push(`👥 ${formatNumber(stats.uniqueCustomers)} clientes`);
        
        // Total items notification
        notifs.push(`📊 ${formatNumber(stats.totalItems)} items`);
        
        // Avg order value
        notifs.push(`🔢 Prom: $${formatNumber(stats.avgOrderValue)}`);
        
        // Top customer
        if (stats.topCustomers && stats.topCustomers.length > 0) {
            const topCustomer = stats.topCustomers[0];
            const firstName = topCustomer.name.split(' ')[0];
            notifs.push(`👑 ${firstName.substring(0, 15)}`);
        }
        
        // Top product
        if (stats.topItems && stats.topItems.length > 0) {
            const topProduct = stats.topItems[0];
            const productName = topProduct.name.substring(0, 18);
            notifs.push(`⭐ ${productName}`);
        }

        return notifs;
    }

    function togglePanel() {
        isPanelVisible = !isPanelVisible;
        panel.classList.toggle('active', isPanelVisible);
        if (isPanelVisible) {
            // Bloquear scroll del body
            disableBodyScroll();
            
            // hide bubble and messages while panel is open
            if (bubble) bubble.style.visibility = 'hidden';
            if (notificationBadge) {
                notificationBadge.style.opacity = '0';
                notificationBadge.style.display = 'none';
            }
            if (notificationInterval) clearInterval(notificationInterval);
            if (notificationHideTimeout) clearTimeout(notificationHideTimeout);
            // position panel relative to bubble; respect manual move
            if (!panelManual) {
                const rect = bubble.getBoundingClientRect();
                let left = rect.left + 60;
                let top = rect.top + 10;
                // clamp within viewport
                const pw = panel.offsetWidth;
                const ph = panel.offsetHeight;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                if (left + pw > vw - 10) left = vw - pw - 10;
                if (top + ph > vh - 10) top = vh - ph - 10;
                if (left < 10) left = 10;
                if (top < 10) top = 10;
                panel.style.left = left + 'px';
                panel.style.top = top + 'px';
            }
        } else {
            // Desbloquear scroll del body
            enableBodyScroll();
            
            // just closed: reset manual flag so next open repositions
            panelManual = false;
            if (bubble) bubble.style.visibility = 'visible';
            startNotificationRotation();
            // show first notification immediately when panel closes
            updateNotification();
        }
    }

    async function loadData() {
        const resp = await fetch('Json/my_data.json');
        if (!resp.ok) throw new Error('no data');
        return await resp.json();
    }

    function computeStats(data) {
        const totalOrders = Array.isArray(data) ? data.length : 0;
        const customerMap = {};
        const itemMap = {};
        let totalItems = 0;
        let totalRevenue = 0;
        let uniqueCustomers = new Set();
        
        (data || []).forEach(order => {
            const name = order.nombre_comprador || 'Desconocido';
            const orderTotal = parseFloat(order.precio_compra_total) || 0;
            
            uniqueCustomers.add(name);
            totalRevenue += orderTotal;
            
            if (!customerMap[name]) {
                customerMap[name] = {name, orders: 0, spent: 0};
            }
            customerMap[name].orders++;
            customerMap[name].spent += orderTotal;
            if (Array.isArray(order.compras)) {
                order.compras.forEach(item => {
                    const key = item.name || 'Sin nombre';
                    if (!itemMap[key]) {
                        itemMap[key] = {name: key, qty: 0, revenue: 0};
                    }
                    const q = parseFloat(item.quantity) || 0;
                    const p = parseFloat(item.unitPrice) || 0;
                    itemMap[key].qty += q;
                    itemMap[key].revenue += (q * p);
                    totalItems += q;
                });
            }
        });
        const topCustomers = Object.values(customerMap)
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 5);
        const topItems = Object.values(itemMap)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);
        const avgOrderValue = totalOrders ? (totalRevenue / totalOrders).toFixed(2) : 0;
        const avgItemsPerOrder = totalOrders ? (totalItems / totalOrders).toFixed(2) : 0;
        const uniqueCount = uniqueCustomers.size;
        return {
            totalOrders,
            totalItems,
            totalRevenue,
            avgItemsPerOrder,
            avgOrderValue,
            uniqueCustomers: uniqueCount,
            topCustomers,
            topItems
        };
    }

    function renderStats(stats) {
        if (!panel) return;
        const content = panel.querySelector('.content');
        if (!content) return;
        
        const formatNumber = (num) => {
            if (!num && num !== 0) return '0';
            return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        };
        
        const formatCurrency = (num) => {
            if (!num && num !== 0) return '$0';
            return '$' + formatNumber(Math.round(num));
        };
        
        // clear previous
        content.innerHTML = '';
        
        // hero card: Total revenue - CORRECTED
        const revenueCard = document.createElement('div');
        revenueCard.style.cssText = 'background: linear-gradient(135deg, #f39c12, #e67e22); color: #fff; padding: 1.2rem; border-radius: 10px; text-align: center; margin-bottom: 1.5rem; box-shadow: 0 4px 15px rgba(243, 156, 18, 0.3);';
        revenueCard.innerHTML = `
            <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.95; margin-bottom: 0.6rem; font-weight: 600;">💰 Ingresos Totales</div>
            <div style="font-size: 1.8rem; font-weight: 800; letter-spacing: -0.5px;">${formatCurrency(stats.totalRevenue)}</div>
        `;
        content.appendChild(revenueCard);
        
        // Key metrics grid
        const metricsGrid = document.createElement('div');
        metricsGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin-bottom: 1.5rem;';
        metricsGrid.innerHTML = `
            <div style="background: linear-gradient(135deg, #e3f2fd, #bbdefb); padding: 0.9rem; border-radius: 8px; border-left: 4px solid #1976d2; text-align: center;">
                <div style="font-size: 0.7rem; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 0.3rem;">Pedidos</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #1976d2;">${formatNumber(stats.totalOrders)}</div>
            </div>
            <div style="background: linear-gradient(135deg, #e8f5e9, #c8e6c9); padding: 0.9rem; border-radius: 8px; border-left: 4px solid #388e3c; text-align: center;">
                <div style="font-size: 0.7rem; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 0.3rem;">Clientes</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #388e3c;">${formatNumber(stats.uniqueCustomers)}</div>
            </div>
            <div style="background: linear-gradient(135deg, #f3e5f5, #e1bee7); padding: 0.9rem; border-radius: 8px; border-left: 4px solid #7b1fa2; text-align: center;">
                <div style="font-size: 0.7rem; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 0.3rem;">Items</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #7b1fa2;">${formatNumber(stats.totalItems)}</div>
            </div>
            <div style="background: linear-gradient(135deg, #fff3e0, #ffe0b2); padding: 0.9rem; border-radius: 8px; border-left: 4px solid #f57c00; text-align: center;">
                <div style="font-size: 0.7rem; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 0.3rem;">Prom. Pedido</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: #f57c00;">${formatCurrency(stats.avgOrderValue)}</div>
            </div>
        `;
        content.appendChild(metricsGrid);
        
        // Average metrics section
        const avgSection = document.createElement('div');
        avgSection.style.cssText = 'background: #f9fafb; padding: 0.9rem; border-radius: 8px; margin-bottom: 1.5rem; border-left: 4px solid #5e35b1; font-size: 0.85rem;';
        avgSection.innerHTML = `
            <div style="margin-bottom: 0.6rem;"><strong style="color: #5e35b1;">📈 Items/Pedido:</strong> <span style="color: #333; font-weight: 600;">${stats.avgItemsPerOrder}</span></div>
            <div style="margin-bottom: 0.6rem;"><strong style="color: #5e35b1;">💳 Valor Prom.:</strong> <span style="color: #333; font-weight: 600;">${formatCurrency(stats.avgOrderValue)}</span></div>
            <div><strong style="color: #5e35b1;">👤 Pedidos/Cliente:</strong> <span style="color: #333; font-weight: 600;">${(stats.totalOrders / stats.uniqueCustomers).toFixed(2)}</span></div>
        `;
        content.appendChild(avgSection);

        // Top Customers
        if (stats.topCustomers && stats.topCustomers.length > 0) {
            const h = document.createElement('h4');
            h.textContent = '🥇 Clientes Top';
            content.appendChild(h);
            const ul = document.createElement('ul');
            ul.className = 'summary-list';
            stats.topCustomers.forEach((c, idx) => {
                const li = document.createElement('li');
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx === 3 ? '4️⃣' : '5️⃣';
                li.innerHTML = `<strong>${medal} ${c.name}</strong><span style="font-size: 0.75rem; color: #999;">${formatCurrency(c.spent)} • ${c.orders} ped.</span>`;
                ul.appendChild(li);
            });
            content.appendChild(ul);
        }
        
        // Top Products
        if (stats.topItems && stats.topItems.length > 0) {
            const h = document.createElement('h4');
            h.textContent = '⭐ Productos Top';
            content.appendChild(h);
            const ul = document.createElement('ul');
            ul.className = 'summary-list';
            stats.topItems.forEach((i, idx) => {
                const li = document.createElement('li');
                const star = idx === 0 ? '⭐' : idx === 1 ? '✨' : idx === 2 ? '🌟' : idx === 3 ? '💫' : '◆';
                li.innerHTML = `<strong>${star} ${i.name}</strong><span style="font-size: 0.75rem; color: #999;">${formatNumber(i.qty)} u. • ${formatCurrency(i.revenue)}</span>`;
                ul.appendChild(li);
            });
            content.appendChild(ul);
        }
    }

    return { init };
})();

// auto-run on page load
window.addEventListener('DOMContentLoaded', () => {
    try { SummaryBot.init(); } catch (e) { console.error('SummaryBot load error', e); }
});
