import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PluginDoc, SettingsBackend } from './settings';

export function createFirestoreBackend(): SettingsBackend {
  return {
    async load(uid) {
      const snap = await getDocs(collection(db, 'users', uid, 'plugins'));
      const out: Record<string, PluginDoc> = {};
      for (const d of snap.docs) {
        const data = d.data() as { enabled?: boolean; settings?: Record<string, unknown> };
        out[d.id] = { enabled: data.enabled ?? false, settings: (data.settings ?? {}) as PluginDoc['settings'] };
      }
      return out;
    },
    async write(uid, id, docData) {
      await setDoc(
        doc(db, 'users', uid, 'plugins', id),
        { enabled: docData.enabled, settings: docData.settings, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  };
}
