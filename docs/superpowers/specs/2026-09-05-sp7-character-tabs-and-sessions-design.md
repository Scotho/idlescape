# Idlescape — SP7: Character tabs, one client per character, name-first login

Date: 2026-09-05
Status: implemented by `docs/superpowers/plans/2026-09-05-sp7-character-tabs-and-sessions.md`
(owner requirements were received in conversation 2026-09-05; this document records them)
Amends: `2026-09-05-multi-character-platform-design.md` section 5 (sessions and the switcher),
section 6 (entry flow: guests now pick a name), section 4 (guest limit becomes 2)
Depends on: SP6 (characters store, routes, principal, home page, gate, Characters panel)

## 1. Owner requirements (verbatim intent)

1. When a new account is created, or a guest account logs in for the first time, show a
   character-name selection screen and make the player choose a name. Then load the client and
   the panel.
2. The game client's login screen has only a Login button; the username and password fields are
   gone.
3. Characters can log in and out, but a client instance is bound to the character it was logged
   in for.
4. Tabs across the top of the game view: one per created character, showing the character name
   and whether it is logged in, switching between active characters.
5. Limits: a guest account can have two characters, a registered account three. On a guest
   account the third slot is a disabled tab with a tooltip. Further "Add more" slots are disabled
   with the text "coming soon".
6. The Characters side panel stays as specified in SP6.

Rulings recorded after this document was first written (2026-09-05, conversation):

- The tabs live **in the frame**, across the top of the game view, not in the side panel.
- Tabs only ever represent **created** characters; the remaining slots are capacity, not characters.
- Limits stay guest 2 / registered 3, read from `GET /api/characters`.
- A guest's third slot is a **disabled** tab with the tooltip "Create an account to unlock a third character".
- Any further "Add more" slot is **disabled** with the text "coming soon".
- The Characters side panel stays as SP6 built it; only its "Log in as <name>" button becomes "Open tab".
- Client patches are numbered from **22** (SP4a already uses 17-21).

## 2. Decisions

| Topic | Decision |
|---|---|
| Guest names | Guests choose a name like registered users: the gate always shows the naming form when the account has no character. The random `guest_` name path is removed from the gate; the server keeps accepting a missing name for guests only as a fallback for API callers. |
| Limits | `CHARACTER_LIMITS = { anonymous: 2, password: 3 }` (SP6 fix wave). The tab strip always renders three slots plus one "Add more" slot. |
| Where tabs live | A `#character-tabs` strip in the frame, between the title bar and the stage, rendered by the shell (not a plugin), so it exists before any plugin mounts. |
| Tab contents | Name, a status dot and text (`offline`, `connecting`, `online`), the active tab highlighted. Only created characters get real tabs. Empty slots within the limit show "+ New character" and open the naming form in the Characters panel; slots beyond the limit are disabled: for a guest the third slot carries the tooltip "Create an account to unlock a third character"; the fourth slot on every account reads "coming soon". |
| One client per character | Each created character that has been opened gets its own same-origin iframe (`web/play.html`), created lazily on first activation, kept for the tab's lifetime, and bound to that character: the iframe's client only ever logs in as that character. Switching tabs changes which iframe is visible and focused; the hidden ones keep running with rendering suspended (spec section 5 patch set). |
| Login screen | The bound client's title screen shows one centred button, "Login", which starts the login for its character with the credentials the parent armed (`armLogin`). No username or password fields. The client also exposes `hooks.login` for tests and agents. Logging out returns that client to its title screen with the same single Login button. |
| Status source | Each iframe's `getState()` polled at 1 s by the session manager; the tab strip and the Characters panel both read the manager. |
| First-login flow | `home` → sign-in → gate: zero characters → naming form (guest and registered) → create → the first tab is created, its iframe boots, and its title screen shows "Login". The owner's "then load into the client and panel" is satisfied by auto-pressing Login for the character the player just created; later sessions stop at the title screen until the player presses Login. |

## 3. Architecture

```
web/index.html            frame: title bar, #character-tabs strip, #stage with N <iframe class="client-frame">
web/play.html             minimal document: #canvas + client bundle; exposes window.idlescape.{client,plugins}
web/src/sessions/manager.ts   CharacterSessionManager: open(character), activate(id), list(), active(), on('change')
web/src/frame/characterTabs.ts  renders #character-tabs from manager + character list + limits
web/src/main.ts           composition: manager replaces the single hooks/clientHost; plugins get the active session's hooks
client/src/hooks/*        armLogin(gameName, secret, label), setRenderSuspended(v), setAttended(v); title button "Login"
client/src/client/Client.ts   patches: title button + hit test, renderSuspended guard in mainredraw(), refresh() on resume
```

- `CharacterSession = { character, iframe, hooks: ClientHooks | null, state: 'booting' | 'title' |
  'connecting' | 'online' | 'offline', startedAt, lastStateAt }`. `open()` creates the iframe and
  waits for `idlescape:client-ready` inside it, then calls `armLogin`. `state` is derived from
  `getState().loggedIn`/`sceneReady` plus the `login`/`logout`/`disconnect` hook events.
- The parent never loads the client bundle itself any more; `web/src/clientHost.ts` becomes the
  per-iframe loader used by `play.html`.
- Plugin context: `ctx.client()` returns the active session's hooks; `wireHooks` runs per session
  with the character id in every event so XP and loot trackers stay per character.
- Credentials: the parent mints `POST /api/characters/:id/session` when a tab is activated for the
  first time and passes them to the iframe through `contentWindow.idlescape.client.armLogin`.
  Nothing is stored in the iframe URL.
