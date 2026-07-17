/* ============================================================
   Rio Trading — Wholesale Catalogue  |  script.js
   All logic: data fetch, cart, rendering, EmailJS, PDF
   ============================================================ */

/* ---- CONFIG ---- */
/* Edit these values to connect your live data and email service */
const CONFIG = {
  SHEET_CSV_URL:       'https://docs.google.com/spreadsheets/d/e/2PACX-1vQjfqRKuQx9rk4VZKrGOw7ANC3pMr71GkHsaJTYjPG9sFtIHtvZ6XSrLQIjukJK8A/pub?gid=1147224303&single=true&output=csv', // Google Sheets published CSV URL
  EMAILJS_SERVICE_ID:  'rio_trading_order_email',
  EMAILJS_TEMPLATE_ID: 'rio_trading_order_temp',
  EMAILJS_PUBLIC_KEY:  'jZ5iYr62ozsXkXWpu',
  ORDER_TO_EMAIL:      'orders@riotrading.co.uk',
  BUSINESS_NAME:       'Rio Trading',
  BUSINESS_TAGLINE:    'Wholesale Catalogue',
};

/* ---- SUBCATEGORY MAP ---- */
/* Maps parent category name → array of subcategory labels */
const SUBCATEGORIES = {
  'Grocery & Essentials': ['English', 'Asian'],
  'Snacks': ['Biscuits', 'Cakes & Bakery', 'Crisps'],
};

/* ---- DEMO PRODUCTS ---- */
/* Used when SHEET_CSV_URL is empty. Covers all 7 categories. */
const DEMO_PRODUCTS = [
  { id:'1',  name:'Tetley Tea Bags 240pk',          category:'Grocery & Essentials', subcategory:'English',        price:8.49,  unit:'case',  stock:'In Stock (240)' },
  { id:'2',  name:'Basmati Rice 10kg',               category:'Grocery & Essentials', subcategory:'Asian',          price:14.99, unit:'sack',  stock:'In Stock (80)' },
  { id:'3',  name:'Naan Bread x10',                  category:'Grocery & Essentials', subcategory:'Asian',          price:3.20,  unit:'pack',  stock:'In Stock (150)' },
  { id:'4',  name:'Heinz Baked Beans 415g x24',      category:'Grocery & Essentials', subcategory:'English',        price:18.50, unit:'case',  stock:'In Stock (60)' },
  { id:'5',  name:'Coca-Cola 330ml x24',             category:'Beverages',            subcategory:'',               price:12.99, unit:'case',  stock:'In Stock (200)' },
  { id:'6',  name:'Lucozade Sport 500ml x12',        category:'Beverages',            subcategory:'',               price:9.60,  unit:'case',  stock:'In Stock (90)' },
  { id:'7',  name:'Ribena Blackcurrant 1L x6',       category:'Beverages',            subcategory:'',               price:7.20,  unit:'case',  stock:'In Stock (120)' },
  { id:'8',  name:'Cadbury Dairy Milk 200g x24',     category:'Confectionery',        subcategory:'',               price:22.80, unit:'case',  stock:'In Stock (48)' },
  { id:'9',  name:'Haribo Starmix 160g x12',         category:'Confectionery',        subcategory:'',               price:10.44, unit:'case',  stock:'In Stock (72)' },
  { id:'10', name:'Dove Body Wash 250ml x6',         category:'Health & Beauty',      subcategory:'',               price:11.40, unit:'case',  stock:'In Stock (36)' },
  { id:'11', name:'Colgate Toothpaste 75ml x12',     category:'Health & Beauty',      subcategory:'',               price:14.88, unit:'case',  stock:'In Stock (60)' },
  { id:'12', name:'Catering Foil 300m Roll',         category:'Catering',             subcategory:'',               price:6.50,  unit:'roll',  stock:'In Stock (40)' },
  { id:'13', name:'Disposable Gloves M x100',        category:'Catering',             subcategory:'',               price:4.20,  unit:'box',   stock:'In Stock (200)' },
  { id:'14', name:'Pedigree Dog Food 400g x12',      category:'Pet Food',             subcategory:'',               price:13.80, unit:'case',  stock:'In Stock (55)' },
  { id:'15', name:'Whiskas Cat Food 400g x12',       category:'Pet Food',             subcategory:'',               price:12.60, unit:'case',  stock:'In Stock (48)' },
  { id:'16', name:"McVitie's Digestives 400g x12",   category:'Snacks',               subcategory:'Biscuits',       price:14.40, unit:'case',  stock:'In Stock (96)' },
  { id:'17', name:'Mr Kipling Exceedingly Cakes x6', category:'Snacks',               subcategory:'Cakes & Bakery', price:9.00,  unit:'case',  stock:'In Stock (72)' },
  { id:'18', name:'Walkers Crisps Variety 24pk',     category:'Snacks',               subcategory:'Crisps',         price:11.52, unit:'case',  stock:'In Stock (100)' },
];

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
let orderDiscountPct = 0;
let activeCategory    = 'all';
let activeSubcategory = 'all';
let searchQuery       = '';
let lastOrderData     = null;

