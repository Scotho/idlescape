import React from 'react';
import { StatusDot } from '../core/StatusDot.jsx';
export function CharTab({ name, status, tone = 'idle', active = false, disabled = false, onClick, style }) {
  return <button disabled={disabled} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 148, padding: '0 12px', height: '100%', border: 0, borderBottom: '2px solid ' + (active ? 'var(--accent)' : 'transparent'), background: active ? 'linear-gradient(180deg,#28282a,#232325)' : 'transparent', color: active ? 'var(--text-strong)' : disabled ? 'var(--text-disabled)' : '#a0a09e', fontSize: 11, borderRadius: active ? 0 : '6px 6px 0 0', boxShadow: active ? '0 6px 14px -8px rgba(255,152,31,.4)' : undefined, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}>
    {tone !== 'none' ? <StatusDot tone={tone} size={7} glow={tone === 'ok'} /> : null}
    <span>{name}</span>
    {status ? <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' }}>{status}</span> : null}
  </button>;
}