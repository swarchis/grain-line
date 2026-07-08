// ─── RestaurantOS — Shared Types ──────────────────────────────────────────────
// Single source of truth for all data shapes across the monorepo.
// Both apps/api and apps/web import from here.

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Tenant {
  id:           string;
  name:         string;
  plan:         'starter' | 'growth' | 'enterprise';
  activeAgents: AgentId[];
  createdAt:    string;
}

export interface Location {
  id:              string;
  tenantId:        string;
  name:            string;
  address:         string;
  city:            string;
  state:           string;
  zip:             string;
  phone:           string;
  timezone:        string;
  googlePlaceId?:  string;
  googleAccountId?: string;
  googleLocationId?: string;
  opentableId?:    string;
  toastLocationId?: string;
  yelpBusinessId?: string;
  active:          boolean;
  createdAt:       string;
}

export interface User {
  id:         string;
  tenantId:   string;
  email:      string;
  name:       string;
  role:       UserRole;
  locationIds: string[]; // empty = all locations
  createdAt:  string;
}

export type UserRole = 'owner' | 'manager' | 'staff';

export interface Employee {
  id:             string;
  locationId:     string;
  tenantId:       string;
  name:           string;
  role:           string;
  email?:         string;
  phone?:         string;
  toastEmployeeId?: string;
  sevenShiftsId?: string;
  startDate:      string;
  active:         boolean;
}

export interface Guest {
  id:              string;
  tenantId:        string;
  name:            string;
  email?:          string;
  phone?:          string;
  opentableId?:    string;
  loyaltyMemberId?: string;
  marketingOptIn:  boolean;
  createdAt:       string;
}

// ─── Agent IDs ────────────────────────────────────────────────────────────────

export type AgentId =
  | 'agent_1_marketing'
  | 'agent_2_financial'
  | 'agent_3_inventory'
  | 'agent_4_reviews'
  | 'agent_5_cashpl'
  | 'agent_6_training'
  | 'agent_7_seo'
  | 'agent_8_loyalty'
  | 'agent_9_labor'
  | 'agent_10_training'
  | 'agent_11_menu';

export const AGENT_META: Record<AgentId, { name: string; icon: string; path: string; color: string }> = {
  agent_1_marketing: { name: 'Marketing & Content',       icon: '📣', path: '/marketing',  color: '#c8922a' },
  agent_2_financial: { name: 'Financial KPI',             icon: '📊', path: '/financial',  color: '#2a7d50' },
  agent_3_inventory: { name: 'Inventory',                 icon: '📦', path: '/inventory',  color: '#1e4d8c' },
  agent_4_reviews:   { name: 'Reviews & Performance',     icon: '⭐', path: '/reviews',    color: '#8c3a1e' },
  agent_5_cashpl:    { name: 'Cash P&L',                  icon: '💰', path: '/cashpl',     color: '#5a2a8c' },
  agent_6_training:  { name: 'Compliance & Governance',   icon: '🛡️', path: '/training',   color: '#2a6b6b' },
  agent_7_seo:       { name: 'Local SEO & GBP',           icon: '🗺️', path: '/seo',        color: '#6b2a6b' },
  agent_8_loyalty:   { name: 'Loyalty & Referral',        icon: '🎁', path: '/loyalty',    color: '#8c6a1e' },
  agent_9_labor:     { name: 'Labor & Scheduling',         icon: '📅', path: '/labor',      color: '#2a5a8c' },
  agent_10_training: { name: 'Training & Performance',      icon: '🏆', path: '/training-perf', color: '#2a6b2a' },
  agent_11_menu:     { name: 'Menu Management',               icon: '🍽️', path: '/menu',         color: '#8c3a1e' },
};

// ─── Agent 4 — Reviews ────────────────────────────────────────────────────────

export type ReviewPlatform = 'google' | 'yelp' | 'opentable';
export type ReviewSentiment = 'positive' | 'neutral' | 'negative';
export type ReviewStatus = 'pending' | 'generating' | 'draft' | 'responded' | 'dismissed';

export interface Review {
  id:                string;
  locationId:        string;
  tenantId:          string;
  platform:          ReviewPlatform;
  externalId:        string;        // platform's review ID
  externalName:      string;        // e.g. accounts/.../reviews/...
  reviewer:          string;
  reviewerAvatarUrl?: string;
  rating:            1 | 2 | 3 | 4 | 5;
  text:              string;
  date:              string;
  status:            ReviewStatus;
  sentiment:         ReviewSentiment;
  sentimentScore:    number;        // 0–100
  urgent:            boolean;
  employeeMentions:  EmployeeMention[];
  responseDraft?:    string;
  responsePosted?:   string;
  responsePostedAt?: string;
  createdAt:         string;
  updatedAt:         string;
}

export interface EmployeeMention {
  employeeId?:   string;
  name:          string;
  sentiment:     ReviewSentiment;
}

// ─── Agent 2 — Financial ──────────────────────────────────────────────────────

export interface WeeklySales {
  id:          string;
  locationId:  string;
  weekStart:   string;
  foodSales:   number;
  liquorSales: number;
  otherSales:  number;
  totalSales:  number;
  laborCost:   number;
  laborHours:  number;
  source:      'toast_api' | 'manual';
  createdAt:   string;
}

export interface COGSEntry {
  id:          string;
  locationId:  string;
  weekStart:   string;
  category:    'food' | 'liquor' | 'supplies';
  amount:      number;
  vendor?:     string;
  notes?:      string;
  enteredBy:   string;
  createdAt:   string;
}

export interface KPISnapshot {
  locationId:    string;
  period:        string;
  foodCostPct:   number;
  liquorCostPct: number;
  laborCostPct:  number;
  grossMarginPct: number;
  totalRevenue:  number;
  reviewAvgRating: number;
  reviewCount:   number;
  eventConvRate: number;
}

