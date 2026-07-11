// Single source of truth for every sidebar destination — shared by Sidebar
// (for the nav itself) and SidebarSearch (so "search everything" also
// matches page names/synonyms, not just entity content). Keeping one list
// means a renamed/added page can't silently drift out of sync between nav
// and search.
export const NAV_GROUPS = [
  { label: 'Navigation', tourId: 'nav-navigation', items: [
    { path: '/', icon: 'ph-house', label: 'Home', color: 'var(--c-home)', keywords: ['dashboard', 'overview', 'today', 'continue', 'suggestions', 'health', 'favorites', 'calendar'] },
    { path: '/collections', icon: 'ph-stack', label: 'Collections', color: 'var(--c-organization)', keywords: ['capsule', 'season', 'drop', 'launch window'] },
    { path: '/design', icon: 'ph-pencil-simple', label: 'Designs', color: 'var(--c-design)', keywords: ['sketch', 'silhouette', 'canvas', 'photopea', 'design studio'] },
    { path: '/tech-packs', icon: 'ph-ruler', label: 'Tech Packs', color: 'var(--c-techpack)', keywords: ['bom', 'bill of materials', 'measurements', 'grading'] },
    { path: '/materials', icon: 'ph-flask', label: 'Material Library', color: 'var(--c-materials)', keywords: ['fabric', 'trims', 'shrinkage', 'handling'] },
    { path: '/vendors', icon: 'ph-handshake', label: 'Vendors', color: 'var(--c-vendors)', keywords: ['manufacturer', 'factory', 'sourcing', 'supplier'] },
    { path: '/quotes', icon: 'ph-file-text', label: 'Quotes & Pricing', color: 'var(--c-vendors)', keywords: ['rfq', 'costing', 'bid'] },
  ] },
  { label: 'Production', tourId: 'nav-production', items: [
    { path: '/production', icon: 'ph-package', label: 'Production Orders', color: 'var(--c-materials)', keywords: ['po', 'units', 'due date', 'delivery'] },
    { path: '/readiness', icon: 'ph-check-circle', label: 'Readiness Review', color: 'var(--c-finalcheck)', keywords: ['gate', 'checklist', 'factory ready'] },
  ] },
  { label: 'Analytics', items: [
    { path: '/sales', icon: 'ph-chart-line-up', label: 'Dashboard', color: 'var(--c-analytics)', keywords: ['sales', 'revenue', 'shopify', 'break-even'] },
  ] },
  { label: 'Tools', items: [
    { path: '/content', icon: 'ph-megaphone', label: 'Content Hub', color: 'var(--c-content)', keywords: ['social', 'posts', 'schedule'] },
    { path: '/notifications', icon: 'ph-bell', label: 'Notifications', color: 'var(--c-settings)', keywords: ['alerts', 'inbox'] },
  ] },
];

export const SETTINGS_PAGE = {
  path: '/settings', icon: 'ph-gear-six', label: 'Profile & Settings', color: 'var(--sb-ink-3)',
  keywords: ['billing', 'team', 'preferences', 'account', 'plan', 'subscription', 'profile', 'invite'],
};

export const NAV_PAGES = [...NAV_GROUPS.flatMap(g => g.items), SETTINGS_PAGE];
