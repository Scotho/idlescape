# web/src/vendor/PATCHES.md — local changes to vendored rs-sdk code

Upstream: https://github.com/MaxBittker/rs-sdk at 56b73e08fc01a1d683d7a86d145a494ae945d071 (MIT).
`rs-sdk/LICENSE` is the upstream MIT text, unchanged (byte-identical to the copy under
`client/src/vendor/rs-sdk/`).

What is vendored here is rs-sdk's **sdk layer** — the agent-facing game API. Upstream it talks
to a browser client over a gateway WebSocket; here it talks to our `Transport`
(`web/src/agent/types.ts`), which the local transport implements directly over the client's
hooks v2 in the same document. The gateway, its message envelope, reconnection, browser
auto-launch, status polling and screenshot round-trip are all deleted rather than reimplemented.

## Files

| File | Origin | Changes |
|---|---|---|
| `rs-sdk/sdk/types.ts` | upstream `sdk/types.ts` | provenance header only |
| `rs-sdk/sdk/actions.ts` | upstream `sdk/actions.ts` | provenance header only |
| `rs-sdk/sdk/actions-helpers.ts` | upstream `sdk/actions-helpers.ts` | provenance header only |
| `rs-sdk/sdk/action-quantity.ts` | upstream `sdk/action-quantity.ts` | provenance header only |
| `rs-sdk/sdk/spells.ts` | upstream `sdk/spells.ts` | provenance header only |
| `rs-sdk/sdk/trade-helpers.ts` | upstream `sdk/trade-helpers.ts` | provenance header only |
| `rs-sdk/sdk/chunking.ts` | upstream `sdk/chunking.ts` | provenance header only |
| `rs-sdk/sdk/chat-history.ts` | upstream `sdk/chat-history.ts` | provenance header only |
| `rs-sdk/sdk/index.ts` | upstream `sdk/index.ts` | rewired onto `Transport`; table below |
| `rs-sdk/sdk/pathfinding.ts` | **ours, not vendored** | the same contract over our own generated collision bitset; table below |

Not copied: `runner.ts`, `cli.ts`, `chat.ts`, `bug-report.ts`, `formatter.ts`,
`generate-api-docs.ts`, `fetch-collision-data.ts`, `collision-data.json`, `sdk/test/`,
`API.md`, `README.md`. The upstream `pathfinding.ts` is not copied either: it imports the
native `rsmod-pathfinder` module from rs-sdk's `server/` tree and a 6 MB collision dump.

## index.ts: rewired onto the Transport

