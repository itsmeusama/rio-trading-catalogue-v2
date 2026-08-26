#!/usr/bin/env node

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptSource = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = scriptSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist in script.js`);
  const sourceStart = scriptSource.slice(Math.max(0, start - 6), start) === 'async '
    ? start - 6
    : start;
  const bodyStart = scriptSource.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < scriptSource.length; index += 1) {
    if (scriptSource[index] === '{') depth += 1;
    if (scriptSource[index] === '}') depth -= 1;
    if (depth === 0) return scriptSource.slice(sourceStart, index + 1);
  }
  throw new Error(`Could not read ${name}.`);
}

async function run() {
  assert.doesNotMatch(htmlSource, /jspdf|autotable/i);
  assert.doesNotMatch(scriptSource, /function buildPDF\b|window\.jspdf|\.autoTable\s*\(/);
  assert.match(scriptSource, /toOrderData\(response, customer, fallbackItems, submissionId\)/);
  assert.match(htmlSource, /<script src="order-api\.js"><\/script>/);

  const classes = new Set(['hidden']);
  const status = {
    textContent: '',
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
    },
  };
  const button = { disabled: false, innerHTML: '<svg></svg> Download Order Confirmation', textContent: '' };
  const events = { appended: 0, clicked: 0, removed: 0, revoked: [] };
  const links = [];
  const document = {
    getElementById(id) {
      assert.equal(id, 'downloadPdfStatus');
      return status;
    },
    createElement(tag) {
      assert.equal(tag, 'a');
      const link = {
        style: {},
        click() { events.clicked += 1; },
        remove() { events.removed += 1; },
      };
      links.push(link);
      return link;
    },
    body: { appendChild() { events.appended += 1; } },
  };
  function BlobMock(chunks, options) {
    this.chunks = chunks;
    this.type = options.type;
  }
  const URL = {
    createObjectURL(blob) {
      assert.equal(blob.type, 'application/pdf');
      return 'blob:rio-order-pdf';
    },
    revokeObjectURL(value) { events.revoked.push(value); },
  };
  const api = {
    async requestOrderPdf(url, orderRef, submissionId) {
      assert.equal(url, 'https://script.google.com/macros/s/test-deployment/exec');
      assert.equal(orderRef, 'ORD-20260804-ABCDE');
      assert.equal(submissionId, '11111111-1111-4111-8111-111111111111');
      return { pdfBase64: 'unused-by-this-layer' };
    },
    decodePdfPayload() {
      return {
        fileName: 'Rio-Trading-Order-Confirmation-ORD-20260804-ABCDE.pdf',
        mimeType: 'application/pdf',
        bytes: new Uint8Array([37, 80, 68, 70, 45]),
      };
    },
  };
  const context = {
    Blob: BlobMock,
    CONFIG: { ORDER_API_URL: 'https://script.google.com/macros/s/test-deployment/exec' },
    document,
    URL,
    RioOrderApi: api,
    window: { RioOrderApi: api },
    console: { error() {} },
    setTimeout(callback) { callback(); },
    Uint8Array,
  };
  vm.createContext(context);
  new vm.Script(`
    ${extractFunction('triggerPdfFileDownload')}
    ${extractFunction('downloadPDF')}
    globalThis.runDownload = downloadPDF;
  `).runInContext(context);

  const orderData = {
    orderRef: 'ORD-20260804-ABCDE',
    downloadSubmissionId: '11111111-1111-4111-8111-111111111111',
  };
  await context.runDownload(orderData, button);
  assert.equal(events.appended, 1);
  assert.equal(events.clicked, 1);
  assert.equal(events.removed, 1);
  assert.deepEqual(events.revoked, ['blob:rio-order-pdf']);
  assert.equal(links[0].download, 'Rio-Trading-Order-Confirmation-ORD-20260804-ABCDE.pdf');
  assert.equal(button.disabled, false);
  assert.equal(button.innerHTML, '<svg></svg> Download Order Confirmation');
  assert.equal(classes.has('hidden'), true);

  api.requestOrderPdf = async () => { throw new Error('Test download failure'); };
  await context.runDownload(orderData, button);
  assert.equal(events.clicked, 1, 'a failed request must not download a stale or empty file');
  assert.equal(classes.has('hidden'), false);
  assert.match(status.textContent, /Test download failure/);
  assert.match(status.textContent, /order is already saved/i);
  assert.equal(button.disabled, false, 'the download button must be retryable after failure');

  console.log('PDF download tests passed: secured request wiring, browser file save, retry feedback, and jsPDF removal.');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
