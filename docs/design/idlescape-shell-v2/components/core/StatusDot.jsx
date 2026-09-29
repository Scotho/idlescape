import React from 'react';
const COLORS = { ok: 'var(--ok)', accent: 'var(--accent)', warn: 'var(--warn)', error: 'var(--error)', idle: 'var(--text-faint)' };
const GLOWS = { ok: 'rgba(67,160,71,.6)', accent: 'rgba(255,152,31,.6)', warn: 'rgba(255,179,0,.5)', error: 'rgba(229,57,53,.5)', idle: 'transparent' };
export function StatusDot({ tone = 'idle', size = 8, pulse = false, glow = false, style, ...rest }) {
  return <span style={{ width: size, height: size, borderRadius: '50%', flex: 'none', display: 'inline-block', background: COLORS[tone] || COLORS.idle, boxShadow: glow ? '0 0 8px ' + (GLOWS[tone] || 'transparent') : undefined, animation: pulse ? 'pulse 1.6s ease-in-out infinite' : undefined, ...style }} {...rest} />;
}