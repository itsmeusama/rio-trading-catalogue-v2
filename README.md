# Rio Trading Wholesale Catalogue

A responsive static web catalogue for Rio Trading wholesale customers. The app lets shop owners browse products, filter by category, search the catalogue, build an order, apply item-level or order-level discounts, submit order details, and download order PDFs.

## Features

- Responsive product catalogue built with plain HTML, CSS, and JavaScript
- Product data loaded from a published Google Sheets CSV
- Fail-closed catalogue loading with a clear retry state when the live sheet is unavailable or invalid
- Search, category filters, and subcategory filters
- Cart/order review drawer with quantity controls
- Item-level discounts by percentage or fixed GBP amount
- Order-level percentage discount
- Customer details form with basic validation
- Permanent order storage through the Apps Script web app
- Server-authoritative product prices and totals
- Matching integer-pence calculations in the browser and Apps Script
- Duplicate-safe submission retries
- Owner email with a server-generated PDF attachment
- jsPDF and AutoTable PDF generation
- Cart persistence through `localStorage`
- Promo banner slider using images from the `assets/` folder

## Project Structure

```text
.
├── assets/
│   ├── Banner.JPG
│   ├── banner1.png
│   └── rio-trading-logo.jpg
├── docs/
│   └── order-system-phase-1.md
├── apps-script/
│   ├── Code.gs
│   ├── Phase2Test.gs
│   ├── Phase3Test.gs
│   ├── appsscript.json
│   ├── README.md
│   └── PHASE-3.md
├── index.html
├── money.js
├── order-api.js
├── script.js
├── style.css
├── tests/
│   ├── money.test.js
│   └── order-api.test.js
└── README.md
```

## Getting Started

This project has no build step and no package manager dependency. It runs as a static website.

Open `index.html` directly in a browser, or serve the folder with any static file server.

Example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Configuration

Runtime configuration lives at the top of `script.js` in the `CONFIG` object.

```js
const CONFIG = {
  SHEET_CSV_URL:  '...',
  ORDER_API_URL:  'https://script.google.com/macros/s/.../exec',
  BUSINESS_NAME:  'Rio Trading',
  BUSINESS_TAGLINE: 'Wholesale Catalogue',
};
```

Update these values when changing the product sheet, Apps Script deployment,
or business display details. The owner recipient is fixed server-side and is
never accepted from the browser.

## Product Data

Products are loaded from the published Google Sheets CSV configured in `CONFIG.SHEET_CSV_URL`. Ordering stays disabled until a valid live catalogue has loaded. If the sheet is unavailable, empty, or malformed, the app displays a retryable error instead of substituting potentially incorrect products or prices.

Expected sheet columns:

| Column | Purpose |
| --- | --- |
| `id` | Unique product identifier |
| `name` | Product name shown on catalogue cards |
| `category` | Parent category used by the category filter |
| `subcategory` | Optional subcategory used for supported parent categories |
| `price` | Unit price in GBP |
| `unit` | Unit label, such as `case`, `pack`, or `unit` |
| `stock` | Stock status text |
| `image` | Optional image URL |
| `active` | Optional flag. Use `false` or `0` to hide a product |

The current subcategory mapping is configured in `SUBCATEGORIES` inside `script.js`.

## Order Flow

1. Customers browse or search products.
2. Customers add quantities to the order.
3. The order drawer shows line totals, discounts, subtotal, and final payable total.
4. Customers enter shop name, contact name, phone number, email address, and optional notes.
5. The app submits product IDs, quantities, discounts and customer details to Apps Script.
6. Apps Script reloads authoritative products and prices, saves the order, sends the owner PDF email and returns the permanent reference.
7. The salesperson can download an Order Confirmation PDF using the saved response.

## Permanent Order Backend

The approved Phase 1 specification for permanent Google Sheets order storage,
Apps Script validation, duplicate protection, and PDF email delivery is in
[`docs/order-system-phase-1.md`](docs/order-system-phase-1.md).

The Phase 2 Apps Script persistence implementation and its setup instructions
are in [`apps-script/README.md`](apps-script/README.md).

The Phase 3 save-first PDF/email upgrade, deployment and end-to-end acceptance
test are in [`apps-script/PHASE-3.md`](apps-script/PHASE-3.md).

## External Services and CDNs

The app uses these browser-loaded services/libraries:

- Google Fonts for the Inter font family
- jsPDF for PDF creation
- jsPDF AutoTable for PDF table formatting
- Google Sheets published CSV as the product data source
- Unsplash image URLs as fallback/demo product images

## Deployment

Because this is a static site, it can be deployed to any static hosting provider, including GitHub Pages, Netlify, Vercel, Cloudflare Pages, or a standard web server.

Make sure `index.html`, `style.css`, `money.js`, `order-api.js`, `script.js`, and the `assets/` folder are deployed together.

## Development Notes

- Keep product/category names in the sheet aligned with the hard-coded category buttons in `index.html`.
- If new subcategories are required, update `SUBCATEGORIES` in `script.js`.
- Promo banners are defined in `index.html` inside `#promoSliderTrack`.
- Cart data is stored in the browser under the `rioTradingCart` localStorage key.
- The catalogue and Apps Script endpoint URLs are visible in the browser. The
  backend therefore fixes the recipient server-side and revalidates every
  commercial value before saving.
