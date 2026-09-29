# Idlescape: SP3b, finishing the hiscores half of SP3

Date: 2026-09-07
Status: approved by the orchestrator under D11 and D14, 2026-09-07; committed on
`sprint/dragon-slayer` the same day with the sprint amendment; owner may reverse any ruling in
section 13.
Authority: the SP3 design (`2026-09-05-sp3-hiscores-tracker-design.md`) **as amended here**.
Section 12 lists every sentence of SP3 this document supersedes. Where the two disagree, this one
wins; everywhere else SP3 still stands and is not restated.
Placement: **immediately before SP10**, per decision D14. SP10 (wealth hiscores) is the entry this
one unblocks, and it is the only entry that has to wait for it.
Classification: **architectural.** It adds a database to the front server, a fourth web entry
point, eight routes (the table in section 6), a capture path in the shell session layer, and a
category registry that two later entries register into.

Reading state: code read at `a24d176` on `sprint/dragon-slayer`
(`fix(tasks): fan out a coalesced trace row so the export matches the summary`). Two workflows were
live in the tree while this was written, SP4b tasks 12 to 15 and the shell v2 reconcile pass, and
neither touches a file this document depends on. Line numbers here are hints; a grep is the
authority.

Depends on: SP2's session trackers (built), SP6's character store and SP7's session manager (both
built), shell v2 for the panel dialect the shell surface is written in, and the battlebots match
store for one category. Nothing in it depends on the engine overlay, so the C07 deploy fix is not a
prerequisite.

---

## 1. What exists, and what does not

Confirmed at `a24d176`, independently of the battlebots plan's R10:

- `server/src` has no hiscores, tracker or snapshot module. `grep -rn -i hiscore web/src server/src`
  returns nothing at all.
- `web/src/plugins/types.ts` has no `snapshots` member on `PluginContext`. The seam SP2's design
  reserved at its `:163-164` (`ctx.snapshots.push(reason)`) was never built.
- `web/src/stats/` is three helper files: `xp.ts` (`createXpTracker`), `loot.ts`
  (`createLootLog`) and `skills.ts` (the 21 skill names and the XP curve). They are session
  trackers, not a tracker service, and they persist nothing.

**One correction to how the sprint has been describing this.** Sprint section 4 reads "SP3's
trackers shipped and SP3's hiscores did not". The trackers are SP2's: `xp-tracker` and
`loot-tracker` are two of the nine Tier 1 plugins in the SP2 design's section 5, and the audit
records that five of those nine shipped. SP3 as a sub-project delivered nothing. The honest
sentence is that **SP3 is unbuilt, and the session trackers a reader mistakes for it belong to
SP2.** A useful consequence: `hiscores` is also one of SP2's four missing Tier 1 plugins, so the
shell surface in section 8 closes one of them, and the SP2 reconciliation section that audit C31
asks for should say that SP3b took it.

## 2. The five layers

The audit's section 3.4 is right that this is a sub-project rather than a task. It is five layers,
in this order, each usable before the next exists:

1. **Capture** (`web/src/stats/snapshots.ts`, wired in `web/src/frame/stage.ts`). Reads
   `hooks.getState().skills` for a character and posts it. Not a plugin, and not a plugin-context
   extension: see ruling R1.
2. **Ingest** (`POST /api/tracker/snapshot`, in `server/src/tracker/`). Verifies the principal,
   resolves the character, sanity-checks the payload, writes the row.
3. **Store** (`server/data/tracker.db`, `bun:sqlite`, WAL). Schema, ranks, gains, records,
   retention.
4. **Pages** (`web/hiscores.html`, a fourth Vite entry, and `web/src/hiscores/`). The public table,
   a per-category table, and a player page with gains, records and a history chart.
5. **Shell surface** (a Hiscores section inside the XP Tracker panel, plus the link out). No new
   strip icon: see ruling R3.

Layers 1 to 3 are the entry's spine. A reviewer should be able to stop after layer 3 and see rows
accumulating; layers 4 and 5 are presentation over a store that already works.

## 3. What changed since SP3 was designed

