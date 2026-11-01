/** A password or PIN, stored as a salted hash. The plain value is never saved. */
export interface Secret {
  salt: string;
  hash: string;
  iterations: number;
}

const ITERATIONS = 200_000;
const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function derive(value: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  if (!globalThis.crypto?.subtle) throw new Error('Secure storage needs HTTPS.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function makeSecret(value: string): Promise<Secret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toBase64(salt), hash: toBase64(await derive(value, salt, ITERATIONS)), iterations: ITERATIONS };
}

export async function checkSecret(value: string, secret: Secret): Promise<boolean> {
  const expected = fromBase64(secret.hash);
  const actual = await derive(value, fromBase64(secret.salt), secret.iterations);
  // Compare every byte so the time taken does not reveal how much matched.
  let diff = expected.length ^ actual.length;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ (actual[i] ?? 0);
  return diff === 0;
}
