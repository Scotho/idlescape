# Shell v2, entry 2: contract map for G8.1-G8.3 and the G1-G3 data questions

Read at commits `19607b1` (first pass) and `274f149` (re-checked). SP4b is committing to this
branch while this was written; every citation under `web/src/tasks/`, `web/src/agent/`,
`web/src/plugins/builtin/tasks*.ts`, `traceView.ts` and `web/src/frame/runBanner.ts` is **moving**
and is flagged as such at the point of use. Files outside those paths were stable across both
reads.

Source of truth order used throughout: the mock
(`docs/design/idlescape-shell-v2/Idlescape Shell v2.dc.html`), then
`docs/design/idlescape-shell-v2/README.md`, then
`docs/superpowers/specs/2026-09-06-idlescape-shell-v2-gaps-design.md`. Where the code disagrees
with the companion spec, section 8 records it.

---

## 1. G8.1 The co-pilot bar's five states

### 1.1 What the mock actually asks for

`Idlescape Shell v2.dc.html:510` declares one enum prop and nothing else:

```
"runState": { "editor": "enum", "default": "running",
              "options": ["unpaired","standby","running","paused","stuck"] }
```

`:525-533` derives every flag from it (`running`, `paused`, `stuck`, `standby`, `unpaired`,
`runExists = running || paused || stuck`). The five presented states are therefore mutually
exclusive and total **in the mock**. The chrome each drives:

| presented | dot (`:601`) | rule (`:605-606`) | canvas pill (`:613-615`) | bar body |
|---|---|---|---|---|
| unpaired | `#666`, no animation | `rgba(0,0,0,.5)` | `● not paired`, `#b4b4b2` | `:57-61` copy + `Pair Claude` |
| standby | `#43a047` | `rgba(0,0,0,.5)` | `● claude paired`, `#43a047` | `:62-66` + `Run a script` |
| running | `#ff981f` pulsing | `linear-gradient(90deg,#d6780a,#ffb95e,#d6780a)`, `barflow 2.6s` | `● claude driving`, `#ff981f` | `:67-76`, script - task - message - `Esc` kbd - elapsed `#ffb95e` - Pause - Stop |
| paused | `#ffb300` | `#ffb300` | `● claude paired` | `:77-84`, "paused - you took control", "resumes in Ns", elapsed `#ffb300`, Resume now, Stop |
| stuck | `#ffb300` | `#e53935` | `● claude paired` | `:85-92`, "stuck on <task>", reason line, elapsed `#7c7c7a`, Open trace, Stop (danger) |

`runExists` also drives the Automation strip button's corner dot (`:487`), so the same derivation
feeds the strip.

### 1.2 Every literal the runtime actually has

**`RunState` - 7 values, and `stuck` is not one of them.**
`web/src/tasks/types.ts:238` (moving):

```ts
export type RunState = 'idle' | 'starting' | 'running' | 'paused' | 'done' | 'failed' | 'stopped';
```

**`PauseReason` - 5 values.** `web/src/tasks/types.ts:237` (moving):

```ts
export type PauseReason = 'player' | 'claude' | 'human-input' | 'stuck' | 'hard-stop';
```

`stuck` is a *pause reason*, set alongside `state: 'paused'`:
`web/src/tasks/runner.ts:117-119` (moving) pushes `{ kind: 'stuck' }` then
`set({ state: 'paused', reason: 'stuck' })`; the hard stop does the same with `'hard-stop'` at
`runner.ts:131`.

**`HealthCondition` - 9 values.** `web/src/tasks/types.ts:99-101` (moving):
`no-progress`, `unexpected-interface`, `dialog-stuck`, `level-up`, `death`, `logout`,
`inventory-full`, `out-of-supplies`, `low-hp`. `evaluate()` returns eight of them in a fixed
priority order at `web/src/tasks/health.ts:127-136`; `low-hp` is deliberately never returned
(`health.ts:122-125`) because it is the runner's own `hardStop.hpBelow`.

**`FailReason` - 13 values.** `web/src/tasks/types.ts:109-114` (moving):
`stuck`, `unreachable`, `no_progress`, `died`, `disconnected`, `out_of_supplies`,
`inventory_full`, `requirements`, `timeout`, `aborted`, `crashed`, `low_hp`, `logged_out`.
The ladder maps five conditions onto five of them at
`web/src/tasks/healthMonitor.ts:19-25` (`TERMINAL`), and the two behaviour rungs add
`logged_out` / `stuck` / `died` at `healthMonitor.ts:56-76`.

**`Escalation` - 4 shapes.** `web/src/tasks/healthMonitor.ts:10`:
`'continue' | 're-anchor' | 'pause-stuck' | { fail: FailReason }`.

**Session lifecycle - 5 values, a third axis the design does not name.**
`web/src/sessions/types.ts:9`: `'booting' | 'title' | 'connecting' | 'online' | 'offline'`,
narrowed for display to `'offline' | 'connecting' | 'online'` by `displayStatus`
(`sessions/types.ts:47-51`).

**Pairing - there is no pairing state type.** What exists is a Firestore listing:
`web/src/panels/connect.ts:44-53` subscribes `agentTokens where uid == uid` and maps each doc to
`AgentTokenRow { id, label, createdAt, lastSeenAt, revokedAt }` (`connect.ts:14-20`).
"Paired" is derived in two places and nowhere else:

- `activeRows()` (`connect.ts:103-105`): `rows.filter(r => r.revokedAt === null)`. Non-empty is
  **paired**; empty is **unpaired**, and that is exactly the empty-state copy at `connect.ts:149`
  ("No Claude session paired.").
- liveness (`connect.ts:153`): `lastSeenAt !== null && Date.now() - lastSeenAt <= SEEN_RECENTLY_MS`
  with `SEEN_RECENTLY_MS = 60_000` (`connect.ts:37`) renders "Active now", otherwise
  "Last seen ...".

So the pairing axis has three observable values: `unpaired`, `paired-stale`, `paired-live`.

### 1.3 The two sources, and where each is observable from the frame

**Source A - run state. Already frame-observable, no new plumbing.**
`TasksRouter.api.status(): RunStatus` and `.onStatus(cb)`
(`web/src/tasks/router.ts:135` and `:138` at `19607b1`; the file is moving and SP4b Task 9 has
already added `setEnabled` around line 134). The router re-publishes **only the active session's**
status (`router.ts:157`) and re-publishes on tab change (`router.ts:169-176`). `main.ts:119-120`
already does exactly what the bar needs:

```ts
runBanner.update(tasksRouter.api.status());
tasksRouter.api.onStatus(s => runBanner.update(s));
```

`RunStatus` itself (`web/src/tasks/types.ts:279-282`, moving) carries
`state, reason, runId, scriptId, scriptName, task, statusLine, attempts, startedAt, attached,
resumeAtMs`. `IDLE_STATUS` (`web/src/tasks/api.ts:102-105`) is what the router answers with when
no session is attached, so the bar never has to handle "no runtime yet" as a special case.

**Source B - pairing. NOT frame-observable today. This is real work, not a read.**
The only `agentTokens` subscription in the codebase is created inside the Claude panel's
`mount()` (`web/src/panels/connect.ts:212-217`) and torn down in `unmount()`
(`connect.ts:246-247`). Panels re-mount on every open and `unmount()` releases everything, so with
the panel closed - which is the normal case for a bar that is always on screen - **nothing in the
frame knows whether Claude is paired.** The status line the shell paints today is a hard-coded
literal: `web/src/sessions/wire.ts:40` writes `'● not paired'` on every login and
`web/src/frame/stage.ts:230` writes the same string on every tab switch. It is not derived from
anything.

The plan must lift `defaultSubscribeSessions` out of `connect.ts` into a frame-level singleton
built in `main.ts` beside `bankStore` (`main.ts:210`), exposing at minimum
`{ paired(): boolean; live(): boolean; subscribe(cb): Unsub }`, with the panel becoming a consumer
rather than the owner. That is the single largest hidden cost in the co-pilot bar.

**A third source the design does not name.** The bar sits above the canvas of the active
character, and that character may not be logged in at all. `sessions.states()`
(`web/src/sessions/manager.ts:289`) and `deriveSessionState` (`sessions/types.ts:39-45`) are the
only truth about that. See ruling C1 below.

### 1.4 The total mapping, nothing falling through

Read top to bottom; the first row that matches wins. `P` is the pairing axis of 1.2, `R` is
`RunStatus.state`, `reason` is `RunStatus.reason`.