/* ============================================================
   DOM REFERENCES
   ============================================================ */
const productGrid       = document.getElementById('productGrid');
const emptyState        = document.getElementById('emptyState');
const searchInput       = document.getElementById('searchInput');
const categoryPills     = document.getElementById('categoryPills');
const subcategoryPills  = document.getElementById('subcategoryPills');
const orderBar          = document.getElementById('orderBar');
const barItemCount      = document.getElementById('barItemCount');
const barTotal          = document.getElementById('barTotal');
const viewOrderBtn      = document.getElementById('viewOrderBtn');
const cartIconBtn       = document.getElementById('cartIconBtn');
const cartIconCount     = document.getElementById('cartIconCount');
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

/* ============================================================
   CART PERSISTENCE
   ============================================================ */
function saveCart() {
  localStorage.setItem('rioTradingCart', JSON.stringify({ cart, discounts, orderDiscountPct }));
}

function loadCart() {
  try {
    const saved = localStorage.getItem('rioTradingCart');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed.cart === 'object') {
        cart             = parsed.cart             || {};
        discounts        = parsed.discounts        || {};
        orderDiscountPct = parsed.orderDiscountPct || 0;
      } else {
        cart             = parsed || {};
        discounts        = {};
        orderDiscountPct = 0;
      }
    }
  } catch (e) {
    cart = {}; discounts = {}; orderDiscountPct = 0;
  }
}

/* ============================================================
   CART CALCULATIONS
   ============================================================ */
function cartItemCount() {
  return Object.values(cart).reduce((s, q) => s + q, 0);
}

function cartTotal() {
  return Object.entries(cart).reduce((sum, [id, qty]) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return sum;
    const sub = p.price * qty;
    return sum + sub - getItemDiscountAmount(id, sub, p.price);
  }, 0);
}

function cartFinalTotal() {
  const sub = cartTotal();
  if (!orderDiscountPct) return sub;
  return sub - sub * Math.min(100, Math.max(0, orderDiscountPct)) / 100;
}

function getItemDiscountAmount(productId, subtotal, unitPrice) {
  const d = discounts[productId];
  if (!d || !d.value) return 0;
  if (d.mode === 'pct') return subtotal * Math.min(100, Math.max(0, d.value)) / 100;
  /* fixed: discount is per unit — clamp to unit price, then multiply by qty */
  const discPerUnit = Math.min(unitPrice, Math.max(0, d.value));
  const qty = unitPrice > 0 ? Math.round(subtotal / unitPrice) : 1;
  return discPerUnit * qty;
}

function formatDiscountLabel(d) {
  if (!d || !d.value) return '+ Discount';
  return d.mode === 'pct'
    ? d.value + '% off'
    : '£' + Number(d.value).toFixed(2) + ' off';
}

/* Format a number as GBP */
function fmt(n) {
  return '\u00A3' + n.toFixed(2);
}

/* ============================================================
   ORDER REFERENCE
   ============================================================ */
function generateOrderRef() {
  const d = new Date();
  const date = d.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.random().toString(36).slice(2,7).toUpperCase();
  return 'ORD-' + date + '-' + rand;
}

/* ============================================================
   PRODUCT LOADING
   ============================================================ */
