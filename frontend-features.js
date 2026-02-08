/**
 * Frontend Features for Index.html
 * Handles: Popup System, Search/Filter, Section-based Product Display, Theme Integration
 */

import { getFirestore, collection, getDocs, query, where, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

export class FrontendFeatures {
    constructor(app) {
        this.db = getFirestore(app);
        this.allProducts = [];
        this.activeFilters = [];
        this.currentPopupId = null;
    }

    async init() {
        await this.initThemeEngine();
        await this.loadPopupSystem();
        await this.initSearchAndFilter();
        await this.loadProductsWithSections();
    }

    async initThemeEngine() {
        if (window.ThemeEngine) {
            const themeEngine = new window.ThemeEngine(this.db);
            await themeEngine.init();
        }
    }

    async loadPopupSystem() {
        try {
            const popupsSnapshot = await getDocs(
                query(collection(this.db, "popups"), where("active", "==", true), orderBy("priority", "asc"))
            );

            if (popupsSnapshot.empty) return;

            const popupDoc = popupsSnapshot.docs[0];
            const popup = popupDoc.data();
            this.currentPopupId = popupDoc.id;

            // Check date range
            if (popup.startDate || popup.endDate) {
                const now = new Date();
                if (popup.startDate && new Date(popup.startDate) > now) return;
                if (popup.endDate && new Date(popup.endDate) < now) return;
            }

            // Check frequency
            const dismissedKey = `popup_${this.currentPopupId}_dismissed`;
            const lastShownKey = `popup_${this.currentPopupId}_lastShown`;

            if (popup.frequency === 'once' && localStorage.getItem(dismissedKey)) return;

            if (popup.frequency === 'session' && sessionStorage.getItem(dismissedKey)) return;

            if (popup.frequency === 'daily') {
                const lastShown = localStorage.getItem(lastShownKey);
                if (lastShown) {
                    const lastDate = new Date(parseInt(lastShown));
                    const now = new Date();
                    if (lastDate.toDateString() === now.toDateString()) return;
                }
            }

            // Create and show popup
            this.showPopup(popup);

            // Track display
            if (popup.frequency === 'daily') {
                localStorage.setItem(lastShownKey, Date.now().toString());
            } else if (popup.frequency === 'session') {
                sessionStorage.setItem(dismissedKey, 'true');
            }
        } catch (error) {
            console.error('Error loading popup:', error);
        }
    }

    showPopup(popup) {
        // Create popup if doesn't exist
        if (!document.getElementById('info-popup')) {
            const popupHtml = `
        <div id="info-popup" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div class="w-full max-w-md rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20"></div>
            <div class="relative bg-slate-900/90 backdrop-blur-xl p-8">
              <button onclick="window.closePopup()" class="absolute top-4 right-4 text-white/60 hover:text-white text-2xl leading-none">&times;</button>
              <div id="popup-content-area"></div>
            </div>
          </div>
        </div>
      `;
            document.body.insertAdjacentHTML('beforeend', popupHtml);
        }

        const typeIcons = {
            coupon: '🎁',
            announcement: '📢',
            warning: '⚠️',
            info: 'ℹ️'
        };
        const icon = typeIcons[popup.type] || typeIcons.info;

        const contentArea = document.getElementById('popup-content-area');
        contentArea.innerHTML = `
      <div class="text-center mb-4 text-4xl">${icon}</div>
      <h2 class="text-2xl font-bold mb-4 text-center">${popup.title}</h2>
      <div class="text-slate-200 whitespace-pre-line text-sm leading-relaxed">${popup.content}</div>
    `;

        document.getElementById('info-popup').classList.remove('hidden');
        document.getElementById('info-popup').classList.add('flex');
    }

    closePopup() {
        const popupEl = document.getElementById('info-popup');
        if (popupEl) {
            popupEl.classList.add('hidden');
            popupEl.classList.remove('flex');
        }

        // Mark as dismissed if once frequency
        if (this.currentPopupId) {
            getDocs(query(collection(this.db, "popups"), where("active", "==", true)))
                .then(snapshot => {
                    const popupDoc = snapshot.docs.find(d => d.id === this.currentPopupId);
                    if (popupDoc && popupDoc.data().frequency === 'once') {
                        localStorage.setItem(`popup_${this.currentPopupId}_dismissed`, 'true');
                    }
                });
        }
    }

    async initSearchAndFilter() {
        const searchInput = document.getElementById('product-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterProducts());
        }
    }

    async loadProductsWithSections() {
        try {
            // Load all products
            const productsSnapshot = await getDocs(collection(this.db, "products"));
            this.allProducts = [];
            productsSnapshot.forEach(doc => {
                this.allProducts.push({ id: doc.id, ...doc.data() });
            });

            // Generate filter tags
            this.generateFilterTags();

            // Load sections
            const sectionsSnapshot = await getDocs(
                query(collection(this.db, "sections"), where("enabled", "==", true), orderBy("order", "asc"))
            );
            const sections = [];
            sectionsSnapshot.forEach(doc => sections.push({ id: doc.id, ...doc.data() }));

            // Render
            this.renderProductsWithSections(sections, this.allProducts);
        } catch (error) {
            console.error('Error loading products:', error);
        }
    }

    generateFilterTags() {
        const tags = new Set();
        this.allProducts.forEach(p => {
            if (p.tag) {
                p.tag.split(',').forEach(t => tags.add(t.trim()));
            }
        });

        const container = document.getElementById('filter-tags');
        if (!container) return;

        container.innerHTML = '';
        tags.forEach(tag => {
            const btn = document.createElement('button');
            btn.className = 'px-3 py-1.5 rounded-full text-xs border border-white/20 bg-white/5 hover:bg-white/10 transition';
            btn.textContent = tag;
            btn.dataset.tag = tag;
            btn.onclick = () => this.toggleFilter(tag);
            container.appendChild(btn);
        });
    }

    toggleFilter(tag) {
        const btn = document.querySelector(`[data-tag="${tag}"]`);
        if (!btn) return;

        if (this.activeFilters.includes(tag)) {
            this.activeFilters = this.activeFilters.filter(t => t !== tag);
            btn.classList.remove('bg-indigo-500', 'border-indigo-500', 'text-white');
            btn.classList.add('bg-white/5', 'border-white/20');
        } else {
            this.activeFilters.push(tag);
            btn.classList.add('bg-indigo-500', 'border-indigo-500', 'text-white');
            btn.classList.remove('bg-white/5', 'border-white/20');
        }
        this.filterProducts();
    }

    async filterProducts() {
        const searchInput = document.getElementById('product-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        let filtered = this.allProducts;

        if (searchTerm) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                (p.description && p.description.toLowerCase().includes(searchTerm)) ||
                (p.tag && p.tag.toLowerCase().includes(searchTerm))
            );
        }

        if (this.activeFilters.length > 0) {
            filtered = filtered.filter(p => {
                const productTags = p.tag ? p.tag.split(',').map(t => t.trim()) : [];
                return this.activeFilters.some(f => productTags.includes(f));
            });
        }

        // Re-render with filtered products
        const sectionsSnapshot = await getDocs(
            query(collection(this.db, "sections"), where("enabled", "==", true), orderBy("order", "asc"))
        );
        const sections = [];
        sectionsSnapshot.forEach(doc => sections.push({ id: doc.id, ...doc.data() }));
        this.renderProductsWithSections(sections, filtered);
    }

    renderProductsWithSections(sections, products) {
        const productsGrid = document.getElementById('products-grid');
        if (!productsGrid) return;

        productsGrid.innerHTML = '';

        if (products.length === 0) {
            productsGrid.innerHTML = '<div class="col-span-full text-center py-10 text-slate-400">Tidak ada produk ditemukan.</div>';
            return;
        }

        // Group products by section
        sections.forEach(section => {
            const sectionProducts = products
                .filter(p => p.section === section.id)
                .sort((a, b) => (a.order || 0) - (b.order || 0));

            if (sectionProducts.length > 0) {
                const sectionDiv = document.createElement('div');
                sectionDiv.className = 'col-span-full mb-8';
                sectionDiv.innerHTML = `
          <h3 class="text-xl font-bold mb-2">${section.name}</h3>
          ${section.description ? `<p class="text-sm text-slate-400 mb-4">${section.description}</p>` : ''}
        `;

                const sectionGrid = document.createElement('div');
                sectionGrid.className = 'grid gap-5 md:grid-cols-3';

                sectionProducts.forEach(product => {
                    sectionGrid.innerHTML += this.renderProductCard(product);
                });

                sectionDiv.appendChild(sectionGrid);
                productsGrid.appendChild(sectionDiv);
            }
        });

        // Products without section
        const noSectionProducts = products
            .filter(p => !p.section)
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        if (noSectionProducts.length > 0) {
            const grid = document.createElement('div');
            grid.className = 'col-span-full grid gap-5 md:grid-cols-3';

            noSectionProducts.forEach(product => {
                grid.innerHTML += this.renderProductCard(product);
            });

            productsGrid.appendChild(grid);
        }
    }

    renderProductCard(data) {
        const imgHtml = data.image
            ? `<div class="aspect-video overflow-hidden rounded-2xl bg-white/5 mb-3"><img src="${data.image}" alt="${data.name}" class="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"></div>`
            : `<div class="aspect-video rounded-2xl bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 mb-3 flex items-center justify-center"><svg class="w-12 h-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>`;

        let tagsContent = '';
        if (data.tag) {
            data.tag.split(',').forEach(tag => {
                const t = tag.trim();
                if (t && t !== 'Normal') {
                    tagsContent += `<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">${t}</span>`;
                }
            });
        }

        let stockCount = 0;
        if (data.hasVariants && Array.isArray(data.variants)) {
            stockCount = data.variants.reduce((acc, v) => acc + (v.stockItems ? v.stockItems.length : 0), 0);
        } else {
            stockCount = Array.isArray(data.stockItems) ? data.stockItems.length : 0;
        }

        let stockHtml = '';
        if (stockCount === 0) {
            stockHtml = `<span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-500">Sold Out</span>`;
        } else if (stockCount <= 5) {
            stockHtml = `<span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-red-500/10 text-red-400">${stockCount} left</span>`;
        } else if (stockCount <= 10) {
            stockHtml = `<span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400">${stockCount} left</span>`;
        } else {
            stockHtml = `<span class="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400">In Stock</span>`;
        }

        let priceHtml = '';
        if (data.hasVariants && Array.isArray(data.variants)) {
            const prices = data.variants.map(v => v.price).sort((a, b) => a - b);
            if (prices.length > 0) {
                priceHtml = `<p class="text-xl font-bold">Rp ${new Intl.NumberFormat("id-ID").format(prices[0])}+</p>`;
            }
        } else {
            priceHtml = `<p class="text-xl font-bold">Rp ${new Intl.NumberFormat("id-ID").format(data.price)}</p>`;
        }

        return `
      <a href="detail-product.html?id=${data.id}" class="block rounded-3xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition-all duration-300 hover:border-white/20 hover:-translate-y-1 group">
        <div class="flex flex-col h-full">
          ${imgHtml}
          <div class="mb-2 flex justify-between items-start gap-2">
            <div class="flex flex-wrap gap-2">${tagsContent}</div>
            ${stockHtml}
          </div>
          <h3 class="font-semibold text-lg group-hover:text-indigo-300 transition mt-1">${data.name}</h3>
          <div class="mt-4 pt-4 border-t border-white/5">
            ${priceHtml}
          </div>
        </div>
      </a>
    `;
    }
}

// Global close popup function
window.closePopup = function () {
    const frontendFeatures = window._frontendFeatures;
    if (frontendFeatures) {
        frontendFeatures.closePopup();
    }
};
