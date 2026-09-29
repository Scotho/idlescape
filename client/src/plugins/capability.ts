import type { ClientState } from '../hooks/types';

export type RendererMode = 'software' | 'webgl' | 'webgpu';

export interface ClientCapability {
  renderer: { set(mode: RendererMode): Promise<void>; current(): RendererMode };
  frame: { onBeforeDraw(cb: () => void): () => void; onAfterDraw(cb: () => void): () => void };
  scene: { project(x: number, z: number, level: number, height: number): { sx: number; sy: number } | null };
  menu: { onBuild(cb: () => void): () => void };
  state: () => ClientState;
}

export interface InternalCapability extends ClientCapability {
  _fireBeforeDraw(): void;
  _fireAfterDraw(): void;
}

export function createCapability(deps: { state: () => ClientState }): InternalCapability {
  const before = new Set<() => void>();
  const after = new Set<() => void>();
  let mode: RendererMode = 'software';
  const sub = (set: Set<() => void>, cb: () => void): (() => void) => { set.add(cb); return () => set.delete(cb); };
  const fire = (set: Set<() => void>): void => { for (const cb of set) cb(); };
  return {
    renderer: {
      current: () => mode,
      // Only 'software' is available until a backend plugin loads (SP2b-2). A backend
      // replaces this capability's renderer at that point.
      set: async (m: RendererMode) => {
        if (m !== 'software') throw new Error(`renderer '${m}' has no backend loaded yet`);
        mode = m;
      }
    },
    frame: {
      onBeforeDraw: cb => sub(before, cb),
      onAfterDraw: cb => sub(after, cb)
    },
    scene: { project: () => null }, // SP5 fills this
    menu: { onBuild: () => () => {} }, // SP5 fills this
    state: deps.state,
    _fireBeforeDraw: () => fire(before),
    _fireAfterDraw: () => fire(after)
  };
}
