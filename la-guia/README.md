### `README.md`

```markdown
# Grainline — Production OS

Grainline is an all-in-one operating system for independent and first-time fashion brand founders. It replaces the fragmented stack of design files, tech pack spreadsheets, manual vendor outreach, and separate sales tools with a single, AI-powered platform. 

It takes a founder from a rough sketch to a manufactured, selling product.

## 🏗 Architecture & Tech Stack

Grainline uses a hybrid architecture, combining the rapid development of BaaS with the power of a custom AI orchestration backend.

*   **Frontend (`la-guia/`)**: React + Vite. Styled with a bespoke, CSS-variable-driven design system (no heavy UI frameworks).
*   **Database & Auth**: Supabase (PostgreSQL, GoTrue). Uses strict Row Level Security (RLS) for multi-tenant brand isolation.
*   **AI Engine (`api/`)**: Node.js + Express. Directly integrates with Anthropic Claude 3.5 Sonnet (Vision) to analyze visual designs and generate technical feedback.
*   **Design Canvas**: Embedded Photopea integration via `postMessage` API.

## 📂 Repository Structure

```text
grainline/
├── la-guia/                 # The React/Vite Frontend
│   ├── src/
│   │   ├── components/      # Reusable UI (Sidebar, Canvas, Empty States)
│   │   ├── context/         # AuthContext & ProductsContext (Supabase sync)
│   │   ├── lib/             # Formatters and Supabase client
│   │   └── pages/           # Route views (Design, Tech Packs, Home, etc.)
│   └── .env.local           # Frontend environment variables
└── api/                     # The Node.js Backend (AI Brain)
    ├── index.js             # Express server and Claude Vision endpoints
    └── .env                 # Backend environment variables
```

## ✨ Core Features (Shipped)

*   **Secure Multi-Tenancy**: Full Supabase Auth. RLS policies ensure that users can only read, update, and delete products belonging to their specific `brand_id`.
*   **Design Studio & AI Analysis**: An embedded Photopea canvas allows users to sketch or upload mockups. The "Capture & Analyze" engine takes a flattened Base64 snapshot of the canvas, sends it to Claude 3.5 Sonnet, and returns a structured Factory Readiness Score and construction feedback.
*   **Interactive Tech Packs**: Dynamic Bill of Materials (BOM) and Measurements grids that auto-calculate costs and save directly to JSONB columns in PostgreSQL.

## 🚀 Local Development Setup

You need two terminal windows to run Grainline locally—one for the frontend and one for the backend.

### 1. Database Setup (Supabase)
1. Create a new project on [Supabase](https://supabase.com/).
2. Run the provided schema initialization script in the Supabase SQL Editor (creates `brands`, `products`, `designs`, `tech_packs` tables and enforces RLS).
3. Disable "Confirm email" in Supabase Auth settings for seamless local testing.

### 2. Backend Setup (AI Brain)
```bash
cd api
npm install
```
Create an `api/.env` file:
```text
PORT=3001
ANTHROPIC_API_KEY=dont_use_anthropic_yet
GEMINI_API_KEY=use_gemini_for_now
```
Start the backend:
```bash
node index.js
```

### 3. Frontend Setup (UI)
```bash
cd "la-guia"
npm install
```
Create a `la-guia/.env.local` file:
```text
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```
Start the frontend:
```bash
npm run dev
```

## 🎨 Design Philosophy

Grainline is designed like a founder's cutting table, not a generic SaaS dashboard.
*   **Typography over decoration**: Uses `Newsreader` (serif) for editorial hierarchy, `Karla` for UI, `Space Mono` for data, and `Caveat` for annotations.
*   **Tactile elements**: "Washi tape" tags, stitched flow connectors, and cut-sticker buttons.
*   **High contrast**: Deep ink tones against warm parchment backgrounds (`#F1EAD9`). 

## 🗺 Roadmap (Next Steps)
*   **Tech Pack Generation**: Use Claude to auto-generate the initial JSON BOM and Measurement grids directly from the Design snapshot.
*   **Vendor Sourcing**: Connect the RFQ (Request for Quote) flow to generate PDFs from the Tech Pack data and email them to suppliers.
*   **Shopify Sync**: Integrate Shopify webhooks to pull live sales data into the Sales Dashboard.
```