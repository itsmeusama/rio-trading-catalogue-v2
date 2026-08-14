/*
 * Rio Trading permanent order backend - Phase 3
 *
 * The backend validates requests against the authoritative product sheet,
 * saves accepted orders before any email attempt, generates a PDF attachment,
 * sends it to the fixed owner address, and records the delivery result.
 */

var ORDER_SYSTEM = Object.freeze({
  CONTRACT_VERSION: 1,
  SPREADSHEET_ID: '1pDmFNcjy9kBjF0qjH-SoOWXJqbajEqZgsSVdiRTAYtk',
  PRODUCT_SHEET_ID: 1147224303,
  ORDERS_SHEET_NAME: 'Orders',
  ORDER_ITEMS_SHEET_NAME: 'Order Items',
  SPREADSHEET_ID_PROPERTY: 'RIO_TRADING_SPREADSHEET_ID',
  OWNER_EMAIL: 'riotraders87@gmail.com',
  TIME_ZONE: 'Europe/London',
  CURRENCY: 'GBP',
  ORDER_STATUS_OPEN: 'Open',
  EMAIL_STATUS_PENDING: 'Pending',
  EMAIL_STATUS_SENT: 'Sent',
  EMAIL_STATUS_FAILED: 'Failed',
  MAX_ITEMS: 200,
  MAX_QUANTITY: 10000,
  LOCK_TIMEOUT_MS: 30000,
});

var ORDER_HEADERS = Object.freeze([
  'order_ref',
  'submission_id',
  'created_at',
  'shop_name',
  'contact_name',
  'phone',
  'customer_email',
  'notes',
  'currency',
  'item_count',
  'gross_subtotal',
  'item_discount_amount',
  'subtotal',
  'order_discount_pct',
  'order_discount_amount',
  'total',
  'order_status',
  'email_status',
  'email_sent_at',
  'email_error',
]);

var ORDER_ITEM_HEADERS = Object.freeze([
  'order_ref',
  'line_number',
  'product_id',
  'product_name',
  'category',
  'unit',
  'quantity',
  'unit_price',
  'discount_mode',
  'discount_value',
  'discount_amount',
  'gross_line_total',
  'line_total',
]);

var ORDER_COLUMN = Object.freeze({
  ORDER_REF: 1,
  SUBMISSION_ID: 2,
  CREATED_AT: 3,
  SHOP_NAME: 4,
  CONTACT_NAME: 5,
  PHONE: 6,
  CUSTOMER_EMAIL: 7,
  NOTES: 8,
  CURRENCY: 9,
  ITEM_COUNT: 10,
  GROSS_SUBTOTAL: 11,
  ITEM_DISCOUNT_AMOUNT: 12,
  SUBTOTAL: 13,
  ORDER_DISCOUNT_PCT: 14,
  ORDER_DISCOUNT_AMOUNT: 15,
  TOTAL: 16,
  ORDER_STATUS: 17,
  EMAIL_STATUS: 18,
  EMAIL_SENT_AT: 19,
  EMAIL_ERROR: 20,
});

var ORDER_ITEM_COLUMN = Object.freeze({
  ORDER_REF: 1,
  LINE_NUMBER: 2,
  PRODUCT_ID: 3,
  PRODUCT_NAME: 4,
  CATEGORY: 5,
  UNIT: 6,
  QUANTITY: 7,
  UNIT_PRICE: 8,
  DISCOUNT_MODE: 9,
  DISCOUNT_VALUE: 10,
  DISCOUNT_AMOUNT: 11,
  GROSS_LINE_TOTAL: 12,
  LINE_TOTAL: 13,
});

/**
 * Run this once from either a standalone or spreadsheet-bound script.
 * It creates missing order tabs, validates existing headers, applies formats,
 * records the native spreadsheet ID, and leaves all existing rows untouched.
 */
function setupOrderSystem() {
  var spreadsheet = SpreadsheetApp.openById(ORDER_SYSTEM.SPREADSHEET_ID);

  var productSheet = spreadsheet.getSheetById(ORDER_SYSTEM.PRODUCT_SHEET_ID);
  if (!productSheet) {
    throw new Error('The expected product tab (sheet ID ' + ORDER_SYSTEM.PRODUCT_SHEET_ID + ') was not found.');
  }

  // Fail before creating order tabs if the catalogue structure is not usable.
  buildProductCatalogue_(productSheet.getDataRange().getValues());

  var ordersSheet = ensureSheet_(spreadsheet, ORDER_SYSTEM.ORDERS_SHEET_NAME, ORDER_HEADERS);
  var orderItemsSheet = ensureSheet_(spreadsheet, ORDER_SYSTEM.ORDER_ITEMS_SHEET_NAME, ORDER_ITEM_HEADERS);

  formatOrdersSheet_(ordersSheet);
  formatOrderItemsSheet_(orderItemsSheet);
  spreadsheet.setSpreadsheetTimeZone(ORDER_SYSTEM.TIME_ZONE);

  PropertiesService.getScriptProperties().setProperty(
    ORDER_SYSTEM.SPREADSHEET_ID_PROPERTY,
    spreadsheet.getId()
  );

  var result = {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    productSheet: productSheet.getName(),
    ordersSheet: ordersSheet.getName(),
    orderItemsSheet: orderItemsSheet.getName(),
    timeZone: spreadsheet.getSpreadsheetTimeZone(),
    ownerEmail: ORDER_SYSTEM.OWNER_EMAIL,
    phase: 3,
  };

  console.log(JSON.stringify(result));
  return result;
}

