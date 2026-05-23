<div align="center">
  <br/>
  <h1>⟡ InvoiceAI</h1>
  <p><strong>AI-Powered Invoice Processing for Small Businesses</strong></p>
  <p>Extract structured invoice data in seconds — no setup, no training, just paste and go.</p>
  <br/>
  <p>
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#google-authentication">Google Auth</a> •
    <a href="#payu-integration">PayU Payments</a> •
    <a href="#api">API</a>
  </p>
  <br/>
</div>

---

## Overview

**InvoiceAI** replaces manual invoice data entry with AI-driven extraction. Small businesses, freelancers, and accountants can paste invoice text — or send them via API — and receive clean, structured JSON with invoice numbers, dates, line items, totals, vendor details, and more. What used to take 5–10 hours per week now happens in under 10 seconds.

The platform includes a landing page, interactive live demo, full REST API with documentation, user authentication (email + Google), API key management, usage tracking, and tiered subscription billing via PayU.

---

## Features

| Feature | Description |
|---|---|
| **AI Invoice Parsing** | Extracts invoice number, date, due date, line items, subtotal, tax, total, vendor, and client info from raw text |
| **Multi-Format Support** | Parse from raw text, PDF URLs, or uploaded files |
| **Live Demo** | Try the parser instantly in your browser — no sign-up required |
| **User Authentication** | Email/password + Google Sign-In (one tap) |
| **API Key Management** | Generate, revoke, and rotate API keys from your dashboard |
| **Usage Dashboard** | Real-time parse history, rate limits, and API consumption |
| **Tiered Subscriptions** | Free, Starter (₹999/mo), Business (₹2,499/mo), Enterprise (₹7,999/mo) |
| **PayU Billing** | Secure hosted checkout with hash-verified transactions |
| **Rate Limiting** | 10 req/min (free), 500–15,000 req/mo (paid) |

---

## Tech Stack

<div align="center">

| Layer | Technology |
|---|---|
| **Backend** | Node.js — Express 4 |
| **Database** | SQLite (via `better-sqlite3`) |
| **Auth** | JWT (`jsonwebtoken`) + bcrypt + Google Identity Services |
| **Payments** | PayU Hosted Checkout (test mode) |
| **Frontend** | HTML / CSS / Vanilla JavaScript |
| **Typography** | Inter (Google Fonts) |
| **Deployment** | Railway (Nixpacks) |

</div>

---

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/invoiceai.git
cd invoiceai

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (see below)

# Start the server
npm start        # production
npm run dev      # development with --watch
```

The server starts on `http://localhost:3100` by default.

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3100` | Server listen port |
| `API_URL` | No | — | Optional backend API URL for demo page endpoint display |

Additional variables are configured directly in `server.js` for JWT secret and payment keys (see configuration sections below).

---

## Google Authentication

InvoiceAI uses **Google Identity Services** (GIS) for one-tap sign-in. The flow is client-side credential retrieval with server-side verification.

### How It Works

1. The frontend loads Google's GIS library and displays a **"Continue with Google"** button.
2. On click, Google shows the account chooser / one-tap prompt.
3. Google returns a credential JWT containing the user's email, name, and profile info.
4. The frontend sends the credential to `POST /api/auth/google`.
5. The backend decodes the JWT payload (server-side), extracts the email, and either:
   - **New user**: Creates an account, generates a default API key, assigns a free subscription, and returns a session JWT.
   - **Existing user**: Signs the user in and returns their existing data.
6. The client stores the JWT token, user info, and API key in `localStorage` and redirects to the dashboard.

### Configuration

1. Go to the [Google Cloud Console](https://console.cloud.google.com).
2. Create a project (or select existing).
3. Navigate to **APIs & Services → Credentials**.
4. Click **Create Credentials → OAuth 2.0 Client ID**.
5. Set **Application type** to **Web application**.
6. Add your domain to **Authorized JavaScript origins** (e.g., `http://localhost:3100`).
7. Add your callback URIs if needed (GIS uses redirect-less flow, but origins must be whitelisted).
8. Copy the **Client ID**.

