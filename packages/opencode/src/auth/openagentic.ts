export * as OpenagenticAuth from "./openagentic"

// ---------------------------------------------------------------------------
// PKCE (RFC 7636) — pure helpers, unit-tested di test/auth/openagentic.test.ts
// ---------------------------------------------------------------------------

const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function generateVerifier(length = 64): string {
  if (length < 43 || length > 128) throw new RangeError(`PKCE verifier length must be 43-128, got ${length}`)
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((byte) => UNRESERVED[byte % UNRESERVED.length])
    .join("")
}

export async function challengeS256(verifier: string): Promise<string> {
  return base64UrlEncode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
}

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
}