/** Read-only setup verification that can be run from the Apps Script editor. */
function validateOrderSystemSetup() {
  var spreadsheet = openConfiguredSpreadsheet_();
  var sheets = getRequiredSheets_(spreadsheet);
  var catalogue = readProductCatalogue_(sheets.product);

  var result = {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    productSheet: sheets.product.getName(),
    activeProducts: Object.keys(catalogue).filter(function(id) {
      return catalogue[id].active;
    }).length,
    orders: Math.max(0, sheets.orders.getLastRow() - 1),
    orderItems: Math.max(0, sheets.orderItems.getLastRow() - 1),
    timeZone: spreadsheet.getSpreadsheetTimeZone(),
    ownerEmail: ORDER_SYSTEM.OWNER_EMAIL,
    emailDeliveryEnabled: true,
    remainingDailyEmailQuota: MailApp.getRemainingDailyQuota(),
    phase: 3,
  };

  console.log(JSON.stringify(result));
  return result;
}

/** Lightweight web-app status endpoint. */
function doGet() {
  var configured = Boolean(
    PropertiesService.getScriptProperties().getProperty(ORDER_SYSTEM.SPREADSHEET_ID_PROPERTY)
  );

  return jsonResponse_({
    ok: true,
    service: 'Rio Trading Order API',
    contractVersion: ORDER_SYSTEM.CONTRACT_VERSION,
    configured: configured,
    persistenceEnabled: true,
    emailDeliveryEnabled: true,
    phase: 3,
  });
}

/** Google Apps Script web-app POST entry point. */
function doPost(event) {
  try {
    var payload = parsePostBody_(event);
    return jsonResponse_(processOrder_(payload));
  } catch (error) {
    if (!error || !error.publicCode) {
      console.error(error && error.stack ? error.stack : error);
    }

    return jsonResponse_({
      ok: false,
      saved: false,
      code: error && error.publicCode ? error.publicCode : 'INTERNAL_ERROR',
      message: error && error.publicCode
        ? error.message
        : 'The order could not be saved. Please try again.',
    });
  }
}

/**
 * Validates and permanently saves one order before attempting email delivery.
 * options.skipEmail is reserved for the explicit Phase 2 persistence test.
 */
function processOrder_(payload, options) {
  var request = validateOrderRequest_(payload);
  var spreadsheet = openConfiguredSpreadsheet_();
  var sheets = getRequiredSheets_(spreadsheet);
  var lock = LockService.getScriptLock();
  var savedOrder = null;
  lock.waitLock(ORDER_SYSTEM.LOCK_TIMEOUT_MS);

  try {
    var existingOrder = findOrderBySubmissionId_(sheets.orders, request.submissionId);
    if (existingOrder) {
      return buildExistingOrderResponse_(existingOrder, sheets);
    }

    var catalogue = readProductCatalogue_(sheets.product);
    var calculatedOrder = calculateOrder_(request, catalogue);
    var createdAt = new Date();
    var orderRef = generateUniqueOrderRef_(sheets.orders, createdAt);

    var persistence = persistOrder_(sheets, orderRef, createdAt, request, calculatedOrder);
    savedOrder = {
      orderRef: orderRef,
      createdAt: createdAt,
      calculatedOrder: calculatedOrder,
      orderRowNumber: persistence.orderRowNumber,
    };
  } finally {
    lock.releaseLock();
  }

  if (options && options.skipEmail === true) {
    return buildAcceptedOrderResponse_(
      savedOrder.orderRef,
      savedOrder.createdAt,
      savedOrder.calculatedOrder,
      { status: ORDER_SYSTEM.EMAIL_STATUS_PENDING }
    );
  }

  var emailResult = deliverSavedOrderEmail_(sheets, savedOrder.orderRef);
  return buildAcceptedOrderResponse_(
    savedOrder.orderRef,
    savedOrder.createdAt,
    savedOrder.calculatedOrder,
    emailResult
  );
}

function parsePostBody_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') {
    throw publicError_('INVALID_REQUEST', 'A JSON order request is required.');
  }

  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw publicError_('INVALID_REQUEST', 'The order request contains invalid JSON.');
  }
}

function validateOrderRequest_(payload) {
  if (!isObject_(payload)) {
    throw publicError_('INVALID_REQUEST', 'The order request must be an object.');
  }

  ['toEmail', 'to_email', 'recipient', 'ownerEmail'].forEach(function(field) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      throw publicError_('INVALID_REQUEST', 'Email recipients cannot be supplied by the browser.');
    }
  });

  if (payload.contractVersion !== ORDER_SYSTEM.CONTRACT_VERSION) {
    throw publicError_('INVALID_REQUEST', 'This order request version is not supported.');
  }

  var submissionId = requiredString_(payload.submissionId, 'submissionId', 80, 'INVALID_REQUEST').toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
    throw publicError_('INVALID_REQUEST', 'A valid submission ID is required.');
  }

  if (!isObject_(payload.customer)) {
    throw publicError_('INVALID_CUSTOMER', 'Customer details are required.');
  }

  var customer = {
    shopName: requiredString_(payload.customer.shopName, 'shopName', 150, 'INVALID_CUSTOMER'),
    contactName: requiredString_(payload.customer.contactName, 'contactName', 150, 'INVALID_CUSTOMER'),
    phone: requiredString_(payload.customer.phone, 'phone', 40, 'INVALID_CUSTOMER'),
    email: requiredString_(payload.customer.email, 'email', 254, 'INVALID_CUSTOMER'),
    notes: optionalString_(payload.customer.notes, 'notes', 1000, 'INVALID_CUSTOMER'),
  };

  var phoneClean = customer.phone.replace(/\s/g, '');
  if (!/^(\+44|0)[0-9]{9,10}$/.test(phoneClean)) {
    throw publicError_('INVALID_CUSTOMER', 'A valid UK phone number is required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw publicError_('INVALID_CUSTOMER', 'A valid customer email is required.');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw publicError_('INVALID_ITEM', 'At least one order item is required.');
  }
  if (payload.items.length > ORDER_SYSTEM.MAX_ITEMS) {
    throw publicError_('INVALID_ITEM', 'The order contains too many product lines.');
  }

  var seenProductIds = Object.create(null);
  var items = payload.items.map(function(item) {
    if (!isObject_(item)) {
      throw publicError_('INVALID_ITEM', 'Every order item must be an object.');
    }

    var productId = requiredString_(item.productId, 'productId', 100, 'INVALID_ITEM');
    if (seenProductIds[productId]) {
      throw publicError_('INVALID_ITEM', 'Each product may appear only once in an order.');
    }
    seenProductIds[productId] = true;

    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > ORDER_SYSTEM.MAX_QUANTITY) {
      throw publicError_('INVALID_ITEM', 'Every quantity must be a positive whole number.');
    }

    return {
      productId: productId,
      quantity: item.quantity,
      discount: validateItemDiscount_(item.discount),
    };
  });

  var orderDiscountPct = payload.orderDiscountPct === undefined ? 0 : payload.orderDiscountPct;
  if (!isFiniteNumber_(orderDiscountPct) || orderDiscountPct < 0 || orderDiscountPct > 100) {
    throw publicError_('INVALID_DISCOUNT', 'The order discount must be between 0 and 100 percent.');
  }

  return {
    submissionId: submissionId,
    customer: customer,
    items: items,
    orderDiscountPct: orderDiscountPct,
  };
}