| # | P | R | reason | presented | evidence |
|---|---|---|---|---|---|
| 1 | any | `paused` | `stuck` | **stuck** | `runner.ts:117-119` sets exactly this pair |
| 2 | any | `paused` | `hard-stop` | **stuck** | `runner.ts:131`; today's banner already reads it as an error tone (`runBanner.ts:50,79`) |
| 3 | any | `paused` | `player` \| `claude` \| `human-input` | **paused** | `runner.ts:60-64`; `resumeAtMs` non-null only here (`runBanner.ts:65-68`) |
| 4 | any | `paused` | `null` | **paused** | defensive: `RunStatus.reason` is nullable and the banner already falls back to plain "Paused" (`runBanner.ts:55`) |
| 5 | any | `starting` | any | **running** | `runner.ts:161`; `LIVE`/`EXCLUSIVE` both treat it as live (`api.ts:108-110`) |
| 6 | any | `running` | any | **running** | `runner.ts:71,124` |
| 7 | any | `failed` | any | **stuck** for `LINGER_MS`, then row 9/10 | ruling C2 |
| 8 | any | `done` \| `stopped` | any | **standby**/**unpaired** per rows 9/10 immediately | `SETTLED` at `runBanner.ts:37` |
| 9 | paired-live or paired-stale | `idle` \| `done` \| `stopped` (or `failed` after linger) | any | **standby** | `connect.ts:103-105` |
| 10 | unpaired | `idle` \| `done` \| `stopped` (or `failed` after linger) | any | **unpaired** | `connect.ts:149` |

Every one of the 7 `RunState` values is covered: `starting` and `running` -> running (5, 6);
`paused` -> paused or stuck (1-4); `done` and `stopped` -> standby or unpaired (8-10);
`failed` -> stuck then standby or unpaired (7); `idle` -> standby or unpaired (9, 10).

The 9 `HealthCondition` values and the 13 `FailReason` values **never reach the bar as states**.
They are *copy*, and they populate the stuck row's second line ("no Tree within 12 tiles" in the
mock at `:87`). Today there is no field on `RunStatus` carrying either one, so:

- `died`, `disconnected`, `unreachable`, `no_progress`, `out_of_supplies`, `inventory_full`,
  `requirements`, `timeout`, `aborted`, `crashed`, `low_hp`, `logged_out`, `stuck` all end a run
  with `state: 'failed'` and are visible only in the trace `log` line
  `run failed: <reason>` (`web/src/tasks/runner.ts:84`, moving) and in `RunSummary.summary`
  prose (`web/src/agent/workerReport.ts:9-15`).
- `RunSummary` has no `failReason` field today (`web/src/tasks/types.ts:270-277`, moving).
  SP4b Task 11 adds one (`docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md:5487`).
- SP4b **Task 10** adds `RunStatus.target`, `RunStatus.health = { condition, since } | null` and
  `RunStatus.xpPerHour` (`.../2026-09-06-sp4b-bot-expansion.md:5167-5180`). Task 10 has not landed
  at `274f149` (`types.ts:279-282` still carries the SP4a shape). When it lands, `health.condition`
  is the stuck row's second line. It carries **no detail string** even though
  `HealthEvent.detail?: string` exists (`types.ts:103`), so "no Tree within 12 tiles" still has no
  source. See contradiction 8.4.

### 1.5 Rulings the plan must make

**C1. A character that is not logged in.** `SessionState` is `booting`/`title`/`connecting`/
`offline` for a large part of a session's life, and `RunStatus` is `idle` throughout. Both rows 9
and 10 would then present a bar offering "Run a script" for a character sitting on the title
screen. Ruling to adopt: while `displayStatus(session.state) !== 'online'`
(`sessions/types.ts:47-51`), the bar shows the unpaired/standby chrome with the primary button
disabled and the message replaced by the same wording `stage.syncChrome` already uses
(`frame/stage.ts:231-235`: "connecting...", "starting...", "offline - press Login to reconnect",
"press Login to play"). No new copy is invented; it is moved.

**C2. `failed` has no presented state.** The mock has five and none is "failed". The existing
banner already solves this: a settled run lingers `LINGER_MS = 4000`
(`web/src/frame/runBanner.ts:34,37`, moving) and then gets out of the way. Ruling: `failed`
borrows the **stuck** chrome (amber text, red rule, Open trace, Stop) for `LINGER_MS`, with the
failure summary as the second line, then falls to standby or unpaired. `done` and `stopped` do not
linger on the bar at all, because their news belongs in the toast the banner already fires.

**C3. Pairing does not override a live run.** Rows 1-8 ignore `P` on purpose. A player-started run
on an unpaired account is still a running run, and the mock's own `runExists` flag
(`.dc.html:533`) is derived from run state alone. The canvas pairing pill keeps the pairing truth
(`.dc.html:613`: `unpaired ? '● not paired' : running ? '● claude driving' : '● claude paired'`),
which means the pill and the bar can legitimately disagree, and that is correct: `● claude driving`
must only appear when `P !== unpaired`.

---

## 2. G8.2 The trace window

### 2.1 Does every `TraceEvent` carry a usable `kind` rail? Yes.

`web/src/tasks/types.ts:250-268` (moving) is a discriminated union on `kind` with **18 variants**:
`run_started`, `task_enter`, `task_exit`, `action`, `log`, `status`, `xp`, `item`, `stuck`,
`paused`, `resumed`, `human_input`, `snapshot`, `run_done`, `truncated`, `health`, `recovery`,
`target` (the last via `TargetEvent`, `types.ts:245-248`, which renames its resource kind to
`kind_` precisely so `kind` stays the discriminant).

`traceView` already stamps it onto the DOM: `data-kind="${e.kind}"` at
`web/src/plugins/builtin/traceView.ts:63` (moving), and filters on it at `:82-86`. So the design's
"2px kind rails" needs **only a `kind -> colour` map in CSS**, no data change.

The mock's rows (`.dc.html:125-132`) use exactly six of the eighteen, and every one is a real
`kind`:

| mock row | rail | maps to |
|---|---|---|
| `task_enter Chop tree` | `#ff981f` | `task_enter` |
| `action chop → Tree (3222,3218)` | `#4a90d9` | `action` |
| `xp Woodcutting +25` | `#43a047` | `xp` |
| `log inventory 12/28` | `transparent`, muted text | `log` |
| `stuck no Tree within 12 tiles` | `#ffb300`, amber text | `stuck` |
| `paused reason=stuck` | `#ffb300` | `paused` |
| `run_done done · 4,180 xp` | `#ff981f`, bright text | `run_done` |

The remaining eleven kinds need rails assigned by the plan. `describeEvent`
(`traceView.ts:21-42`) already has a prose line for all eighteen and is exhaustive over the union,
so a new kind is a compile error rather than a blank row.

Two mismatches with the mock worth noting: the mock's timestamps read `00:00.1` / `14:07.6`
(mm:ss.d), while `offset()` (`traceView.ts:45`) produces `+0.1s` / `+847.6s`. And the mock's rows
show the raw kind name as the first token of the text (`task_enter Chop tree`), while
`describeEvent` deliberately writes prose (`→ Chop tree`). The mock wins on both per ruling 7.6 of
the companion spec, so `offset()` and `describeEvent` both need editing, in a file SP4b is moving.

### 2.2 How the trace is observed today

The `Trace` object itself lives **inside the Worker**, one per run:
`web/src/agent/worker.ts:9` imports `createTrace`, `:208` does `t = createTrace()` at run start,
`:250` binds it as `buffer`, and `:334` builds a second one for `execute`. Default cap is 5000
events with a `truncated` marker (`web/src/tasks/trace.ts:25,52-63`), and consecutive same-target
`xp`/`item` deltas inside 10 s are coalesced (`trace.ts:12,36-50`).

The frame never touches that object. Events cross the Worker boundary as `trace` messages and fan
out through four hops:

1. `WorkerHost.onTrace(cb)` - `web/src/agent/workerHost.ts:45`, `:95`, `:217`, `:374` (moving).
2. `RunRecorder` - `web/src/tasks/runRecorder.ts:51-60` (a file that did not exist at `19607b1`
   and appeared at `274f149`): it re-buffers every event in a plain array, flushes to IndexedDB
   history every `FLUSH_EVERY = 50` (`runRecorder.ts:16`), and hands each one to the api's
   `onEvent` for the chat echo.
3. `TasksApi.onEvent(cb)` - `web/src/tasks/api.ts:59` declared, `:351` implemented as a straight
   pass-through to `d.host.onTrace(cb)` (moving).
4. `TasksRouter.api.onEvent(cb)` - `web/src/tasks/router.ts:137,158`.

**Scope: per-run inside the Worker, per-session in the frame, and active-session-only at the
router.** Router line 158 is the load-bearing one:

```ts
sessionApi.onEvent(e => { if (deps.activeId() === characterId) emit(eventSubs, e); })
```

A subscriber on `tasksRouter.api` gets nothing for a run on a background character. Replay for a
finished or background run goes through `getRun(runId, sinceSeq)` (`api.ts:305-313`), which the
router routes to `owner(runId)` (`router.ts:138-141`).

### 2.3 What the pop-out window needs that `traceView` does not provide

`renderTraceView` (`traceView.ts:107-134`) returns a bare `<div class="trace">` with a
`<select>` filter, a Copy button and an optional Close. It is mounted *inside the Tasks panel
body*, into a `traceHost` div that is a child of the History section:
`web/src/plugins/builtin/tasks.ts:78` creates it, `:242` fills it, `:274` puts it inside
`section('History', historyHost, traceHost)` (all moving). Everything else about the window is
missing:

1. **A host outside the panel.** The design puts it `position:absolute; right:16px; bottom:16px;
   z-index:30` over the stage (`.dc.html:117`). The frame already has the precedent and the
   pattern: `#bank-host` is a stage-level host element the shell owns and the plugin only opens
   (`main.ts:215` `createBankWindow(byId('bank-host'), ...)`, `plugins/builtin/bank.ts:52,58`).
   The trace window should be built the same way, as `createTraceWindow(byId('trace-host'), ...)`
   in `main.ts`, with the Automation panel and the co-pilot bar's "Open trace" button both being
   handles onto it.
2. **A window chrome.** Header with title + script name + close, 430px, `radius:10`,
   `popIn .18s`, `max-height:250px` scroll body, footer count (`.dc.html:117-134`). None of it
   exists; `.trace-head` today is a select and two buttons.
3. **A text filter, not a kind select.** The mock has `<input placeholder="Filter">`
   (`.dc.html:120`); `traceView.ts:112` has a `<select>` of kinds. Both are wanted (the kind rails
   make the select redundant, the free-text input does not), but the mock is authority, so the
   select goes and `applyFilter` (`:82-86`) becomes a substring test against `data-line`.
4. **A footer count.** `312 events · popped out — the panel stays free` (`.dc.html:133`). The
   count is available (`trace.length` is Worker-side, but `getRun()` returns the array and
   `rows.children.length` is right there).
5. **Survival across a tab switch, and a source for a background run.** The window is a stage
   overlay, so it must decide what happens when the player switches character. Today
   `tasks.ts:289-296` closes the trace on `onActiveChanged`. Given router line 158 drops
   background events, the honest ruling is: the trace window follows the active character and
   closes on a tab switch, same as the panel does now. Anything else needs a per-session event
   subscription the router does not expose.
6. **Copy copy.** The button reads "Copy to Claude" (`traceView.ts:128`); the mock reads
   **"Copy for Claude"** (`.dc.html:121`), as does the Events panel footer (`.dc.html:372`). The
   mock wins. `UNTRUSTED_HEADER` (`traceView.ts:12`) stays.

### 2.4 Does SP4b Task 11 change the trace's mount? Yes.

`docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md:5495` and `:5510`:

> `web/src/plugins/builtin/runReportView.ts` renders the report ... and a "Show trace" toggle that
> mounts the existing `renderTraceView` underneath.
>
> `web/src/plugins/builtin/tasks.ts`: `openTraceFor` becomes `openReportFor`, mounting
> `renderRunReport` and keeping the trace behind its toggle. The existing `data-trace-open` hook
> stays on the history row so `web/e2e/tasks.pw.test.ts` keeps working; add `data-report` to the
> new view.

So after Task 11 the trace is **one level deeper**: history row -> report view -> "Show trace"
toggle -> `renderTraceView`. `renderRunReport` becomes the new consumer of `renderTraceView`, and
`tasks.ts:235-250,264-266` (`closeTrace`, `openTraceFor`, `onEvent`) are all rewritten by SP4b.

Consequences for this entry's plan, and they are load-bearing:

- **Do not plan edits against `openTraceFor`.** It will not exist. Plan against `openReportFor`
  and `renderRunReport`, and re-read `tasks.ts` and `runReportView.ts` at implementation time.
- `runReportView.ts` did not exist at `274f149`; `web/src/plugins/builtin/` has no such file yet.
- The pop-out window and the report's inline trace become **two mounts of the same
  `renderTraceView`**, which is fine as long as `appendTraceEvent` (`traceView.ts:94-105`) is
  called against the right element. Today `tasks.ts:264-265` finds it with
  `traceHost.firstElementChild`; a second mount breaks that assumption. The plan should have the
  window own its own element reference rather than reaching into a host's first child.
- Task 11 also adds `TasksApi.exportRun(runId)` and `RunSummary.failReason`
  (`.../sp4b-bot-expansion.md:5487,5499`), both of which the stuck row's reason line and the run
  card can use.

---

## 3. G8.3 Bank item icons

### 3.1 What client patch 28 exposes

`client/PATCHES.md:174` (the patch table row) and `:218`:

> **SP8b item art.** `getObjIcon(id, count)` renders `ObjType.getSprite(id, count, 0)` (32x32
> `Pix32`, 0 = transparent) into a PNG data URL and memoises it per `(id, count)` in
> `objIconMemo`, capped at `OBJ_ICON_MEMO_MAX`; `getObjInfo(id)` returns
> `{ name, examine, cost, stackable, noted }`. ... An unexpected ObjType throw is reported once per
> session by `warnObjArtFault` ... and answers `null`. The 274 obj cache has no `tradeable` field,
> so none is exposed.

Verification section: `client/PATCHES.md:124` "Patch 28 verification". Both members are on the
shared hooks contract at `web/src/clientTypes.ts:101-102`:

```ts
  /** 32x32 PNG data URL of the inventory sprite, or null (unknown id, or model not streamed yet). */
  getObjIcon(id: number, count?: number): string | null;
  getObjInfo(id: number): ObjInfo | null;
