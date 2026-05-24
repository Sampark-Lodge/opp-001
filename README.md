<div align="center">
  <br/>
  <h1>⟡ InvoiceAI</h1>
  <p><strong>AI-Powered Invoice Processing for Small Businesses</strong></p>
  <p><em>Product ID: opp-001</em></p>
  <p>Extract structured invoice data in seconds — no setup, no training, just paste and go.</p>
  <br/>
  <p>
    <a href="#features">Features</a> •
    <a href="#demo">Live Demo</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#api">API</a> •
    <a href="#deployment">Deployment</a> •
    <a href="#contributing">Contributing</a>
  </p>
  <br/>
  <p>
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen" alt="Node version"/>
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="License"/>
    <img src="https://img.shields.io/badge/status-beta-yellow" alt="Status"/>
  </p>
  <br/>
</div>

---

## Overview

**InvoiceAI** replaces manual invoice data entry with AI-driven extraction. Small businesses, freelancers, and accountants can paste invoice text — or send them via API — and receive clean, structured JSON with invoice numbers, dates, line items, totals, vendor details, and more. What used to take 5–10 hours per week now happens in **under 10 seconds**.

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
| **Rate Limiting** | 10 req/min (free), 500–15,000 req/mo (paid plans) |

---

## Demo

Try the live parser instantly at [**`/demo`**](demo.html) — no account required. Paste any invoice text and see structured JSON output in real time.

```json
// Input: raw invoice text
{
  "invoice_number": "INV-2024-0042",
  "date": "2024-03-15",
  "due_date": "2024-04-14",
  "vendor": {
    "name": "Acme Corp",
    "address": "123 Business Ave, Suite 200"
  },
  "line_items": [
    { "description": "Web Development", "quantity": 40, "rate": 150, "amount": 6000 }
  ],
  "subtotal": 6000,
  "tax": 600,
  "total": 6600
}
```

---

## Tech Stack

<div align="center">

| Layer | Technology |
|---|---|
| **Backend** | Node.js — Express 4 |
| **Database** | SQLite (via `better-sqlite3`) |
| **Authentication** | JWT (`jsonwebtoken`) + bcrypt + Google Identity Services |
| **Payments** | PayU Hosted Checkout (test mode) |
| **Frontend** | HTML / CSS / Vanilla JavaScript |
| **Typography** | Inter (Google Fonts) |
| **Deployment** | Railway (Nixpacks) |

</div>

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- npm (ships with Node.js)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/invoiceai.git
cd invoiceai

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (see Configuration below)

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

Additional secrets (JWT secret, PayU credentials) are configured directly in `server.js` for self-hosted deployments.

---

## API

InvoiceAI exposes a REST API for programmatic invoice parsing.

### Authentication

Include your API key in the `x-api-key` header:

```bash
curl -X POST https://your-host.com/api/parse \
  -H "Content-Type: application/json" \
  -H "x-api-key: iai_your_api_key_here" \
  -d '{"text": "Invoice INV-001 dated 2024-01-15 from ABC Corp..."}'
```

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/parse` | Parse invoice from raw text |
| `POST` | `/api/parse/url` | Parse invoice from a PDF URL |
| `POST` | `/api/parse/file` | Parse invoice from an uploaded file |
| `GET` | `/api/demo` | Demo endpoint (no auth required) |
| `GET` | `/api/health` | Health check |

### Response Format

All endpoints return JSON:

```json
{
  "success": true,
  "data": {
    "invoice_number": "INV-001",
    "date": "2024-01-15",
    "due_date": "2024-02-14",
    "vendor": { "name": "ABC Corp" },
    "client": { "name": "Client Name" },
    "line_items": [],
    "subtotal": 1000,
    "tax": 100,
    "total": 1100,
    "currency": "USD",
    "confidence": 0.95
  }
}
```

> Full API documentation is available at [`/docs`](docs.html) when the server is running.

---

## Authentication

### Email / Password

Users can sign up with email and password. Passwords are hashed with bcrypt. Session JWTs expire after 7 days.

### Google Sign-In

InvoiceAI uses **Google Identity Services** (GIS) for one-tap sign-in. The flow:

1. Frontend loads Google's GIS library and renders the sign-in button.
2. Google returns a credential JWT with user profile info.
3. Backend verifies the credential and either creates a new user or signs in an existing one.
4. The client receives a session JWT and API key.

#### Configuration

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project → **APIs & Services → Credentials**.
3. Create an **OAuth 2.0 Client ID** (Web application).
4. Add your domain to **Authorized JavaScript origins**.
5. Set `GOOGLE_CLIENT_ID` in the frontend (see `signup.html`).

---

## Subscription Plans

InvoiceAI offers tiered subscription billing via PayU:

| Plan | Price | API Calls | Rate Limit |
|---|---|---|---|
| **Free** | ₹0 | 500 req/mo | 10 req/min |
| **Starter** | ₹999/mo | 5,000 req/mo | 60 req/min |
| **Business** | ₹2,499/mo | 15,000 req/mo | 120 req/min |
| **Enterprise** | ₹7,999/mo | Unlimited | Custom |

---

## Deployment

### Railway (Recommended)

The project includes a [`railway.json`](railway.json) configuration for easy deployment:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Deploy
railway login
railway up
```

### Self-Hosted

```bash
npm install
cp .env.example .env
# Configure environment variables
npm start
```

---

## Project Structure

```
invoiceai/
├── db/
│   ├── init.js              # Database initialization & schema
│   └── invoiceai.db         # SQLite database file
├── docs/                    # Frontend HTML pages
│   ├── index.html           # Landing page
│   ├── demo.html            # Interactive live demo
│   ├── signup.html          # Sign-in / sign-up page
│   ├── dashboard.html       # User dashboard
│   └── docs.html            # API documentation
├── public/
│   ├── css/
│   │   └── style.css        # Global stylesheet
│   ├── js/
│   │   ├── main.js          # Landing page interactivity
│   │   ├── demo.js          # Demo page logic
│   │   ├── signup.js        # Auth flow (email + Google)
│   │   └── dashboard.js     # Dashboard & API key management
│   └── img/                 # Image assets
├── server.js                # Express server — routes, middleware, logic
├── package.json
├── .env.example             # Environment variable template
└── railway.json             # Railway deployment config
```

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository.
2. **Create a feature branch:** `git checkout -b feat/your-feature`.
3. **Commit your changes:** `git commit -m "feat: add your feature"`.
4. **Push to the branch:** `git push origin feat/your-feature`.
5. **Open a Pull Request.**

Please ensure your code follows the existing style and that the server starts without errors.

### Development Tips

- Use `npm run dev` for auto-restart on file changes.
- SQLite database is created automatically on first run.
- For PayU testing, use test mode credentials from the PayU dashboard.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with ⟡ for small businesses, freelancers, and accountants who deserve better tools.</sub>
  <br/>
  <br/>
  <sub>Product ID: opp-001</sub>
</div>
