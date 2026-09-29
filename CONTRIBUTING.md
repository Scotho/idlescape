# Contributing

idlescape is published as-is, as a work in progress. Issues and pull requests are welcome but may
sit unanswered. Forking is the realistic way to take it somewhere.

If you do send a pull request:

- `npm run verify` from the repository root is the acceptance gate. `docs/VERIFICATION.md` says what
  it covers and what it does not.
- Conventional commits (`feat(scope):`, `fix(scope):`, `chore:`).
- Strict TypeScript, no new `as any`, files under 400 lines, tests included.
- Never edit `engine/`, or the `vendor/` directories, or `client/src/client/Client.ts` directly.
  The overlay and numbered-patch rules are in `CLAUDE.md` and the skills under `.claude/skills/`.
- By contributing you agree your contribution is licensed under the MIT License, the same as the
  project.

## Credit what you bring

Any change that vendors code or borrows a design updates [`CREDITS.md`](CREDITS.md) in the same
commit, with the project, its license and what was taken.

## What a pull request must not contain

- **Jagex assets.** No cache files, sprites, models, maps, music or screenshots of the game.
- Code, art or data you do not have the right to redistribute. "I found it online" is not a license.
- Anything meant to automate or evade detection on Jagex's live games. This project scripts its own
  private server and nothing else.
- Credentials, tokens, `.env` files or real account details.
