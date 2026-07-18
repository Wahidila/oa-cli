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
