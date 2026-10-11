/**
 * Random 128-bit id as 32 hex chars.
 *
 * Uses getRandomValues rather than crypto.randomUUID because randomUUID is only
 * available in secure contexts, and the Docker build is usually reached over
 * plain http on a LAN address.
 */
export function newId(): string {
  const bytes = new Uint8Array(16);
  webCrypto().getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

// core is built without DOM or Node typings; Web Crypto exists in both runtimes.
function webCrypto(): { getRandomValues(array: Uint8Array): Uint8Array } {
  return (globalThis as unknown as { crypto: ReturnType<typeof webCrypto> }).crypto;
}
