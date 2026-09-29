# Idlescape: the script API, surveyed against every large open source bot, and the standard it must follow

Date: 2026-09-07
Status: approved by the orchestrator under D11, 2026-09-07; committed on `sprint/dragon-slayer` the
same day with the sprint amendment; owner may reverse any ruling in section 7.
Placement: **not a sprint row of its own.** Section 4 and the phase-now proposals of section 5
become the **first task of sprint entry 5**, the script API reference. The phase-next proposals of
section 5 become **sprint entry 7, "Script API v2 surface"**, placed immediately after the studio,
and section 5 of this document is that row's authority. Ruled at section 7 ruling 14.
Classification: **authority document.** It does not deliver a feature. It fixes the rules that
`ScriptContext`, `BotSDK` and every future member of either must follow, and it lists the gaps a
survey of nineteen other botting systems says we have.
Owner request, verbatim, 2026-09-07: "include a review of every large open source botting system
for osrs and 2004scape/lostcity for what may be needed and what developers would expect. Contrast
the findings against our system, select the best of the batch to fill the gaps, and improve where
needed. Maintain a consistent standard for the api that would be familiar to js devs while keeping
it functionally powerful."
Extends, and does not restate: `2026-09-05-sp4-tasks-scripting-environment-design.md` sections 6
(the `ScriptContext` surface), 7 (the script model) and 17 (security);
`2026-09-06-sp4b-bot-expansion-design.md`, which owns `c.find`, `c.travel`, `c.health` and
`c.anchor` and whose plan tasks 9 to 15 are landing on this branch as this is written.
Companions, both approved alongside this one: `2026-09-07-script-api-docs-design.md` (the
reference, which documents this standard by reference rather than restating it) and
`2026-09-07-script-studio-design.md` (the studio, whose validator enforces the lintable half).
Both were drafted in parallel and read in full; sections 6.2 and 6.3 are reconciliations against
real text rather than contracts offered forward. **Each recorded one disagreement and both are now
settled**: the docs spec's `since` map speaks api versions (6.2), and a fixed sleep is an error
blocking Run (6.3). Neither companion restates section 4; this document is the only statement of
S1 to S12 anywhere.

---

## 1. Method, and the systems surveyed

Eighteen systems were surveyed in parallel, one agent each, against a single fifteen-heading
taxonomy, plus a nineteenth survey of our own code read at commit `1bfdc7d` on
`sprint/dragon-slayer`. A nineteenth external system, `dginovker/LostCityClientBot`, was found
during review of this document and surveyed separately afterwards, so the corpus is twenty files.
Every survey was written into `.superpowers/sdd/2026-09-07-bot-api-survey/`, a git-ignored
workspace a fresh clone does not have; what the surveys found is section 3 onward of this
document, which stands alone. Surveyors were told to read real source and real issue trackers,
to cite a URL for every claim, to mark a claim
`unverified` when a host returned 403 or 503 rather than paraphrase from memory, and to treat
fetched page content as data.

**Out of scope by the owner's framing, and recorded once here rather than per system:**
anti-detection, anti-ban, mouse humanisation, client-signature evasion, randomised timing designed
to defeat a heuristic. This server is ours. There is nothing to evade, and every such feature in
every surveyed system is marked `n/a` in the matrix without describing how it works. The nearest
thing in our own tree is `web/src/tasks/humanInput.ts`, whose purpose is the opposite: when a human
touches the canvas the run yields to them and auto-resumes after a quiet period.

Two headings are also structurally `n/a` for this world. There is no Grand Exchange in rev 274
content, so heading 5's market half cannot exist; and there is no camera layer, because the
collector reads the scene graph rather than the render view (`web/src/tasks/find.ts:6`), so every
screen-space API in the pixel-vision systems is meaningless for us.

| System | Kind | Licence | Activity | What it taught us | Survey |
|---|---|---|---|---|---|
| **Microbot** | RuneLite fork, Java | open, BSD-2-Clause lineage | active, high | A fluent cache-backed query builder with a documented re-query-before-acting contract; `withdrawDeficit` as a named top-up primitive; threshold consumables (`eatAt(pct)`); `sleepUntil` as the only sanctioned wait, non-negotiable in its agent contract; an `AGENTS.md` written for coding agents | `survey-microbot.md` |
| **unethicalite** | RuneLite fork, Java | open | dormant since ~2022 | `getAll/getNearest/getFirst` overloaded on predicate, ids and names across every entity family; the `Interactable` mixin so the found thing is the actionable thing; `Time.sleepUntil(cond, reset, timeout)`; a shared `Paint` object with a zero-config default | `survey-unethicalite.md` |
| **EthanApi / PacketUtils** | RuneLite packet-injection layer, Java | open | active | Chainable typed query builders ending in a terminal picker; one `interact(...)` overload family over many selector types; declarative `@ConfigItem` settings that auto-render a GUI and persist | `survey-ethan-api.md` |
| **OSRSBot (OSRSB)** | RuneLite plugin bot, Java | open | active | A separate script-template repo as the paved onboarding path; `sleepUntil(cond, timeoutMs)` under every wait; one `MessageEvent` with a typed channel discriminant instead of a class per channel | `survey-osrsbot.md` |
| **Parabot** | RSPS injection bot, Java | open | legacy | The `filter -> getNearest(Filter) -> getClosest(ids)` triad repeated identically across every entity class; `Time.sleep(SleepCondition, timeoutMs)`; per-subsystem debug overlays shipped with the SDK | `survey-parabot.md` |
| **IdleRSC** | OpenRSC code-injection bot, Java | open | active | Package-scoped compatibility shims letting two older scripting APIs run unmodified beside the native one; `start()` returning an int reschedule delay; a composable `PaintBuilder`/`RowBuilder`; real push hooks for tick, chat and hitsplat | `survey-idlersc.md` |
| **Simba** | Pascal/Lape automation host | open, GPL lineage | active | `SleepUntil(cond, interval, timeout): Boolean` returning false rather than throwing; a named, cancellable, listable recurring-task scheduler; exception introspection exposed to a script's own catch block | `survey-simba.md` |
| **WaspLib** | Simba library for OSRS | GPLv3 | active | `Interact(action)` and `WalkInteract(action)` folding travel-into-range into one call; `attempts` as a first-class retry parameter on interaction primitives; `debug: Boolean` threaded into find and pathfind calls to draw what that call computed | `survey-wasplib.md` |
| **WaspScripts platform** | Marketplace stack, TypeScript | mixed | active | Distribution kept as a separate typed service from the scripting SDK; one schema doing validation, types and generated docs at once; a ToS clause forbidding launcher lock-in | `survey-waspscripts.md` |
| **rs-sdk** | Our vendoring upstream, TypeScript | MIT | active | The `send*` versus `bot.*` dispatch-versus-observe split; partial-fill results (`success:false, partial:true, amountBought`); `clickDialogByText` fixing the index-versus-array-position footgun; death bookkeeping fields (`lifeId`, `respawnCount`, `lastDeathTick`) | `survey-rs-sdk.md` |
| **eliza-2004scape** | ElizaOS agent plugin | unknown | **could not be verified to exist** | Nothing adoptable. Five independent checks (direct fetch, GitHub API, repo search, org listing, rs-sdk's 113-fork network) all came back empty on 2026-09-07. The generic ElizaOS Service/Provider/Evaluator split is the only verified idea, and it is the framework's, not this project's | `survey-eliza-2004scape.md` |
| **rs2b0t** | Bot client for **our own rev 274**, TypeScript | open | active | One `EntityQuery<E>` shared by every entity kind; `walkResilient()` as a separately named unattended navigation entry point; pure decision functions split from effecting calls so bot logic unit-tests headlessly; a hard-closed `Execution` wait surface with a watchdog against bare `await`; settings with `showIf` conditional fields | `survey-rs2b0t.md` |
| **LostCityClientBot** | Bot client for **our own rev 274**, TypeScript in the browser | open, MIT | active | Two agent-facing documents, one of which makes the agent responsible for keeping them current; and, as a warning rather than a lesson, what a bot API looks like with no wait primitive, no result type and raw component ids, written this year in our own language on our own world | `survey-lostcityclientbot.md` |
| **RuneScriptTS** | LostCity content-authoring compiler | MIT + LICENSE.neptune | active | Not a bot API: thirteen of fifteen headings are `n/a`. `shop.rs2`'s per-unit re-validation and report-what-actually-transacted pattern is ground truth for our shop helpers; a dedicated VS Code language extension shows first-class IDE support is a baseline expectation | `survey-runescript-ts.md` |
| **DreamBot** | Closed-source client, Java | closed | active | A uniform `all()/all(filter)/closest(filter)` triad over one named `Filter<T>` vocabulary; name-or-id overloads on every mutating container call; `sleepUntil(cond, timeout, reset)` with its documented always-true-reset footgun; `chooseFirstOptionContaining(...)` | `survey-dreambot.md` |
| **OSBot** | Closed-source client, Java | closed | active | Six typed lifecycle hooks a script opts into; a self-locating `Bank.open()`; `completeDialogue(String... options)` driving a whole dialogue tree; a per-script Data folder as a real persistence boundary; marketplace review rules that double as API lint (static widget ids auto-rejected) | `survey-osbot.md` |
| **TRiBot** | Closed-source client, Java then Kotlin | closed | **offline since July 2026** | `Condition` plus `waitCondition(cond, timeoutMs)` as one universal wait; `walkTo(target, condition)` collapsing a two-tier walk; the community's own bank-API wishlist as a checklist; and the shutdown itself as an argument for a self-hosted, in-repo script model | `survey-tribot.md` |
| **PowBot** | Closed-source client, Kotlin | closed | active | `@ScriptConfiguration.List` as a declarative settings annotation the client renders with zero script-side UI code; a self-registering `Watcher` turning "subscribe, wait for one match, clean up" into one awaitable call; `Movement.builder(tile).setWalkUntil{}.move()` returning a typed result; `Nil` sentinels instead of null; `PaintBuilder.trackSkill()` auto-diffing since start | `survey-powbot.md` |
| **RuneMate** | Closed-source client, Java/Kotlin | closed | **dead, 2026-08-07** | Reachability as a first-class query filter (`surroundingsReachable()`); two co-equal official base idioms rather than one bolted onto the other; recovery modelled as ordinary tree tasks; the manifest doubling as the whole store listing | `survey-runemate.md` |
| **idlescape (ours)** | This repository, TypeScript in a per-character Web Worker | ours; `web/src/vendor/rs-sdk/**` is MIT | in flight | Read at `1bfdc7d`. The baseline everything below is contrasted against | `survey-ours.md` |

Two survey-quality notes the matrix depends on, recorded rather than hidden. **eliza-2004scape
could not be confirmed to exist**, so every claim specific to it is cached search residue and its
row is `unverified` throughout rather than rated. And several closed-vendor sources were
unreachable during the survey window (dreambot.org, osbot.org, runeautomation.com,
community.tribot.org, docs.powbot.org, powbot.org, villavu.com's forum, rune-server.org,
lostcity.rs), so those rows lean on directly-read GitHub source and search-cached snippets. Each
survey flags its own weak claims inline.

**Every "N of the nineteen" ratio in this document has one denominator:** the nineteen *rated*
systems, which are the eighteen verified external systems plus ours. eliza-2004scape is excluded
from every denominator, because a row nobody could confirm exists can neither satisfy nor fail an
expectation. Its row stays in the table above as a recorded negative result and its column is not
carried into section 2.2.

## 2. The gap matrix

Ratings are `strong` (the heading is covered and the shape is one a developer would recognise),
`partial` (present but incomplete or awkward), `absent` (not in the API), `n/a` (structurally
inapplicable). Footnote markers point at section 2.3. Split into two tables purely for width.

### 2.1 RuneLite-lineage and OSRS client bots

| # | Heading | Microbot | unethicalite | EthanApi | OSRSBot | DreamBot | OSBot | TRiBot | PowBot | RuneMate | Parabot |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Lifecycle and structure | strong | strong | partial [a] | strong | strong | strong | partial | strong | strong | strong |
| 2 | World queries | strong | strong | strong | strong | strong | strong | partial | strong | strong | strong |
| 3 | Interaction | strong | strong | strong | strong | strong | strong | partial | strong | strong | partial [b] |
| 4 | Movement and navigation | strong | strong | partial [c] | partial [d] | strong | strong | strong | strong | strong | partial |
| 5 | Inventory, bank, shops, trade | strong | strong | strong | strong | strong | strong | partial | strong | strong | strong |
| 6 | Skills, XP, combat, health | strong | strong | absent [e] | strong | partial | partial | partial | partial | partial | strong |
| 7 | Interfaces and dialogue | strong | partial [f] | absent [g] | partial | strong | strong | partial | strong | partial | absent |
| 8 | Waiting and conditions | strong | strong | **n/a** [h] | strong | strong | strong | strong | strong | strong | strong |
| 9 | Events and reactivity | partial [i] | partial [i] | partial [i] | partial | partial | partial | partial | strong | absent | partial |
| 10 | State, persistence, settings | partial | partial | strong | absent | absent | partial [j] | absent | strong | absent | partial |
| 11 | Logging, debugging, paint | partial | partial | partial | partial | partial | partial | partial | strong | partial | strong |
| 12 | Error handling and resilience | partial | partial | absent | absent | absent | partial | absent | partial | partial | absent [k] |
| 13 | Distribution | partial | absent | absent | absent | strong | strong | absent [l] | partial | partial | partial |
| 14 | Developer ergonomics | strong | partial | partial | partial | strong | partial | partial | partial | partial | absent |
| 15 | Sentiment evidence quality | strong | strong | strong | strong | partial | partial | partial | partial | partial | partial |

### 2.2 Pixel, RSPS, 2004scape lineage, and ours

| # | Heading | IdleRSC | Simba | WaspLib | WaspScripts | rs-sdk | rs2b0t | LCCB | RuneScriptTS | **ours** |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Lifecycle and structure | strong | absent | partial | n/a | partial [m] | strong | absent | n/a | **strong** |
| 2 | World queries | absent | n/a [n] | partial [o] | n/a | partial | strong | partial | n/a | **partial** [p] |
| 3 | Interaction | partial | absent | strong | n/a | strong | strong | partial | n/a | **strong** [q] |
| 4 | Movement and navigation | partial | n/a | strong | n/a | partial | strong | partial | n/a | **partial** [r] |
| 5 | Inventory, bank, shops, trade | strong | n/a | strong | n/a | strong | strong | partial | n/a [s] | **strong** |
| 6 | Skills, XP, combat, health | strong | n/a | partial | n/a | strong | partial | partial | n/a | **partial** [t] |
| 7 | Interfaces and dialogue | partial | n/a | strong | n/a | strong | strong | partial | n/a | **partial** [u] |
| 8 | Waiting and conditions | partial | strong | partial | n/a | partial [v] | strong | absent | n/a | **strong** |
| 9 | Events and reactivity | strong | absent | absent | n/a | absent | partial | absent | n/a | **absent** |
| 10 | State, persistence, settings | absent | absent | partial | partial [w] | absent | strong | absent | n/a | **partial** [x] |
| 11 | Logging, debugging, paint | partial | partial | strong | n/a | partial | partial | absent | n/a | **partial** [y] |
| 12 | Error handling and resilience | absent | absent | partial | n/a | partial | partial | absent | n/a | **strong** |
| 13 | Distribution | partial | absent | partial | strong | absent | partial | absent | n/a | **partial** [z] |
| 14 | Developer ergonomics | partial | partial | strong | partial | strong | strong | partial | partial | **partial** |
| 15 | Sentiment evidence quality | strong | strong | partial | partial | strong | partial | absent | partial | n/a [aa] |

**LCCB** is `dginovker/LostCityClientBot`. Its column is rated from its four documentation files
rather than from source, which `survey-lostcityclientbot.md` says outright and lists; that is fair
to this project in particular, because its documented surface is what it exists to hand to a coding
agent. Its `absent` on heading 8 is the whole of its timing model, which is `setInterval` plus a
list of hardcoded millisecond constants; its `absent` on 12 is that every documented action returns
a bare boolean or nothing at all.

### 2.3 Footnotes

- **[a]** EthanApi has no script concept at all. An automation *is* a RuneLite plugin, and the API
  layer is a shared plugin other plugins declare as a Guice dependency.
- **[b]** Parabot's interaction verbs resolve through a per-server raw menu-action-id table
  (`Settings.getActionByName`), which the community's own "outdated server / cheap fix" threads show
  breaks whenever a target server drifts.
- **[c]** Pathfinding and a real vendored collision map exist, but there is no single "walk here and
  wait until arrived" call. Callers compose `pathToGoal*` with `MovementPackets` themselves.
- **[d]** `walkTo` is a single-tile step; long-distance pathing is delegated to a separate
  third-party dependency, DaxWalkerRSB.
- **[e]** Downstream scripts reach past the API into the raw RuneLite client for basics like current
  HP. This is a packet-utility toolkit, not a complete bot SDK.
- **[f]** The dialogue API leaks RuneLite's widget-id taxonomy as public surface
  (`canContinueNPC` / `canContinuePlayer` / `canContinueDeath` / `canContinueTutIsland2`).
- **[g]** No dialogue abstraction. Continue and option handling is bespoke per script against
  hardcoded widget ids such as `12648448`.
- **[h]** Structurally inapplicable rather than missing. An EthanApi automation *is* a RuneLite
  plugin driven by `@Subscribe onGameTick`, so there is no loop of its own to block, and a blocking
  `sleepUntil` there would block the client thread. The absence is real - `EthanApiPlugin.java`'s
  thirty-one public statics contain no sleep, no `sleepUntil` and no condition wait - but it is a
  category difference, not a defect, so the cell is `n/a` rather than `absent`. The cost lands
  downstream instead: every script inspected hand-rolls a tick-counter timeout,
  `if (timeout > 0) { timeout--; return; }` (`survey-ethan-api.md:24` and `:96`).
- **[i]** Reactivity is "subscribe to the host client's own event bus", not a documented closed
  vocabulary of the botting API. Real, powerful, and requires the author to already know RuneLite's
  event catalogue.
- **[j]** No settings schema, but `getDirectoryData()` gives each script a sandboxed per-script
  folder, which is a genuine persistence boundary and the only one in the Java systems.
- **[k]** Sentinel-value errors (`null`, `-1`, `false`) plus one `catch (Throwable)` around the whole
  loop that prints a stack trace and terminates.
- **[l]** Single-vendor, pay-walled, private GitLab package feed. It went offline in July 2026 on
  four days' notice - sales paused on 1 July behind the developer's "Hey everyone, sales are
  unavailable right now. I'll let you know when I have more information", a holding page by 5 July -
  and with no reason ever given
  (`osrsbestinslot.com/blog/osrs-bot-clients-shutdown-july-2026`, and `survey-tribot.md:189`).
- **[m]** One `runScript` entry point and nothing above it: no manifest, no params, no task model, no
  pause or resume.
- **[n]** Simba never reads client memory or network state, so there is no players/npcs/objects
  concept at the host-API level at all. Every entity abstraction is invented downstream.
- **[o]** Typed finders exist, but finding is vision-based colour matching and model projection over
  hand-authored map JSON, not a structured query against live world state.
- **[p]** We have `c.find` over nine hardcoded `ResourceKind` values and raw
  `Array.prototype.filter` over the snapshot for everything else. There is no fluent entity query,
  no `Area`/`Tile` type, and no `isReachable(tile)` call.
- **[q]** Complete for a 2004-era world, with one real hole: `{ type: 'interactGroundItem' }` exists
  in the `BotAction` union (`web/src/vendor/rs-sdk/sdk/types.ts:615`) and **no `bot.*` or
  `sdk.send*` method wraps it**, so a ground item can only be picked up, never used with a non-default
  menu option. The action is implemented end to end below us - `ActionExecutor.ts:309` dispatches it
  and `Client.ts:1282` performs it - so P8 wraps something that already works. Six occurrences
  repo-wide; an earlier claim of one was a grep scoped to `web/src`. What is missing on the
  collector's side is the option *text*: `GroundItem` (`web/src/vendor/rs-sdk/sdk/types.ts:151`)
  publishes no `optionsWithIndex`, unlike `NearbyLoc`, `NearbyNpc` and `InventoryItem`, so nothing
  in the Worker can map "Take" to an ordinal. See P8 and ruling 13.
- **[r]** `c.travel` handles routes, leg splitting and typed failures well. There are no teleports
  (the `Spells` component ids exist and `travel` does not know they do), no run-energy control, and
  no navigation graph beyond the atlas's small hand-authored `routes` table.
- **[s]** RuneScriptTS is the server-side content DSL. `shop.rs2` is ground truth for what our shop
  helpers drive, not an API to adopt.
- **[t]** Reads are complete and policy is complete. Automation is thin: no auto-eat, no potions, no
  prayer flick, no `wait.hp`. `low-hp` is deliberately non-recoverable and ends the run.
- **[u]** Dialogue is well covered. General widgets are bare numbers everywhere, including in
  `HealthPolicy.expectInterfaces?: number[]`.
- **[v]** Mixed error discipline inside one family: `waitForCondition` throws, `waitForChat` resolves
  null, and nothing in the family takes an `AbortSignal`.
- **[w]** The platform decouples telemetry identity from account identity, which is a good idea, but
  it is a marketplace service and not a scripting persistence API.
- **[x]** Params, requirements and the anchor are complete. There is no per-script persisted state:
  `memory` is a `Map` that dies with the run, and the SP4 spec's claim that it is "serialised into
  snapshots" is not true of the code.
- **[y]** The trace is a genuinely strong debugging substrate. There is no paint or overlay of any
  kind. `screenshot()` is not on `ScriptContext`, but it *is* reachable from script code as
  `c.sdk.screenshot()` (`web/src/vendor/rs-sdk/sdk/index.ts:1044`, which returns
  `this.transport.screenshot()`; the scoped transport does not swap `screenshot`, and
  `localSdk.test.ts:125` pins the call), so the gap is discoverability rather than capability: the
  only way to find it is the raw-SDK namespace that section 3.2 item 9 already calls the wrong place
  to look.
- **[z]** Bundled library plus per-user Firestore documents plus per-account toggles with one
  enforcement point, over a genuinely load-bearing sandbox. No sharing between accounts, no
  permissions manifest, no signing, no versioning or deprecation path for the API itself.
- **[aa]** idlescape is private and single-operator. There is no external user base to cite, so
  heading 15 is answered from our own design documents, which are unusually explicit about known
  weaknesses.

### 2.4 What developers expect

The union of expectations the twenty surveys support (nineteen external systems, and ours).
Each is listed with the systems that establish it, and, where the surveys record it, the systems
whose absence of it generated a complaint. This is the checklist section 5's proposals are measured against.

**Lifecycle and structure**

1. **A manifest that carries the listing metadata** (name, description, version, category, access)
   next to the code, read by the host rather than typed into a web form. *RuneMate, Parabot,
   Microbot's `plugins.json`, DreamBot, rs2b0t, ours.*
2. **Two co-equal idioms, a loop and a task tree**, rather than one bolted onto the other.
   *RuneMate, unethicalite, Microbot, rs2b0t, PowBot.* Microbot's single most-discussed forum
   thread is developers asking for a better standardised state-machine framework than the one that
   ships.
3. **One guaranteed cleanup hook** that fires on both a clean stop and a crash. *rs2b0t `onStop()`,
   Microbot's idempotent `shutdown()`.* IdleRSC's tracker carries an open issue asking for exactly
   this, because without it a GUI script cannot reset itself between runs.

**Queries and interaction**

4. **Entity queries as a chain of narrowing filters ending in an explicit picker**, with predicate,
   id and name accepted anywhere a selector is. *Microbot, unethicalite, EthanApi, OSRSBot,
   DreamBot, OSBot, PowBot, RuneMate, Parabot, rs2b0t.* Ten of the nineteen have it in that full
   form; TRiBot, WaspLib, rs-sdk and ours have partial versions.
5. **One query type shared by every entity kind**, not four bespoke finders. *rs2b0t's
   `EntityQuery<E>`.*
6. **Reachability as a filter inside the query**, not a check afterwards. *RuneMate
   `surroundingsReachable()`, rs-sdk `FindOptions.reachable`, ours.*
7. **The found thing is the actionable thing:** `entity.interact("Attack")`, not
   `bot.interact(entity, "Attack")`. *unethicalite's mixin, DreamBot, OSBot, PowBot, RuneMate,
   rs2b0t.*
8. **Interaction by menu action text, never a raw menu index.** *Microbot, unethicalite, EthanApi,
   OSRSBot, DreamBot, OSBot, PowBot, RuneMate, rs-sdk, rs2b0t.* Parabot, IdleRSC and
   LostCityClientBot are the counterexamples and each pays for it: Parabot with per-server action-id
   tables that break on drift, IdleRSC with `optionAnswer(int)` that forces every script to search
   the option text and compute the index itself, LostCityClientBot with `interactNpc(npcSlot,
   option)` and `clickButton(comId)`, where the target is a slot ordinal rather than the entity the
   lookup returned.
9. **A guard paired with the verb:** `hasAction(...)` before `interact(...)`. *OSBot, where the
   marketplace review rules make it close to mandatory.*

**Movement**

10. **One call that walks there and tells you whether it arrived**, with a typed failure reason.
    *PowBot's `WebWalkingResult{success, failureReason}`, TRiBot's `walkTo(target, condition)`,
    rs2b0t's `walkResilient()`, ours.* EthanApi's absence of it is named as a gap by its own survey.
11. **An interrupt condition folded into the walk call itself.** *PowBot `setWalkUntil{}`, Microbot
    `walkUntil(target, distance, completion)`, TRiBot `walkTo(target, condition)`.*
12. **Teleports and run energy as part of navigation**, not as something the script hand-manages.
    *rs2b0t `Traversal.withTeles`, Microbot `toggleRunEnergy`.* Microbot's teleport and
    house-teleport walker questions are recurring community threads rather than solved reference.

**Containers**

13. **A self-locating `bank.open()`** that finds the nearest bank and walks to it. *OSBot, Microbot
    `walkToBankAndUseBank`, OSRSBot, Parabot.*
14. **Name-or-id overloads on every mutating container call.** *DreamBot, OSBot, Microbot.*
15. **A named top-up primitive**, `withdrawDeficit(id, requiredAmount)`, instead of manual
    count-subtract-withdraw. *Microbot, uniquely.*
16. **Partial fills reported as data**, not as a silent clamp or an exception. *rs-sdk's
    `{success:false, partial:true, amountBought}`; RuneScriptTS's `shop.rs2` does the same thing
    server-side, re-validating per unit and emitting what actually transacted.*

**Skills, combat and health**

17. **Real level and boosted level as two separately named accessors.** *DreamBot, Microbot,
    Parabot, rs2b0t, ours.* DreamBot's forum shows developers still confusing them, so the naming
    has to be blunt.
18. **Threshold-driven consumables:** `eatAt(percent)`, `drinkPrayerPotionAt(points)`, pushing the
    "when" into the call. *Microbot, WaspLib's `Consume(skill)`.* Its absence is universal
    elsewhere: every PowBot script surveyed hand-rolls its own eat threshold from raw
    `Combat.health()`.
19. **A find-and-legality fusion for combat:** `getAttackableNPC(...)` rather than leaving the
    script to work out whether a target is legally attackable now. *unethicalite.*

**Dialogue and interfaces**

20. **Select a dialogue option by its visible text**, and one call that drives a whole dialogue tree
    to completion. *OSBot `completeDialogue(String...)`, DreamBot `chooseFirstOptionContaining`,
    PowBot `completeChat`, rs-sdk `clickDialogByText` and `navigateDialog`, WaspLib
    `ContinueUntilOption`, Microbot `clickOption(text)`.*
21. **No hardcoded widget ids in script code.** *OSBot enforces it as an auto-rejection criterion at
    the marketplace: "any static ids excluding root widget ids" is rejected outright.* TRiBot,
    EthanApi and RuneMate all show what happens without the rule.

**Waiting**

22. **One condition-plus-timeout wait as the sanctioned primitive, returning a boolean**, with fixed
    sleeps discouraged or banned outright. *Microbot (whose `AGENTS.md` makes it non-negotiable:
    "Never use static sleeps to wait for game state - use `sleepUntil(condition, timeoutMs)`"),
    unethicalite, OSRSBot, DreamBot, OSBot (whose marketplace auto-rejects "scripts that fail to
    consider ConditionalSleeps"), TRiBot, PowBot (whose published guide frames a fixed sleep as an
    anti-pattern), RuneMate, Parabot, Simba, rs2b0t (enforced by a runtime watchdog against a bare
    `await`), ours.* **Twelve of the nineteen** have it as the sanctioned primitive, and IdleRSC,
    WaspLib and rs-sdk have partial forms, so fifteen in total, which is every rated system where
    the heading applies at all. The four that do not have it are the three where it is `n/a`
    (EthanApi, WaspScripts, RuneScriptTS) plus LostCityClientBot, whose absence shows the cost:
    its own guide's timing advice is a list of hardcoded constants (100 ms, 600 ms, 2 s, 15 s) with
    a per-activity exception for each.

    Microbot's severity triage is worth stating precisely, because this document leans on it twice
    more. `AGENTS.md` lists P0 as "client crashes, client-thread blocking, login/world-hop breakage,
    cache invariant corruption, credential/token exposure" and P1 as "script loop timing, overlay
    correctness, plugin discovery/config, shaded-jar packaging, build reproducibility". A static
    sleep is in neither list; the P0 entry is the adjacent and separate rule against blocking the
    client thread. So the honest statement is: the rule is non-negotiable in Microbot's agent
    contract, and its own triage would file a breach of it under loop timing, at P1.
23. **A reset condition that re-arms the timeout while a second signal keeps firing.**
    *unethicalite `Time.sleepUntil(cond, reset, timeout)`, DreamBot `sleepUntil(cond, timeout,
    reset)` with its documented always-true footgun.*
24. **A configurable poll interval and a per-poll action.** *OSBot's `ConditionalSleep` class.*

**Events**

25. **Push events for tick, chat, xp, item change, hitsplat and level up.** *IdleRSC (real client
    patch hooks), PowBot, Microbot/unethicalite/EthanApi via the host bus, rs2b0t (partial).*
    Polling is the named complaint at TRiBot, RuneMate, OSBot and rs-sdk: RuneMate's real scripts
    re-poll `Inventory`, `Health` and `ChatDialog` from scratch every loop pass.
26. **An awaitable one-shot event:** register, wait for the first match, auto-unregister, all in one
    call. *PowBot's `Watcher`/`LootWatcher` with a `CountDownLatch`.*
27. **A closed, documented event vocabulary rather than the host framework's own classes**, so an
    author need not already know another product's catalogue. *Argued explicitly in the
    unethicalite survey against its own subject.*

**Settings and state**

28. **A declarative settings schema the host renders into a GUI and persists**, with zero UI code in
    the script. *EthanApi `@ConfigItem`, PowBot `@ScriptConfiguration.List`, rs2b0t `SettingDef`
    with `showIf` conditional fields, ours.* Its absence is the single most repeated ergonomics
    complaint in the survey: DreamBot, OSBot, TRiBot, RuneMate, OSRSBot, IdleRSC and Parabot all
    make every script author hand-build a Swing or JavaFX form.
29. **Per-script persisted state that survives a run.** *EthanApi and PowBot through the host config
    store, OSBot through a sandboxed per-script Data folder, rs2b0t.* Absent from ours, rs-sdk,
    IdleRSC, Simba and TRiBot.

**Logging and paint**

30. **On-screen paint, composed from rows rather than raw pixel math.** *IdleRSC's
    `PaintBuilder`/`RowBuilder`, PowBot's `PaintBuilder.trackSkill()`, unethicalite's shared `Paint`
    with `ExperienceTracker` and a `DefaultPaint` fallback, rs2b0t's `Paint.begin(ctx, {dock})`,
    WaspLib's `PrintReport`.* **Twelve of the nineteen** ship an on-canvas overlay, and the twelve
    are checkable: DreamBot `onPaint(Graphics)`, OSBot `onPaint(Graphics2D)`, OSRSBot
    `PaintListener.onRepaint(Graphics)`, TRiBot's `Painting` marker interface, Microbot's RuneLite
    `Overlay`, EthanApi's per-script `OverlayPanel`, unethicalite's `Paint`, IdleRSC's
    `PaintBuilder`, Parabot, PowBot's `PaintBuilder`, WaspLib, rs2b0t. Two more are adjacent rather
    than counted: Simba's Debug Image draws matches onto a debug image rather than over a live game
    view (`survey-simba.md:156` calls it "a primitive, not a framework"), and RuneMate's could not
    be confirmed post-shutdown (`survey-runemate.md:219`, **not verified**). **We have none.**
31. **Auto-diffed live stats:** xp and item counts since script start, with no manual delta
    bookkeeping. *PowBot `trackSkill()`/`trackInventoryItems()`, unethicalite `ExperienceTracker`.*
32. **Leveled logging.** *Present nearly everywhere; IdleRSC's tracker carries an open issue asking
    for it, and rs2b0t has only a single `log(msg)`.*
33. **Debug flags threaded into the call being debugged**, so a find or a pathfind can draw what it
    computed. *WaspLib's `debug: Boolean` parameter on `WalkPath`/`WebWalk`, Parabot's per-subsystem
    debug overlays.*

**Errors and resilience**

34. **A typed result with a reason, never a sentinel.** *rs-sdk `ActionResult`, PowBot
    `WebWalkingResult`, rs2b0t, ours.* Sentinel returns are the named anti-pattern at Parabot
    (`null`/`-1`/`false`), DreamBot, TRiBot, IdleRSC, OSRSBot and LostCityClientBot, whose every
    documented action returns a bare boolean or nothing at all.
35. **Retry count as a parameter on the interaction itself.** *WaspLib `Hover(action, attempts=2)`,
    `Bank.Find(item, out, attempts=3)`; PowBot's `Bank.mustWithdrawItem`.*
36. **Framework-owned recovery for login, death, level-up and interrupting UI**, so individual
    scripts do not hand-roll it. *Microbot's `BlockingEventManager` (with exponential backoff on
    failed handlers), unethicalite's `BlockingEvent` catalogue, RuneMate's recovery-as-tree-tasks,
    ours.* Absent from OSRSBot, DreamBot, TRiBot, EthanApi, IdleRSC, Simba and rs-sdk, where every
    script author reinvents it.
