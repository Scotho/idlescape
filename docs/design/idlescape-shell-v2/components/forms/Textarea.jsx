import React from 'react';
export function Textarea({ code = false, style, ...rest }) {
  return <textarea style={{ width: '100%', boxSizing: 'border-box', padding: code ? '8px 9px' : 9, background: 'var(--sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-ctl)', color: 'var(--text-strong)', fontSize: code ? 11 : 12, fontFamily: code ? 'var(--font-num)' : 'var(--font-ui)', resize: 'vertical', ...style }} {...rest} />;
}