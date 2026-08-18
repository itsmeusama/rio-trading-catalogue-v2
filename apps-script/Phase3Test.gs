/*
 * Manual Phase 3 email/PDF acceptance test.
 *
 * The first run saves one test order and sends one real email with a PDF to
 * riotraders87@gmail.com. A second run must return the same order as a
 * duplicate and must not send another email.
 */

var PHASE_3_TEST_SUBMISSION_ID = '00000000-0000-4000-8000-000000000004';

function runPhase3EmailTest() {
  var result = processOrder_({
    contractVersion: 2,
    submissionId: PHASE_3_TEST_SUBMISSION_ID,
    customer: {
      shopName: '[TEST] Phase 3 PDF Email',
      contactName: 'Rio Trading Test',
      phone: '07700900123',
      email: 'riotraders87@gmail.com',
      notes: 'Fixed order discount acceptance test. Verify the attached PDF before cleanup.',
    },
    items: [
      { productId: '1', quantity: 2, discount: { mode: 'pct', value: 10 } },
      { productId: '5', quantity: 1, discount: { mode: 'fixed', value: 2 } },
    ],
    orderDiscount: { mode: 'fixed', value: 3 },
  });

  console.log(JSON.stringify(result));
  return result;
}

function removePhase3EmailTest() {
  var spreadsheet = openConfiguredSpreadsheet_();
  var sheets = getRequiredSheets_(spreadsheet);
  var lock = LockService.getScriptLock();
  lock.waitLock(ORDER_SYSTEM.LOCK_TIMEOUT_MS);

  try {
    var existing = findOrderBySubmissionId_(sheets.orders, PHASE_3_TEST_SUBMISSION_ID);
    if (!existing) {
      var missing = { ok: true, removed: false, message: 'No Phase 3 test order was found.' };
      console.log(JSON.stringify(missing));
      return missing;
    }

    var orderRef = String(existing.values[ORDER_COLUMN.ORDER_REF - 1]);
    deleteItemRowsByOrderRef_(sheets.orderItems, orderRef);
    sheets.orders.deleteRow(existing.rowNumber);
    SpreadsheetApp.flush();

    var result = { ok: true, removed: true, orderRef: orderRef };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}
