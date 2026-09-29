import React from 'react';
export function Segmented({ options, value, onChange, style }) {
  return <div style={{ display: 'flex', gap: 3, background: 'var(--sunken)', border: '1px solid var(--hairline)', borderRadius: 'var(--r-seg)', padding: 3, ...style }}>
    {options.map((o) => {
      const a = o === value;
      return <button key={o} onClick={() => onChange && onChange(o)} style={{ flex: 1, height: 22, border: 0, borderRadius: 5, background: a ? 'var(--accent-tint)' : 'transparent', color: a ? 'var(--accent)' : 'var(--text-muted)', fontSize: 10.5, fontWeight: a ? 650 : 500, whiteSpace: 'nowrap', padding: '0 8px' }}>{o}</button>;
    })}
  </div>;
}