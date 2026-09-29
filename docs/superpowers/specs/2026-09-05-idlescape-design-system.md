# Idlescape — Design system and client component set

Date: 2026-09-05. Branch: `feat/platform-shell`. Status: implemented in the same change as the
`the earlier name -> idlescape` rename.

## 1. Brief

Three things landed together:

1. **Rename.** The product is `idlescape` everywhere the name is a name: page title, wordmark,
   package names, the `window.idlescape` hook global and its `idlescape:client-ready` event, the
   pairing skill (`~/.claude/skills/idlescape/SKILL.md`, MCP server `idlescape`), logs, docs.
   Identifiers that live on infrastructure created under the old name stay as they are on purpose:
   Firebase project `idlescape-osrs` and the `idlescape-web` app, the Lightsail instance,
   AWS profile and key pair, the `/opt/idlescape` box root, the compose project `idlescape`
   (its volumes hold the engine sqlite), the `idlescape` Cloudflare tunnel, the
   `idlescape-*` Windows scheduled tasks, and the `cs.*` localStorage keys (renaming those
   would silently reset every player's saved panel and plugin state). Each is a migration, not a
   find-and-replace.
2. **One Claude tab.** The shell had two: a stub "Claude" panel whose only content was a button to
   open "Claude Connection". The stub is gone. The connection panel keeps its id (`connect`, so
   saved panel state and e2e selectors survive) and takes the name "Claude" and the ✦ icon.
3. **A design system** for the web shell: tokens, a component set, the TypeScript helpers those
   components need, and a living styleguide page.

## 2. Design direction

**Subject.** A browser-playable 2004-era RuneScape with a Claude companion that can play alongside
you. The audience already lives in RuneLite. The shell's job is to get a player into the game in
one click and to make the side panel feel like RuneLite's sidebar: dense, dark, legible, unfussy.

**Palette** (kept as RGB triplets so `rgba(var(--x), a)` keeps working):

| token | value | role |
|---|---|---|
| `--rl-window` | `#1b1b1b` | page ground |
| `--rl-darker` | `#1e1e1e` | title bar, strip, footer, inputs |
| `--rl-panel` | `#282828` | side panel, cards |
| `--rl-hover` | `#323232` | raised controls, hover |
| `--rl-border` | `#111111` | every 1px rule |
| `--rl-orange` | `#ff981f` | the one accent: active tab, primary action, focus ring, wordmark |
| `--rl-ok / warn / error / info` | `#43a047 / #ffb300 / #e53935 / #4a90d9` | semantic tones |
| `--rl-danger` | `#a02828` | destructive buttons (from the characters plugin) |

**Type.** Two families with clearly different jobs. The game voice is a pixel face, Pixelify Sans
(Google Fonts, monospace fallback): the wordmark, canvas overlays and HUD numerals. The tool voice
is the system UI stack at 12-13px, the same size RuneLite renders its panels at. Scale:
10 / 11 / 12 / 13 / 15 / 18 / 24.

**Layout.** Unchanged skeleton: title bar, canvas + side panel + icon strip, footer. The canvas is
the hero; chrome is 1px rules, 2px radii, no shadows. Content inside cards is left-aligned; only
the wordmark is centred. The icon strip becomes a real tab list (roles, arrow-key navigation, a
tooltip) with RuneLite's orange rail marking the open tab.

**Principles.**
- One accent. Orange means "this is the current thing" or "this is the main action". Nothing else
  is orange.
- RuneLite density, web hit targets: 28px controls, 36px on coarse pointers.
- Motion only answers an action (panel open, toast enter, dialog open) and stops under
  `prefers-reduced-motion`.
- Words do one job, in sentence case, and name the action they perform: "Revoke" produces
  "Revoked". Labels are sentence case, not tracked capitals.

Self-check against the generic dark-plus-one-accent default: the brief pins RuneLite, so the dark
neutral base is a choice, not a default. What was cut to keep it honest: uppercase tracked labels
(`.p-label` is now sentence case), middle-dot meta strings in the footer (cells with spacing
instead), decorative shadows, gradient washes, arrows on buttons.

## 3. Files

```
web/src/styles/
  index.css        single entry, @imports the rest in cascade order
  tokens.css       colour, spacing, type, radius, motion, z-index, control sizes
  base.css         reset, body, focus ring, scrollbars, .hidden/.sr-only, reduced motion
  layout.css       .stack .cluster .spread .grid-2 .card-screen .card .section
  button.css       .btn (+ primary/ghost/danger/sm/icon/block/is-loading) .link; .p-btn aliases
  forms.css        .input .select .checkbox .switch .field/.field-*; .p-input alias; .p-setting
  data.css         .kv/.p-row .p-label .p-value .badge .dot .alert .meter .table/.p-table
                   .p-msg .p-empty; plugin rows, session rows, character rows, connect card,
                   patch notes, screenshot strip
  frame.css        .frame .frame-title .brand .side-panel .panel-header .icon-strip .strip-btn
                   .frame-foot .offline
  overlays.css     canvas overlays, HUD, toasts
  dialog.css       native <dialog> styling
web/src/ui/
  el.ts            h(tag, attrs, ...children) element builder
  dialog.ts        confirmDialog({ title, body, confirmLabel, danger }) on <dialog>, falls back
                   to window.confirm where showModal is missing
  toast.ts         createToastHost(root).show(message, tone, ms)
  strip.ts         applyTabListA11y(strip): roles, aria-selected, arrow-key focus movement
web/styleguide.html + web/src/styleguide.ts   living design library (served at /styleguide)
```

Backwards compatibility: every class the existing panels and tests use (`.p-btn`, `.p-input`,
`.p-row`, `.p-label`, `.p-value`, `.p-empty`, `.p-error`, `.p-ok`, `.p-table`, `.p-msg`, `.btn`,
`.input`, `.link`, `.card`, `.stack`, `.strip-btn.active`, `.hud*`, `.ov*`) still exists and is
restyled in place, so the in-flight characters plugin and every id-based test keep working.

## 4. Behaviour changes

- Revoking a Claude session asks through the in-page confirm dialog instead of `window.confirm`.
- Plugin `notify()` shows a toast at the bottom of the canvas; the overlay status line is left for
  connection state only.
- The icon strip is keyboard navigable (arrow keys, Home/End) and each tab has a tooltip.
- `/styleguide` is a real route on the front server (no-cache HTML, like `/`).

## 5. Testing

Unit (vitest, jsdom): the three helpers get tests; existing panel and view tests keep passing
unchanged apart from the renamed manifest. `tsc --noEmit`, `eslint`, `vite build`. Server router
test covers `/styleguide`. The Playwright suite needs the full stack and is not part of this
change's verification.
