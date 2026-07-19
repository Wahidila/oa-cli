# Handoff — Stop `/api/v1/cli/token` from minting a new API key on every login (VPS)

> **For the openagentic.id backend operator (Hermes).** A user reported their dashboard **`/api-keys` page filled up with ~37 "OA-cli" keys** after using OA-cli for a couple of days. Each key is real and revocable, so nothing is leaking — but every `oa-cli` login mints a **brand-new** key and never retires the old one, so they pile up. This document is the fix.

## Root cause

`POST /api/v1/cli/token` issues a fresh API key on **every** exchange. The CLI is correct — one login = exactly one token exchange (verified: single-shot, guarded against double-submit, no retry loop). But there is nothing on the login path that would make a user log in dozens of times… except **normal use**: re-login after `auth logout`, switching machines, testing, a re-gate after a revoked/expired key, or just running the onboarding again. Every one of those is a legitimate new exchange, and today each one leaves a new key behind. Over ~2 days of intensive testing that became 37 keys.

**The CLI cannot fix this** — the CLI has no list-keys or revoke-keys capability, by design (it only ever holds its own single key). The dashboard already accumulated the keys server-side, so the dedup has to happen server-side.

## The two-part fix

### Part 1 — CLI (done, shipping)

The CLI now sends its machine **hostname** as a `device` field on every token exchange, so the backend can tell "this is the same machine logging in again" from "a genuinely different machine":

```jsonc
POST /api/v1/cli/token
{ "code": "...", "code_verifier": "...", "device": "Ronis-MacBook-Pro.local" }
```

- `device` is always present (falls back to `"unknown-device"` if the hostname can't be read).
- Treat it as an **opaque label for dedup only**, never as a security/auth boundary — a client can send any string. It just groups a user's keys by machine.

### Part 2 — Backend (this is the actual fix — please implement)

On `POST /api/v1/cli/token`, **before issuing the new key, revoke the user's existing active CLI key(s) for the same `device`.** Re-login from a machine should **replace** that machine's key, not add another.

Pseudocode (drop into the existing token handler, right after PKCE verification + code consumption):

```js
const { code, code_verifier, device: rawDevice } = body
// ...existing: verify PKCE, ensure code is unconsumed+unexpired, delete/consume the code...

const device = (rawDevice || "unknown-device").slice(0, 128)  // clamp length; opaque label

// Per-device dedup: retire this machine's previous CLI key(s) before issuing a new one.
await revokeKeys({ userId, source: "cli", device })   // no-op on first login from this device

const apiKey = await issueKey({
  userId,
  label: `OA-cli — ${device}`,
  source: "cli",   // <-- tag so dedup + dashboard filtering can find CLI keys
  device,
})

return json(200, { api_key: apiKey, user: { email, name, plan } })
```

**Critical scoping rules:**

1. **Only ever revoke CLI-minted keys.** Tag every key this endpoint issues with a marker (`source: "cli"`, plus `device`). Dedup must filter on that tag. **Never** touch a key the user created by hand in the dashboard — those have nothing to do with the CLI and must survive untouched.
2. **Scope dedup to `{user, device}`**, not just `{user}`. A user with a laptop and a desktop should keep one key per machine (two keys total), not have the desktop's key killed every time they log in on the laptop.
3. **"Revoke" = mark inactive** (the same state the dashboard "Revoke" button produces), so any old key still stored on a machine cleanly returns `401 invalid_key` on its next call and the CLI re-gates to login. Hard-delete vs. soft-revoke is your call; either stops accumulation.

### Optional, recommended — revoke on logout

If you want `oa-cli auth logout` to also retire the key server-side (right now logout only deletes the local `auth.json`), expose a tiny authenticated endpoint the CLI can call on logout, e.g. `POST /api/v1/cli/revoke` with `Authorization: Bearer <that key>` → revoke exactly the calling key. Tell me if you want it and I'll wire the CLI side. Not required to fix the accumulation bug (Part 2 already caps it at one key per device).

## One-time cleanup of the existing keys

Part 2 stops **new** accumulation but does not remove the ~37 keys already there. Clean those up once:

- **Manual:** on the dashboard `/api-keys` page, bulk-select the old `OA-cli` keys and delete/revoke them, keeping at most the most recent one per machine. The CLI on that machine will just re-login and get a fresh single key the next time it's gated. **Do not delete any hand-made (non-CLI) keys.**
- **Scripted (if you have DB access):** revoke all but the newest CLI key per `{user, device}`:
  ```sql
  -- adjust table/column names to your schema; keeps the newest CLI key per (user, device)
  UPDATE api_keys k
     SET status = 'revoked', revoked_at = now()
   WHERE k.source = 'cli'
     AND k.status = 'active'
     AND EXISTS (
       SELECT 1 FROM api_keys n
        WHERE n.user_id = k.user_id
          AND n.source  = 'cli'
          AND coalesce(n.device,'') = coalesce(k.device,'')
          AND n.created_at > k.created_at
     );
  ```
  (If existing keys predate the `device`/`source` columns, they'll have NULLs — either backfill `source='cli'` for anything labeled `OA-cli`, or just do the manual bulk-delete once and let Part 2 keep it clean going forward.)

## Verify

1. Log in with `oa-cli` from a machine → exactly **one** new `OA-cli — <hostname>` key appears.
2. `oa-cli auth logout` then log in **again from the same machine** → still **one** key (the old one is now revoked/replaced, not a second one).
3. Log in from a **different** machine → a **second** key appears (one per device), the first still intact.
4. A hand-made dashboard key is **never** touched by any of the above.
5. An old/revoked key still on a machine → next `/api/v1/*` call returns `401 invalid_key` and the CLI re-gates to the login screen.

Once (2) holds, the dashboard stops filling up.

---

*Canonical contract for this endpoint lives in [`openagentic-backend-plan.md`](./openagentic-backend-plan.md) §4 — it has been updated to include the `device` field and this dedup step.*
