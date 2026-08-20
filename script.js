/* ============================================================
   Rio Trading — Wholesale Catalogue  |  script.js
   All logic: catalogue, cart, Apps Script orders, PDF download
   ============================================================ */

/* ---- CONFIG ---- */
/* Edit these values to connect the live catalogue and order service */
const CONFIG = {
  SHEET_CSV_URL:       'https://docs.google.com/spreadsheets/d/e/2PACX-1vTHJ1bpsYx0uAhGPyX1y3gxb7Xrf6n-hGY6BQS6hhEUTNCx0aA3qBX2KZDdNaFSxDtjv8Oji4JqKlxU/pub?gid=1147224303&single=true&output=csv', // Google Sheets published CSV URL
  ORDER_API_URL:       'https://script.google.com/macros/s/AKfycbzqdonNNlrbyAfF25CnGY4TdhXxstOgDp77PGeGLfaIe-0RHuXerbqpvweSfPwSNI7c/exec',
  BUSINESS_NAME:       'Rio Trading',
  BUSINESS_TAGLINE:    'Wholesale Catalogue',
};

/* ---- SUBCATEGORY MAP ---- */
/* Maps parent category name → array of subcategory labels */
const SUBCATEGORIES = {
  'Grocery & Essentials': ['English', 'Asian'],
  'Snacks': ['Biscuits', 'Cakes & Bakery', 'Crisps'],
};

/* Image map — Unsplash URLs per product id */
const PRODUCT_IMAGES = {
  '1':  'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80',
  '2':  'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80',
  '3':  'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&q=80',
  '4':  'https://images.unsplash.com/photo-1534483509719-3feaee7c30da?w=400&q=80',
  '5':  'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=80',
  '6':  'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=400&q=80',
  '7':  'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=400&q=80',
  '8':  'https://images.unsplash.com/photo-1481391319762-47dff72954d9?w=400&q=80',
  '9':  'https://images.unsplash.com/photo-1582058091505-f87a2e55a40f?w=400&q=80',
  '10': 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=400&q=80',
  '11': 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&q=80',
  '12': 'https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&q=80',
  '13': 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80',
  '14': 'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&q=80',
  '15': 'https://images.unsplash.com/photo-1574158622682-e40e69881006?w=400&q=80',
  '16': 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80',
  '17': 'https://images.unsplash.com/photo-1563729784474-d77dbb933a9e?w=400&q=80',
  '18': 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=400&q=80',
};
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80';

/* ============================================================
   STATE
   ============================================================ */
let allProducts = [];
let cart = {};
let discounts = {};
let orderDiscount = null;
let activeCategory    = 'all';
let activeSubcategory = 'all';
let searchQuery       = '';
let lastOrderData     = null;
let catalogueState    = 'idle'; // idle | loading | ready | error
let catalogueRequest  = 0;

/* ============================================================
   DOM REFERENCES
   ============================================================ */
const productGrid       = document.getElementById('productGrid');
const emptyState        = document.getElementById('emptyState');
const searchInput       = document.getElementById('searchInput');
const categoryPills     = document.getElementById('categoryPills');
const subcategoryPills  = document.getElementById('subcategoryPills');
const cartIconBtn       = document.getElementById('cartIconBtn');
const cartIconCount     = document.getElementById('cartIconCount');
const cartPillTotal     = document.getElementById('cartPillTotal');
const cartPillIcon      = document.getElementById('cartPillIcon');
const brandLogoBtn      = document.getElementById('brandLogoBtn');
const drawerBackdrop    = document.getElementById('drawerBackdrop');
const orderDrawer       = document.getElementById('orderDrawer');
const drawerClose       = document.getElementById('drawerClose');
const drawerSubtitle    = document.getElementById('drawerSubtitle');
const drawerBody        = document.getElementById('drawerBody');
const drawerEmpty       = document.getElementById('drawerEmpty');
const drawerTotal       = document.getElementById('drawerTotal');
const proceedBtn        = document.getElementById('proceedBtn');
const formDrawer        = document.getElementById('formDrawer');
const formDrawerClose   = document.getElementById('formDrawerClose');
const backToReviewBtn   = document.getElementById('backToReviewBtn');
const sendOrderBtn      = document.getElementById('sendOrderBtn');
const orderForm         = document.getElementById('orderForm');
const resultDrawer      = document.getElementById('resultDrawer');
const resultDrawerClose = document.getElementById('resultDrawerClose');
const resultTitle       = document.getElementById('resultTitle');
const resultBody        = document.getElementById('resultBody');
const resultFooter      = document.getElementById('resultFooter');
const catalogueMain     = document.getElementById('catalogueMain');
const catalogueLoading  = document.getElementById('catalogueLoading');
const catalogueError    = document.getElementById('catalogueError');
const catalogueRetryBtn = document.getElementById('catalogueRetryBtn');

/* ============================================================
   CATALOGUE AVAILABILITY
   ============================================================ */
function setCatalogueState(nextState) {
  catalogueState = nextState;
  const ready   = nextState === 'ready';
  const loading = nextState === 'loading';

  catalogueMain.setAttribute('aria-busy', String(loading));
  catalogueLoading.classList.toggle('hidden', !loading);
  catalogueError.classList.toggle('hidden', nextState !== 'error');
  productGrid.classList.toggle('hidden', !ready);
  if (!ready) emptyState.classList.add('hidden');

  searchInput.disabled  = !ready;
  cartIconBtn.disabled  = !ready;
  proceedBtn.disabled   = !ready || !hasValidCartItems();
  sendOrderBtn.disabled = !ready;
  categoryPills.querySelectorAll('.pill').forEach(btn => { btn.disabled = !ready; });
  subcategoryPills.querySelectorAll('.pill').forEach(btn => { btn.disabled = !ready; });

  if (!ready) {
    cartPillTotal.textContent = '\u2014';
    cartIconCount.classList.add('hidden');
  }
}

/* ============================================================
   CART PERSISTENCE
   ============================================================ */
function saveCart() {
  localStorage.setItem('rioTradingCart', JSON.stringify({ cart, discounts, orderDiscount }));
}

function normaliseStoredOrderDiscount(discount) {
  if (!discount || typeof discount !== 'object') return null;
  if (discount.mode !== 'pct' && discount.mode !== 'fixed') return null;

  let value = Number(discount.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (discount.mode === 'pct') value = Math.min(100, value);
  if (discount.mode === 'fixed') {
    value = RioMoney.fromPence(Math.max(0, RioMoney.toPence(value)));
  }
  return value > 0 ? { mode: discount.mode, value } : null;
}

function loadCart() {
  try {
    const saved = localStorage.getItem('rioTradingCart');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.cart === 'object') {
        cart          = parsed.cart      || {};
        discounts     = parsed.discounts || {};
        orderDiscount = normaliseStoredOrderDiscount(parsed.orderDiscount);

        /* Migrate percentage-only carts saved by earlier app versions. */
        if (!orderDiscount && Number(parsed.orderDiscountPct) > 0) {
          orderDiscount = {
            mode: 'pct',
            value: Math.min(100, Number(parsed.orderDiscountPct)),
          };
        }
      } else {
        cart          = parsed || {};
        discounts     = {};
        orderDiscount = null;
      }
    }
  } catch (e) {
    cart = {}; discounts = {}; orderDiscount = null;
  }
}

