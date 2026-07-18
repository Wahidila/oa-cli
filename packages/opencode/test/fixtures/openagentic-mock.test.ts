import { afterEach, describe, expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import { MOCK_API_KEY, MOCK_MODELS, startOpenagenticMock, type OpenagenticMock } from "./openagentic-mock"

let mock: OpenagenticMock | undefined
afterEach(() => {
  mock?.close()
  mock = undefined
})

function pkce() {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

async function authorize(server: OpenagenticMock, challenge: string, state = "test-state") {
  const url = new URL(`${server.url}/auth/cli`)
  url.searchParams.set("redirect_uri", "http://127.0.0.1:59999/callback")
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  const res = await fetch(url, { redirect: "manual" })
  expect(res.status).toBe(302)
  return new URL(res.headers.get("location")!)
}

describe("openagentic mock", () => {
  test("/auth/cli redirects to the loopback with code and echoed state", async () => {
    mock = startOpenagenticMock()
    const { challenge } = pkce()
    const location = await authorize(mock, challenge, "abc123")
    expect(location.origin).toBe("http://127.0.0.1:59999")
    expect(location.pathname).toBe("/callback")
    expect(location.searchParams.get("state")).toBe("abc123")
    expect(location.searchParams.get("code")).toBeTruthy()
  })

  test("/auth/cli rejects non-loopback redirect_uri", async () => {
    mock = startOpenagenticMock()
    const url = new URL(`${mock.url}/auth/cli`)
    url.searchParams.set("redirect_uri", "https://evil.example.com/callback")
    url.searchParams.set("state", "s")
    url.searchParams.set("code_challenge", "c")
    const res = await fetch(url, { redirect: "manual" })
    expect(res.status).toBe(400)
  })

  test("token exchange verifies PKCE and is single-use", async () => {
    mock = startOpenagenticMock()
    const { verifier, challenge } = pkce()
    const location = await authorize(mock, challenge)
    const code = location.searchParams.get("code")!
    const exchange = (body: unknown) =>
      fetch(`${mock!.url}/api/v1/cli/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

    const ok = await exchange({ code, code_verifier: verifier })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({
      api_key: MOCK_API_KEY,
      user: { email: "test@openagentic.id", name: "Test User", plan: "free" },
    })

    const reused = await exchange({ code, code_verifier: verifier })
    expect(reused.status).toBe(400)
    const body = (await reused.json()) as { error: { code: string } }
    expect(body.error.code).toBe("invalid_grant")
  })

  test("token exchange rejects a wrong code_verifier with invalid_grant", async () => {
    mock = startOpenagenticMock()
    const { challenge } = pkce()
    const location = await authorize(mock, challenge)
    const res = await fetch(`${mock.url}/api/v1/cli/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: location.searchParams.get("code"), code_verifier: "not-the-right-verifier" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("invalid_grant")
  })

  test("/api/v1/models requires the API key and returns exactly one default model", async () => {
    mock = startOpenagenticMock()
    const denied = await fetch(`${mock.url}/api/v1/models`)
    expect(denied.status).toBe(401)

    const res = await fetch(`${mock.url}/api/v1/models`, {
      headers: { authorization: `Bearer ${MOCK_API_KEY}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof MOCK_MODELS }
    expect(body.data).toEqual(MOCK_MODELS)
    expect(body.data.filter((m) => m.default)).toHaveLength(1)
  })

  test("/api/v1/chat/completions streams an OpenAI-compatible completion", async () => {
    mock = startOpenagenticMock()
    const res = await fetch(`${mock.url}/api/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${MOCK_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", messages: [{ role: "user", content: "halo" }], stream: true }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const text = await res.text()
    expect(text).toContain('"content":"Halo dari OpenAgentic!"')
    expect(text.trim().endsWith("data: [DONE]")).toBe(true)
  })

  test("failure modes return the structured error contract", async () => {
    mock = startOpenagenticMock()
    const models = () =>
      fetch(`${mock!.url}/api/v1/models`, { headers: { authorization: `Bearer ${MOCK_API_KEY}` } })

    mock.failWith("invalid_key")
    let res = await models()
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_key")

    mock.failWith("plan_required")
    res = await models()
    expect(res.status).toBe(403)
    const plan = (await res.json()) as { error: { code: string; model: string; required_plan: string } }
    expect(plan.error.code).toBe("plan_required")
    expect(plan.error.model).toBe("gpt-5")
    expect(plan.error.required_plan).toBe("pro")

    mock.failWith("quota_exceeded")
    res = await models()
    expect(res.status).toBe(429)
    const quota = (await res.json()) as { error: { code: string; retry_after: number } }
    expect(quota.error.code).toBe("quota_exceeded")
    expect(quota.error.retry_after).toBe(3600)

    mock.failWith(undefined)
    res = await models()
    expect(res.status).toBe(200)
  })
})
