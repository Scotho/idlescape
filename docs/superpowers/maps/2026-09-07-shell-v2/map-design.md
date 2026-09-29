# Design bundle map: idlescape shell v2

Read at commit `19607b11dc7aead32aa7762f968bfb7fb7339656` on branch `sprint/dragon-slayer`.

Sources read in full:
- `docs/design/idlescape-shell-v2/README.md`
- `docs/design/idlescape-shell-v2/Idlescape Shell v2.dc.html` (679 lines, all styles inline)
- `docs/design/idlescape-shell-v2/styles.css`, `tokens/{colors,typography,spacing,motion,base}.css`
- `docs/design/idlescape-shell-v2/components/**/*.{jsx,d.ts,prompt.md,card.html}` (5 families, 20 components)
- `docs/design/idlescape-shell-v2/design-system-readme.md`, `PROVENANCE.md`
- `.claude/skills/idlescape-design/SKILL.md`
- `web/src/styles/tokens.css` and `web/src/styles/base.css` (the tokens being replaced)

The mock has **no `id=` attributes anywhere**. It is a Design Component template driven by
`{{ }}` bindings, `<sc-if>` and `<sc-for>`. Citations below use `data-screen-label` (nine of them)
plus the `sc-if` guard name and source line, which is the only stable handle the file offers.

The mock's `data-screen-label` inventory, with source lines:
`idlescape frame v2` (34), `Character tabs` (42), `Canvas column` (51), `Co-pilot bar` (53),
`Trace window` (117), `Bank window` (139), `Side panel` (171), `Pinned tracker` (173),
`Icon strip` (486). The `<header>` (36), the canvas stage (95), the panel header (183),
the panel body (192) and the `<footer>` (516) carry no label.

Prose in this document avoids em dashes. Strings quoted as mock copy are verbatim and several
of them do contain em dashes; see section 5, note S1.

---

## 1. Token table

`--x (bundle)` is the token as written in `docs/design/idlescape-shell-v2/tokens/*.css`.
`web/src/styles/tokens.css` today is 85 lines of RGB triplets named `--rl-*`, so
`rgb(var(--x))` and `rgba(var(--x), a)` both work at call sites. The bundle drops that
convention and writes hex plus enumerated alpha variants. README step 1 says to keep the
triplet convention where call sites demand it.

### 1.1 Surfaces

| Bundle token | Value | Existing token in web/src/styles/tokens.css | Relationship |
|---|---|---|---|
| `--ground` | `#111112` | `--rl-border: 17,17,17` (`#111111`) | replaces, +1 on blue |
| `--frame` | `#18181a` | none (nearest `--rl-window: 27,27,27` = `#1b1b1b`) | extends; `--rl-window` is the body background today |
| `--sunken` | `#141416` | none (nearest `--rl-darker: 30,30,30` = `#1e1e1e`) | new: inputs, wells, tab rails |
| `--bar` | `#1a1a1c` | none | new: headers, strips, footers |
| `--panel` | `#1e1e20` | `--rl-darker: 30,30,30` (`#1e1e1e`) | replaces |
| `--card` | `#232325` | `--rl-panel: 40,40,40` (`#282828`) | replaces, darker |
| `--card-grad` | `linear-gradient(180deg, #242426, #1f1f21)` | none | new |
| `--control` | `#2e2e2d` | `--rl-hover: 50,50,50` (`#323232`) | replaces |
| `--control-hover` | `#3a3a38` | `--rl-raised: 60,60,60` (`#3c3c3c`) | replaces |

### 1.2 Hairlines and edges (all new; nothing equivalent exists today)

| Bundle token | Value |
|---|---|
| `--hairline` | `rgba(255,255,255,.07)` |
| `--hairline-soft` | `rgba(255,255,255,.05)` |
| `--hairline-strong` | `rgba(255,255,255,.12)` |
| `--edge` | `rgba(0,0,0,.55)` |

The mock also uses, without a token: `rgba(255,255,255,.06)` (card borders, everywhere in the
side panel), `rgba(255,255,255,.09)` (default button border), `rgba(255,255,255,.08)` (window
borders, level chip), `rgba(255,255,255,.1)` (inactive event chip border), `rgba(255,255,255,.14)`
(HUD meter track), `rgba(0,0,0,.6)` (title bar bottom), `rgba(0,0,0,.5)` (panel header bottom,
window header bottom), `rgba(0,0,0,.7)` (canvas border), `rgba(0,0,0,.4)` / `rgba(0,0,0,.22)` /
`rgba(0,0,0,.24)` (bank internals). See note S6.

### 1.3 Text ramp

| Bundle token | Value | Existing | Relationship |
|---|---|---|---|
| `--text-strong` | `#e8e8e6` | `--rl-strong: 230,230,230` (`#e6e6e6`) | replaces |
| `--text` | `#b4b4b2` | `--rl-text: 176,176,176` (`#b0b0b0`) | replaces |
| `--text-muted` | `#7c7c7a` | `--rl-muted: 128,128,128` (`#808080`) | replaces |
| `--text-faint` | `#575755` | none | new |
| `--text-disabled` | `#4e4e4c` | none | new |

Untokenised text colour used repeatedly in the mock and in `Button.jsx`/`Tag.jsx`/`Badge.jsx`:
`#a0a09e` (outline button label, tag label, neutral badge, inactive char tab). `#9a9a98` for the
resting strip glyph. Neither is in `tokens/colors.css`.

### 1.4 Accent

| Bundle token | Value | Existing | Relationship |
|---|---|---|---|
| `--accent` | `#ff981f` | `--rl-orange: 255,152,31` | same colour, hex instead of triplet |
| `--accent-bright` | `#ffb95e` | none | new |
| `--accent-deep` | `#d6780a` | `--rl-orange-deep: 214,120,10` | same colour, hex |
| `--accent-grad` | `linear-gradient(180deg, #ffa63a, #f28c0e)` | none | new |
| `--on-accent` | `#1c1300` | none | new |
| `--accent-tint` | `rgba(255,152,31,.15)` | none | new |
| `--accent-glow` | `rgba(255,152,31,.28)` | none | new |

Accent alphas that appear in the mock but are not enumerated as tokens: `.35` (xp/h pill border,
wordmark glow, `::selection`, primary hover glow in cards), `.4` (pairing pill border, char-tab
shadow), `.45` (primary hover glow on bar-level buttons), `.16` (badge fill), `.25` (current quest
step, loot and bank primary resting shadow), `.07` (Alert accent tint, level event row background),
`.06` (bank slot hover), `.5` and `.6` (event chip borders), `.10` (`pulse` keyframe), `.18`
(focus ring), `.15` (segmented active, `stepPulse`).

### 1.5 Semantic tones

| Bundle token | Value | Existing | Relationship |
|---|---|---|---|
| `--ok` | `#43a047` | `--rl-ok: 67,160,71` | same colour, hex |
| `--ok-bright` | `#6ec873` | none | new |
| `--ok-pop` | `#7ddc84` | none | new |
| `--warn` | `#ffb300` | `--rl-warn: 255,179,0` | same colour, hex |
| `--error` | `#e53935` | `--rl-error: 229,57,53` | same colour, hex |
| `--danger` | `#a02828` | `--rl-danger: 160,40,40` | same colour, hex |
| `--danger-deep` | `#781c1c` | none | new |
| `--danger-hover` | `#b93030` | none | new |
| `--info` | `#4a90d9` | `--rl-info: 74,144,217` | same colour, hex |
| `--info-bright` | `#78afeb` | none | new |
| `--hp` | `#c0392b` | `--rl-hp: 192,57,43` | same colour, hex |
| `--hp-bright` | `#e05a4b` | none | new |
| `--prayer` | `#2980b9` | `--rl-prayer: 41,128,185` | same colour, hex |
| `--prayer-bright` | `#4aa3dc` | none | new |
| `--run` | `#27ae60` | `--rl-run: 39,174,96` | same colour, hex |
| `--run-bright` | `#43ca7e` | none | new |

Untokenised: `#f07370` (error badge text, `Badge.jsx`), `#2e7d32` (xp-drop skill chip),
`#ffff00` and `#00ff80` (bank item counts), `#2c2c2e` (meter track, event char badge),
`#3a3a38` used as a 1px rule colour in the run-card step connector, `#3e3e3c` (Esc kbd border),
`#4e4a44` (bank add-tab dashed border), `#33302c` / `#2c2925` / `#171513` (bank warm greys),
`#2a2a2c` (strip hover), `#1b1b1d` (char-tab bar and window header ground),
`#28282a` (active char tab gradient top), `#666` (unpaired co-pilot dot).

### 1.6 Semantic aliases and effects

| Bundle token | Value | Existing | Relationship |
|---|---|---|---|
| `--surface-page` | `var(--ground)` | none | new |
| `--surface-card` | `var(--card)` | none | new |
| `--text-body` | `var(--text)` | none | new |
| `--border-card` | `var(--hairline)` | none | new |
| `--focus-ring` | `0 0 0 3px rgba(255,152,31,.18)` | `0 0 0 2px rgb(var(--rl-window)), 0 0 0 4px rgb(var(--rl-orange))` | **replaces**: a two-ring offset halo becomes one soft 3px orange wash |
| `--overlay-scrim` | `rgba(0,0,0,.62)` | none | new |

### 1.7 Typography

`tokens/typography.css` opens with
`@import url('https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600&display=swap');`.
The mock instead uses `<link rel=preconnect>` to `fonts.googleapis.com` and `fonts.gstatic.com`
plus the same stylesheet link.

| Bundle token | Value | Existing | Relationship |
|---|---|---|---|
| `--font-ui` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | identical | unchanged |
| `--font-num` | `ui-monospace, Menlo, Consolas, monospace` | none | new; every digit in the UI |
| `--font-pixel` | `"Pixelify Sans", ui-monospace, monospace` | `"Pixelify Sans", "Press Start 2P", ui-monospace, monospace` | replaces; drops `Press Start 2P` |
| `--fs-label` | `9.5px` | none | new |
| `--fs-micro` | `10px` | `--fs-xs: 10px` | renames |
| `--fs-tiny` | `10.5px` | none | new |
| `--fs-small` | `11px` | `--fs-sm: 11px` | renames |
| `--fs-base` | `12px` | `--fs-base: 13px` | **same name, different value** |
| `--fs-md` | `12.5px` | `--fs-md: 12px` | **same name, different value** |
| `--fs-emph` | `13.5px` | none | new |
| `--fs-title` | `14.5px` | none | new |
| `--fs-brand` | `16px` | none | new |
| (dropped) | | `--fs-lg: 15px`, `--fs-xl: 18px`, `--fs-2xl: 24px` | no bundle equivalent |
| `--lh` | `1.45` | `--lh: 1.4` | **same name, different value** |
| (dropped) | | `--lh-tight: 1.2` | no bundle equivalent |
| `--label-tracking` | `.09em` | none | new |

### 1.8 Spacing, radii, control metrics

| Bundle token | Value | Existing | Relationship |
|---|---|---|---|
| `--sp-1` | `2px` | `--sp-1: 4px` | **same name, different value** |
| `--sp-2` | `3px` | `--sp-2: 8px` | **same name, different value** |
| `--sp-3` | `4px` | `--sp-3: 12px` | **same name, different value** |
| `--sp-4` | `6px` | `--sp-4: 16px` | **same name, different value** |
| `--sp-5` | `8px` | `--sp-5: 24px` | **same name, different value** |
| `--sp-6` | `10px` | `--sp-6: 32px` | **same name, different value** |
| `--sp-7` | `12px` | none | new |
| `--sp-8` | `14px` | none | new |
| `--r-pill-sm` | `3px` | `--radius: 2px` | replaces (canvas pills) |
| `--r-ctl` | `6px` | `--radius-lg: 4px` | replaces (buttons, inputs) |
| `--r-seg` | `7px` | none | new; segmented container, inner button `5px` |
| `--r-card` | `8px` | none | new |
| `--r-window` | `10px` | none | new |
| `--r-badge` | `10px` | none | new (`Badge.jsx` actually renders `9`; `Tag.jsx` renders `8`) |
| `--ctl-h-xs` | `22px` | none | new |
| `--ctl-h-sm` | `25px` | `--ctl-h-sm: 24px` | **same name, different value** |
| `--ctl-h` | `27px` | `--ctl-h: 28px` | **same name, different value** |
| `--ctl-h-lg` | `29px` | `--ctl-h-lg: 36px` | **same name, different value** |
| `--panel-w` | `280px` | `--panel-w: 210px` | **same name, different value** |
| `--strip-w` | `40px` | `--strip-w: 32px` | **same name, different value** |
| (no token) | mock uses `28px` | `--title-h: 22px` | mock raises the title bar; bundle offers no token |
| (no token) | mock uses `21px` | `--foot-h: 18px` | mock raises the footer; bundle offers no token |
| (no token) | `32px` char tabs, `33px` strip buttons, `34px` panel header | none | no tokens exist for these |

### 1.9 Motion

| Bundle token | Value | Existing | Relationship |
|---|---|---|---|
| `--dur` | `.13s` | `--dur-fast: 90ms`, `--dur-base: 140ms`, `--dur-slow: 220ms` | replaces three with one |
| `--ease` | `ease` | `--ease: cubic-bezier(.2, .7, .3, 1)` | **replaces**: the custom curve is dropped for the browser default |