SP3 was written on 2026-09-05 against a shell that had one character, one page and no design
system. Five things moved underneath it.

**The design system and shell v2's panel language.** The `.p-*` class dialect SP3's panel would
have been written in is retired by the shell v2 entry, and the strip ships exactly eleven glyphs,
which is the count after Characters merges into Account and Marketplace becomes a tab. A twelfth
panel does not fit that strip by construction. The hiscores page is likewise written against the
shell v2 token layer under `web/src/styles/`, not against the `tokens.css` SP3 named.

**The account and character model, from SP6 and SP7.** A uid now owns up to two characters
(anonymous) or three (password), per `CHARACTER_LIMITS` in `server/src/types.ts:75`. Characters are
`characters/{id}` documents with a 20-character id, a unique `gameName` reserved in
`gameNames/{name}`, and a `deletedAt` soft-delete field. `gameAccounts/{uid}`, which SP3's ingest
step 1 says to read, is a legacy collection that `characters/store.ts` drains on first touch and
then deletes. So the tracker's subject is a character, the account above it is the privacy
boundary, and one uid can appear several times in a hiscores table under different names.

**The owner bank, from SP8.** The bank is **per account**, not per character. That is what makes
SP10's wealth categories a different shape from every category SP3b ships, and it is the reason the
category registry in section 9 carries a subject kind rather than assuming a character.

**The front server's router and auth.** `server/src/router.ts` classifies every path into a `Route`
union and `principalRule()` gives each kind one of `human`, `agent`, `either` or `none`, checked
before the handler runs. `server/src/auth/principal.ts` resolves a bearer into a human uid or an
agent token. SP3's "gated page, no token" route is not expressible in that model and is superseded.

**The shell already owns per-character session events.** `web/src/sessions/manager.ts:139-141`
subscribes to `login`, `logout` and `disconnect` for every character session, and
`web/src/frame/stage.ts` already keeps one XP tracker and one loot log per character. Every trigger
SP3's ingest wanted exists in the shell already, one layer below the plugins. That is what makes R1
cheap.

## 4. Data model, and retention

`server/data/tracker.db`, `bun:sqlite`, WAL, `busy_timeout` 5000, schema in
`server/src/tracker/schema.sql`, applied at boot behind a `schema_version` table. The shapes go in
`server/src/types.ts` beside the SP8 bank shapes, per the one-`types.ts`-per-package rule.

```sql
characters   (character_id TEXT PRIMARY KEY, uid TEXT NOT NULL, game_name TEXT NOT NULL UNIQUE,
              created_at INTEGER, last_seen INTEGER, hidden INTEGER NOT NULL DEFAULT 0)
snapshots    (id INTEGER PRIMARY KEY, character_id TEXT NOT NULL, ts INTEGER NOT NULL,
              source TEXT NOT NULL,          -- 'login' | 'logout' | 'interval' | 'request'
              total_xp INTEGER NOT NULL, total_level INTEGER NOT NULL,
              xp BLOB NOT NULL,              -- 21 x int32 little-endian
              levels BLOB NOT NULL)          -- 21 x uint8
latest       (character_id TEXT PRIMARY KEY, snapshot_id INTEGER, ts INTEGER,
              total_xp INTEGER, total_level INTEGER, xp BLOB, levels BLOB)
latest_skill (character_id TEXT, skill INTEGER, xp INTEGER, level INTEGER,
              PRIMARY KEY (character_id, skill))
records      (character_id TEXT, skill INTEGER, period TEXT, gained INTEGER, period_start INTEGER,
              PRIMARY KEY (character_id, skill, period))
rejected     (id INTEGER PRIMARY KEY, character_id TEXT, ts INTEGER, reason TEXT, detail TEXT)
```

Indexes: `snapshots(character_id, ts)`, `latest(total_xp DESC)`, `latest_skill(skill, xp DESC)`,
`characters(uid)`. Ranks come from one indexed scan over `latest` or `latest_skill`, which is why
`latest_skill` is a table rather than a view; SP3 already chose that and it stands.

