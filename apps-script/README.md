# Phase 2 — Permanent Order Persistence

Phase 2 adds the permanent order backend to the existing native Google Sheet.
It creates `Orders` and `Order Items`, validates browser requests against the
live product tab, calculates all prices in Apps Script, generates permanent
order references, and prevents duplicate submissions.

It deliberately does **not** send email or PDFs yet. New test/API orders have
`email_status = Pending`; Phase 3 will add PDF email delivery and connect the
frontend only after persistence is verified.

## Target workbook

- Workbook: [Rio_Trading_Product_Sheet](https://docs.google.com/spreadsheets/d/1pDmFNcjy9kBjF0qjH-SoOWXJqbajEqZgsSVdiRTAYtk/edit)
- Product tab: `rio_trading_products_template`
- Product sheet ID: `1147224303`
- Owner email reserved for Phase 3: `riotraders87@gmail.com`
- Timezone applied by setup: `Europe/London`

## One-time installation

1. Open the target workbook using `riotraders87@gmail.com`.
2. Choose **Extensions > Apps Script**.
3. Replace the editor's `Code.gs` with this folder's `Code.gs`.
4. Add a script file named `Phase2Test` and copy in `Phase2Test.gs`.
5. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**.
6. Replace that manifest with this folder's `appsscript.json`.
7. Select `setupOrderSystem` in the function menu and click **Run**.
8. Review and approve the Google authorization prompt for the workbook owner.
9. Select `validateOrderSystemSetup`, run it, and check the execution log.

`setupOrderSystem` checks the product tab before making changes. It creates only
missing order tabs, refuses mismatched existing headers, and never overwrites
existing order rows. It is safe to run again after a successful setup.

## Expected setup result

The workbook should now contain:

```text
Rio_Trading_Product_Sheet
├── rio_trading_products_template
├── Orders
└── Order Items
```

`Orders` has one row per accepted order. `Order Items` has one row per product
line and links back through `order_ref`. The status dropdowns are:

- Order: `Open`, `Delivered`, `Cancelled`
- Email: `Pending`, `Sent`, `Failed`

## Safe manual persistence test

1. Run `runPhase2PersistenceTest` from the Apps Script editor.
2. Confirm its result contains `ok: true`, `saved: true`, `duplicate: false`, an
   `ORD-...` reference, and `emailStatus: Pending`.
3. In `Orders`, confirm exactly one row whose shop name is
   `[TEST] Phase 2 Persistence`.
4. In `Order Items`, confirm exactly two rows with that same `order_ref`.
5. Run `runPhase2PersistenceTest` again.
6. Confirm it returns the same reference with `duplicate: true` and creates no
   additional rows.
7. Run `removePhase2PersistenceTest` to remove only this clearly identified
   test order and its two item rows.

No email is sent by this test. Do not deploy or connect the frontend yet; that
cutover belongs to Phase 3, together with Apps Script PDF/email delivery.

Phase 3 has now been implemented separately. Continue with
[`PHASE-3.md`](PHASE-3.md) after the Phase 2 persistence test passes.

## Request contracts accepted by the current endpoint

The current backend remains backward compatible with the original version-1
request documented in
[`docs/order-system-phase-1.md`](../docs/order-system-phase-1.md). Version 1
supports the legacy `orderDiscountPct` field.

The current frontend uses version 2. Its whole-order discount is either `null`
or an explicit mode/value object:

```json
{
  "contractVersion": 2,
  "orderDiscount": {
    "mode": "fixed",
    "value": 10
  }
}
```

`mode` may be `pct` or `fixed`. The fixed value is GBP applied once after all
item discounts; it must not exceed the authoritative subtotal. Only one of the
two contract shapes is accepted in a request, preventing ambiguous totals.

No new spreadsheet columns are required. For a percentage discount,
`order_discount_pct` contains the percentage. For a fixed discount it remains
blank. `order_discount_amount` always stores the actual GBP amount deducted.

For both versions, the backend trusts only product IDs, quantities, and
discount instructions from the browser. Product names, categories, units, and
prices are reloaded from the product tab before the order is saved.
