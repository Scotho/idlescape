import { describe, expect, test } from 'bun:test';
import { SNIPPET_CLOSE, SNIPPET_OPEN } from './db';
import { renderSnippet } from './layout';

describe('renderSnippet', () => {
  test('turns sentinel markers into <b> tags and escapes everything else', () => {
    const raw = `${SNIPPET_OPEN}bronze${SNIPPET_CLOSE} <script>alert(1)</script> & co`;
    expect(renderSnippet(raw)).toBe('<b>bronze</b> &lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
  });

  test('plain text with no sentinels and no markup is only escaped, never bolded', () => {
    expect(renderSnippet('a <b> & c')).toBe('a &lt;b&gt; &amp; c');
    expect(renderSnippet('a <b> & c')).not.toContain('<b>');
  });
});
