/**
 * demo.js — Interactive demo for InvoiceAI
 * Parses invoice text via the backend API and displays results.
 */

(function() {
  'use strict';

  // ─── Configuration ─────────────────────────────────────────────
  // In production, point this to your deployed API.
  // For local dev, it defaults to the relative path or localhost.
  const API_BASE = (function() {
    // Try to detect if we're running behind the same server
    const host = window.location.hostname;
    const port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') {
      return `http://localhost:${port || 3000}`;
    }
    // For production, use the same origin or configured API
    return window.location.origin;
  })();

  // ─── DOM References ────────────────────────────────────────────
  const invoiceInput    = document.getElementById('invoiceInput');
  const parseBtn        = document.getElementById('parseBtn');
  const clearBtn        = document.getElementById('clearBtn');
  const sampleBtn       = document.getElementById('sampleBtn');
  const resultArea      = document.getElementById('resultArea');
  const resultEmpty     = document.getElementById('resultEmpty');
  const resultContent   = document.getElementById('resultContent');
  const resultStatus    = document.getElementById('resultStatus');
  const resultTableView = document.getElementById('resultTableView');
  const resultJsonView  = document.getElementById('resultJsonView');
  const copyJsonBtn     = document.getElementById('copyJsonBtn');
  const responseTimeEl  = document.getElementById('responseTime');
  const apiEndpointEl   = document.getElementById('apiEndpoint');

  if (!parseBtn) return; // Not on demo page

  // ─── Sample invoice ────────────────────────────────────────────
  const SAMPLE_INVOICE = `INVOICE

Invoice #: INV-2024-0087
Date: May 15, 2024
Due Date: June 15, 2024

FROM:
Acme Software Solutions LLC
123 Tech Street, San Francisco, CA 94105
billing@acmesoftware.com

BILL TO:
Johnson & Associates
456 Business Ave, New York, NY 10001

ITEMS:
Web Development Services   40  @ $125.00    $5,000.00
API Integration            8   @ $150.00    $1,200.00
Monthly Hosting            1   @ $99.00     $99.00
Technical Support          5   @ $100.00    $500.00

                        Subtotal:    $6,799.00
                        Tax (8.5%):  $577.92
                        TOTAL DUE:   $7,376.92

Payment Terms: Net 30
Currency: USD`;

  // ─── Sample invoice (Indian GST format) ────────────────────────
  const SAMPLE_GST = `TAX INVOICE

Invoice No: GST-2024-0561
Date: 12-May-2024

Seller:
TechVista Solutions Pvt Ltd
#45, MG Road, Bangalore - 560001
GST: 29AABCT1234A1Z5

Buyer:
GreenLeaf Enterprises
Andheri East, Mumbai - 400093
GST: 27AABCE5678B1Z6

Description          HSN     Qty    Rate     Amount
Software License     8523     2    25,000   50,000
Annual Maintenance   9985     1    12,000   12,000

                    Total:           62,000
                    CGST 9%:          5,580
                    SGST 9%:          5,580
                    Grand Total:     73,160`;

  // ─── Parse Invoice ─────────────────────────────────────────────
  async function parseInvoice(text) {
    const startTime = performance.now();

    // Show loading state
    resultContent.style.display = 'none';
    resultEmpty.style.display = 'none';
    resultArea.innerHTML = `
      <div class="result-empty">
        <div class="loading-spinner" style="width:32px;height:32px;border-width:3px;"></div>
        <p style="margin-top:16px;">Parsing invoice...</p>
        <small style="color:var(--text-dim);">Extracting fields with AI pattern matching</small>
      </div>
    `;

    try {
      // Try the demo endpoint (no auth required)
      const response = await fetch(`${API_BASE}/demo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      responseTimeEl.textContent = `${elapsed}s`;

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      displayResult(data.parsed || data);

    } catch (err) {
      // If backend is not available, fall back to client-side regex parsing
      console.warn('API call failed, using client-side parser:', err.message);
      responseTimeEl.textContent = '— (offline)';

      // Fallback: use a simple client-side parser
      const fallbackResult = clientSideParse(text);
      displayResult(fallbackResult);
    }
  }

  // ─── Display Result ────────────────────────────────────────────
  function displayResult(parsed) {
    resultArea.innerHTML = '';

    if (parsed.error) {
      resultArea.innerHTML = `
        <div class="result-empty">
          <div style="color:#ef4444;font-size:1.5rem;font-weight:700;">!</div>
          <p style="color:#ef4444;">Parse Error</p>
          <small style="color:var(--text-dim);">${parsed.error}</small>
        </div>
      `;
      return;
    }

    const hasData = parsed.invoiceNumber || parsed.totalAmount || parsed.date;

    if (!hasData) {
      resultArea.innerHTML = `
        <div class="result-empty">
          <div style="font-size:2rem;">🔍</div>
          <p>No invoice data detected</p>
          <small style="color:var(--text-dim);">Try pasting a different invoice format, or use the sample button.</small>
        </div>
      `;
      return;
    }

    // ─── Build Status ─────────────────────────────────────────
    const confidence = parsed.confidence || 
      (parsed.invoiceNumber && parsed.totalAmount && parsed.date ? 85 : 45);
    const isHighConf = confidence >= 60;

    // ─── Build table view ─────────────────────────────────────
    const fields = [
      { label: 'Invoice #',      value: parsed.invoiceNumber },
      { label: 'Date',           value: parsed.date },
      { label: 'Due Date',       value: parsed.dueDate },
      { label: 'Vendor',         value: parsed.vendor },
      { label: 'Bill To',        value: parsed.billTo },
      { label: 'Subtotal',       value: parsed.subtotal ? `$${parsed.subtotal}` : null },
      { label: 'Tax',            value: parsed.tax ? `$${parsed.tax}` : null },
      { label: 'Total',          value: parsed.totalAmount ? `$${parsed.totalAmount}` : null },
      { label: 'Currency',       value: parsed.currency },
    ];

    let tableHtml = '<table class="result-table">';
    fields.forEach(f => {
      if (f.value !== null && f.value !== undefined) {
        tableHtml += `<tr><td class="label">${f.label}</td><td class="value">${f.value}</td></tr>`;
      }
    });

    // ─── Line items ───────────────────────────────────────────
    if (parsed.lineItems && parsed.lineItems.length > 0) {
      tableHtml += `<tr><td class="label">Line Items</td><td class="value">${parsed.lineItems.length} items</td></tr>`;
      parsed.lineItems.forEach((item, i) => {
        tableHtml += `<tr style="font-size:0.78rem;">
          <td style="padding-left:20px;color:var(--text-dim);">${i+1}. ${item.description || item.item || ''}</td>
          <td class="value">${item.lineTotal ? '$' + item.lineTotal : item.amount || ''}</td>
        </tr>`;
      });
    }

    tableHtml += '</table>';

    // ─── Confidence ───────────────────────────────────────────
    const confColor = isHighConf ? 'var(--green)' : 'var(--amber)';
    tableHtml += `<div style="margin-top:12px;font-size:0.8rem;">
      <span style="color:var(--text-dim);">Confidence: </span>
      <span style="color:${confColor};font-weight:600;">${confidence}%</span>
    </div>`;

    // ─── Render ───────────────────────────────────────────────
    resultArea.innerHTML = '';
    const statusEl = document.createElement('div');
    statusEl.style.cssText = 'margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;';

    const statusBadge = document.createElement('span');
    statusBadge.className = `result-status ${isHighConf ? 'success' : 'error'}`;
    statusBadge.innerHTML = isHighConf ? '✓ Parsed Successfully' : '⚠ Low Confidence';
    statusEl.appendChild(statusBadge);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-outline';
    copyBtn.style.cssText = 'padding:6px 14px;font-size:0.8rem;';
    copyBtn.textContent = 'Copy JSON';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(parsed, null, 2))
        .then(() => { copyBtn.textContent = 'Copied!'; setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 2000); })
        .catch(() => {});
    });
    statusEl.appendChild(copyBtn);
    resultArea.appendChild(statusEl);

    const tableDiv = document.createElement('div');
    tableDiv.innerHTML = tableHtml;
    resultArea.appendChild(tableDiv);

    const hr = document.createElement('hr');
    hr.style.cssText = 'border:none;border-top:1px solid var(--border);margin:16px 0;';
    resultArea.appendChild(hr);

    const jsonPre = document.createElement('pre');
    jsonPre.className = 'result-json';
    jsonPre.textContent = JSON.stringify(parsed, null, 2);
    resultArea.appendChild(jsonPre);
  }

  // ─── Client-side fallback parser ────────────────────────────
  function clientSideParse(text) {
    if (!text || typeof text !== 'string') {
      return { error: 'No text provided' };
    }

    const result = {};
    const lines = text.split('\n').map(l => l.trim());

    // Invoice number
    const invMatch = text.match(/(?:Invoice\s*(?:#|No|Number)|INV|GST)\s*[:#]?\s*([A-Z0-9][-A-Z0-9/]+)/i);
    if (invMatch) result.invoiceNumber = invMatch[1];

    // Date
    const dateMatch = text.match(/(?:Date|Invoice Date|Dated)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
    if (dateMatch) result.date = dateMatch[1];

    // Due date
    const dueMatch = text.match(/Due\s+(?:Date|By|On)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
    if (dueMatch) result.dueDate = dueMatch[1];

    // Total
    const totalMatch = text.match(/(?:Total|Grand Total|TOTAL DUE|Balance Due|Amount Due)\s*(?:due)?\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
    if (totalMatch) result.totalAmount = parseFloat(totalMatch[1].replace(/,/g, ''));

    // Subtotal
    const subMatch = text.match(/Sub\s*Total\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
    if (subMatch) result.subtotal = parseFloat(subMatch[1].replace(/,/g, ''));

    // Tax
    const taxMatch = text.match(/(?:Tax|VAT|GST|CGST|SGST)\s*(?:\(\d+%\))?\s*:?\s*\$?\s*([\d,]+\.?\d*)/i);
    if (taxMatch) result.tax = parseFloat(taxMatch[1].replace(/,/g, ''));

    // Vendor - try to find "FROM:" or vendor name
    const fromIdx = lines.findIndex(l => /^from\s*:/i.test(l));
    if (fromIdx >= 0 && fromIdx + 1 < lines.length) {
      result.vendor = lines[fromIdx + 1];
    }

    // Currency
    const currMatch = text.match(/Currency\s*:?\s*(USD|EUR|GBP|INR|JPY|CAD|AUD)/i);
    if (currMatch) result.currency = currMatch[1].toUpperCase();

    // Line items
    const itemPattern = /^(.{10,60}?)\s{2,}(\d+)\s*(?:@\s*\$?[\d,]+\.?\d*\s*)?\$?([\d,]+\.?\d*)$/gm;
    const items = [];
    let match;
    while ((match = itemPattern.exec(text)) !== null) {
      const desc = match[1].trim();
      if (!desc.match(/total|subtotal|tax|due|date|invoice|payment|thank/i)) {
        items.push({
          description: desc,
          lineTotal: parseFloat(match[3].replace(/,/g, ''))
        });
      }
    }
    if (items.length > 0) result.lineItems = items;

    // Confidence
    let score = 0;
    if (result.invoiceNumber) score += 20;
    if (result.date) score += 20;
    if (result.totalAmount) score += 25;
    if (result.vendor) score += 15;
    if (result.lineItems && result.lineItems.length > 0) score += 10;
    if (result.dueDate) score += 10;
    result.confidence = score;

    result.parsedAt = new Date().toISOString();
    return result;
  }

  // ─── Event Handlers ────────────────────────────────────────────
  parseBtn.addEventListener('click', () => {
    const text = invoiceInput.value.trim();
    if (!text || text.length < 10) {
      alert('Please paste some invoice text first (at least 10 characters).');
      return;
    }
    parseInvoice(text);
  });

  clearBtn.addEventListener('click', () => {
    invoiceInput.value = '';
    resultArea.innerHTML = `
      <div id="resultEmpty" class="result-empty">
        <div class="result-empty-icon">⟡</div>
        <p>Click "Parse Invoice" to see results here</p>
        <small style="color:var(--text-dim);">The AI extracts invoice number, dates, line items, totals, vendor, and client info.</small>
      </div>
    `;
    responseTimeEl.textContent = '—';
  });

  let sampleIndex = 0;
  const samples = [SAMPLE_INVOICE, SAMPLE_GST];
  sampleBtn.addEventListener('click', () => {
    invoiceInput.value = samples[sampleIndex % samples.length];
    sampleIndex++;
    // Auto-parse the sample
    parseInvoice(invoiceInput.value);
  });

  // ─── Auto-parse on page load (pre-filled sample) ──────────────
  setTimeout(() => parseInvoice(invoiceInput.value), 500);

  // ─── Update API endpoint display ───────────────────────────────
  if (apiEndpointEl) {
    apiEndpointEl.textContent = `${API_BASE}/parse`;
  }
})();
