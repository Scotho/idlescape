// web/src/styles/cascade.test.ts -- what the browser actually applies, not what the files say.
//
// styles.test.ts polices where a rule lives; this file polices what wins. The split moved rules
// between files without changing one declaration, but it changed their order, and two rules at
// equal specificity are decided by order alone. Three pairs in this layer are load-bearing on it,
// and each is a real class combination the shell emits. Task 3 retired the `.p-` dialect, so the
// two dialect-only cases are gone and the three pairs are read in the v2 spelling that survived.
// The builder-shaped half of this file, the cases that construct what a `ui/parts.ts` builder
// returns rather than a class list, is cascade.builders.test.ts; both load the same harness.
//
// jsdom has no layout, so nothing here is a pixel measurement: `getComputedStyle` returns the
// declared value the cascade selected, which is exactly the thing under test. `var()` is not
// resolved under jsdom, so every assertion below names a literal the stylesheets state directly.
//
// One limit worth stating, because it bounds what this file may claim: jsdom resolves competing
// declarations by source order alone and does not weigh specificity. `.kv .input { width: auto }`
// in card.css loses to `.input { width: 100% }` in form.css here and would win in a browser. So
// every case below is an ORDER claim, which is the thing the split actually changed; a claim that
// rests on specificity belongs in a Playwright spec and is not asserted here.
import { beforeAll, describe, expect, it } from 'vitest';
import { computed, importOrder, loadCascade, read } from './cascade.harness';

// The whole data URI, so "the icon is drawn" is a literal and not a substring guess. The two
// strokes are `--text-muted` #7c7c7a: Task 5's v2 conversion retoned the glyph off the legacy
// #808080, and a data URI cannot read a token, so the hex is spelled out in both places.
const MAGNIFIER =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' " +
  "viewBox='0 0 12 12'><circle cx='5' cy='5' r='3.5' fill='none' stroke='%237c7c7a' " +
  "stroke-width='1.5'/><path d='M8 8l3 3' stroke='%237c7c7a' stroke-width='1.5'/></svg>\")";

beforeAll(() => {
  expect(importOrder().length, 'index.css declared no imports').toBeGreaterThan(0);
  loadCascade();
});

