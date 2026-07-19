import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { OpenagenticModels } from "@/provider/openagentic-models"

const fixture = {
  data: [
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      provider: "anthropic",
      context_limit: 200000,
      default: true,
    },
    { id: "gpt-5-codex", provider: "openai" },
  ],
}

describe("OpenagenticModels.fromResponse", () => {
  test("maps the API response into internal models", () => {
    const { models, defaultModelID } = OpenagenticModels.fromResponse(fixture)
    expect(Object.keys(models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])

    const sonnet = models["claude-sonnet-4-5"]
    expect(sonnet.name).toBe("Claude Sonnet 4.5")
    expect(String(sonnet.providerID)).toBe("openagentic")
    expect(sonnet.family).toBe("anthropic")
    expect(sonnet.api).toEqual({
      id: "claude-sonnet-4-5",
      url: "https://openagentic.id/api/v1",
      npm: "@ai-sdk/openai-compatible",
    })
    expect(sonnet.limit.context).toBe(200000)
    expect(sonnet.options.default).toBe(true)
    expect(defaultModelID).toBe("claude-sonnet-4-5")

    const codex = models["gpt-5-codex"]
    expect(codex.name).toBe("gpt-5-codex") // name falls back to id
    expect(codex.limit.context).toBe(128000) // context_limit fallback
    expect(codex.options.default).toBeUndefined()
  })

  test("falls back to the first model when the server flags none as default", () => {
    const { models, defaultModelID } = OpenagenticModels.fromResponse({ data: [{ id: "a" }, { id: "b" }] })
    expect(defaultModelID).toBe("a")
    expect(models["a"].options.default).toBe(true)
    expect(models["b"].options.default).toBeUndefined()
  })

  test("returns empty on malformed responses", () => {
    expect(OpenagenticModels.fromResponse({ nope: true }).models).toEqual({})
    expect(OpenagenticModels.fromResponse("garbage").models).toEqual({})
  })

  test("skips a single malformed model instead of dropping the whole catalog", () => {
    // One bad entry (context_limit as a string) must not hide the good models.
    const { models, defaultModelID } = OpenagenticModels.fromResponse({
      data: [
        { id: "good-a", default: true },
        { id: "bad", context_limit: "not-a-number" },
        { id: "good-b" },
        { nope: "no id at all" },
      ],
    })
    expect(Object.keys(models).sort()).toEqual(["good-a", "good-b"])
    expect(defaultModelID).toBe("good-a")
  })
})

describe("OpenagenticModels.fetchModels", () => {
  test("fetches live models with the API key and writes the cache file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const cache = path.join(dir, "openagentic-models.json")
    // A mutable holder (rather than a bare `let`) sidesteps a TS control-flow
    // narrowing limitation: reads of a `let` outside the closure that
    // reassigns it get narrowed to the initializer's type, not the declared
    // union — see https://github.com/microsoft/TypeScript/issues/9998.
    const auth: { value: string | null } = { value: null }
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        auth.value = req.headers.get("authorization")
        if (new URL(req.url).pathname === "/api/v1/models") return Response.json(fixture)
        return new Response("not found", { status: 404 })
      },
    })
    try {
      const result = await OpenagenticModels.fetchModels({
        apiKey: "test-key",
        baseURL: `http://127.0.0.1:${server.port}/api/v1`,
        cache,
      })
      expect(auth.value).toBe("Bearer test-key")
      expect(Object.keys(result.models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])
      expect(result.defaultModelID).toBe("claude-sonnet-4-5")
      expect(JSON.parse(await readFile(cache, "utf8"))).toEqual(fixture)
    } finally {
      server.stop(true)
    }
  })

  test("serves cached models when the API is unreachable", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const cache = path.join(dir, "openagentic-models.json")
    await writeFile(cache, JSON.stringify(fixture))
    const result = await OpenagenticModels.fetchModels({
      apiKey: "test-key",
      baseURL: "http://127.0.0.1:9", // nothing listens here
      cache,
    })
    expect(Object.keys(result.models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])
    expect(result.defaultModelID).toBe("claude-sonnet-4-5")
  })

  test("serves cached models when the API returns garbage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const cache = path.join(dir, "openagentic-models.json")
    await writeFile(cache, JSON.stringify(fixture))
    const server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ nope: true }),
    })
    try {
      const result = await OpenagenticModels.fetchModels({
        baseURL: `http://127.0.0.1:${server.port}/api/v1`,
        cache,
      })
      expect(Object.keys(result.models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])
    } finally {
      server.stop(true)
    }
  })

  test("returns an empty result when the API fails and the cache is empty", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const result = await OpenagenticModels.fetchModels({
      baseURL: "http://127.0.0.1:9",
      cache: path.join(dir, "missing.json"),
    })
    expect(result.models).toEqual({})
    expect(result.defaultModelID).toBeUndefined()
  })
})