**Twenty-one skills, not twenty-three.** `web/src/stats/skills.ts:1` names 21, which is the 2004
set. The client allocates 25 slots (`client/src/client/Skill.ts:2` is `Skill.count = 25`, and
`Client.ts:512-513` sizes both arrays from it), so `getState().skills.xp` arrives 25 long with four
unused tail entries. Capture slices to 21, the wire carries 21, the BLOB is 21. Ruling R4.

**Retention**, which SP3 did not specify at all:

| Age of a snapshot | Kept |
|---|---|
| under 48 hours | every one |
| 48 hours to 30 days | one per hour, the last in each hour |
| over 30 days | one per day, the last in each day |

`latest`, `latest_skill` and `records` are never pruned, so a character's ranks and bests survive
compaction whatever happens to the rows behind them. `rejected` keeps the newest 50 rows per
character. Compaction runs once at boot and every six hours, one transaction per character, and the
selection is a pure function from a list of timestamps to a list of ids to delete, so it is unit
tested without a database. Ruling R5.

**Backup.** `VACUUM INTO server/data/backups/tracker-<date>.db` on the same six-hour tick, keeping
the last seven and deleting older ones in the same pass. No Task Scheduler entry and no container
cron: both belong to a Windows VM deployment this project no longer has. This supersedes SP3
section 7's first bullet.

## 5. Ingest

`POST /api/tracker/snapshot`, principal `human`, body:

```
{ characterId: string, reason: 'login' | 'logout' | 'interval' | 'request',
  xp: number[21], levels: number[21], clientCycle: number }
```

Server steps, in order:

1. **Resolve.** The character must be `characters/{characterId}` with `uid` equal to the
   principal's uid and `deletedAt === null`. Anything else is 403 saying `not_your_character`,
   without disclosing whether the id exists. The character row in `tracker.db` is upserted from
   that document, so the tracker never invents a name and never reads `gameAccounts/{uid}`.
2. **Shape.** Both arrays exactly 21 long, every entry a finite non-negative integer, xp within
   int32, level 1 to 99. A shape failure is a 400 and is not written to `rejected`, because a
   malformed body is a bug in our own shell rather than a claim about a player.
3. **Sanity, against `latest`.** Every skill's XP non-decreasing; total gain at most
   `MAX_XP_PER_HOUR * elapsedHours + slack`, with `MAX_XP_PER_HOUR` 250000 and slack 50000 on the
   first snapshot after a login; each level consistent with its XP under the same curve the shell
   uses. A failure writes `rejected` with the reason, leaves `latest` untouched, and answers 200
   with `{ ok: true, stored: false, reason }`, so the shell can show it without treating it as an
   error.
4. **Write.** Insert the snapshot, update `latest` and `latest_skill`, recompute the affected
   `records` rows, all in one transaction.
5. **Rate limit.** One accepted snapshot per character per 60 seconds, except `logout`, which is
   always accepted if it passes sanity. The limiter is keyed on `characterId`, which the caller
   cannot forge past step 1. Audit C26 warns about a limiter keyed on something the caller sets;
   this is deliberately not that.

**Trust posture, stated as a ruling rather than left implicit.** The ingest believes the player's
own browser. The world is private and gated, every player runs our shell, and spoofing means
running code in your own devtools to inflate your own row. The sanity checks bound the damage; they
are not an anti-cheat system, and no one should build one on top of them until the world is public.
Ruling R12, and it is SP3 section 2's position unchanged.

**Capture, on the client side.** `web/src/stats/snapshots.ts` exports
`createSnapshotSender({ post, sessions, now })`, wired once in `stage.ts`. It fires on:

- the session manager's existing `login` event for a character, once the client reports `loggedIn`;
- its `logout` and `disconnect` events, best effort, with the payload built before teardown;
- a ten-minute interval per logged-in character, jittered by up to 30 seconds so several tabs do
  not arrive together;
- an explicit `refresh()` call from the panel or the page.

It holds no state a reload would lose, it never queues, and a failed post is dropped with one
`console.warn` rather than retried, because the next interval tick carries the same information.
The interval id is held so `stage.ts`'s existing teardown can clear it, which is the failure shape
audit C18 records for the health poll.

## 6. Read API, and the privacy rule

