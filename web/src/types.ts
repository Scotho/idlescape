export type AppState = 'boot' | 'home' | 'characters' | 'playing' | 'offline';
export type HomeView = 'choices' | 'login' | 'signup' | 'connect';
export interface CharacterSummary { id: string; gameName: string; createdAt: number; lastLoginAt: number | null }
// Mirrors server/src/types.ts's HealthSnapshot, which is the authority. `wiki` and `management` are
// read by the release gate rather than by this shell, but the mirror carries them so a drifting
// fixture fails a typecheck here instead of at the gate.
export interface HealthSnapshot {
  engine: 'up' | 'down'; engineUptimeMs: number; version: string;
  gateway: 'up' | 'down' | 'not_deployed'; players: number | null;
  wiki: 'up' | 'missing'; management: 'up' | 'unauthorized' | 'unconfigured' | 'down';
}
// The panel ids the side panel can hold, and a persisted data contract: `cs.panel` stores one of
// these verbatim. `characters` was deleted when the Characters panel merged into Account, and
// `frame/panels.ts`'s PANEL_ALIASES carries its players over permanently.
export type PanelId = 'xp' | 'loot' | 'connect' | 'account' | 'config' | 'plugins' | 'tasks' | 'marketplace' | 'bank' | 'events' | 'notes' | 'screenshot';
export interface Identity { uid: string; isAnonymous: boolean; email: string | null; displayName: string | null }
export interface MintPairResponse { pairUrl: string; token: string; expiresAt: number }