/* ============================================================
   CART CALCULATIONS
   ============================================================ */
function getValidCartEntries() {
  return Object.entries(cart).flatMap(([id, rawQty]) => {
    const product = allProducts.find(p => p.id === id);
    const qty = Number(rawQty);
    return product && Number.isInteger(qty) && qty > 0 ? [{ product, qty }] : [];
  });
}

function hasValidCartItems() {
  return getValidCartEntries().length > 0;
}

function reconcileCartWithCatalogue() {
  let changed = false;
  const validProductIds = new Set(allProducts.map(product => product.id));

  Object.entries(cart).forEach(([id, rawQty]) => {
    const qty = Number(rawQty);
    if (!validProductIds.has(id) || !Number.isInteger(qty) || qty < 1) {
      delete cart[id];
      delete discounts[id];
      changed = true;
    } else if (cart[id] !== qty) {
      cart[id] = qty;
      changed = true;
    }
  });

  Object.keys(discounts).forEach(id => {
    if (!Object.prototype.hasOwnProperty.call(cart, id)) {
      delete discounts[id];
      changed = true;
    }
  });

  if (changed) saveCart();
}

function cartItemCount() {
  return getValidCartEntries().reduce((sum, entry) => sum + entry.qty, 0);
}

function calculateCartLine(product, quantity) {
  return RioMoney.calculateLine(
    product.pricePence,
    quantity,
    discounts[product.id]
  );
}

function calculateCartTotals() {
  const lines = getValidCartEntries().map(({ product, qty }) =>
    calculateCartLine(product, qty)
  );
  return RioMoney.calculateOrder(lines, orderDiscount);
}

function cartSubtotalBeforeOrderDiscount() {
  const lines = getValidCartEntries().map(({ product, qty }) =>
    calculateCartLine(product, qty)
  );
  return RioMoney.calculateOrder(lines, null).subtotalPence;
}

function formatDiscountLabel(d) {
  if (!d || !d.value) return '+ Discount';
  return d.mode === 'pct'
    ? d.value + '% off'
    : RioMoney.formatPence(RioMoney.toPence(d.value)) + ' off';
}

/* Format a number as GBP */
function fmt(n) {
  return RioMoney.formatPence(RioMoney.toPence(n));
}

function fmtPence(pence) {
  return RioMoney.formatPence(pence);
}

function getDiscountValidationResult(rawValue, mode, maxPence, maximumMessage) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { valid: true, value: 0, error: '' };

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return { valid: false, value: 0, error: 'Enter a valid discount value.' };
  }
  if (value < 0) {
    return { valid: false, value: 0, error: 'Discount cannot be negative.' };
  }
  if (mode === 'pct') {
    if (value > 100) {
      return { valid: false, value: 0, error: 'Enter a percentage from 0 to 100.' };
    }
    return { valid: true, value, error: '' };
  }

  const valuePence = RioMoney.toPence(value);
  if (valuePence > maxPence) {
    return { valid: false, value: 0, error: maximumMessage };
  }
  return { valid: true, value: RioMoney.fromPence(valuePence), error: '' };
}

function setDiscountInputError(input, errorElement, message) {
  const hasError = Boolean(message);
  input.classList.toggle('discount-input--invalid', hasError);
  input.setAttribute('aria-invalid', String(hasError));
  if (!errorElement) return;
  errorElement.textContent = message || '';
  errorElement.classList.toggle('hidden', !hasError);
}

function validateDiscountField(input, errorElement, mode, maxPence, maximumMessage) {
  const hasBadInput = Boolean(input.validity && input.validity.badInput);
  const result = hasBadInput
    ? { valid: false, value: 0, error: 'Enter a valid discount value.' }
    : getDiscountValidationResult(input.value, mode, maxPence, maximumMessage);
  setDiscountInputError(input, errorElement, result.error);
  return result;
}

function hasDiscountValidationErrors() {
  return Boolean(document.querySelector('.discount-input--invalid'));
}

function validateOrderDiscountInput() {
  const input = document.getElementById('orderDiscInput');
  const errorElement = document.getElementById('orderDiscError');
  const activeModeButton = document.querySelector('.order-disc-mode-btn.active');
  const mode = activeModeButton && activeModeButton.dataset.mode === 'fixed' ? 'fixed' : 'pct';
  const subtotalPence = cartSubtotalBeforeOrderDiscount();

  if (mode === 'fixed') {
    input.max = RioMoney.fromPence(subtotalPence).toFixed(2);
  }

  return validateDiscountField(
    input,
    errorElement,
    mode,
    subtotalPence,
    'Maximum order discount is ' + fmtPence(subtotalPence) + '.'
  );
}

function formatDiscountedUnit(line) {
  const exactUnitPence = line.lineTotalPence / line.quantity;
  const approximate = !Number.isInteger(exactUnitPence);
  return (approximate ? '\u2248 ' : '') + fmtPence(Math.round(exactUnitPence));
}