function validateItemDiscount_(discount) {
  if (discount === undefined || discount === null) return null;
  if (!isObject_(discount)) {
    throw publicError_('INVALID_DISCOUNT', 'An item discount must be an object or null.');
  }
  if (discount.mode !== 'pct' && discount.mode !== 'fixed') {
    throw publicError_('INVALID_DISCOUNT', 'An item discount mode must be pct or fixed.');
  }
  if (!isFiniteNumber_(discount.value) || discount.value < 0) {
    throw publicError_('INVALID_DISCOUNT', 'An item discount must have a non-negative numeric value.');
  }
  if (discount.mode === 'pct' && discount.value > 100) {
    throw publicError_('INVALID_DISCOUNT', 'An item percentage discount cannot exceed 100.');
  }
  if (discount.value === 0) return null;

  return { mode: discount.mode, value: discount.value };
}

function calculateOrder_(request, catalogue) {
  var lines = [];
  var grossSubtotalPence = 0;
  var itemDiscountPence = 0;
  var itemCount = 0;

  request.items.forEach(function(requestedItem, index) {
    var product = catalogue[requestedItem.productId];
    if (!product) {
      throw publicError_(
        'PRODUCT_NOT_FOUND',
        'One or more products are no longer available. Refresh the catalogue and review the order.'
      );
    }
    if (!product.active) {
      throw publicError_(
        'PRODUCT_INACTIVE',
        'One or more products are inactive. Refresh the catalogue and review the order.'
      );
    }

    var quantity = requestedItem.quantity;
    var grossLinePence = product.unitPricePence * quantity;
    var discountPence = 0;
    var discountMode = '';
    var discountValue = '';

    if (requestedItem.discount) {
      discountMode = requestedItem.discount.mode;
      discountValue = requestedItem.discount.value;

      if (discountMode === 'pct') {
        discountPence = Math.round(grossLinePence * discountValue / 100);
      } else {
        var fixedPerUnitPence = toPence_(discountValue);
        if (fixedPerUnitPence > product.unitPricePence) {
          throw publicError_('INVALID_DISCOUNT', 'A fixed item discount cannot exceed its unit price.');
        }
        discountPence = fixedPerUnitPence * quantity;
      }
    }

    var lineTotalPence = grossLinePence - discountPence;
    grossSubtotalPence += grossLinePence;
    itemDiscountPence += discountPence;
    itemCount += quantity;

    lines.push({
      lineNumber: index + 1,
      productId: product.id,
      productName: product.name,
      category: product.category,
      unit: product.unit,
      quantity: quantity,
      unitPricePence: product.unitPricePence,
      discountMode: discountMode,
      discountValue: discountValue,
      discountPence: discountPence,
      grossLinePence: grossLinePence,
      lineTotalPence: lineTotalPence,
    });
  });

  var subtotalPence = grossSubtotalPence - itemDiscountPence;
  var orderDiscountPence = Math.round(subtotalPence * request.orderDiscountPct / 100);
  var totalPence = subtotalPence - orderDiscountPence;

  return {
    lines: lines,
    itemCount: itemCount,
    grossSubtotalPence: grossSubtotalPence,
    itemDiscountPence: itemDiscountPence,
    subtotalPence: subtotalPence,
    orderDiscountPct: request.orderDiscountPct,
    orderDiscountPence: orderDiscountPence,
    totalPence: totalPence,
  };
}

function persistOrder_(sheets, orderRef, createdAt, request, calculatedOrder) {
  var orderStartRow = sheets.orders.getLastRow() + 1;
  var itemStartRow = sheets.orderItems.getLastRow() + 1;
  var orderWritten = false;
  var itemsWritten = false;

  try {
    sheets.orders
      .getRange(orderStartRow, 1, 1, ORDER_HEADERS.length)
      .setValues([buildOrderRow_(orderRef, createdAt, request, calculatedOrder)]);
    orderWritten = true;

    var itemRows = buildOrderItemRows_(orderRef, calculatedOrder.lines);
    sheets.orderItems
      .getRange(itemStartRow, 1, itemRows.length, ORDER_ITEM_HEADERS.length)
      .setValues(itemRows);
    itemsWritten = true;

    SpreadsheetApp.flush();
    return {
      orderRowNumber: orderStartRow,
      firstItemRowNumber: itemStartRow,
      itemRowCount: itemRows.length,
    };
  } catch (error) {
    try {
      if (itemsWritten) {
        sheets.orderItems
          .getRange(itemStartRow, 1, calculatedOrder.lines.length, ORDER_ITEM_HEADERS.length)
          .clearContent();
      }
      if (orderWritten) {
        sheets.orders.getRange(orderStartRow, 1, 1, ORDER_HEADERS.length).clearContent();
      }
      SpreadsheetApp.flush();
    } catch (rollbackError) {
      console.error('Order rollback failed: ' + (rollbackError.stack || rollbackError));
    }
    throw error;
  }
}

