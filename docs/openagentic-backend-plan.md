# OpenAgentic.id Backend — Implementation Plan for OA-cli Integration

> **Audience:** an engineer/agent building on the **openagentic.id backend** (Hermes VPS). You have **zero context** on the CLI; this document is self-contained. It specifies exactly what the backend must expose so the **OA-cli** terminal client can log in and use openagentic.id.
>
> **This is a spec for the BACKEND, not the CLI.** The CLI is already built. Your job is to add 2 new endpoints + 1 small adjustment so the CLI works against production. The **authoritative wire contract** is a mock server that the CLI is already tested against — every shape below is copied from it verbatim.

---

## 1. Context

**OA-cli** is a terminal-based AI coding agent (a fork of `opencode`) that is locked to openagentic.id as its only model provider. On first run it forces the user to **log in with their openagentic.id account** (Google OAuth), obtains an **API key**, stores it locally, and then routes all model traffic through openagentic.id's existing OpenAI-compatible `/api/v1` endpoints.

**What already exists on openagentic.id (assumed — adapt to reality):**
- Google OAuth sign-in for the web dashboard.
- An **API key system**: keys can be generated, labeled, listed, and revoked from the user dashboard.
- An **OpenAI-compatible API** at `https://openagentic.id/api/v1` (`/chat/completions`, etc.) that authenticates with `Authorization: Bearer <api_key>` and enforces plan/quota server-side.

**What you must ADD for OA-cli:**
1. `GET /auth/cli` — a browser page that logs the user in (Google) and hands an authorization code back to the CLI's local loopback server. *(new)*
2. `POST /api/v1/cli/token` — exchanges that code for a **labeled API key**. *(new)*
3. `GET /api/v1/models` — return the active model list in the exact envelope below. *(adjust if needed)*
4. Ensure all `/api/v1/*` errors use the **structured error envelope** in §6. *(adjust if needed)*

**Non-negotiable:** the CLI is a **public client** (installed on user machines, no client secret). Auth therefore uses **OAuth 2.0 for native apps (RFC 8252)**: a **loopback redirect** to `http://127.0.0.1:<random-port>` plus **PKCE (RFC 7636, S256)**. Do not require a client secret.

---

## 2. The login flow (end to end)

```
CLI (user's terminal)                     openagentic.id backend
─────────────────────                     ──────────────────────
1. generate PKCE:
   verifier (43-128 chars, unreserved)
   challenge = BASE64URL(SHA256(verifier))   (no padding)
   state = random (CSRF)
2. start loopback HTTP server on
   http://127.0.0.1:<PORT>/callback
3. open browser to:
   GET /auth/cli?redirect_uri=http://127.0.0.1:<PORT>/callback
                &state=<state>&code_challenge=<challenge>
                &code_challenge_method=S256
                                              4. validate redirect_uri is loopback;
                                                 remember code_challenge.
                                              5. run Google login (existing).
                                              6. mint single-use auth code (TTL 5 min),
                                                 bind it to code_challenge + the
                                                 logged-in user.
                                              7. 302 redirect to:
                                                 {redirect_uri}?code=<code>&state=<state>
                                                 (echo state back unchanged)
8. loopback server receives code;
   verifies state matches (1).
9. POST /api/v1/cli/token
   { code, code_verifier }
                                              10. look up code; verify not expired/used;
                                                  verify SHA256(code_verifier)==challenge.
                                                  Consume the code (single use).
                                                  Issue a LABELED api key for the user.
                                              11. 200 { api_key, user: {email,name,plan} }
12. store api_key locally (chmod 0600).
    show "logged in as {email} (plan)".
13. all model calls now:
    POST /api/v1/chat/completions
    Authorization: Bearer <api_key>
```

