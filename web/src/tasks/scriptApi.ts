// What a script may see, decided in one screen rather than inferred from a generator's
// traversal rules. This file is the generator's entry (scripts/gen/apiDocs.ts) and gate 6's
// subject; it is the only file a future session edits when the surface widens.
//
// Corrections to the spec's list of 31 (plan ruling R27): the SDK type is BotSDK and not BotSdk;
// WorldState is declared in web/src/clientTypes.ts and only re-exported by web/src/agent/types.ts,
// so the generator's generatedFrom.files must reach the real file; TargetEvent and RecoveryOutcome
// are named inside TraceEvent's union, so without them ApiType.variants renders names the index
// does not define; TasksErrorCode is the error vocabulary 06-limits-and-trust.md renders; and every
// named options bag is here because S4 requires each to be a named exported interface and the
// api-shape gate asserts that every options type a member takes is one this file exports.
//
// EACH NAME COMES FROM THE FILE THAT DECLARES IT. types.ts re-exports scriptContext.ts (plan R1),
// not the other way round, so naming a run-model type here as if it came from './scriptContext'
// is ~26 "has no exported member" errors and the first thing that stops in step 7.

// The script-facing surface: scriptContext.ts declares these.
export type {
  ScriptContext, ScriptBot, Tile, TileLike, TravelTarget
} from './scriptContext';

// The named options bags. Task 9's doc comments cost scriptContext.ts the room to hold them, so
// they were split into scriptContext.opts.ts and are re-exported from scriptContext.ts for every
// import site. Named from their own file here, per the rule at the top of this one.
export type {
  WaitUntilOpts, WaitAnimationOpts, WaitHpOpts, FollowHintOpts, ClickThroughOpts, LogOpts,
  HardStop, RetryOpts, ScreenshotOpts, DialogContinueOpts, DialogCompleteOpts
} from './scriptContext.opts';

// P8's options bag is declared beside the member it belongs to, in botExtras.ts, which is also
// where `interactGroundItem` itself is declared. Task 8's list names the file that declares each
// name, and scriptContext.ts imports this one rather than re-declaring it.
export type { InteractGroundItemOpts } from './botExtras';

// The run and persistence model: types.ts declares these and keeps them (plan R1).
export type {
  Script, ScriptManifest, Task,
  ParamSchema, ParamField, ParamValues, Requirement,
  ResourceKind, FoundTarget, FoundVia, FindOpts, SweepOpts, TravelOpts, TravelResult,
  AtlasCluster, AtlasLandmark,
  HealthCondition, HealthPolicy, HealthEvent, DeathBehaviour, StuckBehaviour, RecoveryOutcome,
  TraceEvent, TargetEvent, RunState, PauseReason, FailReason, RunOutcome,
  BotActions, BotSDK
} from './types';

export type { TasksErrorCode } from './api';
export type { WorldState, ActionResult } from '../agent/types';
export { SCRIPT_CONTEXT_KEYS } from './scriptApiKeys';
