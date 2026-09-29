---
name: idlescape-client-patch
description: Use when changing the forked game client under client/src - a hook, a call site in Client.ts, the bundle, or anything the web shell reads out of the client. Changes are numbered patches recorded in client/PATCHES.md, each with a grep that proves it is still applied.
user-invocable: true
---

# Patching the forked client

`client/` is a **vendored** copy of LostCityRS/Client-TS pinned at revision 274, sha
`7d6ca61abda277cfed87d542e9e4aa3fe383b38d`. Unlike `engine/`, it is tracked, so an edit is not lost
on checkout. It is still not free-form: every upstream bump has to re-apply our changes by hand, and
the only thing that makes that possible is the numbered list in `client/PATCHES.md`.

**Numbering is at 28.** The next patch is 29.

## Read first

- `client/PATCHES.md` - **the authority.** What each patch does, the surrounding code that anchors
  it, and how to verify the whole set is present.
- `client/src/vendor/PATCHES.md` - the separate log for deviations from vendored rs-sdk, which is
  third-party code and not upstream 274.
- `docs/OPERATIONS.md` - how the client bundle is rebuilt and why it must be built after the engine
  is up.

## The three zones inside `client/`

| Zone | What it is | Rules |
|---|---|---|
| `client/src/hooks/` | **Ours.** `types.ts`, `emitter.ts`, `diff.ts`, `install.ts`, `world.ts`, `worldExtras.ts`, `objArt.ts` and their tests | Never touched by an upstream bump. Its public contract is consumed by the web shell and protected by the terser `reserved` list in `client/bundle.ts` |
| `client/src/vendor/` | **Third-party**, currently `rs-sdk/` (MIT, pinned) | Keeps its LICENSE; every deviation logged in `src/vendor/PATCHES.md`. The only place the "no `as any`" rule is relaxed |
| everything else | Pristine 274 | Changed only through the numbered call-site patches, all in `src/client/Client.ts` |

## Rules that are not negotiable

- **A change to `Client.ts` is a numbered patch.** Add the entry to `client/PATCHES.md` in the same
  change: the number, what it does, the **surrounding code that anchors it** (line numbers drift),
  and a grep with a stated expected count.
- **Do not rename anything in the hooks contract** without updating both sides. The names
  `login / logout / echoChat / getState / getObjName / getObjIcon / getObjInfo / getWorldState /
  dispatch / cancelAll / on` and the `ClientState` / `WorldState` / `LoginResult` / `HookEvents` /
  `ObjInfo` field names are consumed by the web shell and survive minification only because they
  are in the terser `reserved` list.
- **No Jagex art is vendored.** Item icons are rasterised at runtime by the client and reach the web
  shell through patch 28.
- **`cancelAll()` is not a cancel of the in-flight action.** It drops what is pending and keeps the
  in-flight action as a quiescence barrier; the executor has no abort channel. The transport settles
  the caller with `reason: 'cancelled'` and the script re-reads the world. Do not "fix" this in the
  client.
- **Files under 400 lines** in `client/src/hooks/`. The rule does not apply inside `vendor/`.

## Working modes

### Adding patch 29

1. Find the call site in `client/src/client/Client.ts` and read enough context to describe it by
   surrounding code rather than by line number.
2. Make the smallest change that works, preferring to call into `client/src/hooks/` rather than to
   put logic in `Client.ts`.
3. Add the `client/PATCHES.md` entry: number, purpose, anchor, grep, expected count.
4. Rebuild and verify.

### After an upstream bump

`client/PATCHES.md` is the re-application checklist. Locate each anchor by its surrounding code,
re-apply, then re-run the three commands in the verification section. The file's own header states
this as the contract.

### Rebuilding

```powershell
cd client
bun run build:dev     # dev bundle; the front server serves client/out from disk, no restart
bun run build         # production bundle, minified; what scripts/build.ps1 runs
```

`scripts/build.ps1` asserts that `client.js`, `ondemandworker.js` and `tinymidipcm.wasm` land in
`client/out`. 274 dropped the bzip2 wasm, so no `bzip2.wasm` is emitted; do not add it back to the
required list.

## Verification

From `client/`:

```powershell
bunx tsc --noEmit
bun test src/hooks src/plugins src/vendor
bun run build
```

Then, from the repository root:

```powershell
powershell -File scripts/patches-check.ps1
```

It runs every assertion in `client/PATCHES.md` (and in `engine-custom/PATCHES.md` and the two
vendored `rs-sdk` records), diffs `client/` against the `client-import` commit in
`scripts/upstream.lock`, and exits 1 naming the row, the expected count, the actual count and the
file. `verify.ps1` step 2 runs it, so it is part of `npm run verify` as well.

Read the two numbers it prints for `client/PATCHES.md` as the different things they are. The
**assertion count** is how many greps the record carries. **`numbering is at 28`** is the
high-water mark of the numbered patches, and that is the claim "Numbering is at 28" above and
`docs/README.md`'s forked-client row are both making. The table's 29 rows is a third number,
because `21b` is a real patch with a non-numeric id, so do not "correct" 28 to 29. The runner
prints all three and holds none of them to an equality, so patch 29 needs no constant edited
anywhere. The one constant it does hold is a floor under the assertion count (`Floor = 60` at
`scripts/patches-check.ps1:220`, against 69 today), which catches a parse that matched nothing and
which a record that only grows never trips. A new patch still needs its own grep, because
`client/PATCHES.md` is the record the runner coverage-checks: step 3 above.

Bumping the pinned revision is its own procedure: `docs/OPERATIONS.md` section 10.

A minification-specific check worth knowing: the terser `reserved` list is what keeps the hooks
contract's names alive in a production bundle. If a name in that contract stops working only in
`bun run build` and not in `build:dev`, that list is where to look.
