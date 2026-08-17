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
const moneyPath = path.join(__dirname, '..', '..', 'money.js');
const moneySource = fs.readFileSync(moneyPath, 'utf8');

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
new vm.Script(moneySource, { filename: moneyPath }).runInContext(context);

function productRows() {
  return [
    ['id', 'name', 'category', 'subcategory', 'price', 'unit', 'stock', 'image', 'active'],
    ['1', 'Tetley Tea Bags', 'Grocery & Essentials', 'English', 10, 'case', 'In Stock (10)', '', true],
    ['5', 'Coca-Cola 330ml', 'Beverages', '', 12.99, 'case', 'In Stock (200)', '', true],
    ['17', 'Inactive Cake', 'Snacks', 'Cakes & Bakery', 9, 'case', 'In Stock (72)', '', false],
    ['20', 'Tetley Decaf Tea Bags 80pk', 'Grocery & Essentials', 'English', 2.49, 'case', 'In Stock (20)', '', true],
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

function assertMoneyParity(price, quantity, discount, orderDiscountPct) {
  const product = {
    id: 'parity-product',
    name: 'Parity Product',
    category: 'Test',
    unit: 'case',
    unitPricePence: context.toPence_(price),
    active: true,
  };
  const request = {
    items: [{ productId: product.id, quantity, discount }],
    orderDiscountPct,
  };
  const backend = context.calculateOrder_(request, { [product.id]: product });
  const frontendLine = context.RioMoney.calculateLine(
    product.unitPricePence,
    quantity,
    discount
  );
  const frontend = context.RioMoney.calculateOrder([frontendLine], orderDiscountPct);
  const label = JSON.stringify({ price, quantity, discount, orderDiscountPct });

  [
    'grossSubtotalPence',
    'itemDiscountPence',
    'subtotalPence',
    'orderDiscountPence',
    'totalPence',
  ].forEach(field => {
    assert.equal(frontend[field], backend[field], `${field} mismatch for ${label}`);
  });
}

function run() {
  const realDeliverSavedOrderEmail = context.deliverSavedOrderEmail_;
  const catalogue = context.buildProductCatalogue_(productRows());
  assert.equal(Object.keys(catalogue).length, 4, 'ID-only rows must be ignored');
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

  const parityPayload = validPayload();
  parityPayload.items = [
    { productId: '20', quantity: 1, discount: { mode: 'pct', value: 50 } },
    { productId: '5', quantity: 3, discount: { mode: 'fixed', value: 2 } },
  ];
  parityPayload.orderDiscountPct = 5;
  const parityRequest = context.validateOrderRequest_(parityPayload);
  const backendParity = context.calculateOrder_(parityRequest, catalogue);
  const frontendLines = parityRequest.items.map(item => context.RioMoney.calculateLine(
    catalogue[item.productId].unitPricePence,
    item.quantity,
    item.discount
  ));
  const frontendParity = context.RioMoney.calculateOrder(frontendLines, parityRequest.orderDiscountPct);
  assert.deepEqual(
    {
      grossSubtotalPence: frontendParity.grossSubtotalPence,
      itemDiscountPence: frontendParity.itemDiscountPence,
      subtotalPence: frontendParity.subtotalPence,
      orderDiscountPence: frontendParity.orderDiscountPence,
      totalPence: frontendParity.totalPence,
    },
    {
      grossSubtotalPence: backendParity.grossSubtotalPence,
      itemDiscountPence: backendParity.itemDiscountPence,
      subtotalPence: backendParity.subtotalPence,
      orderDiscountPence: backendParity.orderDiscountPence,
      totalPence: backendParity.totalPence,
    },
    'frontend and backend must use identical penny-rounding rules'
  );
  assert.equal(frontendParity.totalPence, 3250);

  const cataloguePrices = [
    1.1, 2.49, 3.2, 5.5, 6.5, 9, 9.6, 10, 10.44,
    11.4, 11.52, 12.6, 12.99, 13.8, 14.88, 18.5, 20, 22.8,
  ];
  const quantities = [1, 2, 3, 10];
  const percentages = [5, 12.5, 15, 33.33, 50, 100];
  const orderPercentages = [0, 5, 17.5, 50, 100];
  let parityCaseCount = 0;

  cataloguePrices.forEach(price => {
    quantities.forEach(quantity => {
      orderPercentages.forEach(orderPct => {
        assertMoneyParity(price, quantity, null, orderPct);
        parityCaseCount++;
        percentages.forEach(percentage => {
          assertMoneyParity(price, quantity, { mode: 'pct', value: percentage }, orderPct);
          parityCaseCount++;
        });
      });

      [0.01, 0.1, 1, 1.235, 2.49].filter(value => value <= price).forEach(value => {
        assertMoneyParity(price, quantity, { mode: 'fixed', value }, 5);
        parityCaseCount++;
      });
    });
  });
  assert.equal(parityCaseCount, 2872, 'the rounding parity matrix must remain comprehensive');

  assert.equal(context.safeSheetText_('Corner Shop Ltd'), 'Corner Shop Ltd');
  assert.equal(context.safeSheetText_(''), '');
  assert.equal(context.safeSheetText_("'=1+1"), "'=1+1");
  assert.equal(context.safeSheetText_('=1+1'), "'=1+1");
  assert.equal(context.safeSheetText_('+447700900123'), "'+447700900123");
  assert.equal(context.safeSheetText_('-10'), "'-10");
  assert.equal(context.safeSheetText_('@example'), "'@example");

  const formulaPayload = validPayload();
  formulaPayload.customer = {
    shopName: '=1+1',
    contactName: '@contact',
    phone: '+447700900123',
    email: 'orders@cornershop.example',
    notes: '=HYPERLINK("https://example.invalid","Open")',
  };
  const formulaRequest = context.validateOrderRequest_(formulaPayload);
  const formulaOrderRow = context.buildOrderRow_(
    'ORD-20260802-SAFE1',
    new Date('2026-08-02T12:00:00Z'),
    formulaRequest,
    calculated
  );
  assert.equal(formulaOrderRow[3], "'=1+1");
  assert.equal(formulaOrderRow[4], "'@contact");
  assert.equal(formulaOrderRow[5], "'+447700900123");
  assert.equal(formulaOrderRow[6], 'orders@cornershop.example');
  assert.equal(formulaOrderRow[7], "'=HYPERLINK(\"https://example.invalid\",\"Open\")");
  assert.equal(formulaRequest.customer.shopName, '=1+1', 'sanitising persistence must not mutate customer data');
  assert.equal(formulaRequest.customer.phone, '+447700900123', 'valid +44 phone numbers must remain intact');

  let writtenFormulaOrderRow = null;
  let writtenFormulaItemRows = null;
  context.SpreadsheetApp = { flush() {} };
  const formulaSheets = {
    orders: {
      getLastRow: () => 1,
      getRange: () => ({
        setValues(values) { writtenFormulaOrderRow = values[0].slice(); },
        clearContent() {},
      }),
    },
    orderItems: {
      getLastRow: () => 1,
      getRange: () => ({
        setValues(values) { writtenFormulaItemRows = values.map(row => row.slice()); },
        clearContent() {},
      }),
    },
  };
  context.persistOrder_(
    formulaSheets,
    'ORD-20260802-SAFE1',
    new Date('2026-08-02T12:00:00Z'),
    formulaRequest,
    calculated
  );
  assert.equal(writtenFormulaOrderRow[3], "'=1+1", 'the persistence path must write formula-like text literally');
  assert.equal(writtenFormulaOrderRow[5], "'+447700900123", 'the persistence path must preserve +44 phone text');
  assert.equal(writtenFormulaOrderRow[7], "'=HYPERLINK(\"https://example.invalid\",\"Open\")");
  assert.equal(writtenFormulaItemRows.length, calculated.lines.length, 'formula protection must not alter order lines');

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

  console.log('Phase 3 tests passed: calculation parity, persistence, formula safety, duplicate safety, PDF HTML and email status handling.');
}

run();
