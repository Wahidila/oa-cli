import { expect, test } from "bun:test"
import { Provider } from "@/provider/provider"

test("defaultModelIDs prefers the model flagged default via options", () => {
  const providers = {
    openagentic: {
      models: {
        "zzz-model": { id: "zzz-model", options: {} },
        "aaa-model": { id: "aaa-model", options: { default: true } },
      },
    },
  }
  expect(Provider.defaultModelIDs(providers)).toEqual({ openagentic: "aaa-model" })
})

test("defaultModelIDs falls back to sort order without a flag", () => {
  const providers = {
    openagentic: {
      models: {
        "aaa-model": { id: "aaa-model", options: {} },
        "zzz-model": { id: "zzz-model", options: {} },
      },
    },
  }
  expect(Provider.defaultModelIDs(providers)).toEqual({ openagentic: "zzz-model" })
})

test("defaultModelIDs skips a provider with no models (fresh install, before discovery)", () => {
  // openagentic's locked catalog entry is `models: {}` until login/discovery.
  // The endpoint must not crash on the empty list.
  const providers = {
    openagentic: { models: {} as Record<string, { id: string; options?: Record<string, unknown> }> },
  }
  expect(Provider.defaultModelIDs(providers)).toEqual({})
})

test("defaultModelIDs includes providers with models and skips empty ones together", () => {
  const providers = {
    openagentic: { models: {} as Record<string, { id: string; options?: Record<string, unknown> }> },
    other: { models: { "m1": { id: "m1", options: { default: true } } } },
  }
  expect(Provider.defaultModelIDs(providers)).toEqual({ other: "m1" })
})