describe('the split kept what the browser applies', () => {
  // `.input-search`'s indent and icon sit in the same form.css rule as `.input`'s `padding` and
  // `background` shorthands and come after them, which is the whole of why the search chrome
  // survives; the dialect's copy of `.input` used to be imported later still and reset both, which
  // is what Task 2 had to restate and Task 3 deleted with the emitter. Task 20 took the class off
  // the Plugins panel's search box (the mock's is plain, map-design 3.18), so the styleguide's
  // `#forms` demo is the one call site left and this pair is what keeps the class honest.
  it('the search box keeps its 26px indent and its magnifier', () => {
    const cs = computed('input', 'input input-search');
    expect(cs.paddingLeft).toBe('26px');
    expect(cs.backgroundRepeat).toBe('no-repeat');
    expect(cs.backgroundPosition).toBe('8px center');
    // Task 5 put the family on the v2 tokens, and jsdom hands a `var()` back unresolved. That is
    // still the order claim this case makes: `.input`'s own height and type survive the search
    // rule that follows them, and their VALUES are pinned by tokens.test.ts, not here.
    expect(cs.height).toBe('var(--ctl-h)');
    expect(cs.fontSize).toBe('var(--fs-base)');
  });

  // jsdom's computed style drops a `background-image` this long, so the case above proves the
  // indent and the icon's placement and this one proves the icon. The three declarations travel
  // in one rule, so a placement that applies is an icon that applies.
  it('the search rule draws the magnifier', () => {
    expect(read('form.css')).toContain(MAGNIFIER);
  });

  // connect.ts:155 emits `class="kv session-row"`. card.css must be imported before layout/ or
  // `.kv { display: flex }` takes the row back off the grid.
  it('a paired session row is a grid, not the flex key/value row', () => {
    expect(computed('div', 'kv session-row').display).toBe('grid');
  });

  // Both snippet boxes emit `class="textarea code snippet-code"`. Same order, same reason: the
  // family draws the mock's code box and the layout file sizes it. Task 15 moved them off the
  // `textarea.input` compound, which is two of the eleven that compound was left for.
  it('a snippet textarea keeps the taller code box', () => {
    const cs = computed('textarea', 'textarea code snippet-code');
    expect(cs.minHeight).toBe('36px');
    expect(cs.lineHeight).toBe('1.25');
    expect(cs.fontFamily).toBe('var(--font-num)');
    // No height at all, which is what a textarea needs: `.textarea` never took the component's
    // 27px, so both boxes (rows=2 and rows=12) size themselves off their row count.
    expect(cs.height).toBe('');
  });

  // The other half of the dialect was its descendant rules: selectors that reach from a layout
  // class into a key/value row's children and override the family rule that just styled them.
  // They are renamed into layout/panels.css now, and the cascade still has to let them win.
  it('the rows that reach into a key/value row still override it', () => {
    const stack = computed('div', 'kv kv-stack');
    expect(stack.flexDirection).toBe('column');
    expect(stack.gap).toBe('2px');

    // card.css right-aligns a `.kv-value`; the session grid puts it in the name cell, left.
    const session = document.createElement('div');
    session.className = 'kv session-row';
    const label = document.createElement('span');
    label.className = 'kv-value';
    session.appendChild(label);
    document.body.appendChild(session);
    expect(getComputedStyle(label).textAlign).toBe('left');

    // The cap the next two assertions are about: card.css gives a control in a key/value row the
    // value's half of the row rather than the row's full width, on the input and on the select.
    const plain = document.createElement('div');
    plain.className = 'kv';
    const capped = document.createElement('input');
    capped.className = 'input';
    const cappedSelect = document.createElement('select');
    cappedSelect.className = 'input';
    plain.append(capped, cappedSelect);
    document.body.appendChild(plain);
    expect(getComputedStyle(capped).maxWidth).toBe('55%');
    expect(getComputedStyle(cappedSelect).maxWidth).toBe('55%');

    // card.css caps a control in a key/value row at 55%; the pairing link takes the whole row.
    // Task 20 moved that row off `.kv` onto its own `.connect-url-row`, because the card's first
    // child is the heading now and `:first-child` had been doing the selecting.
    const card = document.createElement('div');
    card.className = 'card card-hero connect-card';
    const row = document.createElement('div');
    row.className = 'connect-url-row';
    const url = document.createElement('input');
    url.className = 'input input-sm mono';
    row.appendChild(url);
    card.appendChild(row);
    document.body.appendChild(card);
    expect(getComputedStyle(url).maxWidth).toBe('none');
    expect(getComputedStyle(url).flex).toBe('1 1 0%');
  });

  // The dialect's `p-setting` block was per-surface geometry wearing a family prefix; Task 3 sent
  // it to layout/panels.css, where the caption is the library's `.field-label` and the `flex: 1`
  // that used to ride on every prefixed caption is scoped to this row.
  it('a plugin settings row keeps its caption flexible and its control capped', () => {
    const row = document.createElement('label');
    row.className = 'setting-row';
    const caption = document.createElement('span');
    caption.className = 'field-label';
    const control = document.createElement('input');
    control.className = 'input';
    row.append(caption, control);
    document.body.appendChild(row);
    expect(getComputedStyle(row).minHeight).toBe('24px');
    expect(getComputedStyle(caption).flex).toBe('1 1 0%');
    expect(getComputedStyle(control).maxWidth).toBe('50%');
  });

  // The trace window's filter input (Task 16). It takes the rest of the header row after the
  // title, the script and the two controls, and `layout/trace.css` is imported after form.css,
  // which is the whole of why the surface's `flex` beats `.input`'s own `width: 100%`.
  it('the trace filter fills what is left of the window header', () => {
    const win = document.createElement('div');
    win.className = 'window window-docked trace-window';
    const input = document.createElement('input');
    input.className = 'input input-quiet';
    win.appendChild(input);
    document.body.appendChild(win);
    expect(getComputedStyle(input).flex).toBe('1 1 0%');
    expect(getComputedStyle(input).minWidth).toBe('0');
    // The height comes from the form family's `.input-quiet`, not from this surface: the window
    // header's control size is a token (24px), and layout/trace.css must not restate it.
    expect(getComputedStyle(input).height).toBe('var(--ctl-h-tiny)');
  });

  // The Copy for Claude button beside it. The mock's window header is one row of 24px controls,
  // and `.btn-tiny` is the family's name for that size: without it the button is `.btn`'s 27px
  // and the header grows 3px taller than the close and the filter beside it.
  it('the window header text button is the 24px btn-tiny, not the bar height', () => {
    const button = document.createElement('button');
    button.className = 'btn btn-tiny';
    document.body.appendChild(button);
    expect(getComputedStyle(button).height).toBe('var(--ctl-h-tiny)');
    expect(getComputedStyle(button).fontSize).toBe('var(--fs-small)');
  });

  // The host is a full-cover layer over the canvas. It has to be transparent to clicks or the
  // game underneath stops taking any, and the window itself has to take them back.
  it('the trace host is click-through and the window inside it is not', () => {
    const host = document.createElement('div');
    host.className = 'trace-host';
    const win = document.createElement('div');
    win.className = 'window window-docked trace-window';
    host.appendChild(win);
    document.body.appendChild(host);
    expect(getComputedStyle(host).pointerEvents).toBe('none');
    expect(getComputedStyle(win).pointerEvents).toBe('auto');
  });

  // settingsForm.ts:35 puts `.input` on a colour and a number control. Both typed rules sit AFTER
  // `.input { width: 100% }` in form.css, and that order is the whole of why a colour swatch is a
  // swatch and not a full-width bar; Task 2 moved them back into this file and could have landed
  // them above it. The row cap in layout/panels.css is the other half of the story and is a
  // specificity contest, which jsdom cannot adjudicate (see the header), so this case reads the
  // controls where the order claim is the only claim: the width the family file selected.
  it('a typed settings control keeps its own width over the family default', () => {
    expect(computed('input', 'input').width).toBe('100%');
    const colour = document.createElement('input');
    colour.type = 'color';
    colour.className = 'input';
    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'input';
    document.body.append(colour, number);
    expect(getComputedStyle(colour).width).toBe('40px');
    expect(getComputedStyle(colour).height).toBe('var(--ctl-h-tiny)');
    expect(getComputedStyle(number).width).toBe('72px');
  });

  // `.table` is two components sharing a name: the two-column grid the xp and loot trackers emit
  // on a `<div>`, and the real `<table>` the styleguide demonstrates. The grid's right-hand column
  // is `> :nth-child(even)`, and a `<table>`'s second element child is its `<tbody>`, so unscoped
  // that rule right-aligns every cell in a real table that `.num` did not already claim. Task 3
  // inherited the selector verbatim from `.p-table`, where it could never match a `<table>`.
  it('the even-child rule aligns the grid and leaves a real table alone', () => {
    const grid = document.createElement('div');
    grid.className = 'table';
    const first = document.createElement('span');
    first.className = 'kv-label';
    const second = document.createElement('span');
    second.className = 'kv-label';
    grid.append(first, second);
    document.body.appendChild(grid);
    expect(getComputedStyle(first).textAlign).toBe('');
    expect(getComputedStyle(second).textAlign).toBe('right');

    // styleguide.html:253's shape: thead first, tbody second, so the tbody is the even child.
    const table = document.createElement('table');
    table.className = 'table';
    const head = document.createElement('thead');
    const bodyEl = document.createElement('tbody');
    const row = document.createElement('tr');
    const skill = document.createElement('td');
    const level = document.createElement('td');
    level.className = 'num';
    row.append(skill, level);
    bodyEl.appendChild(row);
    table.append(head, bodyEl);
    document.body.appendChild(table);
    expect(getComputedStyle(bodyEl).textAlign).toBe('');
    expect(getComputedStyle(skill).textAlign).toBe('');
    expect(getComputedStyle(level).textAlign).toBe('right');
  });
});
