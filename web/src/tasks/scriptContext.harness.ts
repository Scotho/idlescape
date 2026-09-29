// Type-level only: it asserts that each options parameter on ScriptContext IS the named
// exported interface, not a structurally identical inline literal. P20's api-shape gate says
// the same thing over the ts.Program; this says it to `npm run typecheck`, which is faster and
// runs first. Inlining a bag again fails to compile here.
//
// It imports nothing from vitest, for the reason api.harness.ts gives: a harness sits outside
// the shipped program, so naming test types near it cannot leak vitest's ambient globals into
// what ships.
import type { ClickThroughOpts, FollowHintOpts, LogOpts, RetryOpts, ScriptContext, WaitUntilOpts } from './scriptContext';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

/**
 * `Equals` compares two types structurally, so on its own it catches a bag whose shape drifted
 * and NOT a bag that was re-inlined byte for byte. This is the one difference TypeScript keeps
 * between `interface Opts { ... }` and the same members written inline: an anonymous object type
 * gets an implicit index signature and an interface does not, so only the inline form is
 * assignable to `Record<string, unknown>`. Measured, not assumed: reversing it turns each
 * assertion below red.
 */
type IsNamedInterface<T> = T extends Record<string, unknown> ? false : true;

// `Parameters<T>` reads the LAST overload signature, so for `log` and `clickThrough` the
// compliant options overload is declared second in scriptContext.ts. Get that order wrong and
// the bag aliases below resolve to the positional arm, which is what `Equals` then catches.
type UntilBag = NonNullable<Parameters<ScriptContext['wait']['until']>[1]>;
type HintBag = NonNullable<Parameters<ScriptContext['tutorial']['followHint']>[0]>;
type ClickBag = NonNullable<Parameters<ScriptContext['tutorial']['clickThrough']>[0]>;
type LogBag = NonNullable<Parameters<ScriptContext['log']>[1]>;
// `retry` is the one generic member, so `Parameters<>` instantiates it at `unknown`. That is
// still the named interface, which is what this asserts; re-inlining the bag turns it red.
type RetryBag = NonNullable<Parameters<ScriptContext['retry']>[1]>;

export type _UntilIsNamed = Assert<Equals<UntilBag, WaitUntilOpts>>;
export type _HintIsNamed = Assert<Equals<HintBag, FollowHintOpts>>;
export type _ClickIsNamed = Assert<Equals<ClickBag, ClickThroughOpts>>;
export type _LogIsNamed = Assert<Equals<LogBag, LogOpts>>;
export type _RetryIsNamed = Assert<Equals<RetryBag, RetryOpts<unknown>>>;

export type _UntilIsInterface = Assert<IsNamedInterface<UntilBag>>;
export type _HintIsInterface = Assert<IsNamedInterface<HintBag>>;
export type _ClickIsInterface = Assert<IsNamedInterface<ClickBag>>;
export type _LogIsInterface = Assert<IsNamedInterface<LogBag>>;
export type _RetryIsInterface = Assert<IsNamedInterface<RetryBag>>;

export type _LogOptsIsReachable = Assert<Equals<LogOpts['level'], 'info' | 'warn' | 'error' | undefined>>;
