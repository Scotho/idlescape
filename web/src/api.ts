import type { HealthSnapshot, MintPairResponse } from './types';

export async function health(): Promise<HealthSnapshot> {
  const res = await fetch('/api/health', { credentials: 'same-origin' });
  return (await res.json()) as HealthSnapshot;
}

export async function mintPair(idToken: string): Promise<MintPairResponse> {
  const res = await fetch('/api/pair', {
    method: 'POST',
    headers: { authorization: `Bearer ${idToken}` },
    credentials: 'same-origin'
  });
  if (!res.ok) throw new Error(`pair ${res.status}`);
  return (await res.json()) as MintPairResponse;
}

export async function revokeAgentToken(idToken: string, id: string): Promise<void> {
  const res = await fetch(`/api/agent-tokens/${id}/revoke`, {
    method: 'POST',
    headers: { authorization: `Bearer ${idToken}` },
    credentials: 'same-origin'
  });
  if (res.status === 204) return;
  if (res.status === 404) throw new Error('agent token not found');
  throw new Error(`revoke ${res.status}`);
}
