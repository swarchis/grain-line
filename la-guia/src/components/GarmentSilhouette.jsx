import React from 'react';

// Simple technical-flat line silhouettes — the preset base a founder starts a
// design from. Deliberately plain (stroke-only, no fill) so a founder's own
// sketch or upload reads as the actual design, not this template.
const PATHS = {
  hoodie: (
    <>
      <path d="M20,14 Q20,2 30,2 Q40,2 40,14 L48,8 L54,18 L46,24 L42,20 L42,60 L18,60 L18,20 L14,24 L6,18 L12,8 Z" />
      <path d="M20,38 Q30,44 40,38" />
      <circle cx="27" cy="16" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="33" cy="16" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  tee: (
    <path d="M22,14 Q30,20 38,14 L48,8 L54,18 L46,24 L42,20 L42,60 L18,60 L18,20 L14,24 L6,18 L12,8 Z" />
  ),
  jacket: (
    <>
      <path d="M24,14 L30,20 L36,14 L48,8 L55,19 L47,25 L42,20 L42,62 L18,62 L18,20 L13,25 L5,19 L12,8 Z" />
      <line x1="30" y1="20" x2="30" y2="62" />
    </>
  ),
  denim: (
    <>
      <rect x="18" y="8" width="24" height="10" />
      <path d="M20,18 L29,18 L28,62 L21,62 Z" />
      <path d="M31,18 L40,18 L39,62 L32,62 Z" />
    </>
  ),
  shorts: (
    <>
      <rect x="18" y="8" width="24" height="10" />
      <path d="M20,18 L29,18 L28.5,40 L21,40 Z" />
      <path d="M31,18 L40,18 L39.5,40 L32,40 Z" />
    </>
  ),
  dress: (
    <path d="M22,14 Q30,20 38,14 L46,10 L52,18 L45,23 L40,20 L48,64 L12,64 L20,20 L15,23 L8,18 L14,10 Z" />
  ),
  skirt: (
    <>
      <rect x="20" y="8" width="20" height="8" />
      <path d="M18,16 L42,16 L50,58 L10,58 Z" />
    </>
  ),
  headwear: (
    <>
      <path d="M16,30 Q16,10 30,10 Q44,10 44,30 Z" />
      <path d="M14,30 L46,30 L52,36 L14,36 Z" />
      <circle cx="30" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  bag: (
    <>
      <path d="M12,24 L48,24 L44,64 L16,64 Z" />
      <path d="M20,24 Q20,10 30,10 Q40,10 40,24" />
    </>
  ),
};

export const GARMENT_TYPES = [
  { key: 'hoodie', label: 'Hoodie' },
  { key: 'tee', label: 'Tee' },
  { key: 'jacket', label: 'Jacket / Outerwear' },
  { key: 'denim', label: 'Pants / Denim' },
  { key: 'shorts', label: 'Shorts' },
  { key: 'dress', label: 'Dress' },
  { key: 'skirt', label: 'Skirt' },
  { key: 'headwear', label: 'Headwear' },
  { key: 'bag', label: 'Bag' },
];

export default function GarmentSilhouette({ type, size = 56, color = 'currentColor', strokeWidth = 2 }) {
  const path = PATHS[type] || PATHS.tee;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size * 1.2} viewBox="0 0 60 72" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      {path}
    </svg>
  );
}

// Renders an AI-generated silhouette — same viewBox/stroke-only convention as
// the hand-built presets above, but the path data comes from /api/generate-silhouette
// instead of a fixed key, for garment types outside the preset library.
export function CustomSilhouette({ paths, accents = [], size = 56, color = 'currentColor', strokeWidth = 2 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size * 1.2} viewBox="0 0 60 72" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      {(paths || []).map((d, i) => <path key={i} d={d} />)}
      {(accents || []).map((a, i) => <circle key={i} cx={a.cx} cy={a.cy} r={a.r} fill="currentColor" stroke="none" />)}
    </svg>
  );
}
