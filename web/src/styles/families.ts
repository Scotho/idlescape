// web/src/styles/families.ts -- the component library's shape, as data.
//
// One file per component family, and each file owns exactly the class prefixes listed here.
// styles.test.ts enforces it, which is the mechanical half of "every new panel composes these
// classes; no per-panel one-off styles": there is nowhere else to put one.
export const FAMILIES: Record<string, readonly string[]> = {
  // `spinner` is the standalone half of `.btn.is-loading`'s ::after ring: the same 2px arc, drawn
  // on its own element where there is no button to hang it on. It is button chrome either way.
  'button.css': ['btn', 'link', 'spinner'],
  'badge.css': ['badge', 'tag', 'dot'],
  // `section` and not just `section-label`: layout.css's collapsible `.section` / `.section-body`
  // move here in Step 3, and `owns()` matches only a prefix or `prefix-`, so `section-label`
  // alone would reject `.section`. Choosing this rather than routing `.section*` to a layout
  // file, because a collapsible section is a data-family component, not a per-surface shape.
  'card.css': ['card', 'kv', 'section', 'table'],
  'meter.css': ['meter', 'shimmer'],
  // `error` and `notice` are the inline message lines a form ends with, one tone each. They sit
  // beside `.field-error` and `.field-hint`, which is the family they belong to; `.alert` is the
  // boxed message with a rail, and these are one line of coloured text under a control.
  'form.css': ['input', 'select', 'textarea', 'field', 'switch', 'code', 'error', 'notice'],
  'alert.css': ['alert', 'empty', 'toast'],
  // 'menu' rides with the overlay family rather than taking a file of its own: a menu is the same
  // floating language as a pill and a window, and D88 folds sprint 3 entry 10's surface in here.
  'overlay.css': ['ov', 'hud', 'xp-drop', 'window', 'menu'],
  'strip.css': ['icon-strip', 'strip'],
  'tab.css': ['char-tab', 'char-tabs', 'seg', 'chip'],
  'icon.css': ['icon']
};

/** Per-surface geometry only. A layout file may position family classes but may not restyle one. */
export const LAYOUT_DIR = 'layout';

/**
 * Library part 2: every family stylesheet has a styleguide section, and
 * `styleguide.families.test.ts` proves it. A family added without an entry here fails that test
 * before it fails a reviewer, which is the whole point: a component that is not on the styleguide
 * does not exist.
 */
export const STYLEGUIDE_SECTIONS: Record<string, string> = {
  'button.css': 'buttons',
  'badge.css': 'badges',
  'card.css': 'data',
  'meter.css': 'data',
  'form.css': 'forms',
  'alert.css': 'alerts',
  'overlay.css': 'overlay',
  'strip.css': 'navigation',
  'tab.css': 'navigation',
  'icon.css': 'icons'
};

/** Library part 3: the five vendored demo cards, used as the variant checklist (plan ruling R26). */
export const CARD_FAMILIES = ['core', 'data', 'forms', 'navigation', 'overlay'] as const;
