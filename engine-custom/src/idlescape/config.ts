import fs from 'fs';

import Environment from '#/util/Environment.js';

export interface IdlescapeConfig {
    ownerSecret: string;
    managementSecret: string;
    requireOwner: boolean;
    bankDir: string;
    hookUrl: string | null;
    managementHost: string;
    devStaffLevel: number;
    staff: Record<string, number>;
}

// world.json cannot carry these: WorldConfig.mergeConfig() drops any key that is not in
// createDefaultWorldConfig(), so a new section there would need a whole-file replacement of a
// 329-line file for two strings. Env first (scripts/start-stack.ps1 exports it from
// server/.env so both halves share one secret), then this optional file, then defaults.
export const CONFIG_FILE = 'data/config/idlescape.json';

interface FileShape {
    ownerSecret?: unknown;
    managementSecret?: unknown;
    requireOwner?: unknown;
    bankDir?: unknown;
    hookUrl?: unknown;
    managementHost?: unknown;
    staff?: unknown;
}

function readFileShape(text: string | null): FileShape {
    if (!text) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === 'object' && parsed !== null ? (parsed as FileShape) : {};
    } catch {
        console.warn(`[idlescape] ignoring unparseable ${CONFIG_FILE}`);
        return {};
    }
}

function asString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return fallback;
}

function asStaff(value: unknown): Record<string, number> {
    if (typeof value !== 'object' || value === null) {
        return {};
    }
    const out: Record<string, number> = {};
    for (const [name, level] of Object.entries(value as Record<string, unknown>)) {
        const n = Number(level);
        if (Number.isInteger(n) && n >= 0 && n <= 4) {
            out[name.toLowerCase()] = n;
        }
    }
    return out;
}

export function loadIdlescapeConfig(env: NodeJS.ProcessEnv = process.env, fileText: string | null = null, production: boolean = Environment.node.production): IdlescapeConfig {
    const file = readFileShape(fileText);

    // Production is the hard floor: an unattended world always demands an owner assertion and
    // never grants a staff level from an env var.
    const requireOwner = production ? true : asBool(env.OWNER_REQUIRE_ASSERTION, asBool(file.requireOwner, false));

    let devStaffLevel = 0;
    if (!production) {
        const n = Number(env.IDLESCAPE_DEV_STAFF ?? '0');
        if (Number.isInteger(n) && n >= 0 && n <= 4) {
            devStaffLevel = n;
        }
    }

    const ownerSecret = asString(env.OWNER_ASSERTION_SECRET, asString(file.ownerSecret, ''));

    // The other half of the production floor. requireOwner above is forced true in production,
    // so an unattended world with no secret does not fall back to letting everybody in: it
    // verifies every login's assertion against '' and refuses every player, one at a time, at
    // login response 13. That is the failure a deployment cannot see. Refuse to start instead,
    // naming the variable the operator has to set. Dev is untouched: requireOwner is false
    // there, an empty secret means "no owner binding", and that is a working local world.
    if (production && requireOwner && ownerSecret === '') {
        throw new Error('[idlescape] OWNER_ASSERTION_SECRET is required when node.production is true (requireOwner is forced on, so an empty secret refuses every login). Set it in the process environment or ownerSecret in ' + CONFIG_FILE + '.');
    }

    return {
        ownerSecret,
        // The SAME name the front server reads (server/src/env.ts, ENGINE_MANAGEMENT_SECRET),
        // exported into the engine process by scripts/start-stack.ps1: one value, two halves.
        // Empty means the owner-bank management routes are not registered at all.
        managementSecret: asString(env.ENGINE_MANAGEMENT_SECRET, asString(file.managementSecret, '')),
        requireOwner,
        bankDir: asString(env.IDLESCAPE_BANK_DIR, asString(file.bankDir, 'data/banks')),
        hookUrl: asString(env.IDLESCAPE_HOOK_URL, asString(file.hookUrl, '')) || null,
        managementHost: asString(env.IDLESCAPE_MANAGEMENT_HOST, asString(file.managementHost, '127.0.0.1')),
        devStaffLevel,
        staff: asStaff(file.staff)
    };
}

function readConfigFile(): string | null {
    try {
        return fs.existsSync(CONFIG_FILE) ? fs.readFileSync(CONFIG_FILE, 'utf8') : null;
    } catch {
        return null;
    }
}

export const idlescapeConfig: IdlescapeConfig = loadIdlescapeConfig(process.env, readConfigFile(), Environment.node.production);
