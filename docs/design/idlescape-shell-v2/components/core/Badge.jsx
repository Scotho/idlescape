import React from 'react';
const TONES = {
  accent: { background: 'rgba(255,152,31,.16)', color: 'var(--accent)' },
  ok: { background: 'rgba(67,160,71,.16)', color: 'var(--ok-bright)' },
  warn: { background: 'rgba(255,179,0,.14)', color: 'var(--warn)' },
  error: { background: 'rgba(229,57,53,.16)', color: '#f07370' },
  info: { background: 'rgba(74,144,217,.16)', color: 'var(--info-bright)' },
  neutral: { background: 'var(--control)', color: '#a0a09e' }
};
export function Badge({ tone = 'neutral', dot = false, style, children, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  return <span style={{ height: 17, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 7px', borderRadius: 9, fontSize: 10, fontWeight: 650, whiteSpace: 'nowrap', ...t, ...style }} {...rest}>{dot ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} /> : null}{children}</span>;
}