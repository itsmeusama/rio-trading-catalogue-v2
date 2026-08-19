#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'order-api.js'), 'utf8');
const context = vm.createContext({
  console,
  JSON,
  Math,
  Number,
  Object,
  String,
  Array,
  Uint8Array,
  TextEncoder,
  Date,
  Error,
  RegExp,
  setTimeout,
  clearTimeout,
  AbortController,
  crypto: require('node:crypto').webcrypto,
});
new vm.Script(source, { filename: 'order-api.js' }).runInContext(context);

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

async function run() {
  const api = context.RioOrderApi;
  const storage = memoryStorage();
  const baseRequest = {
    contractVersion: 2,
    customer: { shopName: 'Corner Shop', contactName: 'John', phone: '07700900123', email: 'a@b.co', notes: '' },
    items: [{ productId: '1', quantity: 2, discount: null }],
    orderDiscount: null,
  };

  const fingerprint = await api.fingerprintPayload(baseRequest);
  const sameFingerprint = await api.fingerprintPayload(JSON.parse(JSON.stringify(baseRequest)));
  const changedFingerprint = await api.fingerprintPayload({
    ...baseRequest,
    orderDiscount: { mode: 'fixed', value: 5 },
  });
  assert.equal(fingerprint, sameFingerprint);
  assert.notEqual(fingerprint, changedFingerprint);

  const firstId = api.getOrCreateSubmissionId(fingerprint, storage);
  const retryId = api.getOrCreateSubmissionId(fingerprint, storage);
  const changedId = api.getOrCreateSubmissionId(changedFingerprint, storage);
  assert.equal(firstId, retryId, 'unchanged retry must reuse its submission ID');
  assert.notEqual(firstId, changedId, 'changed order must receive a new submission ID');

  let posted = null;
  const responsePayload = {
    ok: true,
    saved: true,
    duplicate: false,
    orderRef: 'ORD-20260804-ABCDE',
    createdAt: '2026-08-04T14:30:00+01:00',
    orderStatus: 'Open',
    emailStatus: 'Sent',
    totals: {
      currency: 'GBP', grossSubtotal: 20, itemDiscountAmount: 2,
      subtotal: 18, orderDiscountMode: 'fixed', orderDiscountValue: 0.9,
      orderDiscountPct: 0, orderDiscountAmount: 0.9, total: 17.1,
    },
    items: [{
      productId: '1', name: 'Tea', unit: 'case', quantity: 2, unitPrice: 10,
      discountMode: 'pct', discountValue: 10, discountAmount: 2,
      grossLineTotal: 20, lineTotal: 18,
    }],
  };
  const fetched = await api.postOrder(
    'https://script.google.com/macros/s/test-deployment/exec',
    { ...baseRequest, submissionId: firstId },
    {
      fetchImpl: async (url, options) => {
        posted = { url, options };
        return { ok: true, text: async () => JSON.stringify(responsePayload) };
      },
      timeoutMs: 5000,
    }
  );
  assert.equal(fetched.orderRef, responsePayload.orderRef);
  assert.equal(posted.options.method, 'POST');
  assert.equal(posted.options.headers, undefined, 'request must avoid CORS-preflight headers');
  assert.equal(JSON.parse(posted.options.body).submissionId, firstId);

  const orderData = api.toOrderData(responsePayload, baseRequest.customer, []);
  assert.equal(orderData.orderRef, responsePayload.orderRef);
  assert.equal(orderData.items[0].discountLabel, '10% off');
  assert.equal(orderData.total, 17.1);
  assert.equal(orderData.orderDiscountMode, 'fixed');
  assert.equal(orderData.orderDiscountValue, 0.9);
  assert.equal(orderData.orderDiscountAmt, 0.9);
  assert.equal(orderData.emailStatus, 'Sent');

  const legacyPercentageData = api.toOrderData({
    ...responsePayload,
    totals: {
      ...responsePayload.totals,
      orderDiscountMode: undefined,
      orderDiscountValue: undefined,
      orderDiscountPct: 5,
    },
  }, baseRequest.customer, []);
  assert.equal(legacyPercentageData.orderDiscountMode, 'pct');
  assert.equal(legacyPercentageData.orderDiscountValue, 5);

  await assert.rejects(
    api.postOrder(
      'https://script.google.com/macros/s/test-deployment/exec',
      baseRequest,
      {
        fetchImpl: async () => ({
          ok: true,
          text: async () => JSON.stringify({ ok: false, saved: false, code: 'INVALID_ITEM', message: 'Invalid item' }),
        }),
      }
    ),
    error => error.code === 'INVALID_ITEM' && error.response.saved === false
  );

  api.clearSubmission(storage);
  assert.equal(storage.getItem(api.STORAGE_KEY), null);
  console.log('Order API client tests passed: idempotency, POST contract and authoritative response mapping.');
}

run();
