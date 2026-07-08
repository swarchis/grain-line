// ─── RestaurantOS API client ──────────────────────────────────────────────────
// Single source of truth for all HTTP calls from the frontend.
// Automatically attaches JWT, handles errors, and refreshes on 401.

const BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('ros_token');
}

function setToken(token) {
  localStorage.setItem('ros_token', token);
}

function clearToken() {
  localStorage.removeItem('ros_token');
  localStorage.removeItem('ros_user');
}

async function request(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const opts = { method, headers, signal };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  // Auto-logout on 401
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  const data = await res.json();

  if (!res.ok || data.ok === false) {
    throw new ApiError(data.error || `HTTP ${res.status}`, res.status, data.details);
  }

  return data.data !== undefined ? data.data : data;
}

class ApiError extends Error {
  constructor(message, code, details) {
    super(message);
    this.code    = code;
    this.details = details;
    this.name    = 'ApiError';
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  register: (tenantName, email, password, name) =>
    request('/auth/register', { method: 'POST', body: { tenantName, email, password, name }, auth: false }),

  googleLogin: (credential, tenantName) =>
    request('/auth/google', { method:'POST', body:{ credential, tenantName }, auth:false }),

  getUser: () => {
    const stored = localStorage.getItem('ros_user');
    return stored ? JSON.parse(stored) : null;
  },

  setUser: (user) => localStorage.setItem('ros_user', JSON.stringify(user)),
};

// ── Core ──────────────────────────────────────────────────────────────────────

export const tenants = {
  me:           ()               => request('/api/tenants/me'),
  updateAgents: (activeAgents)   => request('/api/tenants/me/agents', { method: 'PATCH', body: { activeAgents } }),
  updateName:   (name)           => request('/api/tenants/name', { method:'PATCH', body:{ name } }),
};

export const locations = {
  list:   ()             => request('/api/locations'),
  get:    (id)           => request(`/api/locations/${id}`),
  create: (data)         => request('/api/locations', { method: 'POST', body: data }),
  update: (id, data)     => request(`/api/locations/${id}`, { method: 'PATCH', body: data }),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const admin = {
  users:        ()               => request('/api/admin/users'),
  createUser:   (data)           => request('/api/admin/users', { method:'POST', body:data }),
  updateUser:   (id, data)       => request(`/api/admin/users/${id}`, { method:'PATCH', body:data }),
  deleteUser:   (id)             => request(`/api/admin/users/${id}`, { method:'DELETE' }),
  activity:     ()               => request('/api/admin/activity'),
};


// ── Agent 1: Marketing ────────────────────────────────────────────────────────

export const agent1 = {
  summary:      (locationId) => request(`/api/agent-1/summary${locationId ? `?locationId=${locationId}` : ''}`),
  posts:        (params = {}) => { const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString(); return request(`/api/agent-1/posts${qs ? `?${qs}` : ''}`); },
  createPost:   (data)        => request('/api/agent-1/posts', { method: 'POST', body: data }),
  updatePost:   (id, data)    => request(`/api/agent-1/posts/${id}`, { method: 'PATCH', body: data }),
  deletePost:   (id)          => request(`/api/agent-1/posts/${id}`, { method: 'DELETE' }),
  generatePost: (data)        => request('/api/agent-1/posts/generate', { method: 'POST', body: data }),
  approvePost:  (id, scheduledAt) => request(`/api/agent-1/posts/${id}/approve`, { method: 'POST', body: { scheduledAt } }),
  publishPost:  (id)          => request(`/api/agent-1/posts/${id}/publish`, { method: 'POST' }),
  getTrends:    (params = {}) => { const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString(); return request(`/api/agent-1/trends${qs ? `?${qs}` : ''}`); },
  getAdBoosts:  (params = {}) => { const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString(); return request(`/api/agent-1/ads${qs ? `?${qs}` : ''}`); },
  createAdBoost:(data)        => request('/api/agent-1/ads', { method: 'POST', body: data }),
  getAdInsights:(params = {}) => { const qs = new URLSearchParams(Object.entries(params).filter(([,v]) => v != null)).toString(); return request(`/api/agent-1/ads/insights${qs ? `?${qs}` : ''}`); },
  calendar:     (locationId, month) => request(`/api/agent-1/calendar?locationId=${locationId||''}&month=${month||''}`),
  insights:     (locationId, days)  => request(`/api/agent-1/insights?locationId=${locationId||''}&days=${days||30}`),
  generateBulk:  (data)        => request('/api/agent-1/bulk/generate',     { method:'POST', body:data }),
  approveAllPosts:(postIds)    => request('/api/agent-1/bulk/approve-all',  { method:'POST', body:{ postIds } }),
  // Newsletter
  nlContacts:     (p={})  => { const qs=new URLSearchParams(Object.entries(p).filter(([,v])=>v!=null)).toString(); return request('/api/agent-1/newsletter/contacts'+(qs?'?'+qs:'')); },
  nlAddContact:   (data)  => request('/api/agent-1/newsletter/contacts',  {method:'POST',  body:data}),
  nlDeleteContact:(id)    => request('/api/agent-1/newsletter/contacts/'+id, {method:'DELETE'}),
  nlImport:       (data)  => request('/api/agent-1/newsletter/import',    {method:'POST',  body:data}),
  nlList:         (p={})  => { const qs=new URLSearchParams(Object.entries(p).filter(([,v])=>v!=null)).toString(); return request('/api/agent-1/newsletter/list'+(qs?'?'+qs:'')); },
  nlSave:         (data)  => request('/api/agent-1/newsletter/save',      {method:'POST',  body:data}),
  nlDelete:       (id)    => request('/api/agent-1/newsletter/'+id,       {method:'DELETE'}),
  nlGenerate:     (data)  => request('/api/agent-1/newsletter/generate',  {method:'POST',  body:data}),
  nlSend:         (data)  => request('/api/agent-1/newsletter/send',      {method:'POST',  body:data}),
  // Text / WhatsApp
  txtCampaigns:   (p={})  => { const qs=new URLSearchParams(Object.entries(p).filter(([,v])=>v!=null)).toString(); return request('/api/agent-1/text/campaigns'+(qs?'?'+qs:'')); },
  txtSave:        (data)  => request('/api/agent-1/text/campaigns',           {method:'POST',  body:data}),
  txtDelete:      (id)    => request('/api/agent-1/text/campaigns/'+id,       {method:'DELETE'}),
  txtGenerate:    (data)  => request('/api/agent-1/text/generate',            {method:'POST',  body:data}),
  txtSend:        (data)  => request('/api/agent-1/text/send',                {method:'POST',  body:data}),
  txtStats:       (locationId) => request('/api/agent-1/text/stats'+(locationId?'?locationId='+locationId:'')),
};

// ── Agent 1: Media Library (Dropbox) ────────────────────────────────────────
export const media = {
  browse:     (path = '')   => request(`/api/agent-1/media?${new URLSearchParams({path}).toString()}`),
  search:     (q, path='') => request(`/api/agent-1/media/search?${new URLSearchParams({q,path}).toString()}`),
  getLink:    (path)        => request('/api/agent-1/media/link',        { method:'POST', body:{ path } }),
  sharedLink: (path)        => request('/api/agent-1/media/shared-link', { method:'POST', body:{ path } }),
};


// ── Agent 2: Financial KPI ────────────────────────────────────────────────────

export const agent2 = {
  summary:         (locationId) => request(`/api/agent-2/summary${locationId ? `?locationId=${locationId}` : ''}`),
  weeklyData:      (locationId, limit) => {
    const qs = new URLSearchParams(Object.entries({ locationId, limit }).filter(([,v]) => v != null)).toString();
    return request(`/api/agent-2/weekly${qs ? `?${qs}` : ''}`);
  },
  enterWeeklyData: (data)       => request('/api/agent-2/weekly', { method: 'POST', body: data }),
  kpi:             (locationId, weeks) => request(`/api/agent-2/kpi?locationId=${locationId || ''}&weeks=${weeks || 12}`),
  reviewTrends:    (locationId, weeks) => request(`/api/agent-2/review-trends?locationId=${locationId || ''}&weeks=${weeks || 12}`),
  weeklySales:     (locationId) => request(`/api/agent-2/weekly?locationId=${locationId || ''}`),
  enterCOGs:       (data)       => request('/api/agent-2/weekly', { method: 'POST', body: data }),
  syncToast:       (locationId) => request('/api/agent-2/sync/toast', { method: 'POST', body: { locationId } }),
  eventInquiries:  (locationId) => request(`/api/agent-2/events?locationId=${locationId || ''}`),
  createInquiry:   (data)       => request('/api/agent-2/events', { method: 'POST', body: data }),
  updateInquiry:   (id, data)   => request(`/api/agent-2/events/${id}`, { method: 'PATCH', body: data }),
};

// ── Agent 3: Inventory ────────────────────────────────────────────────────────
export const agent3 = {
  summary:        (locationId)       => request(`/api/agent-3/summary${locationId?'?locationId='+locationId:''}`),
  priceWatch:     (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/price-watch${qs?'?'+qs:''}`); },
  foodCostTrend:  (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/food-cost-trend${qs?'?'+qs:''}`); },
  vendors:        (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/vendors${qs?'?'+qs:''}`); },
  vendorAdd:      (data)             => request('/api/agent-3/vendors', {method:'POST', body:data}),
  vendorUpdate:   (id, data)         => request(`/api/agent-3/vendors/${id}`, {method:'PATCH', body:data}),
  vendorDelete:   (id)               => request(`/api/agent-3/vendors/${id}`, {method:'DELETE'}),
  // Invoices
  invoices:       (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/invoices${qs?'?'+qs:''}`); },
  getInvoice:     (id)               => request(`/api/agent-3/invoices/${id}`),
  scanInvoice:    (data)             => request('/api/agent-3/invoices/scan', { method:'POST', body:data }),
  scanBulk:       (data)             => request('/api/agent-3/invoices/scan-bulk', { method:'POST', body:data }),
  approveInvoice: (id)               => request(`/api/agent-3/invoices/${id}/approve`, { method:'POST' }),
  updateLine:     (lineId,data)      => request(`/api/agent-3/invoices/lines/${lineId}`, { method:'PATCH', body:data }),
  // Catalog
  items:          (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/items${qs?'?'+qs:''}`); },
  createItem:     (data)             => request('/api/agent-3/items', { method:'POST', body:data }),
  updateItem:     (id,data)          => request(`/api/agent-3/items/${id}`, { method:'PATCH', body:data }),
  // Counts
  counts:         (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/counts${qs?'?'+qs:''}`); },
  createCount:    (data)             => request('/api/agent-3/counts', { method:'POST', body:data }),
  getCount:       (id)               => request(`/api/agent-3/counts/${id}`),
  updateCountLine:(lineId,data)      => request(`/api/agent-3/counts/lines/${lineId}`, { method:'PATCH', body:data }),
  submitCount:    (id)               => request(`/api/agent-3/counts/${id}/submit`, { method:'POST' }),
  deleteInvoice:  (id)               => request(`/api/agent-3/invoices/${id}`, { method:'DELETE' }),
  deleteItem:     (id)               => request(`/api/agent-3/items/${id}`, { method:'DELETE' }),
  // Email queue
  emailQueue:     (status)           => request(`/api/agent-3/email-queue${status?'?status='+status:''}`),
  processQueue:   ()                 => request('/api/agent-3/email-queue/process', { method:'POST' }),
  // COGS
  cogs:           (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/cogs${qs?'?'+qs:''}`); },
  // Recipes
  recipes:          (params={})     => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/recipes${qs?'?'+qs:''}`); },
  recipe:           (id)            => request(`/api/agent-3/recipes/${id}`),
  costingReport:    (params={})     => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/recipes/costing${qs?'?'+qs:''}`); },
  createRecipe:     (data)          => request('/api/agent-3/recipes', { method:'POST', body:data }),
  updateRecipe:     (id,data)       => request(`/api/agent-3/recipes/${id}`, { method:'PATCH', body:data }),
  deleteRecipe:     (id)            => request(`/api/agent-3/recipes/${id}`, { method:'DELETE' }),
  addIngredient:    (recipeId,data) => request(`/api/agent-3/recipes/${recipeId}/ingredients`, { method:'POST', body:data }),
  updateIngredient: (lineId,data)   => request(`/api/agent-3/recipes/ingredients/${lineId}`, { method:'PATCH', body:data }),
  deleteIngredient: (lineId)        => request(`/api/agent-3/recipes/ingredients/${lineId}`, { method:'DELETE' }),
  // Purchase orders
  generateOrderList: (params={})       => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/orders/generate${qs?'?'+qs:''}`); },
  orders:            (params={})       => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-3/orders${qs?'?'+qs:''}`); },
  order:             (id)             => request(`/api/agent-3/orders/${id}`),
  createOrder:       (data)           => request('/api/agent-3/orders', { method:'POST', body:data }),
  updateOrderStatus: (id,status)      => request(`/api/agent-3/orders/${id}/status`, { method:'PATCH', body:{status} }),
  deleteOrder:       (id)             => request(`/api/agent-3/orders/${id}`, { method:'DELETE' }),
  addOrderLine:      (id,line)        => request(`/api/agent-3/orders/${id}/lines`, { method:'POST', body:line }),
  updateOrderLine:   (lineId,data)    => request(`/api/agent-3/orders/lines/${lineId}`, { method:'PATCH', body:data }),
  deleteOrderLine:   (lineId)         => request(`/api/agent-3/orders/lines/${lineId}`, { method:'DELETE' }),
};


// ── Agent 4: Reviews ──────────────────────────────────────────────────────────

export const agent4 = {
  importStatement: (locationId, file) => {
    const token = localStorage.getItem('ros_token');
    const form = new FormData(); form.append('file', file);
    if (locationId) form.append('locationId', locationId);
    return fetch('/api/agent-5/import', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:form })
      .then(r=>r.json()).then(d=>{ if(!d.ok) throw new Error(d.error); return d.data; });
  },
  monthly:      (locationId, months=6) => request(`/api/agent-5/monthly?locationId=${locationId}&months=${months}`),
  summary:      (locationId) => request(`/api/agent-4/summary${locationId ? `?locationId=${locationId}` : ''}`),
  reviews:      (params)     => {
    const qs = new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString();
    return request(`/api/agent-4/reviews${qs ? `?${qs}` : ''}`);
  },
  fetchNew:     (locationId) => request('/api/agent-4/reviews/fetch', { method: 'POST', body: { locationId } }),
  generate:     (id)         => request(`/api/agent-4/reviews/${id}/generate`, { method: 'POST' }),
  generateBatch:(locationId) => request('/api/agent-4/reviews/generate-batch', { method: 'POST', body: { locationId } }),
  saveDraft:    (id, draft)  => request(`/api/agent-4/reviews/${id}/response`, { method: 'PUT', body: { draft } }),
  post:         (id)         => request(`/api/agent-4/reviews/${id}/post`, { method: 'POST' }),
  dismiss:      (id)         => request(`/api/agent-4/reviews/${id}/response`, { method: 'DELETE' }),
  analytics:    (locationId, days) => request(`/api/agent-4/analytics?locationId=${locationId || ''}&days=${days || 30}`),
  employees:    (locationId) => request(`/api/agent-4/employees${locationId ? `?locationId=${locationId}` : ''}`),
};

// ── Agent 5: Cash P&L ─────────────────────────────────────────────────────────

export const agent5 = {
  summary:        (locationId)       => request(`/api/agent-5/summary${locationId?'?locationId='+locationId:''}`),
  linkToken:      ()                 => request('/api/agent-5/plaid/link-token', { method:'POST' }),
  updateToken:    (id)               => request(`/api/agent-5/plaid/update-token/${id}`, { method:'POST' }),
  exchangeToken:  (data)             => request('/api/agent-5/plaid/exchange', { method:'POST', body:data }),
  items:          (locationId)       => request(`/api/agent-5/plaid/items${locationId?'?locationId='+locationId:''}`),
  removeItem:     (id)               => request(`/api/agent-5/plaid/items/${id}`, { method:'DELETE' }),
  sync:           (id)               => request(`/api/agent-5/plaid/sync/${id}`, { method:'POST' }),
  syncLegacy:     (id)               => request(`/api/agent-5/plaid/sync-legacy/${id}`, { method:'POST' }),
  syncReset:      (id)               => request(`/api/agent-5/plaid/sync-reset/${id}`, { method:'POST' }),
  sandboxFire:    (id)               => request(`/api/agent-5/plaid/sandbox-fire/${id}`, { method:'POST' }),
  pl:             (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-5/pl${qs?'?'+qs:''}`); },
  transactions:   (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-5/transactions${qs?'?'+qs:''}`); },
  recategorize:   (id, plCategory)   => request(`/api/agent-5/transactions/${id}/category`, { method:'PATCH', body:{ plCategory } }),
  addManual:      (data)             => request('/api/agent-5/manual', { method:'POST', body:data }),
  deleteManual:   (id)               => request(`/api/agent-5/manual/${id}`, { method:'DELETE' }),
  saveTargets:    (data)             => request('/api/agent-5/targets', { method:'POST', body:data }),
  monthly:        (locationId, months=6) => request(`/api/agent-5/monthly?locationId=${locationId||''}&months=${months}`),
  categories:     ()                 => request('/api/agent-5/categories'),
  addCategory:    (data)             => request('/api/agent-5/categories', { method:'POST', body:data }),
  deleteCategory: (key)              => request(`/api/agent-5/categories/${key}`, { method:'DELETE' }),
  rules:          ()                 => request('/api/agent-5/rules'),
  importStatement:(locationId, file) => {
    const token = localStorage.getItem('ros_token');
    const form = new FormData();
    form.append('file', file);
    if (locationId) form.append('locationId', locationId);
    return fetch('/api/agent-5/import', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:form })
      .then(r=>r.json()).then(d=>{ if(!d.ok) throw new Error(d.error); return d.data; });
  },
};

// ── Agent 6: Training ─────────────────────────────────────────────────────────

export const agent6 = {
  summary:         (locationId)     => request(`/api/agent-6/summary${locationId?'?locationId='+locationId:''}`),
  requirements:    ()               => request('/api/agent-6/requirements'),
  certifications:  (params={})      => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/certifications${qs?'?'+qs:''}`); },
  addCert:         (data)           => request('/api/agent-6/certifications', { method:'POST', body:data }),
  updateCert:      (id,data)        => request(`/api/agent-6/certifications/${id}`, { method:'PATCH', body:data }),
  checklists:      (params={})      => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/checklists${qs?'?'+qs:''}`); },
  submitChecklist: (data)           => request('/api/agent-6/checklists', { method:'POST', body:data }),
  documents:       (params={})      => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/documents${qs?'?'+qs:''}`); },
  addDocument:     (data)           => request('/api/agent-6/documents', { method:'POST', body:data }),
  uploadFile:      (data)           => request('/api/agent-6/files/upload', { method:'POST', body:data }),
  updateDocument:  (id,data)        => request(`/api/agent-6/documents/${id}`, { method:'PATCH', body:data }),
  docVersions:     (id)             => request(`/api/agent-6/documents/${id}/versions`),
  alerts:          (params={})      => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/alerts${qs?'?'+qs:''}`); },
  resolveAlert:    (id)             => request(`/api/agent-6/alerts/${id}/resolve`, { method:'POST' }),
  // Gamification & Learning (used by Agent10)
  gamSummary:     (locationId)           => request(`/api/agent-6/gamification/summary${locationId?'?locationId='+locationId:''}`),
  modules:        (params={})            => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/modules${qs?'?'+qs:''}`); },
  addModule:      (data)                 => request('/api/agent-6/modules', { method:'POST', body:data }),
  updateModule:   (id,data)             => request(`/api/agent-6/modules/${id}`, { method:'PATCH', body:data }),
  deleteModule:   (id)                  => request(`/api/agent-6/modules/${id}`, { method:'DELETE' }),
  completeModule: (id,data)             => request(`/api/agent-6/modules/${id}/complete`, { method:'POST', body:data }),
  completions:    (params={})            => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/completions${qs?'?'+qs:''}`); },
  leaderboard:    (params={})            => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/leaderboard${qs?'?'+qs:''}`); },
  empProfile:     (empId)               => request(`/api/agent-6/profile/${empId}`),
  awardPoints:    (data)                => request('/api/agent-6/points', { method:'POST', body:data }),
  challenges:     (params={})            => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/challenges${qs?'?'+qs:''}`); },
  createChallenge:(data)                => request('/api/agent-6/challenges', { method:'POST', body:data }),
  updateProgress: (id,data)             => request(`/api/agent-6/challenges/${id}/progress`, { method:'POST', body:data }),
  rewards:        ()                    => request('/api/agent-6/rewards'),
  addReward:      (data)                => request('/api/agent-6/rewards', { method:'POST', body:data }),
  claimReward:    (id,data)             => request(`/api/agent-6/rewards/${id}/claim`, { method:'POST', body:data }),
  rewardClaims:   (params={})            => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-6/reward-claims${qs?'?'+qs:''}`); },
  reviewClaim:    (id,data)             => request(`/api/agent-6/reward-claims/${id}/review`, { method:'POST', body:data }),
  coaching:       (data)                => request('/api/agent-6/coaching', { method:'POST', body:data }),
};

