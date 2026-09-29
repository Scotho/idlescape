# Notice: copyright, licenses and disclaimers

Read this before you reuse anything from this repository. The short version: **our code is MIT,
the code we forked or vendored stays under its authors' MIT licenses, and nothing here grants any
right to RuneScape itself.** The full list of who we owe what is in [`CREDITS.md`](CREDITS.md).

## 1. Copyright

idlescape's own source code is Copyright (c) 2026 Craig Smith.

The project was built between 2026-09-04 and 2026-09-27 as an agentic coding experiment. The code
was written by AI models under the author's direction. The models are listed in the README.

## 2. License for our code

The code written for this project is licensed under the **MIT License**. The full text is in
[`LICENSE`](LICENSE).

In plain terms (this summary is not the license, the license is):

- You may use, copy, modify, publish, sublicense and sell the code, in open or closed projects.
- You must keep the copyright notice and the license text in copies or substantial portions of it.
- There is no warranty.

"Our code" means `web/`, `server/`, `engine-custom/`, `content-custom/`, `wiki/gen/`, `firebase/`,
`scripts/`, `deploy/`, the documents under `docs/` and `.claude/`, and our additions inside
`client/` (`client/src/hooks/`, `client/src/plugins/`, and the numbered patches recorded in
`client/PATCHES.md`). It does **not** include the items in sections 3, 4 and 5.

## 3. Code from other projects in this repository

These files are under their own authors' licenses, which are kept beside them. If you reuse them,
follow that license, including its copyright notice.

| Path | From | License | Copyright |
|---|---|---|---|
| `client/` (everything not listed as ours in section 2) | [LostCityRS/Client-TS](https://github.com/LostCityRS/Client-TS), branch `274`, at the sha in `scripts/upstream.lock` | MIT, [`client/LICENSE`](client/LICENSE) | (c) 2023-2026 Lost City |
| `client/src/vendor/rs-sdk/` | [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) at `56b73e0` | MIT, `client/src/vendor/rs-sdk/LICENSE` | (c) 2025 Lost City, and the rs-sdk contributors |
| `web/src/vendor/rs-sdk/` | [MaxBittker/rs-sdk](https://github.com/MaxBittker/rs-sdk) at `56b73e0` | MIT, `web/src/vendor/rs-sdk/LICENSE` | (c) 2025 Lost City, and the rs-sdk contributors |
| `engine-custom/src/` files that replace an upstream file | Modified copies of files from [LostCityRS/Engine-TS](https://github.com/LostCityRS/Engine-TS), listed one by one in `engine-custom/PATCHES.md` | MIT | (c) Lost City |
| `content-custom/` files that replace an upstream file | Modified copies of files from [LostCityRS/Content](https://github.com/LostCityRS/Content), listed in `content-custom/README.md` | MIT | (c) Lost City |

Every deviation from upstream is logged: `client/PATCHES.md`, `client/src/vendor/PATCHES.md`,
`web/src/vendor/PATCHES.md` and `engine-custom/PATCHES.md`.

**Not in this repository at all:** the Lost City engine and the Lost City content. `npm run setup`
clones them from their own repositories at the pinned shas into `engine/`, which is git-ignored.
You receive them from Lost City, under Lost City's license, not from us.

Dependencies are installed from npm and are not vendored. Main ones: Firebase JS SDK and
firebase-admin (Apache-2.0), Vite (MIT), Vitest (MIT), Playwright (Apache-2.0), TypeScript
(Apache-2.0), ESLint and typescript-eslint (MIT), ws (MIT), fflate (MIT), marked (MIT), jsdom (MIT),
fake-indexeddb (Apache-2.0), terser (BSD-2-Clause), node-forge (BSD-3-Clause or GPL-2.0), Prettier
(MIT). Runtimes: Bun (MIT) and Node.js. The shell's pixel typeface is Pixelify Sans (SIL OFL 1.1),
loaded from Google Fonts and not stored here. See each package for its full license.

## 4. RuneScape, Jagex, and game data

RuneScape and Old School RuneScape are trademarks of Jagex Ltd. idlescape is an independent,
non-commercial fan project. It is **not affiliated with, sponsored by or endorsed by Jagex**.

- **No original game art, models, maps, music or cache files are stored in this repository.** The
  game client draws everything at runtime from the cache that the Lost City content builds on your
  own machine.
- **Generated data.** `wiki/data/274/`, `web/src/data/atlas.json`, `web/src/data/collision.bin`,
  `web/src/data/doors.json` and `web/src/tasks/library/tutorialIsland/steps.ts` are produced by our
  generators from the pinned Lost City content: names, numbers, coordinates and tables describing
  the 2004 game. The generators are ours and MIT. The facts they record describe a game we did not
  make, and the MIT license on this repository does not and cannot grant any right in that game.
- **Wiki pages** under `wiki/content/` are written for this project. Each claim cites its source.
  No text is copied from the Old School RuneScape Wiki or from any other reference.

The MIT license covers the code. It gives you no right to Jagex's names, art or game content. If
you run your own copy, what you serve and to whom is your responsibility.

## 5. Name, domain and design

- The name **idlescape**, as used for this project, and the hosted site at `osrs.scotho.com` are
  the author's. Fork the code freely; do not present your copy as the original or as endorsed by
  its author, and do not use the author's domains or accounts.
- `docs/design/idlescape-shell-v2/` is a design handoff bundle made for this project. It is a
  reference, not code to import; its provenance is recorded in `PROVENANCE.md` beside it.

## 6. What was left out of the public repository

| Left out | Why |
|---|---|
| The project's full commit history | It lives in the author's private working repository. The public repository starts from a single release commit on top of the Lost City client commit it was forked from |
| Real deployment identifiers: tunnel id, host address, cloud account id, the ingress rules for the author's other sites | Replaced with placeholders. They are not needed to run your own copy |
| The production Firebase web config | Replaced with placeholders. Use the emulators, or your own Firebase project |
| Screenshots that show the game being rendered | They depict art we do not own |
| Every `.env`, key, credential and admin JSON | Never committed in the first place; `.gitignore` keeps it that way |

## 7. Disclaimers

**Unfinished software.** idlescape is a work in progress, published as-is. Features are incomplete,
some documents describe things that were never built, and nothing here is promised to work, to keep
working, or to be fixed.

**Experimental.** This was an experiment in building software entirely through autonomous agent
sessions. The process recorded in `docs/` and `.claude/` shows how it was run. Treat it as a
reference, not as recommended practice.

**No warranty.** As stated in the MIT License, the software is provided "as is", without warranty
of any kind, and the author is not liable for any claim, damages or other liability arising from
its use.

**Not security audited.** The front server, the Firestore rules, the engine overlay and the script
sandbox have not been independently reviewed. If you host your own copy, you are responsible for it
and for your players' data.

**Scripting is the point, here and only here.** idlescape runs scripts against its own private
server, where automation is the intended use. Nothing in this repository is designed for, tested
against, or intended to be used on Jagex's live games, where botting breaks the rules. There is no
anti-detection code and there will not be any.

**Live service.** The hosted site is run by the author. The license for this code gives you no
rights to that service, its data or its accounts. It may be reset or switched off at any time.

## 8. Takedown and contact

If you believe something in this repository infringes your rights, or you are credited wrongly or
not at all, open an issue on the GitHub repository. Valid requests will be acted on.