function escapeHTML(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================================================
   PRODUCT LOADING
   ============================================================ */
async function loadProducts() {
  const requestId = ++catalogueRequest;
  setCatalogueState('loading');

  if (!CONFIG.SHEET_CSV_URL) {
    console.error('Catalogue configuration error: SHEET_CSV_URL is missing.');
    allProducts = [];
    if (requestId === catalogueRequest) setCatalogueState('error');
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const r = await fetch(CONFIG.SHEET_CSV_URL, { cache: 'no-store', signal: controller.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    const products = parseCSV(text);
    if (products.length === 0) throw new Error('Empty sheet');
    if (requestId !== catalogueRequest) return;
    allProducts = products;
    reconcileCartWithCatalogue();
    setCatalogueState('ready');
    renderGrid();
    updateCartUI();
  } catch (err) {
    if (requestId !== catalogueRequest) return;
    console.error('Catalogue load failed.', err);
    allProducts = [];
    setCatalogueState('error');
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCSV(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) throw new Error('Catalogue has no product rows');

  const headers = rows[0].map(h => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  const requiredHeaders = ['id', 'name', 'category', 'price'];
  const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
  if (missingHeaders.length) throw new Error('Missing catalogue columns: ' + missingHeaders.join(', '));

  const ids = new Set();
  const products = [];

  rows.slice(1).forEach((vals, rowIndex) => {
    if (vals.every(v => !v.trim())) return;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });

    /* Ignore a reserved ID row until actual product details are entered. */
    const hasProductDetails = ['name', 'category', 'price', 'unit', 'stock', 'image', 'active']
      .some(field => Boolean(obj[field]));
    if (!hasProductDetails) return;

    const activeValue = (obj.active || 'true').toLowerCase();
    if (activeValue === 'false' || activeValue === '0') return;
    if (!['true', '1', 'yes'].includes(activeValue)) {
      throw new Error('Invalid active value on catalogue row ' + (rowIndex + 2));
    }

    const id = obj.id;
    const price = Number(obj.price);
    if (!id || !obj.name || !obj.category) throw new Error('Missing required value on catalogue row ' + (rowIndex + 2));
    if (!Number.isFinite(price) || price <= 0) throw new Error('Invalid price on catalogue row ' + (rowIndex + 2));
    if (ids.has(id)) throw new Error('Duplicate product ID: ' + id);

    ids.add(id);
    products.push({ ...obj, id, price, pricePence: RioMoney.toPence(price) });
  });

  return products;
}

/* CSV reader supporting commas, escaped quotes and line breaks in quoted cells. */
function parseCSVRows(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += ch;
    }
  }

  if (inQuotes) throw new Error('Unclosed quoted value in catalogue CSV');
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ============================================================
   PRODUCT GRID
   ============================================================ */
function getFiltered() {
  return allProducts.filter(p => {
    if (activeCategory !== 'all' && p.category !== activeCategory) return false;
    if (activeSubcategory !== 'all' && p.subcategory !== activeSubcategory) return false;
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
}

function renderGrid() {
  const list = getFiltered();
  productGrid.innerHTML = '';

  if (list.length === 0) {
    emptyState.classList.remove('hidden');
    productGrid.classList.add('hidden');
    return;
  }
  emptyState.classList.add('hidden');
  productGrid.classList.remove('hidden');

  list.forEach(p => productGrid.appendChild(buildCard(p)));
}

function getImg(product) {
  if (product.image && product.image.startsWith('http')) return product.image;
  return PRODUCT_IMAGES[product.id] || FALLBACK_IMG;
}

function buildCard(product) {
  const qty    = cart[product.id] || 0;
  const inCart = qty > 0;
  const card   = document.createElement('div');
  card.className   = 'product-card';
  card.dataset.id  = product.id;

  card.innerHTML = `
    <div class="card-img-wrap">
      <img class="card-img" src="${getImg(product)}" alt="${product.name}" loading="lazy"
        onerror="this.src='${FALLBACK_IMG}'" />
      <span class="card-cat-badge">${product.category}</span>
      <span class="card-qty-badge${inCart ? '' : ' hidden'}">${qty}</span>
    </div>
    <div class="card-body">
      <div class="card-name">${product.name}</div>
      <div class="card-price">${fmtPence(product.pricePence)}</div>
      <div class="card-unit">per ${product.unit || 'unit'}</div>
      <div class="card-stock">${product.stock || 'In Stock'}</div>
    </div>
    <div class="card-footer">
      <button class="btn-add${inCart ? ' edit' : ''}" aria-label="${inCart ? 'Edit quantity' : 'Add to order'}">
        ${inCart ? 'Edit' : 'Add'}
      </button>
      <div class="stepper hidden">
        <button class="stepper-btn stepper-minus" aria-label="Decrease quantity">&minus;</button>
        <input class="stepper-input" type="number" min="1" value="${qty || 1}" aria-label="Quantity" />
        <button class="stepper-btn stepper-plus" aria-label="Increase quantity">+</button>
        <button class="stepper-confirm" aria-label="Confirm quantity">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <button class="stepper-remove" aria-label="Remove item from order">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
        </button>
      </div>
    </div>`;

  wireCardEvents(card, product);
  return card;
}

function wireCardEvents(card, product) {
  const addBtn  = card.querySelector('.btn-add');
  const stepper = card.querySelector('.stepper');
  const minus   = card.querySelector('.stepper-minus');
  const plus    = card.querySelector('.stepper-plus');
  const input   = card.querySelector('.stepper-input');
  const confirm = card.querySelector('.stepper-confirm');
  const remove  = card.querySelector('.stepper-remove');

  function closeStepper() {
    stepper.classList.add('hidden');
    addBtn.classList.remove('hidden');
  }

  /* Show stepper */
  addBtn.addEventListener('click', () => {
    addBtn.classList.add('hidden');
    stepper.classList.remove('hidden');
    input.value = cart[product.id] || 1;
    input.focus();
    input.select();
  });

  minus.addEventListener('click', () => {
    const v = parseInt(input.value,10) || 1;
    input.value = Math.max(1, v - 1);
  });

  plus.addEventListener('click', () => {
    input.value = (parseInt(input.value,10) || 1) + 1;
  });

  input.addEventListener('input', () => {
    const v = parseInt(input.value,10);
    if (isNaN(v) || v < 1) input.value = 1;
  });

  confirm.addEventListener('click', () => {
    const qty = parseInt(input.value,10) || 1;
    cart[product.id] = qty;
    saveCart();
    updateCartUI();
    closeStepper();
    syncCardBtn(product.id);
  });

  remove.addEventListener('click', () => {
    delete cart[product.id];
    delete discounts[product.id];
    saveCart();
    updateCartUI();
    closeStepper();
    syncCardBtn(product.id);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  confirm.click();
    if (e.key === 'Escape') closeStepper();
  });
}

/* ============================================================
   CART UI
   ============================================================ */
let prevCartCount = 0;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function bounceCartIcon() {
  if (prefersReducedMotion || !cartPillIcon) return;
  cartPillIcon.classList.remove('bounce-once');
  void cartPillIcon.offsetWidth; /* force reflow so the animation can re-trigger */
  cartPillIcon.classList.add('bounce-once');
}

function updateCartUI() {
  if (catalogueState !== 'ready') {
    cartPillTotal.textContent = '\u2014';
    cartIconCount.classList.add('hidden');
    return;
  }

  const count = cartItemCount();
  const total = calculateCartTotals().totalPence;

  cartPillTotal.textContent = fmtPence(total);

  if (count > 0) {
    cartIconCount.textContent = count;
    cartIconCount.classList.remove('hidden');
  } else {
    cartIconCount.classList.add('hidden');
  }

  proceedBtn.disabled = count === 0 || hasDiscountValidationErrors();

  if (count > prevCartCount) bounceCartIcon();
  prevCartCount = count;
}

/* ============================================================
   DRAWERS
   ============================================================ */
function openDrawer(drawer) {
  drawerBackdrop.classList.remove('hidden');
  drawer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeAll() {
  drawerBackdrop.classList.add('hidden');
  orderDrawer.classList.add('hidden');
  formDrawer.classList.add('hidden');
  resultDrawer.classList.add('hidden');
  document.body.style.overflow = '';
}

/* ---- Order Review Drawer ---- */
function openOrderDrawer() {
  renderOrderDrawer();
  openDrawer(orderDrawer);
}

function renderOrderDrawer() {
  /* Remove previous cart rows */
  Array.from(drawerBody.querySelectorAll('.cart-item-wrap')).forEach(el => el.remove());

  const count = cartItemCount();
  if (count === 0) {
    drawerEmpty.classList.remove('hidden');
  } else {
    drawerEmpty.classList.add('hidden');
    Object.entries(cart).forEach(([id, qty]) => {
      const p = allProducts.find(x => x.id === id);
      if (p) drawerBody.insertBefore(buildCartRow(p, qty), drawerEmpty);
    });
  }

  refreshDrawerTotals();
}

function buildCartRow(product, qty) {
  const wrap = document.createElement('div');
  wrap.className  = 'cart-item-wrap';
  wrap.dataset.id = product.id;

  /* ---- Product row ---- */
  const row = document.createElement('div');
  row.className = 'cart-item';
  const line0 = calculateCartLine(product, qty);
  row.innerHTML = `
    <img class="cart-item-img" src="${getImg(product)}" alt="${product.name}" loading="lazy"
      onerror="this.src='${FALLBACK_IMG}'" />
    <div class="cart-item-info">
      <div class="cart-item-name">${product.name}</div>
      <div class="cart-item-price-line">
        <span class="cart-item-orig-price">${fmtPence(product.pricePence)}</span>
        <span class="cart-item-disc-price"></span>
        <span class="cart-item-per-unit">/ ${product.unit || 'unit'}</span>
      </div>
    </div>
    <div class="stepper-compact">
      <button class="stepper-btn cart-minus" aria-label="Decrease">&minus;</button>
      <input class="stepper-input cart-qty" type="number" min="1" value="${qty}" aria-label="Quantity" />
      <button class="stepper-btn cart-plus" aria-label="Increase">+</button>
    </div>
    <span class="cart-item-line-total">${fmtPence(line0.lineTotalPence)}</span>
    <button class="cart-item-remove" aria-label="Remove item">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
    </button>`;

  /* ---- Discount trigger (appended into .cart-item-info) ---- */
  const existingDisc  = discounts[product.id];
  const hasDisc       = !!(existingDisc && existingDisc.value);
  const discTrigger   = document.createElement('button');
  discTrigger.className = 'disc-trigger' + (hasDisc ? ' disc-trigger--active' : '');
  discTrigger.setAttribute('aria-expanded', String(hasDisc));
  discTrigger.textContent = hasDisc ? formatDiscountLabel(existingDisc) : '+ Discount';
  row.querySelector('.cart-item-info').appendChild(discTrigger);

  /* ---- Discount row ---- */
  const initMode  = existingDisc ? existingDisc.mode  : 'pct';
  const initValue = existingDisc ? existingDisc.value : '';
  const discRow   = document.createElement('div');
  discRow.className = 'discount-row' + (hasDisc ? '' : ' discount-row--hidden');
  discRow.innerHTML = `
    <div class="discount-row-inner">
      <div class="discount-toggle-btns">
        <button class="disc-mode-btn${initMode === 'pct'   ? ' active' : ''}" data-mode="pct">%</button>
        <button class="disc-mode-btn${initMode === 'fixed' ? ' active' : ''}" data-mode="fixed">£</button>
      </div>
      <input class="disc-input" type="number" min="0" step="0.01"
        placeholder="${initMode === 'pct' ? '0–100' : '0.00'}"
        value="${initValue}" aria-label="Discount value" />
      <span class="disc-saving${hasDisc ? ' disc-saving--active' : ''}"></span>
      <button class="disc-clear" aria-label="Remove discount">&times;</button>
    </div>`;
  const discError = document.createElement('span');
  discError.className = 'discount-validation-error hidden';
  discError.setAttribute('role', 'status');
  discError.setAttribute('aria-live', 'polite');
  discRow.appendChild(discError);

  wrap.appendChild(row);
  wrap.appendChild(discRow);

  /* ---- DOM refs ---- */
  const minus      = row.querySelector('.cart-minus');
  const plus       = row.querySelector('.cart-plus');
  const qtyInput   = row.querySelector('.cart-qty');
  const lineTotal  = row.querySelector('.cart-item-line-total');
  const removeBtn  = row.querySelector('.cart-item-remove');
  const origPrice  = row.querySelector('.cart-item-orig-price');
  const discPrice  = row.querySelector('.cart-item-disc-price');
  const discInput  = discRow.querySelector('.disc-input');
  const discSaving = discRow.querySelector('.disc-saving');
  const discClear  = discRow.querySelector('.disc-clear');
  const modeBtns   = discRow.querySelectorAll('.disc-mode-btn');

  function setDiscountMode(mode) {
    const isPercentage = mode === 'pct';
    discInput.max = isPercentage ? '100' : RioMoney.fromPence(product.pricePence).toFixed(2);
    discInput.step = isPercentage ? '0.1' : '0.01';
    discInput.placeholder = isPercentage ? '0–100' : '0.00';
    discInput.setAttribute('aria-label', isPercentage ? 'Percentage item discount' : 'Fixed item discount');
  }
  setDiscountMode(initMode);

  /* Seed price line + saving text if discount already active on open */
  if (hasDisc && existingDisc) {
    discSaving.textContent = 'Saving: ' + fmtPence(line0.discountPence);
    origPrice.classList.add('cart-item-orig-price--struck');
    discPrice.textContent = '→ ' + formatDiscountedUnit(line0);
  }

  /* ---- refresh: qty change → update line total ---- */
  function refresh() {
    const q   = parseInt(qtyInput.value, 10) || 1;
    cart[product.id] = q;
    saveCart();
    const line = calculateCartLine(product, q);
    lineTotal.textContent = fmtPence(line.lineTotalPence);
    if (line.discountPence > 0) {
      discPrice.textContent = '→ ' + formatDiscountedUnit(line);
      discSaving.textContent = 'Saving: ' + fmtPence(line.discountPence);
    }
    refreshDrawerTotals();
    updateCartUI();
    syncCardBtn(product.id);
  }

  /* ---- refreshDiscount: discount input change ---- */
  function refreshDiscount() {
    const q      = parseInt(qtyInput.value, 10) || 1;
    const activeBtn = discRow.querySelector('.disc-mode-btn.active');
    const mode      = activeBtn ? activeBtn.dataset.mode : 'pct';
    const validation = validateDiscountField(
      discInput,
      discError,
      mode,
      product.pricePence,
      'Maximum discount for this item is ' + fmtPence(product.pricePence) + '.'
    );
    if (!validation.valid) {
      updateCartUI();
      return;
    }
    const val = validation.value;

    if (val > 0) {
      discounts[product.id] = { mode, value: val };
    } else {
      delete discounts[product.id];
    }
    saveCart();

    const line = calculateCartLine(product, q);
    lineTotal.textContent = fmtPence(line.lineTotalPence);

    const activeDisc = discounts[product.id];
    if (line.discountPence > 0 && activeDisc) {
      /* Price line: strike original, show discounted unit price */
      origPrice.classList.add('cart-item-orig-price--struck');
      discPrice.textContent = '→ ' + formatDiscountedUnit(line);
      discSaving.textContent = 'Saving: ' + fmtPence(line.discountPence);
      discSaving.classList.add('disc-saving--active');
    } else {
      origPrice.classList.remove('cart-item-orig-price--struck');
      discPrice.textContent = '';
      discSaving.textContent = '';
      discSaving.classList.remove('disc-saving--active');
    }

    discTrigger.textContent = activeDisc ? formatDiscountLabel(activeDisc) : '+ Discount';
    discTrigger.classList.toggle('disc-trigger--active', !!activeDisc);

    refreshDrawerTotals();
    updateCartUI();
  }

  /* ---- Qty stepper events ---- */
  minus.addEventListener('click', () => {
    const v = parseInt(qtyInput.value, 10) || 1;
    if (v > 1) { qtyInput.value = v - 1; refresh(); }
  });
  plus.addEventListener('click', () => {
    qtyInput.value = (parseInt(qtyInput.value, 10) || 1) + 1;
    refresh();
  });
  qtyInput.addEventListener('change', () => {
    const v = parseInt(qtyInput.value, 10);
    if (isNaN(v) || v < 1) qtyInput.value = 1;
    refresh();
  });

  /* ---- Discount trigger toggle ---- */
  discTrigger.addEventListener('click', () => {
    const isOpen = !discRow.classList.contains('discount-row--hidden');
    if (isOpen && discInput.classList.contains('discount-input--invalid')) {
      discInput.focus();
      return;
    }
    discRow.classList.toggle('discount-row--hidden', isOpen);
    discTrigger.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) discInput.focus();
  });

  /* ---- Mode toggle ---- */
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode;
      discounts[product.id] = { mode: newMode, value: 0 };
      discInput.value = '';
      setDiscountMode(newMode);
      modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === newMode));
      saveCart();
      refreshDiscount();
    });
  });

  /* ---- Discount input ---- */
  discInput.addEventListener('input', refreshDiscount);

  /* ---- Clear discount ---- */
  discClear.addEventListener('click', () => {
    delete discounts[product.id];
    discInput.value = '';
    setDiscountInputError(discInput, discError, '');
    origPrice.classList.remove('cart-item-orig-price--struck');
    discPrice.textContent = '';
    discSaving.textContent = '';
    discSaving.classList.remove('disc-saving--active');
    discTrigger.textContent = '+ Discount';
    discTrigger.classList.remove('disc-trigger--active');
    discRow.classList.add('discount-row--hidden');
    discTrigger.setAttribute('aria-expanded', 'false');
    const q   = parseInt(qtyInput.value, 10) || 1;
    lineTotal.textContent = fmtPence(product.pricePence * q);
    saveCart();
    refreshDrawerTotals();
    updateCartUI();
  });

  /* ---- Remove item ---- */
  removeBtn.addEventListener('click', () => {
    delete cart[product.id];
    delete discounts[product.id];
    saveCart();
    wrap.remove();
    refreshDrawerTotals();
    updateCartUI();
    syncCardBtn(product.id);
    if (cartItemCount() === 0) drawerEmpty.classList.remove('hidden');
  });

  if (hasDisc) refreshDiscount();

  return wrap;
}

