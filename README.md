# RestaurantOS — Multi-Agent Platform

A monorepo containing all 8 AI agents for multi-location restaurant groups.

## Structure

```
restaurantos/
├── apps/
│   ├── api/                    ← Express backend (all 8 agents)
│   │   └── src/
│   │       ├── index.js        ← Entry point, all routes mounted
│   │       ├── middleware/     ← JWT auth, RBAC, RLS injection
│   │       ├── lib/            ← Event bus (Redis Streams / in-memory)
│   │       ├── routes/         ← auth, tenants, locations
│   │       └── agents/
│   │           ├── agent1/     ← Marketing & Content
│   │           ├── agent2/     ← Financial KPI
│   │           ├── agent3/     ← Inventory
│   │           ├── agent4/     ← Reviews (FULLY IMPLEMENTED)
│   │           ├── agent5/     ← Cash P&L
│   │           ├── agent6/     ← Training & Compliance
│   │           ├── agent7/     ← Local SEO & GBP
│   │           └── agent8/     ← Loyalty & Referral
│   └── web/                    ← React + Vite dashboard
│       └── src/
│           ├── App.jsx         ← Router, auth guard, shell
│           ├── components/
│           │   └── Sidebar.jsx ← Navigation for all 8 agents
│           ├── pages/
│           │   ├── Dashboard.jsx
│           │   ├── Settings.jsx
│           │   └── agents/     ← One page per agent
│           └── lib/
│               └── api.js      ← All API calls (one function per endpoint)
├── packages/
│   ├── shared/                 ← TypeScript types shared by API + web
│   │   └── src/index.ts        ← All interfaces, enums, constants
│   └── db/
│       ├── src/index.js        ← pg Pool with queryForTenant() + RLS
│       └── src/migrations/
│           └── 001_initial_schema.js  ← All 16 tables + enums + RLS policies
├── .env.example
├── railway.toml
└── .github/workflows/ci.yml
```

## Local development

```bash
# 1. Clone and install
git clone https://github.com/YOUR_ORG/restaurantos
cd restaurantos
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — minimum required: DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY

# 3. Run database migrations
npm run db:migrate

# 4. Start both servers (two terminals)
npm run dev:api    # → http://localhost:3001
npm run dev:web    # → http://localhost:5173

# 5. Open http://localhost:5173 and register
```

## Deploy to Railway (~10 min)

```bash
# Push to GitHub
git init && git add . && git commit -m "initial commit"
git remote add origin https://github.com/YOUR_ORG/restaurantos.git
git push -u origin main

# Connect at railway.app → New Project → Deploy from GitHub
# Add these environment variables in Railway dashboard:
#   NODE_ENV=production
#   DATABASE_URL (auto-set by Railway Postgres plugin)
#   JWT_SECRET (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
#   ANTHROPIC_API_KEY
#   FRONTEND_URL=https://YOUR-APP.railway.app
```

## Adding a Postgres database on Railway

In Railway dashboard → your project → **+ New** → **Database** → **PostgreSQL**.
Railway sets `DATABASE_URL` automatically. Then run:
```bash
railway run npm run db:migrate
```

## Building out agents

Agent 4 (Reviews) is fully implemented — use it as the pattern for all others:

1. **Backend**: `apps/api/src/agents/agentN/service.js` — add real DB queries and external API calls
2. **Backend**: `apps/api/src/agents/agentN/routes.js` — add REST endpoints
3. **Frontend**: `apps/web/src/pages/agents/AgentN*.jsx` — replace stub with real UI
4. **API client**: `apps/web/src/lib/api.js` — functions already defined for all 8 agents
5. **Event bus**: Wire cross-agent events in `apps/api/src/lib/eventBus.js`

## Key architecture decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Monorepo tool | npm workspaces | Built-in since npm 7, no extra tooling needed |
| Backend | Express (Node.js) | Simple, fast, agents are just route modules |
| Frontend | React + Vite | Best DX for internal dashboard SPA; no SSR needed |
| Database | PostgreSQL + node-pg-migrate | Advisory locks prevent race conditions on startup |
| Multi-tenancy | PostgreSQL RLS | Tenant isolation enforced at DB level, not app level |
| Event bus | In-memory EventEmitter → Redis Streams | Starts simple, swap to Redis when scaling |
| Auth | JWT (7-day expiry) | Stateless, works across services |
| Hosting | Railway | Deploy in seconds, usage-based billing, built-in Postgres |

## Agent status

| Agent | Status | Notes |
|-------|--------|-------|
| Agent 1: Marketing & Content | 🔧 Stub | Port prototype from `restaurant-marketing-os.html` |
| Agent 2: Financial KPI | 🔧 Stub | Port prototype from standalone HTML |
| Agent 3: Inventory | 🔧 Stub | Build mobile counting UI |
| Agent 4: Reviews & Employee Performance | ✅ **Live** | Full implementation — use as pattern |
| Agent 5: Cash P&L | 🔧 Stub | Needs Plaid integration |
| Agent 6: Training & Compliance | 🔧 Stub | Port compliance dashboard |
| Agent 7: Local SEO & GBP | 🔧 Stub | Port from `restaurant-seo-agent.html` |
| Agent 8: Loyalty & Referral | 🔧 Stub | Port from `restaurant-loyalty-agent.html` |
