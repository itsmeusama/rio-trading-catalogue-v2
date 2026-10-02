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

const context = {};
vm.runInNewContext(
  extractFunction('normaliseFilterValue') +
    '\n' + extractFunction('getCatalogueCategories') +
    '\n' + extractFunction('getCatalogueSubcategories') +
    '\n' + extractFunction('productMatchesFilters') +
    '\nglobalThis.getCategories = getCatalogueCategories;' +
    '\nglobalThis.getSubcategories = getCatalogueSubcategories;' +
    '\nglobalThis.matchesFilters = productMatchesFilters;',
  context
);

const categories = Array.from(context.getCategories([
  { category: 'Grocery & Essentials' },
  { category: 'Beverages' },
  { category: 'Grocery & Essentials' },
  { category: 'Food & Drink <Special>' },
  { category: '  Household  ' },
  { category: 'household' },
  { category: 'All' },
  { category: '' },
  {},
]));

assert.deepEqual(categories, [
  'Grocery & Essentials',
  'Beverages',
  'Food & Drink <Special>',
  'Household',
]);

const products = [
  { category: 'Grocery & Essentials', subcategory: 'English' },
  { category: 'Grocery & Essentials', subcategory: 'Asian' },
  { category: 'Grocery & Essentials', subcategory: 'English' },
  { category: 'grocery & essentials', subcategory: 'ASIAN' },
  { category: 'Grocery & Essentials', subcategory: '  World Foods  ' },
  { category: 'Grocery & Essentials', subcategory: 'All' },
  { category: 'Grocery & Essentials', subcategory: '' },
  { category: 'Beverages', subcategory: '' },
  { category: 'Snacks', subcategory: 'Crisps' },
];

assert.deepEqual(
  Array.from(context.getSubcategories(products, 'Grocery & Essentials')),
  ['English', 'Asian', 'World Foods']
);
assert.deepEqual(Array.from(context.getSubcategories(products, 'Beverages')), []);
assert.deepEqual(Array.from(context.getSubcategories(products, 'Missing')), []);

const filterProduct = {
  name: 'Premium Washing Powder',
  category: 'household',
  subcategory: 'Laundry',
};
assert.equal(context.matchesFilters(filterProduct, 'Household', 'laundry', 'washing'), true);
assert.equal(context.matchesFilters(filterProduct, 'all', 'all', 'PREMIUM'), true);
assert.equal(context.matchesFilters(filterProduct, 'Beverages', 'all', ''), false);
assert.equal(context.matchesFilters(filterProduct, 'Household', 'Cleaning', ''), false);
assert.equal(context.matchesFilters(filterProduct, 'Household', 'Laundry', 'rice'), false);

const builderSource = extractFunction('buildCategoryPills');
assert.ok(builderSource.includes("btn.textContent = category === 'all' ? 'All' : category"));
assert.ok(builderSource.includes("btn.dataset.cat = category"));
assert.ok(builderSource.includes("btn.setAttribute('aria-selected'"));
assert.equal(builderSource.includes('`<button'), false);

const subcategoryBuilderSource = extractFunction('buildSubcategoryPills');
assert.ok(subcategoryBuilderSource.includes('btn.textContent = sub'));
assert.ok(subcategoryBuilderSource.includes('btn.dataset.sub = sub'));
assert.ok(subcategoryBuilderSource.includes("btn.setAttribute('aria-selected'"));
assert.equal(source.includes('const SUBCATEGORIES'), false);

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.equal(html.includes('data-cat="Grocery &amp; Essentials"'), false);
assert.ok(html.includes('Generated from active spreadsheet products'));

console.log('Category filter tests passed: categories and subcategories are data-driven, ordered and safely rendered.');