function buildOrderRow_(orderRef, createdAt, request, order) {
  return [
    orderRef,
    request.submissionId,
    createdAt,
    safeSheetText_(request.customer.shopName),
    safeSheetText_(request.customer.contactName),
    safeSheetText_(request.customer.phone),
    safeSheetText_(request.customer.email),
    safeSheetText_(request.customer.notes),
    ORDER_SYSTEM.CURRENCY,
    order.itemCount,
    fromPence_(order.grossSubtotalPence),
    fromPence_(order.itemDiscountPence),
    fromPence_(order.subtotalPence),
    order.orderDiscountPct,
    fromPence_(order.orderDiscountPence),
    fromPence_(order.totalPence),
    ORDER_SYSTEM.ORDER_STATUS_OPEN,
    ORDER_SYSTEM.EMAIL_STATUS_PENDING,
    '',
    '',
  ];
}

function buildOrderItemRows_(orderRef, lines) {
  return lines.map(function(line) {
    return [
      orderRef,
      line.lineNumber,
      line.productId,
      line.productName,
      line.category,
      line.unit,
      line.quantity,
      fromPence_(line.unitPricePence),
      line.discountMode,
      line.discountValue,
      fromPence_(line.discountPence),
      fromPence_(line.grossLinePence),
      fromPence_(line.lineTotalPence),
    ];
  });
}

function buildAcceptedOrderResponse_(orderRef, createdAt, order, emailResult) {
  var result = {
    ok: true,
    saved: true,
    duplicate: false,
    orderRef: orderRef,
    createdAt: formatDateTime_(createdAt),
    orderStatus: ORDER_SYSTEM.ORDER_STATUS_OPEN,
    emailStatus: emailResult && emailResult.status
      ? emailResult.status
      : ORDER_SYSTEM.EMAIL_STATUS_PENDING,
    totals: responseTotals_(order),
    items: responseItemsFromCalculated_(order.lines),
  };

  if (emailResult && emailResult.message) result.message = emailResult.message;
  return result;
}

function buildExistingOrderResponse_(existing, sheets) {
  var values = existing.values;
  var createdAt = values[ORDER_COLUMN.CREATED_AT - 1];
  var savedOrder = loadSavedOrder_(sheets, existing);

  return {
    ok: true,
    saved: true,
    duplicate: true,
    orderRef: String(values[ORDER_COLUMN.ORDER_REF - 1]),
    createdAt: createdAt instanceof Date ? formatDateTime_(createdAt) : String(createdAt || ''),
    orderStatus: String(values[ORDER_COLUMN.ORDER_STATUS - 1]),
    emailStatus: String(values[ORDER_COLUMN.EMAIL_STATUS - 1]),
    totals: {
      currency: String(values[ORDER_COLUMN.CURRENCY - 1] || ORDER_SYSTEM.CURRENCY),
      grossSubtotal: Number(values[ORDER_COLUMN.GROSS_SUBTOTAL - 1]) || 0,
      itemDiscountAmount: Number(values[ORDER_COLUMN.ITEM_DISCOUNT_AMOUNT - 1]) || 0,
      subtotal: Number(values[ORDER_COLUMN.SUBTOTAL - 1]) || 0,
      orderDiscountPct: Number(values[ORDER_COLUMN.ORDER_DISCOUNT_PCT - 1]) || 0,
      orderDiscountAmount: Number(values[ORDER_COLUMN.ORDER_DISCOUNT_AMOUNT - 1]) || 0,
      total: Number(values[ORDER_COLUMN.TOTAL - 1]) || 0,
    },
    items: responseItemsFromSaved_(savedOrder.lines),
  };
}

function responseTotals_(order) {
  return {
    currency: ORDER_SYSTEM.CURRENCY,
    grossSubtotal: fromPence_(order.grossSubtotalPence),
    itemDiscountAmount: fromPence_(order.itemDiscountPence),
    subtotal: fromPence_(order.subtotalPence),
    orderDiscountPct: order.orderDiscountPct,
    orderDiscountAmount: fromPence_(order.orderDiscountPence),
    total: fromPence_(order.totalPence),
  };
}

function responseItemsFromCalculated_(lines) {
  return lines.map(function(line) {
    return {
      productId: line.productId,
      name: line.productName,
      category: line.category,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: fromPence_(line.unitPricePence),
      discountMode: line.discountMode,
      discountValue: line.discountValue,
      discountAmount: fromPence_(line.discountPence),
      grossLineTotal: fromPence_(line.grossLinePence),
      lineTotal: fromPence_(line.lineTotalPence),
    };
  });
}

function responseItemsFromSaved_(lines) {
  return lines.map(function(line) {
    return {
      productId: line.productId,
      name: line.productName,
      category: line.category,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountMode: line.discountMode,
      discountValue: line.discountValue,
      discountAmount: line.discountAmount,
      grossLineTotal: line.grossLineTotal,
      lineTotal: line.lineTotal,
    };
  });
}

function findOrderBySubmissionId_(ordersSheet, submissionId) {
  var lastRow = ordersSheet.getLastRow();
  if (lastRow < 2) return null;

  var rows = ordersSheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][ORDER_COLUMN.SUBMISSION_ID - 1]) === submissionId) {
      return { rowNumber: i + 2, values: rows[i] };
    }
  }
  return null;
}

function findOrderByReference_(ordersSheet, orderRef) {
  var lastRow = ordersSheet.getLastRow();
  if (lastRow < 2) return null;

  var rows = ordersSheet.getRange(2, 1, lastRow - 1, ORDER_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][ORDER_COLUMN.ORDER_REF - 1]) === orderRef) {
      return { rowNumber: i + 2, values: rows[i] };
    }
  }
  return null;
}

/**
 * Sends the email only after the order and line items have been committed.
 * A script lock serialises email attempts so the same saved order is not sent
 * twice by concurrent executions.
 */
