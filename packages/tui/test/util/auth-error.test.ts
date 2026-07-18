import { expect, test } from "bun:test"
import { isAuthFailure } from "../../src/util/auth-error"

test("detects ProviderAuthError", () => {
  expect(
    isAuthFailure({ name: "ProviderAuthError", data: { providerID: "openagentic", message: "unauthorized" } }),
  ).toBe(true)
})

test("detects APIError with statusCode 401", () => {
  expect(isAuthFailure({ name: "APIError", data: { message: "Unauthorized", statusCode: 401, isRetryable: false } })).toBe(
    true,
  )
})

test("detects APIError with invalid_key in response body", () => {
  expect(
    isAuthFailure({
      name: "APIError",
      data: { message: "Bad key", isRetryable: false, responseBody: '{"error":"invalid_key"}' },
    }),
  ).toBe(true)
})

test("ignores non-auth errors and junk input", () => {
  expect(isAuthFailure({ name: "APIError", data: { message: "slow down", statusCode: 429, isRetryable: true } })).toBe(false)
  expect(isAuthFailure({ name: "MessageOutputLengthError", data: {} })).toBe(false)
  expect(isAuthFailure(undefined)).toBe(false)
  expect(isAuthFailure("boom")).toBe(false)
  expect(isAuthFailure({ name: "APIError" })).toBe(false)
})