```

### 3.2 How the web bank gets icons today

`web/src/bank/icons.ts` is the whole answer, and it is **already a frame-side module**:

- `IconSource = Pick<ClientHooks, 'getObjIcon'>` (`icons.ts:14`).
- `createIconCache({ client(): IconSource | null })` (`icons.ts:53`) with a three-layer read:
  memory `Map` (`icons.ts:55`, `peek` at `:144` is synchronous and safe in a repaint), then
  IndexedDB `idlescape-icons` / store `icons` (`icons.ts:27-28,80-91`), then the live client at
  `icons.ts:119`: `deps.client()?.getObjIcon(obj, 1) ?? null`.
- Key is the obj id alone, count always 1 (`icons.ts:7-10`) because a bank note is its own obj id
  in 274.
- A `null` from the client is never cached (`icons.ts:115-118`); a `null` from disk is
  (`diskMisses`, `icons.ts:69`).

### 3.3 Can the frame reach it without the client iframe? Yes, with one caveat.

`web/src/main.ts:209`, in the frame's composition root:

```ts
const bankIcons = createIconCache({ client: () => stage.sessions.active()?.hooks ?? null });
```

`stage.sessions.active()` returns the active `CharacterSession` (`frame/stage.ts:297`,
`sessions/manager.ts:287`), and `session.hooks` is the iframe realm's `window.idlescape.client`,
published at `sessions/manager.ts:187` after `waitForHooks` polls `contentWindow`
(`manager.ts:123-135`). The iframe is same-origin (`src = '/play.html'`, `manager.ts:17`), so the
frame calls `getObjIcon` **directly, synchronously, with no messaging channel at all**. The same
is true of `getObjInfo` (`main.ts:208`).

And when no client is open, IndexedDB carries the cache across reloads (`icons.ts:4-6,80-91`), so
the bank draws before any character boots.

**Conclusion: no new client patch is needed. The numbering stays at 28.** G8.3's "if it is not,
that is a client patch, and it is on the critical path for the bank window" does not fire.

**The one caveat the plan must carry.** The cache reads the **active** session's hooks. A bank is
per account (`main.ts:204-205`) and the bank window is a stage overlay, so with no character open
at all - a fresh sign-in before the first tab boots - `deps.client()` is `null` and every uncached
obj renders empty until a frame is up. That is the designed degradation
(`icons.ts:4-6`, `:71-73`), not a bug, but the bank window's empty-slot styling must be legible
with no icon. The mock's slot is `background:rgba(0,0,0,.2)` with the count text drawn separately
(`.dc.html:167-172`), which already survives a missing icon.

---

## 4. G1 / G2 Where the six event types would be emitted from

The frame-level attach point for four of the six already exists and is the right one:
**`wireSession`, `web/src/sessions/wire.ts:21-53`**, called once per session from
`frame/stage.ts:148-154` in the manager's `onReady`, with its disposer held in
`unwireBySession` (`stage.ts:107`) and released in `close()` (`stage.ts:281-282`). It runs in the
frame, holds the iframe's hooks directly, and is already keyed by character id - which is what a
cross-character feed needs.

| # | event type | exact module + callback that already fires | crosses the iframe boundary? |
|---|---|---|---|
| 1 | **XP deltas** | `web/src/sessions/wire.ts:31-36`, `hooks.on('xp', ev => ...)`. Payload is `XpEvent { skill: number; xp: number; level: number; delta: number }` (`clientTypes.ts:55`), forwarded to `tracker.onXp(ev, now())` (`stats/xp.ts:9-14`). | No messaging channel. Same-origin direct call across the iframe; the hook is registered by the client's own `installHooks` and handed to the frame as `session.hooks` (`sessions/manager.ts:187`). |
| 2 | **Loot** | `web/src/sessions/wire.ts:37`, `hooks.on('inventory', ev => loot.onInventory(ev, now()))`. Payload `InventoryEvent { added, removed }` (`clientTypes.ts:56-59`); `createLootLog` counts only `added` (`stats/loot.ts:6-11`). | Same as row 1. |
| 3 | **Level-ups** | The `level` field on the **same** `xp` hook event (`clientTypes.ts:55`); `createXpTracker` already stores `t.level` and updates it (`stats/xp.ts:11-13`). A level-up is `ev.level > previous level for that skill`, which the tracker's `Track` already holds. | Same as row 1. |
| 4 | **Run start / end / fail** | Two surfaces, both already frame-side. Status: `TasksApi.onStatus` -> `TasksRouter.api.onStatus` (`tasks/api.ts:60,352`; `tasks/router.ts:138,157`) - **active session only**. Trace: `run_started` (`tasks/types.ts:251`) and `run_done` (`:264`) events through `WorkerHost.onTrace` -> `RunRecorder` (`runRecorder.ts:51`) -> `TasksApi.onEvent` (`api.ts:351`) -> router (`router.ts:158`) - **also active session only**. | Yes, twice. Worker -> frame by `postMessage` (`agent/workerHost.ts:217` handles `case 'trace'`), and the Worker lives in the frame's own realm (`wireTasks` is called from `frame/stage.ts:159` with `session.hooks`), so it never crosses the iframe. The client-to-Worker leg is `localTransport` (`agent/localTransport.ts:50-60`), which is again a direct same-origin hook call. |
| 5a | **Claude pairing** | `web/src/panels/connect.ts:44-53`, `onSnapshot(query(collection(db,'agentTokens'), where('uid','==',uid)))`. A doc appearing is "MacBook session paired" (`.dc.html:558`); `revokedAt` becoming non-null is a revoke. | No. Firestore, straight to the frame. But see 4.1. |
| 5b | **Claude messages** | **Nothing exists.** There is no agent transport into the web app. Claude drives through `window.idlescape.tasks` (`clientTypes.ts:125-132`), and the SP4c tab socket that would carry a message is referenced only as future work (`tasks/api.ts:2`, `tasks/router.ts:122`). The nearest observable proxies are `RunStatus.reason === 'claude'` / trace `paused.by === 'claude'` (`types.ts:237,260`), `run_started.startedBy === 'claude'` (`types.ts:251`), and the gateway health poll (`connect.ts:231-242`, `web/src/api.ts:12`). | n/a |
| 6 | **Bank changes** | `web/src/bank/store.ts:288` `subscribe(fn)`, fed by the SSE stream's `onVersion` at `:299-308` and by the 10 s poll. The store is built account-scoped in the frame at `main.ts:210-215`. | No. `fetch` to `/api/bank/events` (`bank/stream.ts:20`), parsed in the frame. |

### 4.1 Three lifecycle problems the emitter has to solve

**a. Pairing and bank both go quiet when their panel or window is closed.**
The `agentTokens` subscription is created in `connect.ts:212` and destroyed in `:246`.
`bankStore.start()`/`.stop()` are called from `bank/view.ts:245` and `:266` - i.e. only while the
bank *window* is open (`plugins/builtin/bank.ts:52,58` open and close it with the panel). An
append-only feed that only records bank changes while the player is staring at the bank is not the
feed the mock shows ("Bank updated - 27 / 240 slots used" at `.dc.html:562`). Both subscriptions
have to move to `main.ts` and become frame-lifetime singletons, with the panel and the window as
consumers.

**b. Run events are filtered to the active character before they reach the frame.**
`router.ts:157-158` drops both status and trace for background sessions. A **cross-character**
Events feed cannot subscribe to the router. It must subscribe per session, at the same place the
stage already attaches the api: `stage.ts:159-170`, where `tasksBySession.set(session.id, api)`
happens and the raw `TasksApi` is in hand. Emit from there, not from `deps.tasks`.

**c. G2's premise is wrong in a way that makes the work smaller.** See 8.2.

### 4.2 What the mock demands of the event record

From the rows at `.dc.html:551-565` and the filters at `:567-580`, an event needs
`{ at, characterId, type, skill|null, text, tone }`:

- `type` is one of the six chip keys, and the keys are singular: `xp`, `loot`, `level`, `run`,
  `claude`, `bank` (`.dc.html:576`) with display labels `XP`, `Loot`, `Levels`, `Runs`, `Claude`,
  `Bank`.
- `skill` is a separate axis from `type` and is `null` for four of the six; the select filters on
  it independently (`.dc.html:568-570`), and its options are skill **display names**
  (`Woodcutting`, `Firemaking`, `Mining`, `Fishing` at `.dc.html:347-350`) which match
  `SKILL_NAMES` in `web/src/stats/skills.ts` (used at `stats/xp.ts:23`). The client's `XpEvent`
  carries a numeric `skill`, so the emitter converts.
- `tone` is **not** derivable from `type`: `run` has two rails, `#4a90d9` for ordinary run rows and
  `#e53935` for a failure, and the failure row also changes the text colour to `#ffb300`
  (`.dc.html:560-561`). `level` also carries a tinted background `rgba(255,152,31,.07)`
  (`.dc.html:552`) that no other type has.

