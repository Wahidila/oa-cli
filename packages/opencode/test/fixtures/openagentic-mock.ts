// Local stand-in for the openagentic.id backend (spec §7). Serves the four
// endpoints OA-cli talks to, plus switchable failure modes for the structured
// error contract (§7-8). Point the CLI at it via OPENAGENTIC_BASE_URL.
import { createHash, randomBytes } from "node:crypto"

export const MOCK_API_KEY = "oa-test-key"

export const MOCK_USER = {
  email: "test@openagentic.id",
  name: "Test User",
  plan: "free",
}

export const MOCK_MODELS = [
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic", context_limit: 200_000, default: true },
  { id: "gpt-5", name: "GPT-5", provider: "openai", context_limit: 400_000, default: false },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", context_limit: 1_048_576, default: false },
]

export type FailureMode = "invalid_key" | "plan_required" | "quota_exceeded" | "rate_limited"

export interface OpenagenticMockOptions {
  /** Redirect back to the CLI callback with a wrong `state` (state-mismatch tests). */
  corruptState?: boolean
}

export interface OpenagenticMock {
  /** Origin, e.g. http://127.0.0.1:49321 — assign to process.env.OPENAGENTIC_BASE_URL */
  readonly url: string
  /** Every request received, in order. */
  readonly requests: { method: string; path: string }[]
  /** Body of every POST /api/v1/cli/token, in order (the CLI sends `device` for per-device key dedup). */
  readonly tokenRequests: { code?: string; device?: string }[]
  /** Force /api/v1/models and /api/v1/chat/completions to return the structured error. Pass undefined to restore. */
  failWith(mode: FailureMode | undefined): void
  close(): void
}

function s256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function failureResponse(mode: FailureMode) {
  switch (mode) {
    case "invalid_key":
      return json(401, { error: { code: "invalid_key", message: "API key is invalid or has been revoked" } })
    case "plan_required":
      return json(403, {
        error: {
          code: "plan_required",
          message: "Model gpt-5 requires the pro plan",
          model: "gpt-5",
          required_plan: "pro",
        },
      })
    case "quota_exceeded":
      return json(429, { error: { code: "quota_exceeded", message: "Daily quota exceeded", retry_after: 3600 } })
    case "rate_limited":
      return json(429, { error: { code: "rate_limited", message: "Too many requests", retry_after: 30 } })
  }
}

function sseCompletion(model: string) {
  const line = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`
  const chunk = (delta: Record<string, unknown>, finish: string | null = null, usage?: Record<string, number>) => ({
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  })
  return (
    line(chunk({ role: "assistant" })) +
    line(chunk({ content: "Halo dari OpenAgentic!" })) +
    line(chunk({}, "stop", { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 })) +
    "data: [DONE]\n\n"
  )
}

export function startOpenagenticMock(options: OpenagenticMockOptions = {}): OpenagenticMock {
  let failure: FailureMode | undefined
  const codes = new Map<string, string>() // authorization code -> code_challenge
  const requests: { method: string; path: string }[] = []
  const tokenRequests: { code?: string; device?: string }[] = []

  const authed = (req: Request) => req.headers.get("authorization") === `Bearer ${MOCK_API_KEY}`

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      requests.push({ method: req.method, path: url.pathname })

      if (req.method === "GET" && url.pathname === "/auth/cli") {
        const redirect = url.searchParams.get("redirect_uri")
        const state = url.searchParams.get("state")
        const challenge = url.searchParams.get("code_challenge")
        if (!redirect || !state || !challenge)
          return json(400, {
            error: { code: "invalid_request", message: "redirect_uri, state and code_challenge are required" },
          })
        const target = new URL(redirect)
        if (target.protocol !== "http:" || target.hostname !== "127.0.0.1")
          return json(400, { error: { code: "invalid_request", message: "redirect_uri must be http://127.0.0.1" } })
        const code = randomBytes(16).toString("hex")
        codes.set(code, challenge)
        target.searchParams.set("code", code)
        target.searchParams.set("state", options.corruptState ? "corrupted-state" : state)
        return Response.redirect(target.toString(), 302)
      }

      if (req.method === "POST" && url.pathname === "/api/v1/cli/token") {
        const body = (await req.json().catch(() => ({}))) as {
          code?: string
          code_verifier?: string
          device?: string
        }
        tokenRequests.push({ code: body.code, device: body.device })
        const challenge = body.code ? codes.get(body.code) : undefined
        if (!body.code || !body.code_verifier || !challenge || s256(body.code_verifier) !== challenge)
          return json(400, {
            error: { code: "invalid_grant", message: "code expired, already used, or PKCE verification failed" },
          })
        codes.delete(body.code)
        // Real backend labels the key `OA-cli — <device>` and dedupes per {user, device}
        // before issuing (see docs/cli-token-key-dedup-handoff.md). The mock issues a
        // fixed key; it records `device` so tests can assert the CLI sends it.
        return json(200, { api_key: MOCK_API_KEY, user: MOCK_USER })
      }

      if (req.method === "GET" && url.pathname === "/api/v1/models") {
        if (failure) return failureResponse(failure)
        if (!authed(req)) return json(401, { error: { code: "invalid_key", message: "missing or invalid API key" } })
        return json(200, { data: MOCK_MODELS })
      }

      if (req.method === "POST" && url.pathname === "/api/v1/chat/completions") {
        if (failure) return failureResponse(failure)
        if (!authed(req)) return json(401, { error: { code: "invalid_key", message: "missing or invalid API key" } })
        const body = (await req.json().catch(() => ({}))) as { model?: string }
        return new Response(sseCompletion(body.model ?? "claude-sonnet-4-5"), {
          headers: { "content-type": "text/event-stream" },
        })
      }

      return json(404, { error: { code: "not_found", message: url.pathname } })
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    tokenRequests,
    failWith(mode) {
      failure = mode
    },
    close() {
      server.stop(true)
    },
  }
}
