#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'script.js');
const source = fs.readFileSync(scriptPath, 'utf8');

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

const context = { URL };
vm.runInNewContext(
  extractFunction('getSafeImageUrl') + '\nglobalThis.safeImageUrl = getSafeImageUrl;',
  context
);

// Only well-formed HTTPS catalogue images are accepted.
assert.equal(
  context.safeImageUrl('https://images.example.com/product.jpg?width=400'),
  'https://images.example.com/product.jpg?width=400'
);
assert.equal(context.safeImageUrl(' http://images.example.com/product.jpg '), '');
assert.equal(context.safeImageUrl('javascript:alert(1)'), '');
assert.equal(context.safeImageUrl('data:image/svg+xml,<svg></svg>'), '');
assert.equal(context.safeImageUrl('not a URL'), '');
assert.equal(context.safeImageUrl('https://example.com/image.jpg" onerror="alert(1)'), '');
assert.equal(context.safeImageUrl(''), '');
assert.equal(context.safeImageUrl(null), '');

// Remote catalogue values must not be interpolated into either HTML template.
const cardSource = extractFunction('buildCard');
const cartRowSource = extractFunction('buildCartRow');
assert.doesNotMatch(cardSource, /\$\{[^}]*product/);
assert.doesNotMatch(cartRowSource, /\$\{[^}]*product/);
assert.ok(cardSource.includes('configureProductImage(image, product);'));
assert.ok(cardSource.includes(".textContent = String(product.name || '')"));
assert.ok(cardSource.includes(".textContent = String(product.category || '')"));
assert.ok(cardSource.includes(".textContent = String(product.stock || 'In Stock')"));
assert.ok(cartRowSource.includes(".textContent = String(product.name || '')"));
assert.ok(cartRowSource.includes(".textContent = '/ ' + String(product.unit || 'unit')"));

// Image fallback is event-based and product IDs are not inserted into selectors.
assert.equal(source.includes('onerror='), false);
const imageSource = extractFunction('configureProductImage');
assert.ok(imageSource.includes("image.addEventListener('error'"));
const syncSource = extractFunction('syncCardBtn');
assert.equal(syncSource.includes("querySelector('[data-id=\"'"), false);
assert.ok(syncSource.includes("candidate.dataset.id === String(productId)"));

console.log('Catalogue rendering tests passed: remote text is inert and image URLs are HTTPS-only.');
