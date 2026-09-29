# idlescape design system

The design language of **idlescape** - a browser-playable 2004-era RuneScape shell with a Claude
co-pilot that can drive your character alongside you. The shell wraps a pixel-exact 2004 game
canvas (789x532 iframe, never restyled) in modern, dense, dark tool chrome: RuneLite lineage,
pushed ~60% toward a modern dev-tool aesthetic.

## Sources
- `uploads/panel-ui-brief.md` - the original idlescape panel-UI brief (tokens, rules, file map).
- `uploads/panel-layout.html` - static copy of the pre-redesign frame + real CSS.
- `uploads/screenshots/` - the live pre-redesign UI.
- `Idlescape Shell v2.dc.html` (project root) - **the living reference mock** this system codifies.

## Content fundamentals
- **Sentence case everywhere.** Buttons, titles, labels: "Run a script", "Open bank window".
- **Words do one job and name the action**: "Revoke" produces "Revoked". No marketing verbs.
- **Matter-of-fact, quietly playful in empty states**: "Nothing looted yet ... or as Claude plays for you."
- Second person for the player ("you took control"); Claude is named plainly ("Claude started Chop and drop").
- Numbers are load-bearing: always tabular, always exact ("1,290 xp to lvl 35 - 52 actions").
- Separator is the middot: `14:07 · 4,180 xp · 41 logs`.
- **No emoji.** Ever. Unicode glyphs only as data (∞ bank tab), never as icons.

## Visual foundations
- **Ground**: near-black neutral greys, barely warm (#111112 -> #232325 ramp). The game canvas is
  the only saturated thing on screen; chrome stays quiet.
- **One accent**: orange #ff981f. It means "current thing / main action / Claude is driving".
  Nothing else is orange. Semantic green/amber/red/blue are reserved for status.
- **Type, three voices**: system UI stack at 10-14px for tool chrome; bold ui-monospace for every
  digit (timers, counters, xp, item counts - chosen over pixel fonts for digit legibility);
  Pixelify Sans only for the wordmark and canvas captions (the game voice).
- **Section labels**: 9.5px, uppercase, 650 weight, .09em tracking, muted grey.
- **Cards**: #232325 (or a 180deg two-stop gradient), 1px rgba(255,255,255,.06) hairline, 8px radius,
  soft drop shadow; 3px left rail in a tone when stateful (active character, live run).
- **Borders**: hairlines are white-alpha on raised surfaces, black-alpha (rgba(0,0,0,.55)) between
  chrome regions. Never pure #000 lines inside cards.
- **Radii**: 3px canvas pills / 5-6px controls / 7px segmented containers / 8px cards / 10px windows.
- **Buttons**: rest #2e2e2d, hover #3a3a38 + 1px lift; primary is an orange 180deg gradient with
  dark-brown text (#1c1300) and an orange glow shadow that widens on hover.
- **Focus**: orange border + 3px rgba(255,152,31,.18) ring on inputs; never default blue.
- **Overlays over the game**: black scrim rgba(0,0,0,.62), 1px tone-tinted border, 3px radius,
  bold mono, backdrop-blur(2px). All canvas-floating UI speaks this one pill language.
- **Motion answers actions only**: .13s ease on controls; fadeUp .18s on panel switch; popIn .18s
  on windows; shimmer on live XP bars; barflow gradient under the co-pilot bar while running;
  floatUp 2.6s for OSRS-style xp drops. Everything off under prefers-reduced-motion.
- **Transparency + blur** only over the game canvas, never inside panels.
- **Density**: 280px side panel, 12px body type, 10px paddings; hit targets >=22px.
- **Gamified moments**: shimmering XP progress, level chips, live tick counters, xp drops with
  a black-outlined white number and a skill chip - joy through feedback, not decoration.

## Iconography
- One drawn set: 16x16 inline SVG, currentColor, 1.5px stroke, geometric (play, spark, chart,
  coin, pulse, lines, camera, bank, people, grid, sliders). Shipped as the `Icon` component -
  never emoji, never mixed families.
- Item icons (bank slots) are rasterized from the game cache in production; mocks hot-link
  oldschool.runescape.wiki inventory icons as placeholders - flag them as such.
- **No logo asset exists**: the wordmark is plain Pixelify Sans type in accent orange. Do not
  draw a mark.

## Index
- `styles.css` -> `tokens/` (colors, typography, spacing, motion, base).
- `components/core/` - Button, Badge, Tag, StatusDot, Alert, SectionLabel, Icon.
- `components/forms/` - Input, Select, Textarea, Checkbox, Segmented.
- `components/data/` - Card, KV, Meter.
- `components/overlay/` - OverlayPill, HudPill.
- `components/navigation/` - StripButton, CharTab.
- `guidelines/` - foundation specimen cards.
- `Idlescape Shell v2.dc.html` - full-frame interactive reference (Design Component, not a UI-kit jsx).

## Intentional additions
- `Icon` - wraps the drawn strip glyph set so consumers never hand-roll SVGs.
