# SP7 measurements: background-tab survival and three-client memory

Date: 2026-09-05. Source: `web/e2e/measure.pw.test.ts` (`E2E_MEASURE=1`), Chromium 153.0.8010.12
via Playwright 1.63.0, stack: engine 8899 (management 8897) + front server 8787 serving
`web/dist-e2e` + firebase emulators. Raw output: `web/test-results/sp7-measurements.json`, copied
verbatim into the appendix below.

These are the two numbers the multi-character platform design (section 5, "Measurements gating the
rollout"), the SP7 design (section 7) and the multi-session feasibility audit (open questions 2 and
6) said had to be measured rather than assumed.

## 1. Background-tab throttling (phase-a open question 2)

The question: the engine forces a logout after 60 s without a packet
(`engine/server/src/engine/World.ts:132`, `TIMEOUT_NO_RESPONSE = 100` ticks, checked in
`processLogouts()` at `:744`), while the client sends `NO_TIMEOUT` from `gameLoop()` whenever more
than a second has passed since the last send (`client/src/client/Client.ts:4795`, the
`now - this.noTimeoutTimer > 1_000` block). That send rides the game loop, which is
`setTimeout`-driven end to end (`client/src/client/GameShell.ts:183` awaits `sleep()`, and `sleep`
is `setTimeout` at `client/src/util/JsUtil.ts:1`). So survival in a hidden tab depends entirely on
the wake rate Chromium grants that tab. The audit's inferred answer was "fine at 1 Hz, dead at one
wake per minute", and it flagged the one-wake-per-minute case as the risk.

The measurement comes in two halves, because neither half can stand alone: the first establishes
the wake rate a real hidden tab gets, the second establishes what three live clients do at a given
wake rate.

### 1.1 What Chromium actually grants a hidden tab (out-of-band probe)

Playwright cannot produce a hidden page: it enables Chromium's focus emulation on every page it
opens, so a backgrounded tab keeps reporting `document.visibilityState === "visible"` and is never
throttled. Verified directly: with the three throttling switches Playwright normally passes
(`--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`,
`--disable-renderer-backgrounding`) removed via `ignoreDefaultArgs`, in headed and in headless
mode, with the two pages proven to share one browser window, and with that window minimised through
`Browser.setWindowBounds`, the backgrounded page still reported `visible` and still ran its 20 ms
chained timer at 48 wakes per second.

So the wake rate was measured on the same Chromium binary driven without Playwright: two tabs
opened from the command line, tab B activated over the DevTools HTTP endpoint (`/json/activate`,
which does not attach a debugger session), and tab A's wake counter read back out of its
`document.title` through `/json/list`. No CDP session was ever attached to tab A.

| Time hidden | `visibilityState` | Wakes in the preceding minute |
|---|---|---|
| 3 min | hidden | 60 |
| 4 min | hidden | 61 |
| 5 min | hidden | 60 |
| 6 min | hidden | 61 |
| 10 min | hidden | 60 |
| 14 min | hidden | 61 |
| 16 min | hidden | 61 |

The first two minutes are left out because they straddle the switch from foreground. A separate
short probe counted 30 wakes over the first 30 s hidden, so the clamp lands immediately.

Two caveats on how far 1.1 carries. The probe browser was launched with `--remote-debugging-port`
so the wake counter could be read out of band, but no CDP session was ever attached to tab A, which
is what would have exempted it from throttling. And the probe page is a bare chained `setTimeout`
with no WebSocket and no WebGL, so it is more throttleable than a live client, whose open socket
and rendering give Chromium more reason to keep waking it. 1.1 therefore transfers to 1.2
conservatively: a real client's floor is the probe's 1 Hz or better, never worse.

A hidden tab was clamped to 1 Hz within seconds and stayed at 1 Hz for the full 16 minutes it was
watched. Chromium's intensive wake-up throttling, the one wake per minute the audit feared, never
engaged, including well past its documented five-minute threshold. At the 17 minute mark unrelated
cleanup activated the tab again and the counter jumped straight back to 48 wakes per second, which
confirms the counter was reading the real loop and not a stalled title.

### 1.2 What three live clients do at each wake rate

Three characters on one registered account, all logged in with a built scene, then left idle for
390 s (past the five-minute mark) with each client iframe's `setTimeout` clamped to the wake period
under test. The clamp delays every timer to the next slot on a shared grid, which is what Chromium's
throttling does to a hidden page; it models the throttle because, per 1.1, Playwright cannot
trigger it. The client emits one `tick` per `mainloop()` pass, so the longest gap between ticks is
the longest the loop went without a chance to send a keepalive.

