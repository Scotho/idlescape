# Provenance

Vendored 2026-09-06 from `~/Downloads/design_handoff_fable_shell`, an external design handoff
bundle. It lived outside the repository and nowhere else; this copy is the only one.

## What changed on the way in

The bundle called the product **fable** throughout. The product is **idlescape**, so every
occurrence was renamed, case preserved (`Fable` to `Idlescape`, `fable` to `idlescape`), across
prose, CSS comments, the skill front matter, the mock's wordmark and its `data-screen-label`.
`Fable Shell v2.dc.html` became `Idlescape Shell v2.dc.html`. Nothing else in the mock was
touched: every colour, size, spacing and copy literal is exactly as handed off, and the file
remains the source of truth for all of them.

Two placeholder URLs read `fable.scotho.com`. The production host is `osrs.scotho.com`, so they
now read that.

`SKILL.md` is not here. It became the project skill at `.claude/skills/idlescape-design/`,
rewritten to point back at this directory rather than duplicate it, and to carry the
no-React, compose-the-library and `cs.`-prefix rules that the handoff states elsewhere.

## What this bundle is, and is not

It is a **design reference built in HTML**: prototypes showing intended look and behaviour. The
`components/*.jsx` files are React only because the design-system tooling that generated them
requires React. They are specifications to read, never code to import. See the handoff `README.md`
section "About the design files".

It is **not** a complete implementation brief. The gaps it leaves - subsystems it assumes exist,
contracts it assumes hold, and the panel-id migration it flags without planning - are enumerated
and resolved in `docs/superpowers/specs/2026-09-06-idlescape-shell-v2-gaps-design.md`, which is a
companion to the handoff `README.md` rather than a replacement for it. The README stays the design
authority.
