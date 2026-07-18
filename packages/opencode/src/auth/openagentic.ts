export * as OpenagenticAuth from "./openagentic"

import open from "open"
import { Effect } from "effect"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Auth } from "@/auth"

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

// ---------------------------------------------------------------------------
// Error terstruktur untuk alur login
// ---------------------------------------------------------------------------

export type LoginErrorCode =
  | "timeout"
  | "state_mismatch"
  | "access_denied"
  | "invalid_grant"
  | "server_error"
  | "invalid_response"
  | "port_unavailable"

export class LoginError extends Error {
  constructor(
    readonly code: LoginErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "OpenagenticLoginError"
  }
}

// ---------------------------------------------------------------------------
// Loopback callback server (RFC 8252 §7.3)
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

const SUCCESS_HTML = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>OA-cli</title></head><body style="background:#0c0a09;color:#ffffff;font-family:ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="color:#f97316;font-size:2rem;margin-bottom:.5rem">&#10003;</div><h1 style="font-size:1.25rem;margin:0 0 .25rem">Berhasil</h1><p style="color:#a8a29e;margin:0">Kembali ke terminal untuk melanjutkan.</p></div><script>setTimeout(function(){window.close()},1500)</script></body></html>`

const errorHtml = (detail: string) =>
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>OA-cli</title></head><body style="background:#0c0a09;color:#ffffff;font-family:ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="color:#ef4444;font-size:2rem;margin-bottom:.5rem">&#10007;</div><h1 style="font-size:1.25rem;margin:0 0 .25rem">Login gagal</h1><p style="color:#a8a29e;margin:0">${detail}</p></div></body></html>`

const html = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } })

function serveWithRetry(handler: (request: Request) => Response, maxAttempts: number) {
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler })
    } catch (error) {
      lastError = error
    }
  }
  throw new LoginError("port_unavailable", `Gagal membuka port loopback: ${String(lastError)}`)
}

export interface CallbackServer {
  port: number
  /** redirect_uri lengkap: http://127.0.0.1:<port>/callback */
  url: string
  /** Resolve dengan authorization code, reject dengan LoginError */
  code: Promise<string>
  stop: () => void
}

export function startCallbackServer(opts: {
  state: string
  timeoutMs?: number
  maxAttempts?: number
}): CallbackServer {
  let resolveCode!: (code: string) => void
  let rejectCode!: (error: LoginError) => void
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  // Cegah unhandledRejection kalau reject terjadi saat caller belum/berhenti await
  code.catch(() => {})

  const handler = (request: Request): Response => {
    const url = new URL(request.url)
    if (request.method !== "GET" || url.pathname !== "/callback") return new Response("Not found", { status: 404 })

    const errorParam = url.searchParams.get("error")
    if (errorParam) {
      rejectCode(
        new LoginError(
          errorParam === "access_denied" ? "access_denied" : "server_error",
          `Login ditolak: ${errorParam}`,
        ),
      )
      return html(errorHtml("Login ditolak. Tutup jendela ini dan coba lagi dari terminal."), 400)
    }
    if (url.searchParams.get("state") !== opts.state) {
      rejectCode(new LoginError("state_mismatch", "State callback tidak cocok — coba login ulang."))
      return html(errorHtml("State tidak cocok. Tutup jendela ini dan coba lagi dari terminal."), 400)
    }
    const codeParam = url.searchParams.get("code")
    if (!codeParam) {
      rejectCode(new LoginError("invalid_response", "Callback tanpa authorization code."))
      return html(errorHtml("Authorization code tidak ditemukan."), 400)
    }
    resolveCode(codeParam)
    return html(SUCCESS_HTML, 200)
  }

  const server = serveWithRetry(handler, opts.maxAttempts ?? 5)
  // Tipe Bun `Server.port` adalah `number | undefined` (undefined untuk unix socket);
  // listener TCP selalu punya port, tapi guard eksplisit agar `tsgo --noEmit` lolos.
  const port = server.port
  if (port === undefined) {
    server.stop(true)
    throw new LoginError("port_unavailable", "Server loopback tidak mendapatkan port.")
  }

  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const onTimeout = () => rejectCode(new LoginError("timeout", "Login timeout (5 menit) — coba lagi."))
  signal.addEventListener("abort", onTimeout, { once: true })

  return {
    port,
    url: `http://127.0.0.1:${port}/callback`,
    code,
    stop: () => {
      signal.removeEventListener("abort", onTimeout)
      server.stop(true)
    },
  }
}

// ---------------------------------------------------------------------------
// Token exchange: POST /api/v1/cli/token { code, code_verifier }
// ---------------------------------------------------------------------------

export function defaultBaseUrl(): string {
  return process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id"
}

export interface TokenResponse {
  api_key: string
  user: { email: string; name: string; plan: string }
}