### Frontend Setup

In your HTML (see `signup.html`), include the GIS library where `YOUR_CLIENT_ID` is the ID from step 8:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

Initialize the Google Sign-In button:

```html
<button id="googleCustomBtn" class="btn btn-secondary btn-full"
        style="display:flex;align-items:center;justify-content:center;gap:10px;">
  <svg width="20" height="20" viewBox="0 0 24 24">...Google icon...</svg>
  <span class="btn-text">Continue with Google</span>
</button>
```

JavaScript callback registration:

```javascript
window.handleCredentialResponse = function (response) {
  fetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: response.credential })
  })
    .then(res => res.json())
    .then(data => {
      localStorage.setItem('iai_token', data.token);
      window.location.href = 'dashboard.html';
    });
};
```

The client ID is passed via the `data-client_id` attribute or `google.accounts.id.initialize()` call (the project currently uses a custom button with `google.accounts.id.prompt()` fallback — see `public/js/signup.js` for the complete implementation).

### Backend Endpoint

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/google` | Accepts `{ credential }` (Google JWT) or `{ email, name }` (mock/dev fallback) |

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "email": "user@gmail.com",
    "name": "Jane Doe",
    "company": null,
    "plan": "free"
  },
  "apiKey": "iai_abc123..."
}
```

---

## PayU Integration

InvoiceAI uses **PayU Hosted Checkout** (test mode) for subscription payments. The integration follows PayU's hash-based verification flow.

### Configuration

PayU credentials are configured in `server.js`:

```javascript
const PAYU_KEY  = 'mRBVHL';                        // Test Merchant Key
const PAYU_SALT = 'gauLq9k3h4WG7jxryLGCH2TpXq7KlTe6';  // Test Salt
const PAYU_ACTION_URL = 'https://test.payu.in/_payment';
```

> ⚠️ **Test Mode:** The above key and salt are for PayU's test environment. Replace with live credentials before production deployment.

### Payment Flow

```
Client                         Server                         PayU
  │                              │                              │
  │  1. GET /api/payment/config  │                              │
  │─────────────────────────────►│                              │
  │◄── { key, plans, actionUrl } │                              │
  │                              │                              │
  │  2. POST /api/payment/payu-hash                             │
  │     { planId, firstname, email }                            │
  │─────────────────────────────►│                              │
  │                              │  3. Generate SHA-512 hash    │
  │                              │     key|txnid|amount|...|salt│
  │◄── { hash, txnid, surl,     │                              │
  │      furl, actionUrl }       │                              │
  │                              │                              │
  │  4. Auto-submit form to      │                              │
  │     https://test.payu.in/_payment                           │
  │──────────────────────────────────────────────────────────►  │
  │                              │                              │
  │  5. PayU processes payment   │                              │
  │                              │                              │
  │  6. PayU POSTs to /api/payu/success  OR  /api/payu/failure │
  │                              │◄─────────────────────────────│
  │                              │                              │
  │  7. Redirect to              │                              │
  │     dashboard.html?payment=success|failed                   │
  │◄─────────────────────────────│                              │
```

### Hash Generation

The hash is a SHA-512 of the concatenated string:

```
key|txnid|amount|productinfo|firstname|email|||||||||||salt
```

Implemented in `server.js`:

```javascript
const hashString = `${PAYU_KEY}|${txnid}|${amount}|${productinfo}|${userFirstname}|${userEmail}|||||||||||${PAYU_SALT}`;
const hash = crypto.createHash('sha512').update(hashString).digest('hex');
```

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/payment/config` | JWT | Returns merchant key, action URL, and available plans |
| `POST` | `/api/payment/payu-hash` | JWT | Generates transaction hash for a given plan |
| `POST` | `/api/payu/success` | — | PayU success callback — activates subscription |
| `POST` | `/api/payu/failure` | — | PayU failure callback — redirects with error |

### Plans

| Plan ID | Price (₹/mo) | API Limit (req/mo) |
|---|---|---|
| `starter` | 999 | 500 |
| `business` | 2,499 | 3,000 |
| `enterprise` | 7,999 | 15,000 |

### Client-Side Usage

```javascript
// Fetch payment config
const config = await fetch('/api/payment/config', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json());

