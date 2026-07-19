# Rio Trading Wholesale Catalogue

A responsive static web catalogue for Rio Trading wholesale customers. The app lets shop owners browse products, filter by category, search the catalogue, build an order, apply item-level or order-level discounts, submit order details, and download order PDFs.

## Features

- Responsive product catalogue built with plain HTML, CSS, and JavaScript
- Product data loaded from a published Google Sheets CSV
- Demo product fallback when the live sheet cannot be loaded
- Search, category filters, and subcategory filters
- Cart/order review drawer with quantity controls
- Item-level discounts by percentage or fixed GBP amount
- Order-level percentage discount
- Customer details form with basic validation
- EmailJS order submission
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
├── index.html
├── script.js
├── style.css
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
  SHEET_CSV_URL:       '...',
  EMAILJS_SERVICE_ID:  '...',
  EMAILJS_TEMPLATE_ID: '...',
  EMAILJS_PUBLIC_KEY:  '...',
  ORDER_TO_EMAIL:      'orders@riotrading.co.uk',
  BUSINESS_NAME:       'Rio Trading',
  BUSINESS_TAGLINE:    'Wholesale Catalogue',
};
```

Update these values when changing the product sheet, EmailJS account, receiving order email, or business display details.

## Product Data

Products are loaded from the published Google Sheets CSV configured in `CONFIG.SHEET_CSV_URL`. If the sheet is unavailable or empty, the app falls back to the demo products in `script.js`.

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
5. The app submits the order through EmailJS.
6. Customers can download a PDF order summary.

## External Services and CDNs

The app uses these browser-loaded services/libraries:

- Google Fonts for the Inter font family
- EmailJS browser SDK for order emails
- jsPDF for PDF creation
- jsPDF AutoTable for PDF table formatting
- Google Sheets published CSV as the product data source
- Unsplash image URLs as fallback/demo product images

## Deployment

Because this is a static site, it can be deployed to any static hosting provider, including GitHub Pages, Netlify, Vercel, Cloudflare Pages, or a standard web server.

Make sure `index.html`, `style.css`, `script.js`, and the `assets/` folder are deployed together.

## Development Notes

- Keep product/category names in the sheet aligned with the hard-coded category buttons in `index.html`.
- If new subcategories are required, update `SUBCATEGORIES` in `script.js`.
- Promo banners are defined in `index.html` inside `#promoSliderTrack`.
- Cart data is stored in the browser under the `rioTradingCart` localStorage key.
- The app is client-side only, so EmailJS public keys and sheet URLs are visible in the browser.
