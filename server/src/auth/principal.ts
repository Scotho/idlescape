import type { Admin } from '../firebaseAdmin';
import { hashToken } from '../pair/token';

export type Principal =
  | { kind: 'human'; uid: string; isAnonymous: boolean; authTime: number }
  | { kind: 'agent'; uid: string; tokenId: string };

export const AGENT_PREFIX = 'csa_';

export function bearerOf(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() || null : null;
}

interface AgentTokenDoc {
  uid: string;
  revokedAt: number | null;
}

export function createAuthenticator(admin: Admin): { authenticate(req: Request): Promise<Principal | null> } {
  async function authenticateAgent(secret: string): Promise<Principal | null> {
    const snap = await admin.db.collection('agentTokens').where('secretHash', '==', hashToken(secret)).limit(1).get();
    const doc = snap.docs[0];
    if (!doc) return null;
    const d = doc.data() as AgentTokenDoc;
    if (d.revokedAt !== null) return null;
    await doc.ref.set({ lastSeenAt: Date.now() }, { merge: true });
    return { kind: 'agent', uid: d.uid, tokenId: doc.id };
  }

  async function authenticateHuman(idToken: string): Promise<Principal | null> {
    try {
      const decoded = await admin.auth.verifyIdToken(idToken);
      return {
        kind: 'human',
        uid: decoded.uid,
        isAnonymous: decoded.firebase.sign_in_provider === 'anonymous',
        authTime: decoded.auth_time * 1000
      };
    } catch {
      return null;
    }
  }

  async function authenticate(req: Request): Promise<Principal | null> {
    const bearer = bearerOf(req);
    if (!bearer) return null;
    if (bearer.startsWith(AGENT_PREFIX)) return authenticateAgent(bearer.slice(AGENT_PREFIX.length));
    return authenticateHuman(bearer);
  }

  return { authenticate };
}
