import { describe, expect, test, vi } from 'vitest';
import { alert, badge, empty, h, kv } from './el';

describe('h', () => {
  test('builds an element with attributes, text children and listeners', () => {
    const onClick = vi.fn();
    const el = h('button', { class: 'btn', type: 'button', onclick: onClick, disabled: false, hidden: true }, 'Save', null, false);
    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toBe('btn');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.hasAttribute('disabled')).toBe(false);
    expect(el.hasAttribute('hidden')).toBe(true);
    expect(el.textContent).toBe('Save');
    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('string children are text, never markup', () => {
    const el = h('div', {}, '<b>x</b>');
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toBe('<b>x</b>');
  });

  test('nests nodes', () => {
    const el = h('div', {}, h('span', { id: 'inner' }, 'a'));
    expect(el.querySelector('#inner')?.textContent).toBe('a');
  });
});

describe('primitives', () => {
  test('kv renders label and value with an optional id', () => {
    const row = kv('Gateway', 'up', { id: 'gw', num: true });
    expect(row.querySelector('.kv-label')?.textContent).toBe('Gateway');
    expect(row.querySelector('#gw')?.className).toBe('kv-value num');
  });

  test('kv takes a tone on the value and a roomy row, and neither is the default', () => {
    // The mock colours the value of `Updates ● live` and `Gateway ● up` #6ec873 and gives the Bank
    // panel's rows `padding:4px 0` against everyone else's `2px 0` (map-design 2.14). Both are
    // per-row, so they are options on the builder rather than classes a caller has to remember.
    // Mutation target: making `roomy` the default puts 2px under every Account and Claude row.
    const plain = kv('Gateway', 'up');
    expect(plain.className).toBe('kv');
    expect((plain.querySelector('.kv-value') as HTMLElement).style.color).toBe('');
    const toned = kv('Updates', 'live', { roomy: true, tone: 'var(--ok-bright)' });
    expect(toned.className).toBe('kv kv-roomy');
    expect((toned.querySelector('.kv-value') as HTMLElement).style.color).toBe('var(--ok-bright)');
  });

  test('badge and alert carry their tone classes', () => {
    expect(badge('live', 'ok').className).toBe('badge badge-ok');
    expect(badge('x').className).toBe('badge');
    const a = alert('Something broke.', { tone: 'error', title: 'Failed' });
    expect(a.className).toBe('alert alert-error');
    expect(a.getAttribute('role')).toBe('alert');
    expect(a.querySelector('.alert-title')?.textContent).toBe('Failed');
    expect(alert('note').getAttribute('role')).toBe('status');
  });

  test('the default alert names its accent tone, because a bare .alert is the info default', () => {
    // Mutation target: going back to `tone === 'accent' ? 'alert' : ...` fails here, and the
    // Claude panel's pairing hint turns from the accent rail to the info one with nothing else
    // in the suite noticing.
    expect(alert('Paste this into your Claude session.').className).toBe('alert alert-accent');
    expect(alert('note', { tone: 'accent' }).className).toBe('alert alert-accent');
  });

  test('empty state renders an optional title', () => {
    expect(empty('Nothing yet.').querySelector('.empty-title')).toBeNull();
    expect(empty('Nothing yet.', 'No loot').querySelector('.empty-title')?.textContent).toBe('No loot');
  });
});