37. **Cancellation that is not an exception the author must remember to catch.** *Ours.* OSBot is
    the counterexample: `InterruptedException` is the only stop signal into sleeping code, and the
    vendor's own example script swallows it with a stack trace.
38. **Stuck detection with an escape.** *PowBot's open `OpenQuester#8` is the cautionary case: a
    webwalk-graph gap freezes the behaviour tree indefinitely with no timeout, until a human
    notices.*

**Distribution and ergonomics**

39. **Types and IDE autocomplete against the published surface, plus a generated reference.**
    *rs2b0t ships `index.d.ts` so hover works without a doc site; rs-sdk CI-checks its generated API
    docs against the public surface; DreamBot, OSBot, OSRSBot and WaspLib all ship generated
    reference sites; RuneScriptTS ships a VS Code language extension for its own DSL.*
40. **A worked example corpus and a template project as the paved path.** *OSRSBot's separate
    `script-template` repo with pre-wired dependencies, one annotated example and IDE run configs;
    rs2b0t's 60 tagged bundled scripts; DreamBot's task-oriented guides; WaspLib's tutorial portal
    with named community authors.*
41. **Pure decision functions separable from effecting calls**, so bot logic unit-tests headlessly.
    *rs2b0t (`resolveBankOpenRoute()`, `planAxeAcquire()`, quest `decide(snapshot)`); PowBot's
    `OpenQuester` is the one sourced repo with real unit tests, and it is the one with that seam.*
42. **Fast iteration: push a change into a running client without a full rebuild.** *PowBot's
    `ScriptUploader().uploadAndStart(...)`, unethicalite's reload-on-repo-update, rs-sdk's
    watch-and-repack at the content layer.* Compile-and-reload is the named friction at DreamBot,
    OSBot, IdleRSC and OSRSBot.
43. **An agent-facing contract document**, distinct from human docs. *Microbot's `AGENTS.md` (cache
    singleton rule, threading rule, wait-primitive rule, review-severity triage); rs-sdk's
    `CLAUDE.md`/`AGENTS.md`; LostCityClientBot's `CLAUDE.md` plus a `BOTTING_TIPS.md` that opens
    "Guide for Claude Code instances to write bot scripts for the Lost City client".* Directly
    relevant, because Claude writes scripts against our API. LostCityClientBot's is the most
    transferable of the three, because two of its three rules are about keeping the contract
    current: "Whenever you work hard to research something, document how you found it in
    research_tips" and "Whenever you improve the bot, document how to use your improvement in
    botting_tips". Microbot's `AGENTS.md` states rules; that one states rules about maintaining the
    rules, which is the prose equivalent of S11 making doc comments the source of the reference.
44. **Distribution kept as a separate service from the scripting SDK.** *WaspScripts, where
    versioning, entitlement, telemetry and moderation are three TypeScript services that never grew
    inside the Pascal library.*
45. **Old scripts keep running when the API moves.** *IdleRSC's package-scoped compatibility shims
    (`compatibility.apos.Script`, `compatibility.sbot.Script`) wrapping the same controller so two
    older unrelated scripting APIs run unmodified; Microbot's `minClientVersion` gate; WaspScripts'
    ToS clause forbidding a script from being made unrunnable without the launcher.*

## 3. Contrast

### 3.1 Where we are already ahead

Six things, and the survey is unambiguous that no other system has all of them.

1. **The task list with `when`/`run`, priority-ordered, where a queued recovery outranks every
   script task** (`web/src/tasks/runner.ts:136`). RuneMate's task tree and Microbot's
   `StateMachineScript` are the nearest, and neither makes a recovery an ordinary task. Ours are
   built on the same `ScriptContext` a script gets, so they are entered, traced, timed and
   attempt-counted identically and appear in the run report. The comment at `recovery.ts:1` names
   why: it is "what makes a recovery visible in the run report instead of being invisible runtime
   behaviour."
