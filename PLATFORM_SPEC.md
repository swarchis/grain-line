# Pulse — Platform Specification
**Living document. Update before and after every feature build.**
Last updated: 2026-06-07

---

## 1. Product Requirements

### Vision
Pulse is a multi-tenant SaaS platform for multi-location restaurant groups. It replaces a manager's scattered stack of spreadsheets, POS reports, scheduling tools, and vendor emails with a single AI-powered operating system. Each "agent" owns a domain of the business; agents share data across tenant boundaries but are fully isolated from each other's tenants.

### Tenant model
- **Tenant** — a restaurant group (e.g. Table Intelligence LLC / Rooh SF + Fitoor)
- **Location** — one physical restaurant within a tenant
- **User** — authenticated human with role `owner | manager | staff`
- **Employee** — frontline worker (separate from users; not necessarily a system login)

### Plans
| Plan | Key limits |
|------|-----------|
| Appetizer | Entry tier |
| Entree | Mid tier |
| Full Buffet | All agents unlocked |

Plan enforcement: `tenants.active_agents TEXT[]`. The `AgentRoute` wrapper on the frontend checks `canViewAgent(agentId)`. Owners and managers always have edit access to any active agent; staff access is controlled per-agent via `agent_permissions`.

### Active agents (as of this version)
| ID | Name | Path | Backend prefix |
|----|------|------|----------------|
| agent_1_marketing | Marketing & Content | /marketing | /api/agent-1 |
| agent_2_financial | Financial KPI | /financial | /api/agent-2 |
| agent_3_inventory | Inventory | /inventory | /api/agent-3 |
| agent_4_reviews | Reviews & Performance | /reviews | /api/agent-4 |
| agent_5_cashpl | Cash P&L | /cashpl | /api/agent-5 |
| agent_6_training | Compliance & Governance | /training | /api/agent-6 |
| agent_7_seo | Local SEO & GBP | /seo | /api/agent-7 |
| agent_8_loyalty | Loyalty & Referral | /loyalty | /api/agent-8 |
| agent_9_labor | Labor & Scheduling | /labor | /api/agent-9 |
| agent_10_training | Training & Performance | /training-perf | /api/agent-6 (shared!) |
| agent_11_menu | Menu Management | /menu | /api/agent-11 |

⚠️ **Agent 10 shares `/api/agent-6` routes** — gamification and training endpoints live on agent-6's backend. There is no `/api/agent-10` mount.

---

## 2. Database Schema

### Conventions
- Every table has `tenant_id UUID NOT NULL` (multi-tenancy enforced at query level)
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` — always UUID, never serial
- Timestamps: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- Soft deletes: prefer `active=false` or `status='inactive'`/`archived=true` over hard deletes
- `location_id` is nullable on most tables — `NULL` means "applies to all locations in tenant"
- Money: `NUMERIC(10,2)` for prices, `NUMERIC(10,4)` for unit costs (4dp for accuracy)
- Percentages: `NUMERIC(5,2)` — e.g. `68.50` = 68.5%
- Arrays: `TEXT[]` with `DEFAULT '{}'`

### Core tables (from 001_initial_schema.js)

**tenants**
```
id, name, plan (plan_type enum), active_agents TEXT[], settings JSONB,
created_at, updated_at
```

**locations**
```
id, tenant_id, name, address, city, state, zip, phone, timezone,
google_place_id, google_account_id, google_location_id,
opentable_id, toast_location_id, yelp_business_id,
active BOOLEAN, created_at, updated_at
```

**users**
```
id, tenant_id, email, name, password_hash, role (owner|manager|staff),
location_ids UUID[], active, last_login_at, created_at, updated_at
```

**employees** (extended by agent9 via ALTER TABLE)
```
id, tenant_id, location_id (NOT NULL in original, made nullable by agent9),
name (legacy), first_name, last_name, email, phone,
role (staff|shift_lead|manager|gm), position VARCHAR(100),
department (foh|boh|management), wage_type (hourly|salary), wage_rate NUMERIC(10,2),
hire_date, status (active|inactive|on_leave), archived BOOLEAN,
performance_score INTEGER DEFAULT 100, emergency_contact,
toast_employee_id, seven_shifts_id, notes, active (legacy), start_date (legacy),
created_at, updated_at
```
⚠️ The `employees` table has dual name columns: legacy `name` and new `first_name`/`last_name`. Always write both on INSERT. On SELECT use `COALESCE(first_name, split_part(name, ' ', 1))`.

**training_modules** (extended by agent6/gamificationService)
```
id, tenant_id, location_id, title, description, required_roles TEXT[],
validity_days, pass_score, content_url (legacy), content TEXT, content_type,
video_url, thumbnail_url, estimated_minutes, points_reward,
mandatory, active, created_at, updated_at
```

**training_completions** (extended by agent6/gamificationService)
```
id, employee_id, module_id, tenant_id, employee_name,
score, passed, points_awarded, completed_at, expires_at
```

### Agent 1 — Marketing & Content
```
social_posts: id, tenant_id, location_id, platform, content, status, scheduled_at,
  published_at, external_id, media_urls TEXT[], created_by, created_at, updated_at

