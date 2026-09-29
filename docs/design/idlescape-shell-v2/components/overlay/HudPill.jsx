import React from 'react';
const T = {
  hp: { label: 'HP', c: 'var(--hp-bright)', fill: 'var(--hp)', border: 'rgba(192,57,43,.45)' },
  prayer: { label: 'PRAY', c: 'var(--prayer-bright)', fill: 'var(--prayer)', border: 'rgba(41,128,185,.45)' },
  run: { label: 'RUN', c: 'var(--run-bright)', fill: 'var(--run)', border: 'rgba(39,174,96,.45)' }
};
export function HudPill({ meter = 'hp', pct = 100, value, style }) {
  const t = T[meter] || T.hp;
  const num = { fontFamily: 'var(--font-num)', fontWeight: 700, fontSize: 10.5 };
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 7px', background: 'var(--overlay-scrim)', border: '1px solid ' + t.border, borderRadius: 3, backdropFilter: 'blur(2px)', ...style }}>
    <span style={{ ...num, color: t.c }}>{t.label}</span>
    <span style={{ width: 42, height: 4, background: 'rgba(255,255,255,.14)', borderRadius: 2, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: pct + '%', background: t.fill }} /></span>
    <span style={{ ...num, color: '#fff' }}>{value}</span>
  </span>;
}