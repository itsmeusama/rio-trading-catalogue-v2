#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const money = require('../money.js');

const scriptPath = path.join(__dirname, '..', 'script.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in script.js`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not read the full ${name} function.`);
}

const context = { RioMoney: money };
vm.runInNewContext(`
  ${extractFunction('getDiscountValidationResult')}
  ${extractFunction('setDiscountInputError')}
  ${extractFunction('validateDiscountField')}
  globalThis.validateValue = getDiscountValidationResult;
  globalThis.validateField = validateDiscountField;
`, context);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Percentage boundaries remain valid, while negative and over-100 entries are rejected.
assert.deepEqual(plain(context.validateValue('', 'pct', 0, 'unused')), {
  valid: true, value: 0, error: '',
});
assert.deepEqual(plain(context.validateValue('0', 'pct', 0, 'unused')), {
  valid: true, value: 0, error: '',
});
assert.deepEqual(plain(context.validateValue('15.5', 'pct', 0, 'unused')), {
  valid: true, value: 15.5, error: '',
});
assert.deepEqual(plain(context.validateValue('100', 'pct', 0, 'unused')), {
  valid: true, value: 100, error: '',
});
assert.equal(context.validateValue('-1', 'pct', 0, 'unused').error, 'Discount cannot be negative.');
assert.equal(context.validateValue('100.1', 'pct', 0, 'unused').error, 'Enter a percentage from 0 to 100.');
assert.equal(context.validateValue('not-a-number', 'pct', 0, 'unused').error, 'Enter a valid discount value.');

// Fixed discounts retain penny rounding but cannot exceed the relevant item price or order subtotal.
assert.deepEqual(plain(context.validateValue('5', 'fixed', 500, 'Maximum is £5.00.')), {
  valid: true, value: 5, error: '',
});
assert.deepEqual(plain(context.validateValue('1.235', 'fixed', 500, 'Maximum is £5.00.')), {
  valid: true, value: 1.24, error: '',
});
assert.deepEqual(plain(context.validateValue('5.01', 'fixed', 500, 'Maximum is £5.00.')), {
  valid: false, value: 0, error: 'Maximum is £5.00.',
});

// Invalid styling and accessible state appear and disappear with the validation result.
{
  const classes = new Set();
  const input = {
    value: '120',
    validity: { badInput: false },
    attributes: {},
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
    },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const errorElement = {
    textContent: '',
    hidden: true,
    classList: {
      toggle(name, enabled) {
        assert.equal(name, 'hidden');
        errorElement.hidden = enabled;
      },
    },
  };

  const invalid = plain(context.validateField(input, errorElement, 'pct', 0, 'unused'));
  assert.equal(invalid.valid, false);
  assert.equal(input.attributes['aria-invalid'], 'true');
  assert.equal(classes.has('discount-input--invalid'), true);
  assert.equal(errorElement.hidden, false);
  assert.equal(errorElement.textContent, 'Enter a percentage from 0 to 100.');

  input.value = '20';
  const valid = plain(context.validateField(input, errorElement, 'pct', 0, 'unused'));
  assert.equal(valid.valid, true);
  assert.equal(input.attributes['aria-invalid'], 'false');
  assert.equal(classes.has('discount-input--invalid'), false);
  assert.equal(errorElement.hidden, true);
  assert.equal(errorElement.textContent, '');

  input.validity.badInput = true;
  const badInput = plain(context.validateField(input, errorElement, 'pct', 0, 'unused'));
  assert.equal(badInput.error, 'Enter a valid discount value.');
}

// The order cannot proceed or submit while any discount field remains invalid.
assert.ok(source.includes('proceedBtn.disabled = count === 0 || hasDiscountValidationErrors();'));
assert.ok(html.includes('id="orderDiscError"'));
assert.ok(html.includes('aria-live="polite"'));
assert.ok(styles.includes('.discount-input--invalid'));
assert.ok(styles.includes('.discount-validation-error'));
{
  const submitOrder = extractFunction('submitOrder');
  const guardIndex = submitOrder.indexOf('hasDiscountValidationErrors()');
  const requestIndex = submitOrder.indexOf('RioOrderApi.postOrder');
  assert.ok(guardIndex > -1 && guardIndex < requestIndex);
}

console.log('Discount validation tests passed: limits, captions, invalid styling and submission blocking.');
