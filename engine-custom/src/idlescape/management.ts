/**
 * The seam the front server owns the economy through (spec section 7): three routes on the
 * engine's MANAGEMENT Fastify app, never on the game web app, plus the hook that puts
 * upstream's own `/setup*` routes behind the same secret.
 *
 * Two of the three can move any item in any account's bank, so they are defended twice over: the
 * management app binds to `idlescapeConfig.managementHost` (127.0.0.1 by default, see
 * src/web.ts), and every request must carry `x-idlescape-mgmt` equal to the shared secret.
 * With no secret configured they are not registered at all, so a misconfigured world exposes
 * nothing rather than exposing them unauthenticated.
 */
import { timingSafeEqual } from 'node:crypto';

import type { FastifyInstance } from 'fastify';

import { idlescapeConfig } from './config.js';
import { ownerBanks, notifyBankChanged } from './install.js';
import { normaliseOp } from './ops.js';
import { OWNER_KEY_RE } from './ownerBank.js';
import type { BankOp } from './types.js';

/** Matches the front server's own cap (server/src/bank/routes.ts): one window's worth of drags. */
const MAX_OPS = 200;

export interface ApplyBody {
    expectedVersion?: number | null;
    ops?: unknown[];
}

export type ParsedApplyBody = { ok: true; expectedVersion: number | null; ops: BankOp[] } | { ok: false; error: string };

/**
 * Constant-time exact match. An empty configured secret is never authorised, so the "no secret"
 * world cannot be talked to even if a route were somehow registered; the comparison is on BYTES
 * rather than code points so a non-ASCII header is a clean false and not a `timingSafeEqual`
 * length throw turned into a 500.
 */
export function authorised(header: string | string[] | undefined, secret: string): boolean {
    if (secret.length === 0 || typeof header !== 'string') {
        return false;
    }
    const got = Buffer.from(header, 'utf8');
    const want = Buffer.from(secret, 'utf8');
    if (got.length !== want.length) {
        return false;
    }
    return timingSafeEqual(got, want);
}

/**
 * Untrusted JSON to an op batch. `expectedVersion` may be absent or null, which forces the
 * apply; every op goes through `normaliseOp`, so the store is only ever handed the six shapes.
 */
export function parseApplyBody(body: unknown): ParsedApplyBody {
    if (typeof body !== 'object' || body === null) {
        return { ok: false, error: 'bad_ops' };
    }
    const b = body as { expectedVersion?: unknown; ops?: unknown };

    let expectedVersion: number | null = null;
    if (b.expectedVersion !== undefined && b.expectedVersion !== null) {
        if (!Number.isSafeInteger(b.expectedVersion) || (b.expectedVersion as number) < 0) {
            return { ok: false, error: 'bad_ops' };
        }
        expectedVersion = b.expectedVersion as number;
    }

    if (!Array.isArray(b.ops) || b.ops.length > MAX_OPS) {
        return { ok: false, error: 'bad_ops' };
    }

    const ops: BankOp[] = [];
    for (const raw of b.ops) {
        const op = normaliseOp(raw);
        if (!op) {
            return { ok: false, error: 'bad_ops' };
        }
        ops.push(op);
    }
    return { ok: true, expectedVersion, ops };
}

/**
 * Registers `GET /owner/:key/bank`, `POST /owner/:key/bank/apply` and `GET /owner/health` on `app`.
 *
 * The secret is a parameter so a test can register a known one; production passes nothing and
 * gets `idlescapeConfig.managementSecret` (env `ENGINE_MANAGEMENT_SECRET`, the same name the
 * front server reads). It is read ONCE here, never per request, and never logged or echoed.
 */
