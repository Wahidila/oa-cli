// Detects auth failures in `session.error` payloads so the TUI can re-gate to the
// login screen. Server error contract: 401 -> body contains "invalid_key".
// Shapes come from NamedError.toObject(): { name, data } (packages/core/src/v1/session.ts).
export function isAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const named = error as { name?: unknown; data?: unknown }
  if (named.name === "ProviderAuthError") return true
  if (named.name !== "APIError") return false
  const data = named.data
  if (!data || typeof data !== "object") return false
  const api = data as { statusCode?: unknown; responseBody?: unknown }
  if (api.statusCode === 401) return true
  return typeof api.responseBody === "string" && api.responseBody.includes("invalid_key")
}