function refreshDrawerTotals() {
  validateOrderDiscountInput();
  const count  = cartItemCount();
  const totals = calculateCartTotals();

  proceedBtn.disabled = count === 0 || hasDiscountValidationErrors();

  drawerSubtitle.textContent = count + ' item' + (count !== 1 ? 's' : '') + ' \u00B7 ' + fmtPence(totals.totalPence);
  drawerTotal.textContent    = fmtPence(totals.totalPence);

  if (totals.orderDiscountPence > 0) {
    document.getElementById('orderSubtotalRow').classList.remove('hidden');
    document.getElementById('orderSubtotalVal').textContent  = fmtPence(totals.subtotalPence);
    document.getElementById('orderDiscSaving').textContent   = '\u2212' + fmtPence(totals.orderDiscountPence);
    document.getElementById('orderDiscSaving').classList.remove('hidden');
    document.getElementById('drawerTotalLabel').textContent  = 'Total Payable';
  } else {
    document.getElementById('orderSubtotalRow').classList.add('hidden');
    document.getElementById('orderDiscSaving').classList.add('hidden');
    document.getElementById('drawerTotalLabel').textContent  = 'Order Total';
  }
}

function syncCardBtn(productId) {
  /* Sync Add/Edit button + qty badge on the catalogue card */
  const card = productGrid.querySelector('[data-id="' + productId + '"]');
  if (!card) return;
  const btn   = card.querySelector('.btn-add');
  const badge = card.querySelector('.card-qty-badge');
  const qty   = cart[productId] || 0;
  if (!btn) return;
  if (qty > 0) {
    btn.textContent = 'Edit';
    btn.classList.add('edit');
  } else {
    btn.textContent = 'Add';
    btn.classList.remove('edit');
  }
  if (badge) {
    badge.textContent = qty;
    badge.classList.toggle('hidden', qty === 0);
  }
}