function deliverSavedOrderEmail_(sheets, orderRef) {
  var lock = LockService.getScriptLock();
  lock.waitLock(ORDER_SYSTEM.LOCK_TIMEOUT_MS);

  try {
    var existing = findOrderByReference_(sheets.orders, orderRef);
    if (!existing) throw new Error('Saved order ' + orderRef + ' was not found.');

    if (String(existing.values[ORDER_COLUMN.EMAIL_STATUS - 1]) === ORDER_SYSTEM.EMAIL_STATUS_SENT) {
      return { status: ORDER_SYSTEM.EMAIL_STATUS_SENT };
    }

    try {
      if (MailApp.getRemainingDailyQuota() < 1) {
        throw new Error('The Apps Script daily email-recipient quota has been reached.');
      }

      var order = loadSavedOrder_(sheets, existing);
      var pdf = createOrderPdf_(order);
      var subject = 'New Rio Trading Order ' + order.orderRef + ' - ' + order.customer.shopName;
      var plainBody = buildOrderEmailText_(order);
      var htmlBody = buildOrderDocumentHtml_(order, false);

      MailApp.sendEmail(ORDER_SYSTEM.OWNER_EMAIL, subject, plainBody, {
        name: 'Rio Trading Orders',
        htmlBody: htmlBody,
        attachments: [pdf],
      });

      var sentAt = new Date();
      updateEmailState_(sheets.orders, existing.rowNumber, ORDER_SYSTEM.EMAIL_STATUS_SENT, sentAt, '');
      return { status: ORDER_SYSTEM.EMAIL_STATUS_SENT, sentAt: formatDateTime_(sentAt) };
    } catch (error) {
      var errorMessage = safeErrorMessage_(error);
      try {
        updateEmailState_(
          sheets.orders,
          existing.rowNumber,
          ORDER_SYSTEM.EMAIL_STATUS_FAILED,
          '',
          errorMessage
        );
      } catch (statusError) {
        console.error('Email status update failed for ' + orderRef + ': ' + safeErrorMessage_(statusError));
      }

      console.error('Order email failed for ' + orderRef + ': ' + errorMessage);
      return {
        status: ORDER_SYSTEM.EMAIL_STATUS_FAILED,
        message: 'The order was saved, but its confirmation email could not be sent.',
      };
    }
  } finally {
    lock.releaseLock();
  }
}

function updateEmailState_(ordersSheet, rowNumber, status, sentAt, errorMessage) {
  ordersSheet
    .getRange(rowNumber, ORDER_COLUMN.EMAIL_STATUS, 1, 3)
    .setValues([[status, sentAt || '', errorMessage || '']]);
  SpreadsheetApp.flush();
}

function loadSavedOrder_(sheets, existingOrder) {
  var values = existingOrder.values;
  var orderRef = String(values[ORDER_COLUMN.ORDER_REF - 1]);
  var lastItemRow = sheets.orderItems.getLastRow();
  var lines = [];

  if (lastItemRow >= 2) {
    var itemRows = sheets.orderItems
      .getRange(2, 1, lastItemRow - 1, ORDER_ITEM_HEADERS.length)
      .getValues();

    itemRows.forEach(function(row) {
      if (String(row[ORDER_ITEM_COLUMN.ORDER_REF - 1]) !== orderRef) return;
      lines.push({
        lineNumber: Number(row[ORDER_ITEM_COLUMN.LINE_NUMBER - 1]),
        productId: String(row[ORDER_ITEM_COLUMN.PRODUCT_ID - 1]),
        productName: String(row[ORDER_ITEM_COLUMN.PRODUCT_NAME - 1]),
        category: String(row[ORDER_ITEM_COLUMN.CATEGORY - 1]),
        unit: String(row[ORDER_ITEM_COLUMN.UNIT - 1]),
        quantity: Number(row[ORDER_ITEM_COLUMN.QUANTITY - 1]),
        unitPrice: Number(row[ORDER_ITEM_COLUMN.UNIT_PRICE - 1]),
        discountMode: String(row[ORDER_ITEM_COLUMN.DISCOUNT_MODE - 1]),
        discountValue: row[ORDER_ITEM_COLUMN.DISCOUNT_VALUE - 1],
        discountAmount: Number(row[ORDER_ITEM_COLUMN.DISCOUNT_AMOUNT - 1]) || 0,
        grossLineTotal: Number(row[ORDER_ITEM_COLUMN.GROSS_LINE_TOTAL - 1]),
        lineTotal: Number(row[ORDER_ITEM_COLUMN.LINE_TOTAL - 1]),
      });
    });
  }

  lines.sort(function(a, b) { return a.lineNumber - b.lineNumber; });
  if (lines.length === 0) throw new Error('Saved order ' + orderRef + ' has no line items.');

  return {
    orderRef: orderRef,
    createdAt: values[ORDER_COLUMN.CREATED_AT - 1],
    customer: {
      shopName: String(values[ORDER_COLUMN.SHOP_NAME - 1]),
      contactName: String(values[ORDER_COLUMN.CONTACT_NAME - 1]),
      phone: String(values[ORDER_COLUMN.PHONE - 1]),
      email: String(values[ORDER_COLUMN.CUSTOMER_EMAIL - 1]),
      notes: String(values[ORDER_COLUMN.NOTES - 1] || ''),
    },
    currency: String(values[ORDER_COLUMN.CURRENCY - 1] || ORDER_SYSTEM.CURRENCY),
    itemCount: Number(values[ORDER_COLUMN.ITEM_COUNT - 1]),
    grossSubtotal: Number(values[ORDER_COLUMN.GROSS_SUBTOTAL - 1]),
    itemDiscountAmount: Number(values[ORDER_COLUMN.ITEM_DISCOUNT_AMOUNT - 1]),
    subtotal: Number(values[ORDER_COLUMN.SUBTOTAL - 1]),
    orderDiscountPct: Number(values[ORDER_COLUMN.ORDER_DISCOUNT_PCT - 1]),
    orderDiscountAmount: Number(values[ORDER_COLUMN.ORDER_DISCOUNT_AMOUNT - 1]),
    total: Number(values[ORDER_COLUMN.TOTAL - 1]),
    orderStatus: String(values[ORDER_COLUMN.ORDER_STATUS - 1]),
    lines: lines,
  };
}

