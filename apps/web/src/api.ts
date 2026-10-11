export interface Health {
  status: 'ok';
  name: string;
  version: string;
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return (await res.json()) as Health;
}