ad_boosts: id, tenant_id, location_id, platform, campaign_name, budget, status,
  start_date, end_date, created_at
```

### Agent 2 — Financial KPI
```
weekly_kpi: id, tenant_id, location_id, week_start DATE UNIQUE(tenant+loc+week),
  bar_net_sales, food_net_sales, total_sales, labor_cost, labor_hours,
  food_cost_pct, labor_cost_pct, covers, apc, bar_cogs, food_cogs,
  event_inquiries, event_converted, event_revenue, event_conv_rate,
  review_avg, review_count, notes, created_at, updated_at
```

### Agent 3 — Inventory
```
inventory_items: id, tenant_id, location_id, name, category (food|liquor|supplies),
  sub_category, unit, storage_area, vendor, vendor_sku, par_level, reorder_point,
  last_price, avg_price_3, avg_price_6, price_history JSONB, active, created_at, updated_at

invoices: id, tenant_id, location_id, vendor, invoice_number, invoice_date,
  delivery_date, total_amount, status (pending_review|approved|rejected),
  raw_text, scan_confidence, file_url, category, notes, approved_by, approved_at,
  created_by, created_at, updated_at

invoice_line_items: id, invoice_id, tenant_id, inventory_item_id (FK nullable),
  description, quantity, unit, unit_price, total_price,
  matched BOOLEAN, flagged, flag_reason, vendor, vendor_sku, created_at

inventory_counts: id, tenant_id, location_id, period (YYYY-MM), status,
  submitted_by, submitted_at, approved_by, approved_at, created_at, updated_at

inventory_count_lines: id, count_id, tenant_id, inventory_item_id (FK nullable),
  item_name, unit, storage_area, quantity, unit_price, total_value, notes, created_at

purchase_orders: id, tenant_id, location_id, title, vendor, status (draft|sent),
  notes, created_by, created_at, updated_at

purchase_order_lines: id, tenant_id, order_id (FK), inventory_item_id (FK nullable),
  item_name, unit, vendor, vendor_sku, par_level, current_stock,
  order_qty, unit_price, notes, sort_order

recipes: id, tenant_id, location_id, name, description, category, type (dish|prep|cocktail),
  yield_qty, yield_unit, menu_price, active, notes, created_by, created_at, updated_at

recipe_ingredients: id, tenant_id, recipe_id (FK), ingredient_type (item|sub_recipe),
  inventory_item_id (FK nullable), sub_recipe_id (FK nullable), name, qty, unit,
  unit_cost, notes, sort_order, created_at, updated_at
```

### Agent 5 — Cash P&L
```
plaid_items: id, tenant_id, location_id, item_id, access_token (encrypted),
  institution_name, status, last_synced_at, created_at

plaid_transactions: id, tenant_id, location_id, plaid_item_id, plaid_transaction_id,
  amount, date, description, category, vendor, account_id, pending, created_at

