import React from 'react';
export function SectionLabel({ style, children, ...rest }) {
  return <div style={{ fontSize: 'var(--fs-label)', fontWeight: 650, letterSpacing: 'var(--label-tracking)', textTransform: 'uppercase', color: 'var(--text-muted)', ...style }} {...rest}>{children}</div>;
}