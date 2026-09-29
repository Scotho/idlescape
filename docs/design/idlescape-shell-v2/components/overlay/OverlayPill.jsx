import React from 'react';
const BORDERS = { accent: 'rgba(255,152,31,.35)', ok: 'rgba(67,160,71,.4)', warn: 'rgba(255,179,0,.4)', error: 'rgba(229,57,53,.4)', neutral: 'rgba(128,128,128,.4)' };
const COLORS = { accent: 'var(--accent)', ok: 'var(--ok)', warn: 'var(--warn)', error: 'var(--error)', neutral: 'var(--text)' };
export function OverlayPill({ tone = 'accent', style, children, ...rest }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 7px', background: 'var(--overlay-scrim)', border: '1px solid ' + (BORDERS[tone] || BORDERS.neutral), borderRadius: 3, color: COLORS[tone] || COLORS.neutral, fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 10.5, whiteSpace: 'nowrap', backdropFilter: 'blur(2px)', ...style }} {...rest}>{children}</span>;
}