'use strict';

/**
 * server.js — InvoiceAI Full Backend Server
 *
 * Serves: landing page, demo, API docs, user dashboard
 * API: parse endpoint, auth, API keys, payments, usage stats
 */

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('./db/init');

const app  = express();
const PORT = process.env.PORT || 3100;

const JWT_SECRET = process.env.JWT_SECRET || 'invoiceai-dev-secret-' + Date.now();
const RATE_LIMIT_WINDOW = 60 * 1000;        // 1 minute
const RATE_LIMIT_MAX_FREE = 10;              // 10 req/min for free
const RATE_LIMIT_MAX_PAID = 120;             // 120 req/min for paid

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Track API response time
app.use((req, res, next) => {
  req._startTime = Date.now();
  res.on('finish', () => {
    req._duration = Date.now() - req._startTime;
  });
  next();
});

// ─── Database ─────────────────────────────────────────────────────────────
let db;
try {
  db = getDb();
  console.log('[DB] SQLite database initialized');
} catch (err) {
  console.error('[DB] Failed to initialize:', err.message);
  process.exit(1);
}

// ─── Helper: Generate API Key ─────────────────────────────────────────────
function generateApiKey() {
  return 'iai_' + crypto.randomBytes(24).toString('hex');
}

// ─── Helper: Create JWT token ─────────────────────────────────────────────
function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ─── Auth Middleware (JWT for web sessions) ────────────────────────────────
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required (Bearer token)' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, email, name, company, created_at FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── API Key Auth Middleware (for programmatic API access) ─────────────────
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'x-api-key header required' });
  }

  const keyRecord = db.prepare(`
    SELECT ak.*, u.id as user_id, u.email, u.name, s.plan
    FROM api_keys ak
    JOIN users u ON u.id = ak.user_id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    WHERE ak.key = ? AND ak.is_active = 1
  `).get(apiKey);

  if (!keyRecord) {
    return res.status(401).json({ error: 'Invalid or inactive API key' });
  }

  // Update last_used
  db.prepare('UPDATE api_keys SET last_used_at = datetime("now") WHERE id = ?').run(keyRecord.id);

  req.apiKeyRecord = keyRecord;
  req.user = { id: keyRecord.user_id, email: keyRecord.email, name: keyRecord.name, plan: keyRecord.plan || 'free' };
  next();
}

// ─── Rate Limiting ────────────────────────────────────────────────────────
const rateLimitMap = new Map();

function rateLimit(maxRequests) {
  return (req, res, next) => {
    const userId = req.user ? req.user.id : req.ip;
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;

    if (!rateLimitMap.has(userId)) {
      rateLimitMap.set(userId, []);
    }

    const timestamps = rateLimitMap.get(userId).filter(t => t > windowStart);
    timestamps.push(now);
    rateLimitMap.set(userId, timestamps);

    if (timestamps.length > maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limit: maxRequests,
        windowMs: RATE_LIMIT_WINDOW,
        retryAfter: Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW - now) / 1000)
      });
    }
    next();
  };
}