| Wake period | Loop passes per frame (390 s) | Longest loop gap | Sessions | Still logged in | Verdict |
|---|---|---|---|---|---|
| unthrottled | 20031 / 20028 / 20028 | 51 ms | 3 | 3 | pass |
| 1 s (hidden tab) | 3979 / 3979 / 3981 | 1027 ms | 3 | 3 | pass |
| 60 s (intensive) | 55 / 55 / 51 | 60022 ms | 3 | 3 | marginal, see below |

The 60 s row is a coin flip, not a pass. The longest loop gap lands on 60.0 s, which is exactly the
engine's threshold, so whether a keepalive beats the check is a race decided by where the packet
falls inside a 600 ms tick. Both outcomes were observed at the same clamp on the same day: the run
recorded above kept all three, and the run before it kept two, with `m8` forced back to its title
screen at 120.4 s and staying logged out, and `m7` reading as logged out at 60.35 s before
recovering. The 1 s and unthrottled rows were 3 of 3 in every run, with no logout at any poll.

### 1.3 Verdict

Three clients survive a hidden tab. The regime a hidden tab actually gets in this Chromium build is
1 Hz, and at 1 Hz all three sessions stayed online for the full 390 s with a worst-case loop gap of
1.03 s against a 60 s timeout. That is 59 s of margin, and it is the same margin a single client has
today, so nothing here is specific to running three.

The mitigations the feasibility audit proposed (keep audio playing to buy the audible-page
exemption, or move the keepalive off the main-thread timer into a worker) are **not needed for SP7
as built**, and building them now would be speculation. They stay the right response if the
one-wake-per-minute regime ever shows up: at that clamp the margin is gone, and of the two runs
recorded at it one lost a session (`m8` back on its title screen at 120.4 s and staying there, `m7`
reading logged out at 60.35 s before recovering) while the other kept all three. What to watch:

- Intensive wake-up throttling is a real Chromium feature that this build simply did not apply.
  Another build, another platform, or a browser in battery saver may apply it. Re-run the 1.1 probe
  before assuming a hidden tab is safe on a new target.
- Firefox and Safari were not measured. Both throttle background timers.
- A keepalive interval equal to the timeout is not a margin. If the client ever has to survive one
  wake per minute, the fix belongs in the keepalive, not in a longer engine timeout.

## 2. Memory for three live clients (phase-a open question 6)

One sample per additional client, each taken once that client's scene had finished building, from
`Performance.getMetrics` on the shell page. All three client iframes are same-origin with the
shell, so they share the renderer's isolate and one heap number covers all of them.

| Live clients | JSHeapUsedSize | Delta per client | JSHeapTotalSize | Cumulative renderer CPU |
|---|---|---|---|---|
| 0 | 534,528 (0.5 MB) | n/a | 1,048,576 | 0.05 s |
| 1 | 51,368,004 (51.4 MB) | 50.8 MB | 104,161,280 | 4.69 s |
| 2 | 96,006,040 (96.0 MB) | 44.6 MB | 146,837,504 | 11.17 s |
| 3 | 140,568,940 (140.6 MB) | 44.6 MB | 186,519,552 | 18.68 s |

**The headline: 44.6 MB marginal per additional client, 140.6 MB total for three.** The marginal
figure is what a fourth character would cost, and it is the same 44.6 MB at both steps. The first
client's step is larger (50.8 MB) because it also pays one-off costs the later ones reuse: the
shell's own module graph and the vendored SDK the hooks pull in. Dividing the total by three gives
a 46.7 MB mean, which is the `perClientHeapBytes` figure in the appendix; it sits between the two
because it carries a third of that one-off cost. Four further runs of the same measurement gave
totals of 141.7 MB, 143.3 MB, 147.0 MB and 148.0 MB, so the per-client figure is stable and the
individual step sizes move only with where garbage collection happened to fall.

Model, texture, interface and sound-synth caches are per iframe, which is what the near-linear step
reflects. The IndexedDB cache `lostcity` (`client/src/io/Database.ts`) is shared across the
same-origin frames and does not scale with the client count.

Conclusion: three is a safe ceiling. 140 MB of JS heap for three live clients is a fraction of what
a laptop browser tab carries, the committed heap never passed 190 MB, and the SP7 tab strip caps an
account at three characters anyway. The spec's own gate was 1.5 GB and the result is roughly a tenth
of it.

CPU is what will bite first, not memory. Cumulative renderer CPU rose by roughly 6 s to 7 s per
additional client over the same wall-clock window, consistent with each unsuspended client running
its own 50 Hz loop and 3D raster. These samples are not evenly spaced in time, so treat the CPU
column as indicative rather than as a rate. The render-suspend flag the SP7 design already carries
is the lever for that, and profiling it is a separate measurement from this one.

## 3. Method, and what could not be measured

