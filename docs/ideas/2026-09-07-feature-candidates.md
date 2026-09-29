# Feature candidates, ranked

Recorded: 2026-09-07, by the ideas session at the owner's request, after the three idea
discussions of that day. These are the session's suggestions, not the owner's words, so they are
not idea files: any of them graduates the normal way, by the owner adopting it as an idea and a
brainstorm producing a spec. Status of the list itself: `superseded` for the adopted half by `docs/superpowers/specs/2026-09-07-sprint-legends-quest.md` (the owner's selection, 2026-09-07), `archived` for the rest.

The spirit they were chosen for is the vision's: playing, scripting and letting Claude play are
all first-class; the world is private, so "players would exploit that" settles nothing; no
upstream gameplay patches (no XP multipliers, no infinite run); content additions are fine; no
new art exists beyond the 2004 cache; one script runtime, two callers.

Scores are 1 to 5. **Desirability** is how much it serves the owner's stated interests (play
quality of life, scripting for non-programmers, battlebots, the renderer direction, Claude
playing). **Feasibility** is against the repository as it stands on `sprint/dragon-slayer`, with
the dependency named. Ranked by the sum, desirability breaking ties.

## Adopted into Sprint: Legends' Quest

| # | Candidate | D | F | Needs | Summary | Sprint entry |
|---|---|---|---|---|---|---|
| 1 | Loadout presets in the web bank | 5 | 5 | SP8b bank (shipped) | Save the current inventory and gear as a named loadout; one button restocks it. The same `Loadout` type the recorder, `bank.ensure` and battlebots kits use | 1 |
| 2 | Examine-to-wiki | 4 | 5 | wiki corpus (shipped), shell v2 window | An examine line in chat, or an item tooltip, opens the item's wiki page in a window. The chat hook and the corpus both exist | 9 |
| 3 | Browser notifications for runs | 4 | 5 | run status (shipped) | Notification API alerts when a run ends, gets stuck, dies, or the character is attacked while idle. A tab in the background becomes useful | 3 |
| 4 | Function-key sidebar tabs and Escape | 4 | 5 | entry 3 (patch gate) | F-keys switch sidebar tabs and Escape closes the open interface, RuneLite style. One numbered client patch | 2 |
| 5 | Auto-login to the last character | 4 | 5 | armLogin (shipped) | A reload or a fresh tab lands back in the world on the last character, with a setting to turn it off | 2 |
| 6 | Shell console commands | 3 | 5 | tasks API (shipped) | A command line in the shell: run a script by name, stop, open a panel, set a setting. Keyboard-first play and the cheapest automation surface | 2 |
| 7 | Trace search, filter and bookmarks | 3 | 5 | trace window (shipped) | Find events by type or text, pin a moment, jump between pins. Debugging a script without scrolling | 8 |
| 8 | Screenshots on notable events | 3 | 5 | screenshot plugin (shipped) | Level-ups, rare drops and deaths auto-capture into the run report | 3 |
| 9 | More library scripts | 5 | 4 | entry 7 (API v2) | Mining, cooking, smithing, firemaking, fletching, a combat trainer. Each one is also a test of the API standard and recorder corpus | 6 |
| 10 | Run queue | 5 | 4 | tasks API (shipped) | Chain scripts: woodcut until level 30, then fish until 200 shrimp, then bank. `until` predicates already exist; this is a list over them | 7 |
| 11 | Route service over the collision pack | 4 | 4 | collision.ts (shipped) | One `/api/route` pathfinder shared by scripts, the recorder, the world map and travel. Replaces per-script walking logic and makes long routes reliable | 4 |
| 12 | Collection log | 4 | 4 | loot tracker (shipped), corpus | Every item ever obtained per account, against the corpus item list, with sources. The nostalgic surface the trackers already feed | 9 |
| 13 | Script stats page | 4 | 4 | run history (shipped) | XP per hour per script over time and per character, from the history store. Answers "which script is actually best" | 7 |
| 14 | Session timeline | 3 | 4 | events feed (entry 4) | A day view per character: runs, level-ups, deaths, drops. Built on the cross-character event feed shell v2 adds | 11 |
| 15 | Sound and music settings | 3 | 4 | config panel | Volume per channel, mute, now-playing, in the Display section. The client has the midi player and a mute toggle already | 10 |
| 17 | Chat panel in the shell | 3 | 4 | chat hook (shipped) | Timestamps, filters by kind, history search, copy. The client's chatbox stays; this is the readable copy | 11 |
| 18 | Death log with walk-back | 3 | 4 | trace (shipped) | What was lost, where and when, with a one-click script that walks back to the tile | 8 |
| 19 | Item tooltips in the shell | 3 | 4 | objArt patch 28 (shipped) | Hover a bank or inventory slot for examine, value and a wiki link | 9 |
| 21 | XP goal ETA on the co-pilot bar | 3 | 4 | entry 4 | Time to the next level at the current script's rate, on the bar shell v2 adds | 11 |
| 24 | Quest helper | 5 | 3 | tutorial-steps generator pattern | Per-quest generated step routes, like the tutorial island generator, with a panel that shows the next step and a script that can do it. Large per quest, but the pattern is proven | 5 |
| 25 | Ask Claude why a run failed | 5 | 3 | SP4c (entry 16) | Send a run's trace through the gateway and get a post-mortem with a suggested fix. The first "Claude plays" feature that needs no live control | 12 |
| 26 | Claude writes a script from a sentence | 5 | 3 | SP4c, entry 6 (studio) | "Write me a script that fishes lobsters at Karamja and banks at Draynor" lands as a draft in the studio, validated by its linter | 12 |
| 38 | Mobile-friendly shell | 2 | 3 | entry 4 | The client already has a mobile keyboard; the shell's panels do not fit a phone. Responsive layout for the panel column | 11 |

