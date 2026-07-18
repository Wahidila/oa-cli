import { afterEach, expect } from "bun:test"
import { APICallError, streamText } from "ai"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect } from "effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { MOCK_API_KEY, startOpenagenticMock, type OpenagenticMock } from "../fixtures/openagentic-mock"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, CrossSpawnSpawner.node])),
)

const acquireMock = Effect.acquireRelease(
  Effect.sync(() => startOpenagenticMock()),
  (mock) => Effect.sync(() => mock.close()),
)

// Point the CLI at the mock and pretend the user is logged in. Must wrap
// instance creation: the provider state (and model discovery) is built then.
// Same acquireUseRelease idiom as withAuthContent in header-timeout.test.ts.
const withOpenagenticEnv = <A, E, R>(mock: OpenagenticMock, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = {
        auth: process.env["OPENCODE_AUTH_CONTENT"],
        base: process.env["OPENAGENTIC_BASE_URL"],
      }
      process.env["OPENCODE_AUTH_CONTENT"] = JSON.stringify({ openagentic: { type: "api", key: MOCK_API_KEY } })
      process.env["OPENAGENTIC_BASE_URL"] = mock.url
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous.auth === undefined) delete process.env["OPENCODE_AUTH_CONTENT"]
        else process.env["OPENCODE_AUTH_CONTENT"] = previous.auth
        if (previous.base === undefined) delete process.env["OPENAGENTIC_BASE_URL"]
        else process.env["OPENAGENTIC_BASE_URL"] = previous.base
      }),
  )

it.live("discovers models from /api/v1/models and applies the server-side default", () =>
  Effect.gen(function* () {
    const mock = yield* acquireMock
    yield* withOpenagenticEnv(
      mock,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const info = yield* provider.getProvider(ProviderV2.ID.make("openagentic"))
          expect(Object.keys(info.models).sort()).toEqual(["claude-sonnet-4-5", "gemini-2.5-pro", "gpt-5"])
          const def = yield* provider.defaultModel()
          expect(String(def.providerID)).toBe("openagentic")
          expect(String(def.modelID)).toBe("claude-sonnet-4-5")
        }),
      ),
    )
  }),
)

it.live("chat round-trip through the openagentic provider streams the mock completion", () =>
  Effect.gen(function* () {
    const mock = yield* acquireMock
    yield* withOpenagenticEnv(
      mock,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const model = yield* provider.getModel(
            ProviderV2.ID.make("openagentic"),
            ModelV2.ID.make("claude-sonnet-4-5"),
          )
          const result = streamText({
            model: yield* provider.getLanguage(model),
            messages: [{ role: "user", content: "halo" }],
          })
          expect(yield* Effect.promise(() => result.text)).toBe("Halo dari OpenAgentic!")
          expect(mock.requests.some((r) => r.method === "POST" && r.path === "/api/v1/chat/completions")).toBe(true)
        }),
      ),
    )
  }),
)

it.live("401 invalid_key mid-session surfaces as an APICallError with the contract body", () =>
  Effect.gen(function* () {
    const mock = yield* acquireMock
    yield* withOpenagenticEnv(
      mock,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          // discovery ran while the mock was healthy; now the key gets revoked
          const model = yield* provider.getModel(
            ProviderV2.ID.make("openagentic"),
            ModelV2.ID.make("claude-sonnet-4-5"),
          )
          mock.failWith("invalid_key")
          const result = streamText({
            model: yield* provider.getLanguage(model),
            onError() {},
            messages: [{ role: "user", content: "halo" }],
          })
          const error = yield* Effect.promise(async () => {
            for await (const part of result.fullStream) {
              if (part.type === "error") return part.error
            }
          })
          expect(APICallError.isInstance(error)).toBe(true)
          if (!APICallError.isInstance(error)) throw new Error("Expected APICallError")
          expect(error.statusCode).toBe(401)
          expect(error.responseBody ?? "").toContain("invalid_key")
        }),
      ),
    )
  }),
)