pl_manual_entries: id, tenant_id, location_id, category, amount, date,
  description, vendor, created_by, created_at

pl_targets: id, tenant_id, location_id, category, target_amount, period,
  created_at, updated_at
```

### Agent 6 — Compliance & Governance
```
compliance_certifications: id, tenant_id, location_id, employee_name, employee_role,
  cert_key, cert_label, issued_date, expiry_date, cert_number, issuer,
  status (valid|warning|critical|expired|no_expiry), notes, created_at, updated_at

compliance_checklists: id, tenant_id, location_id, template_key, submitted_by,
  score INTEGER, items JSONB, created_at

compliance_documents: id, tenant_id, location_id, title, description, category,
  file_url, version INTEGER, expiry_date, expiry_status, created_by, created_at, updated_at

compliance_document_versions: id, document_id (FK), tenant_id, version,
  file_url, notes, uploaded_by, created_at

compliance_alerts: id, tenant_id, location_id, alert_type, severity, title,
  description, due_date, resolved, resolved_at, resolved_by, created_at
```

### Agent 6 — Gamification (also used by Agent 10)
```
gamification_points: id, tenant_id, employee_id, employee_name, location_id,
  point_type, points, reference_id, reference_type, note, created_at

gamification_challenges: id, tenant_id, location_id, title, description,
  challenge_type (individual|team|location), metric, target NUMERIC, points_reward,
  bonus_reward, start_date, end_date, status (active|completed|cancelled),
  created_by, created_at

gamification_challenge_entries: id, tenant_id, challenge_id (FK), employee_id,
  employee_name, progress NUMERIC, completed BOOLEAN, completed_at, rank,
  created_at — UNIQUE(challenge_id, employee_id)

gamification_rewards: id, tenant_id, title, description,
  reward_type (cash|pto|gift_card|recognition|other), value NUMERIC,
  points_cost INTEGER, active, created_at

gamification_reward_claims: id, tenant_id, reward_id (FK), employee_id,
  employee_name, points_spent, status (pending|approved|declined),
  manager_notes, reviewed_by, reviewed_at, created_at

employee_gamification: id, tenant_id, employee_id, employee_name, location_id,
  total_points, available_points, level (rookie|pro|expert|elite|legend),
  streak_days, last_activity, badges TEXT[], updated_at — UNIQUE(tenant_id, employee_id)
```

### Agent 8 — Loyalty
```
loyalty_members: id, tenant_id, location_id, name, email, phone, tier,
  points_balance, points_lifetime, referral_code, referred_by_id,
  streak_weeks, last_visit_date, created_at, updated_at

loyalty_transactions: id, tenant_id, member_id (FK), location_id,
  type (earn|redeem|expire|adjust), points, description, pos_check_id, created_at

loyalty_challenges: id, tenant_id, title, description, goal_type, goal_target,
  reward_points, reward_desc, starts_at, ends_at, active, created_at

loyalty_campaigns: id, tenant_id, title, type, config JSONB, active,
  starts_at, ends_at, created_at

loyalty_redemptions: id, tenant_id, member_id (FK), reward_type, points_spent,
  status, created_at
```

### Agent 9 — Labor & Scheduling
```
schedules: id, tenant_id, location_id, week_start DATE,
  status (draft|published|locked), published_at, published_by,
  total_hours NUMERIC(8,2), total_cost NUMERIC(10,2),
  notes, created_by, created_at, updated_at — UNIQUE(tenant_id, location_id, week_start)

shifts: id, tenant_id, schedule_id (FK CASCADE), location_id,
  employee_id (FK SET NULL), position, shift_date, start_time, end_time,
  break_minutes DEFAULT 30, notes, status (scheduled|completed|no_show),
  created_at, updated_at

employee_availability: id, tenant_id, employee_id (FK CASCADE),
  avail_type (recurring|override), day_of_week INTEGER (0-6),
  date_start, date_end, start_time, end_time, available BOOLEAN, notes, created_at