Not in the bundle at all, present today and used by the shell: `--z-overlay: 5`, `--z-panel: 10`,
`--z-toast: 40`, `--z-dialog: 50` (the mock hard-codes `z-index:25` on the bank window and
`z-index:30` on the trace window), `color-scheme: dark`, and the
`@media (pointer: coarse) { --ctl-h: 36px; --ctl-h-sm: 32px; --ctl-h-lg: 44px; }` block.

### 1.10 Base layer (`tokens/base.css`, folds into `web/src/styles/base.css`)

Verbatim:

```
body { margin: 0; background: var(--frame); color: var(--text); font: var(--fs-base)/var(--lh) var(--font-ui); -webkit-font-smoothing: antialiased; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
button { cursor: pointer; font: inherit; transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease), box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease), opacity var(--dur) var(--ease); }
input, textarea, select { font: inherit; transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease); }
input:focus, textarea:focus, select:focus { outline: none; border-color: var(--accent) !important; box-shadow: var(--focus-ring); }
* { scrollbar-width: thin; scrollbar-color: #3c3c3c var(--bar); }
::selection { background: rgba(255,152,31,.35); color: var(--text-strong); }
```

The mock's inline `<style>` is the same set with the values expanded, with two drifts:
`scrollbar-color:#3c3c3c #1a1a1a` (note `#1a1a1a`, not `--bar` `#1a1a1c`) and
`::selection{background:rgba(255,152,31,.35);color:#e6e6e6}` (note `#e6e6e6`, the old strong
text, not `#e8e8e6`).

The bundle base layer has no reset (`box-sizing`), no `:focus-visible` rule, no
`::-webkit-scrollbar` rules, no `.hidden`/`.sr-only`/`.muted`/`.num`/`.pixel` helpers and no `kbd`
rule. All of those exist in `web/src/styles/base.css` today and none of them are contradicted;
they should survive the fold. The mock does style a `kbd` inline (co-pilot bar, running state)
with values that differ from the shipped `kbd` rule.

`styles.css` is only the import manifest, in this order: colors, typography, spacing, motion, base.

---

## 2. Component families

Twenty components in five families. Every value below is copied from the `.jsx`; the `.d.ts`
supplies the prop union and the `.prompt.md` the usage rule. README's "Component library,
statically" table gives the target class name for each.

### 2.1 core / Button, target `.btn` + `.btn-primary/-danger/-outline/-link`, `.btn-xs/-sm/-lg`

Sizes (`SIZES`): height / horizontal padding / font-size.

| size | height | padding-x | font-size |
|---|---|---|---|
| `xs` | `22` | `9` | `10.5` |
| `sm` | `25` | `11` | `11` |
| `md` (default) | `27` | `13` | `12` |
| `lg` | `29` | `14` | `12` |

Base for every variant: `display: inline-flex` (or `flex` + `width:100%` when `block`),
`align-items:center`, `justify-content:center`, `gap:6`, `border-radius: var(--r-ctl)` (6px),
`font-family: var(--font-ui)`, `white-space: nowrap`, `cursor: pointer`; disabled gives
`opacity: 0.35; cursor: not-allowed`.

| variant | background | border | color | font-weight | extra |
|---|---|---|---|---|---|
| `default` | `var(--control)` `#2e2e2d` | `1px solid var(--hairline-strong)` | `var(--text-strong)` | `500` | mock uses border `rgba(255,255,255,.09)`, not `.12`; see S7 |
| `primary` | `var(--accent-grad)` | `1px solid var(--accent-deep)` `#d6780a` | `var(--on-accent)` `#1c1300` | `650` | `box-shadow: 0 2px 10px var(--accent-glow)` |
| `danger` | `var(--danger)` `#a02828` | `1px solid var(--danger-deep)` `#781c1c` | `#f0e6e6` | `500` | hover `#b93030` |
| `outline` | `none` | `1px solid var(--hairline-strong)` | `#a0a09e` | `500` | |
| `link` | `none` | `0`, `padding:0`, `height:auto` | `var(--accent)` | `500` | |

Hover states, taken from the mock's `style-hover` attributes rather than the jsx:
- default and danger: `background:#3a3a38; transform:translateY(-1px)`.
- primary in the co-pilot bar and panel-width CTAs: `box-shadow:0 3px 16px rgba(255,152,31,.45); transform:translateY(-1px)`.
- primary inside cards (`Run`, `Run now`): `box-shadow:0 2px 12px rgba(255,152,31,.35); transform:translateY(-1px)`.
- outline: `background:#2e2e2d; color:#e8e8e6`.
- link: `text-decoration:underline`.
- icon-only close buttons: `background:#2e2e2d; color:#e8e8e6`.

Transition comes from base.css: `.13s ease` on background, border-color, color, box-shadow,
transform, opacity. Rule from `Button.prompt.md`: never two primaries side by side; `xs` is for
row-level actions, `lg` for panel-width CTAs.

### 2.2 core / Badge, target `.badge` + tone modifiers

Geometry: `height:17`, `display:inline-flex`, `align-items:center`, `gap:4`, `padding:0 7px`,
`border-radius:9`, `font-size:10`, `font-weight:650`, `white-space:nowrap`.
Optional leading dot: `5x5`, `border-radius:50%`, `background:currentColor`.

| tone | background | color |
|---|---|---|
| `accent` | `rgba(255,152,31,.16)` | `var(--accent)` |
| `ok` | `rgba(67,160,71,.16)` | `var(--ok-bright)` `#6ec873` |
| `warn` | `rgba(255,179,0,.14)` | `var(--warn)` `#ffb300` |
| `error` | `rgba(229,57,53,.16)` | `#f07370` |
| `info` | `rgba(74,144,217,.16)` | `var(--info-bright)` `#78afeb` |
| `neutral` (default) | `var(--control)` `#2e2e2d` | `#a0a09e` |

Mock instances that deviate from this geometry are catalogued in section 3 (run card badge,
script card badges, event char badge). See S8.

### 2.3 core / Tag, target `.tag`

`height:16`, `inline-flex`, `align-items:center`, `padding:0 7px`, `border-radius:8`,
`background:var(--control)` `#2e2e2d`, `color:#a0a09e`, `font-size:10`, `white-space:nowrap`.
No tones. `Tag.prompt.md`: not a status, use Badge for state.

### 2.4 core / StatusDot, target `.dot` + `.dot-ok/-accent/-warn/-error`, `.dot-pulse`, `.dot-glow`

`width/height = size` (default `8`), `border-radius:50%`, `flex:none`, `display:inline-block`.

| tone | colour | glow, applied as `0 0 8px <glow>` |
|---|---|---|
| `ok` | `var(--ok)` `#43a047` | `rgba(67,160,71,.6)` |
| `accent` | `var(--accent)` `#ff981f` | `rgba(255,152,31,.6)` |
| `warn` | `var(--warn)` `#ffb300` | `rgba(255,179,0,.5)` |
| `error` | `var(--error)` `#e53935` | `rgba(229,57,53,.5)` |
| `idle` (default) | `var(--text-faint)` `#575755` | `transparent` |

`pulse` gives `animation: pulse 1.6s ease-in-out infinite`.
Sizes used in the mock: `9` (co-pilot bar), `8` (Claude paired sessions), `7` (char tab, history
rows, "Waiting for Claude"), `6` (strip corner dot), `5` (badge inner dot).
Glow radius in the mock varies from the component: the char tab uses `0 0 6px rgba(67,160,71,.7)`,
the strip corner dot uses `0 0 6px <dotGlow>`, the co-pilot dot uses `0 0 8px <dotGlow>`.

### 2.5 core / Alert, target `.alert` + tone modifiers

`padding:'7px 9px'`, `border-left: 3px solid <tone>`, `border-radius: 4`, `font-size: 11`.
Text colour is `var(--warn)` when tone is `warn`, otherwise `var(--text)`.

| tone | rail | tint background |
|---|---|---|
| `accent` | `var(--accent)` | `rgba(255,152,31,.07)` |
| `ok` | `var(--ok)` | `rgba(67,160,71,.07)` |
| `warn` | `var(--warn)` | `rgba(255,179,0,.07)` |
| `error` | `var(--error)` | `rgba(229,57,53,.07)` |
| `info` (default) | `var(--info)` | `rgba(74,144,217,.07)` |

Mock deviation: the Bank panel info alert uses `padding:8px 10px` and `color:#b4b4b2`; the
Marketplace warn alert and the Claude accent alert use the spec `7px 9px`.

### 2.6 core / SectionLabel, target `.section-label`

`font-size: var(--fs-label)` `9.5px`, `font-weight: 650`,
`letter-spacing: var(--label-tracking)` `.09em`, `text-transform: uppercase`,
`color: var(--text-muted)` `#7c7c7a`. The mock adds `margin-top:2px` when it follows another block.
Instances: `Run snippet`, `History`, `Paired sessions`, `Link`, `Characters · 2 of 3`,
`Pinned · XP`.

### 2.7 core / Icon, the 11 glyphs

Wrapper, verbatim from `Icon.jsx`:
`<svg width={size} height={size} viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5'>`, default `size = 16`.

The 11 glyph names in `IconProps.name` order with their path data copied verbatim:

1. `automation`
   `<path d='M5 3.5 12 8 5 12.5 Z' fill='currentColor' stroke='none' />`
2. `claude`
   `<path d='M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8 6.3 6.3Z' fill='currentColor' stroke='none' />`
3. `xp`
   `<polyline points='2,12.5 6,7.5 9,10 14,3.5' />`
4. `loot`
   `<g><circle cx='8' cy='8' r='5.5' /><circle cx='8' cy='8' r='1.8' /></g>`
5. `events`
   `<path d='M1.5 8.5h3l2-4.5 3 8 2-3.5h3' />`
6. `notes`
   `<path d='M3.5 4.5h9M3.5 8h9M3.5 11.5h6' />`
7. `screenshot`
   `<g><rect x='2' y='4.5' width='12' height='8.5' rx='1.5' /><circle cx='8' cy='8.7' r='2.2' /></g>`
8. `bank`
   `<g><path d='M2.5 6.5 8 3l5.5 3.5' /><path d='M4.5 8v3.5M8 8v3.5M11.5 8v3.5M2.5 13.5h11' /></g>`
9. `account`
   `<g><circle cx='5.5' cy='5.5' r='2.5' /><path d='M2 13.5c.7-2.8 2-4 3.5-4s2.8 1.2 3.5 4' /><circle cx='11' cy='6.5' r='2' /><path d='M11.5 9.6c1.3.3 2 1.5 2.4 3.9' /></g>`
10. `plugins`
    `<g><rect x='2.5' y='2.5' width='4.5' height='4.5' /><rect x='9' y='2.5' width='4.5' height='4.5' /><rect x='2.5' y='9' width='4.5' height='4.5' /><rect x='9' y='9' width='4.5' height='4.5' fill='currentColor' stroke='none' /></g>`
11. `config`
    `<g><path d='M2.5 5h1.6M7.8 5h5.7M2.5 11h5.7M12.1 11h1.4' /><circle cx='6' cy='5' r='1.7' /><circle cx='10.2' cy='11' r='1.7' /></g>`

The mock inlines these same 11 paths in the `Icon strip` nav, one per strip button, with one
difference: the `claude` button's `<svg>` omits `fill="none" stroke="currentColor" stroke-width="1.5"`
and carries only `width`/`height`/`viewBox`, relying on the path's own `fill="currentColor"`.

`design-system-readme.md` names the set as "play, spark, chart, coin, pulse, lines, camera, bank,
people, grid, sliders", which maps one-to-one in order to automation, claude, xp, loot, events,
notes, screenshot, bank, account, plugins, config.

### 2.8 forms / Input, target `.input`

`width:100%`, `box-sizing:border-box`, `height:27`, `padding:'0 11px'`,
`background: var(--sunken)` `#141416`, `border: 1px solid var(--hairline)` `rgba(255,255,255,.07)`,
`border-radius: var(--r-ctl)` `6px`, `color: var(--text-strong)`,
`font-size: 12` (`10` when `mono`), `font-family: var(--font-ui)` (`var(--font-num)` when `mono`).
Focus comes from base.css: `border-color:#ff981f !important` plus
`box-shadow:0 0 0 3px rgba(255,152,31,.18)`.

Mock heights that differ: `24` (trace filter, `padding:0 9px`, `font-size:11`), `25` (Claude pair
URL, account create name, `font-size:11`), `23` (bank search, `padding:0 9px`, `border-radius:5px`,
`background:#171513`), `29` (Marketplace and Plugins search, `padding:0 11px`, `font-size:12`).

### 2.9 forms / Select, target `.select`

`height:27`, `padding:'0 7px'`, `background: var(--sunken)`, `border: 1px solid var(--hairline)`,
`border-radius: var(--r-ctl)`, `color: var(--text-strong)`, `font-size: 11`.
The mock uses `height:25` for the Events skill select and `height:27` for both Configuration selects.

### 2.10 forms / Textarea, target `.textarea` (+`.code`)

`width:100%`, `box-sizing:border-box`, `padding: 9` (`'8px 9px'` when `code`),
`background: var(--sunken)`, `border: 1px solid var(--hairline)`, `border-radius: var(--r-ctl)`,
`color: var(--text-strong)`, `font-size: 12` (`11` when `code`),
`font-family: var(--font-ui)` (`var(--font-num)` when `code`), `resize: vertical`.
Mock instances: run snippet (`rows=2`, code mode), notes (`rows=12`, plain, `flex:1;
min-height:160px`, `animation:fadeUp .18s ease`).

### 2.11 forms / Checkbox, native input with `accent-color`