| Route | Principal | Scope |
|---|---|---|
| `POST /api/tracker/snapshot` | human | own character only |
| `GET /api/hiscores?category=&page=&size=25` | none (gate cookie) | public table |
| `GET /api/hiscores/categories` | none (gate cookie) | the registry, section 9 |
| `GET /api/hiscores/player/:gameName` | none (gate cookie) | public columns only |
| `GET /api/tracker/:gameName?period=1d\|7d\|30d\|all` | human | own account only |
| `GET /api/tracker/:gameName/records` | human | own account only |
| `GET /api/tracker/:gameName/history?skill=&days=` | human | own account only |
| `POST /api/tracker/refresh` | human | own character only |

`router.ts` gains `{ kind: 'hiscores'; sub: ... }` and `{ kind: 'tracker'; sub: ... }`, with
`principalRule` returning `none` for the first and `human` for the second, matching `/api/bank`.

**The privacy rule, stated once and testable.**

- The **public** surface is exactly `gameName`, `level`, `xp`, `rank`, `category` and `updatedAt`
  rounded to the minute. That is the hiscores table and the player page's rank columns, and it is
  visible to any gated visitor, which is what a hiscores table is for.
- Everything else is **an account's own characters only**: gains over a period, records, history
  series, rejected counts, exact `lastSeen`, and `characterId`. The server derives the owning uid
  from the principal and never accepts a uid, a character id or an "as" parameter on a read.
- `uid` never appears in any response body, public or private.
- A soft-deleted character is `hidden = 1` and leaves the public table on the next write. Its rows
  are retained, because deleting them would silently rewrite everyone's rank history, and its
  detail routes stay readable by its owner.
- Agent principals cannot read the detail routes today. That is deliberate and matches `/api/bank`;
  SP4c is where the agent principal rule for reads is settled, and audit C27's composition test is
  the place to add the case.

One test asserts the whole rule from the outside: two accounts, two characters each, four
snapshots, then account two asking for every one of account one's detail routes by name and getting
403 on each, while still seeing account one in the public table.

## 7. The pages

`web/hiscores.html` is a fourth Vite input beside `index.html`, `play.html` and `styleguide.html`
in `web/vite.config.ts`, and `/hiscores` plus `/hiscores/*` classify to a `page` route in
`router.ts` the way `/styleguide` already does, so the gate cookie covers it unchanged.
Client-side routes: `/hiscores` (overall), `/hiscores/category/:id`, and `/hiscores/player/:name`
with tabs for gains, records and history.

Written against the shell v2 token layer under `web/src/styles/`, reusing the frame header and the
Badge, Button, SectionLabel and Tag components the living library ships. The history chart is
inline SVG with no library, as SP3 said. Virtual levels above 99 appear on the player page only.
Every table is a real table element with a caption: this is the first genuinely tabular surface in
the product, and the a11y contract the shell v2 entry adds should not have to be retrofitted onto
it.

## 8. The shell surface

**No twelfth strip glyph.** Shell v2's icon set is eleven inline SVG paths, and the sprint's own
argument for moving that entry second is that eleven is exactly the count after its three
structural merges. Adding a Hiscores icon would undo that argument.

Instead the XP Tracker panel gains a **Hiscores section** below its per-skill table: the
character's overall rank and total level, its rank in the top three skills by session gain, an
Update button that calls `refresh()` and re-reads, and an "open full page" link to
`/hiscores/player/<name>`. The section renders a one-line empty state before the first snapshot
lands. This is the panel SP3 asked for, in the only place shell v2 leaves for it, and it is also
the `hiscores` Tier 1 plugin from SP2's section 5 arriving at last, as a section rather than a
plugin. Ruling R3.

## 9. Categories, and what SP10 and battlebots build on

The hiscores table is not one query, it is a registry. `server/src/tracker/categories.ts`:

```ts
export type Subject = 'character' | 'account';
export interface RankRow { subjectKey: string; label: string; value: number; updatedAt: number }
export interface Category {
  id: string;            // 'overall' | 'skill:0'..'skill:20' | 'battlebots_wins' | 'coins' | 'wealth'
  label: string;
  subject: Subject;
  available(): boolean;  // false hides it from /api/hiscores/categories
  page(limit: number, offset: number): RankRow[];
  rankOf(subjectKey: string): number | null;
}
```

