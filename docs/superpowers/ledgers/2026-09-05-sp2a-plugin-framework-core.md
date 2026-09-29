# SP2a — plugin framework core

Plan: `docs/superpowers/plans/2026-09-05-sp2a-plugin-framework-core.md`
Spec: `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` (SP2) — this plan implements the framework-core slice; the GPU renderer (spec section 4) is SP2b, the tier-1 shell plugins and generated data (spec sections 5, 3.4) are SP2c.
Branch: `feat/platform-shell` at the time this sub-project ran (now folded into `sprint/dragon-slayer`).
Commit range: `eacc465` (plan commit) `..da94f11` (final-review fix wave). Task commits: `9e33175`, `39ff783`, `d748f60`, `d562ef3`, `9284489`, `9376281`, `d672212`+`9bc4c7c` (focus fix), `74d02db`+`1f9225f` (fix round 1), `da94f11` (SP2a final-review fix wave).

Source: `.superpowers/sdd/2026-09-05-sp2a-plugin-framework-core/progress.md`, read in full.

## Rulings

- **T8 Step 4 first-draft `rebuildStrip`, superseded in the same plan step.** Ruling: not a defect — implementers use the simplified version the plan explicitly names; reviewer told to expect it. Cost if wrong: minor reviewer confusion, none to code.
- **T8 `contextFor()` closes over a `const` declared later in the file.** Ruling: fine — function-declaration hoisting plus late-const capture, only invoked during `shell.init()` after construction completes. Cost if wrong: none (pre-flight scan, not exercised).
- **T5 plan used form-level delegated `input`/`change` listeners; tests dispatch non-bubbling `new Event(...)`, so delegation would never fire.** Implementer switched `settingsForm.ts` to per-control listeners instead. Ruling: OK — strictly more robust, same interface, works for both synthetic and real events (real `input` bubbles anyway). Carry-forward: prefer per-control listeners in any future form reuse (SP2c or later). Cost if wrong: none observed.
- **T7 plan tests dispatch non-bubbling `new Event()`, but `pluginsPanel.ts` needs body-level event delegation** (the list re-renders on every toggle, so per-control listeners would be destroyed and reattached each render). Ruling: keep delegation in the implementation, fix the tests to dispatch bubbling events instead of switching the panel to per-control listeners. Cost if wrong: would have meant re-binding listeners on every re-render, a real perf/correctness regression for a frequently-redrawn list.
- **T7 review found a real plan bug, not just a deviation:** the search handler focused the pre-render (detached) input, so the search box lost focus on every keystroke. Fixed in the same review pass — focus the freshly-rendered input and restore the caret position; added a focus-retention regression test. Cost if wrong (had it shipped): every keystroke in the plugin search box would have dropped focus, making search unusable.
- **T7 implementer also swapped `CSS.escape` for a `querySelectorAll[data-settings]` match.** Authorized deviation, folded into the task-complete commit alongside the bubbling-event test fix.
- **T8 final-review fix wave (4 findings, all fixed, commit `da94f11`):**
  - [Important] `registry.init()` did not reset enabled state on a uid change, so switching accounts leaked the previous session's active plugins forward. Fixed: deactivate all plugins before reload + regression test.
  - [Important] Debounced Firestore settings writes could be lost on a quick tab close inside the 800ms debounce window. Fixed: flush `settingsStore` on `window pagehide` (wired in `main.ts`).
  - [Minor] `defaultEnabled` let a stale stored `enabled:false` override `alwaysOn`, so an always-on plugin could end up disabled. Fixed: `alwaysOn` short-circuits first + regression test. This closes the same latent hardening gap the Task 6 note below flagged, one layer up (settings precedence rather than dependency ordering).
  - [Minor, cosmetic] The config/gear icon lost its `strip-gear` bottom-pinned styling when the strip went dynamic. Restored in `rebuildStrip`.
  - Gate after the fix wave: typecheck 0, unit 69/69, build 0. Security pass confirmed `escapeHtml`/`textContent` coverage and no client/engine import leak from `web/`. No residual findings.
