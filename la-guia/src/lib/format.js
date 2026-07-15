export const SECTION_COLOR = {
  home: 'var(--c-home)',
  design: 'var(--c-design)',
  techpack: 'var(--c-techpack)',
  organization: 'var(--c-organization)',
  vendors: 'var(--c-vendors)',
  materials: 'var(--c-materials)',
  finalcheck: 'var(--c-finalcheck)',
  analytics: 'var(--c-analytics)',
  content: 'var(--c-content)',
  settings: 'var(--c-settings)',
  success: 'var(--green)',
};

export function riskTagClass(risk) {
  if (risk === 'Conservative') return 'tag tag-blue';
  if (risk === 'Aggressive') return 'tag tag-amber';
  return 'tag tag-accent';
}

export function readinessColor(value) {
  if (value >= 80) return 'var(--green)';
  if (value >= 50) return 'var(--amber)';
  return 'var(--red)';
}

export function trustTagClass(tone) {
  if (tone === 'green') return 'tag tag-green';
  if (tone === 'amber') return 'tag tag-amber';
  if (tone === 'blue') return 'tag tag-blue';
  return 'tag tag-neutral';
}

export function currency(n) {
  return `$${n.toLocaleString('en-US')}`;
}

// Every caller already passes a 0-100 scale value (e.g. a margin computed
// as (profit / price) * 100), not a 0-1 fraction — this used to multiply by
// 100 again, so a real 65% margin rendered as "6500%".
export function percent(n) {
  return `${Math.round(n)}%`;
}

export function stageLink(stage, id) {
  if (stage === 'concept' || stage === 'design') return `/design/${id}`;
  if (stage === 'techpack') return `/tech-packs/${id}`;
  if (stage === 'sourcing') return `/quotes`;
  if (stage === 'sampling') return `/sampling/${id}`;
  if (stage === 'production') return `/production/${id}`;
  if (stage === 'launched') return `/products/${id}/performance`;
  return `/design/${id}`;
}

// Deterministic "fabric swatch" gradient seeded from a string — pure decoration,
// gives each product card a distinct identity instead of a flat color block.
export function swatchGradient(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  const hue2 = (hue + 34) % 360;
  return `linear-gradient(135deg, hsl(${hue} 38% 88%), hsl(${hue2} 46% 78%))`;
}

// A small deterministic tilt per id — so cards read as hand-placed, not grid-perfect.
export function tiltForId(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return ((Math.abs(hash) % 240) / 100 - 1.2).toFixed(2); // -1.2deg .. 1.2deg
}
