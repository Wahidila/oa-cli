import { Context, Effect, Layer, Schema } from "effect"
import { ModelsDev } from "@opencode-ai/schema/models-dev"
import { Flag } from "./flag/flag"
import { FSUtil } from "./fs-util"
import { makeGlobalNode } from "./effect/app-node"

export const CatalogModelStatus = Schema.Literals(["alpha", "beta", "deprecated"])
export type CatalogModelStatus = typeof CatalogModelStatus.Type

const CostTier = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache_read: Schema.optional(Schema.Finite),
  cache_write: Schema.optional(Schema.Finite),
  tier: Schema.Struct({
    type: Schema.Literal("context"),
    size: Schema.Finite,
  }),
})

const Cost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,
  cache_read: Schema.optional(Schema.Finite),
  cache_write: Schema.optional(Schema.Finite),
  tiers: Schema.optional(Schema.Array(CostTier)),
  context_over_200k: Schema.optional(
    Schema.Struct({
      input: Schema.Finite,
      output: Schema.Finite,
      cache_read: Schema.optional(Schema.Finite),
      cache_write: Schema.optional(Schema.Finite),
    }),
  ),
})

const ReasoningOption = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("effort"),
    values: Schema.Array(Schema.NullOr(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal("toggle"),
  }),
  Schema.Struct({
    type: Schema.Literal("budget_tokens"),
    min: Schema.optional(Schema.Finite),
    max: Schema.optional(Schema.Finite),
  }),
])

export const Model = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  family: Schema.optional(Schema.String),
  release_date: Schema.String,
  attachment: Schema.Boolean,
  reasoning: Schema.Boolean,
  temperature: Schema.Boolean,
  tool_call: Schema.Boolean,
  reasoning_options: Schema.optional(Schema.Array(ReasoningOption)),
  interleaved: Schema.optional(
    Schema.Union([
      Schema.Literal(true),
      Schema.Struct({
        field: Schema.Literals(["reasoning", "reasoning_content", "reasoning_details"]),
      }),
    ]),
  ),
  cost: Schema.optional(Cost),
  limit: Schema.Struct({
    context: Schema.Finite,
    input: Schema.optional(Schema.Finite),
    output: Schema.Finite,
  }),
  modalities: Schema.optional(
    Schema.Struct({
      input: Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"])),
      output: Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"])),
    }),
  ),
  experimental: Schema.optional(
    Schema.Struct({
      modes: Schema.optional(
        Schema.Record(
          Schema.String,
          Schema.Struct({
            cost: Schema.optional(Cost),
            provider: Schema.optional(
              Schema.Struct({
                body: Schema.optional(Schema.Record(Schema.String, Schema.MutableJson)),
                headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
              }),
            ),
          }),
        ),
      ),
    }),
  ),
  status: Schema.optional(CatalogModelStatus),
  provider: Schema.optional(
    Schema.Struct({ npm: Schema.optional(Schema.String), api: Schema.optional(Schema.String) }),
  ),
})
export type Model = Schema.Schema.Type<typeof Model>

export const Provider = Schema.Struct({
  api: Schema.optional(Schema.String),
  name: Schema.String,
  env: Schema.Array(Schema.String),
  id: Schema.String,
  npm: Schema.optional(Schema.String),
  models: Schema.Record(Schema.String, Model),
})

export type Provider = Schema.Schema.Type<typeof Provider>

export const Event = ModelsDev.Event

/**
 * The locked provider catalog. OA-cli talks to exactly one provider —
 * openagentic. Models are intentionally empty here: the model list comes
 * from live discovery against https://openagentic.id/api/v1/models with the
 * user's API key, not from a static catalog.
 */
export const CATALOG: Record<string, Provider> = {
  openagentic: {
    id: "openagentic",
    name: "OpenAgentic",
    api: "https://openagentic.id/api/v1",
    npm: "@ai-sdk/openai-compatible",
    env: ["OPENAGENTIC_API_KEY"],
    models: {},
  },
}

export interface Interface {
  readonly get: () => Effect.Effect<Record<string, Provider>>
  readonly refresh: (force?: boolean) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ModelsDev") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    // Flag.OPENCODE_MODELS_PATH is a test/dev-only escape hatch: the test
    // preloads point it at a fixture file so suites can exercise arbitrary
    // catalogs without the network. When unset (all production runs), the
    // catalog is the hardcoded single-provider CATALOG above. There is no
    // network fetch, no background refresh, and no on-disk cache.
    const populate = Effect.gen(function* () {
      const override = Flag.OPENCODE_MODELS_PATH
      if (override) {
        const fromDisk = yield* fs.readJson(override).pipe(
          Effect.map((v) => v as Record<string, Provider> | undefined),
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (fromDisk) return fromDisk
      }
      return CATALOG
    })

    const cachedGet = yield* Effect.cached(populate)

    return Service.of({
      get: () => cachedGet,
      // The catalog is a compile-time constant; refresh is kept as a no-op
      // so existing call sites (cli/cmd/providers.ts:357, cli/cmd/models.ts)
      // keep compiling until their surfaces are reworked/removed.
      refresh: () => Effect.void,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [FSUtil.node] })

export * as ModelsDev from "./models-dev"