- **Playwright cannot background a page**, so 1.2 clamps `setTimeout` inside the client iframes
  instead of relying on the browser. 1.1 exists precisely to pin down what the browser really does,
  so the clamp is calibrated against a measured rate rather than a guessed one. Every 1.2 row
  records `visibilityState: "visible"` for this reason; that field is evidence of the limitation,
  not evidence that the tab was meaningfully in the foreground.
- **The engine ran with `node.production = false`** (the default in
  `engine/server/src/util/WorldConfig.ts:99`; nothing sets `NODE_PRODUCTION` locally). It does not
  affect the result: `processLogouts()` and `TIMEOUT_NO_RESPONSE` are not gated on that flag
  (`World.ts` `processLogouts()`, from `:739`), so the 60 s rule measured here is the rule SP8
  will ship.
- **The engine's `lostcity_active_players` gauge read 0** on the management endpoint (8897) in every
  sample, including while three characters were demonstrably in the world with built scenes and
  non-zero positions. That is the expected local reading, not a fault: the gauge is only ever set
  inside `if (Environment.node.production)` (`engine/server/src/engine/World.ts:477`, feeding
  `trackPlayerCount` from `server/Metrics.ts`), and nothing sets `NODE_PRODUCTION` locally. So it
  needs no investigating; it simply cannot cross-check a local run, and these results rest on the
  per-iframe session state instead. The gauge is live in production config, where alerting on it
  is fine.
- **The 1.1 probe used `file://` pages.** An `http://` variant was attempted and abandoned: a
  Chromium launched directly from this shell cannot reach a local HTTP server (the server logged no
  requests at all, with or without `--no-proxy-server`), while the same shell's Playwright-launched
  Chromium reaches the stack on 8787 normally. Chromium's throttling policy is a property of the
  page scheduler rather than of the URL scheme, but that was not verified for `http://` here.
- **Only Chromium was measured.**

## 4. Reproducing

The measurement spec is opt-in and idles for minutes, so it never joins the default e2e run
(`npx playwright test e2e/measure.pw.test.ts` reports 4 skipped). With the stack up and
`/api/health` reporting `engine: up`:

```bash
cd web && E2E_MEASURE=1 npx playwright test e2e/measure.pw.test.ts   # about 21 minutes
cat test-results/sp7-measurements.json
```

`E2E_IDLE_MS` shortens the idle for a plumbing smoke test (`E2E_IDLE_MS=40000`), and
`E2E_ENGINE_MANAGEMENT` points the player-gauge read somewhere other than `http://localhost:8897`.

The 1.1 probe is manual. Two files, `a.html` counting its own timer wakes into `document.title` and
an empty `b.html`, then:

```bash
CHROME="$LOCALAPPDATA/ms-playwright/chromium-1243/chrome-win64/chrome.exe"
"$CHROME" --remote-debugging-port=9333 --user-data-dir=/tmp/probe --no-first-run \
  file:///tmp/probe/a.html file:///tmp/probe/b.html &
# find b's target id in /json/list, then background tab A by activating tab B:
curl -s "http://127.0.0.1:9333/json/activate/$B_TARGET_ID"
# read A's wake counter once a minute, without ever attaching a debugger to it:
curl -s http://127.0.0.1:9333/json/list | grep -o '"title": *"A[^"]*"'
```

`a.html` is three lines:

```html
<title>A 0</title><body>A</body><script>
let n = 0; const t = () => { n++; document.title = 'A ' + n + ' ' + document.visibilityState; setTimeout(t, 20); }; t();
</script>
```

## Appendix: raw output

`web/test-results/sp7-measurements.json` as written by the run recorded above. `character` is the
Firestore character id, `gameName` the in-world name, and `firstLogoutMs` is empty when no session
was ever seen logged out during the idle.