**Key security properties you must enforce (server side):**
- `redirect_uri` **must** be `http://127.0.0.1` (or `http://localhost`) — reject any other host/scheme. This is what makes a public client safe.
- The auth `code` is **single-use** and **short-lived** (5 min). Consume it on first successful exchange.
- PKCE: store `code_challenge` at authorize time; at token time require `code_verifier` and check `BASE64URL(SHA256(code_verifier)) === code_challenge`. No verifier match → reject.
- Echo `state` back **unchanged** (the CLI validates it to prevent CSRF).
- The issued key is a **normal openagentic.id API key** (same plan/quota enforcement as dashboard keys), labeled so the user can see/revoke it (e.g. `OA-cli — <hostname>`). Revoking it from the dashboard must immediately cause `401 invalid_key` on subsequent calls (this is how the CLI "force-logs-out" a revoked session).

---

## 3. Endpoint — `GET /auth/cli`

Browser-facing login page for the CLI.

**Query params (all required):**
| param | notes |
|---|---|
| `redirect_uri` | MUST be `http://127.0.0.1:<port>/callback` (loopback only). Reject otherwise. |
| `state` | opaque random string from the CLI; echo back unchanged on redirect. |
| `code_challenge` | BASE64URL(SHA256(verifier)), no padding. |
| `code_challenge_method` | `S256`. (You may accept/ignore this param but should require S256 semantics.) |

**Behavior:**
1. If `redirect_uri` / `state` / `code_challenge` missing → `400` with error envelope `{ "error": { "code": "invalid_request", "message": "redirect_uri, state and code_challenge are required" } }`.
2. If `redirect_uri` is not `http://127.0.0.1` (or `http://localhost`) → `400` `{ "error": { "code": "invalid_request", "message": "redirect_uri must be http://127.0.0.1" } }`.
3. Run the existing Google login (redirect to Google, handle callback) — or, if the user already has a live web session, reuse it. Associate the eventual code with the authenticated openagentic.id user.
4. Mint a single-use authorization `code` (random, ≥128 bits), TTL **5 minutes**, bound to `{ code_challenge, user_id }`.
5. `302` redirect to `{redirect_uri}?code=<code>&state=<state>` (state unchanged).
6. **Recommended UX:** after the redirect fires, the loopback page (served by the CLI) shows "Berhasil — kembali ke terminal". You can also render a minimal success page on your side before/around the redirect, but the redirect itself is what the CLI needs.

**Reference (mock authorize handler):**
```js
// validate params + loopback, then:
const code = randomHex(16)
store.set(code, { challenge, userId, exp: now + 5*60 })   // single-use, 5-min TTL
return redirect(`${redirect_uri}?code=${code}&state=${state}`, 302)
```

---

## 4. Endpoint — `POST /api/v1/cli/token`

Exchange the authorization code for a labeled API key.

**Request:** `Content-Type: application/json`
```json
{ "code": "<code from the redirect>", "code_verifier": "<the PKCE verifier>" }
```

**Success `200`:**
```json
{
  "api_key": "<a real, labeled openagentic.id API key>",
  "user": { "email": "user@example.com", "name": "User Name", "plan": "free" }
}
```
- `api_key` — a working key the CLI will send as `Authorization: Bearer <api_key>` to `/api/v1/*`. Label it (e.g. `OA-cli — <hostname>` if you capture hostname; otherwise `OA-cli`) so it shows up revocable in the dashboard.
- `user.plan` — the user's current plan slug (e.g. `free`, `pro`). Shown in the CLI ("logged in as … (plan: free)").

**Failure `400` (code expired / already used / PKCE mismatch / missing fields):**
```json
{ "error": { "code": "invalid_grant", "message": "code expired, already used, or PKCE verification failed" } }
```
The CLI treats any non-200 here as a login failure and shows a friendly message. Use the structured error envelope (§6).

**Server checks (all must pass):**
1. `code` present and found in store.
2. code not expired, not already consumed.
3. `code_verifier` present and `BASE64URL(SHA256(code_verifier)) === stored code_challenge`.
4. On success: **delete the code** (single use), issue the labeled key, return `{ api_key, user }`.

**Reference (mock token handler):**
```js
const { code, code_verifier } = body
const challenge = code ? store.get(code)?.challenge : undefined
if (!code || !code_verifier || !challenge || sha256b64url(code_verifier) !== challenge)
  return json(400, { error: { code: "invalid_grant", message: "code expired, already used, or PKCE verification failed" } })
store.delete(code)                       // single use
const apiKey = issueLabeledKey(userId, "OA-cli")
return json(200, { api_key: apiKey, user: { email, name, plan } })
```

