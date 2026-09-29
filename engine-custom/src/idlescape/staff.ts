/**
 * Upstream gives every player staffmodlevel 4 whenever node.production is false
 * (LoginThread.ts, both branches), which makes `::give coins 2147483647` available to anyone
 * -- fine for a single-developer world, fatal for a shared economy. This is the replacement
 * policy: nobody is staff unless the world's own config says so.
 */
export function staffLevelFor(username: string, production: boolean, devStaffLevel: number, staff: Record<string, number>): number {
    const listed = staff[username.toLowerCase()];
    const fromList = Number.isInteger(listed) ? Math.max(0, Math.min(4, listed)) : 0;
    const fromDev = production ? 0 : Math.max(0, Math.min(4, devStaffLevel));
    return Math.max(fromList, fromDev);
}
