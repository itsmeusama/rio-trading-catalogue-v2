# Phase 3 - PDF Email Delivery

Phase 3 keeps the verified Phase 2 persistence boundary and adds owner email
delivery. A new order is saved to `Orders` and `Order Items` first. Only then is
a PDF generated from those saved rows and emailed to
`riotraders87@gmail.com`.

The frontend is intentionally not switched in this milestone. The backend must
pass the real email/PDF acceptance test before it is deployed and connected to
the catalogue.

## Upgrade the existing standalone Apps Script project

1. Open the standalone Rio Trading Apps Script project.
2. Replace the entire existing `Code.gs` with this folder's updated `Code.gs`.
3. Replace the existing `Phase2Test.gs` with the updated `Phase2Test.gs`. This
   keeps the Phase 2 persistence test email-free.
4. Add a script file named `Phase3Test` and copy in `Phase3Test.gs`.
5. Leave `appsscript.json` unchanged; its V8 runtime and London timezone are
   already correct.
6. Save every file.
7. Select `validateOrderSystemSetup` and click **Run**.
8. Approve the additional permission to send email when Google requests it.

The validation result should now contain:

```json
{
  "ok": true,
  "emailDeliveryEnabled": true,
  "phase": 3
}
```

It also reports `remainingDailyEmailQuota`. No email is sent by the validation
function.

## Real email/PDF acceptance test

This test sends one real email to the fixed owner address.

1. Select `runPhase3EmailTest` and click **Run**.
2. Confirm the result contains `ok: true`, `saved: true`, `duplicate: false`, an
   `ORD-...` reference, and `emailStatus: Sent`.
3. In `Orders`, find `[TEST] Phase 3 PDF Email` and confirm:
   - `order_status` is `Open`;
   - `email_status` is `Sent`;
   - `email_sent_at` contains a timestamp;
   - `email_error` is blank.
4. Confirm `Order Items` contains two rows with the same `order_ref`.
5. In the `riotraders87@gmail.com` inbox, open the message whose subject starts
   `New Rio Trading Order`.
6. Confirm it contains the order confirmation and exactly one PDF attachment named
   `Rio-Trading-Order-Confirmation-ORD-....pdf`.
7. Open the PDF and visually verify:
   - the Rio Trading heading, order reference and date are readable;
   - customer details and notes are complete;
   - both products, quantities, prices and discounts are correct;
   - the fixed whole-order discount is shown as `Order discount (fixed)`;
   - the final order total agrees with the `Orders` row;
   - no text is clipped, overlapping or missing.
8. Run `runPhase3EmailTest` a second time. It must return the same order
   reference with `duplicate: true` and must not send a second email.
9. Run `removePhase3EmailTest` to remove only the test rows from the workbook.
   The received test email remains in Gmail and may be deleted normally.

## Expected failure behaviour

If PDF creation or email delivery fails after saving:

- the API still returns `saved: true`;
- the order remains permanently present;
- `email_status` becomes `Failed`;
- `email_error` records a short operational reason;
- the same browser submission does not create or email a duplicate order.

## Production deployment and frontend cutover

The production web app is deployed at:

```text
https://script.google.com/macros/s/AKfycbzqdonNNlrbyAfF25CnGY4TdhXxstOgDp77PGeGLfaIe-0RHuXerbqpvweSfPwSNI7c/exec
```

After copying the latest `Code.gs` into Apps Script, publish it to the existing
deployment:

1. Choose **Deploy > Manage deployments**.
2. Open the existing web-app deployment and click **Edit**.
3. Under **Version**, choose **New version**.
4. Keep **Execute as: Me** and anonymous access unchanged.
5. Click **Deploy**.

The `/exec` URL remains the same. Publishing a new version is required because
the final response now includes the authoritative saved line items used by the
browser's downloadable Order Confirmation.

The current backend also accepts version-2 requests with percentage or fixed
whole-order discounts while retaining version-1 percentage compatibility.
Deploy this backend version before publishing the matching static frontend.
That release order keeps the existing frontend operational and makes the new
frontend fail closed if it is accidentally served against an older backend.

The frontend now posts through `order-api.js`; EmailJS and its browser SDK have
been removed. An unchanged uncertain retry reuses its submission UUID. If the
cart, discounts or customer details change, the request fingerprint changes and
a fresh UUID is created.

## Final end-to-end test

After the new Apps Script version is deployed, run one order from the catalogue:

1. Add two products, including one item discount and one fixed order discount.
2. Enter clearly marked test customer details and submit once.
3. Confirm the success screen shows a permanent `ORD-...` reference.
4. Confirm one `Orders` row and the matching `Order Items` rows were added.
5. Confirm `email_status` is `Sent` and the owner received one PDF email.
6. Download the browser PDF and compare its items, discounts and total with the
   saved order and emailed PDF.
7. Do not click **Place Another Order** yet. Simulate an unchanged retry only if
   needed; it must return the same reference and create no additional rows or
   email.
8. Click **Place Another Order** only when the test is complete; this clears the
   pending submission identity and starts a genuinely new order.
