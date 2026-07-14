// The full site walkthrough — ordered to match the actual production flow
// (concept -> design -> tech pack -> materials -> sourcing -> production ->
// sales), so it teaches the app the way a founder will actually use it, not
// just in sidebar order. Every step (other than the intro/outro) points at a
// real element via `selector` (a `data-tour="..."` attribute on the target)
// and navigates there first — the overlay highlights that exact feature.
//
// Add a step here whenever a new feature ships — that's the whole point of
// keeping this as one flat, append-friendly list instead of scattering tour
// logic across pages.
export const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    path: '/',
    title: 'Welcome to Atelier',
    body: "This is a quick tour of everything in your production studio, in the order you'll actually use it — sketch to sale. Skip any step, or the whole thing, and re-open this tour anytime from the sidebar.",
  },
  {
    id: 'brand-switcher',
    path: '/',
    selector: '[data-tour="brand-switcher"]',
    title: 'Your workspace',
    body: 'Everything you do is scoped to a brand. Switch between brands here, or add a new one — each keeps its own products, vendors, and settings completely separate.',
  },
  {
    id: 'sidebar-nav',
    path: '/',
    selector: '[data-tour="nav-navigation"]',
    title: 'The main sections',
    body: 'Home, Collections, Designs, Tech Packs, Material Library, and Vendors & Pricing — the day-to-day flow of taking a piece from idea to sourced.',
  },
  {
    id: 'sidebar-search',
    path: '/',
    selector: '[data-tour="sidebar-search"]',
    title: 'Search everything',
    body: "Type here (or press Ctrl+K / ⌘K anywhere) to search across every product, vendor, material, collection, quote, and production order you have — it looks at the actual details on each one, not just names.",
  },
  {
    id: 'keyboard-shortcuts',
    path: '/',
    selector: '[data-tour="keyboard-shortcuts-btn"]',
    title: 'Keyboard shortcuts',
    body: "Press ? anywhere to see the full list — g then a letter jumps straight to a page once you know the layout.",
  },
  {
    id: 'home-hero',
    path: '/',
    selector: '[data-tour="home-hero"]',
    title: 'Your spotlight product',
    body: "The dashboard always features whatever's most active — its progress, current stage, and a one-click way to jump back in.",
  },
  {
    id: 'home-quick-actions',
    path: '/',
    selector: '[data-tour="quick-actions"]',
    title: 'Quick actions',
    body: 'The four things you do most often, one click away: start a design, import a vendor, request a quote, or check readiness.',
  },
  {
    id: 'home-continue',
    path: '/',
    selector: '[data-tour="continue-widget"]',
    title: 'Pick up where you left off',
    body: 'The last few products, vendors, and tech packs you looked at, one click away.',
  },
  {
    id: 'home-ai-suggestions',
    path: '/',
    selector: '[data-tour="ai-suggestions-widget"]',
    title: 'AI suggestions',
    body: "A quick read on what needs attention across your workspace today — gate flags, tight deadlines, anything worth knowing before you start working. Available on Basic and Premium.",
  },
  {
    id: 'home-project-health',
    path: '/',
    selector: '[data-tour="project-health-widget"]',
    title: 'Project health',
    body: 'Average readiness, gate flags, overdue orders, and your risk mix across every active product, at a glance.',
  },
  {
    id: 'home-favorites',
    path: '/',
    selector: '[data-tour="favorites-widget"]',
    title: 'Favorite projects',
    body: 'Star any product on the board below to pin it here for fast access.',
  },
  {
    id: 'home-calendar-timeline',
    path: '/',
    selector: '[data-tour="calendar-timeline-widget"]',
    title: 'Calendar timeline',
    body: 'Every upcoming production due date, soonest first, so nothing sneaks up on you.',
  },
  {
    id: 'home-kanban',
    path: '/',
    selector: '[data-tour="kanban-board"]',
    title: 'The production flow, end to end',
    body: "Every product lives on this board, moving left to right through the same stages we're about to walk through: Design, Tech Pack, Sourcing, Sampling, Production, Launched. Drag a card to a new stage, or use its move button.",
  },
  {
    id: 'design-studio',
    path: '/design',
    selector: '[data-tour="design-new"]',
    title: '1. Design Studio',
    body: "Start from a preset silhouette, upload your own sketch, or let AI sketch a blank outline for a garment type that isn't in the presets — then refine it on the built-in canvas.",
  },
  {
    id: 'collections',
    path: '/collections',
    selector: '[data-tour="collections"]',
    title: '2. Group designs into collections',
    body: 'Once you have a few pieces in motion, group them into a collection to track cost and timeline together — a capsule, a season, a drop.',
  },
  {
    id: 'tech-packs',
    path: '/tech-packs',
    selector: '[data-tour="tech-packs"]',
    title: '3. Tech Packs',
    body: 'Once a design is ready, generate its Bill of Materials and graded measurements automatically from the canvas — then review and edit every field yourself.',
  },
  {
    id: 'material-library',
    path: '/materials',
    selector: '[data-tour="material-library"]',
    title: '4. Material Library',
    body: "A risk reference for the fabrics and trims going into your BOM — shrinkage, price volatility, handling quirks — so surprises show up here, not in a factory.",
  },
  {
    id: 'readiness-review',
    path: '/readiness',
    selector: '[data-tour="readiness-review"]',
    title: '5. Readiness Review',
    body: "Before a tech pack goes to a vendor, it needs to clear this gate — BOM complete, measurements graded, construction notes reviewed.",
  },
  {
    id: 'vendor-hub',
    path: '/vendors',
    selector: '[data-tour="vendor-tabs"]',
    title: '6. Vendor Hub',
    body: 'Import vendors you already know, or search for manufacturers by what you need — AI filters out retail brands so you only see real production partners.',
  },
  {
    id: 'quote-tracker',
    path: '/quotes',
    selector: '[data-tour="quote-tracker"]',
    title: '7. Quote Tracker',
    body: 'Every quote you request lives here, with its status, so nothing gets lost in email.',
  },
  {
    id: 'sidebar-production',
    path: '/quotes',
    selector: '[data-tour="nav-production"]',
    title: 'The Production section',
    body: 'Once a vendor is chosen and a quote accepted, everything moves here — production orders and the final readiness gate.',
  },
  {
    id: 'production-orders',
    path: '/production',
    selector: '[data-tour="production-orders"]',
    title: '8. Production Orders',
    body: 'Once you commit to a vendor, track units, due dates, and stage right through to delivery.',
  },
  {
    id: 'sales-dashboard',
    path: '/sales',
    selector: '[data-tour="sales-dashboard"]',
    title: '9. Sales Dashboard',
    body: "Revenue, orders, and per-product financial modeling once a piece launches. The chart is real once a storefront is connected — for now it's shaped around what that will look like.",
  },
  {
    id: 'content-hub',
    path: '/content',
    selector: '[data-tour="content-hub"]',
    title: '10. Content Hub',
    body: 'Plan and schedule posts tied to specific products — connect your social accounts once that integration is ready.',
  },
  {
    id: 'notifications',
    path: '/',
    selector: '[data-tour="sidebar-bell"]',
    title: 'Notifications',
    body: 'Readiness gates, vendor quotes, price alerts — anything worth knowing about shows up here first.',
  },
  {
    id: 'settings-team',
    path: '/settings',
    selector: '[data-tour="settings-tabs"]',
    title: 'Settings & your team',
    body: 'Manage your profile, brand details, teammates and their permissions, billing, and notification preferences — all in one place.',
  },
  {
    id: 'outro',
    path: '/',
    title: "You're all set",
    body: "That's the whole app, start to finish. Re-open this tour anytime from the sidebar if you want a refresher.",
  },
];