SP3b registers 22 of them: `overall` and one per skill, all `subject: 'character'`, all reading
`latest` and `latest_skill`.

**The battlebots hook, its plan's R10.** Battlebots lands two entries before this one, so its match
store exists by the time SP3b is built. Its plan records match rows with a `mode` discriminator
precisely so that "the hiscore category becomes a projection over that store when SP3 lands", and
its R16 keeps every row. SP3b therefore registers `battlebots_wins` as a `subject: 'character'`
category whose `page()` groups ranked wins out of `BATTLEBOTS_DB` by `gameName` and joins to
`tracker.db`'s `characters` on the same column. `available()` returns false when the battlebots
database file is absent, which keeps a dev checkout and the test suite honest. The battlebots entry
ships nothing further for this; the projection is SP3b's work, over a store SP3b does not own and
never writes. Ruling R8.

**What SP10 then builds.** Two more categories, `coins` and `wealth`, both `subject: 'account'`,
computed over the SP8 owner bank plus the account's characters' latest inventories. SP10 writes the
providers and registers them; it writes no route, no page and no schema, because the registry, the
pages, the ranking, the caching and the privacy rule are all here. That is the whole of what D14
meant by "SP10 stays". The subject kind is what makes it fit: the bank is per account, so a wealth
row cannot be keyed by character, and a table that assumed characters would have forced SP10 to
either duplicate an account's wealth across its characters or build a second page. Ruling R7.

All read routes cache in memory for 30 seconds, keyed by category and page, as SP3 said.

## 10. Deployment and durability

**The front server has no volume.** `deploy/docker/docker-compose.yml` declares one named volume,
`engine-db`, and the `server` service mounts nothing; its only persistent state today is in
Firestore. A `tracker.db` written under `server/data/` in that container is deleted by the next
release, silently, and the hiscores table starts again from empty with no error anywhere.

SP3b therefore requires: a named `server-data` volume mounted at the server's data directory, a
`TRACKER_DB` key in `server/src/env.ts` and in `server/.env.example` (which audit C17 is fixing
earlier in the sprint), and `tracker` added to `HealthSnapshot` beside the `wiki` field that is
already there. Battlebots reaches this wall first, with `BATTLEBOTS_DB` under the same directory.
**Whichever of the two lands first adds the volume; the second asserts it.** SP3b's plan opens by
checking which case it is in. Ruling R9.

The release itself stays owner-gated under G5. Nothing here touches the live host.

## 11. Testing

**Unit.** The sanity checks (monotonic, rate cap, level-versus-XP consistency, first-snapshot
slack); gains over each period against fixture snapshots, including the case where no snapshot
exists at or before the period start; records recomputation across a period boundary; ranking ties
broken by the earlier `updatedAt`; the retention selector as a pure function over timestamp lists,
including the 48-hour and 30-day boundaries and an empty list; the 21-entry encode and decode round
trip; the category registry with a category whose `available()` is false. And **capture itself**,
which is otherwise the only one of the five layers with no test of its own: one unit test over
`createSnapshotSender({ post, sessions, now })` with an injected clock and a stub `post`, asserting
the 25-to-21 slice at capture (R4's own premise, `client/src/client/Skill.ts:2` and
`Client.ts:511-513`), the ten-minute interval firing once per logged-in character with its jitter
inside the 30-second bound, and the held interval id being cleared on teardown, which is the audit
C18 failure shape section 5 names.

**Integration**, against the emulator, in the shape `server/src/bank/routes.test.ts` already uses:
the snapshot round trip into a temporary database; every read route; the four-account privacy
matrix from section 6; a soft-deleted character leaving the public table; the rate limiter
accepting a `logout` inside the window and refusing an `interval`.

**Browser** (Playwright, run from `web/`, never the repo root): the player page renders gains after
two snapshots; the XP Tracker panel's Hiscores section shows a rank and its Update button triggers
a post; `/hiscores` renders the public table behind the gate cookie.

