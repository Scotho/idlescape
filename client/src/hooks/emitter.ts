export interface Emitter<Events extends Record<string, unknown>> {
  on<E extends keyof Events>(event: E, handler: (payload: Events[E]) => void): () => void;
  emit<E extends keyof Events>(event: E, payload: Events[E]): void;
}

export function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events> {
  const handlers = new Map<keyof Events, Set<(payload: never) => void>>();
  return {
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) { set = new Set(); handlers.set(event, set); }
      set.add(handler as (payload: never) => void);
      return () => { set?.delete(handler as (payload: never) => void); };
    },
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      for (const h of Array.from(set)) {
        try { (h as (p: Events[typeof event]) => void)(payload); } catch (err) { console.error('[hooks]', String(event), err); }
      }
    }
  };
}
