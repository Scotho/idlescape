import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { initializeFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import type { Env } from './types';

export interface Admin { app: App; auth: Auth; db: Firestore }

export function initAdmin(env: Env): Admin {
  if (env.firebaseEmulators) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
  }
  const existing = getApps()[0];
  const app = existing ?? (env.firebaseEmulators
    ? initializeApp({ projectId: env.firebaseProjectId })
    : initializeApp({ credential: cert(JSON.parse(readFileSync(env.googleCredentialsPath, 'utf8'))), projectId: env.firebaseProjectId }));
  // Firestore's default gRPC transport has been observed to stall for extended
  // periods (60s+ per call, sometimes much longer) under Bun's test runner once
  // enough round trips accumulate within one process. It was measured during SP6
  // task 1: the same suite that runs in seconds over REST took minutes over gRPC,
  // with individual calls hanging past a 60-second timeout, and the stalls began
  // only after the first few dozen round trips in a process.
  // REST transport avoids this. No server code uses realtime listeners
  // (onSnapshot), so REST is safe everywhere Firestore is used here.
  // initializeFirestore() is idempotent for identical settings (it returns the
  // cached instance when called again with the same { preferRest: true }), so
  // every initAdmin() call in-process — including repeated calls across test
  // files sharing the same app — can go through this same path safely.
  const db = initializeFirestore(app, { preferRest: true });
  return { app, auth: getAuth(app), db };
}