## Archived

Kept for the record with their scores and dependency; not planned. Revive one by adopting it as
an idea file under this directory and brainstorming it per the sprint document's section 6.

| # | Candidate | D | F | Needs | Summary |
|---|---|---|---|---|---|
| 16 | Crisp integer canvas scaling | 3 | 4 | stage (shipped) | An option for pixel-exact 2x and 3x scaling instead of blurred stretch. Pure CSS on the canvas stage |
| 20 | Discord webhook for run events | 3 | 4 | front server | An owner-configured URL receives run end, stuck and death events. Cheap, and the phone gets it |
| 22 | Skill calculators | 2 | 4 | corpus | Actions to a target level, from the corpus tables, in the XP panel |
| 23 | Run report as a hosted page | 2 | 4 | front server | An owner-only `/r/<id>` page for a run report, for reading on another device |
| 27 | Run scripts on characters without a tab | 5 | 2 | SP5 (entry 17) | The idle premise proper: two characters skilling headless while the third is played. Easy once the headless runner exists |
| 28 | Character checkpoints | 4 | 3 | management route; G6 for restore | Snapshot a character's `.sav` before trying a risky script and restore it after. Restore overwrites player data, so it is owner-gated |
| 29 | Goals store and autopilot | 4 | 3 | SP4c, D17 | Give the orphan goals spec its row: a goal list per character, three modes, Claude picks the next goal on request |
| 30 | Free-camera world viewer | 4 | 2 | renderer idea stage 3 | A separate WebGL page rendering our world with live positions: battlebots spectator, replay and world map in one |
| 31 | Ambient bot population | 3 | 3 | SP5 | A handful of headless characters skilling and walking around, so the world feels inhabited. Runs the library scripts, so it is also a soak test |
| 32 | Battlebots ladder and seasons | 3 | 3 | Battlebots 2 | Elo over the match store, monthly seasons, a champion title in the panel |
| 33 | Watch a character read-only | 3 | 3 | rs-sdk observe mode (vendored) | A second tab observing a character without controlling it. rs-sdk's observe connection mode is the seam |
| 34 | Recorded traces as test fixtures | 3 | 3 | P17 (entry 7) | A "record fixture" button turns a real run into `createTestContext` data, so a script's tests run against what actually happened |
| 35 | Drop-table expectation | 3 | 3 | loot tracker, corpus | Observed versus wiki drop rates per NPC, with a dry-streak indicator |
| 36 | More clue rewards | 3 | 3 | entry 10 (time candy) | Further owner-bound items on the time candy pattern, once the overlay path is proven on it |
| 37 | Ghost path overlay | 3 | 2 | SP5 (scene projection) | The previous run's path drawn on the scene as a translucent trail; the recorder's route shown before it is saved |
| 39 | Scheduled world events | 3 | 2 | engine overlay | Engine-side events such as a timed boss in the arena region. Content, not a rule change, but a new overlay surface |

## Reading the ranking

- Ranks 1 to 8 are cheap and land on shipped seams; any of them could be a small entry or a
  fold-in and none needs a spec longer than a page.
- Ranks 9 to 23 are the middle: real features on shipped or in-flight seams, each a normal entry.
- Ranks 24 to 39 are the ones worth wanting most and waiting for: they sit behind SP4c, SP5,
  Battlebots 2 or the renderer's third stage, which is why the sprint's order matters to them.
- Three themes recur and could be named as small sub-projects of their own: **a shared loadout
  type** (1, 9, 10, 28), **the corpus as a live data source** (2, 12, 19, 22, 35) and **Claude
  reading traces** (25, 26, 34).
