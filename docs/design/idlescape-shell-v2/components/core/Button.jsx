import React from 'react';
const SIZES = { xs: { h: 22, px: 9, fs: 10.5 }, sm: { h: 25, px: 11, fs: 11 }, md: { h: 27, px: 13, fs: 12 }, lg: { h: 29, px: 14, fs: 12 } };
const VARIANTS = {
  default: { background: 'var(--control)', border: '1px solid var(--hairline-strong)', color: 'var(--text-strong)', fontWeight: 500 },
  primary: { background: 'var(--accent-grad)', border: '1px solid var(--accent-deep)', color: 'var(--on-accent)', fontWeight: 650, boxShadow: '0 2px 10px var(--accent-glow)' },
  danger: { background: 'var(--danger)', border: '1px solid var(--danger-deep)', color: '#f0e6e6', fontWeight: 500 },
  outline: { background: 'none', border: '1px solid var(--hairline-strong)', color: '#a0a09e', fontWeight: 500 },
  link: { background: 'none', border: 0, padding: 0, height: 'auto', color: 'var(--accent)', fontWeight: 500 }
};
export function Button({ variant = 'default', size = 'md', block = false, disabled = false, style, children, ...rest }) {
  const s = SIZES[size] || SIZES.md;
  const base = { display: block ? 'flex' : 'inline-flex', width: block ? '100%' : undefined, alignItems: 'center', justifyContent: 'center', gap: 6, height: s.h, padding: '0 ' + s.px + 'px', borderRadius: 'var(--r-ctl)', fontSize: s.fs, fontFamily: 'var(--font-ui)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.35 : 1, whiteSpace: 'nowrap' };
  return <button disabled={disabled} style={{ ...base, ...(VARIANTS[variant] || VARIANTS.default), ...style }} {...rest}>{children}</button>;
}