- Engine constraints honoured: distinct characters have distinct names, so N online clients are
  fine; the same character is never logged in from two iframes because one iframe is bound to one
  character.
- SP4a interplay: `createLocalTransport` binds to one session's hooks and that iframe's canvas; a
  `TasksApi` is built per session with `characterId` fixed, so a run belongs to the character it
  started on. `window.idlescape.tasks` stays a parent-document object -- a router
  (`web/src/tasks/router.ts`) that forwards to the active session's api, except run-addressed
  calls, which go to the api that owns the run. The router also owns the subscriptions: it listens
  to every attached api and re-publishes only the active session's status and trace, so the run
  banner and the Tasks panel subscribe once and still follow the tab.

## 4. Client patches (anchored per `client/PATCHES.md`)

| # | Site | Change |
|---|---|---|
| 22 | private fields (patch 2) | `armedUser`, `armedPass`, `armedLabel`, `renderSuspended = false`, `attended = false`. The armed credentials are a separate copy because `logout()` clears `loginUser`/`loginPass`. |
| 23 | `installHooks` bridge (patch 3) | `armLogin(gameName, secret, label)` sets `headlessTitle` and stores the credentials and the label without logging in; `loginArmed()` copies the armed pair into `loginUser`/`loginPass` and arms `pendingHeadlessLogin`, or resolves `{ ok: false, code: -1, reason: 'No character armed.' }` when nothing is armed; `setRenderSuspended(v)` sets the flag and calls `refresh()` when `v` is false; `setAttended(v)` sets the flag. The existing `login` closure also fills the armed copy, and re-labels whenever the game name differs from the armed one. |
| 24 | `titleScreenDraw()` (patches 8/9) plus a new `drawArmedLoginButton()` | Under `headlessTitle`, `loginscreen === 0` draws `armedLabel` and then one centred `imageTitlebutton` labelled "Login" instead of "Waiting for idlescape..."; both are drawn only while something is armed, so the button always matches the hit test. `loginscreen === 2` keeps `loginMes1/2` and offers the same button as defence in depth (nothing sets `loginscreen = 2` while `headlessTitle` is set, so it is unreachable today). No username or password fields are ever drawn. |
| 25 | `titleScreenLoop()` (patch 7) plus a new `armedLoginHit()` | Under `headlessTitle`: a pending `pendingHeadlessLogin` still fires `login(loginUser, loginPass, false)` first, which is the path `hooks.login` and `hooks.loginArmed` use; otherwise the armed Login button is hit-tested, `loginUser`/`loginPass` are re-seeded from the armed copy (`logout()` cleared them) and the same `login(...)` runs. The button geometry mirrors the stock title buttons. |
| 26 | `mainredraw()` (after the error check) | `if (this.renderSuspended && this.ingame) return;` - only drawing is suspended, `mainloop()` keeps reading packets, moving entities and building maps. |
| 27 | idle block in `gameLoop()` | The stock 90 s `IDLE_TIMER` condition is kept and its body moves under `if (!this.attended)`, with an `else { this.idleTimer = now; }` so the timer stays fresh while attended; leaving it stale would fire the block on every tick, a burst of `IDLE_TIMER` packets with `logoutTimer` pinned at 250, the moment `attended` flips back off. The negated branch is the contract: `setAttended` "suppresses the client's own 90 s idle-logout packet while true" and the shell sets it true for every session it owns, so a shell character never sends the packet. Production-only for the engine effect (`node.debug: true` makes `IdleTimerHandler` a no-op, phase-a critic report row 10); the client-side `logoutTimer = 250` effect applies today. |

`bundle.ts` reserves `armLogin`, `loginArmed`, `setRenderSuspended`, `setAttended`.

## 5. Tab strip behaviour

- Slots: three character slots (`TAB_SLOTS = 3`, always drawn whatever the account's limit is)
  plus one "Add more" slot, in order of `createdAt`.
- Real tab: name, status dot (`grey` offline, `amber` connecting, `green` online), status text,
  tooltip `<name> · <status>`. Click → `manager.activate(id)` (opens the iframe on first use).
  The active tab is highlighted; keyboard: Left/Right (and Home/End) move between the real tabs
  only.
- Empty slot within the limit: "+ New character" → opens the Characters panel's create form.
- Guest third slot: disabled, tooltip "Create an account to unlock a third character".
- Fourth slot ("Add more"): disabled, text "coming soon".
- Deleting a character (Characters panel) closes its iframe and removes its tab; the active tab
  moves to the previous character.

## 6. Testing

- Unit (vitest): session manager state derivation from hook events; tab strip rendering for
  guest 0/1/2 characters and registered 0..3 (slot labels, disabled states, tooltips); activation
  switches visibility and focus; delete removes the tab.
- Client (bun test): hook bridge contract for `armLogin`, `setRenderSuspended`.
- Browser (Playwright, extends `web/e2e`): guest first login lands on the naming form and cannot
  proceed without a name; after creating, the tab shows the name, the client title screen shows a
  single Login button and no fields, pressing it enters the world (pixel checks as in the render
  regression step); a registered user with two characters opens both tabs, both are online at
  once, switching keeps the first session's position; guest sees the disabled third tab with the
  tooltip and the "coming soon" slot; logging out in one tab leaves the other online.

## 7. Out of scope

The mute toggle and `setAudioMuted` (main spec section 5) are not part of SP7 as built: neither
the decision table above nor the owner requirements mention them, so they move to a later
sub-project. Background-tab throttling and the 3-client memory measurements are **not** deferred:
they are Task 11 of this plan.
