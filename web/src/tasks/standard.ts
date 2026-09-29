// The machine-readable form of the standard. The rules themselves live once, in
// docs/superpowers/specs/2026-09-07-script-api-survey-and-standard-design.md section 4; this is
// the shape the studio's validator and the api-shape gate read, so a clause and the lint that
// enforces it cannot disagree about an id or a severity.
//
// Two shapes, not one: a clause is enforced by several lints, one lint cites a clause and a
// proposal, and three lints are advisory. Collapsing them makes the type unable to express the
// studio's own rule table.

/** One clause of the standard. The title names the clause; section 4 states the rule. */
export interface StandardRule { id: `S${number}`; title: string; severity: 'error' | 'warn' }

/** The twelve clauses of the survey spec's section 4, in order. */
export const STANDARD: readonly StandardRule[] = [
  { id: 'S1',  title: 'Naming: camelCase members, PascalCase types, snake_case in a new closed union', severity: 'warn' },
  { id: 'S2',  title: 'Async and cancellation: a promise for anything slower than one expression, and an abort resolves', severity: 'error' },
  { id: 'S3',  title: 'A typed result when the caller branches, a throw only when it cannot continue', severity: 'error' },
  { id: 'S4',  title: 'At most one required positional, then one named options object', severity: 'warn' },
  { id: 'S5',  title: 'A predicate is accepted anywhere a selector is, and no magic number is a widget id', severity: 'warn' },
  { id: 'S6',  title: 'An event subscription returns one idempotent unsubscribe function', severity: 'warn' },
  { id: 'S7',  title: 'c.wait is the only wait: no fixed sleeps, a default timeout, a label, false on expiry', severity: 'error' },
  { id: 'S8',  title: 'Tiles, ticks and Ms; one Tile shape; Percent, Fraction and Points say so in the name', severity: 'warn' },
  { id: 'S9',  title: 'null means there is no such thing; a result union means it was tried and failed', severity: 'error' },
  { id: 'S10', title: 'No member exposes the transport, the DOM, the network, another session, or login', severity: 'error' },
  { id: 'S11', title: 'Every member we own carries the doc comment the reference is generated from', severity: 'error' },
  { id: 'S12', title: 'Additions over renames: add, deprecate, remove no earlier than two api versions later', severity: 'error' }
];

/** One studio lint. `standard` cites the clause or clauses it enforces. */
export interface LintRule { id: string; standard: StandardRule['id'] | StandardRule['id'][]; severity: 'error' | 'warn' | 'info' }

/**
 * The studio validator's rule table: nineteen rules over the twelve clauses, and every row has a
 * source. Fourteen are the studio spec's section 8.2 table verbatim
 * (docs/superpowers/specs/2026-09-07-script-studio-design.md), including the two an earlier draft
 * of this module dropped: `no-await-in-when`, which that spec names among the six errors that
 * block Run, and `no-unbounded-loop`. Five more (`no-unawaited-action`, `no-missing-task-name`,
 * `no-unknown-param`, `no-throw-for-timeout`, `prefer-result-branch`) are added by this entry's
 * plan, which is the authority over both specs; decision D136 records that, so entry 6's
 * validator has a citation for each of the nineteen rather than five ids from nowhere.
 */
export const LINTS: readonly LintRule[] = [
  { id: 'no-fixed-sleep',        standard: ['S7', 'S2'], severity: 'error' },
  { id: 'no-transport-escape',   standard: 'S10', severity: 'error' },
  { id: 'no-forbidden-globals',  standard: 'S10', severity: 'error' },
  { id: 'no-eval',               standard: 'S10', severity: 'error' },
  { id: 'no-dom',                standard: 'S10', severity: 'error' },
  { id: 'no-await-in-when',      standard: 'S2',  severity: 'error' },
  { id: 'no-unawaited-action',   standard: 'S2',  severity: 'error' },
  { id: 'no-missing-task-name',  standard: 'S3',  severity: 'error' },
  { id: 'no-unknown-param',      standard: 'S4',  severity: 'error' },
  { id: 'no-throw-for-timeout',  standard: 'S3',  severity: 'warn' },
  { id: 'prefer-result-branch',  standard: 'S3',  severity: 'warn' },
  { id: 'no-static-widget-id',   standard: 'S5',  severity: 'warn' },
  { id: 'no-legacy-wait',        standard: 'S7',  severity: 'warn' },
  { id: 'no-captured-signal',    standard: 'S2',  severity: 'warn' },
  { id: 'no-unbounded-loop',     standard: 'S2',  severity: 'warn' },
  { id: 'no-deprecated-member',  standard: 'S12', severity: 'warn' },
  { id: 'untrusted-text',        standard: 'S10', severity: 'info' },
  { id: 'wait-until-needs-label', standard: 'S7', severity: 'info' },
  { id: 'manifest-has-description', standard: 'S11', severity: 'info' }
];