// ── Agent 7: SEO ──────────────────────────────────────────────────────────────


export const agent8 = {
  summary:         (locationId)      => request(`/api/agent-8/summary${locationId?'?locationId='+locationId:''}`),
  // Config (white-label)
  getConfig:       ()                => request('/api/agent-8/config'),
  saveConfig:      (data)            => request('/api/agent-8/config', { method:'POST', body:data }),
  // Members
  members:         (params={})       => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-8/members${qs?'?'+qs:''}`); },
  createMember:    (data)            => request('/api/agent-8/members', { method:'POST', body:data }),
  getMember:       (id)              => request(`/api/agent-8/members/${id}`),
  updateMember:    (id,data)         => request(`/api/agent-8/members/${id}`, { method:'PATCH', body:data }),
  recordVisit:     (id,data)         => request(`/api/agent-8/members/${id}/visit`, { method:'POST', body:data }),
  awardPoints:     (id,data)         => request(`/api/agent-8/members/${id}/award`, { method:'POST', body:data }),
  redeemPoints:    (id,data)         => request(`/api/agent-8/members/${id}/redeem`, { method:'POST', body:data }),
  adjustPoints:    (id,data)         => request(`/api/agent-8/members/${id}/adjust`, { method:'POST', body:data }),
  // Challenges
  challenges:      ()                => request('/api/agent-8/challenges'),
  createChallenge: (data)            => request('/api/agent-8/challenges', { method:'POST', body:data }),
  updateChallenge: (id, data)        => request(`/api/agent-8/challenges/${id}`, { method:'PATCH', body:data }),
  deleteChallenge: (id)              => request(`/api/agent-8/challenges/${id}`, { method:'DELETE' }),
  // Campaigns
  campaigns:       ()                => request('/api/agent-8/campaigns'),
  createCampaign:  (data)            => request('/api/agent-8/campaigns', { method:'POST', body:data }),
  updateCampaign:  (id, data)        => request(`/api/agent-8/campaigns/${id}`, { method:'PATCH', body:data }),
  deleteCampaign:  (id)              => request(`/api/agent-8/campaigns/${id}`, { method:'DELETE' }),
  generateCopy:    (id)              => request(`/api/agent-8/campaigns/${id}/copy`, { method:'POST' }),
  // Leaderboard
  leaderboard:     (metric,limit)    => request(`/api/agent-8/leaderboard?metric=${metric||'points'}&limit=${limit||10}`),
};

export { ApiError, getToken, setToken, clearToken };

export const billing = {
  plans:    ()              => request('/api/billing/plans'),
  checkout: (data)          => request('/api/billing/checkout', { method:'POST', body:data }),
  status:   ()              => request('/api/billing/status'),
  portal:   ()              => request('/api/billing/portal', { method:'POST' }),
};

export const toast = {
  status: ()     => request('/api/toast/status'),
  config: (data) => request('/api/toast/config', { method:'POST', body:data }),
  sync:   ()     => request('/api/toast/sync',   { method:'POST' }),
};

export const agent9 = {
  setStaffPin:      (employeeId, pin)           => request('/api/agent-9/staff/set-pin', { method:'POST', body:{ employeeId, pin } }),
  messages:         (params={})               => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-9/messages${qs?'?'+qs:''}`); },
  sendMessage:      (data)                      => request('/api/agent-9/messages', { method:'POST', body:data }),
  pinMessage:       (id, pinned)                => request(`/api/agent-9/messages/${id}/pin`, { method:'PATCH', body:{ pinned } }),
  deleteMessage:    (id)                        => request(`/api/agent-9/messages/${id}`, { method:'DELETE' }),
  markRead:         (data)                      => request('/api/agent-9/messages/read', { method:'POST', body:data }),
  summary:          (locationId)              => request(`/api/agent-9/summary${locationId?'?locationId='+locationId:''}`),
  employees:        (params={})               => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-9/employees${qs?'?'+qs:''}`); },
  addEmployee:      (data)                    => request('/api/agent-9/employees', { method:'POST', body:data }),
  updateEmployee:   (id,data)                 => request(`/api/agent-9/employees/${id}`, { method:'PATCH', body:data }),
  archiveEmployee:  (id)                      => request(`/api/agent-9/employees/${id}/archive`, { method:'POST' }),
  unarchiveEmployee:(id)                      => request(`/api/agent-9/employees/${id}/unarchive`, { method:'POST' }),
  deleteEmployee:   (id)                      => request(`/api/agent-9/employees/${id}`, { method:'DELETE' }),
  availability:     (empId)                   => request(`/api/agent-9/employees/${empId}/availability`),
  setAvailability:  (empId,entries)           => request(`/api/agent-9/employees/${empId}/availability`, { method:'POST', body:{entries} }),
  timeOff:          (params={})               => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-9/time-off${qs?'?'+qs:''}`); },
  requestTimeOff:   (data)                    => request('/api/agent-9/time-off', { method:'POST', body:data }),
  reviewTimeOff:    (id,data)                 => request(`/api/agent-9/time-off/${id}/review`, { method:'POST', body:data }),
  schedule:         (locationId,weekStart)    => request(`/api/agent-9/schedule?locationId=${locationId}&weekStart=${weekStart}`),
  copySchedule:     (data)                    => request('/api/agent-9/schedule/copy', { method:'POST', body:data }),
  publishSchedule:  (id)                      => request(`/api/agent-9/schedule/${id}/publish`, { method:'POST' }),
  createShift:      (data)                    => request('/api/agent-9/shifts', { method:'POST', body:data }),
  updateShift:      (id,data)                 => request(`/api/agent-9/shifts/${id}`, { method:'PATCH', body:data }),
  deleteShift:      (id)                      => request(`/api/agent-9/shifts/${id}`, { method:'DELETE' }),
  requests:         (params={})               => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-9/requests${qs?'?'+qs:''}`); },
  createRequest:    (data)                    => request('/api/agent-9/requests', { method:'POST', body:data }),
  reviewRequest:    (id,data)                 => request(`/api/agent-9/requests/${id}/review`, { method:'POST', body:data }),
  forecast:         (locationId,weekStart)    => request(`/api/agent-9/forecast?locationId=${locationId}&weekStart=${weekStart}`),
  generateForecast: (locationId,weekStart)    => request('/api/agent-9/forecast/generate', { method:'POST', body:{locationId,weekStart} }),
  payroll:          (locationId,weekStart)    => request(`/api/agent-9/payroll?locationId=${locationId}&weekStart=${weekStart}`),
  awardBadge:       (empId,badgeKey)          => request(`/api/agent-9/employees/${empId}/badges`, { method:'POST', body:{badgeKey} }),
}

export const agent11 = {
  summary:          (locationId)       => request(`/api/agent-11/summary${locationId?'?locationId='+locationId:''}`),
  sections:         (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-11/sections${qs?'?'+qs:''}`); },
  addSection:       (data)             => request('/api/agent-11/sections', { method:'POST', body:data }),
  updateSection:    (id,data)          => request(`/api/agent-11/sections/${id}`, { method:'PATCH', body:data }),
  deleteSection:    (id)               => request(`/api/agent-11/sections/${id}`, { method:'DELETE' }),
  items:            (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-11/items${qs?'?'+qs:''}`); },
  addItem:          (data)             => request('/api/agent-11/items', { method:'POST', body:data }),
  updateItem:       (id,data)          => request(`/api/agent-11/items/${id}`, { method:'PATCH', body:data }),
  deleteItem:       (id)               => request(`/api/agent-11/items/${id}`, { method:'DELETE' }),
  logSales:         (id,data)          => request(`/api/agent-11/items/${id}/sales`, { method:'POST', body:data }),
  matrix:           (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-11/matrix${qs?'?'+qs:''}`); },
  priceSuggestions: (params={})        => { const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!=null)).toString(); return request(`/api/agent-11/pricing/suggestions${qs?'?'+qs:''}`); },
  generatePricing:  (locationId)       => request('/api/agent-11/pricing/generate', { method:'POST', body:{locationId} }),
  applyPrice:       (id)               => request(`/api/agent-11/pricing/suggestions/${id}/apply`, { method:'POST' }),
  dismissPrice:     (id)               => request(`/api/agent-11/pricing/suggestions/${id}/dismiss`, { method:'POST' }),
  optimize:         (locationId)       => request('/api/agent-11/optimize', { method:'POST', body:{locationId} }),
  simulate:         (data)             => request('/api/agent-11/simulate', { method:'POST', body:data }),
  importRecipes:    (locationId)       => request('/api/agent-11/import-recipes', { method:'POST', body:{locationId} }),
  scanMenu:         (data)             => request('/api/agent-11/scan', { method:'POST', body:data }),
}
export const agent7 = {
  summary:          (locationId)       => request(`/api/agent-7/summary${locationId?'?locationId='+locationId:''}`),
  keywords:         (locationId)       => request(`/api/agent-7/keywords${locationId?'?locationId='+locationId:''}`),
  addKeyword:       (data)             => request('/api/agent-7/keywords', { method:'POST', body:data }),
  deleteKeyword:    (id)               => request(`/api/agent-7/keywords/${id}`, { method:'DELETE' }),
  generateKeywords: (locationId)       => request('/api/agent-7/keywords/generate', { method:'POST', body:{locationId} }),
  citations:        (locationId)       => request(`/api/agent-7/citations${locationId?'?locationId='+locationId:''}`),
  updateCitation:   (data)             => request('/api/agent-7/citations', { method:'PATCH', body:data }),
  recommendations:  (locationId)       => request('/api/agent-7/recommendations', { method:'POST', body:{locationId} }),
  website:          (locationId)       => request(`/api/agent-7/website?locationId=${locationId}`),
  saveWebsiteUrl:   (locationId,url)   => request('/api/agent-7/website/url', { method:'POST', body:{locationId,url} }),
  auditWebsite:     (locationId,url)   => request('/api/agent-7/website/audit', { method:'POST', body:{locationId,url} }),
}
// ── Reports ───────────────────────────────────────────────────────────────────
export const reports = {
  monthlySales:    (p={})   => { const qs=new URLSearchParams(Object.entries(p).filter(([,v])=>v!=null)).toString(); return request('/api/reports/monthly-sales'+(qs?'?'+qs:'')); },
  upsertMonthly:   (data)   => request('/api/reports/monthly-sales', { method:'POST', body:data }),
  deleteMonthly:   (data)   => request('/api/reports/monthly-sales', { method:'DELETE', body:data }),
  locations:       ()       => request('/api/reports/monthly-sales/locations'),
  payroll:         (p={})   => { const qs=new URLSearchParams(Object.entries(p).filter(([,v])=>v!=null)).toString(); return request('/api/reports/payroll'+(qs?'?'+qs:'')); },
  upsertPayroll:   (data)   => request('/api/reports/payroll', { method:'POST', body:data }),
  payrollLocations:()       => request('/api/reports/payroll/locations'),
};