shift_requests: id, tenant_id, location_id, request_type (swap|pickup),
  shift_id (FK CASCADE), from_employee_id (FK CASCADE), to_employee_id (FK SET NULL),
  status (pending|approved|declined), reason, manager_notes,
  reviewed_by, reviewed_at, created_at

time_off_requests: id, tenant_id, employee_id (FK CASCADE), location_id,
  request_type (time_off|sick|vacation|personal|unpaid),
  date_start, date_end, reason, status (pending|approved|declined),
  manager_notes, reviewed_by, reviewed_at, created_at

labor_forecasts: id, tenant_id, location_id, forecast_date DATE,
  day_of_week, projected_sales, recommended_hours, recommended_staff,
  labor_pct_target DEFAULT 30, actual_hours, notes, created_at
  — UNIQUE(tenant_id, location_id, forecast_date)

employee_badges: id, tenant_id, employee_id (FK CASCADE),
  badge_key, badge_label, awarded_at — UNIQUE(tenant_id, employee_id, badge_key)
```

### Agent 11 — Menu Management
```
menu_sections: id, tenant_id, location_id, name, description,
  menu_type (dinner|lunch|brunch|bar|dessert|tasting),
  sort_order, active, created_at, updated_at

menu_items: id, tenant_id, location_id, section_id (FK SET NULL), recipe_id (FK SET NULL),
  name, description, price NUMERIC(10,2), price_override NUMERIC(10,2),
  food_cost NUMERIC(10,2), food_cost_pct NUMERIC(5,2), category, tags TEXT[],
  is_signature, is_seasonal, available, placement_notes, image_url,
  sort_order, created_at, updated_at

menu_item_sales: id, tenant_id, item_id (FK CASCADE), location_id,
  week_start DATE, units_sold INTEGER, revenue NUMERIC(10,2), created_at
  — UNIQUE(item_id, location_id, week_start)

menu_price_suggestions: id, tenant_id, item_id (FK CASCADE),
  current_price, suggested_price, reason, impact_est,
  suggestion_type (ai|price_increase|price_decrease|seasonal|bundle),
  status (pending|applied|dismissed), applied_at, created_at