2. **The health monitor and the recovery ladder.** Nine `HealthCondition` values detected by nine
   pure predicates over `(snapshot, memory, now)`, an escalation ladder of
   `continue -> re-anchor -> pause-stuck -> {fail: FailReason}`, an occurrence budget that counts
   occurrences rather than attempts ("a recovery that worked resets the attempt ladder, so an
   attempt count can never express 'the second time this happens'"), seven `DeathBehaviour` values
   including a loot walk that races the engine's 200-tick despawn window, and `Task.recovers` so a
   script can claim a condition and own its policy. Microbot's `BlockingEventManager` and
   unethicalite's four-event `BlockingEvent` catalogue are the only comparable machinery in the
   survey, and both are fixed catalogues with no per-script policy, no retry budget and no
   task-level claiming.
3. **Typed results at three altitudes, over closed reason sets.** `ActionResult{success, message,
   reason?, phase?}` with `phase` distinguishing dispatch from observation; `TravelResult{success,
   reason?, stoppedAt, legs, tiles}`; `TasksError{code, detail}` with eleven codes "so callers can
   branch on `code` instead of on prose" (`api.ts:29`). Plus `FailReason` (thirteen values),
   `HealthCondition` (nine), `RecoveryOutcome` (four). Six of the nineteen surveyed systems still
   signal failure with `null`, `-1` or a bare `false`.
4. **Requirements with human text, evaluated before the run starts** and re-evaluated inside the
   Worker against the same snapshot, with `custom` predicates deliberately unable to cross
   `postMessage`. Nothing else surveyed gates a run on declared preconditions at all.
5. **`c.find` and `c.travel` with provenance.** `FoundTarget.via` says which of three widening
   layers answered, so a script or a reader can tell "I found it where I was standing" from "I
   walked 400 tiles to a cluster the atlas promised and it was empty". A floor change is only ever
   made by a route's `interact` waypoint, and arrival checks distance **and** plane, so a ladder
   click that reported success but did not transition cannot be mistaken for arrival. No surveyed
   system reports which layer answered a lookup.
6. **The trace as the debugging substrate.** A discriminated union of eighteen variants with `seq` and
   `at` on every event, coalescing consecutive same-target xp and item deltas within ten seconds,
   capping at 5000 while keeping `run_started` at index 0 and maintaining a single
   `truncated{dropped}` marker so the buffer never silently lies about completeness. Twelve of the
   nineteen have paint; none has a structured, replayable, capped event log.

And three properties of the wait family that are better than any competitor's, worth naming so
they survive: **xp, item and message capture a baseline at call time** and wait for a delta rather
than polling for a state, so there is no missed-edge race; **the signal is read per call, not
captured**, because a fixed signal is what once made a one-second task timeout wait out a
sixty-second `wait.until`; and **a script's predicate can never take the run down**, because
`safe()` wraps every call and returns false on a throw.

### 3.2 Where we are behind

Ordered by how loudly the survey says so.

1. **Events (heading 9) are absent from the script API.** The plumbing exists:
   `Transport.onEvent(cb)` delivers a discriminated `HookEvent` for login, logout, disconnect, xp,
   inventory, chat, tick, state and action, and the Worker already fans them out to `eventSubs`.
   `ScriptContext` has no `on(...)` of any kind. A script that wants to react to an xp drop, a
   hitsplat, a level-up or an incoming message must poll. Every other system except Simba, WaspLib,
   rs-sdk and LostCityClientBot has at least a host event bus.
2. **Paint and overlay (11) do not exist.** Twelve of the nineteen surveyed systems have one, and
   it is the most requested feature in every one of their communities. See section 3.3 for why ours cannot
   look like theirs, and P5 for what it should be instead.
3. **No fluent entity query (2).** Ten of nineteen have one. Our library scripts filter
   `c.state().nearbyNpcs` by hand (`mineAndDrop.ts:22`, `netFishAndDrop.ts:24`), and `c.find` covers
   only nine hardcoded resource kinds.
4. **No per-script persisted state (10).** `memory` is a `Map` that dies with the run. A script
   cannot remember anything between runs, and the SP4 spec's claim that `memory` is "serialised into
   snapshots" is not true of the code.
5. **No teleports, no run energy, no navigation graph (4).** The `Spells` component ids exist and
   `travel` does not know they do; `sendWalk(x, z, running)` takes a flag that `bot.walkTo` does not
   expose.
6. **No auto-eat, no potions, no prayer flick, no `wait.hp` (6).** `low-hp` deliberately ends the
   run rather than being recoverable. Microbot's `eatAt(percentage)` is the shape the survey says
   developers expect.
7. **Widget component ids are bare numbers everywhere (7)**, including inside
   `HealthPolicy.expectInterfaces?: number[]`. OSBot rejects scripts at review for exactly this.
8. **No retry-with-backoff a script can call (12).** `maxAttempts` is declarative only. WaspLib's
   `attempts` parameter is the cheapest version of this in the survey.
9. **Two waiting vocabularies with opposite error contracts live in one namespace (8, 14).** Our
   `c.wait.*` returns booleans and never throws; the vendored `sdk.waitForCondition` throws and
   `sdk.waitForChat` resolves null. Both are in scope inside the same script body.
10. **`ActionResult.reason` is a bare `string` (12)**, so the one layer scripts branch on most often
    is the one layer with no closed set, while `FailReason`, `TasksErrorCode` and `HealthCondition`
    above it are all closed.
11. **No test harness a script author can use (14).** Our own code has thorough vitest coverage,
    and `library.test.ts` drives scripts against a scripted world sequence, but there is no published
    `fakeContext`.
12. **`screenshot()` is discoverable only through the raw-SDK namespace (11).** It is not on
    `ScriptContext`, but it is *not* unreachable: `BotSDK.screenshot()`
    (`web/src/vendor/rs-sdk/sdk/index.ts:1044`) returns `this.transport.screenshot()`, `c.sdk` is a
    real `BotSDK` built over the scoped transport (`localSdk.ts:8`), and the scoped transport swaps
    only `onState`, `relogin` and `logout` (`workerContext.ts:83`), so `await c.sdk.screenshot()`
    works today and `localSdk.test.ts:125` pins it. The defect is that the only place to find it is
    the namespace item 9 above already calls the wrong place to look. P7 gives it a name, a null
    return and a doc comment; it does not add a capability.
13. **Naming and option shape are inconsistent across the seam (14).** `bot.walkTo` versus
    `sdk.sendWalk` versus `travel.to`; `wait.until` versus `sdk.waitForCondition`; options objects
    in the new layers (`FindOpts`, `TravelOpts`) and positional arguments in the old
    (`wait.xp(skill, minDelta, timeoutMs)`, `bot.walkTo(x, z, tolerance)`). The newer the code, the
    more likely it takes an options bag. This is the specific thing the owner's "maintain a
    consistent standard" asks to fix.
14. **Dead API surface (1).** `Task.cooldownMs` is declared at `types.ts:220` and read by nothing;
    grep returns exactly that one line.
15. **No versioning or deprecation path for the API itself (13).** `ScriptManifest.version` is a
    monotonic integer for fork pinning, not a compatibility statement. IdleRSC's compatibility shims
    are the survey's answer to this problem.
16. **One live S8 unit drift, in the field a script is most likely to copy (8).**
    `hardStop.hpBelow` (`types.ts:167`) is **absolute hitpoints**: the three bundled library scripts
    set `{ hpBelow: 3 }` and `runner.ts:130` compares `hp < floor`. Its name says neither "points"
    nor "percent", and P12 proposes `eatBelowPercent` beside it. That is S8's own non-compliant
    example, `{ hpBelow: 0.4, eatAt: 40 }`, arriving by increments. S8 grows a `Points` suffix and
    P12 carries the fix.

### 3.3 Where we are deliberately different, and must stay so

These are not gaps. Each is a consequence of the sandbox or the Worker, and each is a place where
copying the surveyed systems would be wrong.

- **No API member of ours hands script code the raw transport, the DOM, the filesystem or another
  character.** Every single surveyed system runs script code full-trust: a DreamBot, OSBot, TRiBot,
  RuneMate, Microbot, unethicalite, EthanApi, OSRSBot, Parabot, IdleRSC or Simba script is native
  code with the same privileges as the client, and LostCityClientBot - the one system that shares
  our world, our language and our runtime - puts script JavaScript in the client page's own `window`
  scope, which is the same trust model reached by a different route. IdleRSC's README states it
  outright: "Running a rogue .class file is akin to running a .exe file on your computer... IF YOU DO
  NOT TRUST IT, READ THE SOURCE CODE BEFORE COMPILING IT."

  Our scoped transport refuses `relogin` and `logout` **by value, not by visibility**
  (`workerContext.ts:83`), because `BotSDK` keeps its transport as a TypeScript parameter property,
  which is an ordinary own property in emitted JavaScript. The swapped list is test-pinned so a
  fourth member is a decision rather than an oversight.

  **Be precise about what that buys, because S10 depends on it.** The scoped transport is
  `{ ...d.transport, onState, relogin, logout }`: three members swapped, and the other eight
  (`getState`, `onEvent`, `dispatch`, `cancel`, `say`, `echo`, `screenshot`, `humanInput` - the full
  list is pinned at `workerContext.harness.ts:19-31`) pass through by value. `BotSDK` is constructed
  *over* that scoped object (`localSdk.ts:8`), so `c.sdk.transport.dispatch(...)` and
  `c.sdk.transport.humanInput(...)` are reachable from script code today. This is not fixable by
  hiding: swapping `dispatch` would break every `bot.*` and `sdk.send*` call that rides it. What is
  true, and what S10 therefore states, is that **no member of ours returns, documents or leads to
  the dispatcher**, that the residual reach is an artefact of the vendored parameter property, and
  that the enforcement is the studio's `no-transport-escape` lint plus the pinned swap list. Still
  stricter than anything in the survey; not a hard boundary, and this document does not claim one.
- **The Worker has no canvas, so paint cannot be drawn by the script.** Every overlay API in the
  survey hands the script a `Graphics2D`, a `CanvasRenderingContext2D` or a Lazarus form. Ours
  cannot. Whatever we build for heading 11 must be **data the script publishes and the host
  renders**, which is what P5 proposes.
- **No filesystem.** OSBot's per-script Data folder has no analogue. Persistence must travel through
  the host to Firestore and IndexedDB, which is why P6 is asynchronous and capped where OSBot's is
  a synchronous folder handle.
- **No threads and no mutexes.** Simba ships `TThread` and `TLock`; our concurrency model is one
  Worker per character and nothing inside it.
- **No hot module reload.** A module the Worker has already imported stays in its module map for
  the life of the Worker (`worker.ts:166`), so `restart()` terminates and replays. PowBot's
  `ScriptUploader` push-into-a-running-client loop is not reachable for library scripts; user
  scripts are re-read from the store on restart, which is the closest equivalent we can offer.
- **No native pathfinder.** rs-sdk's `rsmod-pathfinder` cannot run in a Worker, which is why
  `PATCHES.md` records that we replaced `pathfinding.ts` outright with our own bitset BFS.
- **No camera and no screen space.** The collector reads the scene graph, not the render view, so
  every `isOnScreen()`, `isClickable()`, minimap-click and colour-match API in the survey is
  meaningless here. SP4b section 2.2 already settled this.
- **User scripts have no module system.** `compileUserScript` strips whole-line imports by regex and
  runs the rest through `new Function`, so **a shared helper must either hang off `c` or be inlined
  into the fork seed**. This is why `library/index.ts:35` carries a hand-maintained JavaScript copy
  of `loopHelpers.ts`. Every proposal in section 5 is costed against that constraint.
- **Anti-detection is `n/a`.** Recorded once, in section 1, and never again.

## 4. The standard

Twelve rules. They bind every existing and future member of `ScriptContext`, of anything we add
under it, and of any wrapper we put over the vendored `BotActions`/`BotSDK`. They do not bind the
vendored files themselves, which we do not edit without a `PATCHES.md` note.

Each rule states the rule, then gives one compliant and one non-compliant example. The
non-compliant examples are drawn from real API shapes in the survey or from real inconsistencies in
our own tree, not invented.

### S1. Naming

Members are `camelCase`. Types are `PascalCase`.

**Every new closed string union is `snake_case`**, and never mixes casings inside one union. Three
of the four sets in the tree already are: `FailReason`'s `out_of_supplies`, `TasksErrorCode`'s
`not_signed_in`, `TravelResult.reason`'s `needs_route`. `HealthCondition` is `kebab-case`
(`'no-progress'`, `'loot-and-logout'`) and is **grandfathered**, not a precedent. An earlier
formulation of this clause ("kebab for a condition a human reads, snake for a machine-branched
reason, and a new set follows whichever neighbour it lives beside") was the one rule here with no
example and no decidable test: `low-hp` and `low_hp` are the same condition spelled two ways in one
script body, and P10's `ActionReason` has neighbours of both kinds.

A method is a **verb** or `verb` plus `Noun`: `find`, `travel`, `withdraw`, `interactLoc`. A
property or a zero-argument accessor is a **noun**: `params`, `signal`, `state()`, `level()`. A
boolean-returning member reads as a predicate: `is`, `has`, `can`, or an adjective. A member
returning a collection is **plural**; a member returning one thing or null is **singular**.

Never abbreviate a domain word: `inventory`, not `inv`; `experience` is `xp` only because the game
calls it that. Never name a member after its implementation: `nearestAtlas` names the layer that
answers and is grandfathered; a new member would be `nearest(kind, { source: 'atlas' })`.

```ts
// compliant
c.world.npcs().withName('Goblin').nearest();   // plural collection, singular picker
c.bank.hasItem('Coins');                        // boolean reads as a predicate
c.travel.distanceTo(target);                    // verbNoun, returns a number
type ActionReason = 'target_not_found' | 'wrong_interface';   // a new closed union: snake_case
```

```ts
// non-compliant
c.world.getNpcList();                 // 'get' prefix on an accessor, 'List' restating the type
c.bank.coins();                       // noun that performs a lookup and can fail
c.travel.dist(t);                     // abbreviated domain word
c.health.checkIsConditionActive(x);   // three verbs; the predicate form is `c.health.is(x)`
type ActionReason = 'target-not-found' | 'wrong_interface';   // two casings inside one union
```

### S2. Async and cancellation

**Everything that can take longer than one expression returns a `Promise`.** There is no
synchronous blocking anywhere in our layer, and there is no `sleep(ms)`: the only delay a script may
express is `c.wait.ticks(n)`, which counts server ticks rather than wall clock. This is the survey's
most universal rule (expectation 22) and it is already ours; the standard's job is to keep it true
for members added later.

Every awaitable member **observes the live abort signal**, read per call through `d.signal()` rather
than captured at construction, because the runner swaps the controller between tasks. An aborted
operation **resolves**, it does not reject: cancellation is a normal ending, not a fault
(expectation 37).

**Say plainly that this inverts the web platform's convention**, in the one document whose job is
to be familiar to JS developers. `fetch`, `AbortSignal.throwIfAborted()`, Node's `fs/promises` and
every other `{ signal }`-taking API rejects with an `AbortError`. We resolve instead for two
reasons: a stop is a normal ending here rather than a fault, and a rejection the script author
forgot to catch would take the run down at exactly the moment the player asked it to stop. The
consequence a caller must know is that **a cancelled await is indistinguishable from a timeout in
the return value** (both are `false`, or `null` for a value-returning wait); the trace label is how
you tell them apart, which is why S7 requires one.

A member that takes its own `AbortSignal` accepts it in the options object as `signal` and races it
with the task signal. **Every options bag introduced by section 5 carries `signal?: AbortSignal`**,
so this is a property of the surface rather than of one member.

Synchronous members are permitted when the answer needs no round trip. That is four categories, and
the categories are the rule rather than the list: **snapshot reads** (`state()`, `health.is`,
`health.last`, `health.recovered`, and P3's `world.*` builders and terminals), **static map
knowledge** (`find.landmark(id)`, `find.nearestAtlas(kind, opts)`, `travel.distanceTo(target)`,
P3's `world.isReachable`), **trace and status writes** (`log`, `status`, and P5's `overlay.*`), and
**run-local bookkeeping** (`params`, `memory`, the `signal` getter, `anchor`). Everything else is a
`Promise`. An earlier draft of this clause enumerated five members and thereby made eight real ones
non-compliant by the letter.

```ts
// compliant
const found = await c.find.nearest('tree', { variant: 'Oak' });
if (c.signal.aborted) return;                  // read through the getter, never cached
await c.wait.until(s => s.player.animId === -1, { timeoutMs: 5_000, label: 'stop chopping' });
```

```ts
// non-compliant
const signal = c.signal;                        // captured once; a later task's abort is missed
await new Promise(r => setTimeout(r, 2_400));   // a fixed sleep; drifts against the tick
c.bot.chopTreeSync('Oak');                      // blocking the Worker's only thread
await c.travel.to(t);                           // throws AbortError on stop, per rs-sdk's style
```

### S3. Results versus exceptions

**A typed result union when the caller is expected to branch. A throw only when the caller cannot
usefully continue.**

Concretely: every game action returns `ActionResult` or a narrowed sub-interface, and reports
failure as `{ success: false, reason }`. Every wait returns `boolean`, where `false` means "the
thing did not happen within the timeout, or the run was cancelled". Every multi-step operation of
ours returns a named result with a closed `reason` union, as `TravelResult` does. A timeout is data,
never an exception (expectation 34).

**A wait that yields a value returns `T | null`**, where `null` carries exactly the meaning `false`
carries for a boolean wait: the thing did not happen within the timeout, or the run was cancelled.
This is the one place `null` does not mean S9's "there is no such thing right now", and it is
stated in both rules so neither can be read alone. P2's `c.once` is the case.

There is **one error class**, `TasksError`, with a `code` from a closed set and an optional
`detail`. It is thrown only across the api boundary, for programmer errors and for refusals a script
cannot act on: a disabled script, an unmet requirement, a bad param, a dead runtime. Script code
never sees it. Inside the Worker, a throw from script code is caught by the runner and turned into
the same failure an unsuccessful `ActionResult` produces, so a script cannot crash the runner, and a
predicate that throws is treated as `false`.

`defineScript` throws, because it runs at module load rather than in the loop, and a manifest that
cannot be parsed is not a run that can fail.

```ts
// compliant
const r = await c.travel.to({ landmark: 'lumbridge-bank' });
if (!r.success) { c.log(`could not get there: ${r.reason}`, 'warn'); return r; }

if (!await c.wait.xp('Woodcutting', 1, 30_000)) return { success: false, message: 'no xp', reason: 'timeout' };
```

```ts
// non-compliant
const npc = c.world.npcs().nearest();
npc.interact('Attack');                 // Parabot/DreamBot shape: sentinel null, silent NPE
if (c.bank.withdraw('Logs', 10) === -1) // sentinel integer as an error channel
try { await c.wait.until(p); } catch {} // rs-sdk's waitForCondition shape: a timeout as a throw
throw new Error('bank was not open');   // a bare Error; the caller cannot branch on it
```

### S4. Options objects with defaults

**Zero or one required positional argument, then one options object.** Every optional parameter goes
in the options object with a documented default. No boolean positional arguments, ever. No third
positional argument, ever.

The options object is **named**, as `<Thing>Opts`, and exported from `scriptApi.ts`. An anonymous
inline bag is non-compliant, because nothing can lint it and the reference cannot link to it.
Fields are optional by default, and adding one is not a breaking change, which is the whole point.
**A bag may carry one required field** when the call is meaningless without it, provided the bag
itself is then a required argument: `retry(fn, { until })` and `wait.hp({ belowPercent })` are
compliant by this clause rather than by exception.

**Three carve-outs, and the list is closed.** Each takes two positional arguments because the second
is not an option:

1. **Fluent filter methods on a query builder** may take their filter value positionally, plus at
   most one optional positional that qualifies it: `within(tiles, from?)`, `withId(...ids)`. They
   read as a chain and an options bag would break the chain's rhythm.
2. **Key/value setters**: `overlay.set(key, value, opts?)`, `store.set(key, value)`. The value is
   the subject of the call, not a setting on it.
3. **Verb-plus-object interaction pairs in the vendored layer**, `bot.interactLoc(loc, 'Mine')`,
   which S4 does not bind anyway and which our own members must not imitate: P8 takes an options
   bag instead.

Nothing else. A member outside these three that wants a second positional argument is asking for a
fourth carve-out, and the answer is no.

The ban on boolean positional arguments holds inside a carve-out too: a filter that would take one
splits into two named methods (P3's `reachable()` and `unreachable()`) or folds into `where`.

Existing positional signatures in our layer (`wait.xp(skill, minDelta, timeoutMs)`,
`wait.item(idOrName, delta, timeoutMs)`, `wait.message(pattern, timeoutMs)`,
`wait.dialog(pattern, timeoutMs)`) are grandfathered and gain an overload rather than a rename, per
S12. Vendored positional signatures (`bot.walkTo(x, z, tolerance)`) are left alone.

```ts
// compliant
await c.find.nearest('rock', { variant: /copper/i, maxDistance: 40, reachableOnly: true });
await c.wait.until(pred, { timeoutMs: 30_000, label: 'furnace opens' });
```

```ts
// non-compliant
await c.find.nearest('rock', /copper/i, 40, true, false);   // positional soup; the two booleans are unreadable
await c.bank.withdraw('Logs', 10, true);                    // boolean positional: noted? all-but-one? nobody knows
await c.travel.to(t, 3, 8, 60_000);                         // three anonymous numbers
```

### S5. Query and filter style

Two shapes, both mandatory, neither sufficient alone.

**A predicate function is accepted anywhere a selector is.** The selector union is
`string | RegExp | number | ((e: E) => boolean)`, uniformly: a string is an exact case-insensitive
name match, a RegExp is tested as written, a number is an id, a function is a predicate
(expectation 4). This union is already the vendored `find*` family's shape and it becomes the rule.

**A small fluent query sits over world entities**, modelled on rs2b0t's single `EntityQuery<E>`
shared by every entity kind rather than four bespoke finders (expectation 5), with unethicalite's
selector triad folded in and RuneMate's reachability as a filter rather than a post-hoc check
(expectation 6). It is lazy: nothing is read from the snapshot until a terminal call. The terminal
calls are explicit and named: `all()`, `first()`, `nearest()`, `count()`, `any()`.

**No magic strings that are not the game's own words.** An action name passed to `interact` is the
menu option text the game shows, matched case-insensitively, and it is the only string of that kind.
A widget is addressed by a named constant, never a bare number (expectation 21). A skill is
addressed by its name because the engine names it that way and `getSkill` already aliases
`hp`/`hitpoint`.

**One documented exception, and it is the only one.** A ground item is addressed by the game's
option ordinal (`opIndex`, 1 to 5, 3 being Take), because `GroundItem` publishes no option text for
a name to match against - unlike `NearbyLoc`, `NearbyNpc` and `InventoryItem`, which all carry
`optionsWithIndex`. P8 states it in its doc comment, ruling 13 records it, and ruling 25 declines
to close it with a collector change for now. No second exception is granted without the same three.

```ts
// compliant
c.world.npcs().withName('Goblin').where(n => n.hp > 0).reachable().within(10).nearest();
c.world.locs().withAction('Mine').all();
await c.bot.interactLoc(loc, 'Mine');                  // the menu option text the game shows
if (s.interface?.interfaceId === INTERFACE.CHAR_DESIGN) { ... }
```

```ts
// non-compliant
c.state().nearbyNpcs.filter(n => n.name === 'Goblin').sort(byDistance)[0];  // what our library scripts do today
c.world.npcs().nearest().filter(...)                    // filtering after a terminal call
await c.sdk.sendInteractLoc(x, z, id, 3);               // raw option index; Parabot's failure mode
if (s.interface?.interfaceId === 3559) { ... }          // bare widget number; OSBot auto-rejects this
```

### S6. Events

**`c.on(event, handler)` returns an unsubscribe function.** Not an `off`, not a listener object, not
a handle to pass back. The returned function is idempotent. This is the `Unsub` shape already used
by `Transport.onEvent`, `TasksApi.onEvent` and `TasksApi.onStatus`, so it is one shape across the
whole product.

The event map is a **closed, typed, documented union that is ours**, not the raw `HookEvent` stream
and not the transport's shape (expectation 27). A handler that throws is caught and logged and does
not take the run down, exactly as a `wait` predicate is.

Where waiting for one occurrence reads better than subscribing, the same vocabulary is available as
an awaitable one-shot with a timeout (expectation 26), and as an async iterator where a script wants
to consume a stream in a loop. All three read from one event map, so there is one name per event and
never two.

Every subscription a context opens is released on dispose, through the same `offs` set the context
already keeps for state subscriptions. **Breaking out of a `for await` calls the iterator's
`return()`**, which unsubscribes; so does an abort, which ends the iterator. Both paths are the
author's, and neither leaks a listener past the loop that opened it.

`c.on` and `c.events` take an options bag of their own (`{ signal?, where? }`), so a subscription
can be tied to a sub-operation rather than to `dispose()`. `addEventListener(type, fn, { signal })`
is the shape a JS developer reaches for first, and Node's `events.on(emitter, name, { signal })` is
the precedent for the iterator.

```ts
// compliant
const off = c.on('xp', e => { if (e.skill === 'Woodcutting') total += e.delta; });
try { ... } finally { off(); }

const drop = await c.once('hitsplat', { timeoutMs: 5_000 });   // null on timeout
for await (const m of c.events('message')) { if (/you fail/.test(m.text)) break; }
```

```ts
// non-compliant
c.on('xp', h); c.off('xp', h);          // two calls to manage one subscription
c.transport.onEvent(h);                 // reaching the raw transport; S10 forbids it
c.on('inventory', h);                   // an event named for the transport's channel, not the domain
c.addEventListener('xp', h);            // DOM naming inside a Worker with no DOM
```

### S7. Waiting

**`c.wait` is the only sanctioned wait.** No fixed sleeps, and `wait.ticks(n)` is the only delay,
counted in server ticks. Every wait takes a timeout with a documented default of 20 seconds
(`DEFAULT_WAIT_MS`), returns `false` on timeout or cancellation rather than throwing, and takes a
`label` that names the wait in the trace when it expires.

The family covers, and must keep covering, the things the survey says scripts wait for: a
predicate (`until`), ticks (`ticks`), a dialogue (`dialog`), an experience delta (`xp`), an item
delta (`item`), a chat message (`message`), idleness (`idle`), and, by P9, an animation (`animation`)
and a hitpoint threshold (`hp`). `xp`, `item` and `message` **capture their baseline at call time**
and wait for a delta, so there is no missed-edge race; any new delta-shaped wait does the same.

`until` gains a `resetWhen` predicate that re-arms the timeout while a second signal keeps firing
(expectation 23), with the always-true footgun DreamBot documents called out in its own doc comment.

The vendored `sdk.waitFor*` family stays reachable and is **documented as legacy**: it throws where
ours returns false, and it takes no signal. The reference says so and the studio validator warns on
it. It is not removed, because removing a vendored member is a patch we would carry forever.

```ts
// compliant
if (!await c.wait.item('Logs', 1, 20_000)) return { success: false, message: 'no log', reason: 'timeout' };
await c.wait.until(s => s.bank?.isOpen === true, { timeoutMs: 10_000, label: 'bank opens' });
await c.wait.ticks(1);
```

```ts
// non-compliant
await new Promise(r => setTimeout(r, 600));      // a fixed sleep standing in for one tick
await c.sdk.waitForCondition(pred);              // throws on timeout; ignores the abort signal
await c.wait.until(pred);                        // no label on a wait long enough to matter in a trace
while (!done) { /* busy loop */ }                // blocks the Worker's only thread
```

### S8. Units and coordinates

**Distances are tiles. Delays are ticks. Timeouts and durations are milliseconds, and the field
name always ends in `Ms`.** A percentage is an integer 0 to 100 and the field name says `Percent`. A
fraction is 0 to 1 and the field name says `Fraction`. **An absolute game quantity the interface
shows as a number - hitpoints, prayer points, run energy - says `Points`.** Never two of these for
one quantity.

`hardStop.hpBelow` (`types.ts:167`) is the live violation and section 3.2 item 16 records it: it is
absolute hitpoints, its name says so in neither direction, and P12 proposes `eatBelowPercent` to sit
beside it. The fix is `hpBelowPoints` added and `hpBelow` deprecated per S12, not a rename.

**There is one world-coordinate shape:** `Tile { x: number; z: number; level: number }`, where
`level` is the floor plane and is `0` when omitted at a call site. `x`/`z` and not `x`/`y`, because
that is what the engine and the whole vendored surface already use. Every member that takes or
returns a position takes or returns a `Tile` or something structurally assignable to one, and
`TravelTarget`'s `{ x, z, level? }` arm becomes that type rather than a fourth spelling of it.

Distance is Chebyshev throughout, as `find.ts:42` and `travel.ts:43` already compute it, and the doc
comment of every distance-bearing member says so.

```ts
// compliant
interface FindOpts { maxDistance?: number; /** tiles */ }
await c.wait.until(pred, { timeoutMs: 30_000 });
await c.wait.ticks(2);
c.travel.to({ x: 3222, z: 3218, level: 0 });
health: { eatBelowPercent: 40 }
```

```ts
// non-compliant
{ maxDistance: 40, timeout: 30 }        // 40 what? 30 what? seconds or ms?
{ x: 3222, y: 3218 }                    // a second coordinate spelling
await c.wait.ticks(600);                // ticks confused with milliseconds
{ hpBelow: 0.4, eatAt: 40 }             // a fraction and a percent for the same quantity
```

### S9. Nullability

**`null` means "there is no such thing right now". A result union means "I tried and it did not
work".** They are never used for the same question.

A lookup that finds nothing returns `null`, and the return type is `T | null` so the type checker
demands the check: `find.nearest`, `find.landmark`, `find.nearestAtlas`, `health.last`,
`getState()` before login. An action that ran and failed returns `{ success: false, reason }`. A
wait that expired returns `false`.

**One named exception, stated here and in S3 so neither rule can be read alone:** a wait that yields
a value returns `T | null`, and there `null` means what `false` means for a boolean wait - it
expired, or the run was cancelled. P2's `c.once` is the case, and its doc comment must say so
rather than leaving a reader to infer "no such event exists".

`undefined` is never returned deliberately; it appears only as an absent optional field.

We do not adopt PowBot's `Nil` sentinel objects (`Npc.Nil`, `Item.Nil`). They exist to survive
Kotlin's platform-type nullability; TypeScript's `strictNullChecks` already forces the check at the
call site, and a sentinel that looks like an entity but is not one is a worse failure than a null.

```ts
// compliant
const tree = await c.find.nearest('tree');
if (!tree) return { success: false, message: 'no tree in range', reason: 'target_not_found' };

const last = c.health.last();            // null while the run has been healthy
```

```ts
// non-compliant
const tree = await c.find.nearest('tree');   // typed T, never null; the caller forgets the check
return { success: false, reason: 'no tree' } // a result union where the honest answer is "none exists"
return Npc.Nil;                              // a sentinel that passes a truthiness check and then fails
return undefined;                            // a third absence value
```

### S10. The sandbox rule

**An API member may never expose the raw transport, the DOM, the network, the filesystem, another
character's session, or the ability to log the account in or out.**

Concretely, and this list is the rule rather than an illustration of it:

- **No member of ours returns, documents or leads to `Transport`.** The rule is phrased about our
  members rather than about reachability, because reachability is not ours to promise:
  `c.sdk.transport` exists at runtime, since `BotSDK` holds its transport as a TypeScript parameter
  property and that is an ordinary own property in emitted JavaScript. The same mechanism is why
  `relogin` and `logout` are refused **by value** in the scoped transport rather than hidden behind
  `private`. The swapped list is `onState`, `relogin`, `logout`, and it is test-pinned against the
  full `Record<keyof Transport, true>` member set (`workerContext.harness.ts:19-31`), so a fourth is a
  decision rather than an oversight.
- **`humanInput` is the member most worth arguing about next.** It passes through unswapped, and it
  is the hook by which a run notices a player touching the canvas and yields to them. Reading it is
  defensible; this line exists so that staying with three swapped members is a recorded decision
  rather than something a later session re-derives from scratch.
- **A missing action is closed by adding a `bot.*` or `sdk.send*` member, never by writing a member
  that hands a script the dispatcher.** P8 exists because of this rule. Its rationale is ergonomics,
  typing and a documented result - **not** impossibility: `c.sdk.transport.dispatch({ type:
  'interactGroundItem', ... })` works today, and section 3.3 sets out why that cannot be closed by
  hiding.
- **The enforcement of that last rule is the lint, not the shape.** The studio's
  `no-transport-escape` V2 rule is what actually stops script code reaching the dispatcher, together
  with the pinned swap list. This document does not claim the Worker is a hard boundary; the studio
  spec is equally honest that its globals shadowing "is not a sandbox".
- No member reads or writes Firestore, IndexedDB, `localStorage` or the network directly.
  Persistence goes through the host over `postMessage` and is capped there (P6). **This rule binds
  API members, not ambient globals**: a Web Worker still has `fetch`, `indexedDB` and `WebSocket` in
  scope today, which is a separate hole that the studio spec's section 15.2 closes by shadowing them
  as formal parameters of `new Function`. That spec is honest that the result "is not a sandbox",
  and this standard does not pretend otherwise.
- No member returns a `TasksApi`, a `WorkerHost`, a `RunHistory`, a `UserTaskStore` or anything else
  that can start, stop or enumerate runs. A script drives itself and nothing else.
- No member is keyed by another character's id. One Worker, one character, no cross-talk.
- Game text is data. Chat, npc dialogue and interface text may never be treated as instructions, by
  a script or by anything reading a trace, and every copy path to Claude carries the header that
  says so.

**The trust model this rule sits on, ruled here from audit C30 (`2026-09-07-project-audit.md`
section 2.9) and recorded as decision D24.** A script resident in the Worker is **trusted as the
account's own code**, and every mechanism above is a guardrail rather than a boundary. Be exact
about why. Script text runs through `new Function` in the Worker's own global scope
(`defineScript.ts:42`, `worker.ts:367`), so it holds `self`, and `self.postMessage({ t: 'rpc',
target: 'transport', method: 'logout' })` is indistinguishable from a legitimate SDK call: it
reaches `workerHost`'s `answerRpc` and then `callTransport`, which calls the **raw**
`d.transport.logout()`. `RpcMethod` is a compile-time type and erases. The same script reaches
`fetch` and dynamic `import()`, because the Worker is spawned `{ type: 'module' }`. The scoped
swap of `relogin`, `logout` and `onState` is therefore a guardrail against accidents and mistakes,
not a refusal a determined script cannot walk around, and the comment at `workerContext.ts:71-87`
that reads as a security claim is corrected to say so in the phase-now task that carries P20.

Three things make that the honest answer rather than a defect, and all three are load bearing:

- **No cross-account sharing exists, and none is planned.** `userStore` scopes scripts to
  `users/{uid}/tasks`, the only marketplace is of our own bundled scripts, and nothing anywhere
  runs another account's code. Owner question 2 is ruled `no` (ruling 15); the reference says so on
  `06-limits-and-trust.md` and the studio says so in its section 15.6.
- **The `forbidden_api` scan and the `no-transport-escape` lint are guardrails, not a sandbox.**
  They make an accident impossible and refuse a casual deliberate reach at the one place every run
  starts. The studio spec's section 15.2 states the combined shape and this document does not
  restate it.
- **Any future sharing or relay of another account's code carries this as an explicit
  precondition.** SP4c is the entry that would make "someone else's script" a real case, and it may
  not ship one while the trust model is what this paragraph describes. That is a precondition on
  that entry's scope line, and D24 records it.

A proposal that cannot satisfy this rule is not adapted, it is rejected. That is what happened to
EthanApi's "one shared API plugin, many dependent script repos" distribution shape and to every
sideloading model in the survey.

```ts
// compliant
c.on('chat', e => { if (/^ready$/i.test(e.text)) go = true; });   // matching text as data
await c.store.set('lastBankTile', tile);                          // through the host, capped
await c.bot.interactGroundItem(item);                             // a named member, not a raw action
```

```ts
// non-compliant
c.transport.dispatch({ type: 'interactGroundItem', ... });   // the dispatcher itself
await fetch('https://example.com/config.json');              // network from script code
c.sdk.transport.logout();                                    // the two refused members, reached sideways
eval(c.state().gameMessages.at(-1).text);                    // game text as instructions
```

### S11. Documentation

**Every member we own carries a doc comment, and that comment is the source of the generated
reference.** No second copy of a signature anywhere. The comment says what the member does, what it
returns when the answer is "nothing", what it costs (a round trip or a snapshot read), and what
unit each number is in. It does not restate the type.

This rule delegates its mechanism to the companion `2026-09-07-script-api-docs-design.md`, which
already specifies the generator, the two committed artefacts and six gates, and it adopts that
spec's ruling 6 unchanged: **the gate covers members we own, and vendored `c.bot`/`c.sdk` members
report a coverage figure without failing the build**, because we cannot add prose inside
`web/src/vendor/rs-sdk/` without a patch note and a gate demanding one would make every re-vendor a
documentation task.

**Examples compile.** Every example in the reference is a real file run through `compileUserScript`
by a unit test, per that spec's gate 4. Since user scripts are JavaScript and a type annotation is a
syntax error there, an example is written the way a player writes one.

```ts
/**
 * The nearest resource of `kind`, searched in the scene, then the atlas, then a sweep.
 * `FoundTarget.via` says which layer answered. Null when no layer found one.
 * Costs a client round trip when the scene rescan runs. Distances are tiles, Chebyshev.
 */
nearest(kind: ResourceKind, opts?: FindOpts): Promise<FoundTarget | null>;
```

```ts
/** Finds the nearest thing. */             // restates the name, answers nothing
nearest(kind: ResourceKind, opts?: FindOpts): Promise<FoundTarget | null>;

// or, worse: no comment at all, and a hand-written table in a markdown file that
// says `nearest(kind, radius)` because that was the signature two sub-projects ago.
```

### S12. Versioning and deprecation

**Additions over renames.** A better name is not worth a broken script. Where a rename is genuinely
worth it, the path is fixed and has three steps:

1. **Add** the new member with a doc comment, and record the api version it arrived in. **There is
   one version vocabulary and it is the api number.** The docs companion's generator does not parse
   `@since` from a doc comment; it reads a small hand-maintained map inside the generator, keyed by
   member path. That map is the mechanism, and section 6.2 asks it for one change: its values become
   api versions (`1`, `2`) rather than sprint labels (`'SP4a'`, `'SP4b'`), so that "what api version
   is this member from" - the question this rule's removal window depends on - has an answer the
   reference can render. Do not write `@since` in the comment as well; two sources for one fact is
   the failure gate 1 exists to prevent. Implement the old member in terms of the new one, so there
   is one implementation and two names.
2. **Deprecate** the old member with `@deprecated Use <new> instead. Removed in api 3.` The
   generator already emits `deprecated?: string` on `ApiMember`, so the reference renders the notice
   and the studio validator warns on use. The run also emits one `log` line at `warn` the first time
   a run touches a deprecated member, so a player who never reads the reference still finds out.
3. **Remove** no earlier than **two api versions** later, and never inside a sprint. **The removal
   commit greps the saved user-script sources for the member first.** The store is one operator's,
   `tasks/{taskId}.code` is a plain string, and a read of that collection is cheap, so this turns
   "removed no earlier than two api versions later" from a calendar promise into a check that can
   fail. A hit is not a veto; it is a migration to write before the removal lands.

`ScriptManifest` gains `apiVersion?: number`, **defaulting to `1` when absent** - see P18 for why
defaulting to the current version would silently defeat the whole mechanism - which is what a script
declares it was written against. The runner reads it, and a script declaring an
older version keeps the older behaviour where a shim exists. This is IdleRSC's compatibility-shim
idea (expectation 45) reduced to the smallest form that works for us: not a parallel package tree,
just a number and a small set of shims in one file. Microbot's `minClientVersion` is the same idea
from the other direction and we do not need both.

Bundled library scripts and Tutorial Island are migrated in the same commit that deprecates a
member, so the shipped corpus never demonstrates a deprecated idiom.

```ts
// compliant
/** Waits for an xp delta in `skill`. api 2; the generator's version map holds that, not this line. */
xp(skill: string, opts?: WaitXpOpts): Promise<boolean>;
/** @deprecated Use `xp(skill, { minDelta, timeoutMs })`. Removed in api 4. */
xp(skill: string, minDelta?: number, timeoutMs?: number): Promise<boolean>;
```

```ts
// non-compliant
// rename `wait.xp` to `wait.experience` in place: every saved user script that used it
// now fails to run, with a TypeError from `new Function`, and no migration path.
```

## 5. Proposals

Twenty-one, each adapted to our idioms rather than copied. Every one is measured against S1 to S12 and
against the sandbox rule in particular. Signature sketches are written against the real
`ScriptContext` at `web/src/tasks/types.ts:174`.

**A cost every `ScriptContext` addition pays, stated once.** A new top-level member touches at least
four places: the interface in `web/src/tasks/types.ts`, its construction in
`web/src/agent/workerContext.ts`, the hand-maintained destructuring list at
`web/src/agent/worker.ts:367` that makes it visible to `api.execute` snippets, and the docs
companion's `web/src/tasks/scriptApi.ts` re-export plus its gate 6 `Record<keyof ScriptContext,
true>` harness. **The `worker.ts:367` list is a silent failure mode**: a member not added there is
invisible to snippets and nothing complains. P0 below fixes that once, so the other nineteen do not
each have to remember it.

A proposal pays the **HELPERS coupling** (`web/src/tasks/library/index.ts:35`) only if it changes
what a bundled library script imports, because a fork seed inlines those helpers as a JavaScript
string and `librarySource.test.ts` compares them. Members hanging off `c` do not pay it. That is a
reason to prefer a context member over a shared helper module wherever both would work.

---

**P0. Generate the snippet destructuring list from the declared surface.**
Taxonomy 14. Adopted from: nothing external. **This is preventive, not corrective**: at `1bfdc7d`
the two lists agree exactly - `worker.ts:367` destructures fourteen names and `ScriptContext` has
those same fourteen members, and the ours survey says the list is hand-maintained rather than that
it is currently wrong. The drift risk is real and cheap to close; the claim of a live defect is not
made. Adapted: the docs companion already introduces `web/src/tasks/scriptApi.ts` as "the one screen
that decides what a script may see" and a `Record<keyof ScriptContext, true>` harness.

**The record's home is a leaf module, and this matters.** `web/src/agent/worker.ts` is the
module-worker entry point (Vite emits it as its own chunk from `spawnScriptWorker`,
`workerHost.ts:70`), and a value import pulls the imported module's whole runtime export graph into
that chunk. `scriptApi.ts` is where P17's `createTestContext` and the docs generator's entry live,
so importing it from `worker.ts` would bundle the test harness into the Worker - which P17
explicitly says must never happen. Note that the current `worker.ts` already avoids this shape: it
loads the library through a dynamic `await import('../tasks/library/index')` at `worker.ts:172`
rather than a static import.

```ts
// web/src/tasks/scriptApiKeys.ts - this module exports the record and nothing else
export const SCRIPT_CONTEXT_KEYS: Record<keyof ScriptContext, true> = { state: true, bot: true, /* ... */ };

// web/src/tasks/scriptApi.ts re-exports it for the docs generator and gate 6;
// web/src/agent/worker.ts:367 imports the leaf and does Object.keys(SCRIPT_CONTEXT_KEYS).
```

Sandbox: unchanged; the record names members that already exist. Cost: a new
`web/src/tasks/scriptApiKeys.ts`, a re-export line in `scriptApi.ts`, `worker.ts:367`, one test.
No HELPERS coupling, no library migration. Breaking: no.
**Phase: now.**

---

**P1. `c.on(event, handler): Unsub` over a closed, typed event map.**
Taxonomy 9. Adopted from: IdleRSC's real push hooks (tick, chat, hitsplat), rs2b0t's `EventMap`,
and the argument the unethicalite survey makes against its own subject, that a botting API should
publish a closed documented vocabulary rather than the host framework's classes. Adapted: our map is
ours, derived from `HookEvent` and the snapshot but never exposing either, and it is deliberately
the same vocabulary as the `TraceEvent` union where they overlap, so a name means one thing across
the product.

```ts
export interface ScriptEventMap {
  tick:      { tick: number };
  xp:        { skill: string; delta: number; total: number };
  item:      { id: number; name: string; delta: number; count: number };
  message:   { text: string; sender: string | null; tick: number; channel: 'game' | 'public' | 'private' };
  levelUp:   { skill: string; level: number };
  hitsplat:  { onSelf: boolean; damage: number; targetIndex: number };
  death:     { tile: Tile; lifeId: number };
  dialog:    { open: boolean; text: string };
  interface: { open: boolean; interfaceId: number };
}
// on ScriptContext:
on<K extends keyof ScriptEventMap>(
  event: K, handler: (e: ScriptEventMap[K]) => void, opts?: ScriptEventOpts<K>
): Unsub;
export interface ScriptEventOpts<K extends keyof ScriptEventMap> {
  where?: (e: ScriptEventMap[K]) => boolean;
  /** Unsubscribes when this aborts, as well as on dispose. Raced with the task signal (S2). */
  signal?: AbortSignal;
}
```

**Each entry names its source, because two of them would otherwise be wrong.** `tick` is a
**snapshot** field, not the transport's `tick` hook: `HookEvents` carries both `tick: { cycle }` (a
client cycle) and `state: { tick }` ("One per server tick (PLAYER_INFO), not per client cycle",
`clientTypes.ts:68`). Ours is the server tick, sourced from `state`, and the transport's `tick` hook
is not exposed at all - which is exactly the one-name-two-things collision S1 and ruling 4 exist to
prevent, so the doc comment says so. `message` is likewise **not** a passthrough: `HookEvents.chat`
is `{ kind, sender, text }` with no tick, so the tick comes from the snapshot's `GameMessage.tick`,
and `sender` is added to the payload because every caller of `wait.message` will want it.

| Event | Source | Kind |
|---|---|---|
| `tick` | snapshot `state.tick` | passthrough of the server tick, renamed from the transport's `state` |
| `xp` | `HookEvents.xp` | passthrough |
| `item` | `HookEvents.inventory` | passthrough, split per item |
| `message` | `HookEvents.chat` plus `GameMessage.tick` from the snapshot | joined |
| `levelUp` | snapshot skill diff | diff |
| `hitsplat` | snapshot `combatEvents` | diff |
| `death` | snapshot `lifeId`/`lastDeathTick` diff | diff |
| `dialog` | snapshot `dialog` diff | diff |
| `interface` | snapshot `interface` diff | diff |

Sandbox: the map is constructed inside the Worker from the snapshot diff and the already-fanned-out
`HookEvent` stream. No transport object crosses into a handler; every payload is a plain object.
Handlers are wrapped like `safe()` so a throwing handler cannot take the run down, and every
subscription is registered in the context's `offs` set so `dispose()` releases it. Cost:
`types.ts`, a new `web/src/tasks/events.ts` (roughly 150 lines: the diff of consecutive snapshots
into `xp`, `item`, `levelUp`, `hitsplat`, `death`, `dialog`, `interface`, plus the passthrough of
`tick` and `message`), `workerContext.ts`, `worker.ts:367` (free after P0), the docs re-export, and
one test file. `hitsplat` reads `combatEvents`, which is on every snapshot and which nothing in our
layer reads today. No HELPERS coupling. Library scripts do not need migrating; Tutorial Island
becomes simpler if it uses `levelUp`, but is not required to. Breaking: no.
**Phase: next.**

---

**P2. `c.once(event, opts)` and `c.events(event)` as an async iterator.**
Taxonomy 9. Adopted from: PowBot's `Watcher`/`LootWatcher`, a self-registering base class that turns
"subscribe, wait for the first match, clean up" into one awaitable call. Adapted: PowBot needs a
class and a `CountDownLatch`; in JavaScript this is a promise and a `for await`, which is what a JS
developer expects (expectation 26).

```ts
once<K extends keyof ScriptEventMap>(
  event: K, opts?: { where?: (e: ScriptEventMap[K]) => boolean; timeoutMs?: number; label?: string }
): Promise<ScriptEventMap[K] | null>;   // null means "expired or cancelled", per S3's value-wait clause
events<K extends keyof ScriptEventMap>(
  event: K, opts?: ScriptEventOpts<K>
): AsyncIterableIterator<ScriptEventMap[K]>;
```

`once` returns `T | null` where `null` carries what `false` carries for a boolean wait: it expired,
or the run was cancelled. That is S3's fourth clause and S9's named exception, not S9's ordinary
"there is no such thing right now", and the doc comment must say which. `opts.signal` is raced with
the task signal (S2); breaking out of the `for await` calls the iterator's `return()` and
unsubscribes (S6).

Sandbox: built entirely on P1. The iterator ends when the signal aborts, so a `for await` cannot
outlive its task. Cost: about 60 lines in `events.ts`, plus tests. Breaking: no.
**Phase: next** (lands with P1).

---

**P3. `c.world` - a small fluent query over scene entities.**
Taxonomy 2. Adopted from: rs2b0t's single `EntityQuery<E>` shared by every entity kind, with
unethicalite's predicate/id/name selector triad and RuneMate's `surroundingsReachable()` as a filter
rather than a check. Adapted: lazy over our snapshot rather than over a mutable cache, so Microbot's
documented re-query-before-acting hazard does not arise; terminal calls are explicit, so nothing
returns a half-evaluated builder.

```ts
/** Every entity kind. Nothing here needs the entity to have a position. */
export interface EntityQuery<E> {
  withName(sel: string | RegExp): this;
  withId(...ids: number[]): this;
  withAction(action: string | RegExp): this;
  where(pred: (e: E) => boolean): this;
  all(): E[]; first(): E | null; count(): number; any(): boolean;
}
/** The four positioned kinds only. */
export interface SpatialQuery<E> extends EntityQuery<E> {
  within(tiles: number, from?: TileLike): this;   // S4 carve-out 1: a fluent filter method
  reachable(): this;
  unreachable(): this;
  nearest(): E | null;
}
// on ScriptContext:
world: {
  npcs(): SpatialQuery<NearbyNpc>;
  players(): SpatialQuery<NearbyPlayer>;
  locs(): SpatialQuery<NearbyLoc>;
  groundItems(): SpatialQuery<GroundItem>;
  inventory(): EntityQuery<InventoryItem>;
  isReachable(tile: TileLike): boolean;
};
```

**Why the type is split.** `NearbyNpc`, `NearbyPlayer`, `NearbyLoc` and `GroundItem` all carry `x`,
`z`, `distance` and an optional `reachable` (`web/src/vendor/rs-sdk/sdk/types.ts:126-206`).
`InventoryItem` (`types.ts:66`) carries `slot, id, name, count, optionsWithIndex`: no coordinates
and no reachability. One shared `EntityQuery<E>` across all five would put `within`, `reachable` and
`nearest` on the inventory arm, where `nearest()` would silently degrade to `first()` or `null` -
a member that cannot work is worse than a member that is absent, which is what S9's nullability
discipline and S1's naming rules are both aimed at.

**`reachable()` records the vendored contract rather than inventing one.** `reachable` is optional
on every entity, and `FindOptions.reachable` documents "Targets whose reachability is unknown always
qualify" (`types.ts:163`). So `reachable()` keeps `true` **and** `undefined`, and `unreachable()`
keeps only `false`. A filter that treated `undefined` as false would quietly drop real targets and
diverge from `c.find`, which is the kind of divergence this whole document exists to stop.

**No `world.distance`.** An earlier draft had `distance(a, b?)` here, which duplicates
`c.travel.distanceTo(target)` - the member S1 uses as its own compliant example one section earlier.
Two distance members on one context is precisely the inconsistency the owner asked to remove, so
`travel.distanceTo` stays and `world` does not grow a second one.

Sandbox: reads `d.transport.getState()` only, exactly as `state()` does. No round trip, no new
capability. `reachable()` filters on the `reachable` flag the collector already computes, treating
unknown as qualifying; an on-demand widening rescan stays an explicit `c.find` concern rather than
something a query does invisibly. Cost: a new `web/src/tasks/world.ts` (about 180 lines, one
generic class plus five factory functions), `types.ts`, `workerContext.ts`, `scriptApi.ts`, one
test file. **The three
library scripts and Tutorial Island should be migrated onto it**, which is where its value shows;
that touches `mineAndDrop.ts`, `netFishAndDrop.ts`, `chopAndDrop.ts`, their fork seeds and
`librarySource.test.ts`, and it does **not** touch HELPERS because `c.world` hangs off the context
rather than being an import. Breaking: no.
**Phase: next.**

---

**P4. `Tile` as the one world-coordinate shape.**
Taxonomy 2 and 4. Adopted from: no single system; it is the standard's S8 made concrete, and every
system that got it wrong (our own `{x, z}`, `{x, z, level?}`, `{x, z, level}` and
`AtlasCluster`'s bare fields are four spellings today) pays for it.

```ts
export interface Tile { x: number; z: number; level: number }
export type TileLike = { x: number; z: number; level?: number };   // what a call site may pass
export type TravelTarget = TileLike | { landmark: string } | { cluster: AtlasCluster };
anchor(tile?: TileLike): Tile;                                     // added overload; the old (x?, z?) form deprecated per S12
```

Sandbox: types only. Cost: `types.ts`, `travel.ts`, `find.ts`, `atlas.ts` and their tests, **plus
the anchor's two real homes, which are neither of the files a reader would guess**: the anchor is
`makeAnchor` in `web/src/agent/runContext.ts:29`, which stores `{ x, z }` seeded from
`player.worldX`/`worldZ`, and it reaches the context as `ContextDeps.anchor(x?, z?): { x, z }` in
`web/src/agent/workerContext.ts`. Its consumers are `recovery.ts:134` and `:191`
(`c.travel.to(c.anchor(), ...)`), not `travel`/`find`/`atlas`. Returning a `Tile` therefore means
teaching `makeAnchor` a `level` and changing the `ContextDeps` signature; **`level` seeds from
`player.level`**, which `PlayerState` carries (vendored `types.ts:35`), the same way `x`/`z` seed
from `worldX`/`worldZ`, and an explicit `anchor(tile)` sets all three. Add `runContext.ts`,
`workerContext.ts` and `recovery.ts` to the cost. The `anchor(x?, z?)` positional form gains an
overload rather than a rename, and the old form is deprecated with a two-version removal window.
No HELPERS coupling. Breaking: **no**, if the overload is added; **yes** if `anchor(x, z)` is
removed, which S12 says it must not be for two versions.
**Phase: now** for the type and the overload; the deprecation removal is later.

---

**P5. `c.overlay` - a host-rendered live stat panel the script publishes into.**
Taxonomy 11. Adopted from: unethicalite's shared `Paint` object with `ExperienceTracker`,
`Statistic` and a zero-config `DefaultPaint`; IdleRSC's composable `PaintBuilder`/`RowBuilder`;
PowBot's `trackSkill()`/`trackInventoryItems()` auto-diffing since script start. Adapted **hard**:
the Worker has no canvas, so the script publishes named rows as data and the run banner renders
them. This is section 3.3's constraint turned into a feature, because a data overlay survives being
read by Claude, exported with a run, and replayed from a trace, and a `Graphics2D` does not.

```ts
export interface OverlayRowOpts { label?: string; unit?: string }
overlay: {
  /** Set or replace a named row. Rows render in insertion order under the status line. */
  set(key: string, value: string | number, opts?: OverlayRowOpts): void;   // S4 carve-out 2
  clear(key?: string): void;
  /** Auto-diffed since the row was created; no manual bookkeeping. Adopted from PowBot. */
  trackXp(skill: string, opts?: { perHour?: boolean }): void;
  trackItem(idOrName: number | string): void;
};
```

**The rows ride the status object, not the trace.** An earlier draft made them a `TraceEvent`
variant "coalesced like xp and item deltas already are", and both halves of that were wrong.
`Trace.coalesce` (`trace.ts:35`) merges an incoming event only against `list[list.length - 1]`, and
only for two same-kind same-target cases; a `trackXp` row republished each tick would be interleaved
with `status`, `action`, `xp`, `item` and `task_enter` rows and would therefore never coalesce at
all. At one row per server tick a thirty-minute run emits roughly 3000 events against the 5000 cap
(`trace.ts:25`, `enforceCap` at `:52`), which evicts real history and permanently pins a `truncated`
marker - damaging the substrate section 3.1 item 6 calls our single biggest advantage.

So: rows are **a keyed last-write-wins map carried on the run status**, which is the shape the
banner actually reads (`RunBanner.update(s: RunStatus)`, `runBanner.ts:27`). The precedent is
`xpPerHour`, landed in the commit at HEAD, and it names the real cost. One `overlay` event is
written to the trace **at run end**, as a final snapshot of the row set, so export and replay keep
working without the flood.

Sandbox: no canvas, no DOM, no new capability; the rows are plain data posted over `postMessage`.
Cost, following the `xpPerHour` path exactly: `RunStatus` in `web/src/tasks/types.ts`, `WorkerStatus`
in `web/src/agent/types.ts:99`, `liveStatus` in `web/src/agent/workerReport.ts:33`, the `IDLE`
default in `web/src/agent/workerHost.ts:74`, the same default at `web/src/tasks/api.ts:116` and
`web/src/tasks/api.harness.ts:25`, the run card at `web/src/plugins/builtin/tasksViews.ts:64`,
`web/src/styleguide.ts:67`, plus `web/src/frame/runBanner.ts` and its test, `workerContext.ts`,
`scriptApi.ts`, one `Trace` end-of-run event, and tests. That is a bigger change than the earlier
draft costed, and it is the honest one. **Depends on Shell v2** for where the rows live in the
panel, so it must not land before entry 2. No HELPERS coupling; no library migration required,
though the three loop scripts each become one line better. Breaking: no.
**Phase: next**, and after Shell v2.

---

**P6. `c.store` - per-script persisted state.**
Taxonomy 10. Adopted from: OSBot's per-script sandboxed Data folder (the survey's only real
persistence boundary), plus EthanApi's and PowBot's host-persisted config. Adapted: no filesystem
exists, so this is an async key-value store scoped to `(uid, characterId, scriptId)`, written
through the host to the same Firestore document tree the user's tasks already live in, with a hard
cap enforced host-side.

```ts
export type StoreSetResult = { ok: true } | { ok: false; reason: 'too_large' | 'too_many_keys' | 'bad_key' };
store: {
  get<T = unknown>(key: string): Promise<T | null>;      // null when unset, per S9
  set(key: string, value: unknown): Promise<StoreSetResult>;   // S4 carve-out 2; JSON only
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
};
```

**`set` returns a result, not `void`.** A capped write that quietly resolves gives the caller
nothing to branch on, and a script persisting a checkpoint is S3's canonical case for "the caller is
expected to branch". The trace still gets its warn line; the caller also gets the reason.

**`c.store` is not `c.memory`, and the reference must say so in both places.** `memory` is a `Map`
that lives and dies with the run and is synchronous; `store` survives the run and is asynchronous.
Two near-identical names with opposite lifetimes will be confused on day one otherwise. `memory`
stays: a run-local scratchpad with no round trip is worth having, and `store.get` in a tight loop is
not what anyone wants.

Sandbox: **the script never touches Firestore.** It posts a typed message; the host validates the
key against `/^[a-z0-9][a-z0-9._-]{0,63}$/i`, serialises the value, enforces a per-script cap
(recommendation: 32 keys, 16 KB total, matching the spirit of the existing 64 KB code cap), and
writes it.

**The path uses the schema we have, not one this proposal invents.** `firebase/firestore.rules` has
no per-user `characters` subcollection: under `match /users/{uid}` there are exactly three
(`plugins/{pluginId}`, `scriptToggles/{scriptId}`, `tasks/{taskId}`), and `characters` is a
**top-level, server-only** collection (`match /characters/{id} { allow read, write: if false; }`),
with `users/{uid}.characterIds` excluded from every client write. Proposing
`users/{uid}/characters/{characterId}/scriptState/{scriptId}` would both invent a collection and
reuse a name that in this schema means "server-owned entity". Use
`users/{uid}/scriptState/{characterId}__{scriptId}` (flat, one document, cheapest rule), and enforce
the cap in the rule the way `tasks/{taskId}` already enforces `code.size() < 65536`.

**And the write path has no identity to key on today.** `WorkerHostDeps` (`workerHost.ts:56`) is
`{ transport, spawn, libraryManifests, now?, stopGraceMs? }`: no uid, no characterId, no Firestore.
`characterId()` exists only as a `TasksApi` dep (`api.ts:89`), so the store handler needs threading
from there. Cost: `types.ts`, `workerContext.ts`, a new host handler in `worker.ts`/`workerHost.ts`
plus the `WorkerHostDeps` widening, `api.ts` and `router.ts` (which owns the per-character attach at
`router.ts:160`), a new store module beside `userStore.ts`, a Firestore rule, and tests on both
sides. No HELPERS coupling. Breaking: no.
**Phase: next.**

---

**P7. `c.screenshot(): Promise<Blob>`.**
Taxonomy 11. Adopted from: rs-sdk, whose survey notes our `Blob` return is already better than its
base64 round trip. Adapted: **the justification, which an earlier draft had wrong.** The capability
is not merely on `Transport` and `TasksApi`; it is already reachable from script code as
`await c.sdk.screenshot()` (`sdk/index.ts:1044`, over an unswapped scoped-transport member, pinned
by `localSdk.test.ts:125`). P7 is therefore a naming, typing and documentation change, not a new
capability: it moves the member to the namespace S7 and section 3.2 item 9 say a script should be
reading, and it fixes two real defects in the reachable form.

```ts
/**
 * The client canvas as a PNG, or null when there is no canvas to read. Costs a round trip.
 * Use it in a failure branch, not in a loop. `attach` (default true) files the image with the
 * run so the report can show it; a script in a Worker has nowhere else to put a Blob.
 */
screenshot(opts?: { label?: string; attach?: boolean }): Promise<Blob | null>;
```

**Two defects in `c.sdk.screenshot()` that P7 exists to fix.** It **rejects** when there is no
canvas (`localTransport.ts:127`, pinned by `localTransport.test.ts:230`), which puts a rejecting
promise into script code with no result union, against S3 and S9; ours returns `null`. And a Worker
script has nowhere to send a `Blob`: `fetch` is forbidden by S10, there is no DOM, and P6's store is
JSON only, so a capability with no sink is a capability that reads well and does nothing. `attach`
is the sink, and it makes the failure-branch use the doc comment recommends work end to end.

Sandbox: the scoped transport already carries `screenshot`; this names an existing, safe member
rather than widening the boundary. Cost: `types.ts`, `workerContext.ts`, `scriptApi.ts`, a trace
variant plus its rendering in the run report for `attach`, one test. Breaking: no.
**Phase: now.**

---

**P8. `bot.interactGroundItem(target, action)`.**
Taxonomy 3. Adopted from: EthanApi's and unethicalite's uniform interact family, where every entity
kind answers the same verb. Adapted: it closes a confirmed hole rather than adding an idiom.
`{ type: 'interactGroundItem'; x; z; itemId; optionIndex }` exists in the `BotAction` union at
`web/src/vendor/rs-sdk/sdk/types.ts:615` and grep confirms **nothing wraps it**, so a ground item can
only be picked up and never used with another menu option; and a script cannot hand-build the action
because S10 forbids exposing `Transport.dispatch`.

```ts
// in our own wrapper layer, not inside the vendored file:
export interface InteractGroundItemOpts {
  /**
   * The game's own option ordinal, 1 to 5, where 3 is Take (`Client.ts:1278`). Defaults to 3.
   * Ground items are the ONE documented exception to "never a raw menu index" (S5), because
   * `GroundItem` publishes no option text for a name to match against. See ruling 13.
   */
  opIndex?: 1 | 2 | 3 | 4 | 5;
  signal?: AbortSignal;
}
interactGroundItem(
  target: GroundItem | string | RegExp, opts?: InteractGroundItemOpts
): Promise<OurActionResult>;
```

**Why not `action: string`.** An earlier draft took a menu action name, and that arm is not
implementable at any cost this proposal could carry. `GroundItem`
(`web/src/vendor/rs-sdk/sdk/types.ts:151`) carries only `id, name, count, x, z, distance,
reachable?` - unlike `NearbyLoc`, `NearbyNpc` and `InventoryItem`, which all publish
`optionsWithIndex` - and `ObjInfo` (`web/src/clientTypes.ts:74`) carries name, examine, cost,
stackable and noted, with no ops. **There is nothing in the Worker from which to map "Take" or
"Bury" to an ordinal.** Publishing obj ops on `GroundItem` is a collector change in `client/src`,
outside this document's scope and outside `web/src` entirely; ruling 25 declines to make it now, and
P8 as written is deliberately compatible with doing so later (the option name becomes an added field
on the same bag).

The ordinal is also not free-form: `Client.interactGroundItem` rejects anything outside `1..5`
(`Client.ts:1282`) and documents "Option 1 = op[0] ... Option 3 = Take (op[2])", so the type is the
literal union rather than `number`, and the default is the only ordinal that always means the same
thing.

Sandbox: it is a named member over an action the transport already accepts, and which
`ActionExecutor.ts:309` and `Client.ts:1282` already implement, so P8 dispatches something that
works. Adding it is S10's rule in action - though see S10 for the precise version of that rule: the
dispatcher is reachable regardless, and P8's case is ergonomics, typing and a narrowed `reason`, not
impossibility. Cost: a small `web/src/tasks/botExtras.ts` (preferred over a `PATCHES.md`-noted
addition to the vendored actions layer, because the survey shows re-vendoring is a recurring cost),
then `types.ts`, `workerContext.ts`, tests. Breaking: no.
**Phase: now.**

---

**P9. `wait.resetWhen`, `wait.animation` and `wait.hp`.**
Taxonomy 8. Adopted from: unethicalite's `Time.sleepUntil(cond, reset, timeout)` and DreamBot's
`sleepUntil(cond, timeout, reset)` for the re-arming timeout, with DreamBot's documented
always-true-reset footgun carried into our doc comment; OSBot's `ConditionalSleep` for the idea that
a wait is configurable. Adapted: an options field rather than a third positional argument (S4), and
no subclassing (OSBot's ceremony buys nothing in JavaScript).

```ts
until(pred: (s: WorldState) => boolean, opts?: {
  timeoutMs?: number; label?: string;
  /** Re-arms the timeout each time this fires. A predicate that is always true never times out. */
  resetWhen?: (s: WorldState) => boolean;
  /** Raced with the task signal. */
  signal?: AbortSignal;
}): Promise<boolean>;
export interface WaitAnimationOpts { id?: number; timeoutMs?: number; label?: string; signal?: AbortSignal }
export interface WaitHpOpts { belowPercent?: number; abovePercent?: number; timeoutMs?: number; signal?: AbortSignal }
animation(opts?: WaitAnimationOpts): Promise<boolean>;   // baseline captured at call time
hp(opts: WaitHpOpts): Promise<boolean>;                  // required bag, one required-ish field, per S4
```

`animation` takes a bag rather than two optional positionals. S4's grandfathering clause names four
existing members (`wait.xp`, `wait.item`, `wait.message`, `wait.dialog`) and `wait.animation` is new
in this same proposal, so it has no claim on it - and an S4 breach inside the one code block that
cites S4 in its own "Adapted" line is the worst possible place for one. Both bags are named and
exported, per S4.

**A caller's own `signal` is indistinguishable from a timeout in the return value.** Both give
`false`, because S2 resolves rather than rejects on abort. The `label` is how a reader tells them
apart in the trace, which is why every wait takes one.

Sandbox: unchanged; `untilP` already owns every subscription. Cost: `workerContext.ts` (about 40
lines), `types.ts`, tests. `wait.hp` is the primitive P12 is built on. No HELPERS coupling.
Breaking: no.
**Phase: now.**

---

**P10. `ActionReason` as a closed union at our layer.**
Taxonomy 12. Adopted from: our own discipline, applied where it is missing. `FailReason`,
`TasksErrorCode`, `HealthCondition` and `RecoveryOutcome` are all closed sets; `ActionResult.reason`
is a bare `string`, and it is the field scripts branch on most often.

```ts
export type ActionReason =
  | 'target_not_found' | 'out_of_range' | 'unreachable' | 'inventory_full' | 'not_enough_items'
  | 'not_enough_coins' | 'wrong_interface' | 'no_option' | 'timeout' | 'aborted'
  | 'partial' | 'refused' | 'no_hint' | 'char_design_open';
/** Our layer narrows `reason`; the vendored layer keeps `string`, and this is the bridge. */
export interface OurActionResult extends ActionResult { reason?: ActionReason }

/** Every other closed reason set of ours derives from this one. No condition is spelled twice. */
export type TravelReason =
  | Extract<ActionReason, 'unreachable' | 'timeout' | 'aborted'>
  | 'needs_route' | 'interrupted' | 'no_runes';
```

**`ActionReason` is the shared base, and derivation is the rule.** `TravelResult.reason` is already
a closed union (`'unreachable' | 'needs_route' | 'aborted' | 'timeout'`, `types.ts:90`) which P13
grows with `'interrupted'` and `'no_runes'`. Without a stated relation a script that branches on
`r.reason === 'unreachable'` would get a different exhaustiveness check depending on which of our
members it called, and S3's promise of "a closed `reason` union" would be two vocabularies wearing
one name. So: a multi-step result may extend `ActionReason` with conditions the base does not have,
by `Extract` plus additions as above, and **no two of our unions may spell the same condition
differently**. P20's api-shape gate can check that mechanically.

Sandbox: types only. Cost: `types.ts`, and a narrowing at each of our own producers
(`tutorial.followHint`, `travel`'s `interact` bridge, P8, P11, P12). **We do not retype the vendored
`ActionResult`**, because that is a patch every re-vendor would have to carry; the union is a
narrowing our own members satisfy, documented as such. Breaking: **at the type level only**, and
only for code that assigned an arbitrary string into one of our results.
**Phase: next.**

---

**P11. `c.retry(fn, opts)` and an `attempts` option on our own layer's calls.**
Taxonomy 12. Adopted from: WaspLib, where `attempts` is a parameter on the interaction itself
(`Hover(action, attempts=2)`, `Bank.Find(item, out, attempts=3)`), and PowBot's
`Bank.mustWithdrawItem`. Adapted: one generic helper on the context, plus the option on the small
number of our own multi-step calls where it reads better than a loop.

```ts
export interface RetryOpts<T> {
  attempts?: number;                       // default 3
  until: (r: T) => boolean;                // what counts as success; required, so the bag is required
  backoffTicks?: number | number[];        // default [1, 2, 4]; ticks, not ms, per S8
  label?: string;
  signal?: AbortSignal;
}
retry<T>(fn: () => Promise<T>, opts: RetryOpts<T>): Promise<T>;
```

The bag is named and exported, and it carries one required field, which S4 permits because the call
is meaningless without it and the bag is therefore a required argument rather than an optional one.

**How the four retry mechanisms compose, stated once.** After this document there are four:
`Task.maxAttempts` (declarative, runner-owned), `Task.cooldownMs` (P19), `c.retry` (script-owned),
and the recovery ladder's occurrence budget. The rule is that **`c.retry` lives entirely inside one
task attempt**: its backoff counts against the task's `timeoutMs`, its attempts do not touch
`maxAttempts`, and it returns rather than retries once the signal aborts. P19 states the other half:
a `cooldownMs` skip is not an attempt and does not reset the ladder. Without these two sentences a
script that nests all three gets behaviour nobody specified, in the machinery section 3.1 item 2
calls our strongest asset.

Sandbox: pure composition over `wait.ticks` and the signal. It aborts between attempts, so a stop is
never delayed by a backoff. Cost: about 40 lines in `workerContext.ts`, `types.ts`, tests. The three
library scripts can drop hand-written retry loops, which touches their fork seeds but **not**
HELPERS, since `c.retry` is a context member. Breaking: no.
**Phase: now.**

---

**P12. Threshold-driven consumables in `HealthPolicy`.**
Taxonomy 6. Adopted from: Microbot's `eatAt(percentage)`, `drinkPrayerPotionAt(points)` and
`drinkCombatPotionAt(skill)`, which push the "when" into the call; WaspLib's category-level
`Consume(skill)` and `CanConsume` rather than hardcoded item names. Adapted: our machinery already
has the right home for it, so this is a **policy** field the health monitor honours, not a new
imperative call. That keeps the survey's expectation 36 (framework-owned recovery) rather than
adding a per-script chore.

```ts
interface HealthPolicy {
  // ... existing fields ...
  /** Eat when hitpoints fall below this percent. Off when unset. Uses the best food carried. */
  eatBelowPercent?: number;
  /** Item names, in preference order, treated as food. Defaults to what the engine marks edible. */
  food?: string[];
  /** Drink a prayer restore below this many prayer points. Off when unset. */
  restorePrayerBelowPoints?: number;
}
// and the S8 fix this proposal carries, per section 3.2 item 16:
interface ScriptManifest {
  /** Absolute hitpoints. The run ends below this. */
  hardStop?: { hpBelowPoints?: number; /** @deprecated Use hpBelowPoints. Removed in api 3. */ hpBelow?: number };
}
```

**The units have to be fixed in the same change that creates the collision.** `hardStop.hpBelow` is
absolute hitpoints today (`runner.ts:130`, and the three bundled scripts set `{ hpBelow: 3 }`). Ship
`eatBelowPercent` beside it unamended and a script author reads `hardStop: { hpBelow: 3 }` next to
`health: { eatBelowPercent: 40 }` next to `restorePrayerBelow: 20` with no way to know which of the
three is a percentage - which is S8's own non-compliant example, `{ hpBelow: 0.4, eatAt: 40 }`,
assembled from real fields. S8 grows a `Points` suffix for absolute game quantities; this proposal
adds `hpBelowPoints` and `restorePrayerBelowPoints`, deprecates `hpBelow` per S12, and migrates the
three library scripts in the same commit.

Sandbox: implemented as a new `low-hp` **recovery task** on the existing ladder rather than as
background behaviour, so it is entered, traced, timed and attempt-counted like every other recovery,
and so a script that would rather handle it keeps `Task.recovers: ['low-hp']`. This is a real
behaviour change: `low-hp` is deliberately non-recoverable today. It becomes recoverable **only when
`eatBelowPercent` is set**, which keeps the current default exactly as it is, and `hardStop.hpBelow`
still ends the run underneath it. Cost: `types.ts`, `health.ts`, `healthMonitor.ts`, `recovery.ts`
and four test files, all of which are the most carefully argued code in the tree and should be
touched by someone who reads `healthMonitor.ts:32` first. Breaking: no, given the opt-in default.
**Phase: next.**

---

**P13. Teleports and run energy in `travel`.**
Taxonomy 4. Adopted from: rs2b0t's `Traversal.pureWalk` versus `Traversal.withTeles` split and its
separately named `walkResilient()`; Microbot's `toggleRunEnergy`/`hasStaminaActive`; PowBot's
`Movement.builder(...).setRunMin/Max()`. Adapted: as `TravelOpts` fields rather than a second
namespace, because `travel.to` already returns a typed result and already splits legs.

```ts
interface TravelOpts {
  tolerance?: number; maxLegs?: number; timeoutMs?: number;
  /** Cast a teleport when one lands closer than walking. Off by default: it costs runes. */
  allowTeleports?: boolean;
  /**
   * Hysteresis band, not one boundary: run goes on at or above the first and off below the second.
   * Setting only one implies the other at a 15-point spread. Unset leaves run as it is.
   * One threshold flaps: a character hovering on it toggles run every leg, spending a click and a
   * round trip each time, which is why PowBot has `setRunMin`/`setRunMax` rather than one number.
   */
  runOnAbovePercent?: number;
  runOffBelowPercent?: number;
  /** Stop early when this fires, and report `reason: 'interrupted'`. Adopted from PowBot. */
  walkUntil?: (s: WorldState) => boolean;
}
```

Sandbox: teleports are `castSpell` calls the SDK already exposes; run toggling is
`sdk.sendWalk(x, z, running)` and the run-toggle component. No new capability - **but "already
reachable" is not the same as reachable from `travel`, and this is the design decision inside the
proposal.** `createTravel` cannot see `sdk`: `TravelDeps` (`travel.ts:38`) is
`{ state, bot: { walkTo }, atlas, collision, status, interact, signal, now }`, where `bot` is
deliberately narrowed to a single `walkTo(x, z, tolerance?)` method, while `sendWalk` is on `BotSDK`
(`sdk/index.ts:501`) and `castSpell` is on `BotActions`. Widening that dep is the decision; do it
explicitly, adding exactly `sendWalk`, `castSpell` and an inventory read for the rune check, and say
in `TravelDeps`'s comment why the narrowing was there. Cost: `travel.ts` (the largest single change
in this list, roughly 120 lines: a teleport table keyed to the four `Spells` component ids, a cost
comparison against the walk distance, a rune check before committing, and the `walkUntil` race),
`types.ts`, `web/src/agent/workerContext.ts` (where `createTravel` is constructed and where `sdk`
and `bot` are in scope), `atlas.ts` (teleport landmarks are already an `AtlasLandmark` kind), and
`travel.test.ts`. `TravelResult.reason` gains `'interrupted'`
and `'no_runes'`. Breaking: no, since every field is optional and defaults to today's behaviour.
**Phase: next.**

---

**P14. `c.dialog` - a named dialogue namespace.**
Taxonomy 7. Adopted from: OSBot's `completeDialogue(String... options)` driving a whole tree to
completion by matching option text, which the OSBot survey calls the best higher-order convenience
it found; DreamBot's `chooseFirstOptionContaining(...)` for wording that varies by NPC state;
rs-sdk's `clickDialogByText` and `navigateDialog`; WaspLib's `ContinueUntilOption(text, timeout)`.
Adapted: an async namespace over the pieces we already have, so the index-versus-array-position
footgun (which rs-sdk's survey shows was fixed twice in two places) is never a script's problem.

```ts
dialog: {
  isOpen(): boolean;
  text(): string;
  options(): string[];
  /** Click the first option matching `sel`. Reports `no_option`, `wrong_interface` or `timeout`. */
  choose(sel: string | RegExp): Promise<OurActionResult>;
  /** Continue past text-only pages until an option appears or the dialogue ends. */
  continueUntilOption(opts?: DialogContinueOpts): Promise<OurActionResult>;
  /** Drive a whole tree: at each choice, pick the first option matching any pattern given. */
  complete(choices: (string | RegExp)[], opts?: DialogCompleteOpts): Promise<OurActionResult>;
};
export interface DialogContinueOpts { timeoutMs?: number; maxClicks?: number; signal?: AbortSignal }
export interface DialogCompleteOpts { timeoutMs?: number; signal?: AbortSignal }
```

The three verbs return `OurActionResult`, not `boolean`. Each performs a game action that can fail
for reasons P10 already enumerates - `no_option`, `wrong_interface`, `timeout` - and S3 reserves a
bare boolean for waits. A script that gets `false` from `choose` cannot tell "that option was not on
the screen" from "the dialogue was not open", which is exactly the branch a dialogue-driving script
needs. `isOpen`, `text` and `options` stay synchronous snapshot reads, per S2.

Sandbox: composed from `sdk.clickDialogByText`, `sdk.sendClickDialog` and `wait.dialog`, all
existing. Cost: about 90 lines in a new `web/src/tasks/dialog.ts`, `types.ts`, `workerContext.ts`,
tests. `tutorial.clickThrough` becomes `dialog.continueUntilOption` internally and keeps its name
per S12. **Tutorial Island is the main beneficiary** and, since its stage files are landing right
now under SP4b plan task 13, this proposal must not be executed until that task is finished.
Breaking: no.
**Phase: now**, but sequenced after SP4b task 13.

---

**P15. A named interface registry, and `expectInterfaces` by name.**
Taxonomy 7. Adopted from: OSBot's marketplace rule that auto-rejects any script containing a static
widget id, which is the strongest statement in the survey that bare component numbers are a defect
rather than a style; and rs2b0t's dialogue API modelled on the game's own named menu variants.

```ts
export const INTERFACE = {
  // Each of these three is proved by the tree: constants.ts:5, and BANK_MAIN_ID / SHOP_TEMPLATE_ID
  // at client/src/vendor/rs-sdk/bot/types.ts:20,24, used at Client.ts:1465 and :1622.
  CHAR_DESIGN: 3559, BANK: 5292, SHOP: 3824,
  // Trade is re-exported from the vendored constants rather than hand-typed:
  // TRADE_SIDE_INV 3322, TRADE_MAIN_INV 3415, TRADE_MAIN_ACCEPT 3420, TRADE_CONFIRM_ACCEPT 3546
  // (web/src/vendor/rs-sdk/sdk/index.ts:43-46). Which of the four is the modal root is unchecked,
  // so none of them enters the registry under a single `TRADE` name until someone checks.
} as const;
export type InterfaceName = keyof typeof INTERFACE;
interface HealthPolicy { expectInterfaces?: (number | InterfaceName)[] }   // widened, not replaced
```

Sandbox: constants only. Cost: a new `web/src/tasks/interfaces.ts`, `types.ts`, `health.ts` (which
already prefers matching interface **text** over a component id, and that preference stays: the
registry is for the cases where an id is unavoidable), `constants.ts` (which holds
`CHAR_DESIGN_INTERFACE` today and should re-export from the registry rather than duplicate it), and
`scriptApi.ts`. The registry must be small and honest: an id nobody has verified against the 274 pin
does not go in it. **An earlier draft of this sketch listed `TRADE: 335`, which appears nowhere in
the repository and looks like an OSRS-era value** - the exact failure mode P15 exists to prevent,
inside P15. The registry's day-one contents are the three ids the tree already proves, plus the four
vendored trade constants re-exported rather than retyped. Breaking: no, since `expectInterfaces` is
widened rather than narrowed.
**Phase: next.**

---

**P16. `bank.ensure(sel, qty)` - the top-up primitive.**
Taxonomy 5. Adopted from: Microbot's `withdrawDeficit(id, requiredAmount)`, the only named top-up
primitive in the survey (expectation 15). Adapted: as a library helper rather than a context member,
because it is a composition of `openBank`, `getBankItems`, `withdrawItem` and a count, and S12's
"additions over renames" is best served by not growing `ScriptContext` for something a script can
already write in five lines.

```ts
// web/src/tasks/library/bankHelpers.ts
export async function ensure(c: ScriptContext, sel: string | RegExp, qty: number): Promise<ActionResult>;
```

Sandbox: composition over existing members only. Cost: a new helper module, tests, **and the HELPERS
coupling**: the moment a bundled library script imports it, its JavaScript twin must be inlined into
`library/index.ts:35` and pinned by `librarySource.test.ts`. That coupling is the reason this is
`later` rather than `now`: it is worth doing when a bundled script actually banks, and none does
today. Breaking: no.
**Phase: later.**

---

**P17. `createTestContext()` - a published script test harness.**
Taxonomy 14. Adopted from: rs2b0t's split of pure decision functions (`resolveBankOpenRoute`,
`planAxeAcquire`, quest `decide(snapshot)`) from effecting calls, and PowBot's `OpenQuester`, the
one sourced repo in the whole survey with real unit tests, which is also the one with that seam
(expectation 41). Adapted: we already have the machinery (`library.test.ts` drives scripts against a
scripted world sequence, `api.harness.ts` and `recovery.harness.ts` exist); what is missing is that
it is not published, and a user script cannot import anything anyway.

```ts
// web/src/tasks/testContext.ts, exported from scriptApi.ts
export function createTestContext(opts?: {
  states?: Partial<WorldState>[];          // one per simulated tick
  params?: ParamValues;
  onAction?: (a: BotAction) => ActionResult;
}): { c: ScriptContext; tick(): void; trace(): TraceEvent[] };
```

Sandbox: test-only, **never bundled into the Worker path, which is a constraint on P0 as much as on
this proposal.** `web/src/agent/worker.ts` is the module-worker entry and a value import pulls the
imported module's whole runtime export graph into that chunk, so `worker.ts` must import P0's key
record from the leaf `scriptApiKeys.ts` and never from `scriptApi.ts`, which is where
`createTestContext` lives. Cost: about 200 lines factored out of the existing harnesses, plus the
docs companion's examples gallery gaining one testing example. **The
honest limitation, which the reference must state:** a user script stored in Firestore has no module
system and cannot import this, so the harness serves library scripts, forks developed in the studio,
and anything a developer writes in the repository. Making it reachable from a user script is a
studio question, not this one. Breaking: no.
**Phase: next.**

---

**P18. `apiVersion` on the manifest, and the deprecation path.**
Taxonomy 13 and 14. Adopted from: IdleRSC's package-scoped compatibility shims, the single most
directly transferable idea in that survey; Microbot's `minClientVersion` gate; WaspScripts' ToS
clause that a script must stay runnable without the marketplace launcher. Adapted to the smallest
form that works: a number on the manifest and a small shim table, not a parallel package tree.

```ts
interface ScriptManifest {
  /** The api version this script was written against. Absent means 1: see below. */
  apiVersion?: number;
}
export const API_VERSION = 1;   // today's surface. The phase-next entry in section 5 makes it 2.
```

**An absent `apiVersion` defaults to `1`, not to the current version.** Defaulting to the current
version would declare every script written before P18 landed to have been authored against the
newest surface, so the shim table would never fire for the exact population it exists to protect,
and the mechanism would only ever help scripts written after it shipped and then hand-updated -
which is nobody. `1` is the only value that is true of a script predating the field. `userStore`
stamps `apiVersion: API_VERSION` on save, so scripts written from now on pin honestly and the
default only ever applies to genuinely old code.

**Where the shim is applied.** `compileUserScript` returns the manifest before `workerContext`
builds `c`, so the runner reads `apiVersion` off the compiled script and selects shims **before**
context construction, not after. A shim that had to wrap an already-built context would have to
re-wrap every member.

Sandbox: unchanged. Cost: `types.ts`, `defineScript.ts` (default and validate), `userStore.ts` (the
stamp on save), `runner.ts` (read it and select shims before the context is built), a new
`web/src/tasks/compat.ts` holding the shim table (empty on day one, which is the point: the
mechanism exists before the first deprecation needs it), and the docs generator's version map and
`deprecated` field. Breaking: no.
**Phase: next.**

---

**P19. `Task.cooldownMs`: implement it, or retire it.**
Taxonomy 1. Adopted from: nothing; it is dead surface the ours survey found by grep. It is declared
at `types.ts:220` and read by nothing.

Two honest options. **Implement it**: the runner skips a task whose last exit was within
`cooldownMs`, which is a real and useful thing (a task that failed a moment ago should not be
retried on the very next tick) and which the attempt ladder currently approximates badly. **Or
remove it** and say so. Either is better than a field the reference will document and nothing will
honour, which is exactly the drift SP4b plan task 15 exists to clean up.

**This proposal as first drafted recommended removal**, and **ruling 21 took the first option
instead.** That is the one place in this document where a ruling departed from the draft's own
recommendation, and it is recorded as such in ruling 21, in the reconcile report and in D31, rather
than smoothed over by rewriting the recommendation after the fact. The reason is internal
consistency: section 5's retry composition already states the other half of the implemented
behaviour ("a cooldown skip is not an attempt, and it does not reset the attempt ladder"), P11
composes against it, and the paragraph below prices the implementation at about fifteen lines. A
retirement would have left those three passages to unpick.

If implemented, it composes with the other three retry mechanisms as P11 states: **a cooldown skip
is not an attempt, and it does not reset the attempt ladder.** A task skipped for being on cooldown
has not run, so counting it would let a cooldown quietly consume `maxAttempts`, and resetting the
ladder would let a task with a cooldown retry forever.

Sandbox: unchanged. Cost, if implemented: about 15 lines in `runner.ts`, one test. Cost, if removed:
one line and a note. Breaking: removal is a type-level break for any script that set it, and grep
says none does.
**Phase: now.**

---

**P20. The standard becomes lintable.**
Taxonomy 14. Adopted from: Microbot's `AGENTS.md`, which encodes the cache-singleton rule, the
threading rule, the wait-primitive rule and a review-severity triage specifically for coding agents,
and which is the closest thing in the survey to what we need given that Claude writes scripts here
(expectation 43); OSBot's SDN rules, which double as API lint; rs2b0t's runtime watchdog against a
bare `await`.

This proposal produces no runtime code. It produces the machine-checkable form of section 4, which
the studio's validator consumes:

```ts
// web/src/tasks/standard.ts
// Two shapes (D28), because the standard's clauses and the lints that enforce them are not the same
// set: one clause is enforced by several lints, one lint (`no-static-widget-id`) cites a clause
// and a proposal, and three lints are advisory rather than blocking. Collapsing them into one
// list is what made the first draft's type unable to express the studio spec's own rule table.
export interface StandardRule { id: `S${number}`; title: string; severity: 'error' | 'warn'; }
export const STANDARD: StandardRule[];            // the twelve clauses of section 4

export interface LintRule {
  id: string;                                     // the studio's kebab-case lint id
  standard: StandardRule['id'] | StandardRule['id'][];  // the clause or clauses it enforces
  severity: 'error' | 'warn' | 'info';            // `info` is advisory: it blocks nothing
}
export const LINTS: LintRule[];                   // the studio spec's section 8.2 table
```

**The severity vocabulary is `error`, `warn` and `info`, spelled exactly that way in both
documents.** The studio spec's section 8.2 previously spelled the middle tier "warning" in prose
while this module spells it `warn`; the agreement test compares strings, so it would have failed on
the spelling alone. `info` exists because three of the studio's fourteen lints (`untrusted-text`,
`wait-until-needs-label`, `manifest-has-description`) are advisory and the two-value union above
could not hold them.

The studio spec's section 8.2 already declares ten V2 rules and covers six of section 4's clauses.
This proposal adds the two things it does not have: **one shared declaration** both the reference and
the validator read, on the model of that spec's own `web/src/tasks/forbidden.ts` (one list, four
consumers, one test asserting they agree); and **four rules it is missing**, each a lezer-tree walk
of the same shape as its existing ten:

| Rule | Severity | Standard | Message |
|---|---|---|---|
| `no-static-widget-id` | warn | S5, P15 | a bare component number breaks on a content bump; use the `INTERFACE` registry |
| `no-legacy-wait` | warn | S7 | `sdk.waitFor*` throws on timeout and ignores the abort signal; use the `c.wait` equivalent |
| `no-captured-signal` | warn | S2 | `c.signal` is a getter; the runner swaps it between tasks, so a cached copy misses your own task's abort |
| `no-deprecated-member` | warn | S12 | carries the generator's own `deprecated` string, so the rule needs no list of its own |

Severities follow Microbot's triage idea: rules whose breach causes silent wrong behaviour are
errors, the rest are warnings. Section 6.3 records the one place this document and the studio spec
disagreed on a severity, and how it was settled: `no-fixed-sleep` is an error blocking Run.

**Two honest limits on "lintable", both stated rather than glossed.**

First, **five of the twelve rules have no enforcement point**, and they are five the owner's request
is specifically about. Here is the whole map, so a reader can see which rules are gates and which
are promises:

| Rule | Enforced by |
|---|---|
| S1 naming | api-shape gate below, partially; review checklist for the rest |
| S2 async and cancellation | studio `no-captured-signal`; api-shape gate for the `signal` field |
| S3 results versus exceptions | review checklist only |
| S4 positional and options shape | api-shape gate below |
| S5 query and filter style | studio `no-static-widget-id` |
| S6 events | review checklist only |
| S7 waiting | studio `no-legacy-wait`, `no-fixed-sleep` |
| S8 units and coordinates | api-shape gate below |
| S9 nullability | api-shape gate below |
| S10 sandbox | studio `no-transport-escape`, `no-forbidden-globals`, `no-eval`, `no-dom`, `untrusted-text` |
| S11 documentation | docs companion gate 2, over our own declarations; studio `manifest-has-description` (info), over a script's own manifest |
| S12 versioning | studio `no-deprecated-member`; docs generator's version map |

Second, **every studio rule lints script code, and the standard binds our own declarations.** A lint
that catches a player writing `sleep(600)` catches nothing about us shipping
`animation(id?, timeoutMs?)`. So P20 adds one more artefact:

```ts
// web/src/tasks/scriptApi.test.ts - an api-shape gate over the same ts.Program the docs
// generator already builds for scriptApi.ts. Every assertion below is mechanical:
//  S4  no parameter of type `boolean` in a positional slot
//  S4  at most one required positional before an options object, outside the three carve-outs
//  S4  every options parameter's type is a named exported interface, not an inline literal
//  S9  no exported member whose return type includes `undefined`
//  S8  every numeric parameter or field name matches /Ms$|Percent$|Fraction$|Points$|Ticks$/
//      or carries a unit in its doc comment
//  S8  every positional coordinate parameter is typed `TileLike`
//  S1  no `get`/`fetch` prefix; no member name in the abbreviation list; new unions are snake_case
```

That is the piece that makes section 4 bind the thing it is about. It costs one test file, it reuses
a program the docs entry already builds, and the carve-out list it needs is exactly S4's closed
three.

Sandbox: none. Cost: one small module, one test file, plus the docs page; **the studio owns the
implementation** of the fourteen script-side rules. Breaking: no.
**Phase: now** for the module and the prose; the linting is the studio's entry.

---

### 5.1 Proposals by phase

| Phase | Proposals | What "phase" means here |
|---|---|---|
| **now** | P0, P4 (type and overload), P7, P8, P9, P11, P14, P19, P20 | Rides with the API docs entry and the studio entry. Nine changes, all additive: P19 is implemented rather than retired (ruling 21), which is the one place a ruling departed from the proposal's own recommendation. None needs its own row |
| **next** | P1, P2, P3, P5, P6, P10, P12, P13, P15, P17, P18 | Eleven changes that need their own sprint row. P5 must land after Shell v2; P12 touches the most carefully argued code in the tree |
| **later** | P16, and P4's deprecation removal | Deferred until something needs them |

## 6. Sprint placement, and the two companion drafts

### 6.1 Placement

**Recommendation: this document does not become a sprint row.** It is an authority document, like
the SP4 and SP4b design specs it extends. Its content lands in two places:

- The **phase-now proposals and section 4 itself** attach to the API docs entry, which
  `2026-09-07-script-api-docs-design.md` section 12 recommends as **entry 3**, after Shell v2 and
  before SP8c. They become that entry's first task, ahead of the nine worked examples, because an
  example written before P8, P9, P11 and P14 land is an example that demonstrates an idiom we are
  about to replace and that gate 4 will then hold in place.
- The **phase-next proposals** become one new row, "Script API v2 surface", after the studio. Eleven
  changes, of which nine are purely additive, one changes default-off behaviour (P12) and one
  narrows a type (P10), is a coherent entry, and every one of them is better specified once the
  reference exists to document it and the validator exists to enforce the standard on it.

The sequence this produces, against `2026-09-07-sprint-dragon-slayer.md` section 2:

| # | Entry | Change |
|---|---|---|
| 1 | SP4b | unchanged, still in flight, still nothing starts until it lands |
| 2 | Shell v2 | unchanged |
| 3 | Script API reference | as its own spec recommends, **with section 4 and the phase-now proposals as its first task** |
| 4 | Script studio | as its own spec now rules, with P20's lints as a deliverable |
| 5 | **new: Script API v2 surface** | the phase-next proposals |
| 6 onward | SP8c (6), Time candy (7), Battlebots (8), SP9 (9), **SP3b** (10, inserted by D14), SP10 (11), SP4c (12), SP5 (13) | renumbered once, and SP3b is the fourth insertion, so the tail moves by three above SP10 and by four below it |

Two constraints that are not negotiable and one that is.

**Not negotiable: nothing here starts before SP4b lands.** SP4b plan tasks 9 to 15 are changing
`types.ts` right now (task 10 adds three fields to `RunStatus`, task 11 adds five to `RunSummary`,
task 15 reconciles the `DeathBehaviour` drift). The docs entry makes the same argument, and P14 is
specifically blocked on task 13's Tutorial Island stage files.

**Not negotiable: P5 lands after Shell v2.** The overlay's rows have to render somewhere, and the
panel that renders them is being redesigned. Building it first is building it twice, which is
exactly the argument the sprint used to move Shell v2 to second.

**Negotiable: whether the standard waits for Shell v2 at all.** Section 4 is prose and the phase-now
proposals ship no UI, so they could run at position 2, ahead of Shell v2. Recommendation is that
they do not, for one reason: SP4b plan task 15 is "reconcile the spec with what shipped", and the
survey found three live drifts for it to reconcile (`memory` is not serialised into snapshots;
`hardStop.onDeath` became the far richer `HealthPolicy`; `exportRun` and four `RunSummary` fields are
specified and absent). Letting task 15 finish against today's surface, and then applying section 4
to the result, means reconciling once. Ruling 14 records the alternative and declines it.

### 6.2 The API docs draft: interlocks, and one conflict

`2026-09-07-script-api-docs-design.md` exists as of this writing and was read in full. It is
compatible. Two things interlock cleanly, and one needs a change on their side:

- Its `web/src/tasks/scriptApi.ts` re-export entry and its gate 6 `Record<keyof ScriptContext, true>`
  harness are exactly the mechanism P0 needs, so P0 is a two-line addition to that entry rather than
  a new idea.
- Its `ApiMember.deprecated?: string` is exactly what S12's deprecation path needs to render, and
  S12 should be read as specifying the **policy** whose **mechanism** that spec already builds.
- **The one thing to change: `since` currently speaks a different language from S12.** That spec is
  explicit that `since` "is not invented. It is read from a small hand-maintained map inside the
  generator, keyed by member path" - and its values are sprint labels (`'SP4a'`, `'SP4b'`), not api
  numbers, and it does not parse `@since` from a doc comment at all. P18 then introduces a third
  vocabulary, `apiVersion: number`. Three vocabularies for one fact means a member's `since` column
  says `SP4b` while its removal window is counted in api versions, so the reference cannot answer
  "what api version is this member from", which is the question S12's two-version removal window
  depends on. **Resolved: the map's values are api versions.** The docs spec's section 3.2 now
  says so, and S12 above drops `@since` from its step 1 and names that map as the single source,
  so there is one vocabulary for one fact and **S12 owns it**. The mechanism stays theirs and the
  policy stays ours.
- Its section 4 prose page list already carries four of section 4's rules (no fixed sleeps, `bot.*`
  observes and `sdk.send*` dispatches, game text is untrusted, what a script cannot reach). Section 4
  here is the complete set those pages should render, and `06-limits-and-trust.md` is the natural
  home for S10.

**One conflict, and it is small, and it is closed.** That spec's gate 2 requires a non-empty doc
comment on every member we own, and reports coverage without failing for vendored members (its
ruling 6). S11 as first drafted said "every member has a doc comment", which would have
contradicted it. **S11 is written to adopt that spec's ruling 6 unchanged**, and this document
defers to it rather than proposing a second policy. No change was needed on their side.

**And one thing that spec now does rather than restates.** Its section 4 previously enumerated six
rules of its own, four of which were section 4's clauses in different words. It now names this
document's section 4 as the standard and describes what the prose pages must render **by
reference**, which is what keeps S1 to S12 stated once. The seven pages, their markdown subset and
the six gates stay entirely theirs.

**One thing that spec should absorb if both are approved:** its nine worked examples and its
`00-quickstart.md` should be written after the phase-now proposals land, or they will demonstrate
`c.state().nearbyNpcs.filter(...)` where `c.world.npcs()` is coming, and gate 4 will then keep that
example compiling forever.

### 6.3 The studio draft: interlocks, and one real conflict

`2026-09-07-script-studio-design.md` landed on disk while this document was being written and was
read at that point. It proposes **entry 4**, after Shell v2 and after the reference, which is
exactly the sequence section 6.1 recommends, so there is no placement disagreement.

Its section 8 is the enforcement half of section 4, and it is better than what P20 sketched: four
validation tiers at four prices (V0 syntax off the lezer tree, V1 shape through the Worker's
existing `compile` message, V2 structure as ten rules, V3 types in a separate opt-in worker), with
the load-bearing sentence "no second evaluator is created anywhere". Three interlocks are clean:

- Its V2 rules `no-transport-escape`, `no-forbidden-globals`, `no-eval` and `no-dom` are S10 made
  checkable, and its section 15.2 closes the ambient-globals hole that S10 explicitly does not cover.
- Its `untrusted-text` rule is the "game text is data" clause of S10.
- Its completion source reads Spec A's `api-index.json`, which is the same artefact S12 leans on.

**Four things the studio should absorb.**

1. **Consume the rule list rather than restating it.** Its ten V2 rules are declared in its own
   section 8.2. P20 proposes `web/src/tasks/standard.ts` as the one statement of them, read by the
   validator and rendered by the reference. Without that, the standard and the linter are two
   documents that can disagree, which is the failure the docs spec's gate 1 exists to prevent one
   layer up. Its own `web/src/tasks/forbidden.ts` (one list, four consumers, one test asserting
   they agree) is precisely the right precedent to extend.
2. **Four lints this standard needs are missing from its ten:** a bare numeric widget id (S5 and
   P15, and the rule OSBot auto-rejects submissions over); use of the vendored `sdk.waitFor*` family
   where `c.wait` exists (S7, because the two have opposite error contracts); a captured `c.signal`
   rather than the getter (S2, and the exact bug SP4a paid for once); and use of a member the
   generator marks `deprecated` (S12, which is what makes the deprecation path work at all). All
   four are lezer-tree walks of the same shape as the ten it already has.
3. **Its completion source should surface `deprecated`.** Section 8.3 lists members and doc comments
   from `api-index.json` and does not mention the `deprecated` field the generator emits. A
   completion that offers a deprecated member without saying so actively works against S12.
4. **Its templates must follow S1.** Anything the studio scaffolds (New script, the fork seed, the
   snippet console's starting text) is the first API a player reads, and it should not invent its own
   naming.

**The one real conflict, now settled: `no-fixed-sleep` severity.** The studio spec's draft made it a
**warn**, and its V2 warnings block neither Save nor Run; that spec now carries **error**, blocking
Run. S7 treats a fixed sleep as the rule the survey supports most strongly of any, and the props are
worth stating exactly rather than loosely, because this was the one disagreement between the two
documents and it was settled on the evidence below rather than by seniority. It was **not** escalated
to the owner: ruling 23, four paragraphs down, decides it, and section 8 records that this document
no longer asks the question it used to ask here.

- **Microbot** makes it non-negotiable in the agent contract its coding agents work under
  (`AGENTS.md`, verbatim: "Never use static sleeps to wait for game state - use
  `sleepUntil(condition, timeoutMs)`"). Its own severity triage would file a breach under "script
  loop timing", which is **P1**, not P0; the P0 entry is the separate and adjacent rule about
  blocking the client thread. Expectation 22 carries the full triage text.
- **PowBot**'s published guide frames a fixed sleep as an anti-pattern.
- **rs2b0t** enforces it at runtime, with a watchdog against a bare `await`.
- **OSBot** auto-rejects marketplace submissions that "fail to consider ConditionalSleeps". Its
  neighbouring rule about the width of a randomised sleep band is **not** evidence for this claim
  and is not cited for it: that one is an anti-ban humanisation rule, sitting on the same list as
  the entries about advertising "human" movements, and it presupposes that `sleep(random(a,b))` is a
  legitimate idiom, policing only the band's width. Citing it here would also breach section 3.3's
  own line that anti-detection is recorded once and never again.

Twelve of the nineteen surveyed systems make a condition-plus-timeout wait the sanctioned
primitive.

**Ruled, under D11, and the studio spec is amended to match: `no-fixed-sleep` is an error that
blocks Run and not Save** (ruling 23), matching the tier the studio already uses for `no-eval` and
`no-await-in-when`. A draft may contain a fixed sleep; a run may not. The studio ships a quick fix
for this rule already, which makes an error severity cheap to comply with rather than punitive, and
its section 8.2 now carries the error severity with a citation back to this section. S7 therefore
keeps its full strength and needs no softening: the standard's strongest rule is the one the
validator enforces hardest. The owner can reverse this by moving one severity and softening S7's
first sentence in the same edit; the two must move together, because a standard whose strongest
rule the validator declines to enforce is not a standard.

**Three of the four absorptions above are now made rather than requested**, so a reader is not left
to wonder who acted: `web/src/tasks/standard.ts` is named in the studio's section 8.2 as the one
declaration both the reference and the validator read, the four missing lints are in its rule
table, and its completion source surfaces `deprecated` (its section 8.3). The fourth, that studio
templates follow S1, is recorded in its section 9.1.

## 7. Rulings, for the record

Each decides a question the survey raised rather than escalating it. Section 8 restates the ones
worth overturning, and section 8 maps each question this document used to ask onto the ruling that
settled it.

1. **Additions over renames, everywhere.** A better name is never worth a broken saved script, and
   the deprecation path in S12 is three steps and two api versions long. *Cost if wrong: the API
   carries two names for one idea until the second is removed, and the reference has to say which is
   preferred. Cheap, and reversible.*
2. **The Worker has no canvas, so paint is data**, and **the data rides the run status, not the
   trace.** P5 publishes named rows the host renders, as a keyed last-write-wins map on the status
   object, with one end-of-run snapshot written to the trace for export and replay. A per-tick
   `TraceEvent` variant would not coalesce (`Trace.coalesce` merges only against the immediately
   preceding event) and would evict roughly 3000 real events from a 5000-event buffer over a
   thirty-minute run. *Cost if wrong: a scripter who wants to draw a tile highlight cannot, and we
   would need a host-side "highlight this tile" primitive, which is a strictly larger change than P5
   and can be added later on top of it.*
3. **`c.wait` is the only sanctioned wait; the vendored `sdk.waitFor*` family stays reachable and is
   documented as legacy rather than removed.** *Cost if wrong: two vocabularies with opposite error
   contracts stay in one namespace, which is the exact inconsistency section 3.2 item 9 names.
   Removing them instead means a `PATCHES.md` entry carried through every re-vendor, which the survey
   shows is a recurring cost at every project that forks upstream.*
4. **The event map is ours, closed and typed, and is never the raw `HookEvent` stream.** *Cost if
   wrong: about 150 lines of diffing in `events.ts` that a passthrough would not need. The
   alternative leaks transport-shaped data into script code and makes every transport change a
   breaking API change.*
5. **One coordinate shape, `Tile { x, z, level }`.** *Cost if wrong: a migration across `travel.ts`,
   `find.ts` and `atlas.ts` later, which is exactly the migration P4 does now while there are three
   library scripts rather than thirty.*
6. **Timeouts are data, never exceptions, everywhere in our layer.** *Cost if wrong: none
   identified. It is already true and the survey's thirteen-system majority agrees.*
7. **`ActionReason` narrows our own results only; the vendored `ActionResult.reason` stays
   `string`.** *Cost if wrong: a reader sees a closed union at our layer and an open one below it,
   which the doc comment has to explain. Retyping the vendored interface instead is a patch every
   re-vendor carries forever.*
8. **Persisted script state is scoped to `(uid, characterId, scriptId)`, capped host-side, and the
   script never touches Firestore.** *Cost if wrong: a script that wants cross-character state
   cannot have it. That is a deliberate reading of the sandbox rule: cross-character state is the
   owner bank's job, not a script's.*
9. **`low-hp` becomes recoverable only when `eatBelowPercent` is set.** The current default is
   unchanged, and `hardStop.hpBelow` still ends the run underneath it. *Cost if wrong: a script that
   sets the field and carries no food loops on a failing recovery until the occurrence budget ends
   the run, which is the ladder working as designed rather than a new failure.*
10. **No Grand Exchange, no market, no camera, no anti-detection surface, ever.** All four are
    structurally inapplicable to a rev 274 world we own, and each is recorded once so a later session
    does not re-derive it. *Cost if wrong: none. Adding a member later is cheaper than carrying dead
    surface.*
11. **The snippet destructuring list is generated from the declared surface (P0), from a leaf module
    the Worker can import without pulling the test harness in.** This is preventive: at `1bfdc7d`
    the hand-maintained list and `ScriptContext` agree exactly, on all fourteen members. *Cost if
    wrong: it stays hand-maintained, and the next context member is silently invisible to
    `api.execute` with nothing complaining.*
12. **A missing action is closed by adding a named member, never by writing a member that hands a
    script `Transport.dispatch`.** P8 is the first application. The rule binds what we ship, not what
    is reachable: `c.sdk.transport.dispatch(...)` works today, because `BotSDK` holds its transport
    as a parameter property and the SDK is constructed over the scoped object, and the enforcement is
    the studio's `no-transport-escape` lint rather than the shape. S10 and section 3.3 both say so
    plainly rather than claiming a boundary we do not have. *Cost if wrong: one small wrapper per
    missing action, which is the price of the sandbox and is most of the sandbox.*
13. **Ground items are the one documented exception to "never a raw menu index" (S5), until the
    collector publishes obj ops.** `GroundItem` carries no option text, so there is nothing in the
    Worker to match "Take" against; P8 therefore takes `opIndex?: 1|2|3|4|5`, defaulting to 3, which
    is the ordinal `Client.ts:1278` documents as Take. The exception is named in the doc comment, in
    S5 and here, so it stays one exception rather than becoming a precedent. Ruling 25 declines to
    close it with a `client/src` collector change for now. *Cost if wrong: scripts read
    `{ opIndex: 3 }` where they should read `'Take'`, and a later collector change turns that into a
    deprecation rather than a break, because the option name is an added field on the same bag.*

14. **This document is not a sprint row.** Section 4 and the phase-now proposals become the first
    task of entry 3, the script API reference, ahead of its nine worked examples; the phase-next
    proposals become entry 5, "Script API v2 surface", after the studio, with section 5 of this
    document as that row's authority. *Cost if wrong: a fourth near-adjacent script row that buys
    nothing, since the standard has no deliverable a plan can execute except the phase-now set. The
    alternative of running the phase-now set at position 2, ahead of Shell v2, was rejected because
    SP4b plan task 15 reconciles the spec against a surface that would then change again.*
15. **No cross-account script sharing, ever, on the current trust model.** Firestore documents are
    owner scoped, the only marketplace is of our own bundled scripts, and heading 13's permissions
    manifest, signing story and conservative deprecation policy are therefore all unnecessary. The
    reference states it on `06-limits-and-trust.md` and the studio states it in its section 15.6,
    because a player and an agent both need to know it before they write anything. Ruling 26 makes
    it a precondition rather than a preference. *Cost if wrong: P18's deprecation path becomes a
    calendar promise instead of one shim table, and a permissions manifest becomes real work. Every
    marketplace in the survey distributes full-trust native code, so there is no prior art to copy
    for the safe version.*
16. **The overlay is P5's data rows on the run status, rendered by the run banner's successor, with
    `trackXp` and `trackItem` auto-diffing.** *Cost if wrong: no host-side "highlight this tile"
    primitive, which is what WaspLib's `debug` parameters give and which needs a canvas overlay in
    the shell. It can be added on top of P5 later; P5 cannot be added on top of it.*
17. **The persisted-state budget is 32 keys and 16 KB per `(character, script)`**, mirroring the
    spirit of the existing 64 KB code cap, with an over-cap write resolving `{ ok: false, reason:
    'too_large' }` and a warn line in the trace rather than throwing. *Cost if wrong: a script that
    wants a bigger checkpoint reads and writes one opaque blob instead. No cap at all is the one
    thing S10 most obviously forbids.*
18. **`createTestContext` (P17) is published, with its limitation stated plainly in the
    reference:** it serves library scripts, forks developed in the studio, and repository code, and
    a user script stored in Firestore cannot import it because there is no module system inside
    `new Function`. *Cost if wrong: about 200 lines factored out of harnesses that already exist,
    and one more example in the gallery. Exposing it on `c` under a test flag would put test
    scaffolding inside the production sandbox and is worse than the problem.*
19. **`c.bot` and `c.sdk` keep their names.** The names are accurate, rs-sdk's own README documents
    the distinction, and a rename breaks every saved script, every fork seed and the HELPERS block.
    The inconsistency is answered by documentation (the reference's `bot.*` observes / `sdk.send*`
    dispatches page) and by the `no-legacy-wait` lint. *Cost if wrong: two APIs with two error
    contracts stay in one namespace, which section 3.2 item 9 names and which the lint now marks at
    the call site.*
20. **Every options bag section 5 introduces carries `signal?: AbortSignal`**, raced with the task
    signal, and not only `wait.until`. `c.on` takes it the way `addEventListener(type, fn,
    { signal })` does. The consequence a caller must know is stated in S2 and P9 rather than left
    to be discovered: because S2 resolves rather than rejects, a cancelled await and a timed-out
    await are the same value, and the trace label is what separates them. *Cost if wrong: a field
    and a race per member. Keeping only the implicit task signal means a script cannot cancel its
    own sub-operation, which the ours survey already names as a gap.*
21. **`Task.cooldownMs` is implemented, not removed (P19).** A task that failed a moment ago should
    not be retried on the very next tick, and the attempt ladder approximates that badly. It
    composes as P11 states: a cooldown skip is not an attempt and does not reset the ladder. *Cost
    if wrong: about fifteen lines in `runner.ts` and one test for a field nothing sets yet.
    Removing it instead is one line, and leaves `c.retry` as the only backoff a script has.*
22. **`apiVersion` (P18) ships with an empty shim table.** The mechanism costs about forty lines
    now; introducing it during the first deprecation means introducing it while it is also the
    thing under test. An absent `apiVersion` defaults to `1`, never to the current version. *Cost
    if wrong: forty lines and a `compat.ts` with nothing in it, which is the point.*
23. **A fixed sleep is an error that blocks Run and not Save.** This is the one disagreement with
    the studio draft (section 6.3) and it is resolved in this document's favour; the studio spec's
    section 8.2 now carries the error severity and cites section 6.3 for it. S7 keeps its full
    strength and is not softened. A draft may contain a fixed sleep, a run may not, and the studio
    already ships the quick fix that makes complying cheap. *Cost if wrong: S7 must be softened to
    "discouraged" in the same edit that lowers the severity, because a standard whose strongest
    rule the validator declines to enforce is not a standard. Blocking Save as well would be
    stricter than anything in the survey and would stop a player saving a half-written draft.*
24. **The survey is enough to decide section 4 and no second pass is run.** Two rows are weak
    (eliza-2004scape, which could not be verified to exist and is excluded from every denominator,
    and PowBot's unreachable marketplace and sentiment) and neither changes a proposal; the one
    genuine miss, `dginovker/LostCityClientBot`, was closed during review. Storm Client, Inubot,
    OSMB, SRL-T and the Kotlin-era TRiBot SDK stay uncovered, each with a reason recorded in
    section 1. *Cost if wrong: an hour re-running two hosts, returning the same expectations a
    third time.*
25. **The client-side collector is not changed to publish obj ops on `GroundItem` now.** P8 ships
    the op ordinal, ruling 13 records it as S5's one documented exception, and a later collector
    change is a pure addition that turns the ordinal into a deprecation rather than a break. A
    `client/src` change while SP4b is landing on this branch is not worth the consistency. *Cost if
    wrong: scripts read `{ opIndex: 3 }` where they should read `'Take'`, in the one place the
    standard grants an exception and names it three times.*
26. **A Worker-resident script is trusted as the account's own code, and the guardrails are named
    as guardrails (audit C30).** S10 above carries the full statement: the forged-RPC path and the
    ambient `fetch` and `import()` are real, the scoped swap and the `forbidden_api` scan and the
    `no-transport-escape` lint are guardrails against accidents rather than a boundary, no
    cross-account sharing exists, and any future sharing or relay of another account's code carries
    this as an explicit precondition on that entry's scope line. Recorded as decision D24. *Cost if
    wrong: the alternative the audit offers, dropping `relogin` and `logout` from `RpcMethod` and
    giving recovery its own message, is still forgeable from inside the Worker, so it buys the
    appearance of a boundary and not one. The honest statement is cheaper and truer, and it is what
    makes SP4c's precondition legible.*

## 8. Questions this document no longer asks

All twelve owner questions this document raised are ruled in section 7 under D11, and each ruling
carries the alternative it declined and what reversing it costs, so nothing is lost by the section
no longer being a list of open questions. **Every one took the recommendation the draft made**;
there is no departure to flag.

| Was question | Subject | Ruled at |
|---|---|---|
| 1 | Sprint placement | ruling 14 |
| 2 | Cross-account script sharing | ruling 15 |
| 3 | The shape of the overlay | ruling 16 |
| 4 | The persisted-state budget | ruling 17 |
| 5 | Publishing `createTestContext` | ruling 18 |
| 6 | Renaming `c.bot` and `c.sdk` | ruling 19 |
| 7 | An explicit `signal` on our awaitable members | ruling 20 |
| 8 | `Task.cooldownMs`, implement or remove | ruling 21 |
| 9 | Shipping `apiVersion` before there is a shim | ruling 22 |
| 10 | Fixed sleep: error or warning | ruling 23 |
| 11 | Whether the survey warrants a second pass | ruling 24 |
| 12 | A collector change for obj ops on `GroundItem` | ruling 25 |

One ruling has no question behind it because it came from elsewhere: ruling 26 settles audit C30,
whose statement lives in S10.