| Upstream item | Ours | Why |
|---|---|---|
| `constructor(config: SDKConfig)` building a `Required<SDKConfig>` | `constructor(private readonly transport: Transport)`, subscribing `transport.onState` in the body | There is no gateway to configure. State arrives by push from the client. |
| Fields `ws`, `connectPromise`, `sdkClientId`, `authenticated`, `connectionState`, `reconnectAttempt`, `reconnectTimer`, `intentionalDisconnect`, `connectionListeners`, `pendingActions`, `pendingScreenshots`, `config` | deleted | All WebSocket bookkeeping. Kept: `state`, `stateReceivedAt`, `serverMaxMessageLength`, `chatHistory`, `chatReadCursor`, `stateListeners`, `temporaryDoorBlocks`. |
| `serverMaxMessageLength` learned from the gateway handshake | `private serverMaxMessageLength = 80` (the RS wire limit), fixed | No handshake. The engine's cap is 80. |
| `config.actionTimeout` (60 s) | `private actionTimeout = DEFAULT_ACTION_TIMEOUT_MS` (10 s), passed to `transport.dispatch` | The brief's value; the transport owns the deadline. |
| `connect`, `disconnect`, `setConnectionState`, `scheduleReconnect`, `onConnectionStateChange`, `getConnectionState`, `getReconnectAttempt`, `getConnectionMode` | deleted | Connection lifecycle belongs to the shell, not the SDK. |
| `checkBotStatus`, `isBotConnected`, `shouldLaunchBrowser`, `launchBrowser`, `waitForBotConnection`, `getStatusUrl`, `buildClientUrl` | deleted | Gateway HTTP status endpoint and native-browser launching (`import('open')`, a Node-only dependency). |
| `deriveGatewayUrl(server?)` | deleted | Reads `process.env`; no gateway URL exists. |
| `isConnected()` = `ws.readyState === OPEN` | `return this.transport.getState() !== null` | "Connected" now means "a world state has arrived". |
| `isAuthenticated()` | `return this.isConnected()` | No separate auth step locally. Kept so callers need no edits. |
| `waitForConnection(timeout)` | resolves immediately (`_timeout` unused) | Same reason; kept for API compatibility. |
| `sendAction()` — connection guard, action id, pending map, `send({type:'sdk_action', …})` | `return await this.transport.dispatch(action, this.actionTimeout)` inside the existing try/catch | One line replaces the whole request/response correlation. The catch still converts a throw into `{success:false, reason:'error', phase:'dispatch'}`. |
| `class ActionDispatchError` and `interface PendingAction` | deleted; the catch uses `reason: 'error'` | Only the gateway path produced typed dispatch errors; the local transport reports `'timeout'` itself. |
| `sendSay(message)` → one `say` action | chunks with `chunkMessage(message, this.serverMaxMessageLength)` and awaits `transport.say(chunk)` per chunk, returning the first failure or the last result | Per the SP4a brief. `say()`/`dm()` still chunk and pace above it; double-chunking is a no-op. |
| `say()` / `dm()` pacing branch on `config.connectionMode === 'observe'` | always `await this.sendWait(delayTicks)` | Observe mode is a gateway concept. |
| `sendScreenshot(timeout): Promise<string>` (data URL over the gateway) + `interface PendingScreenshot` | `screenshot(): Promise<Blob>` → `this.transport.screenshot()` | The canvas is in this document; no round-trip, and a `Blob` beats a base64 data URL. |
| `send(message: object)` and `handleMessage(data: string)` | `private ingestState(state: BotWorldState)` — the state-normalisation half of `handleMessage`, called from the `onState` subscription before listeners fire | Keeps chat accumulation, the `worldX`/`worldZ` aliases, the trade `count`→`amount` mirror and the named-skills `Proxy`; drops JSON parsing, `sdk_action_result` / `sdk_error` / `sdk_screenshot_response` routing, and the `maxMessageLength` handshake. |
| `handleMessage`'s `config.showChat === false` filter over player chat | deleted (all messages recorded) | A shell-level display preference, not an SDK one. |
| `handleMessage` normalising the object it had just parsed (which it owned) | `ingestState` normalises a **shallow copy** (`const s = { ...state }`), stores that as `this.state`, and the `onState` subscription hands the copy — not the transport's snapshot — to `stateListeners` | The local transport hands out the client's own per-cycle snapshot, shared with every other reader. Writing the skills `Proxy` onto it makes `structuredClone` throw `DataCloneError`, and Task 7 posts that snapshot to the executor Worker (SP7 later across an iframe) by exactly that route. Covered by `localSdk.test.ts`. |
| the skills `Proxy` applied to each freshly parsed message | same `Proxy` on the copy, guarded by a `__named__` marker | Defence in case a future transport hands back an already-normalised state; the copy makes nesting impossible today. |
| `interface SyncToSDKMessage` | deleted | The gateway envelope. |
| types `SDKConfig`, `SDKConnectionMode`, `ConnectionState`, `BotStatus` | no longer imported; still declared in `types.ts` | `types.ts` stays byte-identical to upstream; unused type declarations are harmless. |

Everything else in `index.ts` — every `find*`/`get*` accessor, all `send*` actions, chat history,
trade, prayers, `findPath`, `waitForCondition` / `waitForTicks` / `waitForReady` — is unchanged.

## Transport.dispatch: a timeout does not cancel

`Transport.dispatch(action, timeoutMs)` resolves `{ success: false, reason: 'timeout' }` when the
deadline passes, but the action is **not** cancelled: the client's `ActionQueue` keeps running it
and it may still complete (or fail) afterwards. The client publishes no `cancelAll`, so there is no
cancel path to call. Callers must not retry blindly on a timeout — re-read the world state and
decide. Upstream had the same shape (its gateway timeout only dropped the pending entry), so this
is a property we inherited rather than introduced; cancellation arrives with SP4 4.4. The
`Transport.dispatch` doc comment in `web/src/agent/types.ts` says the same.

## pathfinding.ts: ours, not vendored

Upstream's module is a global A* over a bundled collision dump, run through rs-sdk's native
`rsmod-pathfinder`. We ship neither. The replacement exports **exactly** the names and
signatures the vendored code calls, so `index.ts` and `actions.ts` need no edits:

| Consumer | Symbol | Our behaviour |
|---|---|---|
| `index.ts` | `TemporaryDoorBlocklist` | remembers blocked door keys; `active()` returns the matching rows from the generated door table |
| `index.ts` | `isZoneAllocated(level, x, z)` | whether `collision.bin` carries that map square at that level; `true` when no data is loaded |
| `index.ts` | `findLongPath(...)` | BFS over the collision bitset in the query's bounding box padded by 128 tiles (plan ruling R7), simplified to corners at most 20 tiles apart; the best partial path when the destination is unreachable |
| `index.ts` | `getDoorAt(level, x, z)` | the generated door row on that tile |
| `actions.ts` | `isTileWalkable(level, x, z)` | the bit from `collision.bin`; `true` when no data is loaded |
| `actions.ts` | `findDoorsAlongPath(waypoints)` | every generated door row on or beside a waypoint |
| `web/src/tasks/collision.ts` | `initPathfinding(data)` | installs the decoded grid and door table; `null` restores the permissive answers |
| (unused, exported for parity) | `isFlagged`, `isZoneLikelyLand` | `false` / follows `isZoneAllocated` |

The data is `web/src/data/collision.bin` and `web/src/data/doors.json`, generated from the pinned
content clone by `scripts/gen/collision.ts` and fetched at runtime by
`web/src/tasks/collision.ts`. Until that fetch lands, and forever if it fails, every predicate
answers permissively and `findLongPath` is the SP4a straight line, so a missing asset degrades
walking to dead reckoning rather than refusing to move.

Two deliberate gaps in the bitset, both bounded because every leg of a route is still handed to
the client's own routefinder, which knows the full collision map for the scene it is in:

- **Walls are not in it (ruling R1).** A wall blocks a tile *edge*, which one bit per tile cannot
  express, and the 1 MB budget is one bit per tile per level. Openable walls become door rows
  instead, which is what `walkTo`'s door handling needs.
- **The BFS window is capped (ruling R7)** at the query's bounding box padded by 128 tiles, and at
  1 024 x 1 024. A detour wider than the padding comes back as a partial path, which `walkTo`
  walks before re-querying from the new position.

`findLongPath` will not route through a map square that `collision.bin` does not carry, even
though `isTileWalkable` calls such a tile walkable. The two answer different questions: the
predicate is upstream's "is this tile flagged blocked", while a route may not leave the loaded
map. That is the engine's own rule (`GameMap.loadGround` allocates routefinder zones only for
squares it loads, and an unallocated zone blocks).

## Type sourcing

`web/src/clientTypes.ts` (the web mirror of the hook contract) imports `BotAction`,
`ActionResult` and `BotWorldState` from `rs-sdk/sdk/types.ts`, while the client sources the
same names from `client/src/vendor/rs-sdk/bot/types.ts`. Both copies come from the same rs-sdk
commit and describe the same wire state; checked at vendoring time:

- the two `BotAction` unions are **identical**, member for member;
- the client's world state carries one field the sdk copy lacks, `menuActions`, and no field
  the sdk copy has. The client object is therefore a structural superset, which is the safe
  direction.

The `say` action's payload field is `message` (not `text`) in both copies — `Transport.say`
builds `{ type: 'say', message, reason: 'transport' }`.

## How to verify this record

Run `powershell -File scripts/patches-check.ps1` from the repository root; `scripts/verify.ps1`
runs it on every gate. The rows are data, not shell: `<tag> | <mode> | <expected> | <file> |
<literal>`, split on the first four pipes, with paths relative to `web/src/vendor`. This tree is
not a mirror of `client/src/vendor/rs-sdk/`, which holds `bot/` and `lite/`; here there is only
`sdk/` and `LICENSE`, so there is no third row and a row naming `bot/ActionExecutor.ts` would be a
file-not-found, which the runner treats as a failure. The pin row is `startswith` because the row
itself carries the sha and a `contains` count would count the row too.

```patches-check
root: web/src/vendor
rs-sdk pin | startswith | 1 | PATCHES.md | Upstream: https://github.com/MaxBittker/rs-sdk at 56b73e08fc01a1d683d7a86d145a494ae945d071 (MIT).
rs-sdk licence | contains | 1 | rs-sdk/LICENSE | MIT License
```

The runner also cross-checks that sha against `scripts/upstream.lock`'s `rs-sdk` row, so the lock
and the two vendor records cannot drift apart.

**What this does not cover.** The eight `sdk/` files marked "provenance header only" in the table
above carry no per-file pin, so nothing here proves they are still upstream's bytes. Closing that
wants a sha per file and is not entry 3's work.