### 4.3 G2, the canvas XP drop

The mock's drop is a skill chip plus white `+N` in mono 13/700 with `floatUp 2.6s` spawning at the
canvas top-centre (README "Canvas overlays"; `.dc.html:546` sets
`left:50%; top:20%; transform:translateX(-50%); animation:floatUp 2.6s ease-out forwards`).

The signal it needs is `hooks.on('xp')`'s `delta` (`clientTypes.ts:55`) - one hook event per xp
change, already discrete, already carrying the skill and the level. The companion spec's proposed
"client state diff on each tick" is not needed and would be worse. One producer, two consumers
still holds: emit at `sessions/wire.ts:31`, and let the drop and the Events row read the same
record. The drop is drawn by whoever owns `web/src/frame/overlays.ts` (the module that already
owns `setXpLine`, wired at `stage.ts:151`).

---

## 5. G3 The per-character session clock

### 5.1 A start stamp already exists, and it is stamped at the wrong moment

`CharacterSession` carries **two** timestamps already
(`web/src/sessions/types.ts:20-21`):

```ts
  startedAt: number;
  lastStateAt: number;
```

`startedAt` is set once in `openInner` at `web/src/sessions/manager.ts:170`, at the moment the
iframe object is created and the session enters `booting` - before hooks, before the credential
mint, before login. `lastStateAt` is updated on every state transition in `refresh()`
(`manager.ts:106-107`). Neither is read anywhere: `grep` finds no consumer.

