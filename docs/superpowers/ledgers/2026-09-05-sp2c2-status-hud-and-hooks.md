# SP2c-2: status HUD and hooks ledger

Plan: `docs/superpowers/plans/2026-09-05-sp2c2-status-hud-and-hooks.md` (3 tasks). Spec: `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md`, `status-hud` row (shell plugin: HP/prayer/energy bars with numbers, boost countdown). Branch: `feat/platform-shell`. Plan committed at `91d4f06ae39555f95afb29ed0c4a8d2066a6424e`. Task commits: `c76aa58e56a49ab50f1039375b09acded064d206` (T1), `9772afaa13e554fecadeb56be1aa4a9fd1ed1c1e` (T2), `e9795d60fcaa38bf5907fee32d690de11a64adcc` (T3, final). Final review: controller inspection, no findings.

## Rulings

- **Verified field names before writing T1**, rather than trusting the spec's naming: `statEffectiveLevel`/`statBaseLevel`/`runenergy`; `Skill` index `hitpoints=3`, `prayer=5`; `runenergy` range 0-100. Reason: these are read off the client's internal `ClientState`/`Skill` shape, which the spec did not pin down to field level; guessing wrong would have shipped a HUD reading the wrong stat silently. Cost if wrong: T2 and T3 both build on these names, so a wrong field would have surfaced as a silently-empty or mis-scaled bar, not a build failure.
- **`hp`/`prayer`/`energy`/`boosts`/`current`/`max` added to the terser property-name reserve list.** Reason: terser mangles object properties in the production bundle; any of these names left unreserved would work in dev and break silently once minified. Cost if wrong: a HUD that works in `bun run build:dev` / tests but reads `undefined` in the shipped bundle, the kind of bug that only shows up after deploy.
- **Client verification gate is `bun run build:dev` (bundle) + `bun test src/hooks`, not strict `tsc` over `client/src`.** Reason recorded verbatim (dash normalized): "Client.ts is a huge upstream fork; strict tsc would be noisy, bundle-success is the gate; web tsc checks the mirror + consumer." Cost if wrong: none observed, bundle stayed green and `web/` tsc (which does run strict) caught the consumer side.
- **`onIconStripChange` chosen as the HUD's refresh trigger in T3.** Reason: it "fires on every enable/disable/init," giving a reliable signal without a bespoke event. Cost if wrong: HUD would silently stop refreshing on plugin toggle; not observed, review confirmed the wiring.
- **Pre-flight scan ruled the three tasks non-overlapping and safe to run serially T1 to T2 to T3, not in parallel.** File ownership: only T1 touches `client/*`; only T3 touches `main.ts`/`frame.html`/`frame.css`; T2 is a standalone new file. Reason: T2 and T3 both depend on T1's field names, so serial order was required regardless; the scan additionally confirmed no file collisions existed to justify any parallelism. Cost if wrong: none, scan was correct, no rework.

## Deferred / follow-ups

- **Live e2e of the HUD over the canvas**, deferred at close, reason: "memory-constrained stack." No destination assigned; runs whenever the dev stack is available. Not picked up by a later entry as of this writing.
- **`quest-helper` and `skill-calc` plugins**, spec'd in the same `2026-09-05-sp2-plugin-framework-design.md` (rows for both) but explicitly out of scope here: "need `scripts/gen/*` content-derived data" neither generator exists yet. Per `docs/superpowers/specs/2026-09-07-project-audit.md` (C31/C32), as of the audit both plugins still have zero references anywhere in the tree and no destination/row has been assigned.
- **`hiscores` plugin**, deferred to "SP3 API." Per decisions ledger D14, this was later resolved by adding SP3b (snapshot ingest, tracker database, hiscores and player pages, Hiscores panel) immediately before SP10, carrying the hiscores plugin's data dependency.
- **SP2b GPU renderer**, flagged at close as "long pole; needs upstream Client-TS 225-gpu branch access + client-tier registry." Per decisions ledger D18, the client plugin tier was later declared dormant for the sprint; SP2b-2 (GL present path) and `advanced-controls` moved to the after-sprint row 10 as a candidate, not a commitment.

## Measured facts

- Task 1: hooks tests 6/6, web tsc 0 errors, bundle confirms `hp`/`prayer`/`energy`/`boosts`/`current`/`max` survive minification unmangled.
- Task 2: 5/5 tests + typecheck clean.
- Task 3: typecheck 0 errors, 91 web tests, build green.
- End state (HEAD `e9795d6`): web suite 91 tests + build green; client bundle green; hooks 6/6.

## Traps recorded

- `client/src/hooks/types.ts` and `web/src/clientTypes.ts` are two copies of `ClientState` that **must stay identical by hand**, no shared source, no generator. A field added to one and not the other is a silent type-drift bug, not a build error, until something reads the missing field.
- Terser's property mangling is invisible in dev and in `bun run build:dev`'s unit-test path; only the reserved-name list in the bundler config stands between a passing test suite and a broken production bundle. Any new `ClientState` field consumed by name in a plugin needs adding to that list, not just to the two type files.
- `client/src/hooks/Client.ts` is described as "a huge upstream fork," strict `tsc` over it is treated as permanently noisy, so it is deliberately excluded from the gate. Anyone tightening client-side type checking later will need to either clean this file first or keep carving out the same exception.

## Per-task table

| Task | Built | Commit range | Fix rounds |
|---|---|---|---|
| T1 | `ClientState` extended in `client/src/hooks/types.ts` + `web/src/clientTypes.ts` (kept identical by hand) and `Client.ts` hookState; `hp`/`prayer`/`energy`/`boosts`/`current`/`max` added to the bundler's terser reserve list | base `91d4f06` → `c76aa58e56a49ab50f1039375b09acded064d206` | 0 (review clean first pass) |
| T2 | `web/src/plugins/builtin/statusHud.ts` + test: canvas overlay polling `getState()` for HP/prayer/energy bars and a boost summary; `escapeHtml` on labels and skill names; `max > 0` guard; `setInterval`/`clearInterval` lifecycle on enable/disable; `showBoosts` setting | `c76aa58` → `9772afaa13e554fecadeb56be1aa4a9fd1ed1c1e` | 0 (review clean first pass) |
| T3 | `main.ts` renders `shell.overlaysFor()` into a new `#plugin-overlays` host inside `rebuildStrip` (previously the SP2a overlay registry existed but was never rendered) and registers `status-hud`; `#plugin-overlays` host added to `frame.html`; HUD styles added to `frame.css` using existing design tokens | `9772afa` → `e9795d60fcaa38bf5907fee32d690de11a64adcc` | 0 (review clean first pass) |
