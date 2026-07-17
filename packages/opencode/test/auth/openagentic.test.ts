import { describe, expect, test } from "bun:test"

// Isolasi dari env user (preload tidak menghapus var ini)
delete process.env["OPENCODE_AUTH_CONTENT"]

import { base64UrlEncode, challengeS256, generateState, generateVerifier } from "../../src/auth/openagentic"

describe("OpenagenticAuth.pkce", () => {
  test("generateVerifier default menghasilkan 64 char unreserved", () => {
    const verifier = generateVerifier()
    expect(verifier).toHaveLength(64)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  test("generateVerifier menerima batas 43 dan 128", () => {
    expect(generateVerifier(43)).toHaveLength(43)
    expect(generateVerifier(128)).toHaveLength(128)
  })

  test("generateVerifier menolak panjang di luar 43-128", () => {
    expect(() => generateVerifier(42)).toThrow(RangeError)
    expect(() => generateVerifier(129)).toThrow(RangeError)
  })

  test("challengeS256 cocok dengan test vector RFC 7636 Appendix B", async () => {
    const challenge = await challengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })

  test("generateState unik dan cukup panjang", () => {
    const states = new Set(Array.from({ length: 100 }, () => generateState()))
    expect(states.size).toBe(100)
    for (const state of states) {
      expect(state.length).toBeGreaterThanOrEqual(32)
      expect(state).toMatch(/^[A-Za-z0-9\-_]+$/)
    }
  })

  test("base64UrlEncode tanpa padding dan URL-safe", () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 190]))).toBe("-_--")
  })
})
