# Rio Trading Sales Order Catalogue

Rio Trading is a lightweight, responsive catalogue and order-taking tool built for a private, salesperson-assisted workflow. The business owner uses it while visiting retail shops: he shows the current product range, builds the retailer's order, applies any agreed discounts, records the retailer's details, and submits the order in front of them.

The project deliberately uses plain HTML, CSS, and JavaScript. There is no frontend framework, package manager, build step, or application database. Google Sheets remains the product-management and order-record system, while Google Apps Script validates and saves orders and sends the owner confirmation email.

## Current Business Workflow

1. The owner opens the catalogue on a phone, tablet, or laptop during a customer visit.
2. The app loads the latest active products and prices from the published Google Sheet.
3. The owner searches or filters the catalogue and adds the requested quantities.
4. Optional discounts can be applied per item as a percentage or fixed amount per unit. A percentage or fixed amount can also be applied once to the order subtotal.
5. The owner records the shop name, contact name, UK phone number, email address, and any notes.
6. The browser submits product IDs, quantities, discount instructions, and customer details to Google Apps Script.
7. Apps Script reloads the authoritative product sheet, validates the request, and recalculates every commercial value in integer pennies.
8. The accepted order is saved permanently in the `Orders` and `Order Items` sheets before email delivery is attempted.
9. Apps Script generates a unique order reference and sends the fixed owner address an email containing the order details and an attached Order Confirmation PDF.
10. The browser shows the saved order result and allows the owner to download another copy of the Order Confirmation PDF.

The retailer's email is currently stored with the order but is not sent a confirmation automatically.

## Implemented Features

### Catalogue

- Responsive product cards for mobile, tablet, and desktop use
- Live product data from a published Google Sheets CSV
- Product search, category filters, and selected subcategory filters
- Sheet-controlled product names, prices, units, stock text, images, and active status
- Loading, retry, and empty-result states
- Fail-closed catalogue behaviour: ordering is disabled if current data cannot be loaded or validated
- No production fallback to demo products or potentially incorrect prices

### Order Building

- Add, edit, and remove product quantities
- Cart persistence through browser `localStorage`
- Automatic removal of stale, deleted, or invalid cart entries after catalogue loading
- Empty-cart blocking before the customer form and at submission
- Percentage or fixed-per-unit item discounts
- Percentage or fixed GBP discount on the subtotal after item discounts
- Matching integer-pence calculations in the frontend and backend
- Customer detail validation for required fields, UK phone number, and email format

### Permanent Order Processing

- Server-authoritative products, prices, totals, and order references
- Permanent `Orders` and `Order Items` records in the existing business spreadsheet
- Unique references in the `ORD-YYYYMMDD-XXXXX` format
- Save-before-email processing so an email failure does not lose an accepted order
- Duplicate-safe retry behaviour using a persistent submission ID
- Formula-safe spreadsheet writes for customer-entered and saved text
- Fixed owner recipient configured in Apps Script; browser-supplied recipients are rejected
- Owner email containing order details and a server-generated PDF attachment
- Email status tracking as `Pending`, `Sent`, or `Failed`
- Order status starting as `Open`, with `Delivered` and `Cancelled` available for owner updates

### Order Confirmation

- Consistent **Order Confirmation** naming in the interface and generated documents
- Server-generated PDF attached to the owner email
- Browser-generated downloadable PDF after a successful submission
- Both documents use the permanent reference and authoritative saved order values

## Architecture

```text
Published Google Sheet CSV ──> Static catalogue in the browser
                                      │
                                      │ order request
                                      ▼
                              Google Apps Script
                               │       │       │
                               │       │       └──> Owner email + PDF
                               │       └──────────> Order Items sheet
                               └──────────────────> Orders sheet
```

The browser is responsible for interaction and an immediate preview. Apps Script is the commercial authority: it ignores browser-calculated prices and totals, reloads products from the native spreadsheet, recalculates the order, saves it, and returns the accepted values.

## Technology