function createOrderPdf_(order) {
  var html = buildOrderDocumentHtml_(order, true);
  var fileName = 'Rio-Trading-Order-Confirmation-' + order.orderRef + '.pdf';
  return Utilities
    .newBlob(html, 'text/html', fileName.replace(/\.pdf$/, '.html'))
    .getAs(MimeType.PDF)
    .setName(fileName);
}

function buildOrderDocumentHtml_(order, forPdf) {
  var rows = order.lines.map(function(line) {
    return '<tr>' +
      '<td>' + htmlEscape_(line.productName) + '</td>' +
      '<td class="muted">' + htmlEscape_(line.unit || 'unit') + '</td>' +
      '<td class="number">' + line.quantity + '</td>' +
      '<td class="number">' + formatMoney_(line.unitPrice) + '</td>' +
      '<td class="number">' + htmlEscape_(formatSavedDiscount_(line)) + '</td>' +
      '<td class="number strong">' + formatMoney_(line.lineTotal) + '</td>' +
      '</tr>';
  }).join('');

  var notes = order.customer.notes
    ? '<div class="notes"><span>Notes</span><br>' + htmlText_(order.customer.notes) + '</div>'
    : '';
  var discountTotals = '';
  if (order.itemDiscountAmount > 0) {
    discountTotals += totalRowHtml_('Item discounts', '-' + formatMoney_(order.itemDiscountAmount), false);
  }
  if (order.orderDiscountAmount > 0) {
    discountTotals += totalRowHtml_(
      'Order discount (' + formatNumber_(order.orderDiscountPct) + '%)',
      '-' + formatMoney_(order.orderDiscountAmount),
      false
    );
  }

  var title = 'Rio Trading Order ' + order.orderRef;
  var pageStyles = forPdf
    ? '@page{size:A4;margin:14mm;}body{margin:0;}'
    : 'body{margin:0;padding:24px;background:#f3f4f6;}';

  return '<!doctype html><html><head><meta charset="UTF-8"><title>' + htmlEscape_(title) + '</title>' +
    '<style>' + pageStyles +
    '*{box-sizing:border-box;}body{font-family:Arial,Helvetica,sans-serif;color:#111827;font-size:12px;line-height:1.45;}' +
    '.page{max-width:760px;margin:0 auto;background:#fff;padding:' + (forPdf ? '0' : '30px') + ';}' +
    '.header{border-bottom:3px solid #111827;padding-bottom:16px;margin-bottom:20px;}' +
    '.brand{font-size:25px;font-weight:800;letter-spacing:.5px;}.tag{color:#6b7280;font-size:11px;margin-top:2px;}' +
    '.doc-title{float:right;text-align:right;margin-top:-38px;font-size:15px;font-weight:700;}.ref{font-size:11px;font-weight:400;margin-top:4px;}' +
    '.meta{width:100%;border-collapse:collapse;margin:0 0 18px;}.meta td{width:50%;vertical-align:top;padding:0 12px 0 0;}' +
    '.box{border:1px solid #d1d5db;padding:12px;margin-bottom:18px;}.box-title{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;}' +
    '.details{width:100%;border-collapse:collapse;}.details td{padding:3px 8px 3px 0;vertical-align:top;}.label{font-weight:700;width:82px;}' +
    '.notes{border-top:1px solid #e5e7eb;margin-top:9px;padding-top:9px;white-space:normal;}.notes span{font-weight:700;}' +
    'table.items{width:100%;border-collapse:collapse;margin-top:7px;}thead{display:table-header-group;}tr{page-break-inside:avoid;}' +
    '.items th{background:#111827;color:#fff;text-align:left;padding:8px 7px;font-size:10px;}' +
    '.items td{border-bottom:1px solid #e5e7eb;padding:8px 7px;vertical-align:top;}.items tr:nth-child(even) td{background:#f9fafb;}' +
    '.number{text-align:right;white-space:nowrap;}.muted{color:#6b7280;}.strong{font-weight:700;}' +
    '.totals{width:330px;margin:18px 0 0 auto;border-collapse:collapse;}.totals td{padding:4px 0 4px 12px;}.totals td:last-child{text-align:right;white-space:nowrap;}' +
    '.grand td{border-top:2px solid #111827;padding-top:8px;font-size:15px;font-weight:800;}' +
    '.footer{clear:both;border-top:1px solid #d1d5db;margin-top:28px;padding-top:10px;color:#6b7280;font-size:10px;text-align:center;}' +
    '</style></head><body><div class="page">' +
    '<div class="header"><div class="brand">RIO TRADING</div><div class="tag">Wholesale Catalogue</div>' +
    '<div class="doc-title">ORDER CONFIRMATION<div class="ref">' + htmlEscape_(order.orderRef) + '</div></div></div>' +
    '<table class="meta"><tr><td><strong>Order date</strong><br>' + htmlEscape_(formatDisplayDate_(order.createdAt)) + '</td>' +
    '<td><strong>Order status</strong><br>' + htmlEscape_(order.orderStatus) + '</td></tr></table>' +
    '<div class="box"><div class="box-title">Customer details</div><table class="details">' +
    '<tr><td class="label">Business</td><td>' + htmlEscape_(order.customer.shopName) + '</td>' +
    '<td class="label">Phone</td><td>' + htmlEscape_(order.customer.phone) + '</td></tr>' +
    '<tr><td class="label">Contact</td><td>' + htmlEscape_(order.customer.contactName) + '</td>' +
    '<td class="label">Email</td><td>' + htmlEscape_(order.customer.email) + '</td></tr></table>' + notes + '</div>' +
    '<div class="box-title">Order items</div><table class="items"><thead><tr>' +
    '<th>Product</th><th>Unit</th><th class="number">Qty</th><th class="number">Unit price</th>' +
    '<th class="number">Discount</th><th class="number">Line total</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<table class="totals">' +
    totalRowHtml_('Gross subtotal', formatMoney_(order.grossSubtotal), false) +
    discountTotals +
    totalRowHtml_('Order total', formatMoney_(order.total), true) +
    '</table><div class="footer">Rio Trading - Order generated from the saved business record.</div>' +
    '</div></body></html>';
}

