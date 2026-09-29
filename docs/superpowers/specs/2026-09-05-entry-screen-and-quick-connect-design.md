# Idlescape — Wishlist: Entry Screen, Quick Connect, Connection Monitor

Date: 2026-09-05
Status: approved in conversation 2026-09-05; awaiting written review
Amends: `2026-09-04-idlescape-platform-design.md` sections 6.1, 6.3, 13 and plan Tasks 11, 13, 14
Scope: three related features agreed in one brainstorming session. Feature 1 replaces the
sign-in card. Features 2 and 3 settle the pairing surface that sub-project 2 (pairing and the
MCP gateway) will consume, and ship the parts of it that make the Connect card real. The MCP
gateway itself stays in sub-project 2.

## 1. Decisions recorded

| Topic | Decision |
|---|---|
| Entry buttons | Two: "Connect to Claude" (left) and "Login" (right). RuneScape title convention: the existing-user action sits right. |
| Enablement | Both disabled until Firebase Auth reports a user. If the first auth event has no user, the page signs in anonymously itself; buttons enable on the resulting event. No explicit "play as guest" click. |
| Client start | Nothing about the game client loads before the bridge call succeeds, which already requires a Firebase user. |
| Guest warning | Text under the buttons for anonymous users: progress may be lost unless an account is created. |
| "Connect to Claude" | Shows the connect card without entering the game. "Login" stays available from the card. |
| Pairing URL | One per-account, single-use URL `https://osrs.scotho.com/pair/<token>` that both identifies the player and carries the skill document Claude needs. |
| Skill retrieval | Claude fetches the URL. Non-browser requests get `text/markdown`: a complete skill document with the token embedded. Browsers get a short human page. |
| Connection monitor | The Connect side panel becomes "Claude Connection": pairing card on top, live connection monitor below. Default plugin, always in the icon strip. |

## 2. Feature 1: entry screen

Replaces the `signin` state and card described in platform spec 6.1 and plan Task 11 step 11.

### 2.1 Layout

Centred card, three zones top to bottom.

1. **Identity strip.** One line showing the resolved identity: "Guest · guest_ab12cd" (game
   name once the bridge has run, otherwise "Guest") or the email address. To the right, a link:
   "Sign in with email" for a guest with no email, "Switch account" for an email user. The link
   expands the existing email sign-in, sign-up, and reset forms inline below the strip. For a
   guest, sign-up uses `linkWithCredential` so the character carries over.
2. **Buttons row.** Left: "Connect to Claude". Right: "Login". Same size, primary style on
   "Login". While disabled, both show a muted "checking account…" caption underneath.
3. **Guest warning.** Shown only while the user is anonymous:
   "You're playing as a guest. Progress is stored in this browser and is lost if you clear it or
   switch devices. Create an account to keep it." Hidden for email users.

### 2.2 Behaviour

- Boot: gate check as today. If the gate is open, the page enters `entry` and subscribes to
  `onAuthStateChanged` before rendering the buttons, so they never render enabled first.
- First auth event with a user: enable both buttons, render the identity strip.
- First auth event with no user: call `signInAnonymously`. Buttons stay disabled until the
  next event. If the call rejects, buttons stay disabled and the error line reads
  "Guest play is unavailable right now. Sign in with email or try again." with a retry link.
- "Login": call `POST /api/bridge` with the ID token, then start the client exactly as plan
  Task 14 does. Errors show in the card's error line; the state stays `entry`.
- "Connect to Claude": mint a pairing token (section 3.2), then replace the buttons row with the
  connect card (section 3.5). The card keeps a "Login" button so the player can continue into
  the game and a "Back" link to return to the buttons row.
- Sign-out from anywhere returns to `entry`, where the next auth event has no user and the
  page creates a fresh guest. The Account panel keeps its sign-out and attach-email flows.

### 2.3 State machine

`AppState = 'gate' | 'entry' | 'playing' | 'offline'`. The connect card is a sub-view inside
`entry`, tracked by an `entryView: 'buttons' | 'connect' | 'email'` value on the same store,
not by a new top-level state. `main.ts` keys screens by `AppState` as today.

## 3. Feature 2: quick connect via the pairing URL

Resolves platform spec section 13 (token format and `/pair/<token>` shape). The MCP gateway
that eventually accepts the bearer token is sub-project 2; the routes below ship earlier so the
connect card works end to end up to "paired".

### 3.1 Token model

Firestore, admin SDK only unless stated.

```
pairTokens/{token}    { uid, createdAt, expiresAt, usedAt: Timestamp | null, agentTokenId: string | null }
agentTokens/{id}      { uid, label, createdAt, lastSeenAt: Timestamp | null, revokedAt: Timestamp | null, secretHash }
```