/* ============================================================
   CATEGORY / SUBCATEGORY FILTERS
   ============================================================ */
function initCategoryPills() {
  categoryPills.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      categoryPills.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory    = btn.dataset.cat;
      activeSubcategory = 'all';

      const subs = SUBCATEGORIES[activeCategory];
      if (subs && subs.length) {
        buildSubcategoryPills(subs);
        subcategoryPills.classList.remove('hidden');
      } else {
        subcategoryPills.classList.add('hidden');
        subcategoryPills.innerHTML = '';
      }
      renderGrid();
    });
  });
}

function buildSubcategoryPills(subs) {
  subcategoryPills.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className    = 'pill active';
  allBtn.textContent  = 'All';
  allBtn.dataset.sub  = 'all';
  subcategoryPills.appendChild(allBtn);

  subs.forEach(sub => {
    const btn = document.createElement('button');
    btn.className   = 'pill';
    btn.textContent = sub;
    btn.dataset.sub = sub;
    subcategoryPills.appendChild(btn);
  });

  subcategoryPills.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      subcategoryPills.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSubcategory = btn.dataset.sub;
      renderGrid();
    });
  });
}

/* ============================================================
   SEARCH
   ============================================================ */
function initSearch() {
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    renderGrid();
  });
}

/* ---- Logo click: reset to the default landing view ---- */
function goHome() {
  if (searchInput.value) {
    searchInput.value = '';
    searchQuery = '';
  }
  const allPill = categoryPills.querySelector('.pill[data-cat="all"]');
  if (allPill) allPill.click(); /* reuses existing category-reset logic + renders grid */
  else renderGrid();
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
}

/* ============================================================
   PROMO BANNER SLIDER
   ============================================================ */