// ─── Usage Logging ────────────────────────────────────────────────────────
function logUsage(req, statusCode) {
  try {
    db.prepare(`
      INSERT INTO usage_logs (user_id, api_key_id, endpoint, status_code, response_time_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.user ? req.user.id : null,
      req.apiKeyRecord ? req.apiKeyRecord.id : null,
      req.path,
      statusCode,
      req._duration || 0
    );
  } catch (err) {
    console.error('[Usage] Failed to log:', err.message);
  }
}

// ─── Serve Static Files ───────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════════════════
//  AUTH ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── POST /api/auth/signup ────────────────────────────────────────────────
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name, company } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, name, company) VALUES (?, ?, ?, ?)'
    ).run(email, passwordHash, name || null, company || null);

    const userId = result.lastInsertRowid;

    // Create a default API key
    const apiKey = generateApiKey();
    db.prepare('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)').run(userId, apiKey, 'Default');

    // Create a free subscription
    db.prepare('INSERT INTO subscriptions (user_id, plan, status) VALUES (?, ?, ?)').run(userId, 'free', 'active');

    const token = createToken({ id: userId, email });

    res.status(201).json({
      token,
      user: { id: userId, email, name: name || null, company: company || null, plan: 'free' },
      apiKey
    });

  } catch (err) {
    console.error('[Signup] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sub = db.prepare('SELECT plan, status FROM subscriptions WHERE user_id = ?').get(user.id);
    const token = createToken({ id: user.id, email: user.email });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        plan: sub ? sub.plan : 'free'
      }
    });

  } catch (err) {
    console.error('[Login] Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────
app.get('/api/auth/me', authenticateJWT, (req, res) => {
  const sub = db.prepare('SELECT plan, status FROM subscriptions WHERE user_id = ?').get(req.user.id);
  const keys = db.prepare('SELECT id, key, label, is_active, last_used_at, created_at FROM api_keys WHERE user_id = ?').all(req.user.id);

  res.json({
    user: {
      ...req.user,
      plan: sub ? sub.plan : 'free',
      subscriptionStatus: sub ? sub.status : 'active'
    },
    apiKeys: keys
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// ─── POST /api/keys ───────────────────────────────────────────────────────
app.post('/api/keys', authenticateJWT, (req, res) => {
  const { label } = req.body;
  const apiKey = generateApiKey();
  db.prepare('INSERT INTO api_keys (user_id, key, label) VALUES (?, ?, ?)').run(
    req.user.id, apiKey, label || 'Untitled'
  );
  res.status(201).json({ key: apiKey, label: label || 'Untitled' });
});

// ─── DELETE /api/keys/:id ─────────────────────────────────────────────────
app.delete('/api/keys/:id', authenticateJWT, (req, res) => {
  const result = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'API key not found' });
  }
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
//  INVOICE PARSING (THE CORE PRODUCT)
// ═══════════════════════════════════════════════════════════════════════════

// ─── POST /parse (API key auth) ───────────────────────────────────────────
app.post('/parse', authenticateApiKey, rateLimit(60), (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({ error: 'Invoice text is required (min 10 characters)' });
    }

    const result = parseInvoiceText(text);

    // Save to parse history
    const inputHash = crypto.createHash('md5').update(text).digest('hex');
    db.prepare(`
      INSERT INTO parse_history (user_id, api_key_id, input_text_hash, invoice_number, vendor, total_amount, currency, confidence, raw_request, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      req.apiKeyRecord.id,
      inputHash,
      result.invoiceNumber || null,
      result.vendor || null,
      result.totalAmount || null,
      result.currency || null,
      result.confidence || null,
      JSON.stringify({ textLength: text.length }),
      JSON.stringify(result)
    );

    logUsage(req, 200);
    res.json({ parsed: result });

  } catch (err) {
    console.error('[Parse] Error:', err.message);
    logUsage(req, 500);
    res.status(500).json({ error: 'Parse failed: ' + err.message });
  }
});

// ─── POST /api/parse (JWT auth, same engine) ──────────────────────────────
app.post('/api/parse', authenticateJWT, (req, res) => {
  // Clone the apiKeyRecord shape for compatibility
  req.apiKeyRecord = { id: null };
  return app._parseHandler(req, res);
});