`type='checkbox'`, `accentColor: var(--accent)`, `width:15`, `height:15`, `cursor:pointer`.

### 2.12 forms / Segmented, target `.seg` + `.seg-btn` (+`.active`)

Container: `display:flex`, `gap:3`, `background: var(--sunken)` `#141416`,
`border: 1px solid var(--hairline)`, `border-radius: var(--r-seg)` `7px`, `padding: 3`.
Button: `flex:1`, `height:22`, `border:0`, `border-radius:5`, `font-size:10.5`,
`padding:'0 8px'`, `white-space:nowrap`.
- active: `background: var(--accent-tint)` `rgba(255,152,31,.15)`, `color: var(--accent)`, `font-weight: 650`
- inactive: `background: transparent`, `color: var(--text-muted)` `#7c7c7a`, `font-weight: 500`
- mock hover on inactive: `color:#e8e8e6`

Builder signature from README: `segmented(options, value, onChange)`.

### 2.13 data / Card, target `.card` + `.card-rail-<tone>` + `.card-hero`

`padding: pad` (default `11`), `background: var(--card)` `#232325` or `var(--card-grad)`
`linear-gradient(180deg,#242426,#1f1f21)` when `gradient`,
`border: 1px solid var(--hairline-soft)` `rgba(255,255,255,.05)`,
`border-left: 3px solid <rail>` when railed else the same 1px hairline,
`border-radius: var(--r-card)` `8px`,
`box-shadow: 0 4px 14px -8px rgba(0,0,0,.6)` when `gradient`.
Rails: `accent` `var(--accent)`, `ok` `var(--ok)`, `warn` `var(--warn)`, `error` `var(--error)`,
or any raw CSS colour.

Mock deviation: every card in the side panel uses `border:1px solid rgba(255,255,255,.06)`, not
`.05`; the run card and the Claude pairing card use `rgba(255,255,255,.07)`.

### 2.14 data / KV, target `.kv` row (`.kv-label`, `.kv-value`, `.num`)

`display:flex`, `justify-content:space-between`, `align-items:center`, `gap:8`,
`padding:'2px 0'`, `font-size:11`. Label `color: var(--text-muted)`. Value is a `<b>`:
`color: tone || var(--text-strong)`, `font-family: var(--font-num)` when `mono`,
`font-variant-numeric: tabular-nums` always.
The mock uses `padding:4px 0` for the Bank panel rows and `padding:2px 0` for the Account and
Claude rows.

### 2.15 data / Meter, target `.meter` + `.meter-fill` (+`.shimmer`, `.meter-hp/-prayer/-run`)

Track: `height` (default `5`), `background:'#2c2c2e'`, `border-radius: height/2 + 1`
(so `3.5` at the default; the mock writes a flat `3px`), `overflow:hidden`.
Fill: `display:block`, `height:100%`, `width: pct%`, the same radius,
`background-size:'200% 100%'` and `animation:'shimmer 2.4s linear infinite'` when `shimmer`.

| tone | fill |
|---|---|
| `accent` (default) | `linear-gradient(90deg,#f28c0e,#ffb95e,#f28c0e)` |
| `hp` | `linear-gradient(90deg,var(--hp),var(--hp-bright))` |
| `prayer` | `linear-gradient(90deg,var(--prayer),var(--prayer-bright))` |
| `run` | `linear-gradient(90deg,var(--run),var(--run-bright))` |

Mock deviations: the bank capacity meter fills with flat `#ff981f`, not the gradient; the HUD
meters are `42x4` with track `rgba(255,255,255,.14)`, radius `2`, and flat fills `#c0392b`,
`#2980b9`, `#27ae60`, the single-stop colour rather than the component's two-stop gradient.

### 2.16 overlay / OverlayPill, target `.ov-pill` + tone borders

`display:inline-flex`, `align-items:center`, `gap:6`, `padding:'2px 7px'`,
`background: var(--overlay-scrim)` `rgba(0,0,0,.62)`, `border: 1px solid <tone border>`,
`border-radius: 3`, `font-family: var(--font-num)`, `font-weight: 700`, `font-size: 10.5`,
`white-space: nowrap`, `backdrop-filter: blur(2px)`.

| tone | border | color |
|---|---|---|
| `accent` (default) | `rgba(255,152,31,.35)` | `var(--accent)` |
| `ok` | `rgba(67,160,71,.4)` | `var(--ok)` |
| `warn` | `rgba(255,179,0,.4)` | `var(--warn)` |
| `error` | `rgba(229,57,53,.4)` | `var(--error)` |
| `neutral` | `rgba(128,128,128,.4)` | `var(--text)` |

`OverlayPill.prompt.md`: everything floating over the game canvas is one of these.
Mock deviation: the two canvas corner pills use `padding:3px 8px` and `font-size:11px`, and the
running pairing pill's border is `rgba(255,152,31,.4)` where the component's `accent` tone is `.35`.

### 2.17 overlay / HudPill, target `.hud-pill` composed from `.ov-pill`

Outer: `inline-flex`, `align-items:center`, `gap:6`, `padding:'2px 7px'`,
`background: var(--overlay-scrim)`, `border:1px solid <tone border>`, `border-radius:3`,
`backdrop-filter: blur(2px)`.
Label and value: `font-family: var(--font-num)`, `font-weight: 700`, `font-size: 10.5`.
Bar: `width:42`, `height:4`, `background:'rgba(255,255,255,.14)'`, `border-radius:2`,
`overflow:hidden`; fill `display:block; height:100%; width: pct%; background: <fill>`.
Value colour is always `#fff`.

| meter | label | label colour | fill | border |
|---|---|---|---|---|
| `hp` (default) | `HP` | `var(--hp-bright)` `#e05a4b` | `var(--hp)` `#c0392b` | `rgba(192,57,43,.45)` |
| `prayer` | `PRAY` | `var(--prayer-bright)` `#4aa3dc` | `var(--prayer)` `#2980b9` | `rgba(41,128,185,.45)` |
| `run` | `RUN` | `var(--run-bright)` `#43ca7e` | `var(--run)` `#27ae60` | `rgba(39,174,96,.45)` |

### 2.18 navigation / StripButton, target `.strip-btn` (+`.active`)

`position:relative`, `width:40`, `height:33`, `display:grid`, `place-items:center`, `border:0`,
`background: var(--card)` `#232325` when active else `transparent`,
`color: var(--accent)` when active else `#9a9a98`,
`box-shadow: inset 2px 0 0 var(--accent)` when active.
Always carries `title={label}` and `aria-label={label}`.
Corner dot when `dot` is set: a StatusDot at `size=6` with `glow`, positioned
`position:absolute; right:5px; top:5px`.
Mock hover: `background:#2a2a2c; color:#e8e8e6; transform:scale(1.06)`.
The mock adds `role="tab"` on every button and `role="tablist" aria-orientation="vertical"
aria-label="Panels"` on the nav.
README: generated by `rebuildStrip()` from the plugin manifest, contract unchanged.

### 2.19 navigation / CharTab, target `.char-tab` (+`.active`, `:disabled`)

`display:flex`, `align-items:center`, `gap:7`, `min-width:148`, `padding:'0 12px'`,
`height:100%`, `border:0`, `border-bottom: 2px solid <accent when active else transparent>`,
`background: linear-gradient(180deg,#28282a,#232325)` when active else `transparent`,
`color`: active `var(--text-strong)`, disabled `var(--text-disabled)` `#4e4e4c`, else `#a0a09e`,
`font-size:11`, `border-radius: 0` when active else `'6px 6px 0 0'`,
`box-shadow: 0 6px 14px -8px rgba(255,152,31,.4)` when active,
`cursor: not-allowed` when disabled.
Dot: StatusDot at `size=7`, `glow` only when tone is `ok`; `tone='none'` hides it entirely,
which is the "+ New character" slot.
Status span: `margin-left:auto`, `color: var(--text-muted)`, `font-size:10`,
`font-family: var(--font-num)`, `font-variant-numeric: tabular-nums`.
`CharTab.d.ts` says "Four slots, always".
Mock hover on inactive: `background:#232325; color:#e8e8e6`.
Mock deviation: the `offline` status span omits `font-family` and `font-variant-numeric`, so
"offline" renders in the UI font while `1:29:07` renders mono.

### 2.20 Family demo cards, the visual regression references

`components/<family>/<family>.card.html`, five files, each a `@dsCard` annotated page linked to
`../../styles.css` plus React, Babel and `_ds_bundle.js` from unpkg. Declared viewports:
Core `700x300`, Data `700x260`, Forms `700x300`, Navigation `700x340`, Overlay `700x220`.
`Button.d.ts` also carries
`@startingPoint section="Core" subtitle="Buttons in five variants and four sizes" viewport="700x260"`.
The Navigation card enumerates the strip order as nine entries and omits Notes and Screenshot,
where the mock's strip has eleven; see S9.

---

## 3. Surfaces

Global frame shell, `data-screen-label="idlescape frame v2"` (line 34):
`height:100vh; display:flex; flex-direction:column; overflow:hidden; background:#18181a;
color:#b4b4b2; font-size:12px; line-height:1.45`.
Middle band (line 50): `flex:1; display:flex; min-height:0`, containing Canvas column, Side panel
and Icon strip in that DOM order.

### 3.1 Title bar (unlabelled `<header>`, line 36)

`height:28px; flex:none; display:flex; align-items:center; gap:12px; padding:0 12px;
background:linear-gradient(180deg,#232325,#1e1e20); border-bottom:1px solid rgba(0,0,0,.6)`.

- Wordmark span: `font-family:'Pixelify Sans',ui-monospace,monospace; font-size:16px;
  color:#ff981f; letter-spacing:.03em; text-shadow:0 0 12px rgba(255,152,31,.35)`.
  Text: `idlescape`.
- Centre span: `flex:1; display:flex; justify-content:center; gap:10px; color:#7c7c7a;
  font-size:11px; white-space:nowrap; overflow:hidden`. Text: `osrs.scotho.com · world 1 · `
  then `<b style="color:#b4b4b2;font-weight:500">shoth4019zr</b>`.
- Version span: `color:#4e4e4c; font-size:11px`. Text: `v0.9`.

### 3.2 Character tabs (`data-screen-label="Character tabs"`, line 42)

`height:32px; flex:none; display:flex; align-items:stretch; gap:3px; padding:0 8px;
background:#1b1b1d; border-bottom:1px solid rgba(0,0,0,.55)`. Note `#1b1b1d` is not a token.

Four buttons, matching `CharTab.d.ts`'s "four slots, always":

1. Active: `min-width:148px; padding:0 12px; border:0; border-bottom:2px solid #ff981f;
   background:linear-gradient(180deg,#28282a,#232325); color:#e8e8e6; font-size:11px;
   box-shadow:0 6px 14px -8px rgba(255,152,31,.4)`; dot `width:7px; height:7px;
   border-radius:50%; background:#43a047; box-shadow:0 0 6px rgba(67,160,71,.7); flex:none`;
   name `shoth4019zr`; online timer span `margin-left:auto; color:#7c7c7a; font-size:10px;
   font-family:ui-monospace,Menlo,Consolas,monospace; font-variant-numeric:tabular-nums`,
   bound to `{{ onlineFor }}`.
2. Inactive: same metrics with `border-bottom:2px solid transparent; background:transparent;
   color:#a0a09e; border-radius:6px 6px 0 0`, hover `background:#232325;color:#e8e8e6`;
   dot `7x7 #575755`; name `alt_miner`; status span `margin-left:auto; color:#7c7c7a;
   font-size:10px` and text `offline` (no mono, no tabular-nums).
3. `+ New character`: `min-width:124px; padding:0 12px; color:#7c7c7a; font-size:11px;
   border-radius:6px 6px 0 0`, hover `background:#232325;color:#e8e8e6`. No dot.
4. Disabled: `min-width:110px; gap:6px; color:#4e4e4c; font-size:11px; cursor:not-allowed`.
   Text `Add more` plus `<span style="font-size:10px">soon</span>`.

Online timer format, from `renderVals()`: `osec` starts at `5347` and ticks +1 per second;
`oh = floor(osec/3600)`, `om = floor((osec%3600)/60)`, `os = String(osec%60).padStart(2,'0')`;
`onlineFor = oh > 0 ? oh + ':' + String(om).padStart(2,'0') + ':' + os : om + ':' + os`.
So `5347` renders `1:29:07`, matching `CharTab.prompt.md`.

### 3.3 Co-pilot bar (`data-screen-label="Co-pilot bar"`, line 53)

Outer: `flex:none; background:linear-gradient(180deg,#202022,#1c1c1e)`.
Row: `height:42px; display:flex; align-items:center; gap:10px; padding:0 14px`.
Rule beneath: `height:2px; background:{{ ruleBg }}; background-size:200% 100%; animation:{{ ruleAnim }}`.

Constant leading elements in every state:
- Dot: `width:9px; height:9px; border-radius:50%; flex:none; background:{{ dotColor }};
  animation:{{ dotAnim }}; box-shadow:0 0 8px {{ dotGlow }}`.
- Label span: `color:#e8e8e6; font-weight:650; letter-spacing:.01em`. Text: `Claude`.

State bindings, from `renderVals()`:

| state | dotColor | dotGlow | dotAnim | ruleBg | ruleAnim |
|---|---|---|---|---|---|
| running | `#ff981f` | `rgba(255,152,31,.6)` | `pulse 1.6s ease-in-out infinite` | `linear-gradient(90deg,#d6780a,#ffb95e,#d6780a)` | `barflow 2.6s linear infinite` |
| paused | `#ffb300` | `rgba(255,179,0,.5)` | `none` | `#ffb300` | `none` |
| stuck | `#ffb300` | `rgba(255,179,0,.5)` | `none` | `#e53935` | `none` |
| standby | `#43a047` | `rgba(67,160,71,.5)` | `none` | `rgba(0,0,0,.5)` | `none` |
| unpaired | `#666` | `transparent` | `none` | `rgba(0,0,0,.5)` | `none` |

`#666` is the only three-digit hex in the file and is not a token.

**State 1, `isUnpaired`** (line 57):
- Text span `color:#7c7c7a; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap`.
  Copy verbatim: `not paired — Claude can play this character alongside you`.
- `<span style="flex:1">` spacer.
- Primary button `height:27px; padding:0 14px; background:linear-gradient(180deg,#ffa63a,#f28c0e);
  border:1px solid #d6780a; border-radius:6px; color:#1c1300; font-size:12px; font-weight:650;
  box-shadow:0 2px 10px rgba(255,152,31,.28)`, hover
  `box-shadow:0 3px 16px rgba(255,152,31,.45); transform:translateY(-1px)`. Label `Pair Claude`,
  `onClick` bound to `go_claude` (opens the Claude panel).

**State 2, `isStandby`** (line 62): text `paired · standing by` in `color:#7c7c7a`, spacer, the
same primary button labelled `Run a script`, `onClick` bound to `startRun`.

**State 3, `isRunning`** (line 67):
- Clickable summary button (`onClick` -> `go_tasks`): `min-width:0; display:flex;
  align-items:baseline; gap:6px; overflow:hidden; white-space:nowrap; padding:0; border:0;
  background:none; color:#b4b4b2; text-align:left; font-size:12px`, hover `color:#e8e8e6`.
  Children in order: `<span style="color:#e8e8e6;font-weight:650">Chop and drop</span>`,
  `<span style="color:#575755">·</span>`, `<span style="color:#ff981f">Chop tree</span>`,
  `<span style="color:#575755">·</span>`,
  `<span style="overflow:hidden;text-overflow:ellipsis">chopping the nearest tree · {{ logs }} logs</span>`.
- Spacer.
- Esc hint span `color:#7c7c7a; font-size:11px; display:flex; align-items:center; gap:6px`
  containing `<kbd style="padding:1px 6px;border:1px solid #3e3e3c;border-bottom-width:2px;
  border-radius:4px;background:#232325;color:#e8e8e6;font-size:10px">Esc</kbd>` then the literal
  text ` take control`.
- Elapsed span `font-family:ui-monospace,Menlo,Consolas,monospace; font-weight:700;
  font-size:14px; color:#ffb95e; font-variant-numeric:tabular-nums`, bound to `{{ elapsed }}`.
- Two default buttons, each `height:27px; padding:0 13px; background:#2e2e2d;
  border:1px solid rgba(255,255,255,.09); border-radius:6px; color:#e8e8e6; font-size:12px`,
  hover `background:#3a3a38; transform:translateY(-1px)`: `Pause` (`pauseRun`), `Stop` (`stopRun`).

**State 4, `isPaused`** (line 76):
- `<span style="color:#ffb300;font-weight:600">paused — you took control</span>`
- `<span style="color:#7c7c7a">resumes in {{ resume }}s</span>`
- Spacer.
- Elapsed, the same mono 14px 700 tabular-nums but `color:#ffb300`.
- Buttons `Resume now` (`startRun`) and `Stop` (`stopRun`), both default grey.

**State 5, `isStuck`** (line 84):
- `<span style="color:#ffb300;font-weight:650">stuck on Chop tree</span>`
- `<span style="color:#7c7c7a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">no Tree within 12 tiles</span>`
- Spacer.
- Elapsed, mono 14px 700 tabular-nums, `color:#7c7c7a`.
- `Open trace` default grey (`openTrace`), then `Stop` in danger:
  `height:27px; padding:0 13px; background:#a02828; border:1px solid #781c1c; border-radius:6px;
  color:#f0e6e6; font-size:12px`, hover `background:#b93030; transform:translateY(-1px)`.

### 3.4 Canvas stage and overlays (unlabelled, inside `Canvas column`, line 95)

Stage wrapper: `flex:1; min-height:0; display:flex; justify-content:center;
align-items:flex-start; padding:14px; overflow:auto`.
Positioning context: `position:relative; width:min(789px,100%)`.

Canvas placeholder, `role="img" aria-label="Game canvas placeholder"`:
`width:100%; aspect-ratio:789/532; display:grid; place-items:center;
background:repeating-linear-gradient(45deg,#0a0a0a 0 12px,#0d0d0d 12px 24px);
border:1px solid rgba(0,0,0,.7); border-radius:4px; box-shadow:0 10px 30px -12px rgba(0,0,0,.7)`.
Caption span: `font-family:'Pixelify Sans',ui-monospace,monospace; color:#7c7c7a;
text-align:center; line-height:1.8; font-size:12px`, three lines:
`the 2004 client` / `<b style="color:#b4b4b2">789 × 532</b>` / `(same-origin iframe — never restyled)`.

**xp/h pill**, top-left: `position:absolute; top:10px; left:10px; padding:3px 8px;
background:rgba(0,0,0,.62); border:1px solid rgba(255,152,31,.35); border-radius:3px;
color:#ff981f; font-family:ui-monospace,Menlo,Consolas,monospace; font-weight:700;
font-size:11px; white-space:nowrap; backdrop-filter:blur(2px)`.
Copy verbatim: `Woodcutting · 24,180 xp/h`.

**Pairing pill**, top-right: the identical box at `top:10px; right:10px`, with
`border:1px solid {{ pillBorder }}; color:{{ pillColor }}` and text `{{ pillText }}`:

| state | pillText | pillColor | pillBorder |
|---|---|---|---|
| unpaired | `● not paired` | `#b4b4b2` | `rgba(128,128,128,.4)` |
| running | `● claude driving` | `#ff981f` | `rgba(255,152,31,.4)` |
| standby, paused, stuck | `● claude paired` | `#43a047` | `rgba(67,160,71,.4)` |

**HUD stack**, guarded by `showHud` (a declared prop, default true):
`position:absolute; top:42px; right:10px; display:flex; flex-direction:column;
align-items:flex-end; gap:4px; animation:popIn .2s ease`. Note `.2s`, not `.18s`.
Four pills, each `display:flex; align-items:center; gap:6px; padding:2px 7px;
background:rgba(0,0,0,.62); border-radius:3px; backdrop-filter:blur(2px)`:

1. HP: border `rgba(192,57,43,.45)`; label `HP` at `color:#e05a4b` mono 700 10.5px; bar
   `width:42px; height:4px; background:rgba(255,255,255,.14); border-radius:2px; overflow:hidden`
   with fill `width:78%; background:#c0392b`; value `14/18` at `color:#fff` mono 700 10.5px.
2. PRAY: border `rgba(41,128,185,.45)`; label `PRAY` `#4aa3dc`; fill `40%` `#2980b9`; value `4/10`.
3. RUN: border `rgba(39,174,96,.45)`; label `RUN` `#43ca7e`; fill `62%` `#27ae60`; value `62`.
4. Boost pill, no bar: `padding:2px 7px; border:1px solid rgba(255,152,31,.35); color:#ff981f`,
   mono 700 10.5px, `backdrop-filter:blur(2px)`. Copy verbatim: `Woodcutting +3`.

**XP drop** (`{{ xpPop }}`, built in `renderVals()`, only when `running`):
outer span with `key: 'xp' + ticks` so it remounts on each tick:
`position:absolute; left:50%; top:20%; transform:translateX(-50%); display:flex;
align-items:center; gap:5; animation:floatUp 2.6s ease-out forwards; pointer-events:none;
white-space:nowrap`.
Skill chip span: `width:9; height:9; border-radius:2; background:#2e7d32; border:1px solid #000;
box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)`.
Number span: `font-family:'ui-monospace,Menlo,Consolas,monospace'; font-weight:700; font-size:13;
color:#fff; text-shadow:<outline>`, content `+25`.
The 8-way outline, verbatim from the `outline` const:
`-1px 0 0 #000, 1px 0 0 #000, 0 -1px 0 #000, 0 1px 0 #000, -1px -1px 0 #000, 1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000`

### 3.5 Trace window (`data-screen-label="Trace window"`, line 117, guard `traceOpen`)

Frame: `position:absolute; right:16px; bottom:16px; z-index:30; width:430px;
max-width:calc(100% - 32px); display:flex; flex-direction:column; background:#202022;
border:1px solid rgba(255,255,255,.08); border-radius:10px;
box-shadow:0 18px 50px rgba(0,0,0,.6); overflow:hidden; animation:popIn .18s ease`.

Header: `display:flex; align-items:center; gap:8px; padding:8px 10px; background:#1b1b1d;
border-bottom:1px solid rgba(0,0,0,.5)`.
- `<span style="color:#e8e8e6;font-weight:650">Trace</span>`
- `<span style="color:#7c7c7a">Chop and drop</span>`
- Filter input `placeholder="Filter"`, `flex:1; min-width:0; height:24px; padding:0 9px;
  background:#141416; border:1px solid rgba(255,255,255,.07); border-radius:6px;
  color:#e8e8e6; font-size:11px`.
- `Copy for Claude` button `height:24px; padding:0 10px; background:#2e2e2d;
  border:1px solid rgba(255,255,255,.09); border-radius:6px; color:#e8e8e6; font-size:11px`,
  hover `background:#3a3a38`.
- Close button `aria-label="Close trace"`, `width:24px; height:24px; background:none; border:0;
  border-radius:6px; color:#7c7c7a; font-size:14px`, hover `background:#2e2e2d; color:#e8e8e6`,
  glyph `×`.

Body: `max-height:250px; overflow-y:auto; font-family:ui-monospace,monospace; font-size:10.5px;
padding:5px 0`. Every row is `padding:2.5px 10px; border-left:2px solid <rail>`.
Eight seeded rows, verbatim, with their rails and text colours:

| rail | text colour | copy |
|---|---|---|
| `#ff981f` | `#b4b4b2` | `00:00.1 task_enter Chop tree` |
| `#4a90d9` | `#b4b4b2` | `00:01.4 action chop → Tree (3222,3218)` |
| `#43a047` | `#b4b4b2` | `00:03.9 xp Woodcutting +25` |
| `transparent` | `#7c7c7a` | `00:04.0 log inventory 12/28` |
| `#43a047` | `#b4b4b2` | `00:06.3 xp Woodcutting +25` |
| `#ffb300` | `#ffb300` | `02:11.2 stuck no Tree within 12 tiles` |
| `#ffb300` | `#ffb300` | `02:11.2 paused reason=stuck` |
| `#ff981f` | `#e8e8e6` | `14:07.6 run_done done · 4,180 xp` |

So the kind-to-rail map is: `task_enter` and `run_done` accent, `action` info, `xp` ok,
`log` none, `stuck` and `paused` warn.

Footer: `padding:6px 10px; border-top:1px solid rgba(0,0,0,.5); color:#575755; font-size:10px`.
Copy verbatim: `312 events · popped out — the panel stays free`.

### 3.6 Bank window (`data-screen-label="Bank window"`, line 139, guard `bankOpen`)

Frame: `position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:25;
width:min(470px,calc(100% - 28px)); display:flex; flex-direction:column; background:#252220;
border:1px solid rgba(255,255,255,.08); border-radius:10px;
box-shadow:0 20px 60px rgba(0,0,0,.65); overflow:hidden; animation:popIn .18s ease`.
`#252220` is the warm ground and is not a token.

Header: `display:flex; align-items:center; gap:8px; padding:8px 12px;
background:linear-gradient(180deg,#2c2925,#252220); border-bottom:1px solid rgba(0,0,0,.5)`.
- Title `<span style="flex:1;color:#e8e8e6;font-weight:650">Bank of Gielinor</span>`
- Capacity `<span style="color:#7c7c7a;font-size:11px;font-variant-numeric:tabular-nums">27 / 240</span>`
  (tabular-nums but no `font-family`, so it renders in the UI font).
- Live badge: `height:17px; inline-flex; align-items:center; gap:4px; padding:0 7px;
  border-radius:9px; background:rgba(67,160,71,.16); color:#6ec873; font-size:10px;
  font-weight:650`, with an inner `5x5; border-radius:50%; background:#43a047` dot and the label
  `live`. This is Badge tone `ok` with `dot`, exactly to spec.
- Close `aria-label="Close the bank"`, `width:24px; height:24px; background:none; border:0;
  border-radius:6px; color:#7c7c7a; font-size:14px`, hover `background:#2e2e2d; color:#e8e8e6`,
  glyph `×`.

Body: `display:flex; min-height:0`.
Left tab rail: `display:flex; flex-direction:column; gap:4px; padding:10px 6px;
background:rgba(0,0,0,.22); border-right:1px solid rgba(0,0,0,.4)`. Three buttons, all `32x32`:

1. Active: `background:#33302c; border:1px solid #ff981f; border-radius:6px; color:#e8e8e6;
   box-shadow:0 0 10px -3px rgba(255,152,31,.5)`, glyph `∞` (the "unicode as data" case named
   in the brand guide).
2. Inactive: `background:#2c2925; border:1px solid rgba(255,255,255,.07); border-radius:6px;
   color:#a0a09e`, hover `background:#33302c; color:#e8e8e6`, label `2`.
