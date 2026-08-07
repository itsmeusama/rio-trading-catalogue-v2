#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const codePath = path.join(__dirname, '..', 'Code.gs');
const source = fs.readFileSync(codePath, 'utf8');
const manualTestPath = path.join(__dirname, '..', 'Phase2Test.gs');
const manualTestSource = fs.readFileSync(manualTestPath, 'utf8');
const phase3TestPath = path.join(__dirname, '..', 'Phase3Test.gs');
const phase3TestSource = fs.readFileSync(phase3TestPath, 'utf8');

const context = vm.createContext({
  console,
  Date,
  Error,
  JSON,
  Math,
  Number,
  Object,
  String,
  Array,
  Boolean,
  RegExp,
  isNaN,
  Utilities: {
    formatDate: (date, timeZone, pattern) => pattern === 'yyyyMMdd' ? '20260804' : '04/08/2026 14:30',
    getUuid: () => 'abcde000-0000-4000-8000-000000000000',
  },
});

new vm.Script(source + '\n' + manualTestSource + '\n' + phase3TestSource, { filename: codePath }).runInContext(context);

function productRows() {
  return [
    ['id', 'name', 'category', 'subcategory', 'price', 'unit', 'stock', 'image', 'active'],
    ['1', 'Tetley Tea Bags', 'Grocery & Essentials', 'English', 10, 'case', 'In Stock (10)', '', true],
    ['5', 'Coca-Cola 330ml', 'Beverages', '', 12.99, 'case', 'In Stock (200)', '', true],
    ['17', 'Inactive Cake', 'Snacks', 'Cakes & Bakery', 9, 'case', 'In Stock (72)', '', false],
    ['23', '', '', '', '', '', '', '', ''],
  ];
}

function validPayload() {
  return {
    contractVersion: 1,
    submissionId: '11111111-1111-4111-8111-111111111111',
    customer: {
      shopName: 'Corner Shop Ltd',
      contactName: 'John Smith',
      phone: '07700 900123',
      email: 'orders@cornershop.example',
      notes: 'Before 10am',
    },
    items: [
      { productId: '1', quantity: 2, discount: { mode: 'pct', value: 10 } },
      { productId: '5', quantity: 1, discount: { mode: 'fixed', value: 2 } },
    ],
    orderDiscountPct: 5,
  };
}

function expectPublicError(code, fn) {
  assert.throws(fn, error => error && error.publicCode === code);
}