// Store handler reference
app._parseHandler = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({ error: 'Invoice text is required (min 10 characters)' });
    }

    const result = parseInvoiceText(text);

    const inputHash = crypto.createHash('md5').update(text).digest('hex');
    db.prepare(`
      INSERT INTO parse_history (user_id, api_key_id, input_text_hash, invoice_number, vendor, total_amount, currency, confidence, raw_request, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      null,
      inputHash,
      result.invoiceNumber || null,
      result.vendor || null,
      result.totalAmount || null,
      result.currency || null,
      result.confidence || null,
      JSON.stringify({ textLength: text.length }),
      JSON.stringify(result)
    );

    logUsage(req, 200);
    res.json({ parsed: result });

  } catch (err) {
    console.error('[Parse] Error:', err.message);
    logUsage(req, 500);
    res.status(500).json({ error: 'Parse failed: ' + err.message });
  }
};

// ─── POST /api/parse/text (alias) ─────────────────────────────────────────
app.post('/api/parse/text', app._parseHandler);

// ═══════════════════════════════════════════════════════════════════════════
//  PAYMENT ENDPOINTS (Razorpay)
// ═══════════════════════════════════════════════════════════════════════════

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

// ─── GET /api/payment/config ──────────────────────────────────────────────
app.get('/api/payment/config', authenticateJWT, (req, res) => {
  res.json({
    key: RAZORPAY_KEY_ID,
    plans: [
      { id: 'starter',  name: 'Starter',  price: 999,  period: 'month', apiLimit: 500 },
      { id: 'business', name: 'Business', price: 2499, period: 'month', apiLimit: 3000, highlighted: true },
      { id: 'enterprise', name: 'Enterprise', price: 7999, period: 'month', apiLimit: 15000 }
    ]
  });
});

// ─── POST /api/payment/create-order ───────────────────────────────────────
app.post('/api/payment/create-order', authenticateJWT, async (req, res) => {
  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return res.status(503).json({ error: 'Payments not configured. Contact support.' });
    }

    const { planId } = req.body;
    const plans = {
      starter:    { amount: 999,  currency: 'INR' },
      business:   { amount: 2499, currency: 'INR' },
      enterprise: { amount: 7999, currency: 'INR' }
    };

    const plan = plans[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID. Use: starter, business, or enterprise' });
    }

    // Create order via Razorpay API
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: plan.amount * 100,  // Razorpay expects paise
        currency: plan.currency,
        receipt: `order_${req.user.id}_${Date.now()}`,
        notes: { userId: String(req.user.id), planId }
      })
    });

    const order = await response.json();

    if (!response.ok) {
      throw new Error(order.error?.description || 'Razorpay order creation failed');
    }

    // Save order reference
    db.prepare('UPDATE subscriptions SET razorpay_order_id = ?, plan = ? WHERE user_id = ?')
      .run(order.id, planId, req.user.id);

    res.json({
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency
      }
    });

  } catch (err) {
    console.error('[Payment] Create order error:', err.message);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// ─── POST /api/payment/verify ─────────────────────────────────────────────
app.post('/api/payment/verify', authenticateJWT, (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSig = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    // Update subscription
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    db.prepare(`
      UPDATE subscriptions
      SET status = 'active', razorpay_payment_id = ?, current_period_start = ?, current_period_end = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(razorpay_payment_id, now.toISOString(), periodEnd.toISOString(), req.user.id);

    res.json({
      success: true,
      message: 'Payment verified and subscription activated',
      validUntil: periodEnd.toISOString()
    });

  } catch (err) {
    console.error('[Payment] Verify error:', err.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  DASHBOARD / STATS
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /api/stats ───────────────────────────────────────────────────────
app.get('/api/stats', authenticateJWT, (req, res) => {
  const usage = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN created_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) as last30d,
           SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as last7d,
           SUM(CASE WHEN created_at >= datetime('now', '-1 days') THEN 1 ELSE 0 END) as last24h
    FROM usage_logs WHERE user_id = ?
  `).get(req.user.id);

  const recentParses = db.prepare(`
    SELECT invoice_number, vendor, total_amount, currency, confidence, created_at
    FROM parse_history
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(req.user.id);

  const sub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(req.user.id);

  res.json({
    usage,
    recentParses,
    subscription: sub
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  DEMO ENDPOINT (no auth required)
// ═══════════════════════════════════════════════════════════════════════════

// ─── POST /demo ───────────────────────────────────────────────────────────
app.post('/demo', rateLimit(5), (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length < 10) {
      return res.status(400).json({ error: 'Invoice text is required (min 10 characters)' });
    }
    const result = parseInvoiceText(text);
    // Add demo watermark
    result._demo = true;
    result._note = 'Sign up for a free API key to use in production';
    res.json({ parsed: result });
  } catch (err) {
    res.status(500).json({ error: 'Parse failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  HEALTH & INFO
// ═══════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({
    status:    'ok',
    uptime:    process.uptime().toFixed(1) + 's',
    timestamp: new Date().toISOString(),
    version:   '2.0.0'
  });
});

// ─── SPA fallback ─────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error handler ────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ═══════════════════════════════════════════════════════════════════════════
//  INVOICE PARSING ENGINE
// ═══════════════════════════════════════════════════════════════════════════

function parseInvoiceText(text) {
  if (!text || typeof text !== 'string') {
    return { error: 'No text provided' };
  }

  const result = {};
  const lines = text.split('\n').map(l => l.trim());

  // ── Invoice number ──────────────────────────────────────────────
  const invMatch = text.match(/(?:Invoice\s*(?:#|No|Number|ID)|INV-\d+)\s*[:#]?\s*([A-Za-z0-9][-A-Za-z0-9/]+)/i);
  if (invMatch) result.invoiceNumber = invMatch[1].trim();
  if (!result.invoiceNumber) {
    const invLine = text.match(/(?:INV-|INV#|Invoice\s*#)\s*([A-Za-z0-9][-A-Za-z0-9/]+)/i);
    if (invLine) result.invoiceNumber = invLine[1].trim();
  }

  // ── Date ────────────────────────────────────────────────────────
  const dateMatch = text.match(/(?:Date|Invoice Date|Dated|Issue Date)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
  if (dateMatch) result.date = dateMatch[1].trim();

  // ── Due Date ────────────────────────────────────────────────────
  const dueMatch = text.match(/Due\s+(?:Date|By|On|Payment)\s*:?\s*(\w+\s+\d{1,2},?\s+\d{4}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i);
  if (dueMatch) result.dueDate = dueMatch[1].trim();

  // ── Total Amount ────────────────────────────────────────────────
  const totalMatch = text.match(/(?:Total|Grand Total|TOTAL DUE|Balance Due|Amount Due)\s*(?:due)?\s*:?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (totalMatch) result.totalAmount = parseFloat(totalMatch[1].replace(/,/g, ''));

  // ── Subtotal ────────────────────────────────────────────────────
  const subMatch = text.match(/Sub\s*Total\s*:?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (subMatch) result.subtotal = parseFloat(subMatch[1].replace(/,/g, ''));

  // ── Tax ─────────────────────────────────────────────────────────
  const taxMatch = text.match(/(?:Tax|VAT|GST|CGST|SGST|IGST|HST|PST|Sales Tax)\s*(?:\(\d+%\))?\s*:?\s*(?:Rs\.?|INR|₹|\$|€|£)?\s*([\d,]+\.?\d*)/i);
  if (taxMatch) result.tax = parseFloat(taxMatch[1].replace(/,/g, ''));

  // ── Vendor ──────────────────────────────────────────────────────
  const fromIdx = lines.findIndex(l => /^from\s*:/i.test(l));
  if (fromIdx >= 0 && fromIdx + 1 < lines.length) {
    result.vendor = lines[fromIdx + 1];
  }
  if (!result.vendor) {
    const sellerIdx = lines.findIndex(l => /^(seller|vendor|supplier|bill\s*from)\s*:?/i.test(l));
    if (sellerIdx >= 0 && sellerIdx + 1 < lines.length) {
      result.vendor = lines[sellerIdx + 1];
    }
  }

  // ── Bill To / Client ────────────────────────────────────────────
  const toIdx = lines.findIndex(l => /^(bill\s*to|client|customer|buyer)\s*:?/i.test(l));
  if (toIdx >= 0 && toIdx + 1 < lines.length) {
    result.billTo = lines[toIdx + 1];
  }

  // ── Currency ────────────────────────────────────────────────────
  const currMatch = text.match(/Currency\s*:?\s*(USD|EUR|GBP|INR|JPY|CAD|AUD|A$|C\$)/i);
  if (currMatch) {
    result.currency = currMatch[1].toUpperCase().replace(/[^A-Z]/g, '');
  }
  if (!result.currency) {
    if (text.includes('₹') || text.includes('Rs.') || /\bINR\b/.test(text)) result.currency = 'INR';
    else if (text.includes('$')) result.currency = 'USD';
    else if (text.includes('€')) result.currency = 'EUR';
    else if (text.includes('£')) result.currency = 'GBP';
  }

  // ── GST Number (India) ──────────────────────────────────────────
  const gstMatch = text.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}\b/);
  if (gstMatch) result.gstNumber = gstMatch[0];

  // ── Line Items ──────────────────────────────────────────────────
  const items = [];
  // Pattern: description + quantity + rate + amount
  const itemRegex = /^(.{8,80}?)\s{2,}(\d[\d,]*\.?\d*)\s{2,}@?\s*\$?(?:Rs\.?|INR|₹)?([\d,]+\.?\d*)\s{2,}\$?(?:Rs\.?|INR|₹)?([\d,]+\.?\d*)$/gm;
  let match;
  while ((match = itemRegex.exec(text)) !== null) {
    const desc = match[1].trim();
    if (!desc.match(/total|subtotal|tax|due|date|invoice|payment|thank|sub\s*total/i)) {
      items.push({
        description: desc,
        quantity: parseFloat(match[2].replace(/,/g, '')),
        rate: parseFloat(match[3].replace(/,/g, '')),
        amount: parseFloat(match[4].replace(/,/g, ''))
      });
    }
  }

  // Simpler pattern fallback
  if (items.length === 0) {
    const simpleItemRegex = /^(.{10,60}?)\s{2,}(\d+)\s*(?:@\s*\$?[\d,]+\.?\d*\s*)?\$?([\d,]+\.?\d*)$/gm;
    while ((match = simpleItemRegex.exec(text)) !== null) {
      const desc = match[1].trim();
      if (!desc.match(/total|subtotal|tax|due|date|invoice|payment|thank/i)) {
        items.push({
          description: desc,
          lineTotal: parseFloat(match[2].replace(/,/g, ''))
        });
      }
    }
  }

  if (items.length > 0) result.lineItems = items;

  // ── Confidence Score ────────────────────────────────────────────
  let score = 0;
  if (result.invoiceNumber) score += 20;
  if (result.date) score += 15;
  if (result.totalAmount) score += 25;
  if (result.vendor) score += 15;
  if (result.lineItems && result.lineItems.length > 0) score += 15;
  if (result.dueDate) score += 10;
  result.confidence = Math.min(score, 100);

  result.parsedAt = new Date().toISOString();
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`┌──────────────────────────────────────────────┐`);
  console.log(`│  InvoiceAI Server v2.0                        │`);
  console.log(`│  Landing: http://localhost:${PORT}/                │`);
  console.log(`│  Demo:    http://localhost:${PORT}/demo.html       │`);
  console.log(`│  API:     http://localhost:${PORT}/parse          │`);
  console.log(`│  Docs:    http://localhost:${PORT}/docs.html       │`);
  console.log(`│  Health:  http://localhost:${PORT}/health         │`);
  console.log(`└──────────────────────────────────────────────┘`);
});