- **T8 fix round 1 (commit `1f9225f`, pre-final-review, from the implementer's 3 self-flagged concerns, all real):**
  1. Icon-strip buttons used class `icon-btn`; renamed to `strip-btn` to match existing CSS.
  2. `frame.html`'s static strip buttons removed — the strip is now fully dynamic, which also avoids a wrong-icon flash before the registry initializes.
  3. e2e spec relocated from `web/tests/plugins.e2e.ts` to `web/e2e/plugins.pw.test.ts` — Playwright's `testDir` is `e2e` and its glob is `*.pw.test.ts`, so the original path and name were never collected. After the move: 4 tests across 2 files.
  4. `frame/panels.ts` `register()` did not dedupe by plugin id, so a rebuild of the strip accumulated duplicate manifest rows each time; fixed to dedupe by id.

## Deferred / parked / carry-forward

- **SP2b (client-tier plugin registry, GPU renderer)** — its own plan and ledger. Wires `onClientToggle`, currently a console.info no-op in `main.ts` at SP2a's end. Consumes SP2a's registry seam directly.
- **SP2c (tier-1 shell plugins + generated data)** — its own plan and ledger. Builds on this framework; `hooks ClientState` needs hp/prayer/energy/boosts added for status-hud (a client-fork change), noted as a prerequisite but not done in SP2a.
- **`plugins.pw.test.ts` e2e run** — authored in Task 8 but never executed; the stack was memory-constrained this session. Deferred to whenever the full stack can start. (Not to be confused with the Firestore-rules emulator run, which did complete — see Measured facts.)
- **Task 6 deferred hardening, later folded into T8's final-review fix wave:** `registry.init()` orders plugins by `requires` but did not re-guard a `defaultEnabled`/stored-enabled plugin whose required dependency is disabled — it would activate without the dep anyway. No plugin used `requires` in SP2a, so it was latent, not exercised. Carry-forward: address when `requires` gets its first real consumer (SP2b's GPU plugin, or SP5). Cost if wrong: a `requires`-declaring plugin could activate without its dependency; none observed in SP2a since no plugin used `requires`. Status: still open as stated — the final-review fix wave closed the adjacent `alwaysOn`-vs-stored-`enabled` gap, not this dependency-ordering gap.
- **Deploy stayed controller-gated throughout** — nothing in SP2a touched `osrs.scotho.com`; the live PoC (ports 8888/43594/8898) was untouched by plan constraint.

## Measured facts

- 8 tasks, 8 task commits plus 1 mid-task fix (T7 focus fix, folded into the same task-complete note) plus 1 post-task fix round (T8, `1f9225f`) plus 1 final-review fix wave (`da94f11`).
- Firestore rules emulator: 16/16 passing at Task 4, including the SP1 "gameNames is not readable" test from `426029d` — this closed out SP1's final-review Fix 2 emulator verification, which had been deferred for memory reasons. No further action needed for SP1 from this.
- Task 8 gate at implementer-done: typecheck 0, unit 67/67, build 0, e2e deferred (stack unavailable).
- Task 8 gate after fix round 1 (`1f9225f`): typecheck 0, unit 0 (no new failures — count not re-quoted in source beyond "0"), build 0, `playwright --list` OK (4 tests/2 files after the e2e relocation).
- Final gate after the SP2a final-review fix wave (`da94f11`): typecheck 0, unit 69/69, build 0.
- Reviews: Tasks 1-7 were controller-inspection reviews (no separate reviewer subagent); Task 8 additionally got a full reviewer subagent (model opus) covering `main.ts` wiring plus a cross-cutting pass over the whole `web/src/plugins/*` module, focused on the `9bc4c7c..1f9225f` range.

