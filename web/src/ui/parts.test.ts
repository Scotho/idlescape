// web/src/ui/parts.test.ts -- the component library's builders. Every case reads a class list or
// an attribute, never a pixel: jsdom has no layout, and the geometry these classes carry is
// pinned by styles.test.ts and by the Playwright baselines Task 21 takes of the styleguide.
import { beforeEach, describe, expect, it } from 'vitest';
import { h } from './el';
import { card, chip, dot, emptyState, hudPill, menu, meter, pill, sectionLabel, segmented, tag } from './parts';
import { EVENTS_EMPTY_COPY, LOOT_EMPTY_COPY } from './copy';

beforeEach(() => { document.body.innerHTML = ''; });  // setupDom runs once per FILE, not per test

describe('sectionLabel', () => {
  it('is a span carrying the family class and the text', () => {
    const el = sectionLabel('Run snippet');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toBe('section-label');
    expect(el.textContent).toBe('Run snippet');
  });
});

describe('tag', () => {
  it('has no tones: a tag is not a status', () => {
    expect(tag('woodcutting').className).toBe('tag');
  });

  it('is a span carrying its text', () => {
    const el = tag('woodcutting');
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('woodcutting');
  });
});

describe('dot', () => {
  it('defaults to the idle tone with no modifiers and is hidden from assistive tech', () => {
    const el = dot();
    expect(el.className).toBe('dot');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
  it('adds one class per tone and per modifier, and nothing else', () => {
    expect(dot('ok').className).toBe('dot dot-ok');
    expect(dot('accent', { pulse: true, glow: true }).className).toBe('dot dot-accent dot-pulse dot-glow');
    // Mutation target: emitting `dot-idle` for the DEFAULT must fail this. The default idle grey
    // is --text-faint (#575755), which the char-tab offline dot and the Claude session rows want.
    expect(dot('idle').className).toBe('dot');
  });
  it('emits dot-idle only when the caller asks for the mock\'s lighter #666 idle', () => {
    // map-design 3.3: the co-pilot bar's unpaired dot is #666, not #575755. Two idle greys exist
    // in the mock and the family needs both, so the second one is opt-in.
    expect(dot('idle', { explicit: true }).className).toBe('dot dot-idle');
  });
  it('sets a custom size as an inline width and height, in px', () => {
    const el = dot('ok', { size: 7 });
    expect(el.style.width).toBe('7px');
    expect(el.style.height).toBe('7px');
    // The default takes its 8px from the class, not from an inline style.
    expect(dot('ok').style.width).toBe('');
  });
});

describe('segmented', () => {
  const OPTIONS = [{ value: 'my', label: 'My tasks' }, { value: 'market', label: 'Marketplace' }];

  it('renders one button per option and marks exactly the selected one', () => {
    const el = segmented(OPTIONS, 'market', () => {});
    const btns = [...el.querySelectorAll('button')];
    expect(btns.map(b => b.textContent)).toEqual(['My tasks', 'Marketplace']);
    expect(btns.map(b => b.classList.contains('active'))).toEqual([false, true]);
    // Mutation target: dropping aria-pressed leaves a control with no announced state.
    expect(btns.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
  });

  it('is a group of type=button controls, each tagged with its own value', () => {
    const el = segmented(OPTIONS, 'my', () => {});
    expect(el.className).toBe('seg');
    expect(el.getAttribute('role')).toBe('group');
    const btns = [...el.querySelectorAll('button')];
    // Mutation target: dropping type="button" makes every tab submit the form it sits in, and
    // the Automation panel's tabs sit above a snippet form.
    expect(btns.map(b => b.getAttribute('type'))).toEqual(['button', 'button']);
    expect(btns.map(b => b.dataset.seg)).toEqual(['my', 'market']);
    expect(btns.map(b => b.className)).toEqual(['seg-btn active', 'seg-btn']);
  });

  it('reports the clicked value and does not repaint itself', () => {
    const seen: string[] = [];
    const el = segmented(OPTIONS, 'my', v => seen.push(v));
    el.querySelectorAll('button')[1].click();
    expect(seen).toEqual(['market']);
    // The owner re-renders; the control does not guess. Its own classes are unchanged.
    expect(el.querySelectorAll('button')[1].classList.contains('active')).toBe(false);
  });

  it('does not fire for a click on the option that is already selected', () => {
    const seen: string[] = [];
    const el = segmented(OPTIONS, 'my', v => seen.push(v));
    el.querySelectorAll('button')[0].click();
    expect(seen).toEqual([]);
  });
});

describe('chip', () => {
  it('is a toggle with aria-pressed mirroring the active class', () => {
    const on = chip('XP', true, () => {});
    expect(on.className).toBe('chip active');
    expect(on.getAttribute('aria-pressed')).toBe('true');
    expect(chip('Loot', false, () => {}).className).toBe('chip');
  });
  it('is a type=button control carrying its label', () => {
    const el = chip('Loot', false, () => {});
    expect(el.tagName).toBe('BUTTON');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.textContent).toBe('Loot');
    expect(el.getAttribute('aria-pressed')).toBe('false');
  });
  it('fires on every click, including one that turns it off', () => {
    let n = 0;
    const el = chip('XP', true, () => { n++; });
    el.click(); el.click();
    expect(n).toBe(2);
  });
});

describe('card', () => {
  it('is a plain card with no rail by default', () => {
    expect(card({}, 'body').className).toBe('card');
  });
  it('adds the rail and hero modifiers, and any caller class last', () => {
    // Order is the contract, not an accident: `.card-hero` restates the border colour `.card`
    // set, and a caller class has to be able to beat both, which only source order gives it at
    // equal specificity.
    expect(card({ rail: 'accent', hero: true, class: 'run-card' }).className).toBe('card card-hero card-rail-accent run-card');
  });
  it('appends its children in order', () => {
    const el = card({}, h('b', {}, 'Chop and drop'), null, 'v1');
    expect(el.childNodes.length).toBe(2);   // the null is skipped, not rendered as "null"
    expect(el.textContent).toBe('Chop and dropv1');
  });
});

describe('meter', () => {
  it('writes the percentage as an inline width on the fill, clamped to 0..100', () => {
    expect((meter(64).firstElementChild as HTMLElement).style.width).toBe('64%');
    expect((meter(-5).firstElementChild as HTMLElement).style.width).toBe('0%');
    expect((meter(140).firstElementChild as HTMLElement).style.width).toBe('100%');
  });
  it('is a presentational track with an accent fill by default', () => {
    const el = meter(50);
    expect(el.className).toBe('meter');
    expect((el.firstElementChild as HTMLElement).className).toBe('meter-fill');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });
  it('takes a tone and a shimmer', () => {
    const el = meter(31, { tone: 'hp', shimmer: true });
    expect((el.firstElementChild as HTMLElement).className).toBe('meter-fill meter-hp shimmer');
  });
  it('names the accent tone nowhere, because the bare fill already is it', () => {
    // Mutation target: dropping the `!== 'accent'` guard emits `.meter-fill meter-accent`, which
    // no stylesheet defines, so the default meter would render as an empty track.
    expect((meter(20, { tone: 'accent' }).firstElementChild as HTMLElement).className).toBe('meter-fill');
  });
  // The one tone with no HUD colour behind it: `flat` is the accent at a single stop, which the
  // bank capacity bar wants and the three-stop gradient cannot give it. It is a class like the
  // other three, so a guard that special-cased it the way `accent` is special-cased, or a
  // signature that left it out, would strand the `.meter-flat` rule with no way to reach it.
  it('emits the flat tone as a class, unlike accent', () => {
    expect((meter(11, { tone: 'flat' }).firstElementChild as HTMLElement).className).toBe('meter-fill meter-flat');
  });
});

describe('pill', () => {
  it('is accent-toned by default and mono', () => {
    expect(pill('Woodcutting · 24,180 xp/h').className).toBe('ov-pill ov-pill-accent');
  });

  it('is a span carrying its text as text, never as markup', () => {
    const el = pill('● not paired', 'neutral');
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('● not paired');
  });

  // Unlike `dot()` and `meter()`, the default tone names itself: `.ov-pill` alone is the neutral
  // grey border with `--text`, so a bare accent pill would render as the neutral one.
  it('names every tone, the default included', () => {
    for (const tone of ['accent', 'ok', 'warn', 'error', 'neutral'] as const) {
      expect(pill('x', tone).className).toBe(`ov-pill ov-pill-${tone}`);
    }
  });

  it('takes a tone and the larger corner geometry', () => {
    expect(pill('● not paired', 'neutral', { corner: true }).className).toBe('ov-pill ov-pill-neutral ov-pill-corner');
  });
});

describe('hudPill', () => {
  it('renders label, bar and value, and names the meter for assistive tech', () => {
    const el = hudPill('hp', 78, '14/18');
    expect(el.querySelector('.hud-label')?.textContent).toBe('HP');
    expect((el.querySelector('.hud-fill') as HTMLElement).style.width).toBe('78%');
    expect(el.querySelector('.hud-value')?.textContent).toBe('14/18');
    // The bar is decoration; the pill as a whole is what gets announced.
    expect(el.getAttribute('aria-label')).toBe('HP 14/18');
    expect(el.querySelector('.hud-bar')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the design labels, not the meter keys', () => {
    expect(hudPill('prayer', 40, '4/10').querySelector('.hud-label')?.textContent).toBe('PRAY');
    expect(hudPill('run', 62, '62').querySelector('.hud-label')?.textContent).toBe('RUN');
  });

  // It composes `.ov-pill` rather than restating the scrim, the blur and the radius: that is the
  // whole of what "everything floating is an OverlayPill" means in CSS.
  it('is an overlay pill with the meter\'s own class on it', () => {
    expect(hudPill('run', 62, '62').className).toBe('ov-pill hud-pill hud-pill-run');
    expect((hudPill('prayer', 40, '4/10').querySelector('.hud-fill') as HTMLElement).className)
      .toBe('hud-fill hud-fill-prayer');
  });

  it('clamps the percentage to 0..100, because a meter reads current over max', () => {
    expect((hudPill('hp', -8, '0/18').querySelector('.hud-fill') as HTMLElement).style.width).toBe('0%');
    expect((hudPill('hp', 140, '20/18').querySelector('.hud-fill') as HTMLElement).style.width).toBe('100%');
  });
});

describe('menu', () => {
  const ITEMS = () => [
    { label: 'Mute this character', onSelect: () => {} },
    { label: 'Log out', onSelect: () => {}, disabled: true }
  ];

  it('is a role=menu of role=menuitem buttons', () => {
    const el = menu(ITEMS());
    expect(el.className).toBe('menu');
    expect(el.getAttribute('role')).toBe('menu');
    const items = [...el.querySelectorAll('button')];
    expect(items.map(b => b.textContent)).toEqual(['Mute this character', 'Log out']);
    expect(items.map(b => b.getAttribute('role'))).toEqual(['menuitem', 'menuitem']);
    // Mutation target: dropping type="button" makes every item submit the form it sits in.
    expect(items.map(b => b.getAttribute('type'))).toEqual(['button', 'button']);
    expect(items.map(b => b.className)).toEqual(['menu-item', 'menu-item']);
  });

  it('marks a disabled item disabled and leaves every other one alone', () => {
    const items = [...menu(ITEMS()).querySelectorAll('button')];
    expect(items.map(b => b.disabled)).toEqual([false, true]);
  });

  it('fires the live item and never the disabled one', () => {
    const seen: string[] = [];
    const el = menu([
      { label: 'Mute this character', onSelect: () => seen.push('mute') },
      { label: 'Log out', onSelect: () => seen.push('out'), disabled: true }
    ]);
    const items = [...el.querySelectorAll('button')];
    items[1].click();
    expect(seen).toEqual([]);
    items[0].click();
    expect(seen).toEqual(['mute']);
  });
});

describe('emptyState', () => {
  it('composes mark, title, copy and the action, in that order', () => {
    const btn = h('button', { class: 'btn btn-primary btn-cta' }, 'Run a script');
    const el = emptyState('◌', 'Nothing looted yet', LOOT_EMPTY_COPY, btn);
    expect(el.className).toBe('empty-state');
    expect([...el.children].map(c => c.className))
      .toEqual(['empty-state-mark', 'empty-state-title', 'empty-state-copy', 'btn btn-primary btn-cta']);
    expect(el.querySelector('.empty-state-mark')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.empty-state-copy')?.textContent).toBe(LOOT_EMPTY_COPY);
  });

  it('renders three children and not a stray null when there is no action', () => {
    expect(emptyState('◌', 'Nothing yet', 'copy').children.length).toBe(3);
  });

  it('compact is a modifier on the same element, not a second component', () => {
    // Mutation target: returning a different class name for compact means layout/events.css
    // would need its own empty-state rules, which is the one-off this library exists to prevent.
    const el = emptyState('⌕', 'No events match', EVENTS_EMPTY_COPY, null, { compact: true });
    expect(el.className).toBe('empty-state compact');
    expect(el.querySelector('.empty-state-mark')?.textContent).toBe('⌕');
  });
});