3. Add tab: `background:none; border:1px dashed #4e4a44; border-radius:6px; color:#ff981f;
   font-weight:650`, hover `background:#2c2925; border-style:solid`, glyph `+`.

Slot grid: `flex:1; display:grid; grid-template-columns:repeat(8,1fr); gap:3px; padding:10px;
align-content:start`, iterated by `<sc-for list="{{ bankSlots }}" as="slot">`.
Slot: `aspect-ratio:4/3; position:relative; display:grid; place-items:center;
background:rgba(0,0,0,.2); border:1px solid rgba(0,0,0,.4); border-radius:4px;
transition:border-color .12s ease,background .12s ease`, hover
`border-color:rgba(255,152,31,.5); background:rgba(255,152,31,.06)`.
Count span: `position:absolute; top:1px; left:3px;
font-family:ui-monospace,Menlo,Consolas,monospace; font-weight:700; font-size:10px;
color:{{ slot.tone }}; text-shadow:1px 1px 0 rgba(0,0,0,.9)`.
Item image, built in `renderVals()`: `width:27; height:24; object-fit:contain;
image-rendering:pixelated`.

`bankSlots` is 16 entries: 12 filled, 4 empty (`img:''`, `n:''`, `tone:'#fff'`).

| # | alt | count | tone | placeholder src |
|---|---|---|---|---|
| 1 | Coins | `250K` | `#00ff80` | `https://oldschool.runescape.wiki/images/Coins_10000.png` |
| 2 | Logs | `41` | `#ffff00` | `.../Logs.png` |
| 3 | Bronze axe | `1` | `#ffff00` | `.../Bronze_axe.png` |
| 4 | Bronze pickaxe | `1` | `#ffff00` | `.../Bronze_pickaxe.png` |
| 5 | Tinderbox | `1` | `#ffff00` | `.../Tinderbox.png` |
| 6 | Small fishing net | `1` | `#ffff00` | `.../Small_fishing_net.png` |
| 7 | Raw shrimps | `30` | `#ffff00` | `.../Raw_shrimps.png` |
| 8 | Bread | `3` | `#ffff00` | `.../Bread.png` |
| 9 | Bronze sword | `1` | `#ffff00` | `.../Bronze_sword.png` |
| 10 | Wooden shield | `1` | `#ffff00` | `.../Wooden_shield.png` |
| 11 | Air rune | `25` | `#ffff00` | `.../Air_rune.png` |
| 12 | Water rune | `30` | `#ffff00` | `.../Water_rune.png` |

The hot-linked wiki PNGs are placeholders; production icons come from the client IconCache
(README "Assets", design-system-readme "Iconography").

Footer: `display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding:9px 12px;
background:rgba(0,0,0,.24); border-top:1px solid rgba(0,0,0,.4)`.
- Mode group `<span style="display:flex;gap:3px">`: `Swap` primary
  (`height:23px; padding:0 9px; background:linear-gradient(180deg,#ffa63a,#f28c0e);
  border:1px solid #d6780a; border-radius:5px; color:#1c1300; font-size:11px; font-weight:650`)
  and `Insert` quiet (`background:#2c2925; border:1px solid rgba(255,255,255,.07);
  border-radius:5px; color:#a0a09e; font-size:11px`, hover `background:#33302c; color:#e8e8e6`).
- Quantity group, the same three-button pattern: `1` active primary, `5` and `All` quiet.
- Search input: `flex:1; min-width:80px; height:23px; padding:0 9px; background:#171513;
  border:1px solid rgba(255,255,255,.07); border-radius:5px; color:#e8e8e6; font-size:11px`,
  placeholder `Search`.
- Caption `<span style="color:#575755;font-size:10px">view &amp; reorder only — items move in game</span>`.

Note the footer buttons use `height:23px` and `border-radius:5px`, neither of which is a declared
control-height or radius token.

### 3.7 Side panel shell (`data-screen-label="Side panel"`, line 171)

`width:{{ panelW }}px; min-width:240px; flex:none; display:flex; flex-direction:column;
background:#1e1e20; border-left:1px solid rgba(0,0,0,.55)`.
`panelWidth` is a declared prop: `editor:"range", default:280, min:240, max:340, step:10, unit:"px"`.

Panel header (line 183): `flex:none; display:flex; align-items:center; gap:8px; height:34px;
padding:0 6px 0 12px; background:#1a1a1c; border-bottom:1px solid rgba(0,0,0,.5)`.
- Title `<b style="color:#e8e8e6;font-size:12.5px">{{ panelTitle }}</b>`.
- Spacer.
- Pin button, only when `canPin`: `height:23px; padding:0 9px; background:none;
  border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#a0a09e; font-size:11px`,
  hover `background:#2e2e2d; color:#e8e8e6`, label `Pin`.
- Close button `aria-label="Close panel"`, `width:26px; height:26px; background:none; border:0;
  border-radius:6px; color:#7c7c7a; font-size:15px`, hover `background:#2e2e2d; color:#e8e8e6`,
  glyph `×`.

Panel body (line 192): `flex:1; overflow-y:auto; padding:11px; display:flex;
flex-direction:column; gap:10px`. Every panel's root child adds `animation:fadeUp .18s ease`.

Panel id to title map, verbatim from `renderVals()`:

```
{ tasks: 'Automation', claude: 'Claude', xp: 'XP Tracker', loot: 'Loot Tracker',
  events: 'Events', notes: 'Notes', shot: 'Screenshot', bank: 'Bank',
  account: 'Account', plugins: 'Plugins', config: 'Configuration' }
```

The id array driving `is_*`, `bg_*`, `c_*`, `r_*` and `go_*`:
`['tasks','claude','xp','loot','events','notes','shot','bank','account','plugins','config']`.
`tasks` is the id whose title is `Automation`, which is exactly the rename the constraints
require. There is no `characters` id and no `marketplace` id anywhere in the mock.

### 3.8 Pinned XP tracker (`data-screen-label="Pinned tracker"`, line 173, guard `showPinCard`)

`flex:none; padding:9px 12px; background:#1a1a1c; border-bottom:1px solid rgba(0,0,0,.5);
animation:fadeUp .18s ease`. It sits above the panel header, inside the side panel.
- Label row: SectionLabel `Pinned · XP` (`font-size:9.5px; font-weight:650; letter-spacing:.09em;
  text-transform:uppercase; color:#7c7c7a`), spacer, unpin button `width:18px; height:18px;
  background:none; border:0; border-radius:4px; color:#7c7c7a; font-size:12px`,
  `aria-label="Unpin"`, hover `background:#2e2e2d; color:#e8e8e6`, glyph `×`.
- Value row `display:flex; align-items:baseline; gap:8px; margin-top:2px`:
  `<b style="color:#e8e8e6">Woodcutting</b>`,
  `<span style="color:#7ddc84;font-weight:650">+{{ sessionXp }}</span>`, spacer,
  `<span style="color:#7c7c7a;font-size:11px">24.2k/h · lvl 34</span>`.
- Meter `height:5px; background:#2c2c2e; border-radius:3px; overflow:hidden; margin-top:6px`
  with fill `display:block; height:100%; width:64%; border-radius:3px;
  background:linear-gradient(90deg,#f28c0e,#ffb95e,#f28c0e); background-size:200% 100%;
  animation:shimmer 2.4s linear infinite`.

Pin logic: `canPin = panel === 'xp' && pinned !== 'xp'`;
`showPinCard = pinned === 'xp' && panel !== 'xp'`. Only the XP panel is pinnable.

### 3.9 Automation panel (`is_tasks`, line 194)

Root `display:flex; flex-direction:column; gap:10px; animation:fadeUp .18s ease`.

**Run card** (guard `runExists`, line 196): `display:flex; flex-direction:column; gap:6px;
padding:12px; background:linear-gradient(180deg,#242426,#1f1f21);
border:1px solid rgba(255,255,255,.07); border-left:3px solid {{ barRule }};
border-radius:8px; box-shadow:0 4px 14px -8px rgba(0,0,0,.6)`.
`barRule`: running `#ff981f`, paused `#ffb300`, stuck `#e53935`, else `rgba(0,0,0,.5)`.

- Header row `display:flex; align-items:center; gap:8px`:
  - Badge: `height:19px; inline-flex; align-items:center; gap:5px; padding:0 8px;
    border-radius:10px; background:{{ badgeBg }}; color:{{ badgeColor }}; font-size:10px;
    font-weight:700; letter-spacing:.03em`.
    `badgeText`: running `Running`, paused `Paused`, stuck `Stuck`.
    `badgeBg`: running `rgba(255,152,31,.16)`, otherwise `rgba(255,179,0,.14)`.
    `badgeColor`: running `#ff981f`, otherwise `#ffb300`.
  - Spacer.
  - Elapsed: `font-family:ui-monospace,Menlo,Consolas,monospace; font-weight:700;
    font-size:16px; color:#ffb95e; font-variant-numeric:tabular-nums`. **16px**, not the 14px
    README states; see S14.
- Title `<div style="font-size:14.5px;font-weight:650;color:#e8e8e6">Chop and drop</div>`.
- Quest-step row `display:flex; align-items:center; gap:5px; margin-top:1px`, six children:
  - done marker `width:14px; height:14px; border-radius:50%; background:rgba(67,160,71,.2);
    color:#7ddc84; display:grid; place-items:center; font-size:9px`, glyph `✓`;
    label `<span style="color:#7c7c7a;font-size:10.5px">Walk</span>`.
  - connector `<span style="width:12px;height:1px;background:#3a3a38"></span>`.
  - current marker `width:14px; height:14px; border-radius:50%; background:rgba(255,152,31,.25);
    color:#ff981f; display:grid; place-items:center; font-size:8px;
    animation:stepPulse 1.8s ease-in-out infinite`, glyph `●`;
    label `<span style="color:#ff981f;font-size:10.5px;font-weight:600">Chop tree</span>`.
  - connector again, identical.
  - upcoming marker `width:14px; height:14px; border-radius:50%; border:1px solid #3a3a38;
    color:#575755; display:grid; place-items:center; font-size:8px`, empty content;
    label `<span style="color:#575755;font-size:10.5px">Drop</span>`.
- Status line `<div style="font-size:11px;color:#b4b4b2">{{ statusLine }}</div>`, verbatim:
  - running: `Chopping the nearest tree · Woodcutting 34`
  - paused: `You took control — resumes in ` + resume + `s. Esc pauses again any time.`
  - stuck: `Stuck on Chop tree · no Tree within 12 tiles. Open the trace and paste it to Claude.`
- Counter row `display:flex; gap:8px; padding:6px 0 2px;
  border-top:1px solid rgba(255,255,255,.05); margin-top:3px`:
  `<span style="font-size:10.5px;color:#7c7c7a">logs <b style="font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;color:#e8e8e6;font-size:12px">{{ logs }}</b></span>`
  and the same shape with the word `xp` and `color:#7ddc84`, bound to `{{ sessionXp }}`.
- Action row `display:flex; gap:6px`, every button `flex:1; height:27px; background:#2e2e2d;
  border:1px solid rgba(255,255,255,.09); border-radius:6px; color:#e8e8e6; font-size:12px`,
  hover `background:#3a3a38; transform:translateY(-1px)`:
  `Pause` when `isRunning`, `Resume` when `isPausedOrStuck`, then always `Trace` and `Stop`.

**Segmented tabs** (line 226): container `display:flex; gap:3px; background:#141416;
border:1px solid rgba(255,255,255,.07); border-radius:7px; padding:3px`.
Buttons `flex:1; height:22px; border:0; border-radius:5px; font-size:10.5px` with bound
background, colour and weight, hover `color:#e8e8e6`. Labels `My tasks` (`tabMy`) and
`Marketplace` (`tabMarket`).
Active: `background:rgba(255,152,31,.15); color:#ff981f; font-weight:650`.
Inactive: `background:transparent; color:#7c7c7a; font-weight:500`.

**Tab A, My tasks** (`onTasksTab`, line 230): a `display:flex; flex-direction:column; gap:10px`
wrapper holding a `gap:7px` card list, then two SectionLabels and their content.

Script card shell, used by both cards: `padding:10px 11px; background:#232325;
border:1px solid rgba(255,255,255,.06); border-radius:8px;
transition:transform .13s ease,border-color .13s ease`, hover
`transform:translateY(-1px); border-color:rgba(255,255,255,.12)`.

Card 1:
- Title row `display:flex; align-items:center; gap:6px`: `<b style="color:#e8e8e6">Chop and drop</b>`
  plus a badge `height:16px; inline-flex; align-items:center; padding:0 7px; border-radius:8px;
  background:rgba(74,144,217,.16); color:#78afeb; font-size:10px; font-weight:650`, label `Library`.
- Description `<div style="color:#7c7c7a;font-size:11px;margin-top:2px">Chops the nearest tree, drops the logs, until target level.</div>`
- Meta `<div style="color:#575755;font-size:10px;margin-top:2px">v1 · ~20 min · last run: done · 41 logs</div>`
- Buttons `display:flex; gap:6px; margin-top:8px`: `Run` primary
  (`flex:1; height:25px; background:linear-gradient(180deg,#ffa63a,#f28c0e);
  border:1px solid #d6780a; border-radius:6px; color:#1c1300; font-size:11px; font-weight:650`,
  hover `box-shadow:0 2px 12px rgba(255,152,31,.35); transform:translateY(-1px)`) and
  `Fork` default (`flex:1; height:25px; background:#2e2e2d;
  border:1px solid rgba(255,255,255,.09); border-radius:6px; color:#e8e8e6; font-size:11px`,
  hover `background:#3a3a38`).