## Traps recorded

- **Branch note:** the repo was on `feat/platform-shell`, not `develop` — the session-start branch line was stale. All of SP1 + SP2a ran linear on `feat/platform-shell`; `develop` was old (at `1a738f4`). A separate `feat/wiki-corpus` worktree had in-flight, unrelated work from another session and was not to be touched. No divergence; no merge to `develop`/`main` without owner consent.
- **npm invocation under Git Bash on Windows:** implementers had to run npm via `MSYS2_ARG_CONV_EXCL="*" cmd.exe /c "npm ..."` — a bare `cmd.exe /c` gets its `/c` argument mangled by Git Bash's MSYS path-conversion.
- **Firestore emulator was memory-constrained this session** (had already been killed 3 times during SP1). Task 4's implementer was told to try the emulator once and fall back to inspection if it died again, and explicitly not to kill other processes to free memory. It succeeded (16/16) on this attempt.
- **Playwright collection trap:** a spec file living at `web/tests/plugins.e2e.ts` is silently never collected — `testDir` is `e2e` and the glob requires `*.pw.test.ts`. Caught and fixed in Task 8 fix round 1 by relocating to `web/e2e/plugins.pw.test.ts`.
- **Test-event bubbling matters for delegated listeners:** `new Event(...)` without `{ bubbles: true }` will not trigger a body-level delegated listener. This bit both T5 (resolved by switching the implementation to per-control listeners) and T7 (resolved by fixing the tests instead, since T7's implementation needed delegation for correctness). The two tasks took opposite fixes for the same underlying test-authoring gap in the plan, correctly, based on which side (implementation vs. delegation requirement) was actually load-bearing.

## Per-task table

| Task | Built | Commit range | Fix rounds |
|---|---|---|---|
| T1 | `web/src/plugins/types.ts` + test — manifest/`SettingValue`/`SettingsValues`/`PluginManifest`/`ShellPlugin`/`PluginContext` types, `definePlugin` (pure transcription from plan) | `9e33175` | 0 |
| T2 | `web/src/plugins/settings.ts` + test — persistence store, firestore-then-localStorage precedence, debounced writes, null-uid = localStorage-only, write coalescing (fake timers) | `39ff783` | 0 |
| T3 | `web/src/plugins/firestoreBackend.ts` + test — `SettingsBackend` adapter over `users/{uid}/plugins`, strips `updatedAt` on load, `serverTimestamp`+merge on write | `d748f60` | 0 |
| T4 | `firestore.rules` + `rules.test.ts` — `users/{uid}/plugins` subcollection, owner-only, `enabled` must be bool, `settings` must be map | `d562ef3` | 0 |
| T5 | `web/src/plugins/settingsForm.ts` + test — `SettingSchema` to form (boolean/number/select/color/text), coerced values, escaped labels (jsdom) | `9284489` | 0 (plan defect fixed in-flight, see Rulings) |
| T6 | `web/src/plugins/registry.ts` + test — `ShellPluginRegistry`: register/init/enable/disable/setSetting, topological `requires` ordering, `alwaysOn`/`defaultEnabled`, client-tier `onClientToggle` seam, icon-strip emit (6 test cases) | `9376281` | 0 (one hardening gap deferred, see Rulings/Deferred) |
| T7 | `web/src/plugins/pluginsPanel.ts` + test — list/search/toggle/gear/always-on rows/escaping | `d672212` + `9bc4c7c` (focus fix) | 1 (search-focus bug found and fixed same pass) |
| T8 | `main.ts` rewire, `types.ts` `PanelId += 'plugins'`, `plugins.e2e.ts` (relocated) — integration: registry construction, six SP1 panels registered as plugins, Plugins panel wired in | `74d02db` + `1f9225f` (fix round 1) + `da94f11` (final-review fix wave) | 2 (implementer self-flagged fix round, then full reviewer subagent final-review fix wave) |
