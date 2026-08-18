#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const money = require('../money.js');

function line(price, quantity, discount) {
  return money.calculateLine(money.toPence(price), quantity, discount || null);
}

function run() {
  assert.equal(money.toPence(2.49), 249);
  assert.equal(money.fromPence(249), 2.49);
  assert.equal(money.formatPence(249), '£2.49');

  const halfOf249 = line(2.49, 1, { mode: 'pct', value: 50 });
  assert.deepEqual(halfOf249, {
    unitPricePence: 249,
    quantity: 1,
    grossLinePence: 249,
    discountPence: 125,
    lineTotalPence: 124,
  });
  assert.equal(money.formatPence(halfOf249.lineTotalPence), '£1.24');

  const tenHalfPriceItems = line(2.49, 10, { mode: 'pct', value: 50 });
  assert.equal(tenHalfPriceItems.grossLinePence, 2490);
  assert.equal(tenHalfPriceItems.discountPence, 1245);
  assert.equal(tenHalfPriceItems.lineTotalPence, 1245);

  const percentageLine = line(12.99, 3, { mode: 'pct', value: 15 });
  assert.equal(percentageLine.grossLinePence, 3897);
  assert.equal(percentageLine.discountPence, 585);
  assert.equal(percentageLine.lineTotalPence, 3312);

  const fixedLine = line(12.99, 3, { mode: 'fixed', value: 2 });
  assert.equal(fixedLine.discountPence, 600);
  assert.equal(fixedLine.lineTotalPence, 3297);

  const fixedWithExtraDecimals = line(12.99, 2, { mode: 'fixed', value: 1.235 });
  assert.equal(fixedWithExtraDecimals.discountPence, 248, 'fixed discounts must first round to pennies');

  const zeroDiscount = line(1.1, 2, { mode: 'pct', value: 0 });
  assert.equal(zeroDiscount.discountPence, 0);
  assert.equal(zeroDiscount.lineTotalPence, 220);

  const freeLine = line(1.1, 2, { mode: 'pct', value: 100 });
  assert.equal(freeLine.discountPence, 220);
  assert.equal(freeLine.lineTotalPence, 0);

  const combined = money.calculateOrder([halfOf249, fixedLine], 5);
  assert.deepEqual(combined, {
    grossSubtotalPence: 4146,
    itemDiscountPence: 725,
    subtotalPence: 3421,
    orderDiscountMode: 'pct',
    orderDiscountValue: 5,
    orderDiscountPct: 5,
    orderDiscountPence: 171,
    totalPence: 3250,
  });

  const fixedOrderDiscount = money.calculateOrder(
    [halfOf249, fixedLine],
    { mode: 'fixed', value: 10 }
  );
  assert.deepEqual(fixedOrderDiscount, {
    grossSubtotalPence: 4146,
    itemDiscountPence: 725,
    subtotalPence: 3421,
    orderDiscountMode: 'fixed',
    orderDiscountValue: 10,
    orderDiscountPct: 0,
    orderDiscountPence: 1000,
    totalPence: 2421,
  });

  const roundedFixedOrderDiscount = money.calculateOrder(
    [line(12.99, 1)],
    { mode: 'fixed', value: 1.235 }
  );
  assert.equal(roundedFixedOrderDiscount.orderDiscountValue, 1.24);
  assert.equal(roundedFixedOrderDiscount.orderDiscountPence, 124);
  assert.equal(roundedFixedOrderDiscount.totalPence, 1175);

  const cappedFixedOrderDiscount = money.calculateOrder(
    [halfOf249],
    { mode: 'fixed', value: 100 }
  );
  assert.equal(cappedFixedOrderDiscount.orderDiscountPence, 124);
  assert.equal(cappedFixedOrderDiscount.totalPence, 0);

  const fractionalOrderDiscount = money.calculateOrder([line(2.49, 1)], 50);
  assert.equal(fractionalOrderDiscount.orderDiscountPence, 125);
  assert.equal(fractionalOrderDiscount.totalPence, 124);

  const empty = money.calculateOrder([], 25);
  assert.equal(empty.totalPence, 0);

  assert.throws(() => money.toPence('not-money'), /finite number/);
  assert.throws(() => money.calculateLine(249, 0, null), /positive whole number/);
  assert.throws(() => money.calculateLine(249.5, 1, null), /safe whole number/);
  assert.throws(
    () => money.calculateOrder([halfOf249], { mode: 'invalid', value: 1 }),
    /mode must be pct or fixed/
  );

  console.log('Money tests passed: penny conversion, line rounding, item discounts and percentage/fixed order totals.');
}

run();