The design's `1:29:07` is an **online** timer (README: "Live online timer on the active character
tab (mono, `1:29:07`), replacing the word 'online'"), so `startedAt` is the wrong clock. A frame
open on the title screen for two hours would read 2:00:00 with the character never logged in.

### 5.2 Exact attach and detach points

**Attach (three, all needed).**

1. `web/src/sessions/manager.ts:139` - `hooks.on('login', ...)`. The edge that matters. Set
   `session.onlineSince = now()` before `refresh(entry)`.
2. `web/src/sessions/manager.ts:98-109` - `refresh(entry)`. The poll (`manager.ts:117`, 1 s) is
   what actually discovers `loggedIn` for a session that came online without a `login` hook event
   (a client that was already in game when the frame attached, which `login()` at `:265` explicitly
   handles). Set the stamp here on the `-> 'online'` transition, which makes it the single
   authority and makes 1 redundant-but-harmless.
3. `web/src/sessions/manager.ts:196` - the `refresh(entry)` inside `openInner` after hooks arrive,
   for the same reason.

The clean form is to put it inside `refresh()` alone, at `manager.ts:107`, beside
`entry.session.lastStateAt = now()`:

```ts
if (next === 'online' && entry.session.state !== 'online') entry.session.onlineSince = now();
if (next !== 'online') entry.session.onlineSince = null;
```

**Detach (three).**

1. `web/src/sessions/manager.ts:140` - `hooks.on('logout', ...)`, and `:141`
   `hooks.on('disconnect', ...)`. Both call `refresh`, so the `next !== 'online'` clause above
   covers them.
2. `web/src/sessions/manager.ts:147-155` - `remove(entry)`, which deletes the entry entirely. The
   stamp dies with the session; nothing extra to do.
3. `web/src/sessions/manager.ts:290-294` - `dispose()`, which `remove`s everything.

Frame-local, never persisted, per the companion spec's G3 resolution. It belongs on
`CharacterSession` (`sessions/types.ts:13-22`) as `onlineSince: number | null`, and it must be
added to the object literal at `manager.ts:168-171`.

### 5.3 Where the tab renders its status text

`web/src/frame/characterTabs.ts:75`, inside `slotHtml` for `kind: 'character'`:

```html
<span class="char-tab-status" data-tab-status>${slot.status}</span>
```

`slot.status` is a `SessionStatus` (`'offline' | 'connecting' | 'online'`) computed at
`characterTabs.ts:37` from `displayStatus(input.states[character.id] ?? 'offline')`. The tooltip at
`:41` embeds the same word (`${gameName} · ${status}`), and the dot class at `:73` uses it too.

`TabsInput` (`characterTabs.ts:23-29`) carries `states: Record<string, SessionState>`, supplied
from `sessions.states()` at `frame/stage.ts:252`. To render a clock the input needs a second map
(`onlineSince: Record<string, number | null>`) or `states` becomes a record of a richer object.
`render()` (`characterTabs.ts:125-136`) does a **full `innerHTML` rebuild**, which is the wrong
shape for a 1 Hz tick: it would blow away focus and `tabIndex` every second. The plan needs a
`tick()` that patches `[data-tab-status]` text in place, exactly as
`runBanner`'s `elapsedEl` does (`frame/runBanner.ts:108`, moving) and as SP4b's `updateRunCard`
does for the same reason.

The mock keeps the word for a non-online tab: the active tab shows `{{ onlineFor }}` mono 10px
`#7c7c7a` (`.dc.html:43`) and the offline tab shows the literal `offline` (`.dc.html:44`). So
`displayStatus` stays and only the `online` case is replaced by the clock.

---

## 6. What the mock confirms

- **Co-pilot bar**: five states, one enum, mutually exclusive; derivation at `.dc.html:525-533`;
  chrome table in section 1.1. `runExists = running || paused || stuck` also drives the Automation
  strip dot (`.dc.html:487`), which is the same job `runBanner.paintDot` does today
  (`frame/runBanner.ts:131-140`, moving) against `[data-panel="tasks"]` - the selector survives the
  rename per ruling 7.2.
- **Trace window**: six kinds shown, all real `TraceEvent` kinds; rails at `.dc.html:125-132`;
  chrome at `:117-134`.