// Get hash for selected plan
const { hash, txnid, actionUrl, surl, furl } = await fetch('/api/payment/payu-hash', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ planId: 'business' })
}).then(r => r.json());

// Build and submit PayU form
const form = document.createElement('form');
form.method = 'POST';
form.action = actionUrl;
form.innerHTML = `
  <input name="key" value="${config.key}">
  <input name="txnid" value="${txnid}">
  <input name="amount" value="${hash.amount}">
  <input name="productinfo" value="${hash.productinfo}">
  <input name="firstname" value="${hash.firstname}">
  <input name="email" value="${hash.email}">
  <input name="hash" value="${hash.hash}">
  <input name="surl" value="${surl}">
  <input name="furl" value="${furl}">
`;
form.submit();
```

---

## API

InvoiceAI exposes a REST API for invoice parsing. Full interactive documentation is available at `/docs.html`.

### Parse Endpoint

```http
POST /api/parse/text
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "text": "INVOICE #INV-2024-001\nDate: 2024-03-15\n\nItem A  x2   $50.00\nItem B  x1   $30.00\n\nSubtotal    $130.00\nTax (10%)   $13.00\nTotal       $143.00\n\nVendor: Acme Corp\nClient: Jane Doe"
}
```

**Response:**

```json
{
  "invoiceNumber": "INV-2024-001",
  "date": "2024-03-15",
  "dueDate": null,
  "vendor": { "name": "Acme Corp" },
  "client": { "name": "Jane Doe" },
  "lineItems": [
    { "description": "Item A", "quantity": 2, "unitPrice": 50, "total": 100 },
    { "description": "Item B", "quantity": 1, "unitPrice": 30, "total": 30 }
  ],
  "subtotal": 130,
  "tax": 13,
  "total": 143,
  "currency": "USD"
}
```

See the [API Documentation](docs.html) for all available endpoints: `POST /parse/text`, `POST /parse/url`, `POST /parse/file`, `GET /demo`, `GET /health`.

---

## Project Structure

```
├── public/                  # Frontend assets
│   ├── index.html           # Landing page
│   ├── demo.html            # Interactive live demo
│   ├── docs.html            # API documentation
│   ├── dashboard.html       # User dashboard (auth required)
│   ├── signup.html          # Sign-in / sign-up
│   ├── css/
│   │   └── style.css        # Global stylesheet
│   ├── js/
│   │   ├── main.js          # Landing page interactivity
│   │   ├── signup.js        # Auth (email + Google sign-in)
│   │   ├── dashboard.js     # Dashboard, API keys, PayU payments
│   │   └── demo.js          # Demo page parser
│   └── img/                 # Images and icons
├── db/
│   └── init.js              # SQLite schema and initialization
├── docs/                    # Duplicate of public/ for alternate static hosting
├── server.js                # Express backend — routes, auth, parsing, payments
├── package.json
├── railway.json             # Railway deployment config
└── .env.example             # Environment template
```

---

## Deployment

The project is configured for deployment on **Railway** via `railway.json` (Nixpacks builder). Deploy by connecting your GitHub repository to Railway — the `start` command is `node server.js`.

For other platforms, ensure:
- Node.js >= 18 runtime
- Environment variables set (see [Environment Variables](#environment-variables))
- PayU URLs updated from `test.payu.in` to `secure.payu.in` for production

---

## License

Proprietary — All rights reserved.

---

<div align="center">
  <br/>
  <p>
    <strong>⟡ InvoiceAI</strong> — Stop typing invoices. Let AI do it in seconds.
  </p>
  <br/>
</div>
