import {
  EmailAuthProvider, createUserWithEmailAndPassword, linkWithCredential, onAuthStateChanged, onIdTokenChanged,
  reauthenticateWithCredential, sendPasswordResetEmail, signInAnonymously, signInWithEmailAndPassword, signOut,
  updateProfile, type User
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Identity } from './types';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'That email is already registered. Try signing in.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/user-not-found': 'No account with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Try again later.',
  'auth/credential-already-in-use': 'That email belongs to another account.'
};

export function friendlyAuthError(err: unknown): string {
  const code = (err as { code?: string }).code ?? '';
  return FIREBASE_ERRORS[code] ?? 'Something went wrong. Try again.';
}

function toIdentity(u: User): Identity {
  return { uid: u.uid, isAnonymous: u.isAnonymous, email: u.email, displayName: u.displayName };
}

/**
 * `isNew` must be false when merging onto a uid that already has a `users/{uid}` doc (the
 * guest-upgrade path in `attachEmail`): the security rules forbid an update from touching
 * `createdAt` at all, so resending it there -- even via `serverTimestamp()`, which always
 * differs from the stored value -- gets the whole write rejected with PERMISSION_DENIED. Only
 * a brand-new doc (guest sign-in, fresh sign-up) should set it.
 */
async function ensureProfile(u: User, displayName: string, isNew: boolean = true): Promise<void> {
  const fields: Record<string, unknown> = { displayName, provider: u.isAnonymous ? 'anonymous' : 'password' };
  if (isNew) fields.createdAt = serverTimestamp();
  await setDoc(doc(db, 'users', u.uid), fields, { merge: true });
}

export async function signInGuest(): Promise<Identity> {
  const { user } = await signInAnonymously(auth);
  await ensureProfile(user, 'Guest');
  return toIdentity(user);
}

export async function signUpEmail(email: string, password: string, displayName: string): Promise<Identity> {
  const name = displayName.trim();
  if (name.length < 1 || name.length > 20) throw new Error('Display name must be 1 to 20 characters.');
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: name });
  await ensureProfile(user, name);
  return toIdentity(user);
}

export async function signInEmail(email: string, password: string): Promise<Identity> {
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  return toIdentity(user);
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

/**
 * Links an email/password credential onto the current anonymous user, so the uid (and the
 * character tied to it) carries over instead of a fresh account replacing it. `displayName`
 * is optional so existing callers (the in-game Account panel) that only attach an email keep
 * working unchanged; when given, it's validated and applied exactly as `signUpEmail` does.
 */
export async function attachEmail(email: string, password: string, displayName?: string): Promise<Identity> {
  const u = auth.currentUser;
  if (!u || !u.isAnonymous) throw new Error('Only guest accounts can attach an email.');
  const name = displayName?.trim();
  if (name !== undefined && (name.length < 1 || name.length > 20)) throw new Error('Display name must be 1 to 20 characters.');
  const { user } = await linkWithCredential(u, EmailAuthProvider.credential(email, password));
  if (name !== undefined) {
    await updateProfile(user, { displayName: name });
    await ensureProfile(user, name, false);
  } else {
    await setDoc(doc(db, 'users', user.uid), { provider: 'password' }, { merge: true });
  }
  return toIdentity(user);
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

export function onUser(fn: (identity: Identity | null) => void): () => void {
  return onAuthStateChanged(auth, u => fn(u ? toIdentity(u) : null));
}

/**
 * Like `onUser`, but backed by `onIdTokenChanged`, which (unlike `onAuthStateChanged`) also
 * fires when `linkWithCredential` upgrades the current anonymous user in place -- the uid
 * doesn't change, so `onAuthStateChanged` stays silent, but the ID token does. The entry
 * screen needs to notice a guest->email upgrade even if nothing else re-renders it.
 */
export function onUserIdToken(fn: (identity: Identity | null) => void): () => void {
  return onIdTokenChanged(auth, u => fn(u ? toIdentity(u) : null));
}

export async function currentIdToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error('not signed in');
  return u.getIdToken();
}

/** Re-authenticates the current email/password user, required before a destructive action like deleting a character. */
export async function reauthEmail(password: string): Promise<void> {
  const u = auth.currentUser;
  if (!u || !u.email) throw new Error('reauth');
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
}