- HTML5
- CSS3
- Plain JavaScript
- Google Sheets published CSV for catalogue delivery
- Google Apps Script for order validation, permanent storage, PDF generation, and email
- jsPDF and jsPDF AutoTable for the browser-downloadable Order Confirmation
- Google Fonts (`Inter`)
- No npm dependencies, framework, bundler, or build process

## Project Structure

```text
.
├── assets/
│   ├── Banner.JPG
│   ├── banner1.png
│   └── rio-trading-logo.jpg
├── apps-script/
│   ├── tests/
│   │   └── run-tests.js
│   ├── Code.gs
│   ├── Phase2Test.gs
│   ├── Phase3Test.gs
│   ├── appsscript.json
│   ├── README.md
│   └── PHASE-3.md
├── docs/
│   └── order-system-phase-1.md
├── tests/
│   ├── money.test.js
│   └── order-api.test.js
├── index.html
├── money.js
├── order-api.js
├── script.js
├── style.css
└── README.md
```

## Running Locally

The app has no installation or compilation step. Serving it over local HTTP is recommended:

```bash
python3 -m http.server 8765
```

Then open:

```text
http://localhost:8765/
```

Opening `index.html` directly may display the interface, but browser security rules can make remote requests and cryptographic APIs behave differently under `file://`.

## Frontend Configuration

Runtime configuration is at the top of `script.js`:

```js
const CONFIG = {
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/.../pub?...&output=csv',
  ORDER_API_URL: 'https://script.google.com/macros/s/.../exec',
  BUSINESS_NAME: 'Rio Trading',
  BUSINESS_TAGLINE: 'Wholesale Catalogue',
};
```

- `SHEET_CSV_URL` must point to the published CSV for the product tab.
- `ORDER_API_URL` must point to the deployed Apps Script web app ending in `/exec`.
- Business display values affect the catalogue and browser-generated PDF.
- The owner email address is intentionally configured only in `apps-script/Code.gs`.

Do not place secret credentials in frontend files. Everything delivered to the browser, including both endpoint URLs, is publicly inspectable.

## Product Management

Products are managed in the existing Google Sheet. The published product tab must contain these columns:

| Column | Required | Purpose |
| --- | --- | --- |
| `id` | Yes | Stable, unique product identifier used by the cart and backend. |
| `name` | Yes | Product name displayed and saved with the order. |
| `category` | Yes | Parent category displayed on cards and used for filtering. |
| `subcategory` | No | Optional subcategory used by configured parent categories. |
| `price` | Yes | Positive unit price in GBP. |
| `unit` | No | Sales unit such as `case`, `pack`, `box`, or `unit`. |
| `stock` | No | Informational stock wording displayed on the card. |
| `image` | No | Public HTTP(S) product image URL. |
| `active` | No | `true`, `1`, or `yes` displays the product; `false` or `0` hides it. Blank defaults to active. |

Product IDs must remain unique. Invalid prices, duplicate IDs, malformed active values, missing required columns, or an empty catalogue cause the frontend to show **Catalogue unavailable** and prevent ordering.

The top-level category buttons are currently defined in `index.html`. Subcategory mappings are defined in `SUBCATEGORIES` inside `script.js`. Adding a completely new category therefore still requires a small code update as well as a new sheet value.

The `stock` value is currently descriptive only. It does not limit quantities, reserve inventory, or prevent an order that exceeds the displayed stock.

## Calculation Rules

All current calculations are in GBP without VAT:

1. The unit price is converted to integer pennies.
2. Quantity must be a positive whole number.
3. A percentage item discount is calculated against the gross line total and rounded to the nearest penny.
4. A fixed item discount is a per-unit value, rounded to pennies and limited to the unit price.
5. An order-level percentage discount is calculated after item discounts and rounded to the nearest penny. A fixed order discount is rounded to pennies and applied once, never per item.
6. Apps Script repeats these rules using the authoritative product price. Its saved response is used for the successful order result and Order Confirmation.

