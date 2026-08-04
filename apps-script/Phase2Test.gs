/*
 * Optional manual Phase 2 persistence test.
 *
 * Run runPhase2PersistenceTest from the Apps Script editor after
 * setupOrderSystem. It writes one clearly marked test order and never sends an
 * email. Running it again verifies duplicate protection. Run
 * removePhase2PersistenceTest only when you want to delete that exact test.
 */

var PHASE_2_TEST_SUBMISSION_ID = '00000000-0000-4000-8000-000000000002';

function runPhase2PersistenceTest() {
  var result = processOrder_({
    contractVersion: 1,
    submissionId: PHASE_2_TEST_SUBMISSION_ID,
    customer: {
      shopName: '[TEST] Phase 2 Persistence',
      contactName: 'Rio Trading Test',
      phone: '07700900123',
      email: 'riotraders87@gmail.com',
      notes: 'Safe Phase 2 test order. No email is sent.',
    },
    items: [
      { productId: '1', quantity: 2, discount: { mode: 'pct', value: 10 } },
      { productId: '5', quantity: 1, discount: null },
    ],
    orderDiscountPct: 5,
  }, { skipEmail: true });

  console.log(JSON.stringify(result));
  return result;
}

function removePhase2PersistenceTest() {
  var spreadsheet = openConfiguredSpreadsheet_();
  var sheets = getRequiredSheets_(spreadsheet);
  var lock = LockService.getScriptLock();
  lock.waitLock(ORDER_SYSTEM.LOCK_TIMEOUT_MS);

  try {
    var existing = findOrderBySubmissionId_(sheets.orders, PHASE_2_TEST_SUBMISSION_ID);
    if (!existing) {
      var missing = { ok: true, removed: false, message: 'No Phase 2 test order was found.' };
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

function deleteItemRowsByOrderRef_(sheet, orderRef) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var refs = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var index = refs.length - 1; index >= 0; index--) {
    if (String(refs[index][0]) === orderRef) sheet.deleteRow(index + 2);
  }
}