```

---

## 3. API Definitions

### Authentication
All `/api/*` routes (except `/api/auth/*`, `/api/billing/*`, `/api/loyalty/webhook`) require a JWT Bearer token. Token contains: `userId, tenantId, email, role, locationIds`.

**Pattern:** `Authorization: Bearer <jwt>`

Response envelope:
```json
{ "ok": true, "data": <payload> }
{ "ok": false, "error": "message", "code": 400 }
```

### Rate limiting
- Global: applied to all `/api/*`
- AI limiter: applied to `/api/*/ai` and `/api/ai`

### Agent 1 — Marketing & Content `/api/agent-1`
| Method | Path | Description |
|--------|------|-------------|
| GET | /summary | Dashboard stats |
| GET | /posts | Social posts list |
| POST | /posts | Create post |
| PATCH | /posts/:id | Update post |
| DELETE | /posts/:id | Delete post |
| POST | /posts/generate | AI generate post |
| POST | /posts/:id/approve | Approve draft |
| POST | /posts/:id/publish | Publish to platform |
| GET | /trends | AI trend insights |
| GET | /ads | Ad campaigns |
| POST | /ads | Create ad |
| GET | /ads/insights | Campaign analytics |
| GET | /calendar | Content calendar |
| GET | /insights | Performance insights |

### Agent 2 — Financial KPI `/api/agent-2`
| Method | Path | Description |
|--------|------|-------------|
| GET | /summary | KPI summary |
| GET | /weekly | Weekly KPI data |
| POST | /weekly | Submit weekly data |
| GET | /kpi | KPI detail |
| GET | /review-trends | Review trend data |
| POST | /internal/inventory-submitted | Internal webhook from agent3 |

### Agent 3 — Inventory `/api/agent-3`
| Method | Path | Description |
|--------|------|-------------|
| GET | /summary | Inventory summary |
| GET | /invoices | Invoice list |
| GET | /invoices/:id | Invoice detail |
| POST | /invoices/scan | AI scan invoice (base64 image/PDF) |
| POST | /invoices/scan-bulk | Bulk scan |
| POST | /invoices/:id/approve | Approve + propagate to catalog |
| PATCH | /invoices/lines/:lineId | Edit line item |
| DELETE | /invoices/:id | Delete invoice |
| GET | /items | Catalog items |
| POST | /items | Add item |
| PATCH | /items/:id | Update item |
| DELETE | /items/:id | Soft delete |
| GET | /counts | Count sessions |
| POST | /counts | Start count |
| GET | /counts/:id | Count detail |
| PATCH | /counts/lines/:lineId | Update count line |
| POST | /counts/:id/submit | Submit count |
| GET | /orders/generate | Generate order from par levels |
| GET | /orders | Purchase order list |
| GET | /orders/:id | Order detail |
| POST | /orders | Create order |
| PATCH | /orders/:id/status | Update status |
| DELETE | /orders/:id | Delete order |
| POST | /orders/:id/lines | Add line |
| PATCH | /orders/lines/:lineId | Update line |
| DELETE | /orders/lines/:lineId | Delete line |

### Agent 4 — Reviews `/api/agent-4`
| Method | Path | Description |
|--------|------|-------------|
| GET | /reviews | Review list |
| POST | /reviews/fetch | Fetch from platforms |
| GET | /reviews/:id | Review detail |
| POST | /reviews/:id/generate | AI generate response |
| POST | /reviews/generate-batch | Batch AI responses |
| PUT | /reviews/:id/response | Save response draft |
| POST | /reviews/:id/post | Post response to platform |
| DELETE | /reviews/:id/response | Delete response |
| GET | /analytics | Review analytics |
| GET | /employees | Employee mention stats |
| GET | /summary | Dashboard summary |

### Agent 5 — Cash P&L `/api/agent-5`
| Method | Path | Description |
|--------|------|-------------|
| GET | /summary | P&L summary |
| POST | /plaid/link-token | Plaid link token |
| POST | /plaid/exchange | Exchange public token |
| GET | /plaid/items | Connected bank accounts |
| DELETE | /plaid/items/:id | Disconnect account |
| POST | /plaid/sync/:id | Sync transactions |
| GET | /pl | P&L report |
| GET | /transactions | Transaction list |
| PATCH | /transactions/:id/category | Recategorize |
| POST | /manual | Manual entry |
| DELETE | /manual/:id | Delete entry |
| POST | /targets | Set P&L targets |

### Agent 6 — Compliance & Governance + Gamification `/api/agent-6`
| Method | Path | Description |
|--------|------|-------------|
| GET | /summary | Compliance summary |
| GET | /requirements | CA regulatory requirements |
| GET | /certifications | Cert list |
| POST | /certifications | Add cert |
| PATCH | /certifications/:id | Update cert |
| GET | /checklists | Checklist history |
| POST | /checklists | Submit checklist |
| GET | /documents | Document vault |
| POST | /documents | Upload document |
| PATCH | /documents/:id | Update document |
| GET | /documents/:id/versions | Version history |
| GET | /alerts | Active alerts |
| POST | /alerts/:id/resolve | Resolve alert |
| GET | /gamification/summary | Gamification overview |
| GET | /modules | Learning modules |
| POST | /modules | Create module |
| PATCH | /modules/:id | Update module |
| DELETE | /modules/:id | Soft delete module |
| POST | /modules/:id/complete | Mark employee completion |
| GET | /completions | Completion records |
| GET | /leaderboard | Points leaderboard |
| GET | /profile/:employeeId | Employee gamification profile |
| POST | /points | Award points manually |
| GET | /challenges | Gamification challenges |
| POST | /challenges | Create challenge |
| POST | /challenges/:id/progress | Update employee progress |
| GET | /rewards | Rewards catalog |
| POST | /rewards | Add reward |
| PATCH | /rewards/:id | Update reward |
| POST | /rewards/:id/claim | Employee claims reward |
| GET | /reward-claims | Claim list |
| POST | /reward-claims/:id/review | Approve/decline claim |
| POST | /coaching | AI coaching tips for employee |

### Agent 9 — Labor & Scheduling `/api/agent-9`
| Method | Path | Description |
|--------|------|-------------|
| GET | /summary | Labor summary |
| GET | /employees | Employee roster (supports ?archived=true) |
| POST | /employees | Add employee |
| PATCH | /employees/:id | Update employee |
| POST | /employees/:id/archive | Soft archive |
| POST | /employees/:id/unarchive | Restore |
| DELETE | /employees/:id | Soft delete (inactive) |
| GET | /employees/:id/availability | Get availability |
| POST | /employees/:id/availability | Set availability |
| GET | /time-off | Time off requests |
| POST | /time-off | Submit request |
| POST | /time-off/:id/review | Approve/decline |
| GET | /schedule | Week schedule with shifts |
| POST | /schedule/copy | Copy week forward |
| POST | /schedule/:id/publish | Publish schedule |
| POST | /shifts | Create shift |
| PATCH | /shifts/:id | Update shift |
| DELETE | /shifts/:id | Delete shift |
| GET | /requests | Swap/pickup requests |
| POST | /requests | Submit request |
| POST | /requests/:id/review | Approve/decline (executes swap) |
| GET | /forecast | Get stored forecast |
| POST | /forecast/generate | AI generate forecast |
| GET | /payroll | Payroll summary for week |
| POST | /employees/:id/badges | Award badge |

### Agent 11 — Menu Management `/api/agent-11`
| Method | Path | Description |
|--------|------|-------------|
| GET | /summary | Menu summary |
| GET | /sections | Menu sections |
| POST | /sections | Create section |
| PATCH | /sections/:id | Update section |
| DELETE | /sections/:id | Soft delete |
| GET | /items | Menu items (with live food cost, sales) |
| POST | /items | Add item |
| PATCH | /items/:id | Update item |
| DELETE | /items/:id | Soft delete (available=false) |
| POST | /items/:id/sales | Log weekly sales |
| GET | /matrix | Menu engineering matrix (2×2 quadrants) |
| GET | /pricing/suggestions | Pending price suggestions |
| POST | /pricing/generate | AI generate suggestions |
| POST | /pricing/suggestions/:id/apply | Apply price |
| POST | /pricing/suggestions/:id/dismiss | Dismiss |
| POST | /optimize | AI menu optimization recommendations |
| POST | /simulate | What-if price simulation |
| POST | /scan | AI scan menu PDF/image → import items |
| POST | /import-recipes | Import from agent3 recipes |

---

## 4. Coding Standards

### Backend (Node.js / Express)

**File structure per agent:**
```
apps/api/src/agents/agentN/
  service.js    — all DB queries and business logic
  routes.js     — Express router, thin wrappers calling service
  [name]Service.js  — additional service file if domain is large
