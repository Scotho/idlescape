# Idlescape — SP3: Hiscores and XP tracker service

Date: 2026-09-05
Status: approved 2026-09-05
Scope: a hiscores system hosted by our front server, fed by client snapshots, with a
CrystalMathLabs-style tracker (gains over periods, records, update on demand) and a Hiscores
plugin panel. Depends on SP2 (`xp-tracker` plugin) and the SP1 bridge (uid to game name).

## 1. Goals and non-goals

Goals

- Overall and per-skill hiscores for every character created through the bridge.
- A player page with XP and level gains over 1, 7, 30 days and all time, per skill, plus
  records (best day, week, month) per skill.
- Updates on login, logout, every ten minutes while playing, and on request from the page or
  the panel.
- Everything served by the existing front server; no new process.

Non-goals

- Efficient-hours-played (EHP) rates. Needs curated rate tables; later.
- Public exposure outside the gate. Pages sit behind the gate until the gate is removed.
- Engine-side authoritative feed. The ingest is designed to accept one later.

## 2. Why client snapshots

The engine writes its `hiscore` and `hiscore_large` tables only in login-server mode
(`LoginServer.ts`), which the single-world configuration disables, so today nothing is
recorded. Options were: enable the multi-process login server and read the engine's SQLite;
ingest snapshots reported by our client hooks; patch the engine. Decision 3 in the roadmap
chose snapshots: all players use our shell, the world is gated, and the ingest is source
agnostic. Spoofing requires the player to run code in their own devtools, which is acceptable
for a private server and is also bounded by the sanity checks below.

## 3. Data model

Front-server SQLite at `server/data/tracker.db` (`bun:sqlite`, WAL mode, `busy_timeout`
5000). Schema in `server/src/tracker/schema.sql`, applied at boot with a `schema_version`
table.

```sql
players   (id INTEGER PK, game_name TEXT UNIQUE, uid TEXT, created_at INTEGER, last_seen INTEGER)
snapshots (id INTEGER PK, player_id INTEGER, ts INTEGER, source TEXT,      -- 'login' | 'logout' | 'interval' | 'request'
           total_xp INTEGER, total_level INTEGER,
           xp BLOB,        -- 23 x int32 little-endian
           levels BLOB)    -- 23 x uint8
latest    (player_id INTEGER PK, snapshot_id INTEGER, total_xp INTEGER, total_level INTEGER, xp BLOB, levels BLOB)
records   (player_id INTEGER, skill INTEGER, period TEXT, gained INTEGER, period_start INTEGER, PRIMARY KEY (player_id, skill, period))
```

Indexes: `snapshots(player_id, ts)`, `latest(total_xp DESC)`. Rankings per skill are computed
by SQL over `latest` using the unpacked skill column via a generated view or by maintaining
`latest_skill(player_id, skill, xp, level)` (23 rows per player). Choose `latest_skill`; it
keeps rank queries to one indexed scan.

Skill ids and the XP table come from the same `scripts/gen/xp.ts` output SP2 uses, copied
into `server/src/tracker/skills.ts` by the generator so both packages agree.

## 4. Ingest

`POST /api/tracker/snapshot`, `Authorization: Bearer <Firebase ID token>`, body
`{ reason: 'login' | 'logout' | 'interval' | 'request', xp: number[23], levels: number[23], clientCycle: number }`.

Server steps:

1. Verify the token, look up `gameAccounts/{uid}` for the game name (cached in memory for
   ten minutes; the bridge already writes it). Reject 403 if the uid has no character.
2. Sanity checks against `latest`: every skill XP non-decreasing; total gain since the last
   snapshot at most `MAX_XP_PER_HOUR * elapsedHours + slack`, with `MAX_XP_PER_HOUR` 250 000
   (well above any legitimate 2004 rate) and slack 50 000 for the first snapshot after login;
   levels consistent with XP per the table. Failing snapshots are stored in a
   `rejected` table with the reason and do not update `latest`; the response says so.
3. Insert the snapshot, update `latest` and `latest_skill`, recompute affected `records` rows.
4. Rate limit: one accepted snapshot per player per 60 seconds except `logout`.

The shell sends snapshots from the `xp-tracker` plugin (SP2 extension point): on the hooks
`login` event, on `logout` and `disconnect`, on a ten-minute interval while logged in, and when
the player presses Update on the panel or page. The shell batches nothing; each call is one
snapshot.

`POST /api/tracker/update/:gameName` (gated page, no token) asks the front server to request a
fresh snapshot from that player's live session if one is connected to the `/tab` socket
(SP4); otherwise returns the latest stored snapshot with `stale: true`. Before SP4 lands this
route only returns the stored snapshot.

## 5. Read API

- `GET /api/hiscores?skill=<0..22|overall>&page=<n>&size=25` → ranked rows
  `{ rank, gameName, level, xp, updatedAt }`.
- `GET /api/hiscores/player/:gameName` → latest per skill with ranks.
- `GET /api/tracker/:gameName?period=1d|7d|30d|all` → per-skill gains, computed as latest
  minus the first snapshot at or before `now - period` (or the earliest snapshot if none).
- `GET /api/tracker/:gameName/records` → records table.
- `GET /api/tracker/:gameName/history?skill=<id>&days=<n>` → downsampled series for a chart.

All routes are gated, cached in memory for 30 seconds, and return JSON only.

## 6. Pages and panel

- `web/hiscores.html` second Vite entry with `web/src/hiscores/` sharing `tokens.css` and the
  frame's header. Routes handled client-side: `/hiscores`, `/hiscores/skill/:id`,
  `/hiscores/player/:name` (tracker tabs: gains, records, history chart). The front server
  serves the entry for those paths. Charts use inline SVG, no library.
- `hiscores` plugin (SP2 slot): name field defaulting to the player, per-skill table, Update
  button, "open full page" link. The `xp-tracker` panel gets a footer link to the player's page.
- Virtual levels above 99 shown on the player page only.

## 7. Operations

- Backup: `scripts/backup-tracker.ps1` runs `VACUUM INTO` to `server/data/backups/` daily via
  the same Task Scheduler pattern as the engine; the VM version is a cron in the container.
- Migration path to an authoritative feed: a second ingest adapter that reads the engine's
  `hiscore` tables when `login.enabled` is true, writing the same `snapshots` rows with
  `source: 'engine'`. Not built now; the adapter interface is one function
  `ingest(playerName, xp[], levels[], source, ts)` that both paths call.

## 8. Testing

- Unit: sanity checks (monotonic, rate cap, level consistency), gains over periods with fixture
  snapshots, records recomputation, ranking ties (earlier `updatedAt` wins).
- Integration: emulator-authenticated `POST /api/tracker/snapshot` round trip into a temp
  database; read routes against the same database.
- Browser: player page renders gains after two snapshots; panel Update triggers a snapshot.