**Gates.** `hiscores.html` joins the `build:e2e` input list, so a broken page fails the build rather
than the e2e run. A schema test asserts `schema.sql` applies cleanly to an empty file and that
`schema_version` matches the constant in code. `server/src/tracker/skills.ts` carries the 21 names
and the XP curve, and a test asserts every value equals `web/src/stats/skills.ts`, because there is
no `scripts/gen/xp.ts` to generate both from and inventing one for two constants would be the
heavier answer. Ruling R10.

## 12. Which SP3 sentences this supersedes

Said plainly, because a reader who opens SP3 first must not be misled.

1. **SP3 section 3, the `players` table.** `players (id INTEGER PK, game_name TEXT UNIQUE, uid
   TEXT, ...)` is replaced by `characters`, keyed by the SP6 character id, with `game_name` unique
   and `uid` indexed. A game name is a label; the character id is the identity.
2. **SP3 section 3, "23 x int32" and "23 x uint8".** It is 21 of each. See section 4.
3. **SP3 section 3, the generator sentence.** "Skill ids and the XP table come from the same
   `scripts/gen/xp.ts` output SP2 uses, copied into `server/src/tracker/skills.ts` by the
   generator" describes a generator that does not exist: `scripts/gen/` holds `atlas.ts` and
   `collision.ts` only, and the curve is computed at module load in `web/src/stats/skills.ts`.
   Replaced by the equality test in section 11.
4. **SP3 section 4, ingest step 1.** "look up `gameAccounts/{uid}` for the game name" reads a
   legacy collection that SP6's store migrates away and deletes. Replaced by the
   `characters/{characterId}` resolution in section 5.
5. **SP3 section 4, the sender.** "The shell sends snapshots from the `xp-tracker` plugin (SP2
   extension point)" is replaced by the shell session layer. The SP2 extension point in question,
   `ctx.snapshots.push(reason)`, was reserved and never built, and this document retires the
   reservation rather than implementing it. See ruling R1.
6. **SP3 section 4, `POST /api/tracker/update/:gameName` "(gated page, no token)".** Every route
   carries a principal in the current router. Replaced by `POST /api/tracker/refresh`, human
   principal, own character only. Its SP4-dependent half, asking a live session for a fresh
   snapshot over the `/tab` socket, stays out of scope: SP4c owns that socket and it does not
   exist. The route asks the requesting browser's own live session, which covers the only case that
   matters today, and returns the stored snapshot with `stale: true` otherwise, exactly as SP3 said
   it would before SP4 landed.
7. **SP3 section 6, the panel.** "`hiscores` plugin (SP2 slot): name field defaulting to the
   player, per-skill table, Update button" becomes a section inside the XP Tracker panel, with no
   name field: an account sees its own characters, and any other character is reached through the
   public page. See ruling R3.
8. **SP3 section 6, "sharing `tokens.css` and the frame's header".** The token layer is
   `web/src/styles/` after the shell v2 entry, and the shared header is a component of the living
   library.
9. **SP3 section 7, backup.** The Task Scheduler entry and the container cron are replaced by the
   in-process `VACUUM INTO` tick in section 4. There is no Windows VM deployment any more, and no
   cron in any container under `deploy/docker/`.
10. **SP3 section 1, "Everything served by the existing front server; no new process."** Still
    true, and worth keeping in view: this entry adds a database and eight routes to a process that
    already runs, and nothing else.

SP3's sections 1 (goals and non-goals), 2 (why client snapshots) and 5 (the read API shapes) stand
as written, except where the table in section 6 changes a principal.

## 13. Rulings, each with what it costs if wrong

