// Friendly messages for openagentic backend 403/429 errors surfaced through
// `session.error` in app.tsx. This mirrors the 403 (plan_required) and 429
// (quota_exceeded/rate_limited) branches of the canonical error contract in
// packages/opencode/src/provider/openagentic-error.ts — packages/tui does not
// depend on packages/opencode (the dependency runs the other way: see
// packages/opencode/src/util/record.ts re-exporting from @opencode-ai/tui), so
// this is a small, scoped copy rather than a shared import. Keep this in sync
// with openagentic-error.ts if the wire contract or copy changes there. The 401
// invalid_key path is intentionally NOT duplicated here — that stays owned by
// ./auth-error.ts, which re-gates to login instead of showing a toast.
import { isRecord } from "./record"

type Info =
  | { code: "plan_required"; model?: string; required_plan?: string }
  | { code: "quota_exceeded"; retry_after?: number }
  | { code: "rate_limited"; retry_after?: number }

const STATUS_FOR_CODE: Record<Info["code"], number> = {
  plan_required: 403,
  quota_exceeded: 429,
  rate_limited: 429,
}

function isInfoCode(value: unknown): value is Info["code"] {
  return typeof value === "string" && value in STATUS_FOR_CODE
}

function parse(status: number, body: unknown): Info | undefined {
  if (!isRecord(body)) return undefined
  const envelope = body["error"]
  if (!isRecord(envelope)) return undefined

  const code = envelope["code"]
  if (!isInfoCode(code)) return undefined
  if (STATUS_FOR_CODE[code] !== status) return undefined

  switch (code) {
    case "plan_required": {
      const model = envelope["model"]
      const requiredPlan = envelope["required_plan"]
      return {
        code,
        ...(typeof model === "string" ? { model } : {}),
        ...(typeof requiredPlan === "string" ? { required_plan: requiredPlan } : {}),
      }
    }
    case "quota_exceeded":
    case "rate_limited": {
      const retryAfter = envelope["retry_after"]
      return {
        code,
        ...(typeof retryAfter === "number" ? { retry_after: retryAfter } : {}),
      }
    }
  }
}

function formatRetryAfter(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} jam`
  if (seconds >= 60 && seconds % 60 === 0) return `${Math.round(seconds / 60)} menit`
  return `${seconds} detik`
}

function message(info: Info): string {
  switch (info.code) {
    case "plan_required": {
      const model = info.model ?? "model ini"
      const plan = info.required_plan ?? "plan yang lebih tinggi"
      return `Model ${model} membutuhkan plan ${plan}. Upgrade paketmu di openagentic.id/pricing.`
    }
    case "quota_exceeded": {
      const reset =
        info.retry_after !== undefined ? ` Kuota akan reset dalam ${formatRetryAfter(info.retry_after)}.` : ""
      return `Kuota harian kamu sudah habis.${reset} Lihat pilihan paket di openagentic.id/pricing.`
    }
    case "rate_limited": {
      const reset = info.retry_after !== undefined ? ` Coba lagi dalam ${formatRetryAfter(info.retry_after)}.` : ""
      return `Terlalu banyak permintaan dalam waktu singkat.${reset} Pertimbangkan upgrade paket di openagentic.id/pricing untuk limit yang lebih tinggi.`
    }
  }
}

/**
 * Returns a friendly Indonesian message for openagentic 403 (plan_required) and
 * 429 (quota_exceeded/rate_limited) `session.error` payloads, or `undefined` if
 * `error` isn't one of those shapes — callers should fall through to a generic
 * error toast in that case. Does not handle 401; see ./auth-error.ts.
 */
export function friendlyProviderError(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const named = error as { name?: unknown; data?: unknown }
  if (named.name !== "APIError") return undefined

  const data = named.data
  if (!isRecord(data)) return undefined
  const statusCode = data["statusCode"]
  const responseBody = data["responseBody"]
  if (statusCode !== 403 && statusCode !== 429) return undefined
  if (typeof responseBody !== "string") return undefined

  let body: unknown
  try {
    body = JSON.parse(responseBody)
  } catch {
    return undefined
  }

  const info = parse(statusCode, body)
  if (!info) return undefined
  return message(info)
}
