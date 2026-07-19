import path from "path"
import { mkdir, readFile, writeFile } from "fs/promises"
import { Option, Schema } from "effect"
import { Global } from "@opencode-ai/core/global"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { optional } from "@opencode-ai/core/schema"
import { ProviderTransform } from "./transform"
import type { Model } from "./provider"

export const PROVIDER_ID = "openagentic"
export function apiBase(): string {
  return (process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id") + "/api/v1"
}

const DEFAULT_CONTEXT_LIMIT = 128_000
const DEFAULT_OUTPUT_LIMIT = 32_768
const FETCH_TIMEOUT_MS = 10_000

export const ApiModel = Schema.Struct({
  id: Schema.String,
  name: optional(Schema.String),
  provider: optional(Schema.String),
  context_limit: optional(Schema.Finite),
  default: optional(Schema.Boolean),
})
export type ApiModel = Schema.Schema.Type<typeof ApiModel>

export const ModelsResponse = Schema.Struct({
  data: Schema.Array(ApiModel),
})
export type ModelsResponse = Schema.Schema.Type<typeof ModelsResponse>

// Decode each model INDEPENDENTLY, not the whole array at once. A single
// malformed entry (e.g. the backend ships a new model with `context_limit` as a
// string) must never poison the entire catalog and make every model vanish —
// the bad item is skipped, the rest still show.
const decodeItem = Schema.decodeUnknownOption(ApiModel)

export function cacheFile() {
  return path.join(Global.Path.cache, "openagentic-models.json")
}

export function fromResponse(input: unknown): {
  models: Record<string, Model>
  defaultModelID: string | undefined
} {
  // Leniently pull the `data` array; a malformed envelope yields no models
  // (the caller treats an empty result as a failure and serves the disk cache).
  const rows =
    input && typeof input === "object" && Array.isArray((input as { data?: unknown }).data)
      ? (input as { data: unknown[] }).data
      : []
  const data: ApiModel[] = []
  for (const raw of rows) {
    const decoded = decodeItem(raw)
    if (Option.isSome(decoded)) data.push(decoded.value)
  }
  const defaultModelID = (data.find((item) => item.default === true) ?? data[0])?.id
  const models: Record<string, Model> = {}
  for (const item of data) {
    const model: Model = {
      id: ModelV2.ID.make(item.id),
      providerID: ProviderV2.ID.make(PROVIDER_ID),
      name: item.name ?? item.id,
      family: item.provider ?? "",
      api: {
        id: item.id,
        url: apiBase(),
        npm: "@ai-sdk/openai-compatible",
      },
      status: "active",
      headers: {},
      options: item.id === defaultModelID ? { default: true } : {},
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: {
        context: item.context_limit ?? DEFAULT_CONTEXT_LIMIT,
        output: DEFAULT_OUTPUT_LIMIT,
      },
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolcall: true,
        input: { text: true, audio: false, image: true, video: false, pdf: true },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: false,
      },
      release_date: "",
      variants: {},
    }
    model.variants = ProviderTransform.variants(model)
    models[item.id] = model
  }
  return { models, defaultModelID }
}

export async function fetchModels(input: {
  apiKey?: string
  baseURL?: string
  cache?: string
}): Promise<{ models: Record<string, Model>; defaultModelID: string | undefined }> {
  const base = (input.baseURL ?? apiBase()).replace(/\/+$/, "")
  const file = input.cache ?? cacheFile()
  try {
    const res = await fetch(`${base}/models`, {
      headers: {
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`GET ${base}/models failed: ${res.status}`)
    const json = await res.json()
    const result = fromResponse(json)
    // A 200 that decodes to zero models is treated as a failure so a stale
    // disk cache still serves — never let a bad response wipe the model list.
    if (Object.keys(result.models).length === 0) throw new Error(`GET ${base}/models returned no models`)
    await mkdir(path.dirname(file), { recursive: true }).catch(() => {})
    await writeFile(file, JSON.stringify(json)).catch(() => {})
    return result
  } catch {
    const cached = await readFile(file, "utf8")
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => undefined)
    if (cached === undefined) return { models: {}, defaultModelID: undefined }
    return fromResponse(cached)
  }
}

export * as OpenagenticModels from "./openagentic-models"