---

## 5. Endpoint — `GET /api/v1/models`

Return the list of **all active models** the platform offers. The CLI shows this list to the user for model selection; access enforcement stays server-side (see below).

**Auth:** `Authorization: Bearer <api_key>` (the key from §4). Missing/invalid → `401 invalid_key` (§6).

**Success `200` — exact envelope (OpenAI-compatible `data` array):**
```json
{
  "data": [
    { "id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5", "provider": "anthropic", "context_limit": 200000, "default": true },
    { "id": "gpt-5",             "name": "GPT-5",             "provider": "openai",    "context_limit": 400000, "default": false },
    { "id": "gemini-2.5-pro",    "name": "Gemini 2.5 Pro",    "provider": "google",    "context_limit": 1048576, "default": false }
  ]
}
```

**Per-model fields:**
| field | required | meaning |
|---|---|---|
| `id` | yes | model id used in `/chat/completions` `model` field and in the CLI picker |
| `name` | no (falls back to `id`) | human-readable display name |
| `provider` | no | origin provider label (anthropic/openai/google/…) — shown for grouping |
| `context_limit` | no | context window size (tokens) |
| `default` | no | **exactly one** model should be `true` — the CLI defaults to it when the user has no saved preference. You control the default from the server without shipping a new CLI. |

**Design decision (already settled with the product owner):** return **ALL active models to every user regardless of plan**. Do **not** filter the list by plan here. Access control (premium models, quota, rate limits) is enforced **server-side at inference time** on `/api/v1/chat/completions` via the structured error envelope (§6). The CLI just shows the full list and translates a `403 plan_required` into "upgrade your plan".

---

## 6. Structured error envelope (all `/api/v1/*` errors)

Every error response the CLI consumes must use this JSON shape so the CLI can show friendly messages:

```json
{ "error": { "code": "<code>", "message": "<human message>", "model": "<opt>", "required_plan": "<opt>", "retry_after": <opt number seconds> } }
```

**Codes the CLI understands (status → code):**