// ── Integrations & Setup ──────────────────────────────────────────────────────
export const integrations = {
  setupStatus:     ()     => request('/api/integrations/setup-status'),
  businessInfo:    ()     => request('/api/integrations/business-info'),
  saveBusinessInfo:(data) => request('/api/integrations/business-info', { method:'POST', body:data }),
  status:          ()     => request('/api/integrations/status'),
  provisionTwilio: (tenantName) => request('/api/integrations/twilio/provision', { method:'POST', body:{ tenantName } }),
};

// ── POS ───────────────────────────────────────────────────────────────────────
export const pos = {
  status:        ()       => request('/api/pos/status'),
  squareConnect: ()       => request('/api/pos/square/connect-url'),
  squareMap:     (locationMap) => request('/api/pos/square/location-map', { method:'POST', body:{ locationMap } }),
  squareSync:    (days=30)=> request('/api/pos/square/sync', { method:'POST', body:{ days } }),
  toastSync:     (days=30)=> request('/api/pos/toast/sync', { method:'POST', body:{ days } }),
  toastImport:   (locationId, csvText) => request('/api/pos/toast/import-csv', { method:'POST', body:{ locationId, csvText } }),
  locations:     ()       => request('/api/pos/locations'),
};

// ── Insights ──────────────────────────────────────────────────────────────────
export const insights = {
  mondayBrief:     ()  => request('/api/insights/monday-brief'),
  sendMondayBrief: ()  => request('/api/insights/monday-brief/send', { method:'POST' }),
  marketingRoi:    (locationId) => request('/api/insights/marketing-roi'+(locationId?'?locationId='+locationId:'')),
  laborVsDemand:   (weeks=12)   => request('/api/insights/labor-vs-demand?weeks='+weeks),
};

// ── Social (Instagram + Google Business Profile) ─────────────────────────────
export const social = {
  status:        ()     => request('/api/social/status'),
  metaConnect:   ()     => request('/api/social/meta/connect-url'),
  sendInvite:    (provider, email) => request('/api/social/invite', { method:'POST', body:{ provider, email } }),
  igMedia:       (igId) => request('/api/social/instagram/media'+(igId?'?igId='+igId:'')),
  igInsights:    (igId) => request('/api/social/instagram/insights'+(igId?'?igId='+igId:'')),
  igPublish:     (data) => request('/api/social/instagram/publish', { method:'POST', body:data }),
  fbConnect:     ()     => request('/api/social/facebook/connect-url'),
  fbPublish:     (data) => request('/api/social/facebook/publish', { method:'POST', body:data }),
  googleConnect: ()     => request('/api/social/google/connect-url'),
  gbpLocations:  ()     => request('/api/social/google/locations'),
  gbpPost:       (data) => request('/api/social/google/post', { method:'POST', body:data }),
  gbpReviews:    (locationName) => request('/api/social/google/reviews'+(locationName?'?locationName='+encodeURIComponent(locationName):'')),
};
