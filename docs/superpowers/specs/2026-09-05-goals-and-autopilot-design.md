# Idlescape — Goals, Recommended Routines, and Autopilot

Date: 2026-09-05
Status: **partly superseded, 2026-09-07 (decision D17).** The co-pilot model is settled against
this document: sprint entry 2 builds the shell v2 co-pilot bar as the vendored mock draws it, five
presented states over SP4's fixed rule, and this spec's three-mode selector does **not** amend that.
The rest of this document - the Goals store, the Recommended Goals library, the event-diff model,
the client action log, the three-mode selector and autopilot - remains a **candidate entry after
SP4c (sprint entry 16), pending a row**. It has no row today and no code exists for any of it. Its
four open questions in section 10 are ruled below.
Amends: `2026-09-05-sp4-agent-runtime-design.md` (adds a Goals store, a three-mode selector
(Player only / Co-pilot / Autopilot), an event-diff notification model, and a client action log;
changes SP4's fixed co-pilot rule to a human-chosen mode). Depends on SP4's runtime (`/tab`, `/mcp`, hooks v2 world state
and `dispatch`, the task runner) and the entry-screen spec's agent-token `mode`.
Slot: SP4 extension. Build it as the final step of SP4 (after the task runner and `/mcp` land),
or as a thin SP4b once SP4's runtime is green. Not before SP4.

## 1. What this adds

1. A **Goals** section attached to the Firebase account: a durable, live list of objectives
   the player or Claude can add to and remove from, each high-level but carrying the metadata a
   detailed plan needs before execution.
2. A **Recommended Goals** library: a curated, versioned set a new player clicks to adopt. Each
   recommended goal is a ready-to-run routine — requirements, a suggested route, the ordered
   tasks, and everything Claude needs to begin acting on one click.
3. **Three modes** via one selector — Player only, Co-pilot, Autopilot (section 5.0). In
   Autopilot, Claude pursues the active goal continuously; the player can drop to Co-pilot or
   Player only at any time, and any human input pauses autonomy.
4. An **event-diff** model so autopilot does not require streaming full world state every tick.
5. A durable **client action log** the player can scroll and Claude can reference.

## 2. Decisions (owner to confirm; defaults chosen and stated)

| # | Question | Decision |
|---|---|---|
| 1 | Storage backend for goals | Firestore `users/{uid}/goals/{goalId}`. We use no Realtime Database; Firestore gives live updates via `onSnapshot` and matches the existing identity/tasks rules. SQLite stays server-owned tracker data, not per-user goals. |
| 2 | Modes | Three player-chosen modes via one selector: **Player only** (observe/answer, no actions), **Co-pilot** (act only when asked; default), **Autopilot** (pursue the active goal continuously). Maps onto the owner-controlled agent-token `mode` ceiling (observe/control) plus a live autonomy state. Amends SP4 section 1's co-pilot rule to a human-chosen mode; owner confirmed 2026-09-05. See section 5.0. |
| 3 | Full state vs diffs | Full state on demand (`get_state` at decision points); small event diffs pushed between decisions. Never a per-tick full-state stream. |
| 4 | Action log durability | Recent log in the tab (memory + `localStorage` for the player's own review); a capped, durable event log in Firestore `users/{uid}/log` (rolling, size-limited) that Claude queries via a `get_log` tool. Older entries roll off; nothing unbounded. |
| 5 | Who may edit goals | The player from the Goals panel; Claude via `/mcp` tools (`list_goals`, `add_goal`, `remove_goal`, `set_active_goal`). Claude adding/removing requires the player's request in conversation; the tools exist in any mode but write only the player's own documents (through the tab, under client rules). |
| 6 | What arms an action | Autopilot requires all of: agent-token `mode: control` (owner ceiling), the mode selector on Autopilot, an active goal with a plan, and a connected tab with the human present. Missing any one falls back to Co-pilot (ask first) or disables the Autopilot segment. |

## 3. Goals data model

Firestore `users/{uid}/goals/{goalId}`:

```ts
interface Goal {
  id: string;
  title: string;                 // high-level, e.g. "Reach 40 Fishing"
  detail: string;                // free text the player or Claude expands
  status: 'inactive' | 'active' | 'done' | 'abandoned';
  source: 'user' | 'claude' | 'recommended';
  recommendedId?: string;        // set when adopted from the library
  createdAt: number; updatedAt: number;
  // metadata a detailed plan needs BEFORE execution:
  plan?: {
    requirements: Requirement[]; // skills, items, quest/points, membership, gp
    route: RouteStep[];          // ordered, human-readable steps
    tasks: TaskRef[];            // ordered SP4 task refs + params to actually run
    estimate?: { minutes?: number; xpPerHour?: Record<string, number> };
    members: boolean;
  };
  progress?: { note: string; at: number }[]; // appended as autopilot advances
}

interface Requirement { kind: 'skill'|'item'|'quest'|'qp'|'gp'|'members'; key?: string; level?: number; qty?: number; text: string; }
interface RouteStep { text: string; where?: string; }         // "Chop trees NW of Lumbridge bank"
interface TaskRef { taskId?: string; recommendedTask?: string; params?: Record<string, unknown>; }
```

Rules: `users/{uid}/goals/{goalId}` and `users/{uid}/log/{entryId}` — read/write own documents
only; `detail` and `title` length-capped; `code` never stored here (tasks own code). Exactly one
goal may be `active` at a time; setting one active flips the previous to `inactive` in a
transaction. High-level goals may exist with no `plan`; a plan is REQUIRED before autopilot will
execute (the toggle stays disabled with "add a plan first" until `plan.tasks` is non-empty).

## 4. Recommended Goals library

A committed, versioned dataset under `web/src/data/recommended-goals.json`, generated where
possible from the Content pack by `scripts/gen/recommended-goals.ts` (item and quest ids
resolved from the pack so they stay valid across revisions) and hand-authored for routes. Each
entry is a `Goal.plan` plus display copy and a category. Adopting one clones it into
`users/{uid}/goals` with `source: 'recommended'` and `recommendedId` set, so the player owns an
editable copy and the library can update independently.

Shape:

```ts
interface RecommendedGoal {
  id: string; category: 'quest'|'skilling'|'money'|'gear'|'milestone';
  title: string; blurb: string; members: boolean;
  plan: Goal['plan'];            // requirements + route + tasks + estimate
  difficulty: 'starter'|'easy'|'medium';
}
```

### 4.1 Starter set (build 274, F2P-first; each is click-to-adopt)

Content availability is validated against the pinned Content clone at generation time; any entry
whose items/quests/NPCs are absent in the running revision is dropped by the generator.

| id | category | title | requirements | route / routine (summary) |
|---|---|---|---|---|
| `cooks-assistant` | quest | Cook's Assistant | none | Lumbridge Castle kitchen; gather egg (chicken pen), milk (dairy cow NW), flour (mill NW of Lumbridge, wheat + hopper + bin); return to the cook. Task chain: gather → mill → hand-in. |
| `sheep-shearer` | quest | Sheep Shearer | none | Shears from Lumbridge; shear sheep in the Lumbridge pen; spin wool at the spinning wheel upstairs; hand Fred 20 balls of wool. |
| `restless-ghost` | quest | The Restless Ghost | none | Father Aereck → Father Urhney (SW hut) for the amulet; wear it at the haunted graveyard; return the skull from the coffin. |
| `wc-to-15` | skilling | Woodcutting to 15 | axe | Chop normal trees by Lumbridge; drop or bank logs; stop at 15 for oaks. Routine loops chop→drop. |
| `fishing-to-20` | skilling | Fishing to 20 | small net | Net shrimp/anchovies at Lumbridge Swamp or Al Kharid; bank or drop; 20 unlocks fly fishing. |
| `mining-smithing-start` | skilling | Mine & smith bronze | pickaxe | Mine copper+tin at the SE Lumbridge / Al Kharid mine; smelt bronze bars at a furnace; smith daggers. |
| `cowhide-cash` | money | Cowhide starter cash | none | Kill cows at the Lumbridge cow field; collect hides; bank; (members: tan at Al Kharid). Early Crafting + gp. |
| `first-quest-points` | milestone | Your first 5 quest points | none | Adopts cooks-assistant + sheep-shearer + restless-ghost as an ordered multi-goal. |
| `runescape-guide-tour` | milestone | Learn the ropes | none | Talk to the Lumbridge tutors (combat, cooking, mining); a guided orientation, no combat risk. |
| `bank-a-load-of-logs` | skilling | Bank 100 logs | axe | Chop→bank loop near Lumbridge; teaches banking + inventory management; feeds Firemaking later. |

The generator marks each requirement resolvable from the pack (item ids, quest ids) and leaves
the human-readable route text authored. Members-only goals are hidden unless the world is a
members world (`NODE_MEMBERS`).

## 5. Autopilot semantics

### 5.0 Three modes and the mode selector (the primary control)

The single control for how much Claude does is a three-position **mode selector**, replacing the
earlier standalone "Pilot" toggle. The three modes:

| Mode | Claude may | Maps to |
|---|---|---|
| **Player only** | Observe and answer questions in chat; take NO game actions. | agent-token `mode: observe` (or no control) |
| **Co-pilot** (default) | Act only when the player asks, one request at a time. | `mode: control`, autonomy off |
| **Autopilot** | Pursue the active goal continuously until done, blocked, or stopped. | `mode: control`, autonomy on, active goal with a plan |

Relationship to the owner-controlled agent-token `mode` (observe/control from the entry-screen
spec): the token `mode` is the **ceiling**. If the owner set the paired session to `observe`,
the selector can only reach Player only, and Co-pilot/Autopilot are disabled with "this Claude
session is observe-only — change it in Claude Connection". Within a `control` token, the player
picks Co-pilot or Autopilot live. Claude can never raise its own mode or move the selector; it
may only *request* a change, which surfaces as a prompt the player confirms.

Autopilot is selectable only when: the token is `control`, a `/mcp` session is connected, and
the active goal has a non-empty `plan.tasks`. Otherwise that segment is disabled with the reason.

**Human input always wins.** Any real click or keypress in the game world during Autopilot
immediately aborts the in-flight task (SP4 `stop` + `AbortSignal`) and moves to a **paused**
sub-state: the selector still reads Autopilot but shows "Paused — you took control", and the
loop resumes after a short idle (configurable, default ~5 s of no human input) or a **Resume**
click. Switching the selector to Co-pilot or Player only cancels autonomy outright. This layers
on SP4's existing cancel-on-human-input.

Mode is per tab and not persisted across reloads by default (arming autonomy is a deliberate act
each session); open question 1 covers remembering it. `set_pilot`/`set_mode` from Claude
(section 7) only succeeds up to the current token ceiling and only requests Autopilot — the
player's selector is the authority.

### 5.0.1 Mode selector UI

- **Primary control:** a three-segment switch in the Claude panel header, left-to-right
  Player only · Co-pilot · Autopilot, with the active segment filled in the RuneLite orange and
  disabled segments greyed with a tooltip reason. A one-line caption under it states the current
  posture ("Claude acts only when you ask" / "Claude is pursuing: <goal>").
- **Always-visible compact form:** a small pill in the frame title bar (and mirrored as a canvas
  overlay top-left) showing the current mode as a single word and a colour — grey Player,
  cyan Co-pilot, orange Autopilot (pulsing while actively acting, steady while paused) — so the
  player always knows who is driving without opening a panel. Clicking the pill opens the Claude
  panel focused on the selector.
- **Autopilot running banner:** while Autopilot is acting, a slim banner across the top of the
  game canvas: "Autopilot: <goal title> — <current task step>" with a Stop button (drops to
  Co-pilot) and a Pause button; paused shows "Paused — you took control · Resume".
- **Safety affordances:** Stop is always one click from anywhere Autopilot is visible (banner,
  pill menu, selector). Escape stops. The banner turns red on a hard-stop event (`died`,
  `hp_low`) with what happened.
- **Discoverability:** on first entering the game the selector sits on Co-pilot with a one-time
  coach mark pointing at it ("You're in control. Switch to Autopilot to let Claude run a goal,
  or Player only to go solo."). Player-only hides the Claude chat composer's send-to-act
  affordances but keeps the chat/observe view.
- **State source of truth:** the selector reflects, in priority order, the token ceiling
  (disables segments), the active-goal-with-plan precondition (disables Autopilot), and the live
  paused sub-state. It never shows Autopilot as available when it cannot actually run.

### 5.2 Event-diff model (answering full-state vs diffs)

- The client already collects full world state per cycle (SP4 hooks v2 `getWorldState`). It stays
  in the tab; it is never streamed wholesale.
- Claude pulls full state on demand via `get_state` at decision points (goal start, task
  completion, a blocking condition).
- Between decisions the client emits **event diffs** over `/tab` as `event` messages, derived
  from the hooks stream and small comparators: `xp {skill,delta}`, `item {id,delta}`,
  `level_up {skill,level}`, `arrived {where}`, `target_dead`, `dialog_open {id}`,
  `inventory_full`, `out_of_supplies {item}`, `hp_low {hp}`, `attacked_by {name}`, `died`,
  `task_step {name}`. The MCP session receives these as notifications, so Claude reacts to
  meaningful change without polling and without a constant state feed.
- `get_state` remains the ground truth Claude consults when an event says something needs a
  decision. Diffs are the ambient signal; full state is the checkpoint.

### 5.3 Progress without constant monitoring

- Each running task reports `task_step` and terminal `task_done {status,summary}` events; the
  goal's `progress[]` is appended from these, so the player and Claude see advancement without
  Claude watching every tick.
- Autopilot is a loop of: read active goal → ensure requirements (buy/withdraw/travel) → run the
  next task → on `task_done` re-check `get_state` → advance or replan → repeat until the goal's
  completion predicate holds, an unrecoverable event fires (`died`, `out_of_supplies` with no
  restock plan), or Pilot is turned off.
- Completion predicates are part of the plan (e.g. `skill:Fishing>=40`), evaluated from state so
  the loop knows when to mark the goal `done` and stop.

### 5.4 Safety rails specific to autopilot

- Hard stop on `died`, `hp_low` below a plan threshold, `attacked_by` an unexpected player in the
  wilderness, or any human input.
- Rate limits from SP4 apply; autopilot additionally caps itself to one active goal and refuses
  to start a task whose requirements are unmet (it reports what is missing instead of flailing).
- Chat and NPC text stay labelled untrusted; autopilot never executes instructions embedded in
  them.

## 6. Client action log

- A durable, capped log the player scrolls in a **Log** panel and Claude queries with `get_log`.
- Entry: `{ at, kind: 'action'|'event'|'chat'|'pilot'|'system', actor: 'human'|'claude'|'game', text, ref? }`.
- Sources: human actions inferred from hooks (login, level-up, notable item, death), Claude's
  dispatched actions and task steps, Pilot on/off, and important events from 5.2.
- Storage: the last N (e.g. 500) entries in the tab (`localStorage`) for instant player review;
  a compact, capped mirror in Firestore `users/{uid}/log` (rolling, ~200 recent) so Claude can
  reference history across sessions via `get_log`. High-frequency events are coalesced (xp drops
  summarised per minute) so the log stays readable and bounded.
- The Log panel offers filters (actor, kind) and a "copy to Claude" that pushes a slice as a
  `user_message`.

## 7. MCP tools and tab messages added (on top of SP4)

- Tools: `list_goals`, `add_goal(goal)`, `remove_goal(id)`, `set_active_goal(id)`,
  `get_active_goal`, `get_log(limit?, filter?)`, `set_pilot(on)` (control; also gated by the
  human toggle — Claude can request Pilot but the human must have armed it; `set_pilot(true)`
  from Claude only succeeds if the player has enabled the toggle, otherwise returns
  `pilot_not_armed`).
- Tab messages: `event` (5.2 diffs), `goal_changed`, `pilot` (on/off with reason), `log_append`.
- Firestore writes for goals and log happen from the tab under client rules, as SP4 does for
  tasks.

## 8. UI

- **Goals panel** (new SP2 plugin, icon near Claude): active goal card with progress and a
  Pilot toggle; list of goals with add/remove/activate; an "Add from recommended" browser
  showing the library by category with requirements and the route, one click to adopt.
- **Log panel** (new SP2 plugin): the scrollable action log with filters.
- The Claude panel gains the Pilot banner and Stop.
- Recommended goals are also surfaceable on the entry screen for a brand-new account ("Not sure
  what to do? Pick a goal") so a first session has direction.

## 8b. Wiki corpus integration (SPW)

The SPW wiki corpus (`docs/superpowers/plans/2026-09-05-spw-wiki-corpus.md`, in flight) extracts
the server's actual content into `wiki/build/wiki.db` and serves a question-shaped query API at
`/api/wiki` that already accepts an agent bearer token. It is the knowledge base for goals, and
it matters because general RuneScape knowledge is 2007-era and will not match build 274; the
corpus is derived from the pinned Content/Engine clones, with a source on every fact.

Two uses:

1. **Generate and validate recommended goals from the corpus.** `scripts/gen/recommended-goals.ts`
   reads the wiki data (quests with their requirements, skills with the xp table and training
   methods and xp/h, item ids and locations, shop inventories, drop tables, NPC/loc spawn
   coordinates as absolute `(x,z,level)`) to fill each `RecommendedGoal.plan`: requirements come
   from the quest/skill entities, `RouteStep.where` and the coordinates in `TaskRef.params` come
   from spawn/area data, and estimates come from the training-method xp/h. This replaces most
   hand-authoring; only prose polish stays manual. Entries whose entities are absent in the
   running revision are dropped, same as section 4.
2. **Claude queries the corpus at plan-time and during autopilot.** Claude reaches `/api/wiki`
   with its agent token to ground decisions in real server content: "what does <quest> require",
   "best F2P <skill> method at level N", "where do <npc> spawn", "what does <shop> sell", "route
   from <a> to <b>". Add a thin MCP tool `wiki_query(question)` in the `/mcp` gateway that
   proxies to `/api/wiki` (any mode), and a resource `idlescape://wiki` pointing at the wiki
   schema, so a paired session discovers it. Autopilot consults the wiki when a plan step needs a
   fact it does not already hold (a location, a requirement, a method), rather than guessing.

Dependency note: the wiki API's bearer path is gated on the entry-screen spec's Task 13b agent
tokens (already built); until then it is cookie-only. `wiki_query` ships with SP4's `/mcp`
gateway. Recommended-goal generation can begin as soon as the corpus builds for the target
revision (regenerate after SP1b moves to 274, since the corpus is revision-pinned).

## 9. Testing

- Unit: goal transaction (one active at a time); recommended-goal adoption clones with correct
  source/recommendedId; event-diff comparators (xp/item/level/arrived/died) from fixture state
  pairs; log coalescing and cap; completion-predicate evaluation.
- Integration (emulator + test tab): add/activate a goal via `/mcp`; Pilot refuses without the
  human toggle (`pilot_not_armed`) and without control mode; a minimal autopilot loop runs one
  recommended task and marks a trivial goal done from state.
- Browser: adopt `wc-to-15`, arm Pilot, assert the tab runs the chop task, emits `xp`/`item`
  events, appends progress and log entries, and a human click turns Pilot off and aborts.

## 10. Open questions for the owner

1. Mode persistence: keep the selector per-session (resets to Co-pilot on reload, current default), or remember the last chosen mode per account / per goal?
2. Recommended list: F2P-first starter set above, or include a members track now?
3. Log durability: Firestore rolling ~200 is cheap; if you want full history for Claude, we add
   a front-server SQLite log table (like the tracker) instead. Which?
4. Should Claude be allowed to add goals unprompted (e.g. suggest "train Attack to 20 first"),
   or only on the player's request? Current default: only on request.

### Ruled 2026-09-07 (decision D17, orchestrator under D11)

1. **Mode persists per account**, not per session and not per goal. One selector, one remembered
   value, the same shape as the plugin settings and script toggles already use.
2. **F2P-first starter set.** No members track until there is one to train against.
3. **Firestore rolling 200.** The front-server SQLite log is not built for a feature that has no
   sprint row; revisit it if and when the goals entry is planned.
4. **Claude adds goals only on request.** The current default stands.

All four are reversible until the goals entry is planned. The co-pilot question that sat above them
is not open: see the Status line.
