import type { SettingField, SettingSchema, SettingsValues, SettingValue } from './types';

function control(
  key: string,
  field: SettingField,
  value: SettingValue | undefined,
  onChange: (key: string, value: SettingValue) => void
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'setting-row';
  const caption = document.createElement('span');
  caption.className = 'field-label';
  caption.textContent = field.label; // textContent => author label can never inject markup
  row.appendChild(caption);

  let input: HTMLInputElement | HTMLSelectElement;
  if (field.type === 'select') {
    const sel = document.createElement('select');
    for (const opt of field.options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    sel.value = String(value ?? field.default);
    input = sel;
  } else {
    const el = document.createElement('input');
    if (field.type === 'boolean') { el.type = 'checkbox'; el.checked = Boolean(value ?? field.default); }
    else if (field.type === 'number') { el.type = 'number'; el.value = String(value ?? field.default); if (field.min != null) el.min = String(field.min); if (field.max != null) el.max = String(field.max); if (field.step != null) el.step = String(field.step); }
    else if (field.type === 'color') { el.type = 'color'; el.value = String(value ?? field.default); }
    else { el.type = 'text'; el.value = String(value ?? field.default); if (field.maxLength != null) el.maxLength = field.maxLength; }
    input = el;
  }
  // A boolean is the mock's native checkbox and wears `.switch`; a select is the family's own
  // `.select` (27px, its own arrow, map-design 3.19), and everything else is `.input`. All three
  // are what layout/panels.css's `.setting-row` rule caps at half the row.
  if (field.type === 'boolean') input.className = 'switch';
  else if (field.type === 'select') input.className = 'select';
  else input.className = 'input';
  input.dataset.key = key;

  // Listen directly on the control (rather than delegating via the form) so this
  // works regardless of whether the dispatched event bubbles.
  const emit = () => {
    let v: SettingValue;
    if (field.type === 'boolean') v = (input as HTMLInputElement).checked;
    else if (field.type === 'number') v = Number((input as HTMLInputElement).value);
    else v = input.value;
    onChange(key, v);
  };
  input.addEventListener('input', emit);
  input.addEventListener('change', emit);

  row.appendChild(input);
  return row;
}

export function renderSettingsForm(
  schema: SettingSchema,
  values: SettingsValues,
  onChange: (key: string, value: SettingValue) => void
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'settings-form';
  form.addEventListener('submit', e => e.preventDefault());
  for (const [key, field] of Object.entries(schema)) {
    form.appendChild(control(key, field, values[key], onChange));
  }
  return form;
}
