const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, '..', 'script.js');
const source = fs.readFileSync(scriptPath, 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist in script.js`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read the full ${name} function.`);
}

function makeClassList() {
  return {
    added: [],
    removed: [],
    toggles: [],
    add(name) { this.added.push(name); },
    remove(name) { this.removed.push(name); },
    toggle(name, value) { this.toggles.push([name, value]); },
  };
}

function makeElement() {
  return {
    value: 'existing value',
    max: '50',
    step: '1',
    placeholder: 'existing placeholder',
    attributes: {},
    classList: makeClassList(),
    setAttribute(name, value) { this.attributes[name] = value; },
  };
}

function runClearCompletedOrder({ storageFails = false } = {}) {
  const elements = {};
  [
    'orderDiscInput', 'orderDiscPanel', 'orderDiscAddBtn', 'orderDiscUnit',
    'shopName', 'contactName', 'phone', 'email',
    'shopNameErr', 'contactNameErr', 'phoneErr', 'emailErr',
  ].forEach(id => { elements[id] = makeElement(); });

  const modeButtons = [
    { dataset: { mode: 'pct' }, classList: makeClassList(), attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
    { dataset: { mode: 'fixed' }, classList: makeClassList(), attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } },
  ];
  const calls = { clearSubmission: 0, removeCart: 0, updateCartUI: 0, renderGrid: 0, resetForm: 0 };

  const RioOrderApi = {
    clearSubmission(storage) {
      assert.strictEqual(storage, context.localStorage);
      calls.clearSubmission += 1;
    },
  };
  const context = {
    document: {
      getElementById(id) { return elements[id] || null; },
      querySelectorAll(selector) {
        assert.strictEqual(selector, '.order-disc-mode-btn');
        return modeButtons;
      },
    },
    window: { RioOrderApi },
    RioOrderApi,
    localStorage: {
      removeItem(key) {
        assert.strictEqual(key, 'rioTradingCart');
        calls.removeCart += 1;
        if (storageFails) throw new Error('Storage unavailable');
      },
    },
    updateCartUI() { calls.updateCartUI += 1; },
    renderGrid() { calls.renderGrid += 1; },
    orderForm: { reset() { calls.resetForm += 1; } },
  };

  vm.runInNewContext(`
    let cart = { 'product-1': 3 };
    let discounts = { 'product-1': { mode: 'pct', value: 10 } };
    let orderDiscount = { mode: 'fixed', value: 5 };
    let lastOrderData = { orderRef: 'ORD-TEST-001' };
    ${extractFunction('resetOrderDiscountControls')}
    ${extractFunction('clearCompletedOrder')}
    globalThis.runRecovery = function() {
      clearCompletedOrder();
      return JSON.stringify({ cart, discounts, orderDiscount, lastOrderData });
    };
  `, context);

  const state = JSON.parse(context.runRecovery());
  return { state, elements, modeButtons, calls };
}

// A confirmed order must leave no cart, discounts, or persisted cart behind.
{
  const result = runClearCompletedOrder();
  assert.deepStrictEqual(result.state, {
    cart: {},
    discounts: {},
    orderDiscount: null,
    lastOrderData: { orderRef: 'ORD-TEST-001' },
  });
  assert.deepStrictEqual(result.calls, {
    clearSubmission: 1,
    removeCart: 1,
    updateCartUI: 1,
    renderGrid: 1,
    resetForm: 1,
  });
  assert.strictEqual(result.elements.orderDiscInput.value, '');
  assert.strictEqual(result.elements.orderDiscInput.max, '100');
  assert.strictEqual(result.elements.orderDiscUnit.textContent, '%');
  assert.deepStrictEqual(result.modeButtons[0].classList.toggles, [['active', true]]);
  assert.deepStrictEqual(result.modeButtons[1].classList.toggles, [['active', false]]);
  ['shopName', 'contactName', 'phone', 'email'].forEach(id => {
    assert.deepStrictEqual(result.elements[id].classList.removed, ['invalid']);
    assert.deepStrictEqual(result.elements[`${id}Err`].classList.added, ['hidden']);
  });
}

// Storage failure must not prevent the in-memory order state and UI from resetting.
{
  const result = runClearCompletedOrder({ storageFails: true });
  assert.deepStrictEqual(result.state, {
    cart: {},
    discounts: {},
    orderDiscount: null,
    lastOrderData: { orderRef: 'ORD-TEST-001' },
  });
  assert.strictEqual(result.calls.updateCartUI, 1);
  assert.strictEqual(result.calls.renderGrid, 1);
  assert.strictEqual(result.calls.resetForm, 1);
}

// Only a confirmed success may call the recovery clear function; failed attempts retain the cart for retry.
{
  const submitOrder = extractFunction('submitOrder');
  const catchIndex = submitOrder.indexOf('} catch');
  assert.notStrictEqual(catchIndex, -1, 'submitOrder should handle submission errors');
  const successPath = submitOrder.slice(0, catchIndex);
  const failurePath = submitOrder.slice(catchIndex);
  assert.ok(successPath.includes('clearCompletedOrder();'));
  assert.ok(successPath.indexOf('const orderData') < successPath.indexOf('clearCompletedOrder();'));
  assert.ok(successPath.indexOf('clearCompletedOrder();') < successPath.indexOf("showResult('success'"));
  assert.ok(!failurePath.includes('clearCompletedOrder();'));
}

console.log('Completed-order recovery tests passed: successful orders clear safely and failed orders remain retryable.');
