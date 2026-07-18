import React, { useState } from 'react';

// Fallback High-Fidelity Technical Flats
// Used seamlessly if a custom .jpeg image is missing from the public/silhouettes folder.
const PATHS = {
  hoodie: (
    <>
      <path d="M 22.5 22 C 19.5 17 18 5 30 4 C 42 5 40.5 17 37.5 22 C 37.5 24.5 34 25.5 30 25.5 C 26 25.5 22.5 24.5 22.5 22 Z" />
      <path d="M 24.5 21.5 C 24 14 25 8 30 7.5 C 35 8 36 14 35.5 21.5 C 33 23 27 23 24.5 21.5 Z" fill="color-mix(in srgb, currentColor 8%, transparent)" />
      <path d="M 22.5 22.5 L 14.5 25 C 14.5 25 18 39 18 39 L 18 64 L 42 64 L 42 39 C 42 39 45.5 25 45.5 25 L 37.5 22.5" />
      <path d="M 14.5 25 C 9 34 5 45 7.5 56 L 14.5 59 L 18 39" />
      <path d="M 45.5 25 C 51 34 55 45 52.5 56 L 45.5 59 L 42 39" />
      <path d="M 7.5 56 L 5.5 61 L 11.5 64 L 14.5 59" />
      <path d="M 52.5 56 L 54.5 61 L 48.5 64 L 45.5 59" />
      <path d="M 18 64 L 18 68 L 42 68 L 42 64" />
      <path d="M 22 62 L 22 53 C 24 53 26 49 26 46 H 34 C 34 49 36 53 38 53 L 38 62" />
      <path d="M 22 53 L 26 46 M 38 53 L 34 46" strokeWidth="1" strokeDasharray="1 1.5" />
      <path d="M 27 24.5 Q 26 31 27 34" strokeWidth="1.2" />
      <path d="M 33 24.5 Q 34 31 33 34" strokeWidth="1.2" />
      <circle cx="27" cy="24" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="33" cy="24" r="0.8" fill="currentColor" stroke="none" />
      <path d="M 22 23 L 15 26 M 38 23 L 45 26" strokeDasharray="1 1.5" strokeWidth="0.8" />
    </>
  ),
  tee: (
    <>
      <path d="M 22 13 C 27 16 33 16 38 13 L 48 18 C 48 18 43 27 43 27 L 43 64 H 17 L 17 27 C 17 27 12 18 12 18 Z" />
      <path d="M 12 18 L 4 23 L 7 32 L 17 27" />
      <path d="M 48 18 L 56 23 L 53 32 L 43 27" />
      <path d="M 22 13 C 27 17 33 17 38 13 C 32 15.5 28 15.5 22 13 Z" />
      <path d="M 23 11 C 27 14 33 14 37 11" strokeWidth="1" />
      <path d="M 17 61 H 43" strokeDasharray="1 1.5" strokeWidth="1" />
      <path d="M 5 24.5 L 14.5 28.5" strokeDasharray="1 1.5" strokeWidth="1" />
      <path d="M 55 24.5 L 45.5 28.5" strokeDasharray="1 1.5" strokeWidth="1" />
      <path d="M 22 13 C 22 18 17 27 17 27 M 38 13 C 38 18 43 27 43 27" strokeWidth="1" />
    </>
  ),
  jacket: (
    <>
      <path d="M 22 14 L 13 18 C 13 18 17 38 17 38 L 17 62 H 43 L 43 38 C 43 38 47 18 47 18 L 38 14" />
      <path d="M 13 18 C 8 30 5 44 8 57 L 14 59 L 17 38" />
      <path d="M 47 18 C 52 30 55 44 52 57 L 46 59 L 43 38" />
      <path d="M 22 14 L 26 24 L 30 18 L 34 24 L 38 14 C 33 12 27 12 22 14 Z" />
      <path d="M 22 14 L 26 24 L 22 28 L 30 38" />
      <path d="M 38 14 L 34 24 L 38 28 L 30 38" />
      <line x1="30" y1="38" x2="30" y2="62" strokeWidth="1.5" />
      <rect x="19" y="47" width="7" height="8" />
      <rect x="34" y="47" width="7" height="8" />
      <path d="M 18.5 47 H 26.5 L 24.5 45 H 20.5 Z" />
      <path d="M 33.5 47 H 41.5 L 39.5 45 H 35.5 Z" />
      <path d="M 17 58 H 43 M 8 54 L 13.5 55.5 M 52 54 L 46.5 55.5" />
    </>
  ),
  denim: (
    <>
      <path d="M 17 8 C 26 9.5 34 9.5 43 8 L 43 12 C 34 13.5 26 13.5 17 12 Z" />
      <path d="M 30 8 V 12" />
      <circle cx="28.5" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <path d="M 30 12 V 26 C 28 26 27 24 27 20" strokeWidth="1.2" />
      <path d="M 17 12 C 20 12 22 16 22 20" strokeWidth="1" />
      <path d="M 43 12 C 40 12 38 16 38 20" strokeWidth="1" />
      <path d="M 17 12 C 15 30 13 50 13 66 H 25 C 25 50 28 35 30 26 C 32 35 35 50 35 66 H 47 C 47 50 45 30 43 12" />
      <path d="M 13.5 64 H 24.5 M 35.5 64 H 46.5" strokeDasharray="1 1.5" strokeWidth="1" />
      <line x1="20" y1="8" x2="20" y2="12" />
      <line x1="26" y1="8" x2="26" y2="12" />
      <line x1="34" y1="8" x2="34" y2="12" />
      <line x1="40" y1="8" x2="40" y2="12" />
    </>
  ),
  shorts: (
    <>
      <path d="M 17 10 Q 30 12 43 10 L 43 16 Q 30 18 17 16 Z" />
      <path d="M 17 13 Q 30 15 43 13" strokeWidth="1" strokeDasharray="2 3" />
      <path d="M 28 15 Q 27 22 25 26 M 32 15 Q 33 22 35 26" strokeWidth="1.2" />
      <circle cx="28" cy="14" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="32" cy="14" r="0.6" fill="currentColor" stroke="none" />
      <path d="M 17 16 L 14 42 H 26 L 30 22 L 34 42 H 46 L 43 16 Z" />
      <path d="M 17 16 L 15.5 42 M 43 16 L 44.5 42" strokeWidth="1" />
      <path d="M 14.5 39 H 25.5 M 34.5 39 H 45.5" strokeDasharray="1 1.5" strokeWidth="1" />
    </>
  ),
  dress: (
    <>
      <path d="M 22 10 C 26 15 34 15 38 10 L 44 14 L 40 32 C 34 34 26 34 20 32 L 16 14 Z" />
      <path d="M 20 32 C 14 45 9 65 9 65 H 51 C 51 65 46 45 40 32" />
      <path d="M 25 33 Q 23 45 21 65 M 35 33 Q 37 45 39 65" strokeWidth="1" />
      <path d="M 22 10 C 26 12 34 12 38 10" strokeWidth="1" />
      <path d="M 10 63 H 50" strokeDasharray="1 1.5" strokeWidth="1" />
    </>
  ),
  skirt: (
    <>
      <path d="M 20 12 C 26 14 34 14 40 12 L 41 16 C 34 18 26 18 19 16 Z" />
      <path d="M 19 16 C 14 30 8 58 8 58 H 52 C 52 58 46 30 41 16" />
      <path d="M 25 17 Q 23 35 21 58 M 35 17 Q 37 35 39 58" strokeWidth="1" />
      <path d="M 30 17 Q 30 35 30 58" strokeWidth="1" />
      <path d="M 9 55 H 51" strokeDasharray="1 1.5" strokeWidth="1" />
    </>
  ),
  headwear: (
    <>
      <path d="M 16 32 C 16 12 44 12 44 32 Z" />
      <path d="M 30 12 V 32" strokeWidth="1.2" />
      <path d="M 30 12 C 24 18 20 26 16 32 M 30 12 C 36 18 40 26 44 32" strokeWidth="1.2" />
      <path d="M 28.5 13 V 32 M 31.5 13 V 32" strokeWidth="0.8" strokeDasharray="1 1.5" />
      <circle cx="30" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="22" cy="22" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="38" cy="22" r="0.8" fill="currentColor" stroke="none" />
      <path d="M 12 32 C 11 36 17 40 30 40 C 43 40, 49 36, 48 32 Z" />
      <path d="M 16 32 C 18 35 42 35 44 32" strokeWidth="1.2" />
      <path d="M 14 34 C 18 37 42 37 46 34" strokeWidth="1" strokeDasharray="1 1.5" />
    </>
  ),
  bag: (
    <>
      <path d="M 12 24 L 48 24 L 44 64 L 16 64 Z" />
      <path d="M 14 26 H 46" strokeWidth="1.5" />
      <path d="M 18 63 L 21 54 M 42 63 L 39 54" strokeWidth="1.2" />
      <path d="M 21 22 C 21 8, 29 8, 29 22" strokeWidth="2.2" />
      <path d="M 31 22 C 31 8, 39 8, 39 22" strokeWidth="2.2" />
      <line x1="20" y1="32" x2="40" y2="32" strokeDasharray="2 2" />
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

export function VectorSilhouette({ type, size = 56, color = 'currentColor', strokeWidth = 1.8 }) {
  const path = PATHS[type] || PATHS.tee;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size * 1.2} viewBox="0 0 60 72" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      {path}
    </svg>
  );
}

export default function GarmentSilhouette({ type, size = 56, color = 'currentColor', strokeWidth = 1.8 }) {
  const [imgError, setImgError] = useState(false);

  // Render the uploaded image if it exists. If it 404s, seamlessly switch to the SVG fallback.
  if (!imgError) {
    return (
      <img 
        src={`/silhouettes/${type}.jpeg`} 
        alt={type}
        className="silhouette-img" 
        style={{ width: size, height: size * 1.2, objectFit: 'contain' }}
        onError={() => setImgError(true)} 
      />
    );
  }

  return <VectorSilhouette type={type} size={size} color={color} strokeWidth={strokeWidth} />;
}

// AI-generated silhouettes stay purely vector
export function CustomSilhouette({ paths, accents = [], size = 56, color = 'currentColor', strokeWidth = 1.8 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size * 1.2} viewBox="0 0 60 72" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
      {(paths || []).map((d, i) => <path key={i} d={d} />)}
      {(accents || []).map((a, i) => <circle key={i} cx={a.cx} cy={a.cy} r={a.r} fill="currentColor" stroke="none" />)}
    </svg>
  );
}