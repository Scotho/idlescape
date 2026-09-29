import React from 'react';
const FILLS = {
  accent: 'linear-gradient(90deg,#f28c0e,#ffb95e,#f28c0e)',
  hp: 'linear-gradient(90deg,var(--hp),var(--hp-bright))',
  prayer: 'linear-gradient(90deg,var(--prayer),var(--prayer-bright))',
  run: 'linear-gradient(90deg,var(--run),var(--run-bright))'
};
export function Meter({ pct = 0, tone = 'accent', shimmer = false, height = 5, style }) {
  return <div style={{ height, background: '#2c2c2e', borderRadius: height / 2 + 1, overflow: 'hidden', ...style }}>
    <span style={{ display: 'block', height: '100%', width: pct + '%', borderRadius: height / 2 + 1, background: FILLS[tone] || tone, backgroundSize: shimmer ? '200% 100%' : undefined, animation: shimmer ? 'shimmer 2.4s linear infinite' : undefined }} />
  </div>;
}