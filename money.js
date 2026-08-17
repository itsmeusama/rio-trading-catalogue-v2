/* Rio Trading money calculations - integer-pence only, with no external dependency. */
(function(root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.RioMoney = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function() {
  'use strict';

  function finiteNumber_(value, label) {
    var number = Number(value);
    if (!Number.isFinite(number)) {
      throw new TypeError((label || 'Value') + ' must be a finite number.');
    }
    return number;
  }

  function integerPence_(value, label) {
    var pence = finiteNumber_(value, label);
    if (!Number.isSafeInteger(pence)) {
      throw new TypeError((label || 'Pence') + ' must be a safe whole number.');
    }
    return pence;
  }

  function toPence(pounds) {
    return Math.round(finiteNumber_(pounds, 'Money value') * 100);
  }

  function fromPence(pence) {
    return integerPence_(pence, 'Pence value') / 100;
  }

  function formatPence(pence) {
    return '\u00A3' + fromPence(pence).toFixed(2);
  }

  function clampPercentage(value) {
    var percentage = Number(value);
    if (!Number.isFinite(percentage) || percentage <= 0) return 0;
    return Math.min(100, percentage);
  }

  function calculateLine(unitPricePence, quantity, discount) {
    unitPricePence = integerPence_(unitPricePence, 'Unit price');
    if (unitPricePence < 0) throw new RangeError('Unit price cannot be negative.');
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      throw new RangeError('Quantity must be a positive whole number.');
    }

    var grossLinePence = unitPricePence * quantity;
    if (!Number.isSafeInteger(grossLinePence)) {
      throw new RangeError('Line total is too large.');
    }

    var discountPence = 0;
    if (discount && Number(discount.value) > 0) {
      if (discount.mode === 'pct') {
        discountPence = Math.round(
          grossLinePence * clampPercentage(discount.value) / 100
        );
      } else if (discount.mode === 'fixed') {
        var fixedPerUnitPence = Math.max(0, toPence(discount.value));
        discountPence = Math.min(unitPricePence, fixedPerUnitPence) * quantity;
      }
    }

    return Object.freeze({
      unitPricePence: unitPricePence,
      quantity: quantity,
      grossLinePence: grossLinePence,
      discountPence: discountPence,
      lineTotalPence: grossLinePence - discountPence,
    });
  }

  function calculateOrder(lines, orderDiscountPct) {
    if (!Array.isArray(lines)) throw new TypeError('Order lines must be an array.');

    var totals = lines.reduce(function(result, line) {
      result.grossSubtotalPence += integerPence_(line.grossLinePence, 'Gross line total');
      result.itemDiscountPence += integerPence_(line.discountPence, 'Item discount');
      return result;
    }, { grossSubtotalPence: 0, itemDiscountPence: 0 });

    var subtotalPence = totals.grossSubtotalPence - totals.itemDiscountPence;
    var percentage = clampPercentage(orderDiscountPct);
    var orderDiscountPence = Math.round(subtotalPence * percentage / 100);

    return Object.freeze({
      grossSubtotalPence: totals.grossSubtotalPence,
      itemDiscountPence: totals.itemDiscountPence,
      subtotalPence: subtotalPence,
      orderDiscountPct: percentage,
      orderDiscountPence: orderDiscountPence,
      totalPence: subtotalPence - orderDiscountPence,
    });
  }

  return Object.freeze({
    toPence: toPence,
    fromPence: fromPence,
    formatPence: formatPence,
    clampPercentage: clampPercentage,
    calculateLine: calculateLine,
    calculateOrder: calculateOrder,
  });
});
