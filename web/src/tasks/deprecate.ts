// S12 step 2: "one log line at warn the first time a run touches a deprecated member, so a
// player who never reads the reference still finds out". Run scoped, not Worker scoped: a
// second run says it again, because the player watching that run has not seen it.
//
// Nothing here knows what a deprecated member is. The member itself decides when to call
// `warn`, and passes the path it wants a reader to search for, so this stays the one place the
// wording of a notice is decided and the only state is the set of paths already said.
export interface Deprecations {
  /**
   * Say once, per run, that `path` is deprecated. `message` is the rest of the sentence, and by
   * convention it names the replacement and the api version the member goes away in.
   */
  warn(path: string, message: string): void;
  /** Called when a run ends, so the next run warns again. */
  reset(): void;
}

export function createDeprecations(log: (text: string) => void): Deprecations {
  const seen = new Set<string>();
  return {
    warn(path, message) {
      if (seen.has(path)) return;
      seen.add(path);
      log(`${path} is deprecated. ${message}`);
    },
    reset() { seen.clear(); }
  };
}
