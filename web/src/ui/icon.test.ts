import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, icon } from './icon';

// Read off disk through `fileURLToPath`, not `readFileSync(new URL(...))`: under jsdom the global
// URL is not the URL class node:fs accepts, which is the same trap the frame's stylesheet tests record.
const here = dirname(fileURLToPath(import.meta.url));
const jsx = readFileSync(join(here, '../../../docs/design/idlescape-shell-v2/components/core/Icon.jsx'), 'utf8');

describe('icon', () => {
  it('ships exactly the eleven glyphs the design bundle declares, in its order', () => {
    expect(ICON_NAMES).toEqual([
      'automation', 'claude', 'xp', 'loot', 'events',
      'notes', 'screenshot', 'bank', 'account', 'plugins', 'config'
    ]);
  });

  it('draws a 16x16 currentColor svg with a 1.5 stroke', () => {
    const el = icon('xp');
    expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(el.getAttribute('width')).toBe('16');
    expect(el.getAttribute('height')).toBe('16');
    expect(el.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(el.getAttribute('fill')).toBe('none');
    expect(el.getAttribute('stroke')).toBe('currentColor');
    expect(el.getAttribute('stroke-width')).toBe('1.5');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.classList.contains('icon')).toBe(true);
  });

  it('gives every glyph a non-empty body, and no two glyphs the same one', () => {
    const bodies = ICON_NAMES.map(n => icon(n).innerHTML);
    for (const [i, body] of bodies.entries()) expect(body.length, ICON_NAMES[i]).toBeGreaterThan(10);
    expect(new Set(bodies).size).toBe(ICON_NAMES.length);
  });

  it('falls back to the plugins glyph for an unknown name rather than drawing nothing', () => {
    // G7: a plugin naming an unknown glyph must still get a button a player can press.
    expect(icon('no-such-glyph').innerHTML).toBe(icon('plugins').innerHTML);
  });

  it('takes a size and applies it to both dimensions', () => {
    const el = icon('bank', 20);
    expect(el.getAttribute('width')).toBe('20');
    expect(el.getAttribute('height')).toBe('20');
    expect(el.getAttribute('viewBox')).toBe('0 0 16 16');   // the viewBox never scales
  });

  it('matches the vendored Icon.jsx geometry, attribute by attribute', () => {
    // Mutation target: retyping a path by hand instead of copying it fails here. Two passes.
    // The first reads `d` and `points`, which is every stroked outline the set draws; the second
    // reads every attribute of every shape, which is the only way the four circle-and-rect glyphs
    // (loot, screenshot, plugins, and config's two dials) are covered at all. The bundle writes
    // JSX single quotes, so the comparison is made in that spelling.
    const flat = jsx.replace(/\s+/g, ' ');
    let outlines = 0;
    let attributes = 0;
    for (const name of ICON_NAMES) {
      const body = icon(name).innerHTML;
      for (const [, value] of body.matchAll(/(?:d|points)="([^"]+)"/g)) {
        expect(flat, `${name}: ${value}`).toContain(value);
        outlines += 1;
      }
      for (const [, attr, value] of body.matchAll(/([a-z-]+)="([^"]*)"/g)) {
        // `d` and `points` are checked by value alone above: the bundle writes six of the ten
        // through its own `P(d)` helper, where the attribute name never appears at all.
        if (attr === 'd' || attr === 'points') continue;
        expect(flat, `${name}: ${attr}=${value}`).toContain(`${attr}='${value}'`);
        attributes += 1;
      }
    }
    // Counted off Icon.jsx: ten `d`/`points` values, and 48 further attributes across the
    // circles and rects. Deleting a shape from a glyph leaves the loop green on every value it
    // still checks and fails here, which is what these two numbers are for.
    expect(outlines).toBe(10);
    expect(attributes).toBe(48);
  });
});
