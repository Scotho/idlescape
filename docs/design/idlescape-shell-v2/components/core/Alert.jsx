import React from 'react';
const TONES = { accent: 'var(--accent)', ok: 'var(--ok)', warn: 'var(--warn)', error: 'var(--error)', info: 'var(--info)' };
const TINTS = { accent: 'rgba(255,152,31,.07)', ok: 'rgba(67,160,71,.07)', warn: 'rgba(255,179,0,.07)', error: 'rgba(229,57,53,.07)', info: 'rgba(74,144,217,.07)' };
export function Alert({ tone = 'info', style, children, ...rest }) {
  return <div style={{ padding: '7px 9px', background: TINTS[tone] || TINTS.info, borderLeft: '3px solid ' + (TONES[tone] || TONES.info), borderRadius: 4, color: tone === 'warn' ? 'var(--warn)' : 'var(--text)', fontSize: 11, ...style }} {...rest}>{children}</div>;
}