function isTokenResponse(data: unknown): data is TokenResponse {
  if (typeof data !== "object" || data === null) return false
  const record = data as Record<string, unknown>
  if (typeof record.api_key !== "string") return false
  const user = record.user as Record<string, unknown> | undefined
  if (typeof user !== "object" || user === null) return false
  return typeof user.email === "string" && typeof user.name === "string" && typeof user.plan === "string"
}

export async function exchangeToken(input: {
  code: string
  verifier: string
  baseUrl?: string
}): Promise<TokenResponse> {
  const base = input.baseUrl ?? defaultBaseUrl()
  const response = await fetch(`${base}/api/v1/cli/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: input.code, code_verifier: input.verifier }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined
    if (body?.error === "invalid_grant") {
      throw new LoginError("invalid_grant", "Authorization code kedaluwarsa atau sudah dipakai — coba login ulang.")
    }
    throw new LoginError(
      "server_error",
      `Tukar token gagal (${response.status})${body?.error ? `: ${body.error}` : ""}`,
    )
  }
  const data = await response.json().catch(() => undefined)
  if (!isTokenResponse(data)) throw new LoginError("invalid_response", "Response /api/v1/cli/token tidak valid.")
  return data
}

// ---------------------------------------------------------------------------
// Orkestrasi login/logout
// ---------------------------------------------------------------------------

export const PROVIDER_ID = "openagentic"

// Idiom bridging Effect -> Promise, sama dengan src/config/tui.ts:264.
// makeRuntime lazy — ManagedRuntime baru dibuat saat run* pertama, jadi aman di module scope.
const authRuntime = makeRuntime(Auth.Service, AppNodeBuilder.build(Auth.node))

export interface LoginOptions {
  /**
   * Dipanggil selalu (jika disediakan) dengan URL login, segera setelah URL
   * terbentuk — terlepas dari apakah browser berhasil dibuka. Dipakai caller
   * untuk menampilkan URL sebagai fallback copy-paste (mis. layar login TUI),
   * bukan hanya saat browser gagal dibuka.
   */
  onUrl?: (url: string) => void
  /** @internal test hook — default https://openagentic.id */
  baseUrl?: string
  /** @internal test hook — default 5 menit */
  timeoutMs?: number
  /** @internal test hook — default package `open` */
  openBrowser?: (url: string) => Promise<void>
}

export interface LoginResult {
  key: string
  user: { email: string; name: string; plan: string }
}

export async function login(opts?: LoginOptions): Promise<LoginResult> {
  const base = opts?.baseUrl ?? defaultBaseUrl()
  const verifier = generateVerifier()
  const challenge = await challengeS256(verifier)
  const state = generateState()

  const server = startCallbackServer({ state, timeoutMs: opts?.timeoutMs })
  try {
    const params = new URLSearchParams({
      redirect_uri: server.url,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })
    const url = `${base}/auth/cli?${params.toString()}`

    // onUrl selalu dipanggil (jika disediakan) — untuk display/fallback — terlepas
    // dari keberhasilan pembukaan browser. Kegagalan buka browser ditelan terpisah.
    opts?.onUrl?.(url)
    const openBrowser = opts?.openBrowser ?? ((target: string) => open(target).then(() => undefined))
    await openBrowser(url).catch(() => {})

    const code = await server.code
    const token = await exchangeToken({ code, verifier, baseUrl: base })
    await authRuntime.runPromise((auth) => auth.set(PROVIDER_ID, { type: "api", key: token.api_key }))
    return { key: token.api_key, user: token.user }
  } finally {
    server.stop()
  }
}

export async function logout(): Promise<void> {
  await authRuntime.runPromise((auth) => auth.remove(PROVIDER_ID))
}

// ---------------------------------------------------------------------------
// Authentication check (env var CI escape hatch + stored credential)
// ---------------------------------------------------------------------------

/** Exact copy required by the design spec (§4) for non-interactive use without credentials. */
export const NOT_LOGGED_IN_MESSAGE = "Belum login. Jalankan `oa-cli` dulu untuk login."

/** CI/automation escape hatch: a non-empty OPENAGENTIC_API_KEY counts as logged in. */
export function hasEnvKey(env: Record<string, string | undefined> = process.env): boolean {
  return (env["OPENAGENTIC_API_KEY"] ?? "").trim().length > 0
}

/**
 * Effect-native login check for effectCmd handlers. Never fails: an unreadable
 * auth.json is treated as "not logged in" (the user can just log in again).
 */
export const isAuthenticatedEffect = Effect.fn("OpenagenticAuth.isAuthenticated")(function* () {
  if (hasEnvKey()) return true
  const auth = yield* Auth.Service
  const info = yield* auth.get(PROVIDER_ID).pipe(Effect.orElseSucceed(() => undefined))
  return info?.type === "api" && info.key.trim().length > 0
})

/** Promise wrapper for non-Effect callers (TUI boot / login gate). */
export async function isAuthenticated(): Promise<boolean> {
  const { AppRuntime } = await import("@/effect/app-runtime")
  return AppRuntime.runPromise(isAuthenticatedEffect())
}
