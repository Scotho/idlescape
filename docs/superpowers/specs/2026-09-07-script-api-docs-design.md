# Idlescape: developer script API reference, quickstart and worked examples

Date: 2026-09-07
Status: approved by the orchestrator under D11, 2026-09-07; committed on `sprint/dragon-slayer` the
same day with the sprint amendment; owner may reverse any ruling in section 13.
Placement: **sprint entry 5, "Script API reference"**, immediately after Shell v2 and before the
Script Studio, with everything below renumbered once (section 12). Its **first task** is the
standard: section 4 of `2026-09-07-script-api-survey-and-standard-design.md` plus that document's
phase-now proposals, ahead of the nine worked examples, so no example demonstrates an idiom the
same entry is about to replace and gate 4 then holds in place.
Classification: **architectural.** It introduces a build-time generator, two committed artefacts,
two server routes, a new drift gate in `scripts/build.ps1`, and a contract that two other entries
(the Script Studio and SP4c) both read. It restructures how the script API is described rather
than changing a flow that already exists.
Extends, and does not restate: `2026-09-05-sp4-tasks-scripting-environment-design.md` section 5
(the `scripts/gen/api-docs.ts` generator, `web/src/agent/API.md`, `GET /api/agent/docs` and the
`idlescape://api` resource: all specified there, none built), section 6 (the `ScriptContext`
surface and the authoring rules), section 7 (the script model), section 9 (storage), section 11.2
(SP4c's `get_api_docs()`), section 17 (security posture).
`2026-09-06-sp4b-bot-expansion-design.md` owns `c.find`, `c.travel`, `c.health` and `c.anchor`;
this document documents them, it does not redesign them.
Authority for the standard this reference renders:
`2026-09-07-script-api-survey-and-standard-design.md` section 4 (rules S1 to S12) and section 5
(the proposals). **This document does not restate that standard**; it specifies how the standard is
published, gated and read, and section 4 below says which page renders which rule.
Companion: `2026-09-07-script-studio-design.md` (Spec B), which consumes what this produces. This
document ships and is useful on its own if Spec B is never approved.

---

## 1. What this delivers

0. **The standard, as this entry's first task.** Section 4 of
   `2026-09-07-script-api-survey-and-standard-design.md` and its phase-now proposals land before
   anything below, so the surface the reference describes is the surface the standard binds
   (section 12). That task's file list is in that document's section 5 and is not restated here.
1. **A reference generated from the real types.** One re-export entry declares the script-facing
   surface; one generator walks it with the TypeScript compiler API and emits two committed
   artefacts, `web/src/agent/api-index.json` and `web/src/agent/API.md`.
2. **A drift gate.** `bun ../scripts/gen/apiDocs.ts --check`, run from `web/`, joins
   `scripts/build.ps1` beside the existing `atlas.ts --check` and `collision.ts --check`. It
   regenerates both artefacts and byte-compares them, so a change to `ScriptContext` that nobody
   regenerated, and a hand edit to `API.md`, both fail the build. The documentation cannot describe
   an API that does not exist.
3. **A quickstart:** seven hand-written prose pages that take a player from an empty script to a
   running one, concatenated ahead of the generated reference in the same artefact.
4. **Nine worked examples**, each a real file that compiles as written, each rendered in the docs,
   each a New-script template for Spec B's studio, and each compiled by a unit test, so an example
   that stops compiling fails the build.
5. **One serving decision**, ruled in section 7: the artefact is the file, `GET /api/agent/docs`
   serves it, the studio help pane reads the JSON sibling, and the wiki gets one standalone page
   that links to it rather than a second copy of the reference.

Not delivered here: the studio window, the editor, live diagnostics, a completion UI, and the
`.d.ts` tree a type checker would need. Those are Spec B. Also not delivered: any change to
`compileUserScript`, to `UserTaskDoc`, or to what a script may reach. This entry writes documents
and two read-only routes; it changes no runtime behaviour.

## 2. Facts this rests on

Read at `1bfdc7d` (`fix(tasks): draw the per-script switch the way the design system draws one`) on
`sprint/dragon-slayer`, with SP4b tasks 1 to 9 landed and 10 to 15 open, and **re-verified against
`5889437`** (`feat(tasks): show the target, the health and the xp rate of a live run`) when the
review findings were applied; nothing this document rests on moved between the two. Where a file is
moving under SP4b, the intended end state in
`docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md` lines 4828 to 6105 is what this document
assumes.

| Fact | Where |
|---|---|
| SP4 section 5 already specifies this generator, its output path, its route and its MCP resource. `scripts/gen/` holds only `atlas.ts` and `collision.ts`. There is no `API.md`, no `/api/agent/docs`, and no `docs/agent/`. | `scripts/gen/`, `web/src/agent/` |
| The drift-gate pattern is established and argued: `scripts/build.ps1` typechecks `scripts/gen` and then runs `atlas.ts --check` and `collision.ts --check`, under the comment "a content bump that nobody regenerated would leave the shell fetching data that no longer describes the map, and nothing else in the build would notice". | `scripts/build.ps1` |
| Those checks compare **bytes**, not a hash: `writeOrCheck` regenerates and `Buffer.compare`s against the committed file. | `scripts/gen/lib/io.ts:53-65` |
| There is **no `node_modules` at the repo root, none under `scripts/`, and none under `scripts/gen/`**; the root `package.json` declares no dependencies, only PowerShell aliases. `atlas.ts` imports node builtins and repo-relative modules only. TypeScript lives in `web/node_modules` and `server/node_modules`, which is why the existing typecheck step runs `npx tsc` from `web/`. | root `package.json`, `scripts/gen/atlas.ts:7-15`, `scripts/build.ps1:51-54` |
| `web/tsconfig.json` **excludes `src/**/*.test.ts`**, and `npm run typecheck` is `tsc --noEmit`, so a type-level assertion in a test file is checked by nothing. Six `.harness.ts` files exist for that reason and one says so in its header. | `web/tsconfig.json:17-18`, `web/src/agent/workerContext.harness.ts:5-8` |
| `scripts/gen/tsconfig.json` already ends with `"include": ["**/*.ts"]`, and `web/tsconfig.json` has no `allowJs`, so a new generator and the `.js` examples both need no config change. `web/eslint.config.js` narrows only by `ignores`, so `.js` under `src/` **is** linted by default. | `scripts/gen/tsconfig.json`, `web/tsconfig.json:17-18`, `web/eslint.config.js:24-27` |
| SP4b plan task 13 also modifies `scripts/build.ps1`, so a second generator check there is the expected shape rather than a novelty. | plan line 5615 onward |
| `ScriptContext` is 14 top-level members carrying about 28 leaves, declared with doc comments. | `web/src/tasks/types.ts:174-214` |
| `c.bot` is 52 methods and `c.sdk` about 110, both vendored. `actions.ts` carries 63 JSDoc blocks and `index.ts` 108, so vendored doc coverage is high but incomplete, and we cannot add comments to vendored files without a `PATCHES.md` note. | `web/src/vendor/rs-sdk/sdk/actions.ts`, `index.ts`, `web/src/vendor/PATCHES.md` |
| The closed sets a script author must know, counted by reading them: `ResourceKind` 9, `HealthCondition` 9, `FailReason` 13, `DeathBehaviour` 7, `RunState` 7, `PauseReason` 5, `TasksErrorCode` 11, plus every `TraceEvent` variant. | `web/src/tasks/types.ts:29-30, 99-101, 109-121, 129-130, 237-238, 250-268`, `web/src/tasks/api.ts:25-27` |
| User scripts are **JavaScript**. `compileUserScript` strips whole-line imports by regex, rewrites the first `export default` into `return`, and runs the rest through `new Function('defineScript', '"use strict";\n' + body)`. There is no transpile step, so a type annotation is a syntax error. | `web/src/tasks/defineScript.ts:38-49` |
| The bundled library carries an inlined JavaScript copy of its TypeScript helpers for exactly that reason, guarded by a drift test that compiles every fork seed. This is the precedent for "a generated or duplicated artefact gets a test that fails when it drifts". | `web/src/tasks/library/index.ts:28-52`, `librarySource.test.ts` |
| `?raw` imports are already the idiom for shipping source text into the bundle. | `web/src/tasks/library/index.ts:6-9` |
| Upstream rs-sdk shipped a `generate-api-docs.ts` that we deliberately did not vendor. Prior art exists and is not in the tree. | `web/src/vendor/PATCHES.md`, "Not copied" |
| The front server serves `/assets/*` from `env.webDist` through a per-segment `^[A-Za-z0-9._-]+$` filter, and nothing else static. Anything addressed by a hand-written runtime path outside `/assets/` works in dev and 404s in production. | `server/src/router.ts:68-79`, `server/src/static.ts` |
| The release ships the whole tracked tree (`git archive HEAD`), so a committed file under `web/src/` is present on the box and readable by the Bun server. | `deploy/lightsail/release.ps1:74-78` |
| The wiki generates pages from the pinned Content and Engine clones. A page with no entity behind it is a **standalone page** needing `type`, `slug`, `title`, `lead` and a `sources.lead` entry, and every hand-written sentence carries a `<!-- src: kind:ref -->` provenance comment. | `wiki/AUTHORING.md` |
| Chat, npc dialogue and interface text in `WorldState` are untrusted, and the copy-to-Claude path already carries a header saying so. | `web/src/plugins/builtin/traceView.ts:12` |

## 3. The generator: one source, one intermediate, two artefacts

```
web/src/tasks/scriptApi.ts          hand-written, about 40 lines: the re-export entry that
                                    decides what a script may see
        |
        v   scripts/gen/apiDocs.ts  TypeScript compiler API, bun, build time only
        |
        +--> web/src/agent/api-index.json    committed, the structured surface
        +--> web/src/agent/API.md            committed, prose + reference + examples
```

### 3.1 `web/src/tasks/scriptApi.ts`

A re-export file and nothing else. It re-exports `Script`, `ScriptManifest`, `Task`,
`ScriptContext`, `ParamSchema`, `ParamField`, `ParamValues`, `Requirement`, `ResourceKind`,
`FoundTarget`, `FoundVia`, `TravelTarget`, `TravelOpts`, `TravelResult`, `FindOpts`, `SweepOpts`,
`AtlasCluster`, `AtlasLandmark`, `HealthCondition`, `HealthPolicy`, `HealthEvent`,
`DeathBehaviour`, `StuckBehaviour`, `TraceEvent`, `RunState`, `PauseReason`, `FailReason`,
`RunOutcome`, `WorldState`, `ActionResult`, `BotActions` and `BotSDK`.

It exists so that "what a script may see" is a decision made in one screen rather than inferred
from a generator's traversal rules. It is the only file a future session edits when the surface
widens, and gate 6 in section 8 makes forgetting it a test failure rather than a silent omission.

### 3.2 `scripts/gen/apiDocs.ts`

It joins `scripts/gen/tsconfig.json` and is typechecked by the existing `npx tsc --project
../scripts/gen/tsconfig.json` step in `scripts/build.ps1`. It creates a `ts.Program` over
`scriptApi.ts`, walks the exported declarations, and emits `api-index.json`.

**Where it is run from, which is not where `atlas.ts` is run from.** `atlas.ts` imports only node
builtins and repo-relative modules, so `scripts/build.ps1` runs it with `Push-Location $root`. This
generator imports `typescript`, and there is no `node_modules` at the repo root, none under
`scripts/` and none under `scripts/gen/`: the root `package.json` declares no dependencies at all,
only PowerShell script aliases. TypeScript exists in `web/node_modules` and `server/node_modules`,
which is why the typecheck step above already runs `npx tsc` from `web/`. So the generator runs
from `web/` too, and `scripts/build.ps1` says so:

```powershell
Push-Location $web
try {
    & $bun '../scripts/gen/apiDocs.ts' '--check'
    if ($LASTEXITCODE -ne 0) {
        throw 'API.md / api-index.json are stale (from web/: bun ../scripts/gen/apiDocs.ts)'
    }
} finally { Pop-Location }
```

Ruled here rather than left to the plan, because as a `Push-Location $root` step beside the atlas
check it fails on its first run with a module-not-found, and that is a spec-level mistake rather
than an implementation one. The alternative, adding `typescript` to a root `package.json`, creates
a second pin of the compiler beside `web/`'s `^5.9.0` and is rejected for that reason.

**`--check` regenerates and byte-compares.** It builds both artefacts in memory and hands each to
the house helper `writeOrCheck(path, bytes, check)` (`scripts/gen/lib/io.ts:53-65`), which
`Buffer.compare`s against the committed file and throws naming the command to run. That is what
`atlas.ts --check` does, and it is strictly stronger than comparing an input hash: a hash over the
inputs still matches when somebody hand-edits `API.md`, which is the file section 3.2 says must
never be hand-edited, and when the generator's rendering changes without its version constant being
bumped. `hash` therefore stays in the index as metadata and as an optional fast path, and it is not
the gate. Regenerating two text files is cheap.

```ts
interface ApiIndex {
  /** Metadata and an optional fast path. NOT what --check compares; see above. */
  hash: string;
  generatedFrom: { files: string[] };
  members: ApiMember[];    // flattened leaves: 'c.wait.until', 'c.find.nearest', 'c.bot.chopTree'
  types: ApiType[];        // ScriptManifest, Task, ParamField variants, Requirement variants, ...
  enums: Record<string, string[]>;  // ResourceKind, HealthCondition, FailReason, RunState, ...
  /** The identifiers a script may not reach, read from `web/src/tasks/forbidden.ts`; see below. */
  forbidden: string[];
  examples: ApiExample[];  // id, title, teaches, docsAnchor, source
  /** member path -> example ids that reference it. */
  usedBy: Record<string, string[]>;
}
interface ApiMember {
  path: string; kind: 'method' | 'property' | 'namespace';
  signature: string; doc: string; since: string; vendored: boolean; deprecated?: string;
}
/** A named shape a script author has to read, as opposed to a member they call. */
interface ApiType {
  name: string;                    // 'ScriptManifest', 'ParamField', 'Requirement', 'Task'
  kind: 'interface' | 'union' | 'alias';
  doc: string;
  /** Present for `interface`. */
  fields?: { name: string; type: string; optional: boolean; doc: string }[];
  /** Present for `union`: each member rendered as source text, a discriminated variant included. */
  variants?: string[];
}
```

`ApiType` is pinned here because Spec B reads it, not the generator: its help pane's browse mode
groups by namespace and its hover cards render `ScriptManifest`, `Task`, the four `ParamField`
variants and the four `Requirement` variants out of `types`. A shape left undefined here is a shape
Spec B's `help/lookup.ts` invents, and what it invents is not what the generator emitted.

`usedBy` is computed by parsing each example source and collecting every member expression rooted
at the script context parameter, mapping `c.travel.to(...)` to the path `c.travel.to` and recording
the ancestor paths `c.travel` and `c` with it. It is a syntactic scan, not an execution: an example
that mentions a member only in a comment does not count. Gate 3 fails a build on it, so the rule is
written down rather than left to the traversal.

`forbidden` is copied verbatim from `web/src/tasks/forbidden.ts`, which Spec B creates as the one
list its compiler, its V2 linter and its help pane all read. Spec A ships before Spec B, so until
that file exists the field is emitted empty and `06-limits-and-trust.md`'s generated block is
empty with it. The point of routing it through the index is that once Spec B lands, gate 1 covers
the documented list as well as the enforced one, instead of leaving a hand-typed second copy of a
security rule in prose that nothing compares. See section 4 item 5.

`since` is not invented. It is read from a small hand-maintained map inside the generator, keyed by
member path. **Its values are api versions, written as the bare number the standard's S12 uses
(`1`, `2`), never sprint labels such as `'SP4a'`**, and the generator does not parse `@since` from a
doc comment at all. That is the survey spec's section 6.2 request, adopted here in full: S12 owns
the version vocabulary and this map is its only mechanism, so "what api version is this member
from" has one answer, and the two-version removal window S12 depends on can be counted from the
rendered reference. Two sources for one fact is the failure gate 1 exists to prevent, and a `@since`
comment beside this map would be exactly that. A member the map does not name is emitted with
`since: ''` and the renderer omits the column for it; no gate fails on an empty `since`, because a
version label is not worth blocking a build over. The map is about thirty lines.

`hash` is computed over the contents of every file named in `generatedFrom.files` plus a version
constant bumped when the generator's own output format changes. It is a legibility aid and a fast
path, not the gate: gate 1 regenerates and byte-compares, for the reason given above.

`vendored: true` marks everything under `c.bot` and `c.sdk`. It matters for gate 2 in section 8.

`API.md` is a rendering of the same index with the prose pages prepended and the examples appended.
It is written, never hand-edited, and its first line says so.

### 3.3 What the generator deliberately does not emit

**No `.d.ts` tree and no lib closure.** Those exist only to feed a language service, they are
roughly 600 KB of committed output, and nothing in this entry reads them. Emitting them now would
commit half a megabyte of files with no reader and a gate protecting nobody.

**Spec B's phase 2 is the entry that turns the mode on, and it owns the work.** It is named here so
the ownership is not left in the gap between the two documents: Spec B's phase 2 adds a
`--declarations` mode to this generator, decides where the tree is written so Vite bundles it into
the type-check chunk rather than reaching it by a hand-written runtime path, commits it, and
inherits gate 1 over it unchanged (regenerate, byte-compare, `writeOrCheck`). The moment the tree
has a reader, the argument against gating it stops holding, which is exactly why the gate comes
with the mode rather than after it. `scripts/gen/apiDocs.ts` therefore appears in Spec B section
19's Modified list as well as in this document's Created list.

**No HTML.** The studio renders the JSON directly and the wiki renders its own page. A third
renderer is a third thing to keep consistent.

## 4. What the reference must say, beyond signatures

A signature table is not documentation. The generated half carries, per member, the doc comment
already in the source. The prose pages carry what a generator cannot know, and **the largest part
of that is the standard, which this document renders by reference and does not restate.**

**The standard is `2026-09-07-script-api-survey-and-standard-design.md` section 4**, twelve rules
S1 to S12 binding every member of `ScriptContext` and everything we put over the vendored
`BotActions`/`BotSDK`. That document is the only statement of them anywhere; a second copy here
would be a second source with no gate between them, which is the failure gate 1 exists to prevent
one layer up. The reference's job is to make the rules readable by a player and by an agent
session, at the point they matter, so **each prose page renders the rules that bear on it**:

| Page | Renders | From |
|---|---|---|
| `00-quickstart.md` | scripts are JavaScript; the wait rule as the first thing a loop needs | S2, S7 |
| `01-script-model.md` | the task model, and additions over renames | S12 |
| `02-waiting.md` | the whole wait family and the fixed-sleep rule with its reason | S7, S2, S8 |
| `03-params-and-requirements.md` | options bags and their defaults, units, nullability | S4, S8, S9 |
| `04-find-travel-and-anchor.md` | selectors, query and filter style, results versus exceptions | S5, S3, S9 |
| `05-health-and-recovery.md` | closed reason sets, units on thresholds | S3, S8 |
| `06-limits-and-trust.md` | the sandbox rule, and the trust model it sits on | S10 |

Three things a generator cannot know are **this document's own**, because they are facts about the
runtime rather than rules about the surface, and they are stated here:

1. **Scripts are JavaScript, not TypeScript.** A type annotation is a syntax error at compile time,
   because `compileUserScript` runs the text through `new Function`. This is the quickstart's first
   paragraph, in bold, because the library fork seeds are TypeScript text that compiles only by the
   accident of carrying no annotations.
2. **`bot.*` observes before it resolves; `sdk.send*` only confirms dispatch.** The difference is
   the most common cause of a script that appears to work and then does not, and it is the reason
   the standard's S7 marks the vendored `sdk.waitFor*` family as legacy rather than removing it.
3. **The error vocabulary.** Every `TasksErrorCode`, what causes it, and what a player should do,
   because a compile error and a requirements failure look identical from inside the panel today.
   Spec B adds a twelfth code, `forbidden_api`, and the page gains its row with it.

And one page carries more than a rendering, because the honest version of S10 is longer than S10's
own summary and belongs where a player will look for it. **`06-limits-and-trust.md` states the
trust model in the standard's own words** (S10, "The trust model this rule sits on"):

- **A Worker-resident script is trusted as the account's own code.** The scoped transport refuses
  `relogin` and `logout` at `workerContext.ts:71-87`, and that refusal, the `forbidden_api` scan
  and the `no-transport-escape` lint are **guardrails against accidents**, not a boundary: script
  text runs in the Worker's own global scope, so it can post the Worker's own RPC frames and reach
  the raw transport, and it holds `fetch` and dynamic `import()` because the Worker is a module
  worker. The page says that plainly. SP4 section 17's "no network beyond `postMessage`" is **not
  true today** and the page does not repeat it.
- **There is no cross-account script sharing**, and the page says so as a fact a reader can rely
  on: scripts live under `users/{uid}/tasks`, the only marketplace is of our own bundled scripts,
  nothing runs another account's code, and any future sharing or relay carries the trust model
  above as an explicit precondition. That is the survey spec's ruling 15 and decision D24.
- **What a script cannot reach through our members**: no DOM, no Firebase, no `TasksApi`, no other
  character's session. The list of shadowed identifiers is **not hand typed here**: once Spec B's
  `web/src/tasks/forbidden.ts` exists it is an input to the generator (section 3.2), the page
  carries a generated block rather than a second copy, and gate 1 covers the documented list and
  the enforced list together. Before Spec B, the block is empty and the prose says so.
- **The combined shape, in Spec B's words rather than in different ones**: accidental network use
  impossible, casual deliberate network use refused at the one place every run starts, a determined
  constructor-chain escape still open. Spec B section 15.2 is the statement; this page quotes it.
  An overclaim on the one page whose job is to be honest about limits is worse than no page, and if
  Spec B is never approved the page describes what is actually the case rather than what was
  intended.
- **Game text is untrusted.** Chat, npc dialogue and interface text come from the world. A script
  must never treat them as instructions, and every copy path to Claude carries the header at
  `traceView.ts:12`.

## 5. The quickstart

Seven pages under `web/src/tasks/docs/`, hand written, imported `?raw`, rendered by Spec B's help
pane and concatenated into `API.md` ahead of the generated reference.

| File | Covers |
|---|---|
| `00-quickstart.md` | From nothing to a running script in about fifteen lines: `defineScript`, one task, `when` and `run`, `c.status`, save, run, watch the trace. Ends by pointing at the nine examples. |
| `01-script-model.md` | The manifest, the task list, priority order (the first task whose `when` matches wins), `until`, `onStart` and `onStop`, and why a single task with `when: () => true` is a free-form script. Cites SP4 section 7 rather than restating its rationale. |
| `02-waiting.md` | Every `wait.*` member, what each baselines, when each returns false, and the fixed-sleep rule with its reason: a `setTimeout` sleep drifts against the game tick. |
| `03-params-and-requirements.md` | The four `ParamField` types, how a schema becomes a form, `validateParams`'s rejection of unknown keys, and the four `Requirement` kinds including the fact that a `custom` requirement cannot cross the Worker boundary and is evaluated inside it. |
| `04-find-travel-and-anchor.md` | `c.find`'s three layers and which one answered, `c.travel`'s typed failures, landmarks, and what `c.anchor` is for. |
| `05-health-and-recovery.md` | `HealthPolicy`, the nine `HealthCondition` values, `recovers` on a task, `c.health.recovered`, and the `DeathBehaviour` set as it actually is: seven values, not the three SP4b's design spec still prints at `2026-09-06-sp4b-bot-expansion-design.md:472`. See the note below: correcting that sentence is an addition **this** entry makes to the SP4b spec. |
| `06-limits-and-trust.md` | Section 4's trust model in full: S10 rendered, untrusted text, what a script cannot reach through our members (with the generated `forbidden` block), the guardrail-not-boundary statement, no cross-account sharing, the error vocabulary, and the 64 KB code and 60-character name caps. |

**The `DeathBehaviour` drift is this entry's to fix, not SP4b's.** The drift is real:
`web/src/tasks/types.ts:129-130` has seven values and the SP4b design spec still prints
`onDeath?: 'resume' | 'return-and-resume' | 'fail'` at line 472. But SP4b plan task 15
(`2026-09-06-sp4b-bot-expansion.md:6066-6110`) rewrites rulings R1 to R7 (collision bits, the atlas
generator split, the `cancel` direction, the dev-cheat path, `?url`, fishing-spot naming, the
bounding box), adds a section 12 and updates the roadmap and README. The `onDeath` sentence is not
among them. The generated page is unaffected either way, because it reads the real type. So this
entry's implementation adds one line to SP4b's design spec correcting that sentence, and
`docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md` joins section 10's Modified list.
Waiting on a reconciliation that was never scoped is how a stated dependency becomes a silent one.

Every page is under 400 lines. Prose follows the project's rules: sentence case, no em dashes, no
emoji, second person for the player, Claude named plainly, `idlescape` lowercase.

**The pages are bound to the renderer's markdown subset.** Spec B's help pane deliberately ships no
markdown library: about 90 lines of text-node building supporting **headings, paragraphs, unordered
and ordered lists, fenced code blocks, inline code, links, and nothing else**. Three of the page
briefs above point straight at content that wants a table (`02-waiting.md`'s wait members,
`03-params-and-requirements.md`'s four `ParamField` types and four `Requirement` kinds,
`06-limits-and-trust.md`'s eleven `TasksErrorCode` values with cause and remedy), and a table
written in one of them renders as raw pipe characters in a 300px pane. The design system has no
table family to fall back on either.

**Ruling: the seven pages use the subset above, and a two-column enumeration is written as a
definition list in the `.kv` row grammar the design system already has**, which is a heading or a
bolded term followed by a paragraph. Gate 5 enforces it (section 8), by parsing every page with the
studio's own renderer and failing on an unsupported node rather than by a style review. If the
owner would rather have real tables, that is a stated addition to Spec B's renderer with a style
built on `.kv`, not something a page author discovers at render time. Ruled at ruling 11: no tables.

## 6. The examples gallery

Nine files under `web/src/tasks/docs/examples/`, each a complete user script that compiles through
`compileUserScript` as written, each 20 to 70 lines, each opening with a comment header carrying
its id, one sentence of purpose, and the docs anchor where its explanation lives.

| id | What it teaches | Principal API |
|---|---|---|
| `hello-status` | The smallest thing that runs: one task, a status line, a tick wait, an `until` that stops after a minute. This is the New-script default in Spec B. | `c.status`, `c.log`, `c.wait.ticks`, `until` |
| `loop-with-params` | The canonical loop: a `select`, a `number` and a `boolean` param, an `until` computed from a param, a **counter carried across task runs in `c.memory`** (the only place state survives between them, and the reason the example needs it), and a task that stops itself. | `params`, `until`, `c.wait.xp`, `c.memory` |
| `find-and-travel` | Getting to a resource that is not on screen: nearest by kind, the atlas fallback, a landmark, and what each `TravelResult` failure means. | `c.find.nearest`, `c.find.landmark`, `c.travel.to`, `c.travel.distanceTo` |
| `requirements-and-health` | Declaring what a run needs before it starts, and what the health monitor does for you: a `requires` list covering all four kinds, a `HealthPolicy`, and one task with `recovers` that reports back. | `requires`, `health`, `c.health.is`, `c.health.recovered`, `c.anchor` |
| `dialogs-and-interfaces` | Reacting rather than driving: waiting for a dialogue, matching its text, clicking an option by text, reading `interfaceTexts`, closing an unexpected interface. Carries the untrusted-text rule inline as a comment. | `c.wait.dialog`, `c.sdk.getDialog`, `c.sdk.clickDialogByText`, `c.bot.navigateDialog`, `c.bot.closeInterface` |
| `bank-round-trip` | Travel to a bank landmark, open, deposit everything matching a pattern, withdraw a tool, close, travel back to the anchor, loop. | `c.travel.to`, `c.bot.openBank`, `c.bot.depositItem`, `c.bot.withdrawItem`, `c.bot.closeBank` |
| `combat-and-loot` | A combat loop with a drop and loot routine: attack the nearest of a named npc, eat below a threshold, pick up what matches, drop what does not, and a `hardStop` on hp. Its loot loop **checks `c.signal.aborted` between items** and returns when it is set, which is what a stop actually looks like inside a long task; the bundled `dropAllTask` helper already models it at `web/src/tasks/library/index.ts:40-51`. | `c.bot.attack`, `c.bot.eatFood`, `c.bot.pickupItem`, `c.bot.dropItem`, `hardStop`, `c.signal` |
| `tutorial-steps` | The step-script shape: tasks keyed off `c.tutorial.title()` and `c.tutorial.is()`, `followHint`, `clickThrough`, and why the on-screen title is the step signal. Deliberately a three-step slice, not a competitor to SP4b task 13's real script. | `c.tutorial.title`, `c.tutorial.is`, `c.tutorial.followHint`, `c.tutorial.clickThrough` |
| `report-for-claude` | The Copy-for-Claude workflow, as a script: it logs a structured snapshot of skills, inventory and position at `info` and then stops. The docs page beside it explains the workflow (run it, open the trace, press Copy for Claude, paste into a session) and notes that the pasted text carries the untrusted-text header the trace view already writes. | `c.log`, `c.state`, `c.sdk.getSkills`, `until` |

Between them the nine reach all fourteen top-level `ScriptContext` members, which is what gate 3
asserts. Two of the fourteen, `c.memory` and `c.signal`, had no home until the two rows above were
given one on purpose: they are the members a first script never reaches by accident and the ones a
long-running script most needs, so an example that omitted them would have been a gate passed by
scoping rather than by covering. The mapping is: `c.state`, `c.log`, `c.status`, `c.wait` and
`c.params` across most of the nine; `c.bot` and `c.sdk` in `dialogs-and-interfaces`,
`bank-round-trip` and `combat-and-loot`; `c.find` and `c.travel` in `find-and-travel`; `c.anchor`
and `c.health` in `requirements-and-health`; `c.tutorial` in `tutorial-steps`; `c.memory` in
`loop-with-params`; `c.signal` in `combat-and-loot`.

Three properties make the gallery worth its weight:

- **Every example is a New-script template.** `web/src/tasks/docs/examples.ts` is a small index
  (`id`, `title`, `teaches`, `docsAnchor`, `source` via `?raw`) that both the docs renderer and
  Spec B's template picker read. A player never has to go and find the quickstart: it is what is
  already in the editor.
- **Every example is a test fixture.** Section 8, gate 4.
- **No example imports anything.** Imports are stripped by regex at compile time, so an example
  that imported a helper would compile to something different from what it reads as. Where an
  example needs a helper it declares it inline, which is what a real user script has to do anyway.
  This is the same constraint the `HELPERS` string works around for the library, and the docs say
  so rather than leaving it to be discovered.

## 7. Where it is served, and the ruling

**Ruling: one generated artefact, three renderings, and the wiki gets a pointer rather than a
copy.**

| Surface | What it gets | How |
|---|---|---|
| The repository, for agent sessions | `web/src/agent/API.md`, committed | SP4 section 5's own path, so nothing has to be relocated later. An agent session reads the file. |
| `GET /api/agent/docs` | the same file, as `text/markdown` | A new route in `server/src/router.ts`, principal `none`, reading `env.agentDocs`: a new env var defaulting to `../web/src/agent/API.md`. `GET /api/agent/docs.json` serves `api-index.json` from the sibling path, for tools that want structure. |
| SP4c's `get_api_docs()` and `idlescape://api` | the same file | SP4 section 11.2 already says so. This entry hands SP4c a built and gated artefact, which turns that tool into two lines. |
| Spec B's help pane | `api-index.json`, imported as a bundled module | No fetch, no runtime network path, works offline and on the Lightsail box. |
| The wiki at `/wiki` | one standalone `mechanic` page, `Scripting` | Front matter `type: mechanic`, `slug: scripting`, `title: Scripting`, a lead sentence and a `sources.lead` entry pointing at `web/src/agent/API.md`. Its body is three paragraphs on what a script is, and a link to `/api/agent/docs`. |

**Why the reference itself is not in the wiki.** The wiki pipeline extracts pages from the pinned
Content and Engine clones and requires a `<!-- src: -->` provenance comment on every hand-written
sentence. Our own script API has no such source, so a reference there would be hand-maintained
prose inside a system built to prevent hand-maintained prose, and it would be a second copy that
the drift gate does not protect. One standalone page and a link is the whole honest integration.

**Why not a copy under `docs/`.** `docs/` holds design and superpowers material, not product
artefacts, and a second copy of a generated file is a second thing for the gate to compare. The
committed `web/src/agent/API.md` is already in the tree an agent session greps. The implementation
adds one pointer line to `CLAUDE.md` naming it, which is the cheapest way to make it findable.

## 8. The maintenance rule: six gates

Each is small, each fails loudly, and each replaces a habit somebody would otherwise have to keep.
Gate 1 runs in `scripts/build.ps1`; gates 2 to 6 are unit tests and therefore run in
`npm run verify`.

| # | Gate | Where | Catches |
|---|---|---|---|
| 1 | **Generated output is current.** `bun ../scripts/gen/apiDocs.ts --check`, run from `web/` (section 3.2), regenerates both artefacts in memory and hands each to `writeOrCheck` (`scripts/gen/lib/io.ts:53-65`), which byte-compares against the committed file and throws naming the command to run. Not a hash comparison: a hash over the inputs passes a hand-edited `API.md`. | `scripts/build.ps1`, beside the atlas and collision checks | Somebody changed `ScriptContext` and did not regenerate. Somebody hand-edited a generated file. Somebody changed the rendering without bumping the version constant. |
| 2 | **Every member we own is documented.** Every `ApiMember` with `vendored: false` has a non-empty `doc`. Vendored members report a coverage figure and do not fail the build: we cannot add doc comments under `web/src/vendor/rs-sdk/` without a `PATCHES.md` note, and a gate forcing one would make every upstream re-vendor a documentation task. | `web/src/tasks/docs/apiIndex.test.ts` | A new `ScriptContext` member shipped with no prose. |
| 3 | **Every top-level `ScriptContext` member is exampled.** Each of the 14 appears in `usedBy` with at least one example id. Not every leaf, and not `c.sdk`'s 110 methods: a gate demanding that would be gamed within a week. | same file | A new capability class shipped with nothing showing how to use it. |
| 4 | **Every example compiles.** Each of the nine sources runs through `compileUserScript` and must produce a manifest whose id, task names and param schema match the index's record of it. | `web/src/tasks/docs/examples.test.ts` | Documentation describing an API that no longer exists. This is the gate the owner's brief names: an example that no longer compiles fails the build. |
| 5 | **The prose pages parse, and their anchors resolve.** Every page is run through Spec B's help-pane renderer and must produce no unsupported node (section 5's subset); every `docsAnchor` on an example, and every internal link in the seven pages, names a heading that exists. Before Spec B lands, the renderer's grammar is asserted against a small parser in this entry that the studio then replaces. | `web/src/tasks/docs/pages.test.ts` | A table, a blockquote or an image that renders as raw characters in a 300px pane. A page rename that silently breaks the help pane's "show me this member". |
| 6 | **The surface is a decided set.** A `Record<keyof ScriptContext, true>` in `web/src/tasks/scriptApi.harness.ts`, exporting the member list; `scriptApi.test.ts` is the runtime assertion that reads it and compares it against the index. This is the `workerContext.harness.ts` plus `workerContext.test.ts` pair verbatim, and the harness file is the load-bearing half. | `web/src/tasks/scriptApi.harness.ts` (typecheck), `scriptApi.test.ts` (runtime) | A `ScriptContext` member added without deciding whether it is exposed and documented. |

**Gate 6 must not live in a `.test.ts`, and this is the one gate whose placement is the gate.**
`web/tsconfig.json` is `include: ["src/**/*.ts"]`, `exclude: ["src/**/*.test.ts", "e2e/**"]`, and
`npm run typecheck` is `tsc --noEmit`, so nothing in a `.test.ts` is ever type-checked and vitest
does not type-check either. A `Record<keyof ScriptContext, true>` written in `scriptApi.test.ts`
would compile nowhere and fail nothing. The precedent this gate copies says so in its own header
(`workerContext.harness.ts:5-8`, "It lives in a `.harness.ts` because that is what tsconfig
compiles and `*.test.ts` is what it excludes"), and there are six `.harness.ts` files in the tree
for exactly this reason. The harness also imports nothing from vitest, for the reason
`bank/grid.harness.ts` documents.

The procedure a future session follows, which is the whole point of the arrangement: **add the
member with a doc comment, add or extend an example, run `bun ../scripts/gen/apiDocs.ts` from
`web/`.** Skip the
first and gate 6 fails; skip the second and gates 2 and 3 fail; skip the third and gate 1 fails.

## 9. Testing

Beyond the six gates, which are themselves most of the suite:

- `scripts/gen/apiDocs.test.ts`: fixture types in, expected index out. Table driven over a small
  synthetic `ScriptContext`, so the traversal rules (namespaces, method signatures, union members,
  doc-comment extraction, the `since` map) are pinned without depending on the real surface, which
  moves.
- `--check` behaves: identical inputs pass; a changed doc comment fails; a changed signature fails;
  **a hand-edited `API.md` whose inputs are untouched fails**, which is the case an input-hash
  comparison would have passed and the reason gate 1 regenerates; a missing artefact fails with
  "run the generator" rather than a stack trace; and every failure message names the command.
- The routes: `server/src/router.test.ts` gains classification and principal cases for
  `/api/agent/docs` and `/api/agent/docs.json`, following the wiki route cases already there. A
  handler test asserts that a missing file yields 503 with a message naming the generator, rather
  than a bare 404, so the failure explains itself.
- No Playwright. This entry ships no UI; Spec B's suite covers the help pane.

**What is not tested:** that the prose is good. Gates 2 and 3 assert that prose exists, never that
it is right. That is a review responsibility, and this spec says so rather than implying a
mechanism.

## 10. File structure

Every file under 400 lines including tests. Estimates in parentheses.

```
scripts/gen/
  apiDocs.ts                        (240)  the generator, --check included
  apiDocs.render.ts                 (180)  index -> markdown, split out to stay under the ceiling
  apiDocs.test.ts                   (160)

web/src/tasks/
  scriptApi.ts                      ( 40)  the re-export entry
  scriptApi.harness.ts              ( 40)  gate 6's Record<keyof ScriptContext, true>; typechecked
  scriptApi.test.ts                 ( 60)  gate 6's runtime half, reading the harness

web/src/tasks/docs/
  index.ts                          ( 60)  the ?raw globs of pages and examples, typed
  examples.ts                       ( 70)  id, title, teaches, docsAnchor, source
  examples.test.ts                  (150)  gate 4
  apiIndex.test.ts                  (120)  gates 2 and 3
  pages.test.ts                     ( 90)  gate 5
  00-quickstart.md ... 06-limits-and-trust.md          seven pages
  examples/hello-status.js ... report-for-claude.js    nine files, 20 to 70 lines each

web/src/agent/
  API.md                            generated, committed
  api-index.json                    generated, committed

Modified:
scripts/build.ps1                   the --check step, run from web/ (section 3.2)
server/src/router.ts, index.ts, env.ts, types.ts     the two routes and `agentDocs`
web/eslint.config.js                an override for src/tasks/docs/examples/*.js
docs/superpowers/specs/2026-09-06-sp4b-bot-expansion-design.md
                                    one sentence: `onDeath` carries the seven DeathBehaviour
                                    values, not three (section 5)
CLAUDE.md                           one line naming web/src/agent/API.md
```

**The first task's files are not listed here.** Section 12 makes the standard and the phase-now
proposals this entry's first task; the files each of P0, P4, P7, P8, P9, P11, P14, P19 and P20
touches are costed in `2026-09-07-script-api-survey-and-standard-design.md` section 5, member by
member, and repeating them would be a second list to keep in step. The only overlap worth naming is
that P20 creates `web/src/tasks/standard.ts` and an api-shape gate in `web/src/tasks/scriptApi.test.ts`,
which is the same file gate 6's runtime half uses, and P0 adds `web/src/tasks/scriptApiKeys.ts`
beside the `scriptApi.ts` this document creates.

**Two rows a reader would expect here are deliberately absent**, because both changes are already
made and a plan should not spend a step on either. `scripts/gen/tsconfig.json` ends with
`"include": ["**/*.ts"]`, so `apiDocs.ts` joins the project by existing. `web/tsconfig.json` is
`include: ["src/**/*.ts"]` with no `allowJs`, so the `.js` example files are already outside the
program and need no exclude. The eslint override **is** needed: flat config lints `**/*.js` under
`src/` by default, and `web/eslint.config.js` narrows only by `ignores`.

The examples are `.js` because that is what a user script is. They are text the bundle imports
rather than modules it compiles, and they are linted under an eslint override that declares
`defineScript` as a global and treats them as scripts rather than modules. Without that override
`npm run lint` fails on nine files the day they land, which is the sort of thing a spec should
catch and a plan should not discover.

## 11. Pack ids and engine surfaces

**None.** This entry touches no `content-custom/pack/*` file, allocates no obj, inv, loc, map,
interface, dbrow or varp id, patches nothing under `engine-custom/` or `client/`, and needs no
content overlay run. The pack id table in `2026-09-07-sprint-dragon-slayer.md` section 3 is
unaffected. The only server change is two read-only routes.

## 12. Sprint placement

**Ruled: entry 3**, immediately after Shell v2 and before SP8c, with everything below renumbered.

**Its first task is the standard**, not the generator. Section 4 of
`2026-09-07-script-api-survey-and-standard-design.md` and that document's phase-now proposals (P0,
P4's type and overload, P7, P8, P9, P11, P14, P19, P20) land ahead of the seven pages and the nine
examples, because an example written before P8, P9, P11 and P14 land demonstrates an idiom this
same entry is about to replace, and gate 4 would then hold it in place forever. P14 is sequenced
after SP4b plan task 13 within that task. The survey spec is not a row of its own; this is where
half of it lands, and its phase-next proposals become entry 5 after the studio.

Entry numbers below are **post-insertion**: inserting this entry at 3, Spec B at 4 and the Script
API v2 surface at 5 (D25) pushes SP8c, time candy, battlebots and everything under them down by
**three**, and D14's SP3b inserts once more immediately before SP10, so the SP4c row the sprint
table prints as entry 8 becomes **entry 12**. A reader renumbering the sprint should renumber once,
from here.

Why there:

- **It must be after entry 1.** SP4b task 15 is the reason, and it is the only one: it reconciles
  the `DeathBehaviour` drift in `web/src/tasks/types.ts`, and `05-health-and-recovery.md` documents
  that set. SP4b task 10's `RunStatus` fields and task 11's `RunSummary` fields are **not** part of
  the generated surface (section 3.1's re-export list carries neither type), so they are not a
  dependency and this document does not claim them as one. What is left is still a real
  dependency, because generating a reference against a type SP4b is mid-way through rewriting means
  generating it twice.
- **It does not depend on entry 2.** This entry ships no UI, composes no component and touches no
  stylesheet. It could equally run at position 2, ahead of Shell v2. It is placed after only
  because the sprint is sequential and Shell v2 is already argued to be first among the unbuilt
  work.
- **It should be before Spec B.** Spec B's completion source, hover cards and help pane all read
  `api-index.json`. Built in the other order, the studio ships with a hand-listed completion set
  that nobody ever replaces.
- **It should be before SP8c, time candy and battlebots**, for the reason Spec B section 21 gives
  for itself and which applies with the same force here: all three entries author scripts against
  this API (battlebots ships four library bot scripts), and authoring them against an undocumented,
  ungated surface is how a fourth copy of the API's shape ends up in prose.
- **It unblocks SP4c** at its post-insertion position, entry 12. `get_api_docs()` and
  `idlescape://api` become trivial.

The alternative, and its cost: fold this into Spec B as its first phase. That saves one sprint row
and loses the property that the documentation ships even if the studio slips or is cut. The
generator is roughly 600 lines and the studio is several thousand, so coupling the cheap useful
half to the expensive half is the wrong risk.

## 13. Rulings, for the record

Each of these decides a question the readers raised rather than escalating it. Section 14 restates
every one with its alternatives, so the owner can overturn any of them at review.

1. **The reference is generated from the types; the quickstart and the examples are hand written.**
   Both halves live in one artefact and only the generated half is compared by gate 1. *Cost if
   wrong: none identified. A fully hand-written reference drifts within one sub-project, which is
   the failure SP4 section 5 was written to prevent and then suffered anyway.*
2. **The output paths are SP4 section 5's own:** `web/src/agent/API.md`, served at
   `GET /api/agent/docs`, exposed as `idlescape://api`. *Cost if wrong: a relocation, which is a
   sed and a route change.*
3. **The wiki gets one standalone page that links to the reference, not the reference itself.**
   *Cost if wrong: the generator grows a third output and the wiki build must tolerate a generated
   page whose prose has no per-sentence provenance. Roughly a day, and nothing else in this spec
   changes.*
4. **No copy under `docs/`; one pointer line in `CLAUDE.md` instead.** *Cost if wrong: an agent
   session greps `docs/` and misses it. A generated mirror is a two-line change to the generator if
   the owner prefers it.*
5. **Nine examples, and every one is also a template and a test fixture.** *Cost if wrong: nine
   files of maintenance. The alternative, prose snippets inside markdown, is precisely what rots.*
6. **The doc-comment gate applies to our own declarations only.** Vendored `c.bot` and `c.sdk`
   members report coverage and do not fail the build. *Cost if wrong: about a hundred vendored
   members ship with whatever comment upstream gave them, and a reader sees a few bare signatures.
   Enforcing it makes every rs-sdk re-vendor a documentation task and puts our prose inside a
   vendored file, which the vendoring convention forbids without a patch note.*
7. **The example gate is per top-level `ScriptContext` member, not per leaf.** *Cost if wrong: a
   leaf such as `c.wait.message` could go unexampled. Mitigated because the reference lists it with
   its doc comment either way.*
8. **`GET /api/agent/docs` reads a committed file through a new `agentDocs` env var, rather than
   serving out of `web/dist`.** The release ships the tracked tree, so the file is on the box and
   readable before any build has run. *Cost if wrong: a deployment shipping only `web/dist` and
   `server/` would 404. `release.ps1` uses `git archive HEAD`, so it does not.*
9. **Scripts stay JavaScript, and the documentation says so in its first paragraph.** This entry
   does not reopen the transpile question; Spec B section 7 records the same ruling for the editor.
   *Cost if wrong: players who want annotations cannot have them until a separate decision changes
   the storage schema.*
10. **The gate regenerates and byte-compares through `writeOrCheck`; `hash` is metadata.** *Cost if
    wrong: two text files are rebuilt on every build, which is milliseconds. The alternative, an
    input-hash comparison, passes a hand-edited `API.md`, which is the one thing section 3.2 says
    must never happen.*
11. **The seven pages are written in the help pane's markdown subset, and gate 5 parses them with
    the pane's own renderer.** No tables. *Cost if wrong: a two-column enumeration reads as a
    definition list rather than a grid. Adding tables is an addition to Spec B's renderer with a
    style built on `.kv`, priced in ruling 11, not something a page author discovers.*
12. **`web/src/tasks/forbidden.ts` is an input to the generator, and
    `06-limits-and-trust.md` carries a generated block rather than a hand-typed list.** *Cost if
    wrong: none while Spec B is unbuilt (the block is empty). If Spec B lands and this is not done,
    the enforced list and the documented list are two sources with no gate between them, which is
    the failure both specs exist to prevent.*
13. **Gate 6 lives in `scriptApi.harness.ts`, not in a `.test.ts`.** *Cost if wrong: the gate is
    inert and nothing says so, which is worse than not having it.*

14. **Nine examples, and the list in section 6 is the list.** `tutorial-steps` and
    `report-for-claude` stay: between them they are the only home `c.tutorial` has and the only
    plain demonstration of the Copy-for-Claude workflow, and dropping them for seven would leave
    gate 3 passed by scoping rather than by covering. *Cost if wrong: two files of maintenance. A
    snippet cookbook page of one-liners can be added later; it compiles nothing and gates nothing.*
15. **The `--check` gate runs in `scripts/build.ps1`, from `web/`,** beside the atlas and collision
    checks, so a production build cannot ship stale docs. *Cost if wrong: `verify.ps1` only is
    weaker, because a release runs the build; a git hook is on nobody's machine.*
16. **No `.d.ts` tree in this entry.** Spec B's phase 2 adds `--declarations` to this generator when
    it has a consumer, commits the tree and inherits gate 1 over it (section 3.3). *Cost if wrong:
    roughly 600 KB of committed output with no reader and a gate protecting nobody, in exchange for
    making Spec B's phase 2 a slightly smaller change.*
17. **Sprint entry 3, after Shell v2 and before the studio, with the standard as its first task.**
    It must be after SP4b for task 15's `DeathBehaviour` reconciliation; it does not depend on entry
    2 and could run at position 2, and is placed after only because the sprint is sequential and
    Shell v2 is already argued to be first among the unbuilt work. *Cost if wrong: one position.
    Folding it into Spec B as a first phase saves a row and loses the property that the
    documentation ships even if the studio slips, coupling a 600-line generator to a
    several-thousand-line studio.*
18. **`GET /api/agent/docs` and `/api/agent/docs.json` are principal `none`,** like the wiki routes.
    The entire API surface is already in the shipped client bundle, so gating the prose protects
    nothing. *Cost if wrong: the docs are readable by anyone who can reach the box, which is already
    true of the bundle. `either` would make them unreadable to a player who has not paired.*
19. **The generator's version map speaks api versions, not sprint labels** (section 3.2). This
    adopts the survey spec's section 6.2 request in full: S12 owns the version vocabulary, this map
    is its only mechanism, and `@since` is never parsed from a doc comment. *Cost if wrong: a
    member's `since` column would say `SP4b` while its removal window is counted in api versions,
    so the reference could not answer the question S12's two-version window depends on.*
20. **The reference states the trust model and the absence of cross-account sharing as facts**
    (section 4, `06-limits-and-trust.md`), in the standard's and Spec B's own words rather than in
    different ones. That is the survey spec's ruling 15 and 26 and decision D24. *Cost if wrong: the
    one page whose job is to be honest about limits would carry a claim SP4 section 17 makes and the
    runtime does not keep, which is the failure this page exists to end.*
21. **Section 4 documents the standard by reference and does not restate it.** The twelve rules live
    once, in the survey spec's section 4; this document maps page to rule and adds only the three
    runtime facts a generator cannot know. *Cost if wrong: none identified. A second copy of S1 to
    S12 here would be a second source with no gate between them, which is precisely what gate 1 was
    built to prevent one layer up.*
22. **`forbidden_api` is documented as a `TasksErrorCode` the moment Spec B adds it**, so the error
    vocabulary page and the enforced set stay one list. Until then the page carries eleven codes and
    says so. *Cost if wrong: a player meets a refusal the reference does not name, which is exactly
    the complaint section 4 item 3 exists to answer.*

## 14. Questions this document no longer asks

All ten owner questions this document raised are ruled above under D11, and every one took the
recommendation the draft made. There is no departure to flag. The alternatives and their costs stay
in the rulings, so any of them can be overturned at review without reconstructing the argument.

| Was question | Subject | Ruled at |
|---|---|---|
| 1 | Where the developer docs live | rulings 2, 3 and 4 |
| 2 | Generated or hand written | ruling 1 |
| 3 | Every example executed as a test | ruling 5, and gate 4 |
| 4 | Whether nine is the right number | ruling 14 |
| 5 | Whether the doc-comment gate covers the vendored SDK | ruling 6 |
| 6 | Where the `--check` gate runs | ruling 15 |
| 7 | Whether this entry emits the `.d.ts` tree | ruling 16 |
| 8 | Sprint position | ruling 17 |
| 9 | Whether `GET /api/agent/docs` needs auth | ruling 18 |
| 10 | Whether the quickstart pages may use tables | ruling 11 |

Two rulings have no question behind them because they came from the reconciliation rather than from
this draft: ruling 19 (the version map speaks api versions, from the survey spec's section 6.2) and
rulings 20 to 22 (the trust model, documenting the standard by reference, and the `forbidden_api`
code, from audit C30 and from Spec B).

## 15. What this does not do

- It does not build the studio, an editor, a completion UI, a linter or any diagnostic surface.
  That is Spec B, and this spec is complete without it.
- It does not emit a `.d.ts` tree, ship a TypeScript compiler, or type-check anything at run time.
- It does not change `compileUserScript`, `UserTaskDoc`, the Firestore rules, the 64 KB code cap or
  the 60-character name limit.
- It does not close the network hole that SP4 section 17 claims is already closed. It documents the
  hole accurately, at the strength Spec B actually delivers: Spec B closes the accidental path and
  leaves a deliberate constructor-chain escape open, and the page says so in those words rather
  than promising a sandbox neither entry ships.
- It does not emit the `.d.ts` tree. Spec B's phase 2 adds the `--declarations` mode to this
  generator, commits the tree and inherits gate 1 over it; that work is listed in Spec B section 19
  and section 20, not here.
- It does not add a wiki reference page, a second markdown renderer, or an HTML build.
- It does not document the plugin API, the `Transport`, the bank, or anything a script cannot see.
  `scriptApi.ts` is the boundary and gate 6 keeps it one.
- It touches no pack ids, no engine or client patch, and no content overlay.