function initPromoSlider() {
  const track = document.getElementById('promoSliderTrack');
  const dotsWrap = document.getElementById('promoSliderDots');
  if (!track || !dotsWrap) return;

  const slides = Array.from(track.querySelectorAll('.promo-slide'));
  if (slides.length <= 1) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const AUTO_ADVANCE_MS = 5000;
  let current = 0;
  let autoTimer = null;
  let isSyncingScroll = false;

  const dots = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'promo-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', 'Go to banner ' + (i + 1));
    dot.addEventListener('click', () => goToSlide(i));
    dotsWrap.appendChild(dot);
    return dot;
  });

  function goToSlide(index) {
    current = (index + slides.length) % slides.length;
    isSyncingScroll = true;
    track.scrollTo({ left: current * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }

  function startAuto() {
    if (reduceMotion) return;
    stopAuto();
    autoTimer = setInterval(() => goToSlide(current + 1), AUTO_ADVANCE_MS);
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  }

  /* Keep dots in sync when the user manually swipes/scrolls the track */
  let scrollDebounce = null;
  track.addEventListener('scroll', () => {
    if (isSyncingScroll) { isSyncingScroll = false; return; }
    clearTimeout(scrollDebounce);
    scrollDebounce = setTimeout(() => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      current = Math.max(0, Math.min(slides.length - 1, idx));
      dots.forEach((d, i) => d.classList.toggle('active', i === current));
    }, 100);
  });

  track.addEventListener('mouseenter', stopAuto);
  track.addEventListener('mouseleave', startAuto);
  track.addEventListener('touchstart', stopAuto, { passive: true });
  track.addEventListener('touchend', startAuto, { passive: true });

  window.addEventListener('resize', () => {
    isSyncingScroll = true;
    track.scrollTo({ left: current * track.clientWidth, behavior: 'auto' });
  });

  startAuto();
}

/* ============================================================
   FORM VALIDATION
   ============================================================ */
function setFieldError(fieldId, errId, show) {
  const f = document.getElementById(fieldId);
  const e = document.getElementById(errId);
  if (show) { f.classList.add('invalid');    e.classList.remove('hidden'); }
  else      { f.classList.remove('invalid'); e.classList.add('hidden'); }
}

function validateForm() {
  let ok = true;
  const shopName    = document.getElementById('shopName').value.trim();
  const contactName = document.getElementById('contactName').value.trim();
  const phone       = document.getElementById('phone').value.trim();
  const email       = document.getElementById('email').value.trim();

  if (!shopName)    { setFieldError('shopName',    'shopNameErr',    true);  ok = false; }
  else               setFieldError('shopName',    'shopNameErr',    false);

  if (!contactName) { setFieldError('contactName', 'contactNameErr', true);  ok = false; }
  else               setFieldError('contactName', 'contactNameErr', false);

  const phoneClean = phone.replace(/\s/g,'');
  if (!phone || !/^(\+44|0)[0-9]{9,10}$/.test(phoneClean)) {
    setFieldError('phone', 'phoneErr', true);  ok = false;
  } else setFieldError('phone', 'phoneErr', false);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('email', 'emailErr', true);  ok = false;
  } else setFieldError('email', 'emailErr', false);

  return ok;
}

function initLiveValidation() {
  ['shopName','contactName','phone','email'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (document.getElementById(id).value.trim()) {
        document.getElementById(id).classList.remove('invalid');
        document.getElementById(id + 'Err').classList.add('hidden');
      }
    });
  });
}

/* ============================================================
   ORDER SUBMISSION
   ============================================================ */
async function submitOrder() {
  const validCartEntries = getValidCartEntries();
  if (validCartEntries.length === 0) {
    formDrawer.classList.add('hidden');
    openOrderDrawer();
    return;
  }

  if (!validateForm()) return;

  sendOrderBtn.disabled    = true;
  sendOrderBtn.textContent = 'Saving order\u2026';

  const shopName    = document.getElementById('shopName').value.trim();
  const contactName = document.getElementById('contactName').value.trim();
  const phone       = document.getElementById('phone').value.trim();
  const email       = document.getElementById('email').value.trim();
  const notes       = document.getElementById('notes').value.trim();

  const customer = { shopName, contactName, phone, email, notes };
  const fallbackItems = validCartEntries.map(({ product: p, qty }) => {
    const line = calculateCartLine(p, qty);
    const d    = discounts[p.id];
    return {
      name:          p.name,
      unit:          p.unit,
      qty,
      unitPrice:     RioMoney.fromPence(line.unitPricePence),
      discountAmt:   RioMoney.fromPence(line.discountPence),
      discountLabel: d && d.value ? formatDiscountLabel(d) : null,
      lineTotal:     RioMoney.fromPence(line.lineTotalPence),
    };
  });

  try {
    if (!window.RioOrderApi) throw new Error('The order service client did not load.');

    const orderDiscountValidation = validateOrderDiscountInput();
    if (!orderDiscountValidation.valid || hasDiscountValidationErrors()) {
      resetSendBtn();
      formDrawer.classList.add('hidden');
      openOrderDrawer();
      return;
    }
    const calculatedPreview = calculateCartTotals();
    const requestOrderDiscount = calculatedPreview.orderDiscountPence > 0
      ? {
          mode: calculatedPreview.orderDiscountMode,
          value: calculatedPreview.orderDiscountValue,
        }
      : null;
    const requestWithoutId = {
      contractVersion: 2,
      customer,
      items: validCartEntries
        .map(({ product, qty }) => ({
          productId: product.id,
          quantity: qty,
          discount: discounts[product.id] && discounts[product.id].value
            ? {
                mode: discounts[product.id].mode,
                value: Number(discounts[product.id].value),
              }
            : null,
        }))
        .sort((a, b) => a.productId.localeCompare(b.productId, undefined, { numeric: true })),
      orderDiscount: requestOrderDiscount,
    };
    const fingerprint = await RioOrderApi.fingerprintPayload(requestWithoutId);
    const submissionId = RioOrderApi.getOrCreateSubmissionId(fingerprint, localStorage);
    const response = await RioOrderApi.postOrder(CONFIG.ORDER_API_URL, {
      contractVersion: requestWithoutId.contractVersion,
      submissionId,
      customer: requestWithoutId.customer,
      items: requestWithoutId.items,
      orderDiscount: requestWithoutId.orderDiscount,
    });

    const orderData = RioOrderApi.toOrderData(response, customer, fallbackItems);
    lastOrderData = orderData;

    const messages = [];
    if (response.duplicate) {
      messages.push('This retry matched the order already saved under the same reference. No duplicate was created.');
    }
    if (response.emailStatus === 'Failed') {
      messages.push('The order is safely saved, but its owner email could not be sent. Check the Orders sheet for the permanent record.');
    } else if (response.emailStatus === 'Pending') {
      messages.push('The order is safely saved and its email is still being processed.');
    }

    clearCompletedOrder();
    resetSendBtn();
    showResult('success', orderData, messages.join(' '));
  } catch (err) {
    console.error('Order service error:', err);
    if (err && err.response && err.response.saved === false && window.RioOrderApi) {
      RioOrderApi.clearSubmission(localStorage);
    }
    resetSendBtn();
    showResult('error', null, err && err.message ? err.message : 'Unknown order service error');
  }
}

function resetSendBtn() {
  sendOrderBtn.disabled   = false;
  sendOrderBtn.innerHTML  = 'Send Order <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
}

/* ============================================================
   RESULT SCREEN
   ============================================================ */
