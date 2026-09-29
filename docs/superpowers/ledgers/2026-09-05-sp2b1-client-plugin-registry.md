# Ledger: SP2b-1 client-tier plugin registry

Plan: `docs/superpowers/plans/2026-09-05-sp2b1-client-plugin-registry.md` ("SP2b-1 - Client-tier
Plugin Registry Implementation Plan"). Slug matches the ledger's own directory name exactly
(`2026-09-05-sp2b1-client-plugin-registry`), no drift to record.

Spec: `docs/superpowers/specs/2026-09-05-sp2-plugin-framework-design.md` (SP2 section 3.1, the
client tier and `ClientCapability`), as revised by
`docs/superpowers/specs/2026-09-05-sp2b-gpu-spike-findings.md` (this plan is the staging slice
SP2b-1 of that revision).

Branch: `feat/platform-shell` (later merged into `sprint/dragon-slayer`, where all four commits
below are present and reachable).

Commit range: `51d9b79` (the plan commit, "docs(plan): SP2b-1 client-tier plugin registry, 3
tasks") through `6a18cff` (Task 3, plan complete). Three implementation commits total:
`66d53e5`, `919ad97`, `6a18cff`.

## Rulings

**Task 2, skipped the empirical terser production-build check.** The brief's gate only ran
`build:dev`; a full production build (`bun run bundle.ts`, no `dev` arg) was not run to confirm
`plugins`/`enable`/`disable` survive mangling. Reason given: "memory-heavy; OOM risk on this
machine." Accepted by strong inference instead, the same flat `mangle.properties.reserved`
allowlist already proven for `client`/`getState` (live PoC reads them through terser) got the new
names added identically, same block, same pattern. Deferred the empirical check to SP2b-2's
end-to-end exercise or the next full `verify.ps1` run. **Cost if wrong:** web reads `undefined`
for `plugins.enable` at SP2b-2 integration, caught there immediately, one-line fix.

No other rulings were recorded; Tasks 1 and 3 passed review on the first pass with no judgment
calls beyond the brief.

## Deferred / parked / follow-up

- **Terser production-build confirmation for `plugins`/`enable`/`disable`** (the Task 2 ruling,
  above), carried forward explicitly to "SP2b-2 integration" in the plan-complete note. Status
  as of this promotion: not confirmed anywhere in this ledger's own record: check SP2b-2's ledger
  (once promoted) for whether it actually exercised a production build against this reserved
  list.
- **`Installed`'s return value does not also expose the registry** (Task 2 report, "Concerns").
  The brief allowed exposing the registry via `installHooks`'s return value as optional; window
  exposure alone was judged sufficient, nothing added to the return type. Flagged in case a
  downstream task (SP2b-2/SP5) expects `installed.plugins` in addition to
  `window.idlescape.plugins`, no evidence in this ledger's sources that anything has needed it
  yet.
- **`onClientToggle` has no live trigger yet** (Task 3 report). Documented as an intentional seam,
  not a defect: it starts firing once SP2b-2 registers a client-tier shell plugin (the
  `gpu-renderer` manifest). Not a "carry" of unfinished work, just the honest state of a plumbing
  stage, recorded here so a reader doesn't mistake the no-op path for a bug.

## Measured facts

- Task 1 (`client/src/plugins/capability.ts`, `registry.ts` + their `.test.ts` files): 7 tests
  pass, 0 fail, 15 `expect()` calls, across 2 test files (4 tests in `capability.test.ts`, 3 in
  `registry.test.ts`).
- Task 2 (`client/src/hooks/install.ts`, `client/bundle.ts`, `client/PATCHES.md`): `bun test
  src/hooks src/plugins` → 13 pass, 0 fail, 23 `expect()` calls across 4 files. `bun run
  build:dev` succeeded, exit 0.
- Task 3 (`web/src/clientTypes.ts`, `web/src/main.ts`, `web/src/clientHost.ts`): `npm run
  typecheck` → exit 0. `npm test` → 21 test files, 91 tests, all passed. `npm run build`
  succeeded (only the pre-existing "chunk larger than 500kB" advisory, unrelated).
- Pre-flight scan judged all three tasks independent and non-overlapping in the files they
  touch (T1 standalone; only T2 touches `install.ts`/`bundle.ts`; only T3 touches web),
  confirmed true across the run: no task needed to touch a file another task had already
  changed, no rebase or merge conflict inside the plan.
- Naming as implemented: the global is `window.idlescape.plugins` everywhere in this plan's
  commits (all three task reports, all three commit messages) even though the plan document
  itself is written throughout in terms of `window.idlescape.plugins`, the plan's prose had
  already adopted the post-rename product name while the live code the plan was patching still
  used the pre-rename global. Not flagged as a ruling or defect in any task report; the tasks
  simply matched the live code. As of this promotion, current `HEAD` on `sprint/dragon-slayer`
  has since renamed this global to `window.idlescape` (`client/src/hooks/install.ts:37`,
  `web/src/clientHost.ts:10`), a later, unrelated rename, not something SP2b-1 did.

## Traps recorded

- **A second `declare global` for `Window.idlescape` would have compiled silently and split
  the source of truth.** The brief's Task 3 Step 1 suggested adding a fresh `declare global` in
  `web/src/clientTypes.ts`. `web/src/clientHost.ts` already declared one. TypeScript merges
  multiple `declare global` augmentations of the same interface across files without erroring, so
  the brief's version would have built and typechecked fine, while leaving `window.idlescape`'s
  shape defined in two places with no compiler signal that either was stale. Caught by the
  controller before dispatch, not by the gate; the report explicitly names this as a reason to
  grep for `declare global`/`idlescape?:` before adding a new one, not just before this task.
  Fixed by extending the existing declaration in `clientHost.ts` in place instead.
- **`build:dev` never runs terser at all, regardless of the reserved-property list.**
  `client/bundle.ts` gates `applyTerser` on `prod = args[0] !== 'dev'`, so the dev bundle is never
  mangled. A `grep -o plugins out/client.js` against a dev build finding unmangled occurrences
  proves nothing about whether the reserved list is correct; it would find them unmangled either
  way. This is the mechanism behind the Task 2 ruling above: the gate that was run cannot, by
  construction, catch a wrong or missing reserved name. Only a production build exercises that
  path.

## Per-task table

| Task | What it built | Commit | Fix rounds |
|---|---|---|---|
| 1 | `client/src/plugins/capability.ts` + `capability.test.ts`, `client/src/plugins/registry.ts` + `registry.test.ts` (all new). `createCapability(deps)`: `RendererMode` defaulting to `'software'`, `renderer.set()` rejecting any non-`'software'` mode, `frame.onBeforeDraw`/`onAfterDraw` subscription via `Set`s with unsubscribe-by-delete, `_fireBeforeDraw`/`_fireAfterDraw` on the internal type, `scene.project`/`menu.onBuild` stubs, `state` delegating to the injected getter. `createClientPluginRegistry(cap)`: `register`/`enable`/`disable`/`isEnabled`, double-enable guard, unknown-id no-op on both `enable` and `disable`. | `66d53e5` | 0 (review OK first pass, controller inspection) |
| 2 | `client/src/hooks/install.ts` wires `window.idlescape.plugins` (registry built from `createCapability({ state: () => bridge.getState() })`, passed through `createClientPluginRegistry`), extends the `Window.idlescape` type with `plugins?: ClientPluginRegistry`. `client/bundle.ts` adds `'plugins', 'enable', 'disable'` to `mangle.properties.reserved`, immediately after `'client'`. `client/PATCHES.md` documents the new exposure and its stub seams. | `919ad97` | 0 (review OK first pass, controller inspection) |
| 3 | `web/src/clientTypes.ts` adds and exports `ClientPluginRegistry` (mirrors the client's public registry shape: `register`, `enable`, `disable`, `isEnabled`). `web/src/clientHost.ts`'s existing single `declare global { interface Window { idlescape?: ... } } ` extended in place with `plugins?: ClientPluginRegistry` (no second declaration added, see Traps). `web/src/main.ts`'s `onClientToggle` no-op replaced with a dispatch to `window.idlescape.plugins?.enable/.disable`, guarded by a not-loaded check. | `6a18cff` | 0 (review OK first pass, controller inspection) |

Final review: controller inspection across all three tasks together ("small contained client+web
plumbing on the SP2a seam; all tasks inspection-reviewed; gates green"). No findings.