async function loadProducts() {
  if (!CONFIG.SHEET_CSV_URL) {
    allProducts = DEMO_PRODUCTS;
    renderGrid();
    return;
  }
  try {
    const r = await fetch(CONFIG.SHEET_CSV_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    const products = parseCSV(text);
    if (products.length === 0) throw new Error('Empty sheet');
    allProducts = products;
    renderGrid();
  } catch (err) {
    console.warn('Sheet load failed, using demo data.', err);
    allProducts = DEMO_PRODUCTS;
    renderGrid();
  }
}

function parseCSV(text) {
  /* Normalise line endings: Google Sheets uses \r\n */
  const lines   = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\r/g,''));
  return lines.slice(1)
    .filter(line => line.trim())
    .map(line => {
      /* Simple CSV split that handles quoted fields containing commas */
      const vals = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
        else { cur += ch; }
      }
      vals.push(cur.trim());
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || '').replace(/\r/g, ''); });
      return { ...obj, price: parseFloat(obj.price) || 0, id: obj.id || String(Math.random()) };
    })
    .filter(p => {
      /* Google Sheets exports TRUE/FALSE in uppercase; also handle lowercase and 0/1 */
      const a = (p.active || 'true').toLowerCase().trim();
      return a !== 'false' && a !== '0' && p.name;
    });
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
      <div class="card-price">${fmt(product.price)}</div>
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
function updateCartUI() {
  const count = cartItemCount();
  const total = cartFinalTotal();

  if (count > 0) {
    orderBar.classList.remove('hidden');
    barItemCount.textContent = count + ' item' + (count !== 1 ? 's' : '');
    barTotal.textContent     = fmt(total);
    cartIconCount.textContent = count;
    cartIconCount.classList.remove('hidden');
  } else {
    orderBar.classList.add('hidden');
    cartIconCount.classList.add('hidden');
  }
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
  const sub0 = product.price * qty;
  const disc0 = getItemDiscountAmount(product.id, sub0, product.price);
  row.innerHTML = `
    <img class="cart-item-img" src="${getImg(product)}" alt="${product.name}" loading="lazy"
      onerror="this.src='${FALLBACK_IMG}'" />
    <div class="cart-item-info">
      <div class="cart-item-name">${product.name}</div>
      <div class="cart-item-price-line">
        <span class="cart-item-orig-price">${fmt(product.price)}</span>
        <span class="cart-item-disc-price"></span>
        <span class="cart-item-per-unit">/ ${product.unit || 'unit'}</span>
      </div>
    </div>
    <div class="stepper-compact">
      <button class="stepper-btn cart-minus" aria-label="Decrease">&minus;</button>
      <input class="stepper-input cart-qty" type="number" min="1" value="${qty}" aria-label="Quantity" />
      <button class="stepper-btn cart-plus" aria-label="Increase">+</button>
    </div>
    <span class="cart-item-line-total">${fmt(sub0 - disc0)}</span>
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

  /* Seed price line + saving text if discount already active on open */
  if (hasDisc && existingDisc) {
    discSaving.textContent = 'Saving: ' + fmt(disc0);
    const discedUnit = existingDisc.mode === 'pct'
      ? product.price * (1 - existingDisc.value / 100)
      : product.price - existingDisc.value;
    origPrice.classList.add('cart-item-orig-price--struck');
    discPrice.textContent = '→ ' + fmt(discedUnit);
  }

  /* ---- refresh: qty change → update line total ---- */
  function refresh() {
    const q   = parseInt(qtyInput.value, 10) || 1;
    cart[product.id] = q;
    saveCart();
    const sub = product.price * q;
    lineTotal.textContent = fmt(sub - getItemDiscountAmount(product.id, sub, product.price));
    refreshDrawerTotals();
    updateCartUI();
    syncCardBtn(product.id);
  }

  /* ---- refreshDiscount: discount input change ---- */
  function refreshDiscount() {
    const q      = parseInt(qtyInput.value, 10) || 1;
    const sub    = product.price * q;
    const activeBtn = discRow.querySelector('.disc-mode-btn.active');
    const mode      = activeBtn ? activeBtn.dataset.mode : 'pct';
    let val      = parseFloat(discInput.value);
    if (isNaN(val) || val < 0) val = 0;
    if (mode === 'pct')   val = Math.min(100, val);
    if (mode === 'fixed') val = Math.min(product.price, val);

    if (val > 0) {
      discounts[product.id] = { mode, value: val };
    } else {
      delete discounts[product.id];
    }
    saveCart();

    const discAmt = getItemDiscountAmount(product.id, sub, product.price);
    lineTotal.textContent = fmt(sub - discAmt);

    const activeDisc = discounts[product.id];
    if (discAmt > 0 && activeDisc) {
      /* Price line: strike original, show discounted unit price */
      const discedUnit = activeDisc.mode === 'pct'
        ? product.price * (1 - activeDisc.value / 100)
        : product.price - activeDisc.value;
      origPrice.classList.add('cart-item-orig-price--struck');
      discPrice.textContent = '→ ' + fmt(discedUnit);
      discSaving.textContent = 'Saving: ' + fmt(discAmt);
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
      discInput.placeholder = newMode === 'pct' ? '0–100' : '0.00';
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
    origPrice.classList.remove('cart-item-orig-price--struck');
    discPrice.textContent = '';
    discSaving.textContent = '';
    discSaving.classList.remove('disc-saving--active');
    discTrigger.textContent = '+ Discount';
    discTrigger.classList.remove('disc-trigger--active');
    discRow.classList.add('discount-row--hidden');
    discTrigger.setAttribute('aria-expanded', 'false');
    const q   = parseInt(qtyInput.value, 10) || 1;
    lineTotal.textContent = fmt(product.price * q);
    saveCart();
    refreshDrawerTotals();
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

  return wrap;
}

function refreshDrawerTotals() {
  const count   = cartItemCount();
  const sub     = cartTotal();
  const final   = cartFinalTotal();
  const discAmt = sub - final;

  drawerSubtitle.textContent = count + ' item' + (count !== 1 ? 's' : '') + ' \u00B7 ' + fmt(final);
  drawerTotal.textContent    = fmt(final);

  if (discAmt > 0) {
    document.getElementById('orderSubtotalRow').classList.remove('hidden');
    document.getElementById('orderSubtotalVal').textContent  = fmt(sub);
    document.getElementById('orderDiscSaving').textContent   = '\u2212' + fmt(discAmt);
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
  if (!validateForm()) return;

  sendOrderBtn.disabled    = true;
  sendOrderBtn.textContent = 'Sending\u2026';

  const shopName    = document.getElementById('shopName').value.trim();
  const contactName = document.getElementById('contactName').value.trim();
  const phone       = document.getElementById('phone').value.trim();
  const email       = document.getElementById('email').value.trim();
  const notes       = document.getElementById('notes').value.trim();

  const orderRef  = generateOrderRef();
  const orderDate = new Date().toLocaleString('en-GB', { dateStyle:'full', timeStyle:'short' });

  const items = Object.entries(cart).map(([id, qty]) => {
    const p = allProducts.find(x => x.id === id);
    if (!p) return null;
    const subtotal    = p.price * qty;
    const discountAmt = getItemDiscountAmount(id, subtotal, p.price);
    const d           = discounts[id];
    return {
      name:          p.name,
      unit:          p.unit,
      qty,
      unitPrice:     p.price,
      discountAmt,
      discountLabel: d && d.value ? formatDiscountLabel(d) : null,
      lineTotal:     subtotal - discountAmt,
    };
  }).filter(Boolean);

  const subtotal        = cartTotal();
  const total           = cartFinalTotal();
  const orderDiscountAmt = subtotal - total;

  const orderLines = [
    '================================================',
    'ORDERED ITEMS',
    '================================================',
    ...items.map((i, idx) =>
      (idx + 1) + '. ' + i.name +
      '\n   Unit: ' + (i.unit || '\u2014') +
      ' | Qty: ' + i.qty +
      ' | Unit Price: ' + fmt(i.unitPrice) +
      (i.discountAmt > 0 ? ' | Discount: ' + i.discountLabel + ' (\u2212' + fmt(i.discountAmt) + ')' : '') +
      ' | Line Total: ' + fmt(i.lineTotal)
    ),
    '------------------------------------------------',
    'ORDER SUBTOTAL: ' + fmt(subtotal),
    ...(orderDiscountAmt > 0 ? ['ORDER DISCOUNT (' + orderDiscountPct + '%): \u2212' + fmt(orderDiscountAmt)] : []),
    'ORDER TOTAL: ' + fmt(total),
    '================================================',
  ].join('\n');

  const orderData = { orderRef, orderDate, shopName, contactName, phone, email, notes, items, subtotal, total, orderDiscountPct, orderDiscountAmt, orderLines };
  lastOrderData   = orderData;

  const emailjsOk =
    CONFIG.EMAILJS_SERVICE_ID  !== 'YOUR_SERVICE_ID'  &&
    CONFIG.EMAILJS_TEMPLATE_ID !== 'YOUR_TEMPLATE_ID' &&
    CONFIG.EMAILJS_PUBLIC_KEY  !== 'YOUR_PUBLIC_KEY';

  if (!emailjsOk) {
    /* Demo mode — simulate delay */
    await new Promise(r => setTimeout(r, 1200));
    resetSendBtn();
    showResult('success', orderData, 'EmailJS not configured \u2014 running in demo mode. Order was not actually sent.');
    return;
  }

  try {
    /* Generate PDF as base64 for email attachment */
    const pdfDoc     = buildPDF(orderData);
    const pdfBase64  = pdfDoc.output('datauristring'); // data:application/pdf;base64,...

    emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
    await emailjs.send(CONFIG.EMAILJS_SERVICE_ID, CONFIG.EMAILJS_TEMPLATE_ID, {
      to_email:        CONFIG.ORDER_TO_EMAIL,
      order_ref:       orderRef,
      order_date:      orderDate,
      shop_name:       shopName,
      contact_name:    contactName,
      phone,
      email,
      order_lines:     orderLines,
      order_total:     fmt(total),
      notes:           notes || 'None',
    });
    resetSendBtn();
    showResult('success', orderData);
  } catch (err) {
    console.error('EmailJS error:', err);
    resetSendBtn();
    showResult('error', orderData, err.text || err.message || 'Unknown error');
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
    resultTitle.textContent = 'Order Submitted';
    resultBody.innerHTML = `
      <div class="result-icon success">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div class="result-heading">Order Submitted Successfully!</div>
      <div class="result-ref">Order #${orderData.orderRef}</div>
      <div class="result-msg">Thank you for your order, ${orderData.shopName}. We\u2019ll be in touch shortly to confirm your delivery.</div>
      ${detail ? '<div class="result-error-detail">\u2139\uFE0F ' + detail + '</div>' : ''}`;

    resultFooter.innerHTML = `
      <div style="display:flex;gap:10px;flex-direction:column;">
        <button class="btn btn-primary btn-full" id="downloadPdfBtn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download PDF Receipt
        </button>
        <button class="btn btn-outline btn-full" id="placeAnotherBtn">Place Another Order</button>
      </div>`;

    document.getElementById('downloadPdfBtn').addEventListener('click', () => downloadPDF(orderData));
    document.getElementById('placeAnotherBtn').addEventListener('click', placeAnotherOrder);

  } else {
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
      <div class="result-msg">We couldn\u2019t send your order. Please try again or contact us directly.</div>
      ${detail ? '<div class="result-error-detail">Error: ' + detail + '</div>' : ''}`;

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

function placeAnotherOrder() {
  cart             = {};
  discounts        = {};
  orderDiscountPct = 0;
  const discInput  = document.getElementById('orderDiscInput');
  const discPanel  = document.getElementById('orderDiscPanel');
  const discAddBtn = document.getElementById('orderDiscAddBtn');
  if (discInput)  discInput.value = '';
  if (discPanel)  discPanel.classList.remove('open');
  if (discAddBtn) discAddBtn.classList.remove('hidden');
  saveCart();
  updateCartUI();
  closeAll();
  renderGrid();
  orderForm.reset();
  ['shopName','contactName','phone','email'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
    document.getElementById(id + 'Err').classList.add('hidden');
  });
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
  doc.text('ORDER RECEIPT', W - M, y + 4, { align: 'right' });

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
    totLine('Order Discount (' + d.orderDiscountPct + '%):', '-' + fmt(d.orderDiscountAmt));
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
  buildPDF(d).save('Order-' + d.orderRef + '.pdf');
}

