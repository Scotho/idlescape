import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { StatusDot } from '../core/StatusDot.jsx';
export function StripButton({ icon, label, active = false, dot, onClick, style }) {
  return <button title={label} aria-label={label} onClick={onClick} style={{ position: 'relative', width: 40, height: 33, display: 'grid', placeItems: 'center', border: 0, background: active ? 'var(--card)' : 'transparent', color: active ? 'var(--accent)' : '#9a9a98', boxShadow: active ? 'inset 2px 0 0 var(--accent)' : undefined, ...style }}>
    <Icon name={icon} />
    {dot ? <StatusDot tone={dot} size={6} glow style={{ position: 'absolute', right: 5, top: 5 }} /> : null}
  </button>;
}