import { describe, expect, test } from "bun:test"

// Isolasi dari env user (preload tidak menghapus var ini)
delete process.env["OPENCODE_AUTH_CONTENT"]

import {
  base64UrlEncode,
  challengeS256,
  exchangeToken,
  generateState,
  generateVerifier,
  LoginError,
  startCallbackServer,
} from "../../src/auth/openagentic"

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

describe("OpenagenticAuth.callbackServer", () => {
  test("happy path: GET /callback resolve code + halaman Berhasil", async () => {
    const cb = startCallbackServer({ state: "state-1" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/callback?code=abc-123&state=state-1`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
      expect(await response.text()).toContain("Berhasil")
      expect(await cb.code).toBe("abc-123")
      expect(cb.url).toBe(`http://127.0.0.1:${cb.port}/callback`)
    } finally {
      cb.stop()
    }
  })

  test("state mismatch: 400 + promise reject state_mismatch", async () => {
    const cb = startCallbackServer({ state: "expected" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/callback?code=abc&state=evil`)
      expect(response.status).toBe(400)
      const err = await cb.code.then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("state_mismatch")
    } finally {
      cb.stop()
    }
  })

  test("error=access_denied dari backend: reject access_denied", async () => {
    const cb = startCallbackServer({ state: "s" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/callback?error=access_denied&state=s`)
      expect(response.status).toBe(400)
      const err = await cb.code.then(
        () => undefined,
        (e) => e,
      )
      expect((err as LoginError).code).toBe("access_denied")
    } finally {
      cb.stop()
    }
  })

  test("path selain /callback: 404, promise tetap pending", async () => {
    const cb = startCallbackServer({ state: "s" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/favicon.ico`)
      expect(response.status).toBe(404)
    } finally {
      cb.stop()
    }
  })

  test("timeout: reject dengan code timeout", async () => {
    const cb = startCallbackServer({ state: "s", timeoutMs: 100 })
    try {
      const err = await cb.code.then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("timeout")
    } finally {
      cb.stop()
    }
  })
})

describe("OpenagenticAuth.exchangeToken", () => {
  const user = { email: "roni@example.com", name: "Roni", plan: "free" }

  function makeTokenServer(handler: (body: { code: string; code_verifier: string }) => Response | Promise<Response>) {
    return Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url)
        if (request.method === "POST" && url.pathname === "/api/v1/cli/token") {
          return handler((await request.json()) as { code: string; code_verifier: string })
        }
        return new Response("not found", { status: 404 })
      },
    })
  }

  test("happy path: kirim code + code_verifier sebagai JSON, terima api_key + user", async () => {
    let received: { code: string; code_verifier: string } | undefined
    const server = makeTokenServer((body) => {
      received = body
      return Response.json({ api_key: "oa-key-123", user })
    })
    try {
      const result = await exchangeToken({ code: "the-code", verifier: "the-verifier", baseUrl: server.url.origin })
      expect(result.api_key).toBe("oa-key-123")
      expect(result.user).toEqual(user)
      expect(received).toEqual({ code: "the-code", code_verifier: "the-verifier" })
    } finally {
      server.stop(true)
    }
  })

  test("400 invalid_grant → LoginError invalid_grant", async () => {
    const server = makeTokenServer(() => Response.json({ error: "invalid_grant" }, { status: 400 }))
    try {
      const err = await exchangeToken({ code: "x", verifier: "y", baseUrl: server.url.origin }).then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("invalid_grant")
    } finally {
      server.stop(true)
    }
  })

  test("500 → LoginError server_error", async () => {
    const server = makeTokenServer(() => new Response("boom", { status: 500 }))
    try {
      const err = await exchangeToken({ code: "x", verifier: "y", baseUrl: server.url.origin }).then(
        () => undefined,
        (e) => e,
      )
      expect((err as LoginError).code).toBe("server_error")
    } finally {
      server.stop(true)
    }
  })

  test("200 dengan body tidak lengkap → LoginError invalid_response", async () => {
    const server = makeTokenServer(() => Response.json({ api_key: "k" }))
    try {
      const err = await exchangeToken({ code: "x", verifier: "y", baseUrl: server.url.origin }).then(
        () => undefined,
        (e) => e,
      )
      expect((err as LoginError).code).toBe("invalid_response")
    } finally {
      server.stop(true)
    }
  })
})
