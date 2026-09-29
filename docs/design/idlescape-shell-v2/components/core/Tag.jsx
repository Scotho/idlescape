import React from 'react';
export function Tag({ style, children, ...rest }) {
  return <span style={{ height: 16, display: 'inline-flex', alignItems: 'center', padding: '0 7px', borderRadius: 8, background: 'var(--control)', color: '#a0a09e', fontSize: 10, whiteSpace: 'nowrap', ...style }} {...rest}>{children}</span>;
}