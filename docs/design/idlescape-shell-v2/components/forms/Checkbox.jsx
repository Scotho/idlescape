import React from 'react';
export function Checkbox({ style, ...rest }) {
  return <input type='checkbox' style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer', ...style }} {...rest} />;
}