- **Events panel**: chip keys `xp / loot / level / run / claude / bank` (`.dc.html:576`); row shape
  `time (mono 10px #575755) · text (11px) · character badge (9px pill)` (`.dc.html:356-360`);
  2px left rail plus optional tinted background and per-row text colour (`.dc.html:551-565`);
  footer `{{evCount}} of {{evTotal}} events · this session` with a `Copy for Claude` link
  (`.dc.html:372`); empty state "No events match" / "Loosen the filters - or go make something
  happen." / `Clear filters` (`.dc.html:364-369`).
- **Filter semantics**, from `.dc.html:567-570`: character is single-select including `All`; types
  are **multi-select and empty means all**; skill is single-select including `all`. Three
  independent axes ANDed.

---

## 7. Files this settles, and their state at `274f149`

| File | Role | Moving under SP4b? |
|---|---|---|
| `web/src/tasks/types.ts` | `RunState`, `PauseReason`, `HealthCondition`, `FailReason`, `TraceEvent`, `RunStatus`, `RunSummary` | **Yes** (Tasks 10, 11) |
| `web/src/tasks/runner.ts` | where `paused`+`stuck` and `paused`+`hard-stop` are set | **Yes** |
| `web/src/tasks/healthMonitor.ts` | `TERMINAL`, `Escalation`, occurrence budgets | **Yes** |
| `web/src/tasks/health.ts` | `evaluate()` priority order | **Yes** |
| `web/src/tasks/trace.ts` | the ring buffer, cap 5000, coalescing | Yes, lightly |
| `web/src/tasks/api.ts` | `onEvent`, `onStatus`, `getRun`, `IDLE_STATUS` | **Yes** (`runRecorder` split landed at `274f149`) |
| `web/src/tasks/runRecorder.ts` | new at `274f149`; the frame-side trace buffer | **Yes** |
| `web/src/tasks/router.ts` | active-session filtering of status and trace | **Yes** (`setEnabled` landed) |
| `web/src/plugins/builtin/traceView.ts` | `describeEvent`, `data-kind`, `offset` | **Yes** (Task 11) |
| `web/src/plugins/builtin/tasks.ts` | `openTraceFor` -> `openReportFor` | **Yes** (Task 11) |
| `web/src/plugins/builtin/runReportView.ts` | does not exist yet | **Yes** (Task 11 creates it) |
| `web/src/frame/runBanner.ts` | the surface the co-pilot bar replaces | **Yes** (Task 10) |
| `web/src/sessions/manager.ts` | `startedAt`, `refresh`, login/logout/disconnect hooks | No |
| `web/src/sessions/types.ts` | `SessionState`, `deriveSessionState`, `displayStatus` | No |
| `web/src/sessions/wire.ts` | the per-session hook attach point for xp/inventory/login | No |
| `web/src/frame/characterTabs.ts` | `[data-tab-status]`, full-rebuild `render()` | No |
| `web/src/frame/stage.ts` | `wireSession` call site, `tasksBySession`, `syncChrome` | No |
| `web/src/frame/panels.ts` | `cs.panel` read/write and `restore()` | No |
| `web/src/panels/connect.ts` | the only `agentTokens` subscription | No |
| `web/src/bank/icons.ts` | the IconCache; patch 28 consumer | No |
| `web/src/bank/store.ts` | `subscribe`, `start`/`stop` | No |
| `web/src/clientTypes.ts` | `HookEvents`, `ClientHooks`, `XpEvent`, `ObjInfo` | No |
| `web/src/types.ts` | `PanelId` closed union | No |

---

## 8. Contradictions found

**8.1 `stuck` is not a run state, and three of the eleven "state literals" are failure reasons.**
The companion spec, section 2 table row 4 (`2026-09-06-idlescape-shell-v2-gaps-design.md:27`),
says: "Run state literals already in the task runtime: `idle`, `starting`, `running`, `paused`,
`stuck`, `stopped`, `failed`, `done`, plus `died`, `disconnected`, `unreachable` from the health
ladder." G8.1 (`:143-147`) then counts eleven and asks for a mapping of the seven "others".

The code says otherwise. `RunState` has exactly seven values and `stuck` is not among them
(`web/src/tasks/types.ts:238`); it is a `PauseReason` (`:237`) set with `state: 'paused'` at
`web/src/tasks/runner.ts:118`. `died`, `disconnected` and `unreachable` are `FailReason` values
(`types.ts:110`), not health-ladder conditions - the ladder's conditions are the nine
`HealthCondition` values at `:99-101`, and the ladder maps five of them onto `FailReason` at
`healthMonitor.ts:19-25`. The mapping G8.1 asks for is therefore over three axes, not one, and the
real count of literals the bar must cover is 7 + 5 + 9 + 13 + 5 (`SessionState`) rather than
eleven. Section 1.4 gives it.

**8.2 G2's premise is false: the client already emits a discrete per-drop XP event.**
G2 (`:80-87`) says "The XP tracker samples state on a timer to compute a rate; a sampled delta and
a drop are not the same event" and resolves that the drop should derive "from the client state diff
on each tick rather than from the tracker's sampling window".