function totalRowHtml_(label, value, grand) {
  return '<tr' + (grand ? ' class="grand"' : '') + '><td>' + htmlEscape_(label) +
    '</td><td>' + htmlEscape_(value) + '</td></tr>';
}

function buildOrderEmailText_(order) {
  var lines = [
    'New Rio Trading order',
    '',
    'Order reference: ' + order.orderRef,
    'Order date: ' + formatDisplayDate_(order.createdAt),
    'Business: ' + order.customer.shopName,
    'Contact: ' + order.customer.contactName,
    'Phone: ' + order.customer.phone,
    'Customer email: ' + order.customer.email,
    '',
    'ORDER ITEMS',
  ];

  order.lines.forEach(function(line) {
    lines.push(
      line.lineNumber + '. ' + line.productName + ' | ' + line.quantity + ' x ' +
      formatMoney_(line.unitPrice) + ' | ' + formatSavedDiscount_(line) + ' | ' +
      formatMoney_(line.lineTotal)
    );
  });

  lines.push('', 'ORDER TOTAL: ' + formatMoney_(order.total));
  if (order.customer.notes) lines.push('', 'Notes: ' + order.customer.notes);
  lines.push('', 'The PDF order confirmation is attached.');
  return lines.join('\n');
}

function formatSavedDiscount_(line) {
  if (!line.discountMode || !line.discountAmount) return 'None';
  if (line.discountMode === 'pct') return formatNumber_(line.discountValue) + '%';
  return formatMoney_(Number(line.discountValue)) + ' per unit';
}

function formatMoney_(value) {
  return '£' + (Number(value) || 0).toFixed(2);
}

function formatNumber_(value) {
  var number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
}

function formatDisplayDate_(value) {
  var date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return String(value || '');
  return Utilities.formatDate(date, ORDER_SYSTEM.TIME_ZONE, 'dd/MM/yyyy HH:mm');
}

function htmlEscape_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlText_(value) {
  return htmlEscape_(value).replace(/\r?\n/g, '<br>');
}

