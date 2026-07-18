// Structured error contract for the openagentic.id backend (spec §7-8). The
// mock server (test/fixtures/openagentic-mock.ts) is the contract for the
// real backend: `{ error: { code, message, model?, required_plan?,
// retry_after? } }` paired with the matching HTTP status. This module turns
// that wire envelope into a typed Info and a friendly, actionable message —
// so the CLI never has to show a raw JSON blob to the user.
import { isRecord } from "@/util/record"

export type Info =
  | { code: "invalid_key" }
  | { code: "plan_required"; model?: string; required_plan?: string }
  | { code: "quota_exceeded"; retry_after?: number }
  | { code: "rate_limited"; retry_after?: number }

const STATUS_FOR_CODE: Record<Info["code"], number> = {
  invalid_key: 401,
  plan_required: 403,
  quota_exceeded: 429,
  rate_limited: 429,
}

function isInfoCode(value: unknown): value is Info["code"] {
  return typeof value === "string" && value in STATUS_FOR_CODE
}

export function parse(status: number, body: unknown): Info | undefined {
  if (!isRecord(body)) return undefined
  const envelope = body["error"]
  if (!isRecord(envelope)) return undefined

  const code = envelope["code"]
  if (!isInfoCode(code)) return undefined
  if (STATUS_FOR_CODE[code] !== status) return undefined

  switch (code) {
    case "invalid_key":
      return { code }
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
    default:
      return undefined
  }
}

function formatRetryAfter(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} jam`
  if (seconds >= 60 && seconds % 60 === 0) return `${Math.round(seconds / 60)} menit`
  return `${seconds} detik`
}

export function message(info: Info): string {
  switch (info.code) {
    case "invalid_key":
      return "API key kamu tidak valid atau sudah dicabut. Silakan login ulang untuk melanjutkan."
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
    default: {
      const unreachable: never = info
      throw new Error(`Unhandled OpenagenticError.Info code: ${JSON.stringify(unreachable)}`)
    }
  }
}

export * as OpenagenticError from "./openagentic-error"