There is no sampling window. `HookEvents.xp` is `XpEvent { skill; xp; level; delta }`
(`web/src/clientTypes.ts:55,65`), one event per xp change, and `createXpTracker.onXp`
(`web/src/stats/xp.ts:9-14`) is edge-driven off it via `hooks.on('xp', ...)` at
`web/src/sessions/wire.ts:31-36`. The 5 s timer in the XP **panel**
(`web/src/plugins/builtin/xpTracker.ts:7,35`) is a *render* timer, not a sampler; it re-reads
`tracker.rows(Date.now())`, which computes `perHour` from `latest - baseline` over wall time
(`stats/xp.ts:15-26`). No state diff needs building. This makes G2 cheaper than the companion spec
budgets for, and it makes the level-up producer free as well (row 3 of section 4's table).

**8.3 G3's premise is half false: a per-character session-start timestamp does exist.**
G3 (`:90-96`) says "There is no per-character session-start timestamp anywhere". `CharacterSession`
has carried `startedAt` and `lastStateAt` since SP7 (`web/src/sessions/types.ts:20-21`), set at
`web/src/sessions/manager.ts:170` and `:107`. The real defect is subtler and G3 does not name it:
`startedAt` is stamped when the **iframe** is created, in state `booting`, so it measures frame
age, not online time, and the design's timer is explicitly an online timer. The correct field is a
new `onlineSince`, stamped on the transition into `online` (section 5.2). G3's conclusion
("stamp session start ... when a character's runtime attaches, and clear it on detach") would
produce the wrong number if implemented literally, because a runtime attaches at
`stage.ts:159-170` on `onReady`, which fires before login.

**8.4 SP4b Task 10's `RunStatus.health` cannot produce the mock's stuck reason line.**
The mock's stuck row has two strings: `stuck on Chop tree` and the reason
`no Tree within 12 tiles` (`.dc.html:86-87`). Task 10 adds
`health: { condition: HealthCondition; since: number } | null`
(`docs/superpowers/plans/2026-09-06-sp4b-bot-expansion.md:5175-5176`), which gives
`no-progress`, not prose. `HealthEvent` does carry `detail?: string`
(`web/src/tasks/types.ts:103`) and the trace's `health` event carries it too (`:266`), but neither
reaches `RunStatus`. The nearest available string is `statusLine` (`:281`), which is whatever the
script last passed to `c.status()` (`agent/worker.ts:214`) and is not a stuck reason. The plan must
either widen Task 10's `health` to carry `detail`, or read the last `health`/`stuck` trace event.
Note that neither `stuck` (`types.ts:259`) nor `paused` (`:260`) carries a reason string either -
`stuck` carries a `snapshot`.

**8.5 `TasksRouter` filters trace and status to the active session, which the Events panel cannot
use.** The companion spec's G1 (`:65-70`) correctly says the feed "cannot live inside a character's
iframe session" and "has to sit in the frame, above SP7's session manager, and be fed by every
session". It does not notice that the frame's one published run-event surface,
`window.idlescape.tasks`, is *already* per-active-session by design (`tasks/router.ts:157-158`),
so "sit in the frame" is not sufficient - the emitter has to attach per session at
`frame/stage.ts:159-170`, beside `tasksBySession.set(...)`, not to `deps.tasks`.

**8.6 Two of the six event producers are only alive while their surface is open.** G1 lists "the
agent transport" and "the owner bank's change stream" as producers. The `agentTokens` listener is
created and destroyed by the Claude panel's mount/unmount (`web/src/panels/connect.ts:212-217`,
`:246-247`) and `bankStore.start()`/`.stop()` are called by the bank **window**
(`web/src/bank/view.ts:245,266`, opened and closed with the panel at
`web/src/plugins/builtin/bank.ts:52,58`). A session-scoped feed fed by producers that only run
while the player is looking at them will show a hole in the middle of every session. Both must be
lifted to `main.ts` singletons.

**8.7 There is no agent transport, so one of the six event types has no producer at all.**
G1 names "the agent transport" as a source. The web app has no channel from a Claude session other
than Firestore `agentTokens` and the not-yet-built SP4c tab socket
(`web/src/tasks/api.ts:2`, `web/src/tasks/router.ts:122`). Of the three `claude` rows in the mock,
"MacBook session paired" (`.dc.html:559`) comes from `agentTokens`, "Gateway connected - ws ok"
(`.dc.html:565`) comes from the `/health` poll (`web/src/api.ts:12`, used at
`panels/connect.ts:231-242`), and "Claude started Chop and drop" (`.dc.html:558`) comes from
`run_started.startedBy === 'claude'` (`tasks/types.ts:251`). None of them is a Claude *message*.
The plan should scope the `claude` chip to those three producers and say so, rather than implying a
message channel this entry does not build.

**8.8 The bar and the canvas pairing pill can legitimately disagree, and the design says so.**
`.dc.html:613` derives the pill from pairing first (`unpaired ? '● not paired' : ...`) while the
bar's five states are derived from a single enum where `unpaired` and `running` are mutually
exclusive. On a real unpaired account running a player-started script the bar is `running` and the
pill must be `● not paired`. Ruling C3 above. The current code hard-codes the pill string
(`web/src/sessions/wire.ts:40`, `web/src/frame/stage.ts:230` both write the literal
`'● not paired'`), so both call sites have to start reading the pairing store.

**8.9 Copy drift between `traceView` and the mock.** `traceView.ts:128` says "Copy to Claude"; the
mock says "Copy for Claude" in both the trace window (`.dc.html:121`) and the Events footer
(`:372`). Mock wins per companion ruling 7.6. Same file: `offset()` (`traceView.ts:45`) formats
`+3.9s` where the mock formats `00:03.9` (`.dc.html:127`), and `describeEvent` writes prose where
the mock leads with the raw kind token. Three small edits in a file SP4b Task 11 is rewriting.

**8.10 Icon glyph names and plugin ids do not line up one-to-one, and the count only works after
the merges.** Confirmed: `Icon.d.ts:3` ships eleven glyph names
(`automation | claude | xp | loot | events | notes | screenshot | bank | account | plugins |
config`); `main.ts` has 13 `shell.register` calls, of which `status-hud` has no `panel()`
(`plugins/builtin/statusHud.ts:41` manifest, and the plugin exposes only `overlay()`), leaving 12
strip buttons. The glyph names are **display** names, not plugin ids: `automation` is plugin id
`tasks` (ruling 7.2, `plugins/builtin/tasks.ts:325`) and `claude` is plugin id `connect`
(`panels/connect.ts:12`). `PluginManifest['icon']` narrowing (G7) therefore narrows to a glyph
union that does not match `PanelId` (`web/src/types.ts:5`), and the two must not be conflated. Also
note `PanelId` is a closed union that does not contain `'events'`, so adding the Events panel is a
compile error at `web/src/types.ts:5` first - which is the cheap migration G7 wants, applied to
panel ids as well as icons.

**8.11 The `cs.panel` fallback has exactly one site, and it currently fails silently.**
`createPluginRegistry.restore()` at `web/src/frame/panels.ts:58-64` reads `cs.panel` and does
`if (saved && views.has(saved as PanelId)) open(saved as PanelId)` - an unknown id opens nothing
and the player's panel is silently forgotten. Ruling 7.3's permanent `characters -> account`
fallback goes here and nowhere else. `open()` also **writes** `cs.panel` on every open
(`panels.ts:38`) and `close()` removes it (`:24`), so the stored value self-heals after one open;
the fallback is still permanent because an old browser can arrive at any time.