function showResult(type, orderData, detail) {
  formDrawer.classList.add('hidden');
  resultDrawer.classList.remove('hidden');

  if (type === 'success') {
    const safeRef    = escapeHTML(orderData.orderRef);
    const safeShop   = escapeHTML(orderData.shopName);
    const safeDetail = escapeHTML(detail);
    resultTitle.textContent = 'Order Submitted';
    resultBody.innerHTML = `
      <div class="result-icon success">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="result-heading">Order Submitted Successfully!</div>
      <div class="result-ref">Order #${safeRef}</div>
      <div class="result-msg">Thank you for your order, ${safeShop}. We\u2019ll be in touch shortly to confirm your delivery.</div>
      ${detail ? '<div class="result-error-detail">\u2139\uFE0F ' + safeDetail + '</div>' : ''}`;

    resultFooter.innerHTML = `
      <div style="display:flex;gap:10px;flex-direction:column;">
        <button class="btn btn-primary btn-full" id="downloadPdfBtn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download Order Confirmation
        </button>
        <button class="btn btn-outline btn-full" id="placeAnotherBtn">Place Another Order</button>
      </div>`;

    document.getElementById('downloadPdfBtn').addEventListener('click', () => downloadPDF(orderData));
    document.getElementById('placeAnotherBtn').addEventListener('click', placeAnotherOrder);

  } else {
    const safeDetail = escapeHTML(detail);
    resultTitle.textContent = 'Submission Failed';
    resultBody.innerHTML = `
      <div class="result-icon error">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div class="result-heading">Order Submission Failed</div>
      <div class="result-msg">We couldn\u2019t submit your order. Please review the message below and try again.</div>
      ${detail ? '<div class="result-error-detail">Error: ' + safeDetail + '</div>' : ''}`;

    resultFooter.innerHTML = `
      <div style="display:flex;gap:10px;flex-direction:column;">
        <button class="btn btn-primary btn-full" id="retryBtn">Try Again</button>
        <button class="btn btn-outline btn-full" id="backToReviewFromResultBtn">Back to Review</button>
      </div>`;

    document.getElementById('retryBtn').addEventListener('click', () => {
      resultDrawer.classList.add('hidden');
      formDrawer.classList.remove('hidden');
    });
    document.getElementById('backToReviewFromResultBtn').addEventListener('click', () => {
      resultDrawer.classList.add('hidden');
      openOrderDrawer();
    });
  }
}

function resetOrderDiscountControls() {
  const discInput  = document.getElementById('orderDiscInput');
  const discPanel  = document.getElementById('orderDiscPanel');
  const discAddBtn = document.getElementById('orderDiscAddBtn');
  const discUnit   = document.getElementById('orderDiscUnit');
  const modeBtns   = document.querySelectorAll('.order-disc-mode-btn');

  if (discInput)  discInput.value = '';
  if (discInput) {
    discInput.max = '100';
    discInput.step = '0.1';
    discInput.placeholder = '0–100';
    discInput.setAttribute('aria-label', 'Percentage order discount');
  }
  if (discUnit) discUnit.textContent = '%';
  modeBtns.forEach(btn => {
    const active = btn.dataset.mode === 'pct';
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  if (discPanel)  discPanel.classList.remove('open');
  if (discAddBtn) discAddBtn.classList.remove('hidden');
}

function clearCompletedOrder() {
  cart          = {};
  discounts     = {};
  orderDiscount = null;
  if (window.RioOrderApi) RioOrderApi.clearSubmission(localStorage);
  try {
    localStorage.removeItem('rioTradingCart');
  } catch (error) {
    // The in-memory cart is already clear if storage is unavailable.
  }
  resetOrderDiscountControls();
  updateCartUI();
  renderGrid();
  orderForm.reset();
  ['shopName','contactName','phone','email'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
    document.getElementById(id + 'Err').classList.add('hidden');
  });
}

function placeAnotherOrder() {
  clearCompletedOrder();
  closeAll();
}

/* ============================================================
   PDF DOWNLOAD
   ============================================================ */
/* buildPDF — shared PDF builder; returns the jsPDF doc object.
   Call .save() to download, or .output('datauristring') for base64. */
function buildPDF(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const M   = 18;
  let   y   = M;

  function rule(yPos, thickness, gray) {
    doc.setDrawColor(gray !== undefined ? gray : 0);
    doc.setLineWidth(thickness || 0.3);
    doc.line(M, yPos, W - M, yPos);
  }

  /* ================================================================
     HEADER
  ================================================================ */
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(CONFIG.BUSINESS_NAME.toUpperCase(), M, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('ORDER CONFIRMATION', W - M, y + 4, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(d.orderRef, W - M, y + 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  doc.text(CONFIG.BUSINESS_TAGLINE, M, y + 14);

  y += 20;

  /* double rule */
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);
  y += 1;
  doc.setLineWidth(0.2);
  doc.line(M, y, W - M, y);
  y += 7;

  /* ================================================================
     DATE & REF
  ================================================================ */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('DATE:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(d.orderDate, M + 14, y);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text('REF:', W / 2, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text(d.orderRef, W / 2 + 11, y);

  y += 10;

  /* ================================================================
     CUSTOMER DETAILS
  ================================================================ */
  const boxH = d.notes ? 38 : 30;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(M, y, W - M * 2, boxH);

  doc.setFillColor(0, 0, 0);
  doc.rect(M, y, W - M * 2, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text('CUSTOMER DETAILS', M + 3, y + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);

  const col2 = W / 2 + 5;
  const rowA = y + 14;
  const rowB = y + 21;
  const rowC = y + 28;

  doc.setFont('helvetica', 'bold');   doc.text('Business:', M + 3, rowA);
  doc.setFont('helvetica', 'normal'); doc.text(d.shopName,    M + 22, rowA);
  doc.setFont('helvetica', 'bold');   doc.text('Contact:',   M + 3, rowB);
  doc.setFont('helvetica', 'normal'); doc.text(d.contactName, M + 22, rowB);

  doc.setFont('helvetica', 'bold');   doc.text('Phone:', col2, rowA);
  doc.setFont('helvetica', 'normal'); doc.text(d.phone,   col2 + 15, rowA);
  doc.setFont('helvetica', 'bold');   doc.text('Email:',  col2, rowB);
  doc.setFont('helvetica', 'normal'); doc.text(d.email,   col2 + 15, rowB);

  if (d.notes) {
    doc.setFont('helvetica', 'bold');   doc.text('Notes:', M + 3, rowC);
    doc.setFont('helvetica', 'normal'); doc.text(d.notes,   M + 22, rowC);
  }

  y += boxH + 8;

  /* ================================================================
     ORDER ITEMS TABLE
  ================================================================ */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('ORDER ITEMS', M, y);
  y += 1;

  const anyDiscount = d.items.some(i => i.discountAmt > 0);

  let tableHead, tableBody, colStyles;

  if (anyDiscount) {
    /* 7 columns: include Discount and Net Unit Price */
    tableHead = [['Product', 'Unit', 'Qty', 'Unit Price', 'Discount', 'Net Unit Price', 'Line Total']];
    tableBody = d.items.map(i => {
      const netUnit = i.qty > 0 ? i.lineTotal / i.qty : i.unitPrice;
      return [
        i.name,
        i.unit || '\u2014',
        i.qty,
        fmt(i.unitPrice),
        i.discountAmt > 0 ? i.discountLabel : '\u2014',
        i.discountAmt > 0 ? fmt(netUnit)    : '\u2014',
        fmt(i.lineTotal),
      ];
    });
    colStyles = {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'center' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 20, halign: 'right'  },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 22, halign: 'right'  },
      6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
    };
  } else {
    /* 5 columns: clean simple layout */
    tableHead = [['Product', 'Unit', 'Qty', 'Unit Price', 'Line Total']];
    tableBody = d.items.map(i => [
      i.name,
      i.unit || '\u2014',
      i.qty,
      fmt(i.unitPrice),
      fmt(i.lineTotal),
    ]);
    colStyles = {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 12, halign: 'center' },
      3: { cellWidth: 24, halign: 'right'  },
      4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    };
  }

  doc.autoTable({
    startY: y,
    margin: { left: M, right: M },
    head: tableHead,
    body: tableBody,
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [0, 0, 0],
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: colStyles,
  });

  y = doc.lastAutoTable.finalY + 8;

  /* ================================================================
     TOTALS
  ================================================================ */
  const totRight = W - M;
  const totLeft  = totRight - 84;

  /* helper: one totals row */
  function totLine(label, value, bold, size) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size || 9);
    doc.setTextColor(bold ? 0 : 80, bold ? 0 : 80, bold ? 0 : 80);
    doc.text(label, totLeft, y);
    doc.setTextColor(0, 0, 0);
    doc.text(value, totRight, y, { align: 'right' });
    y += 7;
  }

  rule(y, 0.2, 180);
  y += 5;

  /* Subtotal + order discount rows \u2014 only when an order discount exists */
  if (d.orderDiscountAmt > 0) {
    totLine('Subtotal (after item discounts):', fmt(d.subtotal || d.total));
    const orderDiscountLabel = d.orderDiscountMode === 'fixed'
      ? 'Order Discount (Fixed):'
      : 'Order Discount (' + d.orderDiscountPct + '%):';
    totLine(orderDiscountLabel, '-' + fmt(d.orderDiscountAmt));
    rule(y, 0.2, 180);
    y += 5;
  }

  /* ORDER TOTAL */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('ORDER TOTAL:', totLeft, y);
  doc.text(fmt(d.total), totRight, y, { align: 'right' });
  y += 3;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.line(totLeft, y, totRight, y);

  /* ================================================================
     FOOTER
  ================================================================ */
  y = H - 14;
  rule(y, 0.2, 180);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(CONFIG.BUSINESS_NAME + '  |  ' + CONFIG.BUSINESS_TAGLINE, M, y);
  doc.text('Thank you for your business.', W - M, y, { align: 'right' });

  return doc;
}

