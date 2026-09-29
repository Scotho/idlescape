import React from 'react';
export function KV({ label, value, mono = false, tone, style }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 11, ...style }}>
    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    <b style={{ color: tone || 'var(--text-strong)', fontFamily: mono ? 'var(--font-num)' : undefined, fontVariantNumeric: 'tabular-nums' }}>{value}</b>
  </div>;
}