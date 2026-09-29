import { describe, expect, test, vi } from 'vitest';
import { renderSettingsForm } from './settingsForm';
import type { SettingSchema } from './types';

const schema: SettingSchema = {
  show: { type: 'boolean', label: 'Show FPS', default: true },
  cap: { type: 'number', label: 'FPS cap', default: 60, min: 10, max: 120, step: 5 },
  mode: { type: 'select', label: 'Mode', default: 'webgl', options: [{ value: 'webgl', label: 'WebGL' }, { value: 'webgpu', label: 'WebGPU' }] },
  tint: { type: 'color', label: 'Tint', default: '#ff0000' },
  note: { type: 'text', label: 'Note', default: '', maxLength: 40 }
};

describe('renderSettingsForm', () => {
  test('renders one control per field with defaults applied when value missing', () => {
    const form = renderSettingsForm(schema, { cap: 90 }, () => {});
    expect(form.querySelector<HTMLInputElement>('[data-key="show"]')!.checked).toBe(true);
    expect(form.querySelector<HTMLInputElement>('[data-key="cap"]')!.value).toBe('90');
    expect(form.querySelector<HTMLSelectElement>('[data-key="mode"]')!.value).toBe('webgl');
    expect(form.querySelector<HTMLInputElement>('[data-key="tint"]')!.value).toBe('#ff0000');
  });

  test('a boolean toggle emits onChange with a boolean', () => {
    const onChange = vi.fn();
    const form = renderSettingsForm(schema, {}, onChange);
    const box = form.querySelector<HTMLInputElement>('[data-key="show"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith('show', false);
  });

  test('a number field emits a coerced number', () => {
    const onChange = vi.fn();
    const form = renderSettingsForm(schema, {}, onChange);
    const input = form.querySelector<HTMLInputElement>('[data-key="cap"]')!;
    input.value = '45';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('cap', 45);
  });

  // Each field type wears the family class its control actually is. A select wearing `.input`
  // takes the input rule's padding and loses the select family's own arrow and 11px type, and
  // layout/panels.css caps `.setting-row .select` alongside `.setting-row .input` for this.
  test('each control wears its own family class', () => {
    const form = renderSettingsForm(schema, {}, () => {});
    expect(form.querySelector('[data-key="show"]')!.className).toBe('switch');
    expect(form.querySelector('[data-key="mode"]')!.className).toBe('select');
    expect(form.querySelector('[data-key="cap"]')!.className).toBe('input');
    expect(form.querySelector('[data-key="tint"]')!.className).toBe('input');
    expect(form.querySelector('[data-key="note"]')!.className).toBe('input');
  });

  test('a hostile field label is not rendered as live markup', () => {
    const hostile: SettingSchema = { x: { type: 'boolean', label: '<img src=x onerror=alert(1)>', default: false } };
    const form = renderSettingsForm(hostile, {}, () => {});
    expect(form.querySelector('img')).toBeNull();
    expect(form.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
