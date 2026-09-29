import React from 'react';
export function Input({ mono = false, style, ...rest }) {
  return <input style={{ width: '100%', boxSizing: 'border-box', height: 27, padding: '0 11px', background: 'var(--sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-ctl)', color: 'var(--text-strong)', fontSize: mono ? 10 : 12, fontFamily: mono ? 'var(--font-num)' : 'var(--font-ui)', ...style }} {...rest} />;
}