# Ledger — entry screen and quick connect retrofit

Plan: `docs/superpowers/plans/2026-09-05-entry-screen-retrofit.md`
Spec: `docs/superpowers/specs/2026-09-05-entry-screen-and-quick-connect-design.md` (amends `2026-09-04-idlescape-platform-design.md` sections 6.1, 6.3, 13 and plan Tasks 11, 13, 14)
Branch: `feat/platform-shell`
Commit range: `fe3c57f..ef88c7a` (four tasks plus a final cross-cutting fix wave; two commits inside this range, `e5d1082` and `6ca1afe`/`fde377c`, belong to a concurrent, unrelated docs plan and are not part of this sub-project's diff — see Traps)
Ports: front 8787, dev engine 8899, emulators 9099/8080. Deploy stayed controller-gated throughout; nothing here touched live Firebase or the deploy.

Builds on SP1 core (Tasks 1-14, complete at HEAD `fe3c57f`). Source workspace: `.superpowers/sdd/2026-09-05-entry-screen-retrofit/` (progress.md plus per-task briefs, reports, and review diffs — condensed into this ledger, then removable).

## Rulings

**Task 3 — connect card error handling and dispose race.** Fix both Importants (mint-failure has no try/catch, so a rejected mint leaves the card stuck on "Waiting" instead of showing spec 5's "Try again"; and `dispose()` racing an in-flight `mint()` lets the continuation set an interval and subscribe on an already-disposed card, leaking both) plus fold in the same-pattern minors in the same pass: `.catch` on `handleRevoke`'s async IIFE, resetting `manualShowCard` on unmount, an unmount guard on the initial `pollHealth()`.
Why: "spec 5 is an explicit requirement for this component; the leak is unrecoverable; deferring risks Task 4 building on a leaky card."
Cost if wrong: minimal, all contained to `connectCard.ts`/`connect.ts`.

**Task 4 — guest sign-up must link, not replace.** Branch the entry signup-form handler on `identity?.isAnonymous`: when anonymous, link via `attachEmail` (extended to set the display name through `updateProfile` + `ensureProfile`) so the guest's uid and progress carry over; otherwise `signUpEmail` as today. The brief's "reuse handlers" note was plumbing guidance, not license to contradict the spec.
Why: "protects the core guest-to-account conversion the feature exists for" — spec 2.1 is explicit: "For a guest, sign-up uses linkWithCredential so the character carries over," and auto-guest is unconditional, making this the everyday path.
Cost if wrong: minimal; contained to `main.ts` + `auth.ts` + one e2e line.

**Final review — one fix wave for two cross-cutting Importants plus a tooltip minor.**
- (A) Guest sign-up via `linkWithCredential` keeps the same uid, so `onAuthStateChanged` never fires; the signup handler discarded the returned `Identity` and never updated module `identity`, re-rendered, or closed the form. A subsequent Login then read stale `identity.isAnonymous = true`, so the bridge got `desired=undefined` and created a randomly-named guest character instead of using the real account — uncovered by tests. Fix: switch the entry listener to `onIdTokenChanged` (renamed `onUserIdToken`) and/or consume the returned identity directly.
- (B) `connect.ts` rendered session rows' `${row.label}` via innerHTML with no escaping or length cap; `label` is external input from the exchange body — stored XSS in the owner's authenticated session-management panel, and `escapeHtml` already existed unused. Fix: `escapeHtml(row.label)` client-side plus a server-side label length cap and control-char strip in `store.exchange`, single point of sanitization.
- (C) Frame strip tooltip read "Connect" against the panel's "Claude Connection" — fixed as a cheap same-pass tidy.
Why: "A is a real conversion-path bug (character mis-named/guest-locked); B is stored-XSS in a security surface."
Cost if wrong: contained to `main.ts`/`auth.ts`/`connect.ts`/`store.ts`/`frame.html` + tests.

## Rulings recorded for the owner (progress.md's own summary)

1. Local front server runs on 8787, not 8788 — only the dev engine collided with a live port, not the front server.
2. Task 1 pairing skill.md's `claude mcp add --scope user` deferred to SP4 (see Deferred below).
3. Task 3 connect card: mint-failure and dispose-race fixed before approval (see Rulings above).
4. Task 4: guest sign-up must `linkWithCredential` to preserve the character (fixed) plus the final-wave identity-refresh fix (A above).
5. Cloud-touching Firebase steps and deploy remain controller-gated.
6. Advanced-controls plugin (WASD camera rotation, press-Enter-to-chat, mousewheel zoom) scoped out to SP2.
7. Goals/autopilot, the three-mode selector, and wiki integration were specced during this sub-project's window; four open questions are pending owner answers before that work starts.

## Deferred, parked, carried

- Task 1 skill.md: `claude mcp add` lacks `--scope user` (spec prose wants user scope) — carried to **SP4**, harmless until the `/mcp` gateway deploys since it currently 503s (later found to 404, see below).
- `rules.test` has no unauth-read case for `agentTokens` (symmetric rule, low risk) — flagged at Task 1 review, no destination recorded, triaged non-load-bearing at final review.
- `store.ts` inlines `{gameName}` instead of importing `GameAccountDoc` (cosmetic) — flagged at Task 1 review, no destination recorded, triaged non-load-bearing at final review.
- Unstyled `.connect-card`/`.p-link` CSS (Task 3) — flagged at final review, no destination recorded, triaged non-load-bearing.
- `renderIdentityStrip` always-show (cosmetic) — flagged at Task 4 review, explicitly deferred rather than folded into the Task 4 fix round; still open at final review, triaged non-load-bearing.
- PluginRegistry "manifest-driven" is name-only: the icon strip is still hardcoded in `frame.html`, `manifests()` is exercised only by tests — carried to **SP2**, which makes the strip manifest-driven.
- skill.md's `/mcp` route resolves 404, not the promised 503, because no `/mcp` route exists yet — carried to **SP4**.
- `auth.ts`'s `onUser` export is now unused outside `auth.ts` (superseded by `onUserIdToken`), dead but harmless — flagged after the final fix wave, "cleanup whenever," no destination recorded.
- Recommended-goals-on-entry (entry-screen spec feature) — out of Task 4's scope by design, deferred to the separate goals sub-project.
- Goals/autopilot + three-mode selector + wiki-corpus integration — specced but not started; four open questions await the owner.

## Traps recorded

- **Parallel-session contamination mid-review.** A concurrent session committed `e5d1082` ("docs(plan): SPW wiki corpus implementation plan, 16 tasks", 4300 lines) into this branch while Task 3's review was in flight. The review was deliberately re-scoped to `7ecce00^(e5d1082)..7ecce00` to isolate the retrofit diff from that unrelated commit. The SPW plan itself was flagged to the owner as unreconciled incoming scope beyond the SP1b..SP5 roadmap, to slot after this retrofit and SP1b unless reprioritized — not resolved inside this sub-project.
- **Same-uid sign-in silently fools state.** `linkWithCredential` preserves the guest's uid, so `onAuthStateChanged` does not fire on a guest-to-account conversion. This bit twice: first inside the Task 4 signup handler (Ruling 2), then again at final review as a broader identity-refresh gap across the whole login path (Ruling A) — fixed for good by switching to `onIdTokenChanged` and consuming the returned `Identity` directly instead of relying on the auth-state listener.
- **Port collision risk noted and cleared.** Confirmed only the dev engine (8899) collided with a live port; the front server correctly stayed on 8787, not 8788.

## Measured facts

- Task 1: token 3/3, store 4/4, routes 12/12, router 13/13, rules 13/13; full suite 74/74. Emulator-orchestrated; emulators stopped after, no cloud/live touched.
- Task 2: panels 6/6, suite 19/19, typecheck + lint clean.
- Task 3 (pre-fix): api 8/8, connectCard 4/4, connect rows 3/3, suite 30/30, typecheck + lint clean. Real Firestore listeners were injected-fake in unit tests, deferred to Task 4's e2e.
- Task 3 (post fix round 1): suite 34/34, tsc + eslint clean; leak test confirmed `subscribe` and `setInterval` are never called after dispose.
- Task 4 (pre-fix): e2e 2/2 (entry to guest to Login to in-game; connect sub-view to markdown/token to back), unit 34/34.
- Task 4 (post fix round 1): 36/36, tsc + eslint clean; new `entrySignup.test.ts` exercises the `isAnonymous` branch directly (not a tautology); e2e exercises `#btn-connect-login`'s real transition.
- Final review + fix wave: web 39/39, server 78/78, e2e 3/3. `createdAt`-on-create-only confirmed correct as a side effect of the fix (fresh accounts still get it; the guest-link merge path is no longer rejected).
- Final review (opus) scope: `fe3c57f..a070959`, code only, merge-ready at the plumbing level (pairing flow, gate exemption, `health.gateway`, security rules all coherent; no `as any`; all files under 400 lines) before the two Important defects were found.

## Per-task table

| Task | Built | Commit range | Fix rounds |
|---|---|---|---|
| 1 | Pairing subsystem (`/pair/<token>`), agent tokens, skill document, `/connect` guide; `HealthSnapshot.gateway` field added to server + web types | `fe3c57f..afdd107` | 0 (approved clean) |
| 2 | `createPanelController` renamed to `createPluginRegistry`; panel manifests; `main.ts` registration against the new API | `afdd107..64f5df7` | 0 (approved clean) |
| 3 | `connectCard.ts` shared component + Claude Connection panel (reworked `connect.ts`) + `api.ts` pair calls | `64f5df7..f36da0c` | 1 (`f36da0c`: mint-fail try/catch, dispose-race guard, revoke `.catch`, unmount resets) |
| 4 | Entry screen: signin screen replaced by two-button entry with auto-guest, connect sub-view, client start moved to Login only, `signin.html` deleted, e2e drives the entry screen | `f36da0c..a070959` | 1 (`a070959`: signup branches on `isAnonymous`, links via `attachEmail`, sets display name) |
| Final review | Cross-cutting pass over the full retrofit surface (`fe3c57f..a070959`, code only) | `a070959..ef88c7a` | 1 (`ef88c7a`: identity refresh via `onIdTokenChanged`, `escapeHtml(row.label)` + server-side label sanitize, tooltip text fix) |

Branch note (from progress.md): `finishing-a-development-branch` was deliberately **not** invoked — `feat/platform-shell` intentionally accumulates all sub-projects before one controller-gated deploy. This ledger was written with the sub-project's rulings intact; work continued on the same branch into SP1b.