| # | Ruling | Cost if wrong |
|---|---|---|
| R1 | Snapshot capture lives in `web/src/stats/snapshots.ts`, wired in `stage.ts` off the session manager's existing `login`, `logout` and `disconnect` subscriptions. `PluginContext` gains **no** `snapshots` member, and SP2's reservation of that seam is retired rather than implemented. | One method on `PluginContext` delegating to the same module, if a third-party plugin ever needs to force a snapshot. The audit's 3.4 fact 2 called this layer "a plugin-context extension"; it is cheaper as a shell module, and no plugin has ever needed it. |
| R2 | The tracker's subject is the character id, not the game name. Game names are a unique label carried alongside. | One column and one migration, if a rename or a name reuse ever needs a different identity. |
| R3 | No twelfth strip glyph. The shell surface is a Hiscores section inside the XP Tracker panel, plus the standalone page. | One manifest entry and one SVG path, if the owner would rather have the icon and break the eleven. |
| R4 | 21 skills on the wire, in the BLOB and in the server's table; the client's 25-slot array is sliced at capture and its length asserted at ingest. | A schema migration widening two BLOBs and a wire version bump, if this world ever gains a 22nd skill. |
| R5 | Retention is 48 hours of every snapshot, then hourly to 30 days, then daily forever; `latest`, `latest_skill` and `records` are never pruned. | Sub-hourly history older than two days is gone and cannot be recovered. Reversing the policy only affects rows written after the change. |
| R6 | Detail routes are `human` principal and own-account only; the public table is character-scoped and gate-scoped. Agent tokens read neither. | One line in `principalRule` and one case in the auth composition test, when SP4c settles agent reads. |
| R7 | Categories are a registry whose entries declare a subject kind (`character` or `account`), so SP10's account-scoped wealth categories need no new page, route or table. | One column and one join, if the account subject turns out to be unnecessary. |
| R8 | `battlebots_wins` is registered by SP3b as a projection over the battlebots store, guarded by an `available()` check on the database file. The battlebots entry ships nothing further for it. | One query, if battlebots' row shape changes between its entry and this one. The guard means an absent store degrades to a hidden category rather than a 500. |
| R9 | The front server needs a durable `server-data` volume, which it does not have. Whichever of battlebots and SP3b lands first adds it; the second asserts it. | Without it the hiscores table silently empties on every release, which is exactly the "gates report green on things that do not work" failure the audit describes. |
| R10 | The server keeps its own copy of the 21 names and the XP curve, married to the web copy by an equality test, rather than a new generator under `scripts/gen/`. | Two copies of a constant. The test is what stops them diverging, and it fails loudly if either moves. |
| R11 | `/hiscores` is a fourth Vite entry and a prefix route classified like `/styleguide`, covered by the gate cookie. | One route case and one build input, if it should instead be a view inside the app shell. |
| R12 | The ingest trusts the player's own browser; the sanity checks bound the damage and are not an anti-cheat system. | Nothing while the world is gated. If it ever opens, the ingest needs an authoritative feed, which SP3 section 7's adapter interface anticipates and this document keeps. |
| R13 | SP3b closes SP2's missing `hiscores` Tier 1 plugin, as a panel section. The SP2 reconciliation section that audit C31 asks for says so. | One sentence in that reconciliation section. |

**Open owner questions: none.** Every question SP3 left implicit and every choice this document
faced is ruled above. The two a reader might expect to see gated, the retention policy (R5) and the
missing strip icon (R3), are both one-line reversals and neither blocks a later entry.

## 14. What this does not do

- **Wealth or coins.** That is SP10, the next entry. SP3b ships the seam SP10 registers into and
  nothing else.
- **A battlebots wins table beyond the projection.** No new match data, no new store, no in-game
  hiscore board. The board object in the battlebots spec belongs to that entry, if it is ever built.
- **Efficient hours played.** Needs curated rate tables. SP3 already said later, and later has not
  arrived.
- **Public exposure outside the gate.** Every route here sits behind the gate cookie or a
  principal, as everything else in the product does.
- **An engine-authoritative feed.** The adapter interface stays a one-function shape that a second
  ingest path could satisfy; nothing builds it.
- **The `ctx.snapshots` plugin seam.** Retired, not implemented. See R1.
- **Cross-account anything.** No friends lists, no clans, no comparison of two accounts' private
  gains, no "who is online" beyond the player count SP6 already ships.
- **XP-per-hour or gains leaderboards.** The gains data exists per account and is private; ranking
  people by it is a product decision nobody has made.
- **Anti-cheat.** See R12.
