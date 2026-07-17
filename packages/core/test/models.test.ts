import { describe, expect, beforeAll, afterAll, test } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { Provider as ProviderSchema } from "@opencode-ai/schema/provider"
import { it } from "./lib/effect"
import { readFile } from "fs/promises"
import path from "path"

// test/preload.ts pins OPENCODE_MODELS_PATH to a multi-provider fixture so
// other suites can resolve providers. These tests exercise the locked
// catalog itself, so clear the override for this suite and restore after.
const ORIGINAL_MODELS_PATH = Flag.OPENCODE_MODELS_PATH
beforeAll(() => {
  Flag.OPENCODE_MODELS_PATH = undefined
})
afterAll(() => {
  Flag.OPENCODE_MODELS_PATH = ORIGINAL_MODELS_PATH
})

// Layer.fresh is required because the ModelsDev implementation is a
// module-level Layer constant and Effect.provide memoizes layers in a
// process-global MemoMap — without fresh, every test would share the first
// build's cached catalog.
const provided = <A, E>(eff: Effect.Effect<A, E, ModelsDev.Service>) =>
  eff.pipe(Effect.provide(Layer.fresh(AppNodeBuilder.build(ModelsDev.node))))

describe("ModelsDev locked catalog", () => {
  it.live("get() returns exactly one provider: openagentic", () =>
    Effect.gen(function* () {
      const result = yield* provided(ModelsDev.Service.use((s) => s.get()))
      expect(Object.keys(result)).toEqual(["openagentic"])
      const provider = result["openagentic"]
      expect(provider.id).toBe("openagentic")
      expect(provider.name).toBe("OpenAgentic")
      expect(provider.api).toBe("https://openagentic.id/api/v1")
      expect(provider.npm).toBe("@ai-sdk/openai-compatible")
      expect(provider.env).toEqual(["OPENAGENTIC_API_KEY"])
      expect(provider.models).toEqual({})
    }),
  )

  it.live("refresh() is a no-op and the catalog stays locked", () =>
    Effect.gen(function* () {
      const result = yield* provided(
        Effect.gen(function* () {
          const svc = yield* ModelsDev.Service
          yield* svc.refresh(true)
          return yield* svc.get()
        }),
      )
      expect(Object.keys(result)).toEqual(["openagentic"])
    }),
  )

  it.live("get() honors the OPENCODE_MODELS_PATH test fixture override", () =>
    Effect.gen(function* () {
      const fixturePath = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
      const expected = JSON.parse(
        yield* Effect.promise(() => readFile(fixturePath, "utf8")),
      ) as Record<string, unknown>
      const result = yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          Flag.OPENCODE_MODELS_PATH = fixturePath
        }),
        () => provided(ModelsDev.Service.use((s) => s.get())),
        () =>
          Effect.sync(() => {
            Flag.OPENCODE_MODELS_PATH = undefined
          }),
      )
      expect(Object.keys(result).sort()).toEqual(Object.keys(expected).sort())
    }),
  )
})

describe("Provider.ID statics", () => {
  test("exposes the openagentic provider id", () => {
    expect(ProviderSchema.ID.openagentic).toBe(ProviderSchema.ID.make("openagentic"))
  })
})
