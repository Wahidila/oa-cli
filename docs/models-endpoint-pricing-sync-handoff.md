# Handoff — `/api/v1/models` is out of sync with the pricing catalog (VPS backend)

> **For the openagentic.id backend operator (Hermes).** OA-cli's model picker shows **exactly** what `GET /api/v1/models` returns — nothing more, nothing less (no client-side filtering, no plan-gating, no static catalog). Users report that models which are **live and active on the pricing page are missing from OA-cli**. Confirmed root cause: those models are **not returned by `/api/v1/models`**. This is a backend data/registration gap, not a CLI bug.

## Evidence (captured 2026-07-20)

Queried `GET https://openagentic.id/api/v1/models` with an **`all-akses-admin`** key (full access, so plan-gating is ruled out):

- **HTTP 200**, envelope `{ "data": [ … ] }`, **38 models**.
- **No DeepSeek model of any kind** in the response.
- **No `gpt-5.5-codex`** in the response.

Meanwhile the **public pricing page** (`https://openagentic.id/pricing`) advertises these as active/available:

| Model (pricing page) | In `/api/v1/models`? |
|---|---|
| **DeepSeek V4 Pro** (dedicated plan, Rp 9.900/day) | ❌ missing |
| **DeepSeek V4 Flash** (free with several plans) | ❌ missing |
| **GPT 5.5 Codex** | ❌ missing (endpoint has `gpt-5.3-codex-review`, `gpt-5.2`, `gpt-5.4`, `gpt-5.6-terra`) |
| Claude Sonnet 4.5 / 4.6, Opus 4.6 / 4.7 / 4.8 | ✅ present |
| Gemini 3.1 Pro / 3.5 Flash, Grok 4.5, GLM-5 / 5.2, Qwen 3.6 Plus / 3.7 Max, MiMo V2.5 Pro, Kimi K2.7 Code | ✅ present |

So the pricing catalog and the API models list have **drifted apart**. Any model that is purchasable/active on pricing but absent from `/api/v1/models` is invisible in OA-cli (and in any other client of that endpoint).

## What OA-cli does with the response (so you know the contract)

For **every** item in `data[]`, OA-cli creates a selectable model. It reads these fields (all optional except `id`):

```jsonc
{
  "id": "deepseek-v4-flash",     // REQUIRED, string — the id sent as `model` to /chat/completions
  "name": "DeepSeek V4 Flash",   // shown in the picker (falls back to id)
  "provider": "deepseek",        // shown as the family/group label (falls back to "")
  "context_limit": 128000,       // number, or null, or omit — defaults to 128000
  "default": false               // exactly one model in the list may be true
}
```

OA-cli does **not** filter by plan, capability, status, or any allow-list — it shows all of them. Access enforcement stays where it belongs: server-side at `/chat/completions` (a `403 plan_required` / `429 quota_exceeded` when a specific user can't use a specific model). That means it is safe and correct to return **every active model** from `/api/v1/models` regardless of the caller's plan — the pricing page already shows them to everyone anyway.

## The fix

Make `/api/v1/models` return **exactly the set of models that are active/purchasable on the pricing catalog** (i.e. the same source of truth the pricing page renders from). Concretely:

1. **Find the source of truth.** The pricing page clearly reads from a catalog/table that includes DeepSeek V4 Pro/Flash and GPT 5.5 Codex. `/api/v1/models` is reading from a *different* (or filtered) source. Point them at the same source, or add the missing rows to whatever `/api/v1/models` reads.
2. **Register the missing models** with a stable `id` (the exact string `/chat/completions` accepts as `model`), a display `name`, a `provider` label, and a `context_limit`. At minimum: `deepseek-v4-pro`, `deepseek-v4-flash`, `gpt-5.5-codex` (use whatever ids your chat endpoint actually routes).
3. **Guarantee round-trip consistency:** every `id` returned by `/api/v1/models` MUST be routable by `POST /api/v1/chat/completions`, and every model chargeable on the pricing page MUST appear in `/api/v1/models`. These three lists (pricing ↔ models API ↔ chat routing) should be generated from one catalog, not maintained separately.
4. **Do not plan-filter the models list.** Return all active models to every authenticated user; enforce plan/quota at chat time. (If you deliberately want to hide premium models from lower plans in the list, tell us and we'll add greyed-out/locked rendering — but the current pricing page shows them to everyone, so hiding them in the CLI would be inconsistent.)

## Verify (after the fix)

```bash
# Use any valid key. Expect DeepSeek + GPT 5.5 Codex to appear.
curl -fsSL -H "Authorization: Bearer <API_KEY>" https://openagentic.id/api/v1/models \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(len(d),'models'); print([m['id'] for m in d if 'deepseek' in m['id'].lower() or 'codex' in m['id'].lower()])"

# Then confirm each new id actually routes:
curl -fsS -H "Authorization: Bearer <API_KEY>" -H "content-type: application/json" \
  -d '{"model":"deepseek-v4-flash","messages":[{"role":"user","content":"ping"}],"stream":false}' \
  https://openagentic.id/api/v1/chat/completions
```

Once `/api/v1/models` lists them, they appear in OA-cli automatically (the CLI refetches on launch and caches the result). Users already on a build will see them next launch, or after `oa-cli` re-authenticates — no CLI release required.

---

*Canonical models-endpoint contract: [`openagentic-backend-plan.md`](./openagentic-backend-plan.md) §5. This handoff is the concrete "catalog drift" instance of that contract.*
