---
name: idlescape-design
description: Use when designing or building any idlescape shell UI - panels, windows, canvas overlays, the co-pilot bar, or throwaway mocks and prototypes. Holds the brand guide, design tokens, and the component library that every surface composes from. Use it before writing UI markup or CSS, not after.
user-invocable: true
---

# idlescape design system

The design language of **idlescape** - a browser-playable 2004-era RuneScape shell with a Claude
co-pilot. This skill is the front door to it; the system itself lives in the repository at
`docs/design/idlescape-shell-v2/`.

## Read first

- `docs/design/idlescape-shell-v2/design-system-readme.md` - the brand guide: content voice,
  visual foundations, iconography rules.
- `docs/design/idlescape-shell-v2/README.md` - the handoff: what every screen and surface is, the
  token layer, and the static implementation each component maps to.
- `docs/design/idlescape-shell-v2/Idlescape Shell v2.dc.html` - **the source of truth for every
  literal value.** All styles are inline. When a number is in question, it is the answer.

## Then, per component

`docs/design/idlescape-shell-v2/components/<group>/<Name>.{jsx,d.ts,prompt.md}` - reference
implementation, props, and usage. Each group's `*.card.html` is its visual regression reference.

## Rules that are not negotiable

- **No React.** The bundled `.jsx` files are specifications only; the design-system tooling that
  produced them requires React, and this project does not use it. Production code is Vite plus
  vanilla TypeScript: panels built with `h()` (`web/src/ui/el.ts`) or `innerHTML` templates,
  token-driven plain CSS in `web/src/styles/*.css`, every file under 400 lines.
- **Compose the library; do not extend it locally.** A new panel uses the existing class families.
  If a surface genuinely needs something the library lacks, add it to the library and its
  styleguide entry in the same change - never as a per-panel one-off style.
- **The product is called idlescape**, lowercase in UI strings, titles and wordmarks.
- **`localStorage` keys keep the `cs.` prefix.** Renaming one silently resets player state.
- **One focus ring**, the orange `0 0 0 3px rgba(255,152,31,.18)`. Motion is off under
  `prefers-reduced-motion`.
- **A component that is not on the styleguide does not exist.** Every class family in
  `web/src/styles/` has a section in `web/styleguide.html` demonstrating every variant, and
  `web/src/styleguide.families.test.ts` fails when one does not. Eight Playwright baselines
  (`web/e2e/styleguide.pw.test.ts`) fail when a token change moves a component.

## Working modes

**Production code** - read the rules above, work in `web/`, and add every new component to
`web/styleguide.html` so the library stays browsable.

**Mocks and prototypes** - copy the assets out and write static HTML the user can open directly.
Do not wire them into `web/`.

If invoked with no other guidance, ask what is being built, ask the questions a designer would,
then produce either HTML artifacts or production code depending on the need.