- Pair token: 32 characters from the URL-safe alphabet `[A-Za-z0-9_-]`, 15-minute expiry,
  single use. Minting a new one marks the previous unused token for that uid as expired.
- Agent token: 40 characters, same alphabet, returned once at exchange and stored only as a
  SHA-256 hash. `label` defaults to the hostname or session name Claude sends at exchange, or
  "Claude Code" if absent.
- Rules: `pairTokens/{token}` and `agentTokens/{id}` are readable by the owning uid so the
  browser can listen for state changes. No client writes to either collection.

### 3.2 Routes

| Route | Auth | Behaviour |
|---|---|---|
| `POST /api/pair` | Firebase bearer | Mint. Returns `{ pairUrl, token, expiresAt }`. |
| `GET /pair/:token` | none, gate exempt | Content negotiation. `Accept` preferring `text/html` returns the human page. Anything else returns `text/markdown; charset=utf-8` with the skill document. Expired or used tokens return the same shapes with a plain "this link has expired, press Connect to Claude again" body and status 410. |
| `POST /api/pair/:token/exchange` | none | Body `{ label? }`. In one transaction: verify unused and unexpired, create `agentTokens/{id}`, set `usedAt` and `agentTokenId`. Returns `{ agentToken, gatewayUrl, gameName }` once. Spent or unknown tokens return 410 with `{ error: "token_spent" \| "token_unknown" }`. |
| `POST /api/agent-tokens/:id/revoke` | Firebase bearer, owner only | Sets `revokedAt`. Used by the connection monitor. |

`/pair/*` is exempt from the gate middleware because Claude's fetch carries no browser cookie.
The token itself is the credential for that route, and it exposes no game name or secret. The
gate still guards the shell page, the cache proxy, and the WebSocket.

### 3.3 Server modules

Under `server/src/pair/`, each under 400 lines:

- `token.ts`: random token generation, expiry arithmetic, hashing. Pure.
- `store.ts`: Firestore transactions for mint, lookup, exchange, revoke.
- `routes.ts`: the four routes above plus content negotiation.
- `skill.md`: the skill document template, read once at boot, with `{{TOKEN}}` and
  `{{ORIGIN}}` substitutions.
- `human.html`: the browser page for `/pair/:token`, one substitution for the origin.

`router.ts` gains a `pair` classification for `/pair/*`, `/api/pair*`, and `/api/agent-tokens/*`.

### 3.4 Skill document

Returned by `GET /pair/:token` for non-browser clients. The player pastes the URL into an
active Claude Code session and says "connect to this". Contents, in order:

1. Frontmatter: `name: idlescape`, `description:` triggers on playing, checking, or talking
   about the player's Lost City character on idlescape.
2. What idlescape is in three sentences, and the co-pilot rule: the human plays; Claude
   observes, answers, and acts only when asked.
3. The exchange step: one `POST {{ORIGIN}}/api/pair/{{TOKEN}}/exchange` with an optional
   label, the response shape, and the instruction to report a 410 back to the user verbatim.
4. Registering the gateway: `claude mcp add --transport http idlescape {{ORIGIN}}/mcp
   --header "Authorization: Bearer <agentToken>"` at user scope, so the connection follows
   the person, not the folder.
5. Saving the skill: write this document, minus the exchange section and with the token
   line removed, to `~/.claude/skills/idlescape/SKILL.md` so future sessions load it
   without the URL.
6. Verifying: list the MCP tools and confirm one named `idlescape` responds; tell the user
   the character's game name from the exchange response.
7. A short pointer to the human guide at `{{ORIGIN}}/connect` for troubleshooting.

Until sub-project 2 deploys the gateway, step 4 registers a URL that returns 503 with a
"gateway not deployed yet" body, and step 6 tells the user so. The browser still flips to
"paired" because the exchange succeeded.

### 3.5 Connect card

Shared component used by the entry screen and the Claude Connection panel.

- Pairing URL in a read-only field with a copy button and a countdown to expiry.
- Hint line: "Paste this into your Claude Code session and say: connect to this."
- Status line driven by a Firestore listener on `pairTokens/{token}`: "Waiting for Claude…",
  "Paired as <label>", or "Expired" with a "New link" button that re-mints.
- Link "How do I connect?" to `/connect`, the human guide (section 3.6).
- On the entry screen only: a "Login" button and a "Back" link.

### 3.6 Human quick connect guide

`GET /connect` serves a static markdown page rendered to HTML by the front server with the
same tokens as the shell. Gate cookie required like the rest of the shell. Sections:

1. What you need: an account on idlescape (guest is fine) and Claude Code installed.
2. Steps: open idlescape, press "Connect to Claude", copy the link, paste it into Claude
   Code, say "connect to this", wait for the status to read "Paired".
3. What Claude can and cannot do once paired, and that the human stays in control.
4. Managing connections: the Claude Connection panel lists paired sessions and revokes them.
5. Troubleshooting: link expired, "gateway not deployed yet", revoked token, guest account
   lost after clearing storage.

The markdown lives in `server/src/pair/guide.md`. The same file, with `{{ORIGIN}}` applied, is
copied into the repository `README.md` under a "Connecting Claude" heading by the build script.

## 4. Feature 3: Claude Connection panel

Replaces the "Connect" row in platform spec 6.3. Default plugin, always present in the icon
strip, positioned directly under the Claude chat icon.

| Region | Contents |
|---|---|
| Pairing card | Section 3.5, minus the entry-only buttons. Shown when no active agent token exists, or on "Pair another". |
| Sessions | One row per non-revoked `agentTokens` document for the uid: label, created, last seen (relative), a green or grey dot for seen within 60 s, and a "Revoke" button with confirm. Empty state: "No Claude session paired." |
| Gateway | Gateway reachability from `/api/health`, which gains `gateway: "up" \| "down" \| "not_deployed"`. Last tool call time and name once sub-project 2 reports them through a dedicated `agent` hook event. |
| Link health | Client fps, round-trip ms, and WebSocket state, mirrored from the footer so one panel answers "is anything wrong". |

The top-right canvas overlay "pairing status" from platform spec 6.2 shows a one-word summary
of this panel: "Claude: paired", "Claude: waiting", or nothing when no token exists.

The panel listens to Firestore for `agentTokens` where `uid == current` and re-renders on
change. Revoke calls the route in 3.2 and the row disappears on the next snapshot.

## 5. Error handling

| Failure | Behaviour |
|---|---|
| Firebase never resolves or throws | Buttons stay disabled. Error line with retry. Client never loads. |
| Anonymous sign-in rejected | Buttons stay disabled. Message offers email sign-in and retry. |
| Mint fails | Connect card shows the error with "Try again"; buttons row remains reachable via "Back". |
| Token expired or spent on fetch | 410. Markdown and HTML both say to press "Connect to Claude" again. |
| Exchange on spent or unknown token | 410 JSON; the skill document instructs Claude to relay it verbatim. |
| Revoke of a token not owned by the caller | 404, so existence is not leaked. |
| Bridge fails after "Login" | Unchanged: error on the entry card, state stays `entry`. |
| Gateway not deployed | `/api/health` says `not_deployed`; panel and skill document say so plainly. |

## 6. Testing

- **Bun, server**: token alphabet and length; expiry arithmetic; mint invalidates the previous
  unused token; exchange succeeds once and returns 410 on the second call, both against the
  Firestore emulator; content negotiation returns markdown for `Accept: */*` and HTML for a
  browser Accept string; revoke by a non-owner returns 404.
- **Vitest, web**: buttons render disabled before the first auth event; enable after a user
  event; anonymous sign-in is called exactly once when the first event has no user; warning text
  is present for anonymous users and absent for email users; "Connect to Claude" swaps to the
  connect card and "Back" restores the buttons; connection panel renders rows from a fixture
  snapshot and hides revoked ones.
- **Playwright**: gate, entry screen resolves to a guest with both buttons enabled and the
  warning visible, "Connect to Claude" shows a URL, a `fetch` of that URL with `Accept: */*`
  returns markdown containing the token, "Login" reaches Tutorial Island.
- **Manual, documented in the guide**: paste the URL into a fresh Claude Code session and
  confirm the skill file exists and `claude mcp list` shows `idlescape`.

## 7. Plan amendments

- Task 11: `signin` becomes `entry`; partial `signin.html` becomes `entry.html` with the three
  zones; `main.ts` performs the auto-guest step; new state tests from section 6.
- Task 13: the Connect panel becomes Claude Connection per section 4; the shared connect card
  component is added under `web/src/panels/connectCard.ts`.
- Task 14: unchanged in behaviour, but the client host is invoked only from the "Login" button.
- New Task 13b (server): `server/src/pair/*`, router classification, rules for `pairTokens` and
  `agentTokens`, `/connect` guide route, `/api/health` gateway field.
- Sub-project 2 inherits `agentTokens` as its bearer store and `/mcp` as its gateway path.

## 8. Out of scope

- The MCP gateway, its tools, and anything Claude does in game.
- OAuth for claude.ai connectors; the token layer above stays compatible with adding it.
- Multiple simultaneous pair tokens per account.
- Rate limiting on `/pair/:token` beyond the existing per-IP cooldown helper.
