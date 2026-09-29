// Audit C17: `osrs.scotho.com · world 1 · <name>` was a literal compiled into the shipped bundle
// in two places, so a bundle served from anywhere else lied about where the player was. The host
// is read from the document rather than from an import.meta.env build variable: it is correct in
// every environment with nothing to configure and nothing to drift.
export const WORLD = 1;

export function siteLabel(gameName: string): string {
  return `${location.host} · world ${WORLD} · ${gameName}`;
}