function run() {
  const realDeliverSavedOrderEmail = context.deliverSavedOrderEmail_;
  const catalogue = context.buildProductCatalogue_(productRows());
  assert.equal(Object.keys(catalogue).length, 3, 'ID-only rows must be ignored');
  assert.equal(catalogue['1'].unitPricePence, 1000);
  assert.equal(catalogue['17'].active, false);

  const request = context.validateOrderRequest_(validPayload());
  const calculated = context.calculateOrder_(request, catalogue);
  assert.deepEqual(
    {
      gross: calculated.grossSubtotalPence,
      itemDiscount: calculated.itemDiscountPence,
      subtotal: calculated.subtotalPence,
      orderDiscount: calculated.orderDiscountPence,
      total: calculated.totalPence,
      itemCount: calculated.itemCount,
    },
    {
      gross: 3299,
      itemDiscount: 400,
      subtotal: 2899,
      orderDiscount: 145,
      total: 2754,
      itemCount: 3,
    }
  );

  const duplicateLinePayload = validPayload();
  duplicateLinePayload.items.push({ productId: '1', quantity: 1, discount: null });
  expectPublicError('INVALID_ITEM', () => context.validateOrderRequest_(duplicateLinePayload));

  const inactivePayload = validPayload();
  inactivePayload.items = [{ productId: '17', quantity: 1, discount: null }];
  expectPublicError('PRODUCT_INACTIVE', () => {
    context.calculateOrder_(context.validateOrderRequest_(inactivePayload), catalogue);
  });

  const missingPayload = validPayload();
  missingPayload.items = [{ productId: '999', quantity: 1, discount: null }];
  expectPublicError('PRODUCT_NOT_FOUND', () => {
    context.calculateOrder_(context.validateOrderRequest_(missingPayload), catalogue);
  });

  const excessiveFixedDiscount = validPayload();
  excessiveFixedDiscount.items = [
    { productId: '1', quantity: 1, discount: { mode: 'fixed', value: 10.01 } },
  ];
  expectPublicError('INVALID_DISCOUNT', () => {
    context.calculateOrder_(context.validateOrderRequest_(excessiveFixedDiscount), catalogue);
  });

  let persisted = null;
  let existingOrder = null;
  const lock = { waitLock() {}, releaseLock() {} };
  const processItemRows = context.buildOrderItemRows_('ORD-20260802-ABCDE', calculated.lines);
  const processSheets = {
    product: {},
    orders: {},
    orderItems: {
      getLastRow: () => processItemRows.length + 1,
      getRange: () => ({ getValues: () => processItemRows.map(row => row.slice()) }),
    },
  };
  context.LockService = { getScriptLock: () => lock };
  context.openConfiguredSpreadsheet_ = () => ({});
  context.getRequiredSheets_ = () => processSheets;
  context.findOrderBySubmissionId_ = () => existingOrder;
  context.readProductCatalogue_ = () => catalogue;
  context.generateUniqueOrderRef_ = () => 'ORD-20260802-ABCDE';
  context.persistOrder_ = (...args) => {
    persisted = args;
    return { orderRowNumber: 2 };
  };
  context.deliverSavedOrderEmail_ = () => ({ status: 'Sent' });

  const accepted = context.processOrder_(validPayload());
  assert.equal(accepted.ok, true);
  assert.equal(accepted.saved, true);
  assert.equal(accepted.duplicate, false);
  assert.equal(accepted.orderRef, 'ORD-20260802-ABCDE');
  assert.equal(accepted.emailStatus, 'Sent');
  assert.equal(accepted.items.length, 2);
  assert.ok(persisted, 'accepted order must be persisted');

  const existingValues = context.buildOrderRow_(
    accepted.orderRef,
    new Date('2026-08-02T12:00:00Z'),
    request,
    calculated
  );
  existingOrder = { rowNumber: 2, values: existingValues };
  persisted = null;
  const duplicate = context.processOrder_(validPayload());
  assert.equal(duplicate.saved, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.orderRef, accepted.orderRef);
  assert.equal(duplicate.items.length, 2);
  assert.equal(persisted, null, 'duplicate retry must not persist another order');
  context.deliverSavedOrderEmail_ = realDeliverSavedOrderEmail;

  const savedOrderForHtml = {
    orderRef: accepted.orderRef,
    createdAt: new Date('2026-08-04T13:30:00Z'),
    customer: {
      shopName: '<script>Corner & Shop</script>',
      contactName: 'John Smith',
      phone: '07700 900123',
      email: 'orders@cornershop.example',
      notes: 'Back door\nBefore 10am',
    },
    currency: 'GBP',
    itemCount: calculated.itemCount,
    grossSubtotal: context.fromPence_(calculated.grossSubtotalPence),
    itemDiscountAmount: context.fromPence_(calculated.itemDiscountPence),
    subtotal: context.fromPence_(calculated.subtotalPence),
    orderDiscountPct: calculated.orderDiscountPct,
    orderDiscountAmount: context.fromPence_(calculated.orderDiscountPence),
    total: context.fromPence_(calculated.totalPence),
    orderStatus: 'Open',
    lines: calculated.lines.map(line => ({
      lineNumber: line.lineNumber,
      productId: line.productId,
      productName: line.productName,
      category: line.category,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: context.fromPence_(line.unitPricePence),
      discountMode: line.discountMode,
      discountValue: line.discountValue,
      discountAmount: context.fromPence_(line.discountPence),
      grossLineTotal: context.fromPence_(line.grossLinePence),
      lineTotal: context.fromPence_(line.lineTotalPence),
    })),
  };
  const html = context.buildOrderDocumentHtml_(savedOrderForHtml, true);
  assert.match(html, /ORDER CONFIRMATION/);
  assert.match(html, /&lt;script&gt;Corner &amp; Shop&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>Corner/);
  assert.match(html, /Back door<br>Before 10am/);

  const deliveryRequest = context.validateOrderRequest_(validPayload());
  const deliveryOrderValues = context.buildOrderRow_(
    accepted.orderRef,
    savedOrderForHtml.createdAt,
    deliveryRequest,
    calculated
  );
  deliveryOrderValues[3] = savedOrderForHtml.customer.shopName;
  const deliveryItemValues = context.buildOrderItemRows_(accepted.orderRef, calculated.lines);
  let sentMessages = [];
  const pdfBlob = {
    name: '',
    getAs() { return this; },
    setName(name) { this.name = name; return this; },
  };
  context.MimeType = { PDF: 'application/pdf' };
  context.Utilities.newBlob = () => pdfBlob;
  context.MailApp = {
    getRemainingDailyQuota: () => 50,
    sendEmail: (...args) => { sentMessages.push(args); },
  };
  context.SpreadsheetApp = { flush() {} };

  const deliverySheets = {
    orders: {
      getLastRow: () => 2,
      getRange(row, column, rowCount, columnCount) {
        return {
          getValues: () => [deliveryOrderValues.slice()],
          setValues(values) {
            values[0].forEach((value, index) => {
              deliveryOrderValues[column - 1 + index] = value;
            });
          },
        };
      },
    },
    orderItems: {
      getLastRow: () => deliveryItemValues.length + 1,
      getRange: () => ({ getValues: () => deliveryItemValues.map(row => row.slice()) }),
    },
  };

  const sent = context.deliverSavedOrderEmail_(deliverySheets, accepted.orderRef);
  assert.equal(sent.status, 'Sent');
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0][0], 'riotraders87@gmail.com');
  assert.equal(
    sentMessages[0][3].attachments[0].name,
    'Rio-Trading-Order-Confirmation-ORD-20260802-ABCDE.pdf'
  );
  assert.equal(deliveryOrderValues[17], 'Sent');

  const alreadySent = context.deliverSavedOrderEmail_(deliverySheets, accepted.orderRef);
  assert.equal(alreadySent.status, 'Sent');
  assert.equal(sentMessages.length, 1, 'a Sent order must not be emailed twice');

  deliveryOrderValues[17] = 'Pending';
  context.MailApp.sendEmail = () => { throw new Error('Test delivery failure'); };
  const failed = context.deliverSavedOrderEmail_(deliverySheets, accepted.orderRef);
  assert.equal(failed.status, 'Failed');
  assert.equal(deliveryOrderValues[17], 'Failed');
  assert.match(String(deliveryOrderValues[19]), /Test delivery failure/);

  console.log('Phase 3 tests passed: persistence, duplicate safety, PDF HTML and email status handling.');
}

run();
