import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const partial = (f: string) => readFileSync(resolve(__dirname, 'partials', f), 'utf8');
const style = (f: string) => readFileSync(resolve(__dirname, 'styles', f), 'utf8');
// Comments come out first, and that is not tidiness: both stylesheets this file reads open with a
// header quoting the very declaration these cases assert, so a width that went back to a literal
// would still match out of the prose above the rule and the case would pass on nothing.
const baseRule = (css: string, selector: string): string => {
  const match = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css.replace(/\/\*[\s\S]*?\*\//g, ''));
  return match?.[1] ?? '';
};

describe('wiki links', () => {
  test('title bar links to /wiki in a new tab with rel=noopener', () => {
    document.body.innerHTML = partial('frame.html');
    const a = document.querySelector<HTMLAnchorElement>('.frame-title a.title-link')!;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('/wiki');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener');
    expect(a.textContent?.trim()).toBe('Wiki');
    // grouped with the brand in .title-left so the centre text stays centred
    expect(a.parentElement?.classList.contains('title-left')).toBe(true);
    expect(a.previousElementSibling?.classList.contains('brand')).toBe(true);
  });
  // SPW landed this link on the retired entry.html; the entry-screen retrofit replaced that
  // screen with home.html, so the link lives among the home choices now.
  test('home card links to /wiki among the choices', () => {
    document.body.innerHTML = partial('home.html');
    const a = document.querySelector<HTMLAnchorElement>('#screen-home #home-choices a.wiki-link')!;
    expect(a).not.toBeNull();
    expect(a.getAttribute('href')).toBe('/wiki');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener');
    expect(a.getAttribute('title')).toBe('Browse the wiki');
  });
  test('wiki links have no default underline', () => {
    const frameCss = style('layout/frame.css');
    expect(baseRule(frameCss, '.title-link')).toContain('text-decoration: none');
    expect(baseRule(style('layout/panels.css'), '.wiki-link')).toContain('text-decoration: none');
    // base.css has `a:hover { text-decoration: underline }` at (0,1,1), which outranks the
    // .title-link base rule at (0,1,0) -- so the hover rule must restate it, or the title-bar
    // link underlines on hover where develop's did not.
    const hover = /\.title-link:hover\s*\{([^}]*)\}/.exec(frameCss)?.[1] ?? '';
    expect(hover).toContain('text-decoration: none');
  });
});

describe('the frame chrome', () => {
  test('the side panel carries a pinned-tracker host above its header and a Pin button in it', () => {
    document.body.innerHTML = partial('frame.html');
    const panel = document.querySelector('#side-panel')!;
    // Order matters: the mock draws the pinned card ABOVE the panel header, inside the panel.
    expect(panel.firstElementChild?.id).toBe('pinned-tracker');
    expect(panel.querySelector('#pinned-tracker')?.classList.contains('hidden')).toBe(true);
    const header = panel.querySelector('.panel-header')!;
    const ids = [...header.children].map(c => c.id);
    expect(ids).toEqual(['panel-icon', 'panel-title', 'panel-pin', 'panel-back']);
    expect(panel.getAttribute('aria-live')).toBe('polite');
  });

  // Both header controls are the library's, not one-offs: `.panel-back` left layout/frame.css in
  // the same step, so a demoted class list here renders an unstyled button rather than failing.
  test('the panel header controls are composed from the button family', () => {
    document.body.innerHTML = partial('frame.html');
    expect(document.querySelector('#panel-back')!.className).toBe('btn btn-icon btn-icon-lg');
    expect(document.querySelector('#panel-pin')!.className).toBe('btn btn-outline btn-quiet hidden');
    expect(document.querySelector('#panel-back')!.getAttribute('aria-label')).toBe('Close panel');
    expect(style('layout/frame.css')).not.toContain('.panel-back');
  });

  test('the frame keeps its 28px title bar and 21px footer as tokens, not literals', () => {
    const css = style('layout/frame.css');
    expect(baseRule(css, '.frame-title')).toContain('height: var(--title-h)');
    expect(baseRule(css, '.frame-foot')).toContain('height: var(--foot-h)');
    expect(baseRule(css, '.side-panel')).toContain('width: var(--panel-w)');
    // .icon-strip lives in strip.css, not layout/frame.css: Task 2's split routes it there and
    // Task 8 Step 3 writes it there. baseRule returns '' for a selector it cannot find, so reading
    // the wrong file fails with an empty-string diff that says nothing.
    expect(baseRule(style('strip.css'), '.icon-strip')).toContain('width: var(--strip-w)');
  });
});