```

**Route pattern — always:**
```js
router.get('/path', async(req,res,next) => {
  try { res.json({ ok:true, data: await service.fn(req.tenantId, req.query) }); }
  catch(e) { next(e); }
});
```

**Service pattern:**
- First call `await ensureTables()` in every public function
- `ensureTables()` uses `CREATE TABLE IF NOT EXISTS` — idempotent, safe on every boot
- Column migrations use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — never DROP
- All queries scoped with `tenant_id` — never query without it
- Use `adminQuery` (unscoped) for DDL; use `queryForTenant` for data reads where available

**Claude API calls:**
```js
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  }),
});
```
- Never hardcode model strings — always `process.env.CLAUDE_MODEL || 'claude-sonnet-4-5'`
- Never use `@anthropic-ai/sdk` package — use `fetch` directly
- For PDF: `{ type:'document', source:{ type:'base64', media_type:'application/pdf', data:b64 } }`
- For images: `{ type:'image', source:{ type:'base64', media_type:mimeType, data:b64 } }`
- Always strip markdown fences before JSON.parse: `.replace(/```json?|```/g,'').trim()`

**Error pattern:**
```js
throw Object.assign(new Error('Not found'), { status: 404 });
```

**Adding a new agent checklist:**
1. `mkdir apps/api/src/agents/agentN/`
2. Create `service.js` with `ensureTables()` and `module.exports`
3. Create `routes.js` with `require('./service')` and `module.exports = router`
4. Add `require` + `app.use('/api/agent-N', ...)` to `index.js` (after auth middleware)
5. Add `agent_N_name` to `AgentId` union type in `packages/shared/src/index.ts`
6. Add to `AGENT_META` in `packages/shared/src/index.ts`
7. Add to `allAgents` array in `apps/api/src/routes/auth.js`
8. Add startup migration in `index.js` to append to existing tenants' `active_agents`
9. Add `export const agentN = { ... }` block to `apps/web/src/lib/api.js`
10. Add to `AGENTS` array in `apps/web/src/components/Sidebar.jsx`
11. Add `import` + `<Route>` in `apps/web/src/App.jsx`
12. Create `apps/web/src/pages/agents/AgentNName.jsx`

### Frontend (React)

**api.js pattern — every method:**
```js
export const agentN = {
  list:   (params={}) => { const qs=new URLSearchParams(...).toString(); return request(`/api/agent-N/items${qs?'?'+qs:''}`); },
  add:    (data)      => request('/api/agent-N/items', { method:'POST', body:data }),
  update: (id,data)   => request(`/api/agent-N/items/${id}`, { method:'PATCH', body:data }),
  delete: (id)        => request(`/api/agent-N/items/${id}`, { method:'DELETE' }),
};
```
- **Never use double commas** when appending to an existing export block — the most common build error. Always check with: `python3 -c "code=open('api.js').read(); [print(f'Line {i+1}: {l}') for i,l in enumerate(code.split('\n')) if ',,' in l]"`
- Each agent has exactly one named export block — no merging into other agent blocks

**Component structure:**
- Default export = main page component (tabs, topbar, location selector)
- Named exports = sub-components appended at the bottom of the same file
- No separate component files per agent — everything in one JSX file
- State for all tabs lives in the main component; load per-tab data in a `useEffect` keyed on `tab`

**Styling rules:**
- Use CSS variables: `var(--gold)`, `var(--ink)`, `var(--ink-3)`, `var(--border)`, `var(--bg)`, `var(--bg-2)`, `var(--card)`, `var(--mono)`, `var(--serif)`, `var(--r-lg)`
- Use class names: `card`, `card-header`, `card-title`, `card-body`, `btn`, `btn-primary`, `btn-sm`, `form-group`, `form-label`, `form-input`, `form-select`, `form-textarea`, `topbar`, `topbar-left`, `topbar-right`, `content`, `empty-state`, `empty-state-title`, `empty-state-sub`, `spinner`, `toast`
- **Dark theme contrast rule:** Never put light-opacity overlays (`color15`, `color30`) on dark backgrounds — use solid light backgrounds with dark text for visibility
- Inline styles for layout; class names for component-level

**Toast pattern:**
```js
const [toast, setToast] = useState(null);
const showToast = (msg, err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };
// ...
{toast && <div className="toast" style={{ background:toast.err?'#E24B4A':'var(--ink)' }}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
```

**Modal pattern:**
```jsx
{showModal && (
  <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60 }}>
    <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:520,maxWidth:'95vw',border:'1px solid var(--border)' }}>
      {/* header, body, footer */}
    </div>
  </div>
)}
```

---

## 5. Design Decisions

### Multi-tenancy: query-level, not schema-level
All tables share one PostgreSQL schema. Isolation is enforced by including `tenant_id` in every query's WHERE clause. There is no row-level security (RLS) at the DB level — the application layer is the trust boundary. Rationale: simpler ops, easier cross-tenant analytics if needed later.

### ensureTables() called on every request
Each agent's `ensureTables()` is called at the top of every public service function. It uses `IF NOT EXISTS` so it's a no-op after first run. This means migrations happen automatically on first use of a new feature, not on deploy. Trade-off: slight overhead on first call per cold start; benefit: zero-downtime schema additions.

### ALTER TABLE for existing tables
When a new agent needs new columns on an existing table (`employees`, `training_modules`, etc.), it uses `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` instead of recreating the table. This is safe and idempotent. We never DROP columns.

### employees table: dual name columns
The original migration created `name VARCHAR(200)`. Agent 9 added `first_name` and `last_name`. Both must be kept in sync:
- On INSERT: write all three — `name = first_name + ' ' + last_name`
- On SELECT: `COALESCE(first_name, split_part(name, ' ', 1))` and `COALESCE(last_name, split_part(name, ' ', 2))`
- Future: if a clean migration is run, remove `name` and update all queries

### Agent 10 shares Agent 6's backend
Agent 10 (Training & Performance) was split from Agent 6 (Compliance) as a frontend-only split. The gamification/training API routes remain at `/api/agent-6/*`. The `agent_10_training` ID exists in `active_agents` and the sidebar, but there is no `/api/agent-10` mount. Any future backend split would require adding a new router and migrating route prefixes.

### Model selection
Always `process.env.CLAUDE_MODEL || 'claude-sonnet-4-5'`. Never hardcode model strings. The env var allows upgrading all agents at once from Railway without a deploy.

### PDF and image scanning
Use Claude's multimodal API directly via `fetch`. PDFs use `type:'document'`; images use `type:'image'`. Both flow through the same extraction pattern: call Claude → strip markdown fences → `JSON.parse` → validate → persist to DB.

### Purchase order vendor propagation
When an invoice is approved, vendor info from the invoice header is written back to the `inventory_items` catalog using `COALESCE(vendor, $invoiceVendor)` — fills blank vendor fields but doesn't overwrite existing ones. A startup backfill query runs once to retroactively fill items that have invoice history.

### Menu engineering matrix thresholds
The 2×2 quadrant (Stars/Plowhorses/Puzzles/Dogs) uses **dynamic thresholds** — averages calculated from the tenant's actual data, not hardcoded values. `avg_weekly_sales` and `avg_gross_profit` are computed fresh on each matrix load, so the quadrants adapt as the menu evolves.

### Labor: California overtime rules
Agent 9 flags overtime at >8h/day and >40h/week per California law. Alerts are computed in Node (not SQL) by grouping shifts by employee and day. `severity:'critical'` at >12h/day.

### Gamification point ledger
Points are append-only — never update or delete from `gamification_points`. The employee's `total_points` and `available_points` in `employee_gamification` are recalculated from the ledger on every point award via `recalcProfile()`. This keeps the ledger as the source of truth.

### Rewards: deducting points
Points are not deducted from the ledger when a reward is claimed — they're deducted from `available_points` in `employee_gamification` when a claim is **approved** (not when submitted). This allows managers to review before the deduction is final.

### Frontend API block isolation
Each agent's API calls live in exactly one named export block in `api.js`. The most common build failure is a double comma (`,,`) at the join point between two blocks when methods are appended. Always scan for `,,` before deploying.

---

## Deployment

**Platform:** Railway (monorepo)
**DB:** PostgreSQL via `DATABASE_URL`
**Frontend:** Vite build, served by Express static middleware
**Cache bust:** bump `CACHE_BUST` env var in Railway to force rebuild

**Required env vars:**
```
DATABASE_URL
JWT_SECRET
ANTHROPIC_API_KEY
CLAUDE_MODEL=claude-sonnet-4-5   # optional, defaults to claude-sonnet-4-5
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_APPETIZER / _ENTREE / _BUFFET
PLAN_NAME_APPETIZER / _ENTREE / _BUFFET
FRONTEND_URL
LOYALTY_WEBHOOK_SECRET
SUPER_ADMIN_SECRET
NODE_ENV=production
CACHE_BUST                        # bump to redeploy
```

---

*Update this document whenever: a new table is added, a new agent is created, an API route is added, a design decision is made, or a coding pattern changes. The document should always reflect the running system — not intent.*