export function registerOwnerBankRoutes(app: FastifyInstance, secret: string = idlescapeConfig.managementSecret): void {
    if (secret.length === 0) {
        console.warn('[idlescape] no ENGINE_MANAGEMENT_SECRET: owner bank management routes are disabled');
        return;
    }

    app.get<{ Params: { key: string } }>('/owner/:key/bank', async (req, reply) => {
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
        // Refused before the store is touched: the key becomes a file name.
        if (!OWNER_KEY_RE.test(req.params.key)) {
            return reply.status(400).send({ error: 'bad_key' });
        }
        return ownerBanks().snapshot(req.params.key);
    });

    app.post<{ Params: { key: string }; Body: unknown }>('/owner/:key/bank/apply', async (req, reply) => {
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
        const { key } = req.params;
        if (!OWNER_KEY_RE.test(key)) {
            return reply.status(400).send({ error: 'bad_key' });
        }

        const parsed = parseApplyBody(req.body);
        if (!parsed.ok) {
            return reply.status(400).send({ error: parsed.error });
        }

        // No queue, and nothing is awaited between reading the version and mutating: the engine
        // is single-threaded and World.cycle is synchronous, so this handler necessarily runs
        // BETWEEN ticks. That is the atomicity the spec's "applied on the world tick" asks for.
        const outcome = ownerBanks().apply(key, parsed.expectedVersion, parsed.ops);
        if (outcome.ok) {
            // The in-game path is covered by afterCycle's sweep; this covers the web path, so a
            // change made while the owner is offline still reaches the front server.
            notifyBankChanged(key, outcome.version);
            return { ownerKey: key, version: outcome.version };
        }
        if (outcome.reason === 'conflict') {
            return reply.status(409).send({ error: 'version', version: outcome.version });
        }
        if (outcome.reason === 'unavailable') {
            // The store has suspended writes for this owner (an unreadable bank file it could
            // not quarantine). Not the caller's fault and not retryable by changing the ops, so
            // it is a 503 rather than a 422: the front server maps it to `unavailable`.
            return reply.status(503).send({ error: 'unavailable' });
        }
        return reply.status(422).send({ error: outcome.reason });
    });

    // The runtime proof that this overlay is in the running image and that both halves hold the
    // same secret. server/src/health.ts polls it on its own interval and reports the result as
    // HealthSnapshot.management, which the release gate requires (audit C07, decision D75).
    // Touches no store: `snapshot()` would cache an in-memory entry for whatever key it was given,
    // which is safe but is an odd thing to lean on every ten seconds in production.
    app.get('/owner/health', async (req, reply) => {
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
        return { ok: true };
    });
}

/**
 * Refuses every `/setup*` request without the shared secret.
 *
 * Upstream registers `GET /setup`, `GET /setup/config` and `PUT /setup/config` with no auth at all.
 * `GET /setup/config` returns loadWorldConfig() whole, including `db.pass` in plaintext, and the
 * PUT rewrites `node.production` and `build.verify`. The management app binds 0.0.0.0 in the
 * deployment (IDLESCAPE_MANAGEMENT_HOST), so until now the only thing between those routes and a
 * neighbouring container was the compose network split decision D74 put in as a mitigation.
 *
 * One onRequest hook rather than three per-route guards: a fourth upstream /setup route would
 * silently arrive unguarded, and engine-custom/src/web.ts is a whole-file replacement where every
 * added line is a line to re-merge on the next upstream bump.
 *
 * `/prometheus` is deliberately NOT guarded: server/src/health.ts polls it for the players gauge
 * and it carries no secret. With no ENGINE_MANAGEMENT_SECRET, authorised() refuses everything, so a
 * local world loses the setup page entirely and world.json is edited directly. That is the same
 * thing an empty secret already does to the bank routes.
 */
export function registerSetupGuard(app: FastifyInstance, secret: string = idlescapeConfig.managementSecret): void {
    app.addHook('onRequest', async (req, reply) => {
        // req.url carries the query string; match on the path only.
        const path = req.url.split('?')[0] ?? '';
        if (path !== '/setup' && !path.startsWith('/setup/')) {
            return;
        }
        if (!authorised(req.headers['x-idlescape-mgmt'], secret)) {
            return reply.status(401).send({ error: 'unauthorised' });
        }
    });
}
