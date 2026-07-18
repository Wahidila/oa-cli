import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { Auth } from "../../src/auth"
import { OpenagenticAuth } from "../../src/auth/openagentic"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(Auth.node))

describe("OpenagenticAuth.isAuthenticatedEffect", () => {
  beforeEach(() => {
    delete process.env["OPENAGENTIC_API_KEY"]
  })
  afterEach(() => {
    delete process.env["OPENAGENTIC_API_KEY"]
  })

  it.instance("false when no credential and no env key", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(false)
    }),
  )

  it.instance("true when auth.json has an openagentic api credential", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set(OpenagenticAuth.PROVIDER_ID, { type: "api", key: "oa-test-key" })
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(true)
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
    }),
  )

  it.instance("false when only a credential for another provider exists", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      yield* auth.set("someother", { type: "api", key: "sk-other" })
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(false)
      yield* auth.remove("someother")
    }),
  )

  it.instance("OPENAGENTIC_API_KEY env var counts as logged in", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      process.env["OPENAGENTIC_API_KEY"] = "oa-env-key"
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(true)
    }),
  )
})

describe("OpenagenticAuth.currentUserEffect", () => {
  it.instance("undefined when no credential", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      expect(yield* OpenagenticAuth.currentUserEffect()).toBeUndefined()
    }),
  )

  it.instance("returns the stored metadata as the user", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set(OpenagenticAuth.PROVIDER_ID, {
        type: "api",
        key: "oa-test-key",
        metadata: { email: "user@example.com", name: "User Example", plan: "pro" },
      })
      expect(yield* OpenagenticAuth.currentUserEffect()).toEqual({
        email: "user@example.com",
        name: "User Example",
        plan: "pro",
      })
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
    }),
  )

  it.instance("undefined when the stored credential has no metadata (older credential)", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set(OpenagenticAuth.PROVIDER_ID, { type: "api", key: "oa-test-key" })
      expect(yield* OpenagenticAuth.currentUserEffect()).toBeUndefined()
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
    }),
  )

  it.instance("undefined when only a credential for another provider exists", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      yield* auth.set("someother", {
        type: "api",
        key: "sk-other",
        metadata: { email: "other@example.com", name: "Other", plan: "free" },
      })
      expect(yield* OpenagenticAuth.currentUserEffect()).toBeUndefined()
      yield* auth.remove("someother")
    }),
  )
})

describe("OpenagenticAuth.hasEnvKey", () => {
  test("only a non-empty, non-whitespace value counts", () => {
    expect(OpenagenticAuth.hasEnvKey({})).toBe(false)
    expect(OpenagenticAuth.hasEnvKey({ OPENAGENTIC_API_KEY: "" })).toBe(false)
    expect(OpenagenticAuth.hasEnvKey({ OPENAGENTIC_API_KEY: "   " })).toBe(false)
    expect(OpenagenticAuth.hasEnvKey({ OPENAGENTIC_API_KEY: "oa-key" })).toBe(true)
  })
})

describe("OpenagenticAuth.NOT_LOGGED_IN_MESSAGE", () => {
  test("matches the spec copy exactly", () => {
    expect(OpenagenticAuth.NOT_LOGGED_IN_MESSAGE).toBe("Belum login. Jalankan `oa-cli` dulu untuk login.")
  })
})
