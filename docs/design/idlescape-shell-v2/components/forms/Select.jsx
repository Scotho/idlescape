import React from 'react';
export function Select({ style, children, ...rest }) {
  return <select style={{ height: 27, padding: '0 7px', background: 'var(--sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-ctl)', color: 'var(--text-strong)', fontSize: 11, ...style }} {...rest}>{children}</select>;
}