| HTTP | `code` | extra fields | when | CLI behavior |
|---|---|---|---|---|
| `401` | `invalid_key` | — | key missing/invalid/**revoked** | CLI logs the user out and shows the login screen again ("Sesi berakhir — silakan login ulang") |
| `403` | `plan_required` | `model`, `required_plan` | user's plan can't use this model | CLI: "Model {model} butuh plan {required_plan} — upgrade di openagentic.id/pricing" (chat doesn't crash; user picks another model) |
| `429` | `quota_exceeded` | `retry_after` (sec) | daily/plan quota hit | CLI: message + reset time + pricing link |
| `429` | `rate_limited` | `retry_after` (sec) | too many requests too fast | CLI: message + retry-after |
| `400` | `invalid_grant` | — | token exchange failed (§4) | CLI: friendly login-failed message |
| `400` | `invalid_request` | — | bad `/auth/cli` params (§3) | — |

**Exact examples (copied from the CLI's test mock — match these shapes):**
```json
// 401
{ "error": { "code": "invalid_key", "message": "API key is invalid or has been revoked" } }
// 403
{ "error": { "code": "plan_required", "message": "Model gpt-5 requires the pro plan", "model": "gpt-5", "required_plan": "pro" } }
// 429 quota
{ "error": { "code": "quota_exceeded", "message": "Daily quota exceeded", "retry_after": 3600 } }
// 429 rate
{ "error": { "code": "rate_limited", "message": "Too many requests", "retry_after": 30 } }
```

These same errors apply to `/api/v1/chat/completions` (the existing endpoint) — make sure it emits this envelope, not a bare string, on 401/403/429.

---

## 7. `/api/v1/chat/completions` (existing — no new endpoint, just confirm)

The CLI sends standard **OpenAI-compatible streaming** chat-completion requests (`Authorization: Bearer <api_key>`, `model` = an id from §5, SSE stream back). This already exists on openagentic.id. Two things to confirm:
1. It accepts the labeled keys minted in §4 (they're normal API keys).
2. Its 401/403/429 errors use the envelope in §6.

No implementation work beyond confirming these.

---

## 8. Acceptance criteria (how to know it's done)

The CLI is already tested against a **mock** implementing exactly this contract. To validate the real backend, reproduce the mock's behavior:

1. **Authorize:** `GET /auth/cli?redirect_uri=http://127.0.0.1:12345/callback&state=abc&code_challenge=<S256>&code_challenge_method=S256` with a logged-in user → `302` to `http://127.0.0.1:12345/callback?code=<code>&state=abc`. Wrong-host `redirect_uri` → `400 invalid_request`.
2. **Token (happy):** `POST /api/v1/cli/token {code, code_verifier}` with matching PKCE → `200 { api_key, user:{email,name,plan} }`. The `api_key` appears in the user's dashboard, labeled, revocable.
3. **Token (bad):** reused code, expired code, or wrong `code_verifier` → `400 invalid_grant` (envelope).
4. **Models:** `GET /api/v1/models` with the key → `200 { data:[…] }`, exactly one `default:true`. No key → `401 invalid_key`.
5. **Chat:** `POST /api/v1/chat/completions` with the key streams a completion. A premium model on a free plan → `403 plan_required` (envelope with `model`+`required_plan`). Over quota → `429 quota_exceeded` with `retry_after`.
6. **Revoke:** revoke the key in the dashboard → next `/api/v1/*` call returns `401 invalid_key`.

If all 6 pass, OA-cli works end-to-end against production.

> **Reference implementation to mirror:** the CLI repo's mock server —
> `packages/opencode/test/fixtures/openagentic-mock.ts` — is the canonical, executable version of this contract (all four routes + failure modes). Every JSON shape in this document is copied from it. If in doubt, match that file byte-for-byte on the wire.

---

## 9. Implementation notes (framework-agnostic)

- **Reuse existing infra:** Google OAuth (already there), API-key generation/labeling/revocation (already there), the `/api/v1` auth middleware (already there). The only genuinely new logic is the **PKCE code store** (a short-TTL key→{challenge,user} map — Redis or DB row with expiry) and the two thin endpoints around it.
- **Code store:** any store with TTL works (Redis `SETEX code 300 {...}`, or a DB table with an `expires_at` and a `consumed_at`). Delete/mark-consumed on successful exchange.
- **Loopback validation:** parse `redirect_uri`, require `protocol === 'http:'` and `hostname in ('127.0.0.1','localhost')`. Any port is fine (the CLI picks a random free one).
- **PKCE:** `challenge = base64url(sha256(verifier))` with **no `=` padding**; standard library `crypto` in any language does this. RFC 7636 Appendix B test vector: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` (use it as a unit test).
- **Key label:** the CLI does not currently send a device name; label the key `OA-cli` (optionally append a hostname later if you add a field). Whatever appears must be revocable in the dashboard.
- **Install script (separate, optional):** the CLI's `curl -fsSL https://openagentic.id/cli/install | bash` expects `https://openagentic.id/cli/install` to serve an install shell script, and it downloads release binaries named `oa-cli-<os>-<arch>` from a GitHub release. That's the release-pipeline side (out of scope for these 3 endpoints) — noted here only so you know the CLI references that URL.

---

## 10. Summary checklist for the backend

- [ ] `GET /auth/cli` — loopback-validated, PKCE-aware, Google login, 302 back with `code`+`state`, 5-min single-use codes
- [ ] `POST /api/v1/cli/token` — PKCE verify, consume code, issue labeled revocable key, return `{api_key,user}`, `400 invalid_grant` on failure
- [ ] `GET /api/v1/models` — `{ data: [...] }` envelope, all active models, exactly one `default:true`
- [ ] structured error envelope `{ error: { code, message, model?, required_plan?, retry_after? } }` on all `/api/v1/*` 401/403/429
- [ ] `/api/v1/chat/completions` accepts the labeled keys + emits the error envelope
- [ ] dashboard: the CLI-minted key is visible + revocable; revoke → `401 invalid_key`

Match the mock (`openagentic-mock.ts`) on every wire shape and you're done.
