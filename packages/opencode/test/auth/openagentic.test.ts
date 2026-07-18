import { describe, expect, test } from "bun:test"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Auth } from "../../src/auth"

// Isolasi dari env user (preload tidak menghapus var ini)
delete process.env["OPENCODE_AUTH_CONTENT"]

import {
  base64UrlEncode,
  challengeS256,
  exchangeToken,
  generateState,
  generateVerifier,
  login,
  LoginError,
  logout,
  startCallbackServer,
} from "../../src/auth/openagentic"

const authRt = makeRuntime(Auth.Service, AppNodeBuilder.build(Auth.node))

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

describe("OpenagenticAuth.login (integrasi mock backend)", () => {
  const user = { email: "roni@example.com", name: "Roni", plan: "free" }

  // Mock openagentic.id: menerbitkan code lewat "browser" palsu, lalu
  // memverifikasi PKCE penuh di POST /api/v1/cli/token.
  function makeBackend() {
    const issuedCode = "auth-code-1"
    let challenge: string | undefined
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url)
        if (request.method === "POST" && url.pathname === "/api/v1/cli/token") {
          const body = (await request.json()) as { code: string; code_verifier: string }
          const computed = base64UrlEncode(
            await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.code_verifier)),
          )
          if (body.code !== issuedCode || challenge === undefined || computed !== challenge) {
            return Response.json({ error: "invalid_grant" }, { status: 400 })
          }
          return Response.json({ api_key: "oa-key-integration", user })
        }
        return new Response("not found", { status: 404 })
      },
    })
    // "Browser" palsu: baca URL /auth/cli, langsung redirect ke loopback callback
    const browse = async (target: string, state?: string) => {
      const url = new URL(target)
      expect(url.pathname).toBe("/auth/cli")
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      challenge = url.searchParams.get("code_challenge") ?? undefined
      const redirect = url.searchParams.get("redirect_uri")!
      const callbackState = state ?? url.searchParams.get("state")!
      await fetch(`${redirect}?code=${issuedCode}&state=${encodeURIComponent(callbackState)}`)
    }
    return { server, browse, baseUrl: () => server.url.origin }
  }

  test("happy path: login menyimpan key ke Auth dan mengembalikan user", async () => {
    const backend = makeBackend()
    try {
      const result = await login({
        baseUrl: backend.baseUrl(),
        openBrowser: (url) => backend.browse(url),
      })
      expect(result.key).toBe("oa-key-integration")
      expect(result.user).toEqual(user)
      const stored = await authRt.runPromise((auth) => auth.get("openagentic"))
      expect(stored).toMatchObject({ type: "api", key: "oa-key-integration" })
    } finally {
      backend.server.stop(true)
      await logout()
    }
  })

  test("browser sukses terbuka: onUrl tetap dipanggil (fallback display, bukan hanya saat gagal)", async () => {
    const backend = makeBackend()
    const seen: string[] = []
    try {
      const result = await login({
        baseUrl: backend.baseUrl(),
        openBrowser: (url) => backend.browse(url),
        onUrl: (url) => {
          seen.push(url)
        },
      })
      expect(seen).toHaveLength(1)
      expect(seen[0]).toContain("/auth/cli?")
      expect(seen[0]).toContain("code_challenge_method=S256")
      expect(result.key).toBe("oa-key-integration")
    } finally {
      backend.server.stop(true)
      await logout()
    }
  })

  test("browser gagal terbuka: onUrl dipanggil dan login tetap sukses via URL manual", async () => {
    const backend = makeBackend()
    const seen: string[] = []
    try {
      const result = await login({
        baseUrl: backend.baseUrl(),
        openBrowser: async () => {
          throw new Error("no browser available")
        },
        onUrl: (url) => {
          seen.push(url)
          void backend.browse(url)
        },
      })
      expect(seen).toHaveLength(1)
      expect(seen[0]).toContain("/auth/cli?")
      expect(result.key).toBe("oa-key-integration")
    } finally {
      backend.server.stop(true)
      await logout()
    }
  })

  test("state mismatch: login reject, tidak ada key tersimpan", async () => {
    const backend = makeBackend()
    try {
      const err = await login({
        baseUrl: backend.baseUrl(),
        openBrowser: (url) => backend.browse(url, "wrong-state"),
      }).then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("state_mismatch")
      const stored = await authRt.runPromise((auth) => auth.get("openagentic"))
      expect(stored).toBeUndefined()
    } finally {
      backend.server.stop(true)
    }
  })

  test("timeout: tanpa callback, login reject timeout", async () => {
    const backend = makeBackend()
    try {
      const err = await login({
        baseUrl: backend.baseUrl(),
        timeoutMs: 200,
        openBrowser: async () => {},
      }).then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("timeout")
    } finally {
      backend.server.stop(true)
    }
  })

  test("logout menghapus entri openagentic", async () => {
    await authRt.runPromise((auth) => auth.set("openagentic", { type: "api", key: "to-be-removed" }))
    await logout()
    const stored = await authRt.runPromise((auth) => auth.get("openagentic"))
    expect(stored).toBeUndefined()
  })
})