Only one order-level discount mode can be active at a time, and a fixed discount cannot exceed the subtotal. No VAT, delivery charge, minimum-order value, payment terms, or stock reservation is currently calculated.

## Order Storage and Email

The Apps Script backend uses three tabs in the same spreadsheet:

- The existing product tab is the authoritative catalogue.
- `Orders` stores one row per accepted order, customer details, totals, fulfilment status, and email status.
- `Order Items` stores the line-item snapshots linked by order reference.

The fixed owner recipient is `riotraders87@gmail.com`. Email is attempted only after both order records have been saved. If email delivery fails, the permanent order remains available in the spreadsheet and its email status becomes `Failed`.

The customer's email is retained as part of the business order record and included in the owner's order information. The current system does not email the retailer.

Full Apps Script installation, authorisation, testing, and deployment instructions are in [`apps-script/README.md`](apps-script/README.md) and [`apps-script/PHASE-3.md`](apps-script/PHASE-3.md).

## Testing

Run the complete automated suite from the project root:

```bash
node tests/money.test.js
node tests/order-api.test.js
node apps-script/tests/run-tests.js
```

The tests cover:

- Integer-pence conversion and rounding
- Frontend/backend calculation parity across catalogue-like prices, quantities, item discounts, and percentage/fixed order discounts
- Order request construction and response mapping
- Duplicate-safe submissions
- Server validation and authoritative price calculation
- Permanent row creation and recovery behaviour
- Spreadsheet formula-injection protection
- PDF content and email status handling

`Phase2Test.gs` and `Phase3Test.gs` also provide manual Apps Script checks that can be run from the Apps Script editor against the configured workbook.

## Deployment

### Static frontend

Deploy these files together:

- `index.html`
- `style.css`
- `money.js`
- `order-api.js`
- `script.js`
- `assets/`

The frontend can be hosted by GitHub Pages or another static web host. Merging or pushing frontend files does not automatically update the Apps Script web app unless a separate deployment workflow has been configured.

### Apps Script backend

Changes under `apps-script/` must be copied or synchronised to the Apps Script project and deployed as a new web-app version. After deployment, confirm that `CONFIG.ORDER_API_URL` still points to the correct `/exec` URL.

The backend script must remain authorised by the Google account that owns the spreadsheet and sends the owner email.

The current backend accepts legacy version-1 percentage-only requests and version-2 `% / £` order-discount requests. When releasing the fixed order-discount feature, deploy `apps-script/Code.gs` first and the static frontend second. This keeps the existing site working during the cutover and ensures an old backend cannot silently accept a fixed discount it does not understand.

## Current Scope and Known Limitations

- The application is intended for the owner/salesperson, but the static site currently has no login or access restriction. Anyone who discovers its URL can open the catalogue and attempt an order.
- The Apps Script endpoint must be publicly callable for the static frontend. It reduces abuse risk through authoritative recalculation, request validation, a fixed email recipient, duplicate protection, and limits, but it is not user authentication.
- Product management is performed directly in Google Sheets; there is no private product-admin page yet.
- Catalogue categories are partly hard-coded in the frontend.
- Catalogue values are owner-managed trusted data, and some product-card fields are still rendered through HTML templates rather than exclusively through `textContent`.
- Stock is informational and is not enforced at submission.
- VAT, delivery charges, delivery dates, customer account numbers, payment terms, and customer purchase-order references are not implemented.
- The retailer does not currently receive an automatic confirmation email.
- Email delivery depends on Apps Script authorisation and Google's daily email quota.
- Orders can be marked `Open`, `Delivered`, or `Cancelled`; there is no larger fulfilment or delivery-management workflow.

These limitations reflect the current small-business scope and are the remaining areas to consider during future hardening and polishing.

## Related Documentation

- [`docs/order-system-phase-1.md`](docs/order-system-phase-1.md) — original permanent-order design and data contract
- [`apps-script/README.md`](apps-script/README.md) — workbook and Apps Script installation instructions
- [`apps-script/PHASE-3.md`](apps-script/PHASE-3.md) — save-first PDF/email implementation and acceptance testing