// ─── Agent 3 — Inventory ──────────────────────────────────────────────────────

export interface InventoryItem {
  id:           string;
  locationId:   string;
  name:         string;
  category:     'food' | 'liquor' | 'supplies';
  unit:         string;
  costPerUnit:  number;
  parLevel:     number;
  barcode?:     string;
  vendorSku?:   string;
  updatedAt:    string;
}

export interface InventoryCount {
  id:          string;
  locationId:  string;
  period:      string;         // YYYY-MM format
  status:      'in_progress' | 'submitted' | 'approved';
  foodTotal:   number;
  liquorTotal: number;
  suppliesTotal: number;
  submittedBy: string;
  submittedAt?: string;
  createdAt:   string;
}

export interface InventoryCountLine {
  id:          string;
  countId:     string;
  itemId:      string;
  itemName:    string;
  quantity:    number;
  costPerUnit: number;
  total:       number;
}

// ─── Agent 5 — Cash P&L ───────────────────────────────────────────────────────

export interface BankTransaction {
  id:              string;
  locationId:      string;
  tenantId:        string;
  plaidTransactionId: string;
  amount:          number;
  date:            string;
  description:     string;
  category:        PLCategory;
  vendor?:         string;
  accountId:       string;
  pending:         boolean;
  createdAt:       string;
}

export type PLCategory =
  | 'revenue' | 'cogs_food' | 'cogs_liquor' | 'labor'
  | 'rent' | 'utilities' | 'marketing' | 'supplies'
  | 'repairs' | 'insurance' | 'other';

export interface WeeklyPL {
  id:          string;
  locationId:  string;
  weekStart:   string;
  lines:       PLLine[];
  netIncome:   number;
  generatedAt: string;
}

export interface PLLine {
  category:   PLCategory;
  label:      string;
  amount:     number;
  priorWeek?: number;
  changePct?: number;
}

// ─── Agent 6 — Training ───────────────────────────────────────────────────────

export interface TrainingModule {
  id:              string;
  tenantId:        string;
  title:           string;
  description:     string;
  requiredRoles:   string[];
  validityDays:    number;
  passScore:       number;
  contentUrl?:     string;
  mandatory:       boolean;
  createdAt:       string;
}

export interface TrainingCompletion {
  id:          string;
  employeeId:  string;
  moduleId:    string;
  score:       number;
  passed:      boolean;
  completedAt: string;
  expiresAt:   string;
}

// ─── Agent 7 — SEO ────────────────────────────────────────────────────────────

export interface GBPPost {
  id:           string;
  locationId:   string;
  type:         'STANDARD' | 'EVENT' | 'OFFER';
  content:      string;
  ctaType:      'BOOK' | 'ORDER' | 'LEARN_MORE' | 'CALL';
  status:       'draft' | 'approved' | 'published' | 'rejected';
  externalId?:  string;
  publishedAt?: string;
  createdAt:    string;
}

export interface SEOHealthScore {
  locationId:      string;
  score:           number; // 0–100
  completeness:    number;
  reviewVelocity:  number;
  postFrequency:   number;
  napConsistency:  number;
  citationCount:   number;
  keywordRankTrend: number;
  calculatedAt:    string;
}

export interface KeywordRanking {
  id:            string;
  locationId:    string;
  keyword:       string;
  mapPackRank?:  number;
  organicRank?:  number;
  checkedAt:     string;
}

// ─── Agent 8 — Loyalty ────────────────────────────────────────────────────────

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface LoyaltyMember {
  id:             string;
  tenantId:       string;
  guestId:        string;
  tier:           LoyaltyTier;
  pointsBalance:  number;
  pointsLifetime: number;
  referralCode:   string;
  referredById?:  string;
  streakWeeks:    number;
  lastVisitDate?: string;
  createdAt:      string;
}

export interface LoyaltyTransaction {
  id:          string;
  memberId:    string;
  type:        'earn' | 'redeem' | 'expire' | 'adjust';
  points:      number;
  description: string;
  locationId:  string;
  posCheckId?: string;
  createdAt:   string;
}

export interface LoyaltyChallenge {
  id:          string;
  tenantId:    string;
  name:        string;
  description: string;
  goalType:    'visits' | 'spend' | 'cross_venue' | 'review';
  goalTarget:  number;
  rewardPoints: number;
  rewardDesc:  string;
  startsAt:    string;
  endsAt:      string;
  active:      boolean;
}

// ─── Events (event bus) ───────────────────────────────────────────────────────

export type EventType =
  | 'dining.visit.completed'
  | 'reservation.completed'
  | 'review.posted'
  | 'review.response.approved'
  | 'inventory.count.submitted'
  | 'weekly.pos.sync.completed'
  | 'bank.transactions.imported'
  | 'loyalty.tier.upgraded'
  | 'loyalty.points.earned'
  | 'referral.converted'
  | 'training.overdue'
  | 'content.approved'
  | 'ad.campaign.converted';

export interface PlatformEvent<T = unknown> {
  eventId:       string;
  eventType:     EventType;
  tenantId:      string;
  locationId:    string;
  timestamp:     string;
  sourceAgent:   AgentId;
  schemaVersion: string;
  payload:       T;
  correlationId?: string;
}

// ─── API response shapes ──────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data:    T;
  ok:      true;
}

export interface ApiError {
  ok:      false;
  error:   string;
  code:    number;
  details?: unknown;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  userId:    string;
  tenantId:  string;
  email:     string;
  role:      UserRole;
  locationIds: string[];
  iat:       number;
  exp:       number;
}

export interface LoginRequest  { email: string; password: string; }
export interface LoginResponse { token: string; user: Omit<User, 'createdAt'>; }