function safeSheetText_(value) {
  var text = String(value === undefined || value === null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function safeErrorMessage_(error) {
  var message = error && error.message ? error.message : String(error || 'Unknown email error');
  return message.replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function generateUniqueOrderRef_(ordersSheet, createdAt) {
  var existingRefs = Object.create(null);
  var lastRow = ordersSheet.getLastRow();
  if (lastRow >= 2) {
    ordersSheet.getRange(2, ORDER_COLUMN.ORDER_REF, lastRow - 1, 1).getValues().forEach(function(row) {
      if (row[0]) existingRefs[String(row[0])] = true;
    });
  }

  var datePart = Utilities.formatDate(createdAt, ORDER_SYSTEM.TIME_ZONE, 'yyyyMMdd');
  for (var attempt = 0; attempt < 20; attempt++) {
    var suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
    var orderRef = 'ORD-' + datePart + '-' + suffix;
    if (!existingRefs[orderRef]) return orderRef;
  }

  throw new Error('Unable to generate a unique order reference.');
}

function readProductCatalogue_(productSheet) {
  return buildProductCatalogue_(productSheet.getDataRange().getValues());
}

function buildProductCatalogue_(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw publicError_('CATALOGUE_UNAVAILABLE', 'The product catalogue is unavailable.');
  }

  var headers = rows[0].map(function(value) {
    return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase();
  });
  var indexes = headerIndexes_(headers);
  ['id', 'name', 'category', 'price'].forEach(function(requiredHeader) {
    if (indexes[requiredHeader] === undefined) {
      throw publicError_('CATALOGUE_UNAVAILABLE', 'The product catalogue is missing required columns.');
    }
  });

  var products = Object.create(null);
  var productCount = 0;

  rows.slice(1).forEach(function(row) {
    if (row.every(function(value) { return String(value === null ? '' : value).trim() === ''; })) return;

    var record = {};
    headers.forEach(function(header, index) {
      if (header) record[header] = row[index] === undefined || row[index] === null ? '' : row[index];
    });

    var hasProductDetails = ['name', 'category', 'price', 'unit', 'stock', 'image', 'active']
      .some(function(field) {
        var value = record[field];
        return value !== undefined && value !== null && String(value).trim() !== '';
      });
    if (!hasProductDetails) return; // Reserved ID-only row.

    var id = String(record.id === undefined ? '' : record.id).trim();
    var name = String(record.name === undefined ? '' : record.name).trim();
    var category = String(record.category === undefined ? '' : record.category).trim();
    var unit = String(record.unit === undefined ? '' : record.unit).trim();
    var price = Number(record.price);

    if (!id || !name || !category || !Number.isFinite(price) || price <= 0) {
      throw publicError_('CATALOGUE_UNAVAILABLE', 'The product catalogue contains invalid product data.');
    }
    if (products[id]) {
      throw publicError_('CATALOGUE_UNAVAILABLE', 'The product catalogue contains duplicate product IDs.');
    }

    products[id] = {
      id: id,
      name: name,
      category: category,
      unit: unit,
      unitPricePence: toPence_(price),
      active: parseActiveValue_(record.active),
    };
    productCount++;
  });

  if (productCount === 0) {
    throw publicError_('CATALOGUE_UNAVAILABLE', 'The product catalogue contains no products.');
  }
  return products;
}

function parseActiveValue_(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return true;
  if (rawValue === true || rawValue === 1) return true;
  if (rawValue === false || rawValue === 0) return false;

  var value = String(rawValue).trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;
  throw publicError_('CATALOGUE_UNAVAILABLE', 'The product catalogue contains an invalid active value.');
}

function getRequiredSheets_(spreadsheet) {
  var productSheet = spreadsheet.getSheetById(ORDER_SYSTEM.PRODUCT_SHEET_ID);
  var ordersSheet = spreadsheet.getSheetByName(ORDER_SYSTEM.ORDERS_SHEET_NAME);
  var orderItemsSheet = spreadsheet.getSheetByName(ORDER_SYSTEM.ORDER_ITEMS_SHEET_NAME);

  if (!productSheet || !ordersSheet || !orderItemsSheet) {
    throw new Error('Order system setup is incomplete. Run setupOrderSystem first.');
  }

  assertSheetHeaders_(ordersSheet, ORDER_HEADERS);
  assertSheetHeaders_(orderItemsSheet, ORDER_ITEM_HEADERS);
  return { product: productSheet, orders: ordersSheet, orderItems: orderItemsSheet };
}

function openConfiguredSpreadsheet_() {
  var spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(ORDER_SYSTEM.SPREADSHEET_ID_PROPERTY);
  if (!spreadsheetId) {
    throw new Error('Order system setup is incomplete. Run setupOrderSystem first.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  var existingHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0]
    .map(function(value) { return String(value).trim(); });
  var hasExistingHeaders = existingHeaders.some(function(value) { return Boolean(value); });

  if (!hasExistingHeaders && sheet.getLastRow() <= 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
  } else {
    assertHeaderValues_(existingHeaders, headers, sheetName);
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);

  return sheet;
}

function assertSheetHeaders_(sheet, expectedHeaders) {
  if (sheet.getMaxColumns() < expectedHeaders.length) {
    throw new Error(sheet.getName() + ' does not contain the required columns.');
  }
  var existingHeaders = sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0]
    .map(function(value) { return String(value).trim(); });
  assertHeaderValues_(existingHeaders, expectedHeaders, sheet.getName());
}

function assertHeaderValues_(actual, expected, sheetName) {
  for (var i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new Error(
        sheetName + ' header mismatch at column ' + (i + 1) +
        '. Expected "' + expected[i] + '" but found "' + (actual[i] || '') + '".'
      );
    }
  }
}

function formatOrdersSheet_(sheet) {
  var dataRowCount = Math.max(1, sheet.getMaxRows() - 1);
  var orderStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Open', 'Delivered', 'Cancelled'], true)
    .setAllowInvalid(false)
    .setHelpText('Select the fulfilment status for this order.')
    .build();
  var emailStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'Sent', 'Failed'], true)
    .setAllowInvalid(false)
    .setHelpText('This value is controlled by the order email process.')
    .build();

  sheet.getRange(2, ORDER_COLUMN.ORDER_STATUS, dataRowCount, 1).setDataValidation(orderStatusRule);
  sheet.getRange(2, ORDER_COLUMN.EMAIL_STATUS, dataRowCount, 1).setDataValidation(emailStatusRule);
  sheet.getRange(2, 1, dataRowCount, 2).setNumberFormat('@');
  sheet.getRange(2, 3, dataRowCount, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.getRange(2, 6, dataRowCount, 2).setNumberFormat('@');
  sheet.getRange(2, 11, dataRowCount, 3).setNumberFormat('£0.00');
  sheet.getRange(2, 14, dataRowCount, 1).setNumberFormat('0.00');
  sheet.getRange(2, 15, dataRowCount, 2).setNumberFormat('£0.00');
  sheet.getRange(2, 19, dataRowCount, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  sheet.setColumnWidth(1, 175);
  sheet.setColumnWidth(2, 260);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 190);
  sheet.setColumnWidth(5, 170);
  sheet.setColumnWidth(6, 125);
  sheet.setColumnWidth(7, 220);
  sheet.setColumnWidth(8, 280);
  sheet.setColumnWidth(17, 120);
  sheet.setColumnWidth(18, 120);
  sheet.setColumnWidth(20, 260);
}

function formatOrderItemsSheet_(sheet) {
  var dataRowCount = Math.max(1, sheet.getMaxRows() - 1);
  sheet.getRange(2, 1, dataRowCount, 1).setNumberFormat('@');
  sheet.getRange(2, 3, dataRowCount, 1).setNumberFormat('@');
  sheet.getRange(2, 8, dataRowCount, 1).setNumberFormat('£0.00');
  sheet.getRange(2, 10, dataRowCount, 1).setNumberFormat('0.00');
  sheet.getRange(2, 11, dataRowCount, 3).setNumberFormat('£0.00');
  sheet.setColumnWidth(1, 175);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 240);
  sheet.setColumnWidth(5, 175);
  sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(9, 115);
}

function requiredString_(value, fieldName, maxLength, code) {
  if (value === undefined || value === null) {
    throw publicError_(code, fieldName + ' is required.');
  }
  var text = String(value).trim();
  if (!text) throw publicError_(code, fieldName + ' is required.');
  if (text.length > maxLength) throw publicError_(code, fieldName + ' is too long.');
  return text;
}

function optionalString_(value, fieldName, maxLength, code) {
  if (value === undefined || value === null) return '';
  var text = String(value).trim();
  if (text.length > maxLength) throw publicError_(code, fieldName + ' is too long.');
  return text;
}

function headerIndexes_(headers) {
  var indexes = Object.create(null);
  headers.forEach(function(header, index) {
    if (header && indexes[header] === undefined) indexes[header] = index;
  });
  return indexes;
}

function isObject_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber_(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toPence_(pounds) {
  return Math.round(Number(pounds) * 100);
}

function fromPence_(pence) {
  return Number((pence / 100).toFixed(2));
}

function formatDateTime_(date) {
  var value = Utilities.formatDate(date, ORDER_SYSTEM.TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssZ");
  return value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

function publicError_(code, message) {
  var error = new Error(message);
  error.publicCode = code;
  return error;
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
