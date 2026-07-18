import { afterEach, describe, expect, test } from "bun:test"
import { OpenagenticError } from "@/provider/openagentic-error"
import {
  MOCK_API_KEY,
  startOpenagenticMock,
  type FailureMode,
  type OpenagenticMock,
} from "../fixtures/openagentic-mock"

let mock: OpenagenticMock | undefined
afterEach(() => {
  mock?.close()
  mock = undefined
})

async function parseFailure(mode: FailureMode) {
  mock = startOpenagenticMock()
  mock.failWith(mode)
  const res = await fetch(`${mock.url}/api/v1/models`, { headers: { authorization: `Bearer ${MOCK_API_KEY}` } })
  return { status: res.status, info: OpenagenticError.parse(res.status, await res.json()) }
}

describe("OpenagenticError", () => {
  test("401 invalid_key parses and maps to a re-login message", async () => {
    const { status, info } = await parseFailure("invalid_key")
    expect(status).toBe(401)
    expect(info?.code).toBe("invalid_key")
    expect(OpenagenticError.message(info!).toLowerCase()).toContain("login")
  })

  test("403 plan_required carries model + required_plan and links pricing", async () => {
    const { status, info } = await parseFailure("plan_required")
    expect(status).toBe(403)
    expect(info).toEqual({ code: "plan_required", model: "gpt-5", required_plan: "pro" })
    const message = OpenagenticError.message(info!)
    expect(message).toContain("gpt-5")
    expect(message).toContain("pro")
    expect(message).toContain("openagentic.id/pricing")
  })

  test("429 quota_exceeded carries retry_after into the message", async () => {
    const { status, info } = await parseFailure("quota_exceeded")
    expect(status).toBe(429)
    expect(info).toEqual({ code: "quota_exceeded", retry_after: 3600 })
    expect(OpenagenticError.message(info!)).toContain("openagentic.id/pricing")
  })

  test("429 rate_limited parses distinctly from quota_exceeded", async () => {
    const { info } = await parseFailure("rate_limited")
    expect(info).toEqual({ code: "rate_limited", retry_after: 30 })
  })

  test("off-contract responses return undefined (no fake friendly messages)", () => {
    expect(OpenagenticError.parse(500, { error: "boom" })).toBeUndefined()
    expect(OpenagenticError.parse(200, { data: [] })).toBeUndefined()
    expect(OpenagenticError.parse(401, "not json shaped")).toBeUndefined()
  })
})
