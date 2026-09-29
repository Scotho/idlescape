# Idea: Battlebots improvements

Recorded: 2026-09-07, from the owner
Status: brainstorming (round two rulings below, 2026-09-07; handoff sent to the orchestrating session)
Touches: sprint entry 11 (battlebots, plan `2026-09-07-spbb-battlebots-minigame.md`), entry 13
(SP3b hiscores), entry 17 (SP5, the headless runner), the shell v2 window family (entry 4)

## The idea, in the owner's words

- Players should be able to queue themselves into matches and log out if they want.
- Matches no longer use real player characters. When two bots queue with a selected script and
  gear set on a character, that data is stored as a persistent record and matches are simulated
  against that setup.
- A player is kicked out of the queue when they lose a match or when they leave manually.
- The leaderboard also contains win streaks, and maybe an in-game reading.
- Matches can be viewed live and replayed from a file at a later date, through a UI that opens as
  a pop-up window in the client.
- More data, like the number of people in each queue.
- More player-specific data about runs at run end.

## First consideration

**Where it lands against the plan as written.** The battlebots plan (entry 11) rules that bot
scripts run in the player's existing per-character Worker in the player's browser, that no new
interfaces are needed, and that the front server keeps a match record store. Three of the six
points sit on that design comfortably; three change it.

- **Queue population and richer end-of-run data** are queries and fields on the match store the
  plan already builds. They are additive and could ride on entry 11 itself if the plan's task for
  the store leaves the record shape open. Worth a sentence in that task's brief: store the queue
  membership with timestamps, and store the per-run stats the run report (SP4b task 11) already
  computes, so nothing has to be re-derived later.
- **Kicked from the queue on loss or leave** is a queue rule. Cheap once the queue is server-side
  state rather than a pad the player stands on. The plan's queue pad is a location in the region;
  a server-side queue is a small step from it.
- **Win streaks on the leaderboard** is a category in SP3b's hiscores registry (entry 13), which
  the battlebots plan already assumes for `battlebots_wins`. A streak is one more projection over
  the match store. The in-game reading would be an interface or a chat line; the plan's ruling that
  no new interfaces are needed would have to be revisited for that half only.

The three that change the design:

- **Queue and log out, and simulated matches against stored setups.** Both require the match to
  run without the player's browser. Today every script runs in the player's Worker, so a logged-out
  player has no runtime. The honest routes are SP5's headless runner (entry 17), which is exactly a
  browser-less client that could host two Workers per match on the front server, or an engine-side
  simulation that never touches the live world. The first reuses everything the bot system has;
  the second is a new engine surface. This is the pivot the idea turns on, and it means the idea
  sequences after SP5 unless the headless runner moves earlier. A stored "setup" (script version,
  gear set, character stats at queue time) is a natural record shape whichever route is taken, and
  the plan's issued-loadout ruling makes gear sets already well defined.
- **Live viewing and replay from a file.** Replay needs a recording: the trace already captures a
  run's events, and the SP4b run export (task 11) writes a run to JSON, so a match replay is two
  traces plus the world positions per tick. Live viewing needs a spectator feed from wherever the
  match runs. The pop-up window is the shell v2 window family (entry 4), the same language as the
  bank, trace and studio windows. A replay viewer that draws two bots on a schematic of the plot
  rather than in the real game canvas is much cheaper than a spectator camera in the client.

**Dependencies, in order.** Entry 11 as planned; SP3b for the streak category; the shell v2 window
family for the viewer; SP5 or an engine simulation for queue-and-log-out and simulated matches.

**Rough size.** Queue rules, population data and end-of-run data: small, can fold into entry 11.
Streaks: small, folds into SP3b. Replay viewer: medium, its own entry. Queue-and-log-out with
simulated matches: large, its own entry after SP5, and the piece a brainstorm has to settle first.

**Questions a brainstorm would settle.**
1. Simulate on the front server through the headless runner, or in the engine? The plan's rulings
   were made against the pinned clones and should be re-read before choosing.
2. Does a simulated match need the live world at all, or is the arena region a pure simulation
   with the same rules? If the latter, "stakes-free" becomes trivially true.
3. What does a stored setup freeze: script source at queue time, or a reference that follows edits?
4. Replay fidelity: a schematic of the plot, or the real canvas driven from a recording?
5. Does a queued, logged-out player consume a world slot, and how is the record shown to them on
   return?

**Doors to leave open now.** Entry 11's match record should carry a schema version and the setup
fields even if nothing simulates yet; its queue should be server-side state; its trace export should
be the same shape as SP4b's run export.

## Round two: rulings from the owner, and the handoff (2026-09-07)

Discussed with the owner in a session on 2026-09-07 against the plan as written. Everything below
was confirmed by the owner in that conversation; the two marked "recommendation" are the session's
and are for the orchestrator to rule on.

**What the owner settled.**

1. **Matches run on puppet characters, never on the player's character.** The player stays in
   the world doing whatever they were doing, wherever they were. Walk-away play (queue, then log
   out) is *not* a must-have; not interrupting the character is.
2. **A puppet is acceptable as the carrier of a stored setup.** A setup is script source frozen at
   queue time plus its version, the kit id (the arena already issues kits, R3), and a stat snapshot
   taken at queue time and written onto the puppet by a management route. The engine stays the
   only combat simulator; nothing is simulated outside it.
3. **Queue rules.** Loser is dequeued; winner is re-queued automatically and keeps fighting until
   it loses or leaves. Win streak is consecutive ranked wins, persisted on the store and projected
   into SP3b's registry. The panel is the streak's reading; an in-game chat line is optional.