```json
{
  "throttling.unthrottled": {
    "timerPeriodMs": null,
    "idleMs": 390634,
    "characters": [
      "m0_7sdhmyj",
      "m1_7sdhmyj",
      "m2_7sdhmyj"
    ],
    "visibilityState": "visible",
    "engineNoResponseTimeoutMs": 60000,
    "clampWakesPerFrame": [
      -1,
      -1,
      -1
    ],
    "loopIterationsPerFrame": [
      20031,
      20028,
      20028
    ],
    "loopIterationsPerMinutePerFrame": [
      3076.67,
      3076.21,
      3076.21
    ],
    "maxLoopGapMsPerFrame": [
      51,
      51,
      51
    ],
    "before": [
      {
        "character": "W80N6HzjNE2bijyOzx1_",
        "gameName": "m0_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "RjPB38S-NYBQRiu7tHDW",
        "gameName": "m1_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "ndJ4XVOhSeo7d32oKVqN",
        "gameName": "m2_7sdhmyj",
        "loggedIn": true,
        "hidden": false
      }
    ],
    "sessions": [
      {
        "character": "W80N6HzjNE2bijyOzx1_",
        "gameName": "m0_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "RjPB38S-NYBQRiu7tHDW",
        "gameName": "m1_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "ndJ4XVOhSeo7d32oKVqN",
        "gameName": "m2_7sdhmyj",
        "loggedIn": true,
        "hidden": false
      }
    ],
    "survived": 3,
    "firstLogoutMs": {},
    "enginePlayers": {
      "before": 0,
      "after": 0
    }
  },
  "throttling.oneHz": {
    "timerPeriodMs": 1000,
    "idleMs": 390454,
    "characters": [
      "m3_7sdhmyj",
      "m4_7sdhmyj",
      "m5_7sdhmyj"
    ],
    "visibilityState": "visible",
    "engineNoResponseTimeoutMs": 60000,
    "clampWakesPerFrame": [
      700,
      776,
      780
    ],
    "loopIterationsPerFrame": [
      3979,
      3979,
      3981
    ],
    "loopIterationsPerMinutePerFrame": [
      611.44,
      611.44,
      611.75
    ],
    "maxLoopGapMsPerFrame": [
      1027,
      1024,
      1024
    ],
    "before": [
      {
        "character": "baQjTwPz7ViilQ4JKeJU",
        "gameName": "m3_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "YB7jxmbNt0T8ngtM-oDE",
        "gameName": "m4_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "11s5EHk5zzviFyvjErm9",
        "gameName": "m5_7sdhmyj",
        "loggedIn": true,
        "hidden": false
      }
    ],
    "sessions": [
      {
        "character": "baQjTwPz7ViilQ4JKeJU",
        "gameName": "m3_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "YB7jxmbNt0T8ngtM-oDE",
        "gameName": "m4_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "11s5EHk5zzviFyvjErm9",
        "gameName": "m5_7sdhmyj",
        "loggedIn": true,
        "hidden": false
      }
    ],
    "survived": 3,
    "firstLogoutMs": {},
    "enginePlayers": {
      "before": 0,
      "after": 0
    }
  },
  "throttling.intensive": {
    "timerPeriodMs": 60000,
    "idleMs": 390432,
    "characters": [
      "m6_7sdhmyj",
      "m7_7sdhmyj",
      "m8_7sdhmyj"
    ],
    "visibilityState": "visible",
    "engineNoResponseTimeoutMs": 60000,
    "clampWakesPerFrame": [
      12,
      12,
      12
    ],
    "loopIterationsPerFrame": [
      55,
      55,
      51
    ],
    "loopIterationsPerMinutePerFrame": [
      8.45,
      8.45,
      7.84
    ],
    "maxLoopGapMsPerFrame": [
      60003,
      60018,
      60022
    ],
    "before": [
      {
        "character": "ZxAwaQUN2WAHfVH23Yf1",
        "gameName": "m6_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "zC5H-hq4nyLmlfX4BFD4",
        "gameName": "m7_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "WA2-5ktgDF_8yWVinCoD",
        "gameName": "m8_7sdhmyj",
        "loggedIn": true,
        "hidden": false
      }
    ],
    "sessions": [
      {
        "character": "ZxAwaQUN2WAHfVH23Yf1",
        "gameName": "m6_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "zC5H-hq4nyLmlfX4BFD4",
        "gameName": "m7_7sdhmyj",
        "loggedIn": true,
        "hidden": true
      },
      {
        "character": "WA2-5ktgDF_8yWVinCoD",
        "gameName": "m8_7sdhmyj",
        "loggedIn": true,
        "hidden": false
      }
    ],
    "survived": 3,
    "firstLogoutMs": {},
    "enginePlayers": {
      "before": 0,
      "after": 0
    }
  },
  "memory.0-before-any-session": {
    "JSHeapUsedSize": 534528,
    "JSHeapTotalSize": 1048576,
    "rendererCpuTime": 0.053606
  },
  "memory.1-clients": {
    "JSHeapUsedSize": 51368004,
    "JSHeapTotalSize": 104161280,
    "rendererCpuTime": 4.68519
  },
  "memory.2-clients": {
    "JSHeapUsedSize": 96006040,
    "JSHeapTotalSize": 146837504,
    "rendererCpuTime": 11.174918
  },
  "memory.3-clients": {
    "JSHeapUsedSize": 140568940,
    "JSHeapTotalSize": 186519552,
    "rendererCpuTime": 18.680304
  },
  "memory.summary": {
    "perClientHeapBytes": 46678137,
    "totalHeapBytes": 140568940
  }
}
```
