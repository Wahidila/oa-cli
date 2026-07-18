import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { OpenagenticAuth } from "../../src/auth/openagentic"
import { MOCK_API_KEY, startOpenagenticMock, type OpenagenticMock } from "../fixtures/openagentic-mock"

// Isolasi dari env user (preload tidak menghapus var ini) — sama seperti
// test/auth/openagentic.test.ts.
delete process.env["OPENCODE_AUTH_CONTENT"]

let mock: OpenagenticMock | undefined
let previousBase: string | undefined

beforeEach(() => {
  previousBase = process.env["OPENAGENTIC_BASE_URL"]
  delete process.env["OPENCODE_AUTH_CONTENT"]
})

afterEach(async () => {
  // keep the process-shared auth.json clean for unrelated tests in the same run
  await OpenagenticAuth.logout().catch(() => {})
  mock?.close()
  mock = undefined
  if (previousBase === undefined) delete process.env["OPENAGENTIC_BASE_URL"]
  else process.env["OPENAGENTIC_BASE_URL"] = previousBase
})

const authFile = () => path.join(Global.Path.data, "auth.json")

// Simulates the user's browser without ever launching a real one. `login()`
// only skips its default `open(url)` call when an `openBrowser` override is
// passed — `onUrl` is a fire-and-forget display hook (still called either
// way) and does NOT prevent the real browser from opening. So the headless
// driver here MUST be wired through `openBrowser`, not `onUrl`.
//
// GET the authorize URL; fetch follows the mock's 302 back to the CLI's
// loopback callback server automatically (redirect: "follow" is the fetch
// default). Swallow the rejection — on the state-mismatch path the callback
// response is an error page (not a network failure) so this never actually
// throws, but we guard anyway so a hiccup here can't become an unhandled
// rejection in a "browser" the code under test doesn't await for content.
const openBrowser = async (url: string) => {
  await fetch(url).catch(() => {})
}

describe("OpenagenticAuth.login (e2e against the mock)", () => {
  test("login() completes the PKCE loopback flow, stores the key, and returns the user", async () => {
    mock = startOpenagenticMock()
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    const result = await OpenagenticAuth.login({ openBrowser })

    expect(result.key).toBe(MOCK_API_KEY)
    expect(result.user).toEqual({ email: "test@openagentic.id", name: "Test User", plan: "free" })

    const data = (await Bun.file(authFile()).json()) as Record<string, unknown>
    expect(data["openagentic"]).toEqual({
      type: "api",
      key: MOCK_API_KEY,
      metadata: { email: "test@openagentic.id", name: "Test User", plan: "free" },
    })

    // the CLI actually exchanged the code server-side against the real mock
    expect(mock.requests.some((r) => r.method === "POST" && r.path === "/api/v1/cli/token")).toBe(true)
  })

  test("login() persists the user metadata so currentUser() resolves it later", async () => {
    mock = startOpenagenticMock()
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    await OpenagenticAuth.login({ openBrowser })

    const user = await OpenagenticAuth.currentUser()
    expect(user).toEqual({ email: "test@openagentic.id", name: "Test User", plan: "free" })
  })

  test("login() rejects when the callback state does not match", async () => {
    mock = startOpenagenticMock({ corruptState: true })
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    const err = await OpenagenticAuth.login({ openBrowser }).then(
      () => undefined,
      (e) => e,
    )

    expect(err).toBeInstanceOf(OpenagenticAuth.LoginError)
    expect((err as InstanceType<typeof OpenagenticAuth.LoginError>).code).toBe("state_mismatch")
    // no token exchange must happen on state mismatch
    expect(mock.requests.some((r) => r.path === "/api/v1/cli/token")).toBe(false)

    const data = (await Bun.file(authFile()).json().catch(() => ({}))) as Record<string, unknown>
    expect(data["openagentic"]).toBeUndefined()
  })

  test("login() rejects when the token exchange returns invalid_grant", async () => {
    mock = startOpenagenticMock()
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    // Skip the mock's /auth/cli hop and hand the loopback callback an
    // authorization code the mock never issued (redirect_uri/state are public
    // query params on the authorize URL itself, so no server round-trip is
    // needed to read them). login()'s real exchangeToken() then presents this
    // unknown code to the real mock's /api/v1/cli/token, which — per its
    // single-use code registry (M1) — answers exactly as it would for an
    // expired or already-used code: 400 invalid_grant.
    const staleCodeBrowser = async (url: string) => {
      const authorize = new URL(url)
      const callback = new URL(authorize.searchParams.get("redirect_uri")!)
      callback.searchParams.set("code", "stale-code-never-issued")
      callback.searchParams.set("state", authorize.searchParams.get("state")!)
      await fetch(callback).catch(() => {})
    }

    const err = await OpenagenticAuth.login({ openBrowser: staleCodeBrowser }).then(
      () => undefined,
      (e) => e,
    )

    expect(err).toBeInstanceOf(OpenagenticAuth.LoginError)
    expect((err as InstanceType<typeof OpenagenticAuth.LoginError>).code).toBe("invalid_grant")
    // the CLI did reach the real token endpoint — it just got a real rejection
    expect(mock.requests.some((r) => r.method === "POST" && r.path === "/api/v1/cli/token")).toBe(true)

    const data = (await Bun.file(authFile()).json().catch(() => ({}))) as Record<string, unknown>
    expect(data["openagentic"]).toBeUndefined()
  })

  test("logout() removes the stored credential", async () => {
    mock = startOpenagenticMock()
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    await OpenagenticAuth.login({ openBrowser })
    await OpenagenticAuth.logout()

    const data = (await Bun.file(authFile()).json()) as Record<string, unknown>
    expect(data["openagentic"]).toBeUndefined()
  })
})
