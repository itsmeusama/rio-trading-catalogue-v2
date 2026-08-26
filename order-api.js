/* Rio Trading order API client - no framework or external dependency. */
(function(global) {
  'use strict';

  var STORAGE_KEY = 'rioTradingPendingSubmission';
  var memoryRecord = null;

  function createSubmissionId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }

    var bytes = new Uint8Array(16);
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;

    var hex = Array.from(bytes, function(value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
      hex.slice(16, 20) + '-' + hex.slice(20);
  }

  async function fingerprintPayload(payload) {
    var source = JSON.stringify(payload);
    if (global.crypto && global.crypto.subtle && typeof TextEncoder !== 'undefined') {
      var digest = await global.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
      return Array.from(new Uint8Array(digest), function(value) {
        return value.toString(16).padStart(2, '0');
      }).join('');
    }

    // Deterministic fallback for file:// or older browsers without SubtleCrypto.
    var hashA = 2166136261;
    var hashB = 0x9e3779b9;
    for (var i = 0; i < source.length; i++) {
      hashA ^= source.charCodeAt(i);
      hashA = Math.imul(hashA, 16777619);
      hashB = Math.imul(hashB ^ source.charCodeAt(i), 2246822519);
    }
    return source.length + '-' + (hashA >>> 0).toString(16) + '-' + (hashB >>> 0).toString(16);
  }

  function readRecord(storage) {
    try {
      var raw = storage && storage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : memoryRecord;
    } catch (error) {
      return memoryRecord;
    }
  }

  function writeRecord(storage, record) {
    memoryRecord = record;
    try {
      if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch (error) {
      // Memory fallback still preserves retries within the current page session.
    }
  }

  function getOrCreateSubmissionId(fingerprint, storage) {
    var existing = readRecord(storage);
    var uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (existing && existing.fingerprint === fingerprint && uuidPattern.test(existing.submissionId || '')) {
      return existing.submissionId;
    }

    var submissionId = createSubmissionId();
    writeRecord(storage, { fingerprint: fingerprint, submissionId: submissionId });
    return submissionId;
  }

  function clearSubmission(storage) {
    memoryRecord = null;
    try {
      if (storage) storage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Nothing else is required when browser storage is unavailable.
    }
  }

  function assertServiceUrl_(url) {
    if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
      throw new Error('The order service is not configured correctly.');
    }
  }

  function responseError_(data, fallbackMessage, fallbackCode) {
    var error = new Error(data && data.message ? data.message : fallbackMessage);
    error.code = data && data.code ? data.code : fallbackCode;
    error.response = data;
    return error;
  }

  async function postJson_(url, payload, options, messages) {
    assertServiceUrl_(url);

    options = options || {};
    messages = messages || {};
    var fetchImpl = options.fetchImpl || global.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('This browser cannot contact the order service.');

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutMs = options.timeoutMs || 45000;
    var timeoutId = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;

    try {
      // No custom Content-Type header: this remains a simple cross-origin POST
      // and avoids an unnecessary CORS preflight to Apps Script.
      var response = await fetchImpl(url, {
        method: 'POST',
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: controller ? controller.signal : undefined,
      });
      var text = await response.text();
      var data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error(messages.unreadable || 'The order service returned an unreadable response.');
      }

      if (!response.ok || !data || data.ok !== true) {
        throw responseError_(
          data,
          messages.rejected || 'The request was not accepted.',
          messages.rejectedCode || 'REQUEST_REJECTED'
        );
      }
      return data;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error(messages.timeout || 'The request timed out. Please try again.');
      }
      if (error && error.response) throw error;
      var networkError = new Error(
        error && error.message
          ? error.message
          : (messages.network || 'The order service could not be reached. Check the connection and try again.')
      );
      networkError.cause = error;
      throw networkError;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async function postOrder(url, payload, options) {
    var data = await postJson_(url, payload, options, {
      rejected: 'The order was not accepted.',
      rejectedCode: 'ORDER_REJECTED',
      unreadable: 'The order service returned an unreadable response.',
      timeout: 'The order request timed out. Please retry; the same order will not be duplicated.',
      network: 'The order service could not be reached. Check the connection and try again.',
    });

    if (data.saved !== true) {
      throw responseError_(data, 'The order was not accepted.', 'ORDER_REJECTED');
    }
    return data;
  }

  async function requestOrderPdf(url, orderRef, submissionId, options) {
    var data = await postJson_(url, {
      action: 'downloadOrderPdf',
      orderRef: orderRef,
      submissionId: submissionId,
    }, options, {
      rejected: 'The Order Confirmation could not be downloaded.',
      rejectedCode: 'PDF_DOWNLOAD_FAILED',
      unreadable: 'The PDF service returned an unreadable response.',
      timeout: 'The PDF download timed out. Your order is safely saved; please try again.',
      network: 'The PDF service could not be reached. Check the connection and try again.',
    });

    if (
      data.action !== 'downloadOrderPdf' ||
      data.orderRef !== orderRef ||
      data.mimeType !== 'application/pdf' ||
      typeof data.fileName !== 'string' ||
      !/^Rio-Trading-Order-Confirmation-ORD-[0-9]{8}-[A-F0-9]{5}\.pdf$/.test(data.fileName) ||
      typeof data.pdfBase64 !== 'string' ||
      data.pdfBase64.length === 0
    ) {
      throw new Error('The PDF service returned an incomplete response.');
    }

    return data;
  }

  function decodePdfPayload(payload) {
    var binary;
    try {
      binary = global.atob(payload.pdfBase64);
    } catch (error) {
      throw new Error('The downloaded PDF data is invalid.');
    }

    if (binary.slice(0, 5) !== '%PDF-') {
      throw new Error('The downloaded file is not a valid PDF.');
    }

    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return {
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      bytes: bytes,
    };
  }

  function discountLabel(item) {
    if (!item.discountMode || !Number(item.discountAmount)) return null;
    if (item.discountMode === 'pct') return Number(item.discountValue) + '% off';
    return '£' + Number(item.discountValue).toFixed(2) + ' off';
  }

  function toOrderData(response, customer, fallbackItems, submissionId) {
    if (!response || !response.orderRef || !response.totals) {
      throw new Error('The saved order response is incomplete.');
    }

    var sourceItems = Array.isArray(response.items) && response.items.length
      ? response.items
      : (fallbackItems || []);
    var items = sourceItems.map(function(item) {
      var quantity = Number(item.quantity !== undefined ? item.quantity : item.qty);
      var unitPrice = Number(item.unitPrice);
      var discountAmount = Number(
        item.discountAmount !== undefined ? item.discountAmount : item.discountAmt
      ) || 0;
      return {
        name: String(item.name || ''),
        unit: String(item.unit || ''),
        qty: quantity,
        unitPrice: unitPrice,
        discountAmt: discountAmount,
        discountLabel: item.discountLabel || discountLabel(item),
        lineTotal: Number(item.lineTotal),
      };
    });

    var created = response.createdAt ? new Date(response.createdAt) : new Date();
    var orderDate = isNaN(created.getTime())
      ? String(response.createdAt || '')
      : created.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
    var totals = response.totals;
    var orderDiscountPct = Number(totals.orderDiscountPct) || 0;
    var orderDiscountAmount = Number(totals.orderDiscountAmount) || 0;
    var orderDiscountMode = String(
      totals.orderDiscountMode || (orderDiscountPct > 0 ? 'pct' : (orderDiscountAmount > 0 ? 'fixed' : ''))
    );
    var orderDiscountValue = Number(
      totals.orderDiscountValue !== undefined
        ? totals.orderDiscountValue
        : (orderDiscountMode === 'pct' ? orderDiscountPct : orderDiscountAmount)
    ) || 0;

    return {
      orderRef: String(response.orderRef),
      orderDate: orderDate,
      shopName: customer.shopName,
      contactName: customer.contactName,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      items: items,
      subtotal: Number(totals.subtotal),
      total: Number(totals.total),
      orderDiscountMode: orderDiscountMode,
      orderDiscountValue: orderDiscountValue,
      orderDiscountPct: orderDiscountPct,
      orderDiscountAmt: orderDiscountAmount,
      orderStatus: response.orderStatus,
      emailStatus: response.emailStatus,
      duplicate: response.duplicate === true,
      downloadSubmissionId: String(submissionId || ''),
    };
  }

  global.RioOrderApi = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    fingerprintPayload: fingerprintPayload,
    getOrCreateSubmissionId: getOrCreateSubmissionId,
    clearSubmission: clearSubmission,
    postOrder: postOrder,
    requestOrderPdf: requestOrderPdf,
    decodePdfPayload: decodePdfPayload,
    toOrderData: toOrderData,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