function downloadPDF(d) {
  buildPDF(d).save('Rio-Trading-Order-Confirmation-' + d.orderRef + '.pdf');
}

/* ============================================================
   ORDER DISCOUNT UI
   ============================================================ */
function initOrderDiscountUI() {
  const input    = document.getElementById('orderDiscInput');
  const clearBtn = document.getElementById('orderDiscClear');
  const addBtn   = document.getElementById('orderDiscAddBtn');
  const panel    = document.getElementById('orderDiscPanel');
  const unit     = document.getElementById('orderDiscUnit');
  const errorElement = document.getElementById('orderDiscError');
  const modeBtns = Array.from(document.querySelectorAll('.order-disc-mode-btn'));
  let selectedMode = orderDiscount ? orderDiscount.mode : 'pct';

  function setMode(mode) {
    selectedMode = mode === 'fixed' ? 'fixed' : 'pct';
    modeBtns.forEach(btn => {
      const active = btn.dataset.mode === selectedMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    if (selectedMode === 'pct') {
      input.max = '100';
      input.step = '0.1';
      input.placeholder = '0–100';
      input.setAttribute('aria-label', 'Percentage order discount');
      unit.textContent = '%';
    } else {
      input.max = RioMoney.fromPence(cartSubtotalBeforeOrderDiscount()).toFixed(2);
      input.step = '0.01';
      input.placeholder = '0.00';
      input.setAttribute('aria-label', 'Fixed order discount');
      unit.textContent = '£';
    }
    setDiscountInputError(input, errorElement, '');
  }

  function openPanel() {
    addBtn.classList.add('hidden');
    panel.classList.add('open');
    setMode(orderDiscount ? orderDiscount.mode : selectedMode);
    input.focus();
  }

  function closePanel() {
    panel.classList.remove('open');
    addBtn.classList.remove('hidden');
    orderDiscount = null;
    setMode('pct');
    input.value = '';
    saveCart();
    refreshDrawerTotals();
    updateCartUI();
  }

  // Restore persisted discount from localStorage
  setMode(selectedMode);
  if (orderDiscount && orderDiscount.value > 0) {
    input.value = orderDiscount.mode === 'fixed'
      ? Number(orderDiscount.value).toFixed(2)
      : orderDiscount.value;
    openPanel();
  }

  addBtn.addEventListener('click', openPanel);

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const newMode = btn.dataset.mode;
      if (newMode === selectedMode) return;
      orderDiscount = null;
      input.value = '';
      setMode(newMode);
      saveCart();
      refreshDrawerTotals();
      updateCartUI();
      input.focus();
    });
  });

  input.addEventListener('input', () => {
    const validation = validateOrderDiscountInput();
    if (!validation.valid) {
      updateCartUI();
      return;
    }

    orderDiscount = validation.value > 0 ? { mode: selectedMode, value: validation.value } : null;
    saveCart();
    refreshDrawerTotals();
    updateCartUI();
  });

  input.addEventListener('blur', () => {
    const validation = validateOrderDiscountInput();
    if (validation.valid && orderDiscount && orderDiscount.mode === 'fixed') {
      input.value = Number(orderDiscount.value).toFixed(2);
    }
  });

  clearBtn.addEventListener('click', closePanel);
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function initEvents() {
  brandLogoBtn.addEventListener('click',  goHome);
  cartIconBtn.addEventListener('click',   openOrderDrawer);
  drawerClose.addEventListener('click',   closeAll);
  drawerBackdrop.addEventListener('click', closeAll);

  proceedBtn.addEventListener('click', () => {
    if (!hasValidCartItems() || hasDiscountValidationErrors()) {
      renderOrderDrawer();
      updateCartUI();
      return;
    }
    orderDrawer.classList.add('hidden');
    openDrawer(formDrawer);
  });

  formDrawerClose.addEventListener('click', closeAll);

  backToReviewBtn.addEventListener('click', () => {
    formDrawer.classList.add('hidden');
    openOrderDrawer();
  });

  sendOrderBtn.addEventListener('click', submitOrder);
  resultDrawerClose.addEventListener('click', closeAll);
  catalogueRetryBtn.addEventListener('click', loadProducts);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAll();
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  initCategoryPills();
  initSearch();
  initPromoSlider();
  initEvents();
  initLiveValidation();
  initOrderDiscountUI();
  loadProducts();
  updateCartUI();
});
