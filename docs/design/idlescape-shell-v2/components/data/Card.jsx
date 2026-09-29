import React from 'react';
const RAILS = { accent: 'var(--accent)', ok: 'var(--ok)', warn: 'var(--warn)', error: 'var(--error)' };
export function Card({ rail, gradient = false, pad = 11, hover = false, style, children, ...rest }) {
  return <div style={{ padding: pad, background: gradient ? 'var(--card-grad)' : 'var(--card)', border: '1px solid var(--hairline-soft)', borderLeft: rail ? '3px solid ' + (RAILS[rail] || rail) : '1px solid var(--hairline-soft)', borderRadius: 'var(--r-card)', boxShadow: gradient ? '0 4px 14px -8px rgba(0,0,0,.6)' : undefined, ...style }} {...rest}>{children}</div>;
}