Card 2:
- `<b>Mine and drop</b>` plus a badge at `background:rgba(255,152,31,.16); color:#ff981f`,
  label `Fork`.
- Description `My copy, tin filter removed.`
- Requirement line, a bare amber paragraph rather than an Alert:
  `<div style="color:#ffb300;font-size:11px;margin-top:2px">⚠ Needs a bronze pickaxe in your inventory</div>`
- Buttons: `Run` primary but `disabled`, with `opacity:.35; cursor:not-allowed`; `Edit` default.

SectionLabel `Run snippet`, then a code textarea `rows="2"`: `width:100%; box-sizing:border-box;
padding:8px 9px; background:#141416; border:1px solid rgba(255,255,255,.07); border-radius:6px;
color:#e8e8e6; font-family:ui-monospace,monospace; font-size:11px; resize:vertical`.
Content verbatim: `await bot.chopTree("Tree")`.

SectionLabel `History`, then a `display:flex; flex-direction:column` list of two rows.
Row: `display:flex; align-items:center; gap:8px; padding:8px 2px`; the first row also carries
`border-bottom:1px solid rgba(255,255,255,.05)`.
- Dot `width:7px; height:7px; border-radius:50%; flex:none`, `#43a047` (row 1) and `#e53935` (row 2).
- Body `<span style="min-width:0;flex:1"><b style="color:#e8e8e6;font-size:11px">NAME</b><span style="display:block;color:#575755;font-size:10px">META</span></span>`.
  Row 1 name `Chop and drop`, meta `18:42 · 4,180 xp · 41 logs`.
  Row 2 name `Net fish and drop`, meta `02:15 · 0 xp · no fishing spot in range`.
  The meta span sets no `font-family` and no `font-variant-numeric`.
- Trace button `height:22px; padding:0 9px; background:none;
  border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#a0a09e; font-size:10px`,
  hover `background:#2e2e2d; color:#e8e8e6`. This is `Button variant="outline" size="xs"` but at
  `font-size:10`, where the xs spec is `10.5`.

**Tab B, Marketplace** (`onMarketTab`, line 272). Root
`display:flex; flex-direction:column; gap:10px; animation:fadeUp .18s ease`.
Note this `<sc-if>` is a **sibling** of the `is_tasks` block, not nested inside it; the guard is
`panel === 'tasks' && autoTab === 'market'` while `onTasksTab` is only `autoTab === 'my'`.

- Search input `width:100%; box-sizing:border-box; height:29px; padding:0 11px;
  background:#141416; border:1px solid rgba(255,255,255,.07); border-radius:6px;
  color:#e8e8e6; font-size:12px`, placeholder `Search scripts`.
- Market card 1, `padding:11px` on the same card shell:
  - `<b>Chop and drop</b>` plus a badge at `background:rgba(255,152,31,.16); color:#ff981f`,
    label `Start here`.
  - Description at `margin-top:3px`: `Chops the nearest tree of the chosen kind and drops the logs until the target Woodcutting level.`
  - Tag row `display:flex; flex-wrap:wrap; gap:4px; margin-top:7px`: two Tags
    (`height:16px; padding:0 7px; border-radius:8px; background:#2e2e2d; color:#a0a09e;
    font-size:10px`) reading `skilling` and `woodcutting`, then
    `<span style="color:#575755;font-size:10px;align-self:center">v1 · ~20 min</span>`.
  - Alert warn `margin-top:8px; padding:7px 9px; background:rgba(255,179,0,.07);
    border-left:3px solid #ffb300; border-radius:4px; color:#ffb300; font-size:11px`.
    Copy verbatim: `Needs a bronze axe in your inventory or equipped`.
  - Buttons `display:flex; gap:6px; margin-top:9px`: `Run now` primary h25 and `Add to tasks`
    default h25.
- Market card 2: `<b>Net fish and drop</b>` with no badge; description
  `Nets the nearest fishing spot and drops the catch until the target Fishing level.`;
  Tags `skilling` and `fishing`, meta `v1 · ~25 min`; no Alert; buttons `Run now` primary and
  `Added ✓` disabled (`background:#2e2e2d; border:1px solid rgba(255,255,255,.07);
  color:#7c7c7a; cursor:not-allowed`).

### 3.10 XP Tracker panel (`is_xp`, line 297)

- Header row `display:flex; align-items:center; gap:8px`:
  `<span style="color:#7c7c7a;font-size:11px">Session · {{ elapsed }}</span>`, spacer,
  a `Reset` outline button `height:23px; padding:0 9px; background:none;
  border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#a0a09e; font-size:11px`.
- Two skill cards, each `padding:10px 11px; background:#232325;
  border:1px solid rgba(255,255,255,.06); border-radius:8px`:
  - Row `display:flex; align-items:center; gap:9px`:
    - Level chip `width:26px; height:26px; border-radius:7px; background:#2e2e2d;
      border:1px solid rgba(255,255,255,.08); display:grid; place-items:center;
      font-family:ui-monospace,Menlo,Consolas,monospace; font-weight:700; font-size:12px;
      color:#ffb95e`. Values `34` and `21`.
    - Name block `<span style="flex:1;min-width:0"><b style="color:#e8e8e6">Woodcutting</b><span style="display:block;color:#575755;font-size:10px">24,180/h · 52 actions to 35</span></span>`;
      second card `Firemaking` and `3,400/h · 12 actions to 22`.
    - Gain `<span style="color:#7ddc84;font-weight:650;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;font-size:13px">+{{ sessionXp }}</span>`
      (the inline style declares `font-weight` twice; `700` wins). Second card `+610`.
  - Meter `height:5px; background:#2c2c2e; border-radius:3px; overflow:hidden; margin-top:8px`
    with the shimmer fill at `64%` and `31%`.
  - Footer `display:flex; color:#575755; font-size:10px; margin-top:4px`:
    `lvl 34` then a spacer then `1,290 xp to lvl 35`; second card `lvl 21` and `240 xp to lvl 22`.

### 3.11 Loot Tracker panel, the empty state (`is_loot`, line 323)

`flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
gap:9px; padding:36px 12px; text-align:center; animation:fadeUp .18s ease`.
- Circle `width:40px; height:40px; border-radius:50%; border:1.5px dashed #4e4e4c;
  display:grid; place-items:center; color:#7c7c7a; font-size:16px;
  animation:bob 2.6s ease-in-out infinite`, glyph `◌`.
- Title `<b style="color:#e8e8e6;font-size:13.5px">Nothing looted yet</b>`.
- Copy `<span style="color:#7c7c7a;font-size:11px;max-width:190px">Items you pick up appear here as you play — or as Claude plays for you.</span>`.
- Action: primary `height:27px; padding:0 14px; background:linear-gradient(180deg,#ffa63a,#f28c0e);
  border:1px solid #d6780a; border-radius:6px; color:#1c1300; font-size:12px; font-weight:650;
  box-shadow:0 2px 10px rgba(255,152,31,.25)`, hover
  `box-shadow:0 3px 16px rgba(255,152,31,.45); transform:translateY(-1px)`, label `Run a script`,
  `onClick` bound to `go_tasks`. Note the resting glow alpha here is `.25`, where the co-pilot
  bar's is `.28` (the `--accent-glow` token).

### 3.12 Events panel (`is_events`, line 331)

Root `display:flex; flex-direction:column; gap:10px; animation:fadeUp .18s ease; min-height:0`.

1. Character segmented, identical geometry to the Automation tabs (container `display:flex;
   gap:3px; background:#141416; border:1px solid rgba(255,255,255,.07); border-radius:7px;
   padding:3px`; buttons `flex:1; height:22px; border:0; border-radius:5px; font-size:10.5px`).
   Options from `charChips`: `All`, `shoth4019zr`, `alt_miner`.
   Active `background:rgba(255,152,31,.15); color:#ff981f; font-weight:650`;
   inactive `background:transparent; color:#7c7c7a; font-weight:500`.
2. Type chips `display:flex; flex-wrap:wrap; gap:4px`. Each chip
   `height:20px; padding:0 8px; border:1px solid {{ ch.b }}; border-radius:10px;
   background:{{ ch.bg }}; color:{{ ch.c }}; font-size:10px; font-weight:600`,
   hover `border-color:rgba(255,152,31,.6)`.
   Active: background `rgba(255,152,31,.15)`, border `rgba(255,152,31,.5)`, colour `#ff981f`.
   Inactive: background `transparent`, border `rgba(255,255,255,.1)`, colour `#a0a09e`.
   The six value and label pairs, verbatim:
   `['xp','XP'], ['loot','Loot'], ['level','Levels'], ['run','Runs'], ['claude','Claude'], ['bank','Bank']`.
3. Filter row `display:flex; align-items:center; gap:6px`:
   - Select `flex:1; height:25px; padding:0 7px; background:#141416;
     border:1px solid rgba(255,255,255,.07); border-radius:6px; color:#e8e8e6; font-size:11px`.
     Options verbatim: `All skills` (value `all`), `Woodcutting`, `Firemaking`, `Mining`, `Fishing`.
   - `Clear` outline button `height:25px; padding:0 9px; background:none;
     border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#a0a09e; font-size:10.5px`.
4. Feed `flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column`.
   Row: `display:flex; gap:8px; padding:6px 6px 6px 8px; border-left:2px solid {{ ev.rail }};
   background:{{ ev.bg }}; border-radius:0 4px 4px 0; margin-bottom:2px`.
   - Time `<span style="color:#575755;font-size:10px;font-variant-numeric:tabular-nums;flex:none;padding-top:1px">`
   - Text `<span style="flex:1;min-width:0;font-size:11px;color:{{ ev.tc }};overflow-wrap:anywhere">`
   - Char badge `<span style="flex:none;height:15px;padding:0 5px;border-radius:8px;background:#2c2c2e;color:#7c7c7a;font-size:9px;display:inline-flex;align-items:center">`

   Tone table, derived from the 14 seeded events:

   | type | rail | row background | text colour |
   |---|---|---|---|
   | `level` | `#ff981f` | `rgba(255,152,31,.07)` | `#ffb95e` |
   | `xp` | `#43a047` | `transparent` | `#b4b4b2` |
   | `loot` | `#ffb300` | `transparent` | `#b4b4b2` |
   | `run` (ok) | `#4a90d9` | `transparent` | `#b4b4b2` |
   | `run` (failed) | `#e53935` | `transparent` | `#ffb300` |
   | `claude` | `#7c7c7a` | `transparent` | `#b4b4b2` |
   | `bank` | `#78afeb` | `transparent` | `#b4b4b2` |

   The 14 seeded events, verbatim in order (time, character, type, skill, text):
   1. `14:07` shoth4019zr level Woodcutting `Level up! Woodcutting 34 → 35`
   2. `14:05` shoth4019zr xp Woodcutting `+250 Woodcutting xp · 10 actions`
   3. `13:58` shoth4019zr loot none `Bird nest picked up`
   4. `13:52` shoth4019zr run none `Run resumed after you took control`
   5. `13:51` shoth4019zr run none `Paused — you moved the mouse`
   6. `13:44` shoth4019zr loot none `41 logs gathered this session`
   7. `13:30` shoth4019zr claude none `Claude started Chop and drop`
   8. `13:29` shoth4019zr claude none `MacBook session paired`
   9. `12:58` alt_miner xp Mining `+120 Mining xp`
   10. `12:55` alt_miner run none `Mine and drop failed — needs a bronze pickaxe` (rail `#e53935`, tc `#ffb300`)
   11. `12:40` shoth4019zr bank none `Bank updated — 27 / 240 slots used`
   12. `12:31` alt_miner xp Fishing `+80 Fishing xp`
   13. `12:30` shoth4019zr xp Firemaking `+610 Firemaking xp`
   14. `12:12` shoth4019zr claude none `Gateway connected — ws ok`

   Filter predicate, verbatim:
   `(evChar === 'All' || e.char === evChar) && (evTypes.length === 0 || evTypes.includes(e.type)) && (evSkill === 'all' || e.skill === evSkill)`.
   `clearEvFilters` resets to `{ evChar: 'All', evTypes: [], evSkill: 'all' }`.

5. Empty state (`evEmpty`, rendered inside the scroller): `display:flex; flex-direction:column;
   align-items:center; gap:7px; padding:28px 12px; text-align:center`.
   - Circle `width:34px; height:34px; border-radius:50%; border:1.5px dashed #4e4e4c;
     display:grid; place-items:center; color:#7c7c7a; font-size:14px`, glyph `⌕`. **No `bob`.**
   - Title `<b style="color:#e8e8e6;font-size:12.5px">No events match</b>`.
   - Copy `<span style="color:#7c7c7a;font-size:11px;max-width:180px">Loosen the filters — or go make something happen.</span>`.
   - Button `Clear filters`, default grey: `height:24px; padding:0 11px; background:#2e2e2d;
     border:1px solid rgba(255,255,255,.09); border-radius:6px; color:#e8e8e6; font-size:11px`,
     hover `background:#3a3a38`.
6. Footer `flex:none; display:flex; align-items:center; color:#575755; font-size:10px;
   border-top:1px solid rgba(255,255,255,.05); padding-top:7px`.
   Copy: `{{ evCount }} of {{ evTotal }} events · this session`, then a spacer, then a link button
   `padding:0; background:none; border:0; color:#ff981f; font-size:10px`, hover
   `text-decoration:underline`, label `Copy for Claude`.

### 3.13 Bank panel (`is_bank`, line 375)

- KV `Used` and `<b style="color:#e8e8e6;font-variant-numeric:tabular-nums">27 / 240</b>`,
  row `display:flex; justify-content:space-between; padding:4px 0`.
- Capacity meter `height:5px; background:#2c2c2e; border-radius:3px; overflow:hidden;
  margin-top:-6px` with fill `display:block; height:100%; width:11%; border-radius:3px;
  background:#ff981f` (flat, no shimmer).
- KV `Tabs` and `2`.
- KV `Updates` and `<b style="color:#6ec873">● live</b>`.
- Primary `height:29px` button, label `Open bank window`,
  `box-shadow:0 2px 10px rgba(255,152,31,.25)`, hover
  `box-shadow:0 3px 16px rgba(255,152,31,.45); transform:translateY(-1px)`.
- Alert info `padding:8px 10px; background:rgba(74,144,217,.07); border-left:3px solid #4a90d9;
  border-radius:4px; color:#b4b4b2; font-size:11px`. Copy verbatim:
  `Items only move in and out of the bank in game. One bank per account, shared by every character.`

### 3.14 Claude panel (`is_claude`, line 386)

Unpaired card (`isUnpaired`): `display:flex; flex-direction:column; gap:8px; padding:12px;
background:linear-gradient(180deg,#242426,#1f1f21); border:1px solid rgba(255,255,255,.07);
border-radius:8px`.
- `<b style="color:#e8e8e6">Pair a Claude session</b>`
- URL row `display:flex; gap:5px`: a readonly mono input `flex:1; min-width:0; height:25px;
  padding:0 9px; background:#141416; border:1px solid rgba(255,255,255,.07); border-radius:6px;
  color:#b4b4b2; font-family:ui-monospace,monospace; font-size:10px`, value
  `https://osrs.scotho.com/pair#7f3a…`; and a `Copy` button `height:25px; padding:0 11px;
  background:#2e2e2d; border:1px solid rgba(255,255,255,.09); border-radius:6px;
  color:#e8e8e6; font-size:11px`.
- KV `Expires in` and `<b style="color:#e8e8e6;font-variant-numeric:tabular-nums">14:22</b>`,
  at `font-size:11px`.
- Alert accent `padding:7px 9px; background:rgba(255,152,31,.07); border-left:3px solid #ff981f;
  border-radius:4px; color:#b4b4b2; font-size:11px`. Copy verbatim:
  `Paste this into your Claude session and say: ` then `<b style="color:#e8e8e6">connect to this</b>`
  then `.`
- Waiting row `display:flex; align-items:center; gap:6px; font-size:11px; color:#7c7c7a`
  with a dot `width:7px; height:7px; border-radius:50%; background:#7c7c7a;
  animation:pulse 1.6s ease-in-out infinite` and copy `Waiting for Claude…`.

Paired (`isPaired`, default true):
- SectionLabel `Paired sessions`.
- Row 1 `display:flex; align-items:center; gap:8px; padding:8px 0;
  border-bottom:1px solid rgba(255,255,255,.05)`: dot `width:8px; height:8px;
  border-radius:50%; background:#43a047; box-shadow:0 0 8px rgba(67,160,71,.6); flex:none`;
  `<b style="color:#e8e8e6;font-size:12px">MacBook</b>` plus
  `<span style="display:block;color:#575755;font-size:10px">Active now · driving this character</span>`;
  `Revoke` outline `height:22px; padding:0 9px; background:none;
  border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#a0a09e; font-size:10px`.
- Row 2 at `padding:8px 0` with no border: dot `8x8 #575755`; `work desktop` and
  `Last seen 3h ago`; `Revoke`.
- Link button `align-self:flex-start; padding:0; background:none; border:0; color:#ff981f;
  font-size:11px`, hover underline, label `Pair another session`.

Then SectionLabel `Link` (`margin-top:2px`), and two KV rows at `padding:2px 0; font-size:11px`:
`Gateway` and `<b style="color:#6ec873">● up</b>`; `Health` and
`<b style="color:#e8e8e6;font-variant-numeric:tabular-nums">fps 50 · rtt 38ms · ws ok</b>`.

### 3.15 Account panel (`is_account`, line 419)

- KV `Signed in as` and `<b style="color:#e8e8e6">someone@example.com</b>`, at `padding:2px 0`.
- KV `Account` and a Badge `height:17px; inline-flex; align-items:center; padding:0 7px;
  border-radius:9px; background:rgba(67,160,71,.16); color:#6ec873; font-size:10px;
  font-weight:650`, label `Email`.
- SectionLabel `Characters · 2 of 3` at `margin-top:2px`.
- Character card 1, this tab: `display:flex; align-items:center; gap:8px; padding:9px 11px;
  background:#232325; border:1px solid rgba(255,255,255,.06); border-left:3px solid #ff981f;
  border-radius:8px`. Body `<b style="color:#e8e8e6">shoth4019zr</b>` plus
  `<span style="display:block;color:#6ec873;font-size:10px">online · this tab</span>`.
  One action: `Delete` outline `height:22px; padding:0 9px; background:none;
  border:1px solid rgba(255,255,255,.12); border-radius:6px; color:#a0a09e; font-size:10px`.
- Character card 2: the same shell without the rail. Body `<b>alt_miner</b>` plus
  `<span style="display:block;color:#575755;font-size:10px">offline</span>`.
  Two actions: `Open tab`, `Delete`.
- Create row `display:flex; gap:6px`: input `placeholder="New character name" maxLength="12"`,
  `flex:1; min-width:0; box-sizing:border-box; height:27px; padding:0 11px; background:#141416;
  border:1px solid rgba(255,255,255,.07); border-radius:6px; color:#e8e8e6; font-size:11px`;
  `Create` button `height:27px; padding:0 11px; background:#2e2e2d;
  border:1px solid rgba(255,255,255,.09); border-radius:6px; color:#e8e8e6; font-size:11px`.
- `Sign out` button `height:29px; background:#2e2e2d; border:1px solid rgba(255,255,255,.09);
  border-radius:6px; color:#e8e8e6; font-size:12px; margin-top:2px`, hover `background:#3a3a38`.

### 3.16 Notes panel (`is_notes`, line 443)

One textarea, `rows="12"`, placeholder `Notes for this character (synced to your account).`,
`width:100%; box-sizing:border-box; flex:1; min-height:160px; padding:9px; background:#141416;
border:1px solid rgba(255,255,255,.07); border-radius:6px; color:#e8e8e6; font-size:12px;
resize:vertical; animation:fadeUp .18s ease`.
Default content, two lines verbatim:
`Willow spot: north of Draynor bank.` and `Need 30 mining before the iron loop is worth it.`

### 3.17 Screenshot panel (`is_shot`, line 448)

- Primary `height:29px` button, label `Capture the canvas`,
  `box-shadow:0 2px 10px rgba(255,152,31,.25)`.
- Thumbnail grid `display:grid; grid-template-columns:1fr 1fr; gap:6px`, four tiles
  `height:58px; background:repeating-linear-gradient(45deg,#141414 0 8px,#191919 8px 16px);
  border:1px solid rgba(255,255,255,.06); border-radius:6px; transition:border-color .12s ease`,
  hover `border-color:rgba(255,152,31,.5)`.
- Caption `<span style="color:#575755;font-size:10px">Keeps the last 10. Click a thumbnail to download.</span>`.

### 3.18 Plugins panel (`is_plugins`, line 460)

Root uses `gap:6px`, not the panel-standard `gap:10px`.
- Search input `height:29px; padding:0 11px; background:#141416;
  border:1px solid rgba(255,255,255,.07); border-radius:6px; color:#e8e8e6; font-size:12px`,
  placeholder `Search plugins`.
- Rows, `<sc-for list="{{ plugins }}">`: `display:flex; align-items:center; gap:9px;
  padding:9px 2px; border-bottom:1px solid rgba(255,255,255,.05)`.
  Body `<b style="color:#e8e8e6;font-size:12px">{{ pl.name }}</b>` plus
  `<span style="display:block;color:#575755;font-size:10px">{{ pl.desc }}</span>`.
  When `pl.always`: `<span style="color:#4e4e4c;font-size:9px">always on</span>`.
  Toggle: `<input type="checkbox" style="accent-color:#ff981f;width:15px;height:15px;cursor:pointer">`,
  `disabled` when `always`.

  The five seeded plugins, verbatim:

  | name | desc | on | always |
  |---|---|---|---|
  | `XP Tracker` | `Per-skill XP, xp/h, actions to next level.` | true | false |
  | `Loot Tracker` | `Items gained this session.` | true | false |
  | `Notes` | `A per-character scratchpad.` | false | false |
  | `Status HUD` | `HP, prayer and run energy over the game.` | true | false |
  | `Claude` | `Pair and manage your Claude session.` | true | true |

### 3.19 Configuration panel (`is_config`, line 473)

Three rows at `display:flex; align-items:center; justify-content:space-between; gap:8px`:
- `Canvas size` (`color:#b4b4b2`) plus a select `height:27px; padding:0 7px; background:#141416;
  border:1px solid rgba(255,255,255,.07); border-radius:6px; color:#e8e8e6; font-size:11px`,
  options `1x`, `2x`, `Fit window` (selected).
- `Scaling` plus a select with options `Smooth`, `Pixelated`.
- `<label ... cursor:pointer>` `Hide overlays` plus a checkbox
  `accent-color:#ff981f; width:15px; height:15px; cursor:pointer`.

Then `Enter fullscreen` button `height:29px; background:#2e2e2d;
border:1px solid rgba(255,255,255,.09); border-radius:6px; color:#e8e8e6; font-size:12px;
margin-top:4px`, hover `background:#3a3a38`.

### 3.20 Icon strip (`data-screen-label="Icon strip"`, line 486)

`<nav role="tablist" aria-orientation="vertical" aria-label="Panels">`,
`width:40px; flex:none; display:flex; flex-direction:column; gap:1px; padding:6px 0;
background:#1a1a1c; border-left:1px solid rgba(0,0,0,.55)`.

Every button: `role="tab"`, with `title` and `aria-label` both set to the visible panel title,
`width:100%; height:33px; display:grid; place-items:center; border:0; background:{{ bg_id }};
color:{{ c_id }}; box-shadow:inset 2px 0 0 {{ r_id }}`, hover
`background:#2a2a2c; color:#e8e8e6; transform:scale(1.06)`.
Bindings: `bg` active `#232325` else `transparent`; `c` active `#ff981f` else `#9a9a98`;
`r` active `#ff981f` else `transparent`.

Order and separators, top to bottom:
1. `Automation` (`go_tasks`), the only one with `position:relative` and the run dot
2. `Claude` (`go_claude`)
- separator `<span style="height:1px;background:#2c2c2e;margin:4px 8px">`
3. `XP Tracker`, 4. `Loot Tracker`, 5. `Events`, 6. `Notes`, 7. `Screenshot`
- separator, the same style
8. `Bank`, 9. `Account`
- `<span style="flex:1">` spacer
10. `Plugins`, 11. `Configuration`

Run dot on Automation (guard `runExists`): `position:absolute; right:5px; top:5px;
width:6px; height:6px; border-radius:50%; background:{{ dotColor }};
box-shadow:0 0 6px {{ dotGlow }}`, using the same `dotColor` and `dotGlow` as the co-pilot bar.

### 3.21 Footer (unlabelled `<footer>`, line 516)

`height:21px; flex:none; display:flex; justify-content:space-between; align-items:center;
padding:0 12px; background:#1a1a1c; border-top:1px solid rgba(0,0,0,.55); font-size:10px;
color:#7c7c7a`.
Left: `someone@example.com`.
Right: `<span style="font-variant-numeric:tabular-nums">fps 50 · rtt 38ms · ws connected · gate: fiddlesticks</span>`.

### 3.22 State machine, timers and declared props

Declared props, from `data-props`:
- `runState`: enum, default `running`, options `["unpaired","standby","running","paused","stuck"]`, section `Simulation`.
- `panelWidth`: range, default `280`, min `240`, max `340`, step `10`, unit `px`, section `Layout`.
- `showHud`: boolean, default `true`, section `Layout`.

Initial state, verbatim:
`{ panel: 'tasks', pinned: null, traceOpen: false, bankOpen: false, secs: 847, resume: 4,
rsOverride: null, xpTick: 0, evChar: 'All', evTypes: [], evSkill: 'all', autoTab: 'my',
onlineSecs: 5347 }`.

One `setInterval` at `1000` ms, cleared in `componentWillUnmount`. Per tick:
- `onlineSecs + 1` always.
- `secs + 1` only when running, so `847` renders `14:07`.
- `xpTick + 1` when `running && secs % 3 === 0`, which is the "every ~3s" README mentions.
- `resume` when paused: `resume > 1 ? resume - 1 : 4`, so it cycles 4, 3, 2, 1, 4 and never
  reaches 0 and never auto-resumes.

Derived counters: `logs = (41 + ticks).toLocaleString()`,
`sessionXp = (4180 + ticks * 25).toLocaleString()`, `elapsed = mm + ':' + ss`
where `mm = floor(secs/60)` and `ss = String(secs % 60).padStart(2,'0')`.

Transitions: `startRun` sets `rsOverride:'running'` plus `{ panel:'tasks', autoTab:'my' }`;
`pauseRun` sets `'paused'` plus `{ resume: 4 }`; `stopRun` sets `'standby'`.
Changing the `runState` prop clears `rsOverride`.

---