4. **Replays and live viewing** are wanted, in a shell v2 window. First release draws a schematic
   of the plot from the record; a free-camera 3D viewer is a separate, longer-term direction.
5. **Queue population and richer end-of-run data** stay additive on the store.

**Recommendation A: host the puppet in the player's browser first.** The puppet needs a client
and a script runtime. rs-sdk's headless `LiteClient` is upstream and not yet vendored (its
`lite/movement.ts` helper is). Two hosts are possible:

- *Browser Worker in the player's tab.* The LiteClient speaks the engine websocket from a Worker
  beside the existing script Worker; the script Worker is unchanged and its transport talks to the
  LiteClient instead of the canvas client. No server-side sandbox, no trust-model change (D24
  holds: the code stays in the player's own browser), no new container. Costs: both players must
  be online, and tick fairness is at the mercy of two browsers, which the owner accepts in a
  private world.
- *Bun front server* (SP5's headless half). Gives walk-away play, uniform ticks and a single
  spectator source. Costs: player script code would run on our server beside its secrets, so it
  needs its own isolated process or container with no environment and network access only to the
  engine; that is a real trust-model change and the security-sensitive shape G7 names.

Since walk-away is not required, build the browser host first and design the LiteClient plus
transport seam so hosting it in Bun is the last mile for SP5. If wrong, the cost is one host
adapter, not a redesign.

**Recommendation B: defer the ranked queue pad out of entry 11.** With puppets, queueing is a
panel action and the pad is never walked onto; R13's shared waiting slot and level band would be
built and then superseded. Entry 11 keeps the region, plots, kits, practice, challenge, the store
and the volume; ranked play arrives with the follow-on entry. If wrong, the pad is one RuneScript
task the plan already holds and can be reinstated.

**Efficiency and limits, ruled here.**

- **Concurrency is bounded by plots.** Eight plots (R14) means eight matches at once, sixteen
  puppet sessions on the engine, which is trivial for it. More plots is a regeneration of the
  region with the R1 generator's plot count raised, not new code.
- **A match queue is needed the moment more than eight matches are wanted**, and for level
  banding regardless, so the queue is server-side from the start: an ordered list with
  timestamps, combat level at queue time and the stored setup. A match arms when a plot is free
  and both players' tabs are live. Liveness is a poll from the shell while queued; an entry whose
  last poll is older than a short window is skipped, not dropped, and resumes when the tab
  returns.
- **One ranked match per player at a time**; same-account pairing is refused by the front server
  (the plan already leaves that to it).
- **Puppet pool.** Two puppet accounts per plot, pre-created and reused; a puppet is free when its
  plot is. Stats are overwritten at every arm, so nothing needs resetting. How the tab logs a
  puppet in (a one-time token minted by a management route is the likely shape) is a plan
  question.
- **Storage.** A match is at most 500 ticks (`^bb_match_ticks`); positions and HP for two fighters
  per tick plus the two run traces is on the order of a few hundred kilobytes. Keep the spec's
  section 14 retention: last 100 matches per character in full, results only beyond that.
  SQLite in the `server-data` volume entry 11 already adds.
- **Throughput ceiling** at eight plots and five-minute matches is roughly a hundred matches an
  hour, far above what a private world will ever want.

**Doors to leave open in entry 11 now** (supersedes the list above):

- The match record carries a schema version (the plan has one) **and a tick log**: both
  fighters' positions and HP per tick, sampled by the match clock that already samples HP, plus
  the two run traces in the SP4b export shape.
- The store's setup fields: script source and version, kit id, stat snapshot, queued-at.
- The match store, not the RuneScript, owns who fought: puppet-to-owner mapping is a store column.
- The web panel's "Queue" action is stubbed even if the pad ships.

**Proposed follow-on entry: "Battlebots 2: puppets, queue and replays".** Brainstormed to a spec
per the sprint document's section 6, placed **after entry 13 (SP3b)** because it registers the
streak category into that entry's registry and extends the record SP3b projects over. Scope:
LiteClient vendoring and the browser Worker host, puppet accounts and the management routes that
set stats and mint logins, the server-side queue and its population endpoint, the stored setup,
the tick log and trace capture, the replay window (schematic), live viewing over the same feed,
and streaks. Practice and challenge stay on the player's real character, as entry 11 builds them.

**Orchestrator, 2026-09-07 06:10.** Recommendation A ruled as D37 (puppet hosted in the player's browser first), recommendation B as D38 (queue pad deferred out of entry 11), and the follow-on entry queued as D39 on the sprint board (`docs/superpowers/sprint-control.md`, queue item 8), to be brainstormed to a spec and placed after entry 13. The four doors-open lines now sit on the board under entry 11.

## Round three addition (2026-09-07)

The owner added: **private matches**, untracked, against a few default bots we ship and against
past opponents, for testing. Against the library defaults this is practice mode on a puppet and
costs nothing new. Against a past opponent it means running that opponent's stored script, and
under recommendation A the puppet runs in the challenger's browser, which would ship another
account's script source to their tab. That breaks the spec's visibility rule ("never source") and
D24's no-sharing precondition. Two honest shapes: the past-opponent rematch is the first feature
that needs the Bun-hosted puppet (SP5's half, where the source never leaves the server), or a
rematch uses the opponent's kit and stat snapshot with a default script, which tests the setup but
not the script. Recommendation: ship the second now, mark the first as the reason SP5's headless
half exists. A recorded combat script from the recorder idea is a valid entrant.
