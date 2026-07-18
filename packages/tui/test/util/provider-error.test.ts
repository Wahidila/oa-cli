import { expect, test } from "bun:test"
import { friendlyProviderError } from "../../src/util/provider-error"

test("403 plan_required returns a friendly message with model, plan, and pricing link", () => {
  const message = friendlyProviderError({
    name: "APIError",
    data: {
      message: "Forbidden",
      statusCode: 403,
      isRetryable: false,
      responseBody: JSON.stringify({ error: { code: "plan_required", model: "gpt-5", required_plan: "pro" } }),
    },
  })
  expect(message).toBeDefined()
  expect(message).toContain("gpt-5")
  expect(message).toContain("pro")
  expect(message).toContain("openagentic.id/pricing")
})

test("429 quota_exceeded returns a friendly message with pricing link and reset info", () => {
  const message = friendlyProviderError({
    name: "APIError",
    data: {
      message: "Too Many Requests",
      statusCode: 429,
      isRetryable: true,
      responseBody: JSON.stringify({ error: { code: "quota_exceeded", retry_after: 3600 } }),
    },
  })
  expect(message).toBeDefined()
  expect(message).toContain("openagentic.id/pricing")
  expect(message).toContain("1 jam")
})

test("429 rate_limited returns a friendly message distinct from quota_exceeded", () => {
  const message = friendlyProviderError({
    name: "APIError",
    data: {
      message: "Too Many Requests",
      statusCode: 429,
      isRetryable: true,
      responseBody: JSON.stringify({ error: { code: "rate_limited", retry_after: 30 } }),
    },
  })
  expect(message).toBeDefined()
  expect(message).toContain("openagentic.id/pricing")
  expect(message).toContain("30 detik")
})

test("returns undefined for unrelated 500 errors", () => {
  expect(
    friendlyProviderError({
      name: "APIError",
      data: { message: "Internal Server Error", statusCode: 500, isRetryable: false, responseBody: '{"error":"boom"}' },
    }),
  ).toBeUndefined()
})

test("returns undefined for 401 (handled by isAuthFailure, not this util)", () => {
  expect(
    friendlyProviderError({
      name: "APIError",
      data: {
        message: "Unauthorized",
        statusCode: 401,
        isRetryable: false,
        responseBody: JSON.stringify({ error: { code: "invalid_key" } }),
      },
    }),
  ).toBeUndefined()
})

test("returns undefined for malformed responseBody JSON", () => {
  expect(
    friendlyProviderError({
      name: "APIError",
      data: { message: "Forbidden", statusCode: 403, isRetryable: false, responseBody: "not json" },
    }),
  ).toBeUndefined()
})

test("returns undefined for a mismatched status/code pair", () => {
  expect(
    friendlyProviderError({
      name: "APIError",
      data: {
        message: "Forbidden",
        statusCode: 403,
        isRetryable: false,
        responseBody: JSON.stringify({ error: { code: "rate_limited", retry_after: 30 } }),
      },
    }),
  ).toBeUndefined()
})

test("ignores non-APIError shapes and junk input", () => {
  expect(friendlyProviderError(undefined)).toBeUndefined()
  expect(friendlyProviderError("boom")).toBeUndefined()
  expect(friendlyProviderError({ name: "ProviderAuthError", data: { providerID: "openagentic" } })).toBeUndefined()
  expect(friendlyProviderError({ name: "APIError" })).toBeUndefined()
})
