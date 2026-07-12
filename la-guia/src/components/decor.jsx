import React from 'react';

// Atelier decorative motifs — the pinned swatches, wax seals, and dried flowers
// that give the studio its handmade feel. No stock photography exists yet, so
// PhotoPanel/PinnedPhoto render an honest textured placeholder (a woven fabric
// gradient, not a broken-image icon) rather than faking a real product photo.

export function Thumbtack({ size = 14, color = 'var(--accent)', style }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: `radial-gradient(circle at 34% 30%, color-mix(in srgb, ${color} 55%, #fff), ${color} 70%)`,
        boxShadow: '0 3px 4px rgba(0,0,0,0.28), inset 0 -1px 1px rgba(0,0,0,0.18)',
        ...style,
      }}
    />
  );
}

export function WaxSeal({ initials = 'GL', size = 56, color = 'var(--accent)', style }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: 'visible', filter: 'drop-shadow(0 4px 7px rgba(0,0,0,0.28))', ...style }}>
      <defs>
        <radialGradient id={`${id}-g`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={`color-mix(in srgb, ${color} 45%, #fff)`} />
          <stop offset="55%" stopColor={color} />
          <stop offset="100%" stopColor={`color-mix(in srgb, ${color} 78%, #000)`} />
        </radialGradient>
      </defs>
      <path
        d="M32 3c3 0 4 2.4 6.6 3s5-1.6 7.3.1 1 5 3 6.7 5.6.2 6.6 3-2 4.4-1.6 6.9 3.7 3.9 3.1 6.7-4.3 2.6-5.6 4.8.6 5.6-1.4 7.6-5.2.2-7.4 1.7-1.8 5.4-4.4 6.1-4.7-1.9-7.6-1.9-5 3.3-7.6 1.9-1.6-5.4-4.4-6.1-6.5.3-7.4-1.7.4-5.6-1.4-7.6-5-2-5.6-4.8.3-4.5 3.1-6.7-2.6-4.7-1.6-6.9-1.4-5.3 3-3 5-4.9 7.3-6.7 2.3-1.7 3-6.7 5.7-.1 7.3-.1 3.6-3 6.6-3z"
        fill={`url(#${id}-g)`}
      />
      <text x="32" y="39" textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontWeight="600" fontSize="20" fill="rgba(0,0,0,0.28)">
        {initials}
      </text>
      <text x="32" y="38" textAnchor="middle" fontFamily="var(--serif)" fontStyle="italic" fontWeight="600" fontSize="20" fill="rgba(255,255,255,0.92)">
        {initials}
      </text>
    </svg>
  );
}

export function DriedFlower({ size = 40, color = 'var(--sage)', style }) {
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" fill="none" style={style}>
      <path d="M20 44 C19 30 18 20 16 6" stroke="color-mix(in srgb, var(--ink-3) 60%, transparent)" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M18 22 C13 20 9 21 6 17" stroke="color-mix(in srgb, var(--ink-3) 55%, transparent)" strokeWidth="1" strokeLinecap="round" />
      <path d="M18 30 C22 28 25 29 29 25" stroke="color-mix(in srgb, var(--ink-3) 55%, transparent)" strokeWidth="1" strokeLinecap="round" />
      {[0, 51, 102, 153, 204, 255, 306].map(deg => (
        <ellipse
          key={deg}
          cx="16" cy="6" rx="5.5" ry="2.6"
          fill={`color-mix(in srgb, ${color} ${62 + (deg % 3) * 8}%, transparent)`}
          transform={`rotate(${deg} 16 6)`}
        />
      ))}
      <circle cx="16" cy="6" r="2.4" fill="var(--accent)" opacity="0.8" />
    </svg>
  );
}

const TEXTURES = {
  fabric: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--ink-4) 22%, transparent) 0, color-mix(in srgb, var(--ink-4) 22%, transparent) 1px, transparent 1px, transparent 5px)',
  sketch: 'repeating-linear-gradient(0deg, color-mix(in srgb, var(--ink-4) 16%, transparent) 0, color-mix(in srgb, var(--ink-4) 16%, transparent) 1px, transparent 1px, transparent 22px)',
  weave: 'repeating-linear-gradient(45deg, color-mix(in srgb, var(--ink-4) 18%, transparent) 0, color-mix(in srgb, var(--ink-4) 18%, transparent) 1px, transparent 1px, transparent 4px), repeating-linear-gradient(-45deg, color-mix(in srgb, var(--ink-4) 12%, transparent) 0, color-mix(in srgb, var(--ink-4) 12%, transparent) 1px, transparent 1px, transparent 4px)',
};

const TONES = {
  gold: ['#D9C79A', '#C9AF74'],
  sage: ['#B7C2A4', '#95A480'],
  clay: ['#CDA98C', '#B98865'],
  ink: ['#C9C0AC', '#AFA48A'],
};

// Honest placeholder for product/fabric/sketch imagery — no real photography
// exists in this app yet, so this renders a deliberate textile-style abstraction
// with a small caption, rather than pretending to be a real photo. Pass a real
// `imageUrl` (a tech pack image, design snapshot, etc.) to render an actual
// photo instead — the texture/gradient only shows up when there's nothing real.
export function PhotoPanel({ variant = 'fabric', tone = 'gold', label, icon = 'ph-image', aspect = '4 / 5', imageUrl, style, className }) {
  const [c1, c2] = TONES[tone] || TONES.gold;
  return (
    <div
      className={className}
      style={{
        position: 'relative', aspectRatio: aspect, borderRadius: 'var(--r-sm)', overflow: 'hidden',
        background: imageUrl ? '#fff' : `linear-gradient(155deg, ${c1}, ${c2})`,
        border: '1px solid var(--border)',
        ...style,
      }}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={label || 'Product'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: TEXTURES[variant] || TEXTURES.fabric, mixBlendMode: 'multiply', opacity: 0.5 }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg, rgba(33,29,24,0.32), transparent 55%)' }} />
      {label && (
        <div style={{ position: 'absolute', left: 12, right: 12, bottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className={`ph ${icon}`} style={{ fontSize: 12, color: 'rgba(255,251,240,0.85)' }} />
          <span style={{ fontFamily: 'var(--sans)', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,251,240,0.85)' }}>{label}</span>
        </div>
      )}
    </div>
  );
}

// A PhotoPanel pinned to the page like a real photograph — one corner curls up
// off the surface (asymmetric radius + a light/shadow wedge), tilted slightly,
// held down by a single thumbtack. This is the "photo", as opposed to PhotoPanel
// alone which is just the flat placeholder texture used inside bordered cards.
export function PinnedPhoto({ tilt = -2, pinColor = 'var(--accent)', wrapperStyle, ...panelProps }) {
  return (
    <div className="photo-curl" style={{ '--curl-tilt': `${tilt}deg`, ...wrapperStyle }}>
      <div className="photo-pin">
        <Thumbtack size={15} color={pinColor} />
      </div>
      <div className="photo-curl-inner">
        <PhotoPanel {...panelProps} style={{ border: 'none', borderRadius: 0, ...panelProps.style }} />
      </div>
    </div>
  );
}