/**
 * S1 grandfathers HealthCondition by name and calls it "not a precedent". Three more closed
 * unions shipped kebab-case before the rule existed, and all four are persisted: they reach
 * RunStatus, RunSummary and the IndexedDB history rows, so a rename is a data migration rather
 * than a rename. Plan ruling R2 extends the clause to name all four instead. A NEW closed union
 * is snake_case and gets no row here.
 */
export const KEBAB_UNIONS: readonly string[] = ['HealthCondition', 'DeathBehaviour', 'RecoveryOutcome', 'PauseReason'];

/**
 * S4's own clause grandfathers four positional waits. `log(text, level?)` and
 * `tutorial.clickThrough(max?)` are two more that shipped before the rule and that saved scripts
 * call by name, so plan ruling R3 grandfathers them too. Each already has a compliant options
 * overload beside it, so nothing new is written in the old shape.
 */
export const POSITIONAL_GRANDFATHERED: readonly string[] =
  ['wait.dialog', 'wait.xp', 'wait.item', 'wait.message', 'log', 'tutorial.clickThrough'];

/**
 * S8's suffix rule covers units and says nothing about counts, and the surface carries about
 * twenty of them once this entry's own additions land. The api-shape gate accepts a name
 * matching /^(max[A-Z]|n$|legs$|tiles$)/; these are the names outside that, each with what it
 * counts. Plan ruling R4, which also rules out a doc-comment escape hatch: the gate reads the
 * index it has already rendered rather than the source text, so a list with a reason on every
 * row is the only auditable form. A row here is one line to delete the day the name gains a
 * suffix.
 */
export const COUNT_EXEMPT: readonly { name: string; unit: string }[] = [
  { name: 'radius', unit: 'tiles' },
  { name: 'tolerance', unit: 'tiles' },
  { name: 'minDelta', unit: 'units of the thing being waited for' },
  { name: 'delta', unit: 'units of the thing being waited for' },
  { name: 'estimateMinutes', unit: 'minutes, shown to a player, deliberately not milliseconds' },
  { name: 'hpBelow', unit: 'hitpoints; deprecated in favour of hpBelowPoints' },
  // The six this entry itself adds. Without these rows the api-shape gate lands red in Task 16
  // on the surface Tasks 1 to 7 shipped, which is the worst place to discover an exemption list
  // is short: the gate looks broken and the surface looks wrong, and neither is.
  { name: 'attempts', unit: 'tries, including the first' },
  { name: 'id', unit: 'an animation id, an opaque engine number with no unit' },
  { name: 'opIndex', unit: 'the game menu ordinal, 1 to 5' },
  { name: 'x', unit: 'world tiles, east' },
  { name: 'z', unit: 'world tiles, north' },
  { name: 'level', unit: 'floor plane, 0 to 3' }
];

/**
 * S1's abbreviation clause, as the list a gate can decide. S1 says a member name is spelled out
 * rather than abbreviated; the half a mechanical check can enforce is "is this name one of the
 * abbreviations we have agreed not to use". The list is short on purpose. A name here fails the
 * api-shape gate on the surface we own; the vendored half is not scanned, because renaming
 * BotSDK's members is a fork rather than a rename.
 *
 * `opts` is deliberately absent, even though it is an abbreviation: it is the parameter name S4
 * itself prescribes and the api-shape gate matches on. This list names members and options-bag
 * fields, never the options parameter.
 */
export const ABBREVIATIONS: readonly string[] =
  ['inv', 'dist', 'pos', 'cfg', 'msg', 'idx', 'len', 'num', 'val', 'obj', 'str', 'qty'];

/**
 * S2 requires every options bag introduced by section 5 to carry `signal?: AbortSignal`. One
 * does not, deliberately: `ScreenshotOpts` describes a single canvas read with no wait in it, so
 * there is nothing for a signal to interrupt and a field that does nothing is worse than an
 * absent one. The exemption lives here rather than in the gate, so the reason travels with it.
 * Every other bag this entry adds carries the field.
 */
export const SIGNAL_EXEMPT: readonly string[] = ['ScreenshotOpts'];
