// ─── Event Bus ────────────────────────────────────────────────────────────────
// Lightweight Redis Streams-based event bus.
// Falls back to in-process EventEmitter if Redis is unavailable (dev mode).
// All 8 agents publish and subscribe through this module.

const { EventEmitter } = require('events');
const { v4: uuidv4 }  = require('uuid');

// ── In-process fallback (used when Redis is not configured) ───────────────────
class InMemoryEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this._log = process.env.NODE_ENV !== 'test';
  }

  async publish(event) {
    if (this._log) {
      console.log(`[eventbus] ${event.eventType} from ${event.sourceAgent} (in-memory)`);
    }
    this.emit(event.eventType, event);
    this.emit('*', event); // wildcard listener
    return event.eventId;
  }

  subscribe(eventType, handler) {
    this.on(eventType, handler);
    return () => this.off(eventType, handler);
  }

  subscribeAll(handler) {
    this.on('*', handler);
    return () => this.off('*', handler);
  }
}

// ── Redis Streams bus (production) ────────────────────────────────────────────
// Uncomment and configure when Redis is available.
// Uses ioredis — add to package.json: "ioredis": "^5.3.2"
//
// class RedisEventBus {
//   constructor() {
//     const Redis = require('ioredis');
//     this.publisher  = new Redis(process.env.REDIS_URL);
//     this.subscriber = new Redis(process.env.REDIS_URL);
//     this.STREAM_KEY = 'restaurantos:events';
//     this._startConsumer();
//   }
//
//   async publish(event) {
//     await this.publisher.xadd(
//       this.STREAM_KEY, '*',
//       'eventId',      event.eventId,
//       'eventType',    event.eventType,
//       'tenantId',     event.tenantId,
//       'sourceAgent',  event.sourceAgent,
//       'payload',      JSON.stringify(event.payload),
//       'timestamp',    event.timestamp,
//     );
//     console.log(`[eventbus] Published ${event.eventType} to Redis Stream`);
//     return event.eventId;
//   }
//
//   async _startConsumer() {
//     // Consumer group per service in production
//     // For simplicity: single consumer reads all events
//     while (true) {
//       const results = await this.subscriber.xread('COUNT', 10, 'BLOCK', 1000, 'STREAMS', this.STREAM_KEY, '$');
//       if (results) {
//         for (const [, messages] of results) {
//           for (const [id, fields] of messages) {
//             const event = this._parseFields(fields);
//             this._handlers.forEach(h => h(event));
//           }
//         }
//       }
//     }
//   }
// }

// ── Factory ────────────────────────────────────────────────────────────────────
let busInstance;

function getEventBus() {
  if (!busInstance) {
    if (process.env.REDIS_URL) {
      // TODO: swap to RedisEventBus when ioredis is installed
      console.log('[eventbus] REDIS_URL set but using in-memory (add ioredis to enable Redis Streams)');
    }
    busInstance = new InMemoryEventBus();
  }
  return busInstance;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Publish an event to the bus.
 * All agents call this after completing a significant action.
 *
 * @param {Object} opts
 * @param {string} opts.eventType    - One of the EventType enum values
 * @param {string} opts.tenantId
 * @param {string} opts.locationId
 * @param {string} opts.sourceAgent  - AgentId
 * @param {Object} opts.payload      - Event-specific data
 * @param {string} [opts.correlationId]
 */
async function publish({ eventType, tenantId, locationId, sourceAgent, payload, correlationId }) {
  const event = {
    eventId:       uuidv4(),
    eventType,
    tenantId,
    locationId,
    timestamp:     new Date().toISOString(),
    sourceAgent,
    schemaVersion: '1.0.0',
    payload:       payload || {},
    correlationId: correlationId || uuidv4(),
  };
  return getEventBus().publish(event);
}

/**
 * Subscribe to a specific event type.
 * Returns an unsubscribe function.
 */
function subscribe(eventType, handler) {
  return getEventBus().subscribe(eventType, handler);
}

/**
 * Subscribe to all events (for logging, audit trail, etc.)
 */
function subscribeAll(handler) {
  return getEventBus().subscribeAll(handler);
}

// ── Cross-agent subscriptions ──────────────────────────────────────────────────
// These are the 12 automated workflows defined in the architecture doc.
// Each subscription is wired here so it's easy to see all cross-agent flows.

function wireSubscriptions() {
  const bus = getEventBus();

  // dining.visit.completed → Agent 8 accrues loyalty points
  bus.subscribe('dining.visit.completed', async (event) => {
    try {
      const agent8 = require('../agents/agent8/service');
      await agent8.handleVisitCompleted(event);
    } catch(e) { console.error('[eventbus] agent8.handleVisitCompleted:', e.message); }
  });

  // reservation.completed → Agent 8 awards reservation points
  bus.subscribe('reservation.completed', async (event) => {
    try {
      const agent8 = require('../agents/agent8/service');
      await agent8.handleReservationCompleted(event);
    } catch(e) { console.error('[eventbus] agent8.handleReservationCompleted:', e.message); }
  });

  // inventory.count.submitted → Agent 2 updates COGs
  bus.subscribe('inventory.count.submitted', async (event) => {
    try {
      const agent2 = require('../agents/agent2/service');
      await agent2.handleInventorySubmitted(event);
    } catch(e) { console.error('[eventbus] agent2.handleInventorySubmitted:', e.message); }
  });

  // review.posted → Agent 7 tracks review velocity for SEO
  bus.subscribe('review.posted', async (event) => {
    try {
      const agent7 = require('../agents/agent7/service');
      await agent7.handleReviewPosted(event);
    } catch(e) { console.error('[eventbus] agent7.handleReviewPosted:', e.message); }
  });

  // loyalty.tier.upgraded → Agent 1 triggers CRM tier upgrade email
  bus.subscribe('loyalty.tier.upgraded', async (event) => {
    try {
      const agent1 = require('../agents/agent1/service');
      await agent1.handleTierUpgraded(event);
    } catch(e) { console.error('[eventbus] agent1.handleTierUpgraded:', e.message); }
  });

  // training.overdue → Agent 2 KPI flag
  bus.subscribe('training.overdue', async (event) => {
    try {
      const agent2 = require('../agents/agent2/service');
      await agent2.handleTrainingOverdue(event);
    } catch(e) { console.error('[eventbus] agent2.handleTrainingOverdue:', e.message); }
  });

  // ad.campaign.converted → Agent 2 ROAS update
  bus.subscribe('ad.campaign.converted', async (event) => {
    try {
      const agent2 = require('../agents/agent2/service');
      await agent2.handleCampaignConverted(event);
    } catch(e) { console.error('[eventbus] agent2.handleCampaignConverted:', e.message); }
  });

  // Log all events to platform_events table for audit trail
  bus.subscribeAll(async (event) => {
    try {
      const { adminQuery } = require('@restaurantos/db');
      await adminQuery(
        `INSERT INTO platform_events (tenant_id, location_id, event_type, source_agent, payload, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [event.tenantId, event.locationId, event.eventType, event.sourceAgent,
         JSON.stringify(event.payload), event.correlationId]
      ).catch(() => {}); // don't let audit logging break the flow
    } catch(_) {}
  });

  console.log('[eventbus] Cross-agent subscriptions wired (7 flows)');
}

const eventBus = { publish, subscribe, subscribeAll, wireSubscriptions };

module.exports = { eventBus };