## 4. The eight keyframes and the reduced-motion rule

Verbatim from `tokens/motion.css`; the mock's inline `<style>` block is identical apart from
whitespace.

```css
:root { --dur: .13s; --ease: ease; }
@keyframes pulse { 50% { box-shadow: 0 0 0 6px rgba(255,152,31,.10); } }
@keyframes shimmer { to { background-position: -200% 0; } }
@keyframes barflow { to { background-position: -200% 0; } }
@keyframes floatUp { 0% { opacity:0; transform:translateY(8px) scale(.9);} 15% {opacity:1; transform:translateY(0) scale(1);} 75% {opacity:1;} 100% {opacity:0; transform:translateY(-30px);} }
@keyframes fadeUp { from { opacity:0; transform:translateY(6px); } }
@keyframes popIn { from { opacity:0; transform:scale(.94); } }
@keyframes bob { 50% { transform:translateY(-5px); } }
@keyframes stepPulse { 50% { box-shadow: 0 0 0 4px rgba(255,152,31,.15); } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
```

Where each is applied in the mock, with its full shorthand:

| keyframe | applied to | full declaration |
|---|---|---|
| `pulse` | co-pilot dot when running; the "Waiting for Claude" dot | `pulse 1.6s ease-in-out infinite` |
| `shimmer` | XP meter fills: pinned card, both XP panel cards | `shimmer 2.4s linear infinite` |
| `barflow` | the 2px rule under the co-pilot bar, running only | `barflow 2.6s linear infinite` |
| `floatUp` | the XP drop over the canvas | `floatUp 2.6s ease-out forwards` |
| `fadeUp` | every panel body root; the pinned tracker; the Notes textarea | `fadeUp .18s ease` |
| `popIn` | trace window; bank window | `popIn .18s ease` |
| `popIn` | HUD stack | `popIn .2s ease` (the one `.2s` in the file) |
| `bob` | the loot empty-state circle | `bob 2.6s ease-in-out infinite` |
| `stepPulse` | the current quest-step marker in the run card | `stepPulse 1.8s ease-in-out infinite` |

`pulse` is shared by two elements, and `shimmer` and `barflow` have identical bodies
(`to { background-position: -200% 0 }`); both consumers set `background-size: 200% 100%` on the
element itself, so the two names differ only in intent.

Non-keyframe motion, for completeness: `transition: transform .13s ease, border-color .13s ease`
on script and market cards; `transition: border-color .12s ease, background .12s ease` on bank
slots; `transition: border-color .12s ease` on screenshot thumbnails; and the base.css `.13s ease`
on every button and input. The existing `web/src/styles/base.css` already ships the identical
reduced-motion block, written `0.01ms` instead of `.01ms`.

---

## 5. Deltas between README.md and the mock

### 5.1 In the mock, absent from README.md

- **S1. Em dashes throughout the final copy.** At least 13 verbatim strings contain an em dash:
  `not paired — Claude can play this character alongside you`, `paused — you took control`,
  `You took control — resumes in Ns. Esc pauses again any time.`,
  `Items you pick up appear here as you play — or as Claude plays for you.`,
  `Loosen the filters — or go make something happen.`, `Paused — you moved the mouse`,
  `Mine and drop failed — needs a bronze pickaxe`, `Bank updated — 27 / 240 slots used`,
  `Gateway connected — ws ok`, `312 events · popped out — the panel stays free`,
  `view & reorder only — items move in game`, `(same-origin iframe — never restyled)`, and
  `stuck on Chop tree` is fine but its README gloss is not. README calls copy final, and the
  design authority order puts the mock above everything for literals. The sprint constraint says
  no em dashes in any new prose. The plan has to rule explicitly on whether shipped UI copy
  counts as new prose or as a design literal, because roughly a dozen strings are affected.
- **S2. Six panels the README never describes.** README's "Screens / surfaces" section covers
  the frame, the co-pilot bar, the run card, Automation, Events, the trace window, the bank
  window, canvas overlays, the loot empty state and the account panel. The mock fully specifies
  five more panels the README never mentions at all: **Claude** (pairing card, paired-session
  rows, Link health KVs), **Notes**, **Screenshot**, **Plugins** and **Configuration**, and gives
  the **XP Tracker** panel a complete two-card layout that README only alludes to via the pinned
  tracker.
- **S3. The bank window footer.** README describes the bank header, tab rail and slot grid but not
  the footer: `Swap`/`Insert` mode buttons, `1`/`5`/`All` quantity buttons, a `Search` input and
  the caption `view & reorder only — items move in game`. It also does not mention the dashed `+`
  add-tab button in the tab rail.
- **S4. The persistent `Claude` label** in the co-pilot bar (`color:#e8e8e6; font-weight:650;
  letter-spacing:.01em`), present in all five states and not listed in README's per-state copy.
- **S5. Elapsed in the paused and stuck states.** README lists the mono elapsed only under
  `running`. The mock shows it in paused (`#ffb300`) and stuck (`#7c7c7a`) too.
- **S6. Untokenised colours.** `#1b1b1d` (char tab bar, trace header), `#28282a` (active char tab
  gradient top), `#2a2a2c` (strip hover), `#2c2c2e` (meter track, event char badge), `#3e3e3c`
  (kbd border), `#666` (unpaired dot), `#9a9a98` (resting strip glyph), `#a0a09e` (outline label,
  tag, neutral badge), `#f07370` (error badge text), `#2e7d32` (xp-drop chip), `#ffff00` and
  `#00ff80` (bank counts), `#252220` / `#2c2925` / `#33302c` / `#171513` / `#4e4a44` (bank warm
  palette), `#141414` / `#191919` (screenshot thumbs), `#0a0a0a` / `#0d0d0d` (canvas placeholder).
  A token port that only copies `tokens/colors.css` will still leave roughly 20 hard-coded hex
  values in the CSS.
- **S7. Card border alpha is `.06`, not `.05`.** `Card.jsx` specifies
  `1px solid var(--hairline-soft)` = `rgba(255,255,255,.05)`. Every card in the mock's side panel
  uses `rgba(255,255,255,.06)`; the run card and the Claude pairing card use `.07`. Similarly the
  default button border is `rgba(255,255,255,.09)` in the mock and `var(--hairline-strong)` (`.12`)
  in `Button.jsx`; `.12` is used only for outline buttons.
- **S8. The run card's badge is not the Badge component.** Badge spec is `height:17; radius:9;
  font-weight:650; padding:0 7px`. The run card badge is `height:19; radius:10; font-weight:700;
  padding:0 8px; letter-spacing:.03em`. The script card badges are `height:16; radius:8;
  font-weight:650`, which is Tag's geometry with Badge's colours. The event char badge is
  `height:15; radius:8; font-size:9px`. Four different badge geometries in one mock.
- **S9. The Navigation demo card contradicts the strip.** `navigation.card.html` lists nine strip
  entries (`automation, claude, xp, loot, events, bank, account, plugins, config`) and omits
  `notes` and `screenshot`, which the mock's strip does include. Eleven icons exist; the demo card
  exercises nine.
- **S10. The XP-drop chip carries an inset white highlight** (`box-shadow: inset 0 0 0 1px
  rgba(255,255,255,.25)`) that README's description ("9px rounded square, skill color, 1px black
  border") omits, and the chip colour is a hard-coded `#2e7d32`, not a skill-colour lookup.
- **S11. The paused auto-resume never fires.** README says the countdown ticks per second with a
  5000 ms settings default. The mock's counter starts at 4, ticks down to 1, then jumps back to 4.
  There is no resume-at-zero transition in the mock at all.
- **S12. Structural quirk:** the Marketplace `<sc-if>` is a sibling of the `is_tasks` block, not a
  child, and `onTasksTab` is `autoTab === 'my'` with no panel check, so the My-tasks content is
  nominally reachable from other panels. This is a mock-authoring artifact, not a spec.
- **S13. The 2004 client iframe is 789x532** and the stage clamps to `min(789px,100%)` with
  `aspect-ratio:789/532`. README states the size only in the design-system readme prose.

### 5.2 In README.md, contradicted or unsupported by the mock

- **S14. Run-card elapsed size.** README says "Badge + mono elapsed 14px". The mock's run card uses
  `font-size:16px`. 14px is the co-pilot bar's elapsed. The mock wins per the authority order.
- **S15. Region borders.** README says region borders are `rgba(0,0,0,.55)`. The title bar uses
  `rgba(0,0,0,.6)`; the panel header, both window headers and the pinned tracker use
  `rgba(0,0,0,.5)`; the canvas uses `rgba(0,0,0,.7)`. `.55` is only the char-tab bar bottom, the
  side panel left border, the strip left border and the footer top.
- **S16. "Loot empty state (pattern for all empty states)".** The Events empty state deviates on
  every metric: circle `34` vs `40`, glyph `⌕` vs `◌`, no `bob` animation, title `12.5px` vs
  `13.5px`, copy `max-width:180px` vs `190px`, `gap:7px` vs `9px`, `padding:28px 12px` vs
  `36px 12px`, and its action is a grey default `height:24px` button rather than a primary
  `height:27px`. There is no single empty-state pattern in the mock; there are two.
- **S17. History rows "mono meta".** The mock's history meta spans set neither `font-family` nor
  `font-variant-numeric`, so `18:42 · 4,180 xp · 41 logs` renders in the UI font. The same applies
  to the bank window's `27 / 240` capacity (tabular-nums only, no mono) and the inactive char
  tab's `offline`.
- **S18. Automation "Run primary/Fork/Edit xs buttons".** All three are `height:25px` (the `sm`
  size), not `xs` (22). The History `Trace` button is the only true xs, and it uses `font-size:10`
  where the xs spec is `10.5`.
- **S19. Account "tier Badge".** The mock's Account badge reads `Email` on an ok tone, which is an
  auth-method label, not a tier. There is no tier anywhere in the mock.
- **S20. Canvas pill metrics.** `OverlayPill.jsx` is `padding:2px 7px; font-size:10.5`. Both canvas
  corner pills in the mock are `padding:3px 8px; font-size:11px`. Only the HUD pills and the boost
  pill match the component. The running pairing pill's border is also `rgba(255,152,31,.4)` where
  the component's `accent` tone is `.35`.
- **S21. Meter radius.** `Meter.jsx` computes `border-radius: height/2 + 1` (so `3.5px` at
  `height:5`); every meter in the mock writes a flat `3px`. And the HUD fills are the flat tone
  colour, not the component's two-stop gradient.
- **S22. Button sizes versus control-height tokens.** The bank footer uses `height:23px` with
  `border-radius:5px`, and the panel-header Pin, XP Reset and Claude Copy buttons use `height:23px`
  or `height:24px`. Neither 23 nor 24 is one of the four declared control heights (22/25/27/29),
  and 5px is not one of the six declared radii.
- **S23. "No emoji. Ever."** The mock ships `⚠` as an icon in front of the My-tasks requirement
  line and `✓` inside the `Added ✓` button and the done quest-step marker. The `∞` bank tab and
  `◌`/`⌕`/`●`/`×`/`+` are defensible as data or as controls, but the `⚠` is decorative and
  directly contradicts the brand guide's iconography rule.
- **S24. Radii README claims but no file defines.** README's "Design tokens" summary lists
  "radii 3/5/6/7/8/10"; `tokens/spacing.css` defines 3, 6, 7, 8 and 10 but no `5px` radius token,
  even though 5px is used (segmented inner button, bank footer buttons).
- **S25. No token for the title bar (28px), footer (21px), char tabs (32px), strip button height
  (33px) or panel header (34px).** `tokens/spacing.css` gives only `--panel-w` and `--strip-w`.
  The existing `web/src/styles/tokens.css` does have `--title-h` and `--foot-h`, at the old values
  22px and 18px.
- **S26. `SKILL.md` is in README's file list** but is not in the bundle; `PROVENANCE.md` records
  that it became `.claude/skills/idlescape-design/SKILL.md`. `design-system-readme.md` also
  references a `guidelines/` directory that does not exist in the vendored copy, and every
  `components/**/*.card.html` references `../../_ds_bundle.js`, which is also absent, so the five
  demo cards cannot render as shipped.
- **S27. Marketplace strip removal is visible; the characters merge is not.** The mock's strip has
  exactly the 11 buttons and neither a `marketplace` nor a `characters` id, so it already reflects
  the end state. But the mock offers no migration surface, no fallback and no trace of the old ids;
  the `characters` to `account` resolver fallback, and `tasks` surviving as the plugin id under the
  Automation title, are constraints the mock silently satisfies rather than documents.

---

## 6. Quick index for a plan author

| Need | Section |
|---|---|
| Token names, values, and what they replace | 1.1 to 1.9 |
| base.css fold | 1.10 |
| Button sizes and variants | 2.1 |
| The 11 SVG glyph paths | 2.7 |
| Frame geometry: title, tabs, panel, strip, footer | 3.1, 3.2, 3.7, 3.20, 3.21 |
| Co-pilot bar, five states | 3.3 |
| Canvas overlays and the XP drop | 3.4 |
| Trace window | 3.5 |
| Bank window | 3.6 |
| Run card | 3.9 |
| Automation tabs and cards | 3.9 |
| Events panel and its empty state | 3.12 |
| Loot empty state | 3.11 |
| Account panel | 3.15 |
| Pinned tracker and pin logic | 3.8 |
| Online timer format | 3.2 |
| Timers, state machine, props | 3.22 |
| Keyframes and reduced motion | 4 |
| Where README and the mock disagree | 5 |