/* ============================================================
   ORDER DISCOUNT UI
   ============================================================ */
function initOrderDiscountUI() {
  const input    = document.getElementById('orderDiscInput');
  const clearBtn = document.getElementById('orderDiscClear');
  const addBtn   = document.getElementById('orderDiscAddBtn');
  const panel    = document.getElementById('orderDiscPanel');

  function openPanel() {
    addBtn.classList.add('hidden');
    panel.classList.add('open');
    input.focus();
  }

  function closePanel() {
    panel.classList.remove('open');
    addBtn.classList.remove('hidden');
    orderDiscountPct = 0;
    input.value = '';
    saveCart();
    refreshDrawerTotals();
    updateCartUI();
  }

  // Restore persisted discount from localStorage
  if (orderDiscountPct > 0) {
    input.value = orderDiscountPct;
    openPanel();
  }

  addBtn.addEventListener('click', openPanel);

  input.addEventListener('input', () => {
    let val = parseFloat(input.value);
    if (isNaN(val) || val < 0) val = 0;
    val = Math.min(100, val);
    orderDiscountPct = val;
    saveCart();
    refreshDrawerTotals();
    updateCartUI();
  });

  clearBtn.addEventListener('click', closePanel);
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
function initEvents() {
  cartIconBtn.addEventListener('click',   openOrderDrawer);
  viewOrderBtn.addEventListener('click',  openOrderDrawer);
  drawerClose.addEventListener('click',   closeAll);
  drawerBackdrop.addEventListener('click', closeAll);

  proceedBtn.addEventListener('click', () => {
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
  initEvents();
  initLiveValidation();
  initOrderDiscountUI();
  loadProducts();
  updateCartUI();
});
