# OA-cli Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OA-cli Fase 1 — fork opencode yang fungsional: provider terkunci ke openagentic.id, gerbang login Google OAuth (browser + loopback PKCE), rebrand permukaan penuh (`oa-cli`, tema tunggal, logo baru, phone-home diputus), terbukti lewat test integrasi end-to-end terhadap mock server.

**Architecture:** Penguncian dilakukan di hulu — katalog provider tunggal di `ModelsDev` (Area K) membuat seluruh UI/server otomatis hanya mengenal `openagentic`; discovery model live via `GET /api/v1/models` (Area P). Auth adalah modul mandiri `OpenagenticAuth` (Area A) yang dikonsumsi command CLI (Area X) dan layar login TUI (Area L). Branding (Area T) dan rename+pemutusan phone-home (Area R) independen. Mock server (Area M) menjadi kontrak backend dan gerbang bukti akhir.

**Tech Stack:** TypeScript, Bun (runtime + test), Effect, opentui + SolidJS (TUI), `@ai-sdk/openai-compatible`, yargs. Spec: `docs/superpowers/specs/2026-07-18-oa-cli-rebrand-design.md`.

## Global Constraints

Semua task tunduk pada konstanta ini (nilai persis dari spec — JANGAN improvisasi):

- Provider id `openagentic` | display `OpenAgentic` | npm `@ai-sdk/openai-compatible` | env escape hatch `OPENAGENTIC_API_KEY`
- **Resolusi base URL (kontrak test lintas-area):** setiap panggilan keluar ke openagentic.id me-resolve origin **saat call-time** sebagai `process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id"` (origin saja, tanpa trailing slash; path yang ditempel: `/auth/cli`, `/api/v1/cli/token`, `/api/v1/models`, `/api/v1/chat/completions`). Di Area A: `defaultBaseUrl()`; di Area P: `apiBase()`. Jangan pernah simpan hasilnya di konstanta module-level.
- **`GET /api/v1/models` envelope:** `{ "data": [ { id, name?, provider?, context_limit?, default? } ] }` — OpenAI-compatible `data` array. Mock (Area M) dan loader (Area P) sudah selaras dengan bentuk ini; backend wajib mengikuti.
- **Error envelope server:** `{ error: { code, message, model?, required_plan?, retry_after? } }` dengan status/kode: `401 invalid_key`, `403 plan_required`, `429 quota_exceeded`/`rate_limited`.
- **Kepemilikan `packages/opencode/src/auth/openagentic.ts` terbagi dua:** Area A membuat file + `login()`/`logout()`/pkce/loopback/`defaultBaseUrl()`; Task X1 (Area X) menambahkan `isAuthenticated()`/`isAuthenticatedEffect()`/`hasEnvKey()`/`PROVIDER_ID`/`NOT_LOGGED_IN_MESSAGE` ke file yang sama. Kerjakan A dulu, X1 menyusul (atau X1 dulu dengan file baru — keduanya aman; JANGAN dikerjakan paralel).
- **Semantik browser `login()`:** `opts.onUrl(url)` selalu dipanggil bila disediakan (untuk display/fallback URL); peluncuran browser memakai `opts.openBrowser` bila diberikan, selain itu helper `open` bawaan. **Test JANGAN mengandalkan `onUrl` untuk mencegah browser terbuka — selalu berikan `openBrowser` override** (test integrasi M2 mengoper `openBrowser: async (url) => { /* fetch programatik */ }`).
- Tema tunggal `oa-cli` — palet: bg `#0c0a09`, panel `#1c1917`, primary `#f97316`, aksen `#fb923c`/`#ff5600`, teks `#ffffff`, muted `#a8a29e`, error `#ef4444`, success `#10b981`, warning `#f59e0b`, info `#3b82f6`
- Command/binary `oa-cli` | repo rilis `github.com/Wahidila/oa-cli` | install `https://openagentic.id/cli/install`
- String user-facing: tidak boleh ada "opencode"/"OpenCode" tersisa di permukaan yang disentuh; **Fase 1 TIDAK me-rename** path runtime (`~/.config/opencode` dst.), env vars `OPENCODE_*`, nama file config `opencode.json`, atau nama package internal `@opencode-ai/*` — semua itu Fase 2.
- `LICENSE` (MIT, Copyright © 2025 opencode) tidak boleh disentuh; `NOTICE` ditambahkan di Area M.
- Test: `bun test <path>` dari dalam package ybs (mis. `cd packages/core && bun test test/models.test.ts`); typecheck: `bun turbo typecheck` dari root atau `bun run typecheck` per package. Commit: conventional commits (`feat:`, `refactor:`, `chore:`...).
- Rilis CI memakai `gh release upload --repo $GH_REPO` — set `GH_REPO=Wahidila/oa-cli` (catatan ops, bukan perubahan kode).

## Urutan Eksekusi

47 task, 8 area. Kerjakan per area, urut:

| # | Area | Task | Bergantung pada |
|---|---|---|---|
| 1 | **K** — Katalog provider tunggal (models-dev) | K1–K5 | — |
| 2 | **A** — Modul auth `OpenagenticAuth` (PKCE + loopback) | A1–A4 | — |
| 3 | **X** — Command auth + gate non-interaktif + bersih-bersih plugin OAuth | X1–X4 | A (X2, X4); X1/X3 bebas |
| 4 | **P** — Provider loader openagentic + trim SDK | P1–P7 | K |
| 5 | **L** — Layar login TUI + re-gate 401 | L1–L6 | A, X1 |
| 6 | **T** — Tema tunggal oa-cli + logo + title | T1–T7 | — |
| 7 | **R** — Rename `oa-cli` + putus phone-home + strings | R1–R8 | X (R7 menyentuh providers.ts SETELAH rewrite X2 — bila baris yang dituju sudah hilang, lewati edit itu) |
| 8 | **M** — Mock server + test integrasi e2e + README/NOTICE | M1–M6 | Semua di atas |

## Keputusan Default v1

Diputuskan saat perakitan plan (bisa dioverride user sebelum eksekusi):

1. **Copy campuran** — string yang dimandatkan spec (layar login, pesan gate, halaman callback) berbahasa Indonesia; sisa help CLI tetap English. Lokalisasi penuh menyusul.
2. **Biaya model tampil 0** — billing/kuota ditegakkan server; readout biaya di TUI menampilkan nol untuk v1.
3. **`oa-cli run --attach <url>`** dikecualikan dari gate login (server remote yang punya kredensial).
4. **Mode `--mini`** kena gate berupa pesan error tercetak (bukan layar login TUI).
5. **Badge exit `[O]`** di splash mini-UI dipertahankan ("O" tetap terbaca OA).
6. **`packages/opencode` package name tetap `"opencode"`** di package.json (packages/web bergantung via `workspace:*`); nama artefak build sudah `oa-cli` via build.ts. Rename menyusul di Fase 2 saat pruning.
7. Loader `custom()` yang mati (azure, snowflake, dsb. tanpa import package) dibiarkan di Fase 1 untuk meminimalkan diff — tidak pernah berjalan karena katalog terkunci; dihapus di Fase 2.

## Di Luar Plan Ini

- **Fase 2** (rename path/env/config/package internal + pruning monorepo: desktop, web, console, slack, stats, github, lildax) — plan terpisah setelah Fase 1 stabil.
- **Backend openagentic.id** (implementasi nyata `GET /auth/cli`, `POST /api/v1/cli/token`, penyesuaian `/api/v1/models`) — codebase terpisah; mock Area M adalah kontraknya.
- Rilis binary pertama + setup CI release — setelah Fase 1 hijau.

---

## Area K — Katalog provider tunggal (models-dev)

Goal: the model catalog is hardcoded to exactly one provider `openagentic` (api `https://openagentic.id/api/v1`, npm `@ai-sdk/openai-compatible`, env `OPENAGENTIC_API_KEY`, `models: {}` — live model discovery is handled by the provider-discovery area). All network traffic to models.dev (runtime fetch, background hourly refresh, build-time snapshot) is removed. `Flag.OPENCODE_MODELS_PATH` is deliberately kept as a test-only file override because both test preloads (`packages/core/test/preload.ts`, `packages/opencode/test/preload.ts`) pin it to multi-provider fixtures that the rest of the regression suite depends on (spec §9 item 4, "Regresi").

### Task K1: Hardcode the single-provider catalog in the ModelsDev service

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/core/test/models.test.ts` (full rewrite — current file tests fetch/cache/TTL behavior that is being deleted)
- Modify: `/Users/mac/Project/oa-cli/packages/core/src/models-dev.ts` (full rewrite of the service layer; Schema definitions kept verbatim)
- Test: `/Users/mac/Project/oa-cli/packages/core/test/models.test.ts`

**Interfaces:**
- Consumes: `FSUtil.Service` (`packages/core/src/fs-util.ts:36`, `readJson(path: string): Effect.Effect<unknown, Error>`), `Flag.OPENCODE_MODELS_PATH` (`packages/core/src/flag/flag.ts:46`), `makeGlobalNode` (`packages/core/src/effect/app-node.ts:11`)
- Produces (unchanged service contract — all existing consumers keep compiling: `packages/core/src/plugin/models-dev.ts`, `packages/opencode/src/provider/provider.ts`, httpapi handlers, `cli/cmd/models.ts`, `cli/cmd/providers.ts`):
  ```ts
  export interface Interface {
    readonly get: () => Effect.Effect<Record<string, Provider>>
    readonly refresh: (force?: boolean) => Effect.Effect<void> // now a no-op
  }
  export class Service extends Context.Service<Service, Interface>()("@opencode/ModelsDev") {}
  export const CATALOG: Record<string, Provider> // NEW export — the locked catalog
  export const node // GlobalNode for Service; deps shrink to [FSUtil.node]
  ```

- [ ] **Step 1: Replace the test file with the locked-catalog contract (red)**

  Overwrite `/Users/mac/Project/oa-cli/packages/core/test/models.test.ts` with exactly:

  ```ts
  import { describe, expect, beforeAll, afterAll } from "bun:test"
  import { Effect, Layer } from "effect"
  import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
  import { Flag } from "@opencode-ai/core/flag/flag"
  import { ModelsDev } from "@opencode-ai/core/models-dev"
  import { it } from "./lib/effect"
  import { readFile } from "fs/promises"
  import path from "path"

  // test/preload.ts pins OPENCODE_MODELS_PATH to a multi-provider fixture so
  // other suites can resolve providers. These tests exercise the locked
  // catalog itself, so clear the override for this suite and restore after.
  const ORIGINAL_MODELS_PATH = Flag.OPENCODE_MODELS_PATH
  beforeAll(() => {
    Flag.OPENCODE_MODELS_PATH = undefined
  })
  afterAll(() => {
    Flag.OPENCODE_MODELS_PATH = ORIGINAL_MODELS_PATH
  })

  // Layer.fresh is required because the ModelsDev implementation is a
  // module-level Layer constant and Effect.provide memoizes layers in a
  // process-global MemoMap — without fresh, every test would share the first
  // build's cached catalog.
  const provided = <A, E>(eff: Effect.Effect<A, E, ModelsDev.Service>) =>
    eff.pipe(Effect.provide(Layer.fresh(AppNodeBuilder.build(ModelsDev.node))))

  describe("ModelsDev locked catalog", () => {
    it.live("get() returns exactly one provider: openagentic", () =>
      Effect.gen(function* () {
        const result = yield* provided(ModelsDev.Service.use((s) => s.get()))
        expect(Object.keys(result)).toEqual(["openagentic"])
        const provider = result["openagentic"]
        expect(provider.id).toBe("openagentic")
        expect(provider.name).toBe("OpenAgentic")
        expect(provider.api).toBe("https://openagentic.id/api/v1")
        expect(provider.npm).toBe("@ai-sdk/openai-compatible")
        expect(provider.env).toEqual(["OPENAGENTIC_API_KEY"])
        expect(provider.models).toEqual({})
      }),
    )

    it.live("refresh() is a no-op and the catalog stays locked", () =>
      Effect.gen(function* () {
        const result = yield* provided(
          Effect.gen(function* () {
            const svc = yield* ModelsDev.Service
            yield* svc.refresh(true)
            return yield* svc.get()
          }),
        )
        expect(Object.keys(result)).toEqual(["openagentic"])
      }),
    )

    it.live("get() honors the OPENCODE_MODELS_PATH test fixture override", () =>
      Effect.gen(function* () {
        const fixturePath = path.join(import.meta.dir, "plugin", "fixtures", "models-dev.json")
        const expected = JSON.parse(
          yield* Effect.promise(() => readFile(fixturePath, "utf8")),
        ) as Record<string, unknown>
        const result = yield* Effect.acquireUseRelease(
          Effect.sync(() => {
            Flag.OPENCODE_MODELS_PATH = fixturePath
          }),
          () => provided(ModelsDev.Service.use((s) => s.get())),
          () =>
            Effect.sync(() => {
              Flag.OPENCODE_MODELS_PATH = undefined
            }),
        )
        expect(Object.keys(result).sort()).toEqual(Object.keys(expected).sort())
      }),
    )
  })
  ```

  (The fixture `/Users/mac/Project/oa-cli/packages/core/test/plugin/fixtures/models-dev.json` already exists and contains providers `acme` and `local`.)

- [ ] **Step 2: Run the test and confirm it fails**

  ```bash
  cd /Users/mac/Project/oa-cli/packages/core && bun test test/models.test.ts
  ```

  Expected: `2 fail, 1 pass`. The first two tests fail (the current implementation returns `{}`, or a stale models.dev disk cache if one exists — never `["openagentic"]`). The third test PASSES even against the old implementation, because the old code also reads `Flag.OPENCODE_MODELS_PATH` first — it pins the behavior that must survive the rewrite. No network is hit during this run: the test preload sets `OPENCODE_DISABLE_MODELS_FETCH=true`, which the old implementation still honors. Do not proceed if all three tests pass — that means you ran against already-modified source.

- [ ] **Step 3: Rewrite the service (green)**

  Overwrite `/Users/mac/Project/oa-cli/packages/core/src/models-dev.ts` with exactly (the Schema block from `CatalogModelStatus` through `Provider` is the current code, unchanged — only imports and the service layer change; the `USER_AGENT` constant between them is deleted):

  ```ts
  import { Context, Effect, Layer, Schema } from "effect"
  import { ModelsDev } from "@opencode-ai/schema/models-dev"
  import { Flag } from "./flag/flag"
  import { FSUtil } from "./fs-util"
  import { makeGlobalNode } from "./effect/app-node"

  export const CatalogModelStatus = Schema.Literals(["alpha", "beta", "deprecated"])
  export type CatalogModelStatus = typeof CatalogModelStatus.Type

  const CostTier = Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    cache_read: Schema.optional(Schema.Finite),
    cache_write: Schema.optional(Schema.Finite),
    tier: Schema.Struct({
      type: Schema.Literal("context"),
      size: Schema.Finite,
    }),
  })

  const Cost = Schema.Struct({
    input: Schema.Finite,
    output: Schema.Finite,
    cache_read: Schema.optional(Schema.Finite),
    cache_write: Schema.optional(Schema.Finite),
    tiers: Schema.optional(Schema.Array(CostTier)),
    context_over_200k: Schema.optional(
      Schema.Struct({
        input: Schema.Finite,
        output: Schema.Finite,
        cache_read: Schema.optional(Schema.Finite),
        cache_write: Schema.optional(Schema.Finite),
      }),
    ),
  })

  const ReasoningOption = Schema.Union([
    Schema.Struct({
      type: Schema.Literal("effort"),
      values: Schema.Array(Schema.NullOr(Schema.String)),
    }),
    Schema.Struct({
      type: Schema.Literal("toggle"),
    }),
    Schema.Struct({
      type: Schema.Literal("budget_tokens"),
      min: Schema.optional(Schema.Finite),
      max: Schema.optional(Schema.Finite),
    }),
  ])

  export const Model = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    family: Schema.optional(Schema.String),
    release_date: Schema.String,
    attachment: Schema.Boolean,
    reasoning: Schema.Boolean,
    temperature: Schema.Boolean,
    tool_call: Schema.Boolean,
    reasoning_options: Schema.optional(Schema.Array(ReasoningOption)),
    interleaved: Schema.optional(
      Schema.Union([
        Schema.Literal(true),
        Schema.Struct({
          field: Schema.Literals(["reasoning", "reasoning_content", "reasoning_details"]),
        }),
      ]),
    ),
    cost: Schema.optional(Cost),
    limit: Schema.Struct({
      context: Schema.Finite,
      input: Schema.optional(Schema.Finite),
      output: Schema.Finite,
    }),
    modalities: Schema.optional(
      Schema.Struct({
        input: Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"])),
        output: Schema.Array(Schema.Literals(["text", "audio", "image", "video", "pdf"])),
      }),
    ),
    experimental: Schema.optional(
      Schema.Struct({
        modes: Schema.optional(
          Schema.Record(
            Schema.String,
            Schema.Struct({
              cost: Schema.optional(Cost),
              provider: Schema.optional(
                Schema.Struct({
                  body: Schema.optional(Schema.Record(Schema.String, Schema.MutableJson)),
                  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
                }),
              ),
            }),
          ),
        ),
      }),
    ),
    status: Schema.optional(CatalogModelStatus),
    provider: Schema.optional(
      Schema.Struct({ npm: Schema.optional(Schema.String), api: Schema.optional(Schema.String) }),
    ),
  })
  export type Model = Schema.Schema.Type<typeof Model>

  export const Provider = Schema.Struct({
    api: Schema.optional(Schema.String),
    name: Schema.String,
    env: Schema.Array(Schema.String),
    id: Schema.String,
    npm: Schema.optional(Schema.String),
    models: Schema.Record(Schema.String, Model),
  })

  export type Provider = Schema.Schema.Type<typeof Provider>

  export const Event = ModelsDev.Event

  /**
   * The locked provider catalog. OA-cli talks to exactly one provider —
   * openagentic. Models are intentionally empty here: the model list comes
   * from live discovery against https://openagentic.id/api/v1/models with the
   * user's API key, not from a static catalog.
   */
  export const CATALOG: Record<string, Provider> = {
    openagentic: {
      id: "openagentic",
      name: "OpenAgentic",
      api: "https://openagentic.id/api/v1",
      npm: "@ai-sdk/openai-compatible",
      env: ["OPENAGENTIC_API_KEY"],
      models: {},
    },
  }

  export interface Interface {
    readonly get: () => Effect.Effect<Record<string, Provider>>
    readonly refresh: (force?: boolean) => Effect.Effect<void>
  }

  export class Service extends Context.Service<Service, Interface>()("@opencode/ModelsDev") {}

  const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service

      // Flag.OPENCODE_MODELS_PATH is a test/dev-only escape hatch: the test
      // preloads point it at a fixture file so suites can exercise arbitrary
      // catalogs without the network. When unset (all production runs), the
      // catalog is the hardcoded single-provider CATALOG above. There is no
      // network fetch, no background refresh, and no on-disk cache.
      const populate = Effect.gen(function* () {
        const override = Flag.OPENCODE_MODELS_PATH
        if (override) {
          const fromDisk = yield* fs.readJson(override).pipe(
            Effect.map((v) => v as Record<string, Provider> | undefined),
            Effect.catch(() => Effect.succeed(undefined)),
          )
          if (fromDisk) return fromDisk
        }
        return CATALOG
      })

      const cachedGet = yield* Effect.cached(populate)

      return Service.of({
        get: () => cachedGet,
        // The catalog is a compile-time constant; refresh is kept as a no-op
        // so existing call sites (cli/cmd/providers.ts:357, cli/cmd/models.ts)
        // keep compiling until their surfaces are reworked/removed.
        refresh: () => Effect.void,
      })
    }),
  )

  export const node = makeGlobalNode({ service: Service, layer: layer, deps: [FSUtil.node] })

  export * as ModelsDev from "./models-dev"
  ```

  What this deletes relative to the current file: the models.dev HTTP fetch (`fetchApi`, old lines 169-176), retry/backoff client (144-152), `USER_AGENT` + its `InstallationChannel`/`InstallationVersion` import (10, 18), on-disk cache + TTL + `Flock` cross-process locking (155-167, 196-225), the hourly background refresh fork (249-252), the `Event.Refreshed` publish (241), and the `declare const OPENCODE_MODELS_DEV` compile snapshot (130, 192-194). Deps on `EventV2.node` and `httpClient` drop from `node`. The `Event` re-export stays because `packages/core/src/plugin/models-dev.ts:178` subscribes to `ModelsDev.Event.Refreshed` (the subscription simply never fires now).

- [ ] **Step 4: Run the tests (green) and typecheck**

  ```bash
  cd /Users/mac/Project/oa-cli/packages/core && bun test test/models.test.ts
  ```

  Expected: `3 pass, 0 fail`.

  ```bash
  cd /Users/mac/Project/oa-cli/packages/core && bun run typecheck
  ```

  Expected: exits 0. (Consumers only use `Service`, `get`, `refresh`, `Model`, `Provider`, `Event` — all preserved.)

- [ ] **Step 5: Confirm the rest of the core plugin suite still passes (it relies on the kept OPENCODE_MODELS_PATH fixture hook)**

  ```bash
  cd /Users/mac/Project/oa-cli/packages/core && bun test test/plugin/models-dev.test.ts
  ```

  Expected: all pass. (This file still sets `Flag.OPENCODE_DISABLE_MODELS_FETCH` — that flag still exists until Task K2 and is simply ignored by the new implementation.)

- [ ] **Step 6: Commit**

  ```bash
  cd /Users/mac/Project/oa-cli && git add packages/core/src/models-dev.ts packages/core/test/models.test.ts && git commit -m "feat(catalog): lock model catalog to single openagentic provider

  Replaces the models.dev runtime fetch, on-disk cache, and background
  refresh with a hardcoded single-entry catalog { openagentic }.
  OPENCODE_MODELS_PATH remains as a test-only fixture override.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task K2: Remove the now-dead models.dev flags

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/core/src/flag/flag.ts` (lines 29 and 45)
- Modify: `/Users/mac/Project/oa-cli/packages/core/test/preload.ts` (line 5)
- Modify: `/Users/mac/Project/oa-cli/packages/core/test/plugin/models-dev.test.ts` (lines 128-168, one `acquireUseRelease` block)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/test/lib/cli-process.ts` (line 75)

**Interfaces:**
- Consumes: nothing new
- Produces: `Flag` object no longer has `OPENCODE_DISABLE_MODELS_FETCH` or `OPENCODE_MODELS_URL`; `Flag.OPENCODE_MODELS_PATH` (line 46) is kept.

- [ ] **Step 1: Delete the two flag entries**

  In `/Users/mac/Project/oa-cli/packages/core/src/flag/flag.ts` delete these two lines (keep `OPENCODE_MODELS_PATH`):

  ```ts
    OPENCODE_DISABLE_MODELS_FETCH: truthy("OPENCODE_DISABLE_MODELS_FETCH"),
  ```

  ```ts
    OPENCODE_MODELS_URL: process.env["OPENCODE_MODELS_URL"],
  ```

- [ ] **Step 2: Update the test preload and fixture save/restore blocks**

  In `/Users/mac/Project/oa-cli/packages/core/test/preload.ts` delete the line:

  ```ts
  process.env.OPENCODE_DISABLE_MODELS_FETCH = "true"
  ```

  In `/Users/mac/Project/oa-cli/packages/core/test/plugin/models-dev.test.ts`, in the `it.effect("registers key methods for providers with environment variables", ...)` block, replace:

  ```ts
        Effect.sync(() => {
          const previous = {
            path: Flag.OPENCODE_MODELS_PATH,
            disabled: Flag.OPENCODE_DISABLE_MODELS_FETCH,
          }
          Flag.OPENCODE_MODELS_PATH = path.join(import.meta.dir, "fixtures", "models-dev.json")
          Flag.OPENCODE_DISABLE_MODELS_FETCH = true
          return previous
        }),
  ```

  with:

  ```ts
        Effect.sync(() => {
          const previous = {
            path: Flag.OPENCODE_MODELS_PATH,
          }
          Flag.OPENCODE_MODELS_PATH = path.join(import.meta.dir, "fixtures", "models-dev.json")
          return previous
        }),
  ```

  and replace the matching release:

  ```ts
        (previous) =>
          Effect.sync(() => {
            Flag.OPENCODE_MODELS_PATH = previous.path
            Flag.OPENCODE_DISABLE_MODELS_FETCH = previous.disabled
          }),
  ```

  with:

  ```ts
        (previous) =>
          Effect.sync(() => {
            Flag.OPENCODE_MODELS_PATH = previous.path
          }),
  ```

  In `/Users/mac/Project/oa-cli/packages/opencode/test/lib/cli-process.ts` delete line 75 (inside `isolatedEnv`; it sets a process env var for spawned CLI binaries, which no longer read it):

  ```ts
      OPENCODE_DISABLE_MODELS_FETCH: "1",
  ```

- [ ] **Step 3: Verify by grep and typecheck**

  ```bash
  grep -rn "OPENCODE_DISABLE_MODELS_FETCH\|OPENCODE_MODELS_URL" --include="*.ts" /Users/mac/Project/oa-cli/packages | grep -v node_modules
  ```

  Expected remaining hits — exactly two, both in packages outside this area that read `process.env` directly (not `Flag`) and are pruned in Phase 2: `packages/ui/vite.config.ts:48` and `packages/cli/script/generate.ts:1` (the `@opencode-ai/cli` / `lildax` package). Anything else is a missed reference — fix it before continuing. (Translated docs under `packages/web/src/content/docs/*/cli.mdx` also mention the flag but are `.mdx`, out of this grep and owned by the web/branding area.)

  ```bash
  cd /Users/mac/Project/oa-cli/packages/core && bun run typecheck && bun test test/models.test.ts test/plugin/models-dev.test.ts
  ```

  Expected: typecheck exits 0; all tests pass.

  ```bash
  cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
  ```

  Expected: exits 0.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/mac/Project/oa-cli && git add packages/core/src/flag/flag.ts packages/core/test/preload.ts packages/core/test/plugin/models-dev.test.ts packages/opencode/test/lib/cli-process.ts && git commit -m "chore(flags): remove dead OPENCODE_DISABLE_MODELS_FETCH and OPENCODE_MODELS_URL

  The catalog is hardcoded; there is no models.dev fetch left to disable
  or redirect. OPENCODE_MODELS_PATH stays as the test fixture hook.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task K3: Remove the build-time models.dev snapshot

**Files:**
- Delete: `/Users/mac/Project/oa-cli/packages/opencode/script/generate.ts` (its only export is `modelsData`, fetched from models.dev at build time)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/script/build.ts` (line 15 import, line 192 define)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/script/build-node.ts` (line 13 import, line 23 define)

**Interfaces:**
- Consumes: nothing
- Produces: compiled binaries no longer embed `OPENCODE_MODELS_DEV` (the `declare const` consumer was already removed in Task K1).

- [ ] **Step 1: Remove the snapshot from build.ts**

  In `/Users/mac/Project/oa-cli/packages/opencode/script/build.ts` delete line 15:

  ```ts
  const generated = await import("./generate.ts")
  ```

  and delete this line from the `define:` object (currently line 192):

  ```ts
        OPENCODE_MODELS_DEV: generated.modelsData,
  ```

- [ ] **Step 2: Remove the snapshot from build-node.ts**

  In `/Users/mac/Project/oa-cli/packages/opencode/script/build-node.ts` delete line 13:

  ```ts
  const generated = await import("./generate.ts")
  ```

  and delete this line from the `define:` object (currently line 23):

  ```ts
      OPENCODE_MODELS_DEV: generated.modelsData,
  ```

  (Keep the remaining `OPENCODE_CHANNEL` entry in both files.)

- [ ] **Step 3: Delete the generator script**

  ```bash
  rm /Users/mac/Project/oa-cli/packages/opencode/script/generate.ts
  ```

- [ ] **Step 4: Verify no references remain**

  ```bash
  grep -rn "OPENCODE_MODELS_DEV\|MODELS_DEV_API_JSON\|generate.ts" --include="*.ts" /Users/mac/Project/oa-cli/packages/opencode /Users/mac/Project/oa-cli/packages/core/src | grep -v node_modules
  ```

  Expected: no output. (`packages/cli/script/generate.ts` and `packages/cli/script/build.ts` also reference models.dev, but they belong to the `@opencode-ai/cli` (`lildax`) package pruned in Phase 2 — outside this grep's scope and intentionally untouched. No package.json script or turbo task references the deleted `script/generate.ts`.)

  ```bash
  cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
  ```

  Expected: exits 0. A full binary build (`bun run build`) is deferred to the distribution area's tasks; nothing in it references the deleted symbols anymore.

- [ ] **Step 5: Commit**

  ```bash
  cd /Users/mac/Project/oa-cli && git add -A packages/opencode/script && git commit -m "chore(build): drop models.dev snapshot injection from builds

  The catalog is hardcoded in core; binaries no longer embed
  OPENCODE_MODELS_DEV and builds no longer fetch models.dev.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task K4: Add "openagentic" to the known provider-id statics

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/schema/src/provider.ts` (lines 8-23, the `ID` statics)
- Test: `/Users/mac/Project/oa-cli/packages/core/test/models.test.ts` (append one test)

**Interfaces:**
- Consumes: `statics` helper (`packages/schema/src/schema.ts:20`)
- Produces: `Provider.ID.openagentic: ID` (branded `"openagentic"`), re-exported as `ProviderV2.ID.openagentic` via `packages/core/src/provider.ts:6` (`export const ID = Provider.ID` — same object, so the static is visible there too). Note: `ID` is a branded `Schema.String`, not a literal union — any string already decodes; the statics list is a convenience constant table, so this is purely additive and nothing else needs relaxing.

- [ ] **Step 1: Failing test first**

  In `/Users/mac/Project/oa-cli/packages/core/test/models.test.ts`, add to the imports at the top:

  ```ts
  import { test } from "bun:test"
  import { Provider as ProviderSchema } from "@opencode-ai/schema/provider"
  ```

  (merge `test` into the existing `import { describe, expect, beforeAll, afterAll } from "bun:test"` line — the `Provider` namespace import works because `packages/schema/src/provider.ts:1` re-exports itself via `export * as Provider from "./provider"`, the same pattern `test/shared-schema.test.ts` already uses) and append at the end of the file:

  ```ts
  describe("Provider.ID statics", () => {
    test("exposes the openagentic provider id", () => {
      expect(ProviderSchema.ID.openagentic).toBe(ProviderSchema.ID.make("openagentic"))
    })
  })
  ```

  Run:

  ```bash
  cd /Users/mac/Project/oa-cli/packages/core && bun test test/models.test.ts
  ```

  Expected: `3 pass, 1 fail` — the new test fails (`undefined` !== `"openagentic"`; bun strips types without checking, so the not-yet-existing property is a runtime `undefined`, not a compile error); the 3 catalog tests still pass.

- [ ] **Step 2: Add the static**

  In `/Users/mac/Project/oa-cli/packages/schema/src/provider.ts`, inside the `statics((schema) => ({ ... }))` block, add one line after `opencode`:

  ```ts
      opencode: schema.make("opencode"),
      openagentic: schema.make("openagentic"),
  ```

- [ ] **Step 3: Verify**

  ```bash
  cd /Users/mac/Project/oa-cli/packages/core && bun test test/models.test.ts
  ```

  Expected: `4 pass, 0 fail`.

  ```bash
  cd /Users/mac/Project/oa-cli/packages/schema && bun run typecheck && cd /Users/mac/Project/oa-cli/packages/core && bun run typecheck
  ```

  Expected: both exit 0.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/mac/Project/oa-cli && git add packages/schema/src/provider.ts packages/core/test/models.test.ts && git commit -m "feat(schema): add openagentic to known provider id statics

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task K5: Remove the dead `models --refresh` flag

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/models.ts` (lines 1-31)

**Interfaces:**
- Consumes: `Provider.Service.list()` (unchanged)
- Produces: `models` CLI command without a `--refresh` option. Note: `ModelsDev.Interface.refresh` itself stays as a no-op (Task K1) because `packages/opencode/src/cli/cmd/providers.ts:357` still calls it (`yield* Effect.ignore(modelsDev.refresh(true))`) — that file is rewritten wholesale by the auth area, which may then drop `refresh` from the interface entirely.

- [ ] **Step 1: Remove the option, its handler block, and the now-unused imports**

  In `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/models.ts`:

  Delete the import (line 3):

  ```ts
  import { ModelsDev } from "@opencode-ai/core/models-dev"
  ```

  Delete the import (line 5) — `UI` is used only inside the refresh handler block deleted below, nowhere else in this file:

  ```ts
  import { UI } from "../ui"
  ```

  Delete the `.option("refresh", ...)` call from the builder chain (lines 22-25):

  ```ts
        .option("refresh", {
          describe: "refresh the models cache from models.dev",
          type: "boolean",
        }),
  ```

  The chain then ends with the preceding call — move its trailing comma so the builder reads:

  ```ts
        .option("verbose", {
          describe: "use more verbose model output (includes metadata like costs)",
          type: "boolean",
        }),
  ```

  Delete the handler block (lines 28-31):

  ```ts
      if (args.refresh) {
        yield* ModelsDev.Service.use((s) => s.refresh(true))
        UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
      }
  ```

  (The remaining handler keeps using `fail` from `../effect-cmd` and `ProviderV2` — those imports stay.)

- [ ] **Step 2: Verify**

  ```bash
  cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
  ```

  Expected: exits 0.

  ```bash
  grep -rn "models\.dev" --include="*.ts" /Users/mac/Project/oa-cli/packages/opencode/src /Users/mac/Project/oa-cli/packages/core/src | grep -v node_modules
  ```

  Expected: exactly five hits, all code comments (not user-visible strings), all in files owned and reworked by the provider-discovery area — do NOT edit them here to avoid conflicting with that area's rewrites:
  - `packages/opencode/src/provider/provider.ts:371` and `:500` (comments)
  - `packages/opencode/src/session/session.ts:400` (TODO comment)
  - `packages/core/src/plugin/provider/google-vertex.ts:6` (comment)
  - `packages/core/src/plugin/provider/amazon-bedrock.ts:14` (comment)

  Any hit outside this list — in particular any string that reaches the user — is a miss; fix it before continuing.

- [ ] **Step 3: Commit**

  ```bash
  cd /Users/mac/Project/oa-cli && git add packages/opencode/src/cli/cmd/models.ts && git commit -m "chore(cli): remove dead models --refresh flag

  The catalog is compile-time constant; there is no cache to refresh.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```
---

## Area A — Modul auth `OpenagenticAuth` (PKCE + loopback)

Semua task di area ini membangun satu file baru `packages/opencode/src/auth/openagentic.ts` plus satu file test `packages/opencode/test/auth/openagentic.test.ts`. Modul ini sengaja **Promise-based** (bukan Effect) mengikuti idiom plugin OAuth existing (`src/plugin/openai/codex.ts`, `src/plugin/xai.ts`); jembatan ke Auth service (Effect) memakai idiom `makeRuntime` yang sudah dipakai `src/config/tui.ts:264` (`const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))`).

Catatan repo yang dipakai semua task:
- **Prasyarat**: dependencies harus terpasang. Kalau `packages/opencode/node_modules/@opentui` belum ada, jalankan dulu `cd /Users/mac/Project/oa-cli && bun install` (tanpa ini `bun test` gagal dengan `error: preload not found "@opentui/solid/preload"`).
- Test dijalankan dari dir package agar preload `bunfig.toml [test]` aktif (`./test/preload.ts` mengisolasi XDG → `auth.json` masuk tmp dir): `cd /Users/mac/Project/oa-cli/packages/opencode && bun test <file> --timeout 30000`
- Typecheck: `cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck` (= `tsgo --noEmit`)
- Buka browser: package `open@10.1.2` sudah ada di `packages/opencode/package.json:134` (idiom pemakaian: `src/cli/cmd/account.ts:8-10`)
- **JANGAN pakai** `OauthCallbackPage` dari `@opencode-ai/core/oauth/page` untuk halaman callback: copy-nya masih user-visible "OpenCode" ("OpenCode is now connected to ...") sehingga melanggar kontrak brand. Modul ini pakai HTML inline sendiri dengan palette oa-cli (bg `#0c0a09`, primary `#f97316`, muted `#a8a29e`, error `#ef4444`). Rebranding `oauth/page.ts` sendiri adalah urusan area brand-strings.

### Task A1: PKCE helpers (generateVerifier / challengeS256 / generateState)

**Files:**
- Create: `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts`
- Create (test): `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic.test.ts`

**Interfaces:**
- Produces: `generateVerifier(length?: number): string` (default 64; range 43–128, charset unreserved RFC 7636 `[A-Za-z0-9\-._~]`, throw `RangeError` di luar range)
- Produces: `challengeS256(verifier: string): Promise<string>` (= base64url(SHA-256(verifier)))
- Produces: `generateState(): string` (32 byte random, base64url)
- Produces: `base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string`
- Consumes: WebCrypto global (`crypto.getRandomValues`, `crypto.subtle.digest`) — idiom sama dengan `src/plugin/openai/codex.ts:23-37`

- [ ] **Step 1: Tulis failing test PKCE**

Buat `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic.test.ts`:

```ts
import { describe, expect, test } from "bun:test"

// Isolasi dari env user (preload tidak menghapus var ini)
delete process.env["OPENCODE_AUTH_CONTENT"]

import { base64UrlEncode, challengeS256, generateState, generateVerifier } from "../../src/auth/openagentic"

describe("OpenagenticAuth.pkce", () => {
  test("generateVerifier default menghasilkan 64 char unreserved", () => {
    const verifier = generateVerifier()
    expect(verifier).toHaveLength(64)
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })

  test("generateVerifier menerima batas 43 dan 128", () => {
    expect(generateVerifier(43)).toHaveLength(43)
    expect(generateVerifier(128)).toHaveLength(128)
  })

  test("generateVerifier menolak panjang di luar 43-128", () => {
    expect(() => generateVerifier(42)).toThrow(RangeError)
    expect(() => generateVerifier(129)).toThrow(RangeError)
  })

  test("challengeS256 cocok dengan test vector RFC 7636 Appendix B", async () => {
    const challenge = await challengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  })

  test("generateState unik dan cukup panjang", () => {
    const states = new Set(Array.from({ length: 100 }, () => generateState()))
    expect(states.size).toBe(100)
    for (const state of states) {
      expect(state.length).toBeGreaterThanOrEqual(32)
      expect(state).toMatch(/^[A-Za-z0-9\-_]+$/)
    }
  })

  test("base64UrlEncode tanpa padding dan URL-safe", () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 190]))).toBe("-_--")
  })
})
```

Jalankan (harus MERAH — modul belum ada):
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected: error resolve module `error: Cannot find module '../../src/auth/openagentic'` (exit code != 0).

- [ ] **Step 2: Implement helper PKCE**

Buat `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts`:

```ts
export * as OpenagenticAuth from "./openagentic"

// ---------------------------------------------------------------------------
// PKCE (RFC 7636) — pure helpers, unit-tested di test/auth/openagentic.test.ts
// ---------------------------------------------------------------------------

const UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function generateVerifier(length = 64): string {
  if (length < 43 || length > 128) throw new RangeError(`PKCE verifier length must be 43-128, got ${length}`)
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((byte) => UNRESERVED[byte % UNRESERVED.length])
    .join("")
}

export async function challengeS256(verifier: string): Promise<string> {
  return base64UrlEncode(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
}

export function generateState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
}
```

(Baris pertama `export * as OpenagenticAuth from "./openagentic"` = idiom self-namespace repo, lihat `src/config/tui.ts:1` dan `src/auth/index.ts:97`; ditaruh paling atas supaya task berikutnya tinggal append di bawah.)

- [ ] **Step 3: Jalankan test sampai hijau**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected output diakhiri:
```
 6 pass
 0 fail
```

- [ ] **Step 4: Commit**
```
git -C /Users/mac/Project/oa-cli add packages/opencode/src/auth/openagentic.ts packages/opencode/test/auth/openagentic.test.ts
git -C /Users/mac/Project/oa-cli commit -m "feat(auth): add PKCE helpers for openagentic login"
```

### Task A2: LoginError + loopback callback server

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts` (append di akhir file)
- Modify (test): `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic.test.ts` (append describe baru + perluas import)

**Interfaces:**
- Produces: `class LoginError extends Error { readonly code: LoginErrorCode }` dengan `LoginErrorCode = "timeout" | "state_mismatch" | "access_denied" | "invalid_grant" | "server_error" | "invalid_response" | "port_unavailable"`
- Produces: `startCallbackServer(opts: { state: string; timeoutMs?: number; maxAttempts?: number }): CallbackServer` di mana `CallbackServer = { port: number; url: string; code: Promise<string>; stop: () => void }` — `url` adalah redirect_uri lengkap `http://127.0.0.1:<port>/callback`; throw `LoginError("port_unavailable")` sinkron bila listener gagal dibuka/tidak mendapat port
- Produces: `DEFAULT_TIMEOUT_MS = 300_000` (5 menit, per kontrak)
- Consumes: `Bun.serve` (`hostname: "127.0.0.1"`, `port: 0` = port acak dari OS; idiom mock test existing `test/plugin/xai.test.ts:34-39`), `AbortSignal.timeout` (idiom `src/plugin/digitalocean.ts:176`)

- [ ] **Step 1: Tulis failing test callback server**

Ganti baris import modul di `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic.test.ts` menjadi:

```ts
import {
  base64UrlEncode,
  challengeS256,
  generateState,
  generateVerifier,
  LoginError,
  startCallbackServer,
} from "../../src/auth/openagentic"
```

lalu append di akhir file:

```ts
describe("OpenagenticAuth.callbackServer", () => {
  test("happy path: GET /callback resolve code + halaman Berhasil", async () => {
    const cb = startCallbackServer({ state: "state-1" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/callback?code=abc-123&state=state-1`)
      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("text/html")
      expect(await response.text()).toContain("Berhasil")
      expect(await cb.code).toBe("abc-123")
      expect(cb.url).toBe(`http://127.0.0.1:${cb.port}/callback`)
    } finally {
      cb.stop()
    }
  })

  test("state mismatch: 400 + promise reject state_mismatch", async () => {
    const cb = startCallbackServer({ state: "expected" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/callback?code=abc&state=evil`)
      expect(response.status).toBe(400)
      const err = await cb.code.then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("state_mismatch")
    } finally {
      cb.stop()
    }
  })

  test("error=access_denied dari backend: reject access_denied", async () => {
    const cb = startCallbackServer({ state: "s" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/callback?error=access_denied&state=s`)
      expect(response.status).toBe(400)
      const err = await cb.code.then(
        () => undefined,
        (e) => e,
      )
      expect((err as LoginError).code).toBe("access_denied")
    } finally {
      cb.stop()
    }
  })

  test("path selain /callback: 404, promise tetap pending", async () => {
    const cb = startCallbackServer({ state: "s" })
    try {
      const response = await fetch(`http://127.0.0.1:${cb.port}/favicon.ico`)
      expect(response.status).toBe(404)
    } finally {
      cb.stop()
    }
  })

  test("timeout: reject dengan code timeout", async () => {
    const cb = startCallbackServer({ state: "s", timeoutMs: 100 })
    try {
      const err = await cb.code.then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("timeout")
    } finally {
      cb.stop()
    }
  })
})
```

Jalankan (MERAH — `startCallbackServer` belum ada):
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected: `SyntaxError: Export named 'LoginError' not found` (atau serupa), exit != 0.

- [ ] **Step 2: Implement LoginError + loopback server**

Append di akhir `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts`:

```ts
// ---------------------------------------------------------------------------
// Error terstruktur untuk alur login
// ---------------------------------------------------------------------------

export type LoginErrorCode =
  | "timeout"
  | "state_mismatch"
  | "access_denied"
  | "invalid_grant"
  | "server_error"
  | "invalid_response"
  | "port_unavailable"

export class LoginError extends Error {
  constructor(
    readonly code: LoginErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "OpenagenticLoginError"
  }
}

// ---------------------------------------------------------------------------
// Loopback callback server (RFC 8252 §7.3)
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000

const SUCCESS_HTML = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>OA-cli</title></head><body style="background:#0c0a09;color:#ffffff;font-family:ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="color:#f97316;font-size:2rem;margin-bottom:.5rem">&#10003;</div><h1 style="font-size:1.25rem;margin:0 0 .25rem">Berhasil</h1><p style="color:#a8a29e;margin:0">Kembali ke terminal untuk melanjutkan.</p></div><script>setTimeout(function(){window.close()},1500)</script></body></html>`

const errorHtml = (detail: string) =>
  `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>OA-cli</title></head><body style="background:#0c0a09;color:#ffffff;font-family:ui-sans-serif,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><div style="color:#ef4444;font-size:2rem;margin-bottom:.5rem">&#10007;</div><h1 style="font-size:1.25rem;margin:0 0 .25rem">Login gagal</h1><p style="color:#a8a29e;margin:0">${detail}</p></div></body></html>`

const html = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } })

function serveWithRetry(handler: (request: Request) => Response, maxAttempts: number) {
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler })
    } catch (error) {
      lastError = error
    }
  }
  throw new LoginError("port_unavailable", `Gagal membuka port loopback: ${String(lastError)}`)
}

export interface CallbackServer {
  port: number
  /** redirect_uri lengkap: http://127.0.0.1:<port>/callback */
  url: string
  /** Resolve dengan authorization code, reject dengan LoginError */
  code: Promise<string>
  stop: () => void
}

export function startCallbackServer(opts: {
  state: string
  timeoutMs?: number
  maxAttempts?: number
}): CallbackServer {
  let resolveCode!: (code: string) => void
  let rejectCode!: (error: LoginError) => void
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })
  // Cegah unhandledRejection kalau reject terjadi saat caller belum/berhenti await
  code.catch(() => {})

  const handler = (request: Request): Response => {
    const url = new URL(request.url)
    if (request.method !== "GET" || url.pathname !== "/callback") return new Response("Not found", { status: 404 })

    const errorParam = url.searchParams.get("error")
    if (errorParam) {
      rejectCode(
        new LoginError(
          errorParam === "access_denied" ? "access_denied" : "server_error",
          `Login ditolak: ${errorParam}`,
        ),
      )
      return html(errorHtml("Login ditolak. Tutup jendela ini dan coba lagi dari terminal."), 400)
    }
    if (url.searchParams.get("state") !== opts.state) {
      rejectCode(new LoginError("state_mismatch", "State callback tidak cocok — coba login ulang."))
      return html(errorHtml("State tidak cocok. Tutup jendela ini dan coba lagi dari terminal."), 400)
    }
    const codeParam = url.searchParams.get("code")
    if (!codeParam) {
      rejectCode(new LoginError("invalid_response", "Callback tanpa authorization code."))
      return html(errorHtml("Authorization code tidak ditemukan."), 400)
    }
    resolveCode(codeParam)
    return html(SUCCESS_HTML, 200)
  }

  const server = serveWithRetry(handler, opts.maxAttempts ?? 5)
  // Tipe Bun `Server.port` adalah `number | undefined` (undefined untuk unix socket);
  // listener TCP selalu punya port, tapi guard eksplisit agar `tsgo --noEmit` lolos.
  const port = server.port
  if (port === undefined) {
    server.stop(true)
    throw new LoginError("port_unavailable", "Server loopback tidak mendapatkan port.")
  }

  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const onTimeout = () => rejectCode(new LoginError("timeout", "Login timeout (5 menit) — coba lagi."))
  signal.addEventListener("abort", onTimeout, { once: true })

  return {
    port,
    url: `http://127.0.0.1:${port}/callback`,
    code,
    stop: () => {
      signal.removeEventListener("abort", onTimeout)
      server.stop(true)
    },
  }
}
```

(PERHATIAN: jangan tulis `port: server.port` langsung di return — `Server.port` bertipe `number | undefined` di bun-types repo ini dan `tsgo --noEmit` gagal dengan TS2322 tanpa guard di atas; sudah diverifikasi terhadap tsgo.)

- [ ] **Step 3: Jalankan test sampai hijau**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected output diakhiri:
```
 11 pass
 0 fail
```

- [ ] **Step 4: Commit**
```
git -C /Users/mac/Project/oa-cli add packages/opencode/src/auth/openagentic.ts packages/opencode/test/auth/openagentic.test.ts
git -C /Users/mac/Project/oa-cli commit -m "feat(auth): add loopback callback server for openagentic login"
```

### Task A3: Token exchange (POST /api/v1/cli/token)

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts` (append di akhir file)
- Modify (test): `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic.test.ts` (append describe + perluas import)

**Interfaces:**
- Produces: `defaultBaseUrl(): string` — resolusi call-time: `process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id"` (kontrak test lintas-area, lihat Global Constraints)
- Produces: `interface TokenResponse { api_key: string; user: { email: string; name: string; plan: string } }`
- Produces: `exchangeToken(input: { code: string; verifier: string; baseUrl?: string }): Promise<TokenResponse>` — non-200 → `LoginError` (`invalid_grant` untuk body `{ error: "invalid_grant" }` per kontrak backend spec §`POST /api/v1/cli/token` "Error: 400 invalid_grant"; selain itu `server_error`); body 200 malformed → `LoginError("invalid_response")`
- Consumes: global `fetch` (idiom `src/plugin/openai/codex.ts:107-122`)

- [ ] **Step 1: Tulis failing test token exchange**

Tambahkan `exchangeToken` ke import modul di file test (baris import yang sama seperti Task A2, tambah satu nama):

```ts
import {
  base64UrlEncode,
  challengeS256,
  exchangeToken,
  generateState,
  generateVerifier,
  LoginError,
  startCallbackServer,
} from "../../src/auth/openagentic"
```

Append di akhir file test:

```ts
describe("OpenagenticAuth.exchangeToken", () => {
  const user = { email: "roni@example.com", name: "Roni", plan: "free" }

  function makeTokenServer(handler: (body: { code: string; code_verifier: string }) => Response | Promise<Response>) {
    return Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url)
        if (request.method === "POST" && url.pathname === "/api/v1/cli/token") {
          return handler((await request.json()) as { code: string; code_verifier: string })
        }
        return new Response("not found", { status: 404 })
      },
    })
  }

  test("happy path: kirim code + code_verifier sebagai JSON, terima api_key + user", async () => {
    let received: { code: string; code_verifier: string } | undefined
    const server = makeTokenServer((body) => {
      received = body
      return Response.json({ api_key: "oa-key-123", user })
    })
    try {
      const result = await exchangeToken({ code: "the-code", verifier: "the-verifier", baseUrl: server.url.origin })
      expect(result.api_key).toBe("oa-key-123")
      expect(result.user).toEqual(user)
      expect(received).toEqual({ code: "the-code", code_verifier: "the-verifier" })
    } finally {
      server.stop(true)
    }
  })

  test("400 invalid_grant → LoginError invalid_grant", async () => {
    const server = makeTokenServer(() => Response.json({ error: "invalid_grant" }, { status: 400 }))
    try {
      const err = await exchangeToken({ code: "x", verifier: "y", baseUrl: server.url.origin }).then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("invalid_grant")
    } finally {
      server.stop(true)
    }
  })

  test("500 → LoginError server_error", async () => {
    const server = makeTokenServer(() => new Response("boom", { status: 500 }))
    try {
      const err = await exchangeToken({ code: "x", verifier: "y", baseUrl: server.url.origin }).then(
        () => undefined,
        (e) => e,
      )
      expect((err as LoginError).code).toBe("server_error")
    } finally {
      server.stop(true)
    }
  })

  test("200 dengan body tidak lengkap → LoginError invalid_response", async () => {
    const server = makeTokenServer(() => Response.json({ api_key: "k" }))
    try {
      const err = await exchangeToken({ code: "x", verifier: "y", baseUrl: server.url.origin }).then(
        () => undefined,
        (e) => e,
      )
      expect((err as LoginError).code).toBe("invalid_response")
    } finally {
      server.stop(true)
    }
  })
})
```

Jalankan (MERAH):
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected: export `exchangeToken` not found, exit != 0.

- [ ] **Step 2: Implement exchangeToken**

Append di akhir `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts`:

```ts
// ---------------------------------------------------------------------------
// Token exchange: POST /api/v1/cli/token { code, code_verifier }
// ---------------------------------------------------------------------------

export function defaultBaseUrl(): string {
  return process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id"
}

export interface TokenResponse {
  api_key: string
  user: { email: string; name: string; plan: string }
}

function isTokenResponse(data: unknown): data is TokenResponse {
  if (typeof data !== "object" || data === null) return false
  const record = data as Record<string, unknown>
  if (typeof record.api_key !== "string") return false
  const user = record.user as Record<string, unknown> | undefined
  if (typeof user !== "object" || user === null) return false
  return typeof user.email === "string" && typeof user.name === "string" && typeof user.plan === "string"
}

export async function exchangeToken(input: {
  code: string
  verifier: string
  baseUrl?: string
}): Promise<TokenResponse> {
  const base = input.baseUrl ?? defaultBaseUrl()
  const response = await fetch(`${base}/api/v1/cli/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: input.code, code_verifier: input.verifier }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined
    if (body?.error === "invalid_grant") {
      throw new LoginError("invalid_grant", "Authorization code kedaluwarsa atau sudah dipakai — coba login ulang.")
    }
    throw new LoginError(
      "server_error",
      `Tukar token gagal (${response.status})${body?.error ? `: ${body.error}` : ""}`,
    )
  }
  const data = await response.json().catch(() => undefined)
  if (!isTokenResponse(data)) throw new LoginError("invalid_response", "Response /api/v1/cli/token tidak valid.")
  return data
}
```

- [ ] **Step 3: Jalankan test sampai hijau**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected output diakhiri:
```
 15 pass
 0 fail
```

- [ ] **Step 4: Commit**
```
git -C /Users/mac/Project/oa-cli add packages/opencode/src/auth/openagentic.ts packages/opencode/test/auth/openagentic.test.ts
git -C /Users/mac/Project/oa-cli commit -m "feat(auth): add openagentic token exchange"
```

### Task A4: Orkestrasi login() / logout() + test integrasi end-to-end

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts` (tambah import block + append login/logout)
- Modify (test): `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic.test.ts` (append describe integrasi)

**Interfaces:**
- Produces (kontrak FIXED): `login(opts?: { onUrl?: (url: string) => void }): Promise<{ key: string; user: { email: string; name: string; plan: string } }>` — opsi tambahan internal untuk test: `baseUrl?: string`, `timeoutMs?: number`, `openBrowser?: (url: string) => Promise<void>`
- Produces (kontrak FIXED): `logout(): Promise<void>` (= `Auth.remove("openagentic")`)
- Produces: `PROVIDER_ID = "openagentic"`
- Consumes: `Auth.Service` (`packages/opencode/src/auth/index.ts:43-50` — `set(key, info)` / `remove(key)`; plain object `{ type: "api", key }` diterima secara struktural, precedent `test/auth/auth.test.ts:64-67`), dijembatani via `makeRuntime` dari `@opencode-ai/core/effect/runtime` + `AppNodeBuilder.build(Auth.node)` (idiom persis `src/config/tui.ts:264`; `Auth.node` ada di `src/auth/index.ts:95`); `open` dari package `open` (idiom `src/cli/cmd/account.ts:8-10`)
- URL browser (kontrak FIXED): `https://openagentic.id/auth/cli?redirect_uri=...&state=...&code_challenge=...` (+ `code_challenge_method=S256` eksplisit)

- [ ] **Step 1: Tulis failing test integrasi (mock backend openagentic.id)**

Ganti seluruh blok import paling atas file test menjadi:

```ts
import { describe, expect, test } from "bun:test"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Auth } from "../../src/auth"

// Isolasi dari env user (preload tidak menghapus var ini)
delete process.env["OPENCODE_AUTH_CONTENT"]

import {
  base64UrlEncode,
  challengeS256,
  exchangeToken,
  generateState,
  generateVerifier,
  login,
  LoginError,
  logout,
  startCallbackServer,
} from "../../src/auth/openagentic"

const authRt = makeRuntime(Auth.Service, AppNodeBuilder.build(Auth.node))
```

Append di akhir file test:

```ts
describe("OpenagenticAuth.login (integrasi mock backend)", () => {
  const user = { email: "roni@example.com", name: "Roni", plan: "free" }

  // Mock openagentic.id: menerbitkan code lewat "browser" palsu, lalu
  // memverifikasi PKCE penuh di POST /api/v1/cli/token.
  function makeBackend() {
    const issuedCode = "auth-code-1"
    let challenge: string | undefined
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const url = new URL(request.url)
        if (request.method === "POST" && url.pathname === "/api/v1/cli/token") {
          const body = (await request.json()) as { code: string; code_verifier: string }
          const computed = base64UrlEncode(
            await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.code_verifier)),
          )
          if (body.code !== issuedCode || challenge === undefined || computed !== challenge) {
            return Response.json({ error: "invalid_grant" }, { status: 400 })
          }
          return Response.json({ api_key: "oa-key-integration", user })
        }
        return new Response("not found", { status: 404 })
      },
    })
    // "Browser" palsu: baca URL /auth/cli, langsung redirect ke loopback callback
    const browse = async (target: string, state?: string) => {
      const url = new URL(target)
      expect(url.pathname).toBe("/auth/cli")
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      challenge = url.searchParams.get("code_challenge") ?? undefined
      const redirect = url.searchParams.get("redirect_uri")!
      const callbackState = state ?? url.searchParams.get("state")!
      await fetch(`${redirect}?code=${issuedCode}&state=${encodeURIComponent(callbackState)}`)
    }
    return { server, browse, baseUrl: () => server.url.origin }
  }

  test("happy path: login menyimpan key ke Auth dan mengembalikan user", async () => {
    const backend = makeBackend()
    try {
      const result = await login({
        baseUrl: backend.baseUrl(),
        openBrowser: (url) => backend.browse(url),
      })
      expect(result.key).toBe("oa-key-integration")
      expect(result.user).toEqual(user)
      const stored = await authRt.runPromise((auth) => auth.get("openagentic"))
      expect(stored).toMatchObject({ type: "api", key: "oa-key-integration" })
    } finally {
      backend.server.stop(true)
      await logout()
    }
  })

  test("browser gagal terbuka: onUrl dipanggil dan login tetap sukses via URL manual", async () => {
    const backend = makeBackend()
    const seen: string[] = []
    try {
      const result = await login({
        baseUrl: backend.baseUrl(),
        openBrowser: async () => {
          throw new Error("no browser available")
        },
        onUrl: (url) => {
          seen.push(url)
          void backend.browse(url)
        },
      })
      expect(seen).toHaveLength(1)
      expect(seen[0]).toContain("/auth/cli?")
      expect(result.key).toBe("oa-key-integration")
    } finally {
      backend.server.stop(true)
      await logout()
    }
  })

  test("state mismatch: login reject, tidak ada key tersimpan", async () => {
    const backend = makeBackend()
    try {
      const err = await login({
        baseUrl: backend.baseUrl(),
        openBrowser: (url) => backend.browse(url, "wrong-state"),
      }).then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("state_mismatch")
      const stored = await authRt.runPromise((auth) => auth.get("openagentic"))
      expect(stored).toBeUndefined()
    } finally {
      backend.server.stop(true)
    }
  })

  test("timeout: tanpa callback, login reject timeout", async () => {
    const backend = makeBackend()
    try {
      const err = await login({
        baseUrl: backend.baseUrl(),
        timeoutMs: 200,
        openBrowser: async () => {},
      }).then(
        () => undefined,
        (e) => e,
      )
      expect(err).toBeInstanceOf(LoginError)
      expect((err as LoginError).code).toBe("timeout")
    } finally {
      backend.server.stop(true)
    }
  })

  test("logout menghapus entri openagentic", async () => {
    await authRt.runPromise((auth) => auth.set("openagentic", { type: "api", key: "to-be-removed" }))
    await logout()
    const stored = await authRt.runPromise((auth) => auth.get("openagentic"))
    expect(stored).toBeUndefined()
  })
})
```

Jalankan (MERAH — `login`/`logout` belum ada):
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected: export `login` not found, exit != 0.

- [ ] **Step 2: Implement login() / logout()**

Di `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts`, ganti baris pertama:

```ts
export * as OpenagenticAuth from "./openagentic"
```

menjadi:

```ts
export * as OpenagenticAuth from "./openagentic"

import open from "open"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Auth } from "@/auth"
```

lalu append di akhir file:

```ts
// ---------------------------------------------------------------------------
// Orkestrasi login/logout
// ---------------------------------------------------------------------------

export const PROVIDER_ID = "openagentic"

// Idiom bridging Effect -> Promise, sama dengan src/config/tui.ts:264.
// makeRuntime lazy — ManagedRuntime baru dibuat saat run* pertama, jadi aman di module scope.
const authRuntime = makeRuntime(Auth.Service, AppNodeBuilder.build(Auth.node))

export interface LoginOptions {
  /** Dipanggil dengan URL login bila browser gagal dibuka, agar caller mencetaknya. */
  onUrl?: (url: string) => void
  /** @internal test hook — default https://openagentic.id */
  baseUrl?: string
  /** @internal test hook — default 5 menit */
  timeoutMs?: number
  /** @internal test hook — default package `open` */
  openBrowser?: (url: string) => Promise<void>
}

export interface LoginResult {
  key: string
  user: { email: string; name: string; plan: string }
}

export async function login(opts?: LoginOptions): Promise<LoginResult> {
  const base = opts?.baseUrl ?? defaultBaseUrl()
  const verifier = generateVerifier()
  const challenge = await challengeS256(verifier)
  const state = generateState()

  const server = startCallbackServer({ state, timeoutMs: opts?.timeoutMs })
  try {
    const params = new URLSearchParams({
      redirect_uri: server.url,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    })
    const url = `${base}/auth/cli?${params.toString()}`

    const openBrowser = opts?.openBrowser ?? ((target: string) => open(target).then(() => undefined))
    await openBrowser(url).catch(() => opts?.onUrl?.(url))

    const code = await server.code
    const token = await exchangeToken({ code, verifier, baseUrl: base })
    await authRuntime.runPromise((auth) => auth.set(PROVIDER_ID, { type: "api", key: token.api_key }))
    return { key: token.api_key, user: token.user }
  } finally {
    server.stop()
  }
}

export async function logout(): Promise<void> {
  await authRuntime.runPromise((auth) => auth.remove(PROVIDER_ID))
}
```

- [ ] **Step 3: Jalankan seluruh test file sampai hijau**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic.test.ts --timeout 30000
```
Expected output diakhiri:
```
 20 pass
 0 fail
```

- [ ] **Step 4: Verifikasi regresi + typecheck + brand**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth --timeout 30000
```
Expected (auth.test.ts 4 test + openagentic.test.ts 20 test):
```
 24 pass
 0 fail
```
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```
Expected: exit 0 tanpa error (hanya baris `$ tsgo --noEmit`).
```
grep -in "opencode" /Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts | grep -v "@opencode-ai" | grep -v "tui.ts"
```
Expected: output kosong, grep exit code 1 karena no-match — itu PASS untuk step ini (tidak ada string user-visible "opencode"; import scope `@opencode-ai/*` dan komentar referensi `tui.ts` dikecualikan — rename scope package adalah urusan Fase 2).

- [ ] **Step 5: Commit**
```
git -C /Users/mac/Project/oa-cli add packages/opencode/src/auth/openagentic.ts packages/opencode/test/auth/openagentic.test.ts
git -C /Users/mac/Project/oa-cli commit -m "feat(auth): add OpenagenticAuth login/logout orchestration with PKCE loopback flow"
```
---

## Area X — Command auth, gate non-interaktif, pembersihan plugin OAuth

> Ordering note for the assembler: Task X1 is order-independent (it only touches `isAuthenticated`/constants). Tasks X2 and X4 `import { OpenagenticAuth } from "@/auth/openagentic"` and X2 calls `OpenagenticAuth.login()`/`logout()` — the task (other area) that creates `login()`/`logout()` in `packages/opencode/src/auth/openagentic.ts` must be scheduled before X2. X4 only needs X1.

### Task X1: `OpenagenticAuth.isAuthenticated()` helper + unit tests

**Files:**
- Create or extend: `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts` (shared module with the OAuth-login area; this task owns the `isAuthenticated` surface)
- Create: `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic-gate.test.ts`
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/test/preload.ts` (env-var hygiene block, directly after the existing `delete process.env["SAMBANOVA_API_KEY"]` at line 77)

**Interfaces:**
- Consumes: `Auth.Service` (`packages/opencode/src/auth/index.ts` — Effect service with `get(providerID): Effect<Info | undefined, AuthError>`), `AppRuntime` (`packages/opencode/src/effect/app-runtime.ts`, whose AppLayer includes `Auth.node`).
- Produces (all under the `OpenagenticAuth` namespace export):
  - `isAuthenticated(): Promise<boolean>` — env var first, then stored credential. Reused verbatim by the TUI login-gate area (tui.ts itself gets NO blocking gate — the TUI login route handles it).
  - `isAuthenticatedEffect(): Effect.Effect<boolean, never, Auth.Service>` — for `effectCmd` handlers.
  - `hasEnvKey(env?: Record<string, string | undefined>): boolean`
  - `PROVIDER_ID = "openagentic"`, `NOT_LOGGED_IN_MESSAGE = "Belum login. Jalankan \`oa-cli\` dulu untuk login."` (exact copy from the design spec §Mode non-interaktif, line 98)

- [ ] **Step 1: Write the failing test**

Create `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic-gate.test.ts` (mirrors `test/auth/auth.test.ts` conventions — `testEffect(LayerNode.compile(Auth.node))` + `it.instance`):

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { Auth } from "../../src/auth"
import { OpenagenticAuth } from "../../src/auth/openagentic"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(Auth.node))

describe("OpenagenticAuth.isAuthenticatedEffect", () => {
  beforeEach(() => {
    delete process.env["OPENAGENTIC_API_KEY"]
  })
  afterEach(() => {
    delete process.env["OPENAGENTIC_API_KEY"]
  })

  it.instance("false when no credential and no env key", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(false)
    }),
  )

  it.instance("true when auth.json has an openagentic api credential", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.set(OpenagenticAuth.PROVIDER_ID, { type: "api", key: "oa-test-key" })
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(true)
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
    }),
  )

  it.instance("false when only a credential for another provider exists", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      yield* auth.set("someother", { type: "api", key: "sk-other" })
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(false)
      yield* auth.remove("someother")
    }),
  )

  it.instance("OPENAGENTIC_API_KEY env var counts as logged in", () =>
    Effect.gen(function* () {
      const auth = yield* Auth.Service
      yield* auth.remove(OpenagenticAuth.PROVIDER_ID)
      process.env["OPENAGENTIC_API_KEY"] = "oa-env-key"
      expect(yield* OpenagenticAuth.isAuthenticatedEffect()).toBe(true)
    }),
  )
})

describe("OpenagenticAuth.hasEnvKey", () => {
  test("only a non-empty, non-whitespace value counts", () => {
    expect(OpenagenticAuth.hasEnvKey({})).toBe(false)
    expect(OpenagenticAuth.hasEnvKey({ OPENAGENTIC_API_KEY: "" })).toBe(false)
    expect(OpenagenticAuth.hasEnvKey({ OPENAGENTIC_API_KEY: "   " })).toBe(false)
    expect(OpenagenticAuth.hasEnvKey({ OPENAGENTIC_API_KEY: "oa-key" })).toBe(true)
  })
})

describe("OpenagenticAuth.NOT_LOGGED_IN_MESSAGE", () => {
  test("matches the spec copy exactly", () => {
    expect(OpenagenticAuth.NOT_LOGGED_IN_MESSAGE).toBe("Belum login. Jalankan `oa-cli` dulu untuk login.")
  })
})
```

Run (tests MUST run from `packages/opencode` — the root `bunfig.toml` sets `[test] root = "./do-not-run-tests-from-root"`):
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic-gate.test.ts --timeout 30000
```
Expected: failure with `error: Cannot find module '../../src/auth/openagentic'` — or, if the OAuth-login area already created the file, failures because `isAuthenticatedEffect`/`hasEnvKey`/`PROVIDER_ID`/`NOT_LOGGED_IN_MESSAGE` are not yet exported.

- [ ] **Step 2: Isolate the new env var in the test preload**

In `/Users/mac/Project/oa-cli/packages/opencode/test/preload.ts`, directly after `delete process.env["SAMBANOVA_API_KEY"]` (line 77):

```ts
delete process.env["OPENAGENTIC_API_KEY"]
```

- [ ] **Step 3: Implement the helper**

If `/Users/mac/Project/oa-cli/packages/opencode/src/auth/openagentic.ts` does not exist yet, create it with exactly the content below. If the OAuth-login area already created it (with `login()`/`logout()`), append everything EXCEPT the final re-export line above that file's existing trailing `export * as OpenagenticAuth from "./openagentic"` line (keep exactly one such line at the end of the file):

```ts
import { Effect } from "effect"
import { Auth } from "@/auth"

/** Auth storage key for the OpenAgentic platform credential in auth.json. */
export const PROVIDER_ID = "openagentic"

/** Exact copy required by the design spec (§4) for non-interactive use without credentials. */
export const NOT_LOGGED_IN_MESSAGE = "Belum login. Jalankan `oa-cli` dulu untuk login."

/** CI/automation escape hatch: a non-empty OPENAGENTIC_API_KEY counts as logged in. */
export function hasEnvKey(env: Record<string, string | undefined> = process.env): boolean {
  return (env["OPENAGENTIC_API_KEY"] ?? "").trim().length > 0
}

/**
 * Effect-native login check for effectCmd handlers. Never fails: an unreadable
 * auth.json is treated as "not logged in" (the user can just log in again).
 */
export const isAuthenticatedEffect = Effect.fn("OpenagenticAuth.isAuthenticated")(function* () {
  if (hasEnvKey()) return true
  const auth = yield* Auth.Service
  const info = yield* auth.get(PROVIDER_ID).pipe(Effect.orElseSucceed(() => undefined))
  return info?.type === "api" && info.key.trim().length > 0
})

/** Promise wrapper for non-Effect callers (TUI boot / login gate). */
export async function isAuthenticated(): Promise<boolean> {
  const { AppRuntime } = await import("@/effect/app-runtime")
  return AppRuntime.runPromise(isAuthenticatedEffect())
}

export * as OpenagenticAuth from "./openagentic"
```

(`AppRuntime` is imported dynamically to avoid a static import cycle: `app-runtime.ts` already imports `@/auth`. The trailing self re-export matches the repo idiom, e.g. `export * as Config from "./config"` in `src/config/config.ts`.)

- [ ] **Step 4: Run the tests**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/auth/openagentic-gate.test.ts --timeout 30000
```
Expected: ` 6 pass`, ` 0 fail`.

- [ ] **Step 5: Typecheck and commit**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```
Expected: exit 0, no errors.
```
git add packages/opencode/src/auth/openagentic.ts packages/opencode/test/auth/openagentic-gate.test.ts packages/opencode/test/preload.ts
git commit -m "feat(auth): add openagentic isAuthenticated helper and gate message"
```

---

### Task X2: `oa-cli auth login`/`logout` → direct OpenAgentic flow; delete multi-provider picker

**Files:**
- Modify (rewrite): `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/providers.ts` (deletes `handlePluginAuth` :39-210, `resolvePluginProviders` :212-237, well-known `[url]` login :325-352, provider picker :354-489, logout picker :491-534)
- Delete: `/Users/mac/Project/oa-cli/packages/opencode/test/cli/plugin-auth-picker.test.ts` (tests `resolvePluginProviders`, which is removed; it is the only importer of that export outside `providers.ts`)
- Test: `/Users/mac/Project/oa-cli/packages/opencode/test/cli/help/help-snapshots.test.ts` (snapshot regeneration — the suite snapshots `providers`, `providers list`, `providers login`, `providers logout` at lines 51, 76-78)

**Interfaces:**
- Consumes: `OpenagenticAuth.login(opts?: { onUrl?: (url: string) => void }): Promise<{ key: string; user: { email: string; name: string; plan: string } }>` and `OpenagenticAuth.logout(): Promise<void>` from `packages/opencode/src/auth/openagentic.ts` (OAuth-login area task — must land first); `Auth.Service`; `Prompt` (`src/cli/effect/prompt.ts`: `intro`/`outro`/`log.*`/`spinner()` returning `{ start, stop }` Effects); `CliError`/`effectCmd` (`src/cli/effect-cmd.ts`).
- Produces: `ProvidersCommand` (alias `auth`, unchanged export name, still registered at `src/index.ts:89`; `src/index.ts:6` is its only importer), `ProvidersListCommand` (unchanged behavior), `ProvidersLoginCommand` (`login`, no positional/options), `ProvidersLogoutCommand` (`logout`, no positional).

- [ ] **Step 1: Rewrite providers.ts**

Replace the entire content of `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/providers.ts` with:

```ts
import { Auth } from "../../auth"
import { OpenagenticAuth } from "../../auth/openagentic"
import { cmd } from "./cmd"
import { CliError, effectCmd } from "../effect-cmd"
import { UI } from "../ui"
import * as Prompt from "../effect/prompt"
import { ModelsDev } from "@opencode-ai/core/models-dev"

import path from "path"
import os from "os"
import { Global } from "@opencode-ai/core/global"
import { errorMessage } from "@/util/error"
import { Effect } from "effect"

export const ProvidersCommand = cmd({
  command: "providers",
  aliases: ["auth"],
  describe: "manage your OpenAgentic login",
  builder: (yargs) =>
    yargs.command(ProvidersListCommand).command(ProvidersLoginCommand).command(ProvidersLogoutCommand).demandCommand(),
  async handler() {},
})

export const ProvidersListCommand = effectCmd({
  command: "list",
  aliases: ["ls"],
  describe: "list stored credentials",
  // Lists global credentials + provider env vars; no project instance needed.
  instance: false,
  handler: Effect.fn("Cli.providers.list")(function* (_args) {
    const authSvc = yield* Auth.Service
    const modelsDev = yield* ModelsDev.Service

    UI.empty()
    const authPath = path.join(Global.Path.data, "auth.json")
    const homedir = os.homedir()
    const displayPath = authPath.startsWith(homedir) ? authPath.replace(homedir, "~") : authPath
    yield* Prompt.intro(`Credentials ${UI.Style.TEXT_DIM}${displayPath}`)
    const results = Object.entries(yield* Effect.orDie(authSvc.all()))
    const database = yield* modelsDev.get()

    for (const [providerID, result] of results) {
      const name = database[providerID]?.name || providerID
      yield* Prompt.log.info(`${name} ${UI.Style.TEXT_DIM}${result.type}`)
    }

    yield* Prompt.outro(`${results.length} credentials`)

    const activeEnvVars: Array<{ provider: string; envVar: string }> = []

    for (const [providerID, provider] of Object.entries(database)) {
      for (const envVar of provider.env) {
        if (process.env[envVar]) {
          activeEnvVars.push({
            provider: provider.name || providerID,
            envVar,
          })
        }
      }
    }

    if (activeEnvVars.length > 0) {
      UI.empty()
      yield* Prompt.intro("Environment")

      for (const { provider, envVar } of activeEnvVars) {
        yield* Prompt.log.info(`${provider} ${UI.Style.TEXT_DIM}${envVar}`)
      }

      yield* Prompt.outro(`${activeEnvVars.length} environment variable` + (activeEnvVars.length === 1 ? "" : "s"))
    }
  }),
})

export const ProvidersLoginCommand = effectCmd({
  command: "login",
  describe: "log in with your OpenAgentic account",
  // Pure global-credential operation; no project instance needed.
  instance: false,
  handler: Effect.fn("Cli.providers.login")(function* () {
    UI.empty()
    yield* Prompt.intro("Login ke OpenAgentic")
    const spinner = Prompt.spinner()
    yield* spinner.start("Membuka browser untuk login...")
    const result = yield* Effect.tryPromise({
      try: () =>
        OpenagenticAuth.login({
          onUrl: (url) => {
            UI.println("")
            UI.println("Browser tidak terbuka otomatis. Buka URL ini secara manual:")
            UI.println(url)
          },
        }),
      catch: (error) => new CliError({ message: "Login gagal: " + errorMessage(error) }),
    }).pipe(Effect.tapError(() => spinner.stop("Login gagal", 1)))
    yield* spinner.stop(`Login berhasil sebagai ${result.user.email} (plan: ${result.user.plan})`)
    yield* Prompt.outro("Selesai")
  }),
})

export const ProvidersLogoutCommand = effectCmd({
  command: "logout",
  describe: "log out from OpenAgentic",
  // Removes the global auth credential; no project instance needed.
  instance: false,
  handler: Effect.fn("Cli.providers.logout")(function* () {
    const authSvc = yield* Auth.Service
    UI.empty()
    const existing = yield* Effect.orDie(authSvc.get(OpenagenticAuth.PROVIDER_ID))
    if (!existing) {
      yield* Prompt.log.info("Belum ada sesi login.")
      return
    }
    yield* Effect.tryPromise({
      try: () => OpenagenticAuth.logout(),
      catch: (error) => new CliError({ message: "Logout gagal: " + errorMessage(error) }),
    })
    yield* Prompt.log.success("Logout berhasil")
  }),
})
```

- [ ] **Step 2: Delete the picker test**
```
rm /Users/mac/Project/oa-cli/packages/opencode/test/cli/plugin-auth-picker.test.ts
```

- [ ] **Step 3: Verify the dead code is really dead**
```
cd /Users/mac/Project/oa-cli/packages/opencode && grep -rn "handlePluginAuth\|resolvePluginProviders" src test --include="*.ts"
```
Expected: no output (grep exits 1).
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```
Expected: exit 0. (If it fails on `OpenagenticAuth.login` missing, the OAuth-login area task has not landed yet — it is a prerequisite.)

- [ ] **Step 4: Regenerate help snapshots**

The `providers`/`list`/`login`/`logout` help text changed, which the CLI-surface snapshot test guards:
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/cli/help --timeout 60000 --update-snapshots
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/cli/help --timeout 60000
```
Expected: second run all pass, 0 fail. Inspect the diff of `test/cli/help/__snapshots__/help-snapshots.test.ts.snap`: the `providers login` entry must show no `[url]` positional and no `-p/--provider`/`-m/--method` options; `providers logout` no `[provider]` positional.

- [ ] **Step 5: Commit**
```
git add packages/opencode/src/cli/cmd/providers.ts packages/opencode/test/cli/plugin-auth-picker.test.ts packages/opencode/test/cli/help/__snapshots__
git commit -m "feat(cli): point auth login/logout at OpenAgentic and drop provider picker"
```

---

### Task X3: Remove the 10 internal OAuth provider plugins

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/plugin/index.ts` (imports :12-22, :33; `experimentalWebSocketsEnabled` :60-62; `internalPlugins` :64-82; load loop :166-175)
- Delete: `/Users/mac/Project/oa-cli/packages/opencode/src/plugin/openai/` (codex.ts, ws.ts, ws-pool.ts, README.md), `src/plugin/github-copilot/` (copilot.ts, models.ts), `src/plugin/azure.ts`, `src/plugin/cloudflare.ts`, `src/plugin/digitalocean.ts`, `src/plugin/snowflake-cortex.ts`, `src/plugin/xai.ts`
- Delete tests: `/Users/mac/Project/oa-cli/packages/opencode/test/plugin/codex.test.ts`, `openai-ws.test.ts`, `openai-rollout.test.ts`, `github-copilot-models.test.ts`, `cloudflare.test.ts`, `snowflake-cortex.test.ts`, `xai.test.ts`, AND `/Users/mac/Project/oa-cli/packages/opencode/test/provider/digitalocean.test.ts` (see note below)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/package.json` (drop `opencode-gitlab-auth`, `opencode-poe-auth`, and `@gitlab/opencode-gitlab-auth` dependencies)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Plugin.Service` unchanged (`trigger`/`list`/`init`), but `list()` now returns only externally-configured plugin hooks — no built-in OAuth auth methods. `experimentalWebSocketsEnabled` export is removed (only consumers were the Codex plugin wiring + `test/plugin/openai-rollout.test.ts`).

Pre-verified (imports): outside `src/plugin/`, nothing in `src`/`test` imports the deleted modules except the deleted `test/plugin/*` files, and `opencode-gitlab-auth`/`opencode-poe-auth` are imported only from `src/plugin/index.ts`; `@gitlab/opencode-gitlab-auth` is not imported anywhere (`grep -rn "@gitlab/opencode-gitlab-auth" packages --include="*.ts"` → no hits).
Pre-verified (runtime): `test/provider/digitalocean.test.ts` does NOT import the plugin but DOES depend on it at runtime — its `router:*` model tests exercise the DigitalOcean plugin's `models()` hook (`src/plugin/digitalocean.ts:228`) loaded via `internalPlugins`, so it must be deleted with the plugin (the DigitalOcean provider itself is pruned by the provider-lock area anyway). The other provider tests survive: the cloudflare env autoload and openai `headerTimeout` defaults live in `src/provider/provider.ts` CUSTOM_LOADERS (`:208`, `:729`, `:767`), not in the plugins, and oauth credentials are handled generically at `src/provider/provider.ts:614`.

- [ ] **Step 1: Edit `src/plugin/index.ts`**

Remove these import lines:
```ts
import { CodexAuthPlugin } from "./openai/codex"
import { CopilotAuthPlugin } from "./github-copilot/copilot"
import { gitlabAuthPlugin as GitlabAuthPlugin } from "opencode-gitlab-auth"
import { PoeAuthPlugin } from "opencode-poe-auth"
import { CloudflareAIGatewayAuthPlugin, CloudflareWorkersAuthPlugin } from "./cloudflare"
import { AzureAuthPlugin } from "./azure"
import { DigitalOceanAuthPlugin } from "./digitalocean"
import { XaiAuthPlugin } from "./xai"
import { SnowflakeCortexAuthPlugin } from "./snowflake-cortex"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
```

Remove the whole `experimentalWebSocketsEnabled` function:
```ts
export function experimentalWebSocketsEnabled(input: { enabled: boolean; channel?: string }) {
  return input.enabled || ["local", "dev", "beta"].includes(input.channel ?? InstallationChannel)
}
```

Remove the whole `internalPlugins` function (comment `// Built-in plugins that are directly imported (not installed from npm)` through the closing `}` at :82).

Remove the internal-plugin load loop inside the state initializer:
```ts
        for (const plugin of flags.disableDefaultPlugins ? [] : internalPlugins(flags)) {
          const init = yield* Effect.tryPromise({
            try: () => plugin(input),
            catch: errorMessage,
          }).pipe(
            Effect.tapError((error) => Effect.logError("failed to load internal plugin", { name: plugin.name, error })),
            Effect.option,
          )
          if (init._tag === "Some") hooks.push(init.value)
        }
```
(`flags` remains used just below via `flags.pure` at :177; keep the `RuntimeFlags` import — `RuntimeFlags.Service` at :128 and `RuntimeFlags.node` at :311 still need it. Keep the `PluginInstance` type import — it is still used by `isServerPlugin` (:84) and `getLegacyPlugins` (:97). Keep `errorMessage` — still used in the external-plugin loader error reporting.)

- [ ] **Step 2: Delete the plugin modules and their tests**
```
cd /Users/mac/Project/oa-cli/packages/opencode
rm -r src/plugin/openai src/plugin/github-copilot
rm src/plugin/azure.ts src/plugin/cloudflare.ts src/plugin/digitalocean.ts src/plugin/snowflake-cortex.ts src/plugin/xai.ts
rm test/plugin/codex.test.ts test/plugin/openai-ws.test.ts test/plugin/openai-rollout.test.ts \
   test/plugin/github-copilot-models.test.ts test/plugin/cloudflare.test.ts \
   test/plugin/snowflake-cortex.test.ts test/plugin/xai.test.ts
rm test/provider/digitalocean.test.ts
```
(`test/provider/digitalocean.test.ts` goes too: its router-surfacing assertions depend on the deleted DigitalOcean plugin's `models()` hook being loaded as an internal plugin — see pre-verified note above.)

- [ ] **Step 3: Drop the now-unused npm plugin dependencies**

In `/Users/mac/Project/oa-cli/packages/opencode/package.json` `dependencies`, delete these three lines (at :82, :135, :136):
```json
    "@gitlab/opencode-gitlab-auth": "1.3.3",
```
```json
    "opencode-gitlab-auth": "2.1.0",
    "opencode-poe-auth": "0.0.1",
```
Then:
```
cd /Users/mac/Project/oa-cli && bun install
```
Expected: lockfile updated, no errors. (Do NOT touch `gitlab-ai-provider` — `src/provider/provider.ts`/`src/session/llm.ts` still import it; the provider-lock area owns that pruning.)

- [ ] **Step 4: Verify nothing references the removed code**
```
cd /Users/mac/Project/oa-cli/packages/opencode && grep -rn "CodexAuthPlugin\|CopilotAuthPlugin\|GitlabAuthPlugin\|PoeAuthPlugin\|CloudflareWorkersAuthPlugin\|CloudflareAIGatewayAuthPlugin\|AzureAuthPlugin\|DigitalOceanAuthPlugin\|SnowflakeCortexAuthPlugin\|XaiAuthPlugin\|experimentalWebSocketsEnabled\|internalPlugins" src test --include="*.ts"
```
Expected: no output (grep exits 1).
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck && bun test test/plugin --timeout 60000 && bun test test/provider --timeout 120000
```
Expected: typecheck exit 0; remaining plugin tests (auth-override, install, install-concurrency, loader-shared, meta, shared, trigger, workspace-adapter) all pass; remaining provider tests (amazon-bedrock, cf-ai-gateway-e2e, gitlab-duo, header-timeout, model-status, provider, transform) all pass.

- [ ] **Step 5: Commit**
```
git add -A packages/opencode/src/plugin packages/opencode/test/plugin packages/opencode/test/provider packages/opencode/package.json bun.lock
git commit -m "refactor(plugin): remove built-in multi-provider OAuth plugins"
```

---

### Task X4: Gate non-interactive `run` and headless `serve` behind OpenAgentic login

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/run.ts` (import at :22; handler entry :263-264)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/serve.ts` (whole file is 24 lines)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/test/lib/cli-process.ts` (`isolatedEnv` :62-79 — subprocess harness used by ALL run/serve/acp/tui/smoke process tests)
- No change to `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/tui.ts`: the TUI gets a login route instead of a hard gate (TUI area), reusing `OpenagenticAuth.isAuthenticated()` from Task X1.

**Interfaces:**
- Consumes: `OpenagenticAuth.isAuthenticatedEffect()` + `NOT_LOGGED_IN_MESSAGE` (Task X1); `fail` from `src/cli/effect-cmd.ts:18` (raises `CliError`, which `FormatError` in `src/cli/error.ts` prints via `UI.error` as `Error: <message>` and maps to `process.exitCode = 1`, honoring the instance-dispose finalizer in `effectCmd` — unlike a raw `process.exit`).
- Produces: `oa-cli run ...` and `oa-cli serve` exit 1 with `Error: Belum login. Jalankan \`oa-cli\` dulu untuk login.` when neither `OPENAGENTIC_API_KEY` nor a stored `openagentic` credential exists. `run --attach <url>` is exempt (the remote server holds the credentials). The gate also covers `--mini` (which routes through `RunCommand.handler` via `runMini` at `run.ts:977-979`).

- [ ] **Step 1: Gate run.ts**

In `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/run.ts`, change the import line (:22)
```ts
import { effectCmd } from "../effect-cmd"
```
to
```ts
import { effectCmd, fail } from "../effect-cmd"
import { OpenagenticAuth } from "@/auth/openagentic"
```
and change the handler opening (:263-264)
```ts
  handler: Effect.fn("Cli.run")(function* (args) {
    const { Agent } = yield* Effect.promise(() => import("@/agent/agent"))
```
to
```ts
  handler: Effect.fn("Cli.run")(function* (args) {
    // Auth gate: non-interactive use requires an OpenAgentic credential
    // (auth.json key "openagentic") or the OPENAGENTIC_API_KEY escape hatch.
    // --attach talks to a remote server that owns its own credentials.
    if (!args.attach) {
      const authed = yield* OpenagenticAuth.isAuthenticatedEffect()
      if (!authed) return yield* fail(OpenagenticAuth.NOT_LOGGED_IN_MESSAGE)
    }
    const { Agent } = yield* Effect.promise(() => import("@/agent/agent"))
```

- [ ] **Step 2: Gate serve.ts (headless server hits the provider on every request)**

Replace the content of `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/serve.ts` with:

```ts
import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"
import { OpenagenticAuth } from "@/auth/openagentic"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless OA-cli server",
  // Server loads instances per-request via x-opencode-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false,
  handler: Effect.fn("Cli.serve")(function* (args) {
    const authed = yield* OpenagenticAuth.isAuthenticatedEffect()
    if (!authed) return yield* fail(OpenagenticAuth.NOT_LOGGED_IN_MESSAGE)
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    if (!Flag.OPENCODE_SERVER_PASSWORD) {
      console.log("Warning: OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))
    console.log(`OA-cli server listening on http://${server.hostname}:${server.port}`)

    yield* Effect.never
  }),
})
```
(The subprocess harness ready-regex is `/listening on (http:\/\/([^\s:]+):(\d+))/` at `test/lib/cli-process.ts:349` — prefix change is safe.)

- [ ] **Step 3: Keep the subprocess test harness authenticated**

In `/Users/mac/Project/oa-cli/packages/opencode/test/lib/cli-process.ts`, inside `isolatedEnv`, add one entry after `OPENCODE_AUTH_CONTENT: "{}",` (:76):
```ts
    // Satisfies the OpenAgentic auth gate in run/serve without touching auth.json.
    OPENAGENTIC_API_KEY: "oa-test-key",
```

- [ ] **Step 4: Manual gate verification (negative + attach exemption)**
```
cd /Users/mac/Project/oa-cli/packages/opencode && env -u OPENAGENTIC_API_KEY OPENCODE_AUTH_CONTENT='{}' bun run --conditions=browser ./src/index.ts run "halo"; echo "exit=$?"
```
Expected output ends with:
```
Error: Belum login. Jalankan `oa-cli` dulu untuk login.
exit=1
```
Same for serve:
```
cd /Users/mac/Project/oa-cli/packages/opencode && env -u OPENAGENTIC_API_KEY OPENCODE_AUTH_CONTENT='{}' bun run --conditions=browser ./src/index.ts serve; echo "exit=$?"
```
Expected: same message, `exit=1`, and it does NOT stay running.

- [ ] **Step 5: Regression — subprocess suites still pass with the env key**
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/cli/run/run-process.test.ts test/cli/serve/serve-process.test.ts test/cli/smokes --timeout 120000
```
Expected: all pass, 0 fail. Then:
```
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/cli/help --timeout 60000 --update-snapshots && bun test test/cli/help --timeout 60000
```
(the `serve` describe string changed) — expected: all pass. Finally `bun run typecheck` — exit 0.

- [ ] **Step 6: Commit**
```
git add packages/opencode/src/cli/cmd/run.ts packages/opencode/src/cli/cmd/serve.ts packages/opencode/test/lib/cli-process.ts packages/opencode/test/cli/help/__snapshots__
git commit -m "feat(cli): require OpenAgentic login for non-interactive run and serve"
```
---

## Area P — Provider loader `openagentic` + trim SDK

Goal: the runtime provider system serves ONLY the `openagentic` provider (`https://openagentic.id/api/v1`, OpenAI-compatible) with live model discovery from `GET /api/v1/models`, disk-cached for offline fallback, and a server-controlled default model. All other bundled provider SDKs are removed from `packages/opencode`.

Context files (read before executing): `docs/superpowers/specs/2026-07-18-oa-cli-rebrand-design.md` §5, `packages/opencode/src/provider/provider.ts`, `packages/opencode/src/session/llm.ts`, `packages/opencode/test/provider/provider.test.ts`.

Note on ordering/dependencies: the `openagentic` catalog entry in `packages/core/src/models-dev.ts` is owned by the catalog-lock section. Everything in this area works before that lands (the integration tests inject `openagentic` via config, which creates a catalog entry through the config-extension path at `provider.ts:1420`), but the loader only activates in production once the catalog entry exists.

### Task P1: Trim BUNDLED_PROVIDERS to `@ai-sdk/openai-compatible` and delete SDK-bound custom loaders

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/provider/provider.ts` (BUNDLED_PROVIDERS ~:107-134; `selectBedrockMantleLanguageModel` ~:162-166; custom loaders `amazon-bedrock` ~:294-455, `google-vertex` ~:498-549, `google-vertex-anthropic` ~:550-569, `gitlab` ~:604-728, `cloudflare-ai-gateway` ~:767-842)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/test/provider/provider.test.ts` (delete tests that exercise the deleted loaders)
- Delete: `/Users/mac/Project/oa-cli/packages/opencode/test/provider/amazon-bedrock.test.ts`, `/Users/mac/Project/oa-cli/packages/opencode/test/provider/cf-ai-gateway-e2e.test.ts`, `/Users/mac/Project/oa-cli/packages/opencode/test/provider/gitlab-duo.test.ts`

**Interfaces:**
- Consumes: existing `BundledSDK` type, `custom(dep)` loader table.
- Produces: `BUNDLED_PROVIDERS` with a single entry `"@ai-sdk/openai-compatible"`. `custom(dep)` keeps only loaders with no static/dynamic references to removed npm packages (`anthropic`, `opencode`, `openai`, `meta`, `xai`, `github-copilot`, `azure`, `azure-cognitive-services`, `llmgateway`, `openrouter`, `nvidia`, `vercel`, `sap-ai-core`, `zenmux`, `cloudflare-workers-ai`, `cerebras`, `kilo`, `snowflake-cortex` stay for now — they are inert once the catalog is locked and carry no imports).

- [ ] **Step 1: Replace the BUNDLED_PROVIDERS map.** In `provider.ts`, replace the whole map (currently lines 107–134, from `const BUNDLED_PROVIDERS: Record<string, () => Promise<(opts: any) => BundledSDK>> = {` down to its closing `}`) with:
```ts
const BUNDLED_PROVIDERS: Record<string, () => Promise<(opts: any) => BundledSDK>> = {
  "@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then((m) => m.createOpenAICompatible),
}
```

- [ ] **Step 2: Delete the orphaned bedrock helper.** Delete this entire function (~:162-166):
```ts
function selectBedrockMantleLanguageModel(sdk: BundledSDK, modelID: string) {
  if (modelID === "openai.gpt-oss-safeguard-20b" || modelID === "openai.gpt-oss-safeguard-120b")
    return sdk.chat?.(modelID) ?? sdk.languageModel(modelID)
  return sdk.responses?.(modelID) ?? sdk.languageModel(modelID)
}
```
Keep `selectAzureLanguageModel` (still referenced by the `azure` and `azure-cognitive-services` loaders) and keep `googleVertexAnthropicBaseURL` (still referenced by `resolveSDK` ~:1678).

- [ ] **Step 3: Delete the five custom loaders that import removed packages.** Inside `custom(dep)`, delete each whole entry (each starts at the quoted line and ends at the `}),` immediately before the next loader key):
  - `"amazon-bedrock": Effect.fnUntraced(function* () {` … ends just before `llmgateway: () =>` (imports `@aws-sdk/credential-providers`)
  - `"google-vertex": Effect.fnUntraced(function* (provider: Info) {` … ends just before `"google-vertex-anthropic":` (imports `google-auth-library`)
  - `"google-vertex-anthropic": Effect.fnUntraced(function* () {` … ends just before `"sap-ai-core":` (depends on removed `@ai-sdk/google-vertex/anthropic` bundle)
  - `gitlab: Effect.fnUntraced(function* (input: Info) {` … ends just before `"cloudflare-workers-ai":` (imports `gitlab-ai-provider`)
  - `"cloudflare-ai-gateway": Effect.fnUntraced(function* (input: Info) {` … ends just before `cerebras: () =>` (imports `ai-gateway-provider`)

  Leave the gitlab-specific discovery block at ~:1592-1604 in place for now — it still compiles (`discoveryLoaders` is just empty) and Task P6 replaces it. The `case "gitlab-ai-provider":` / `case "ai-gateway-provider":` labels in `src/provider/transform.ts` are switch labels on npm-name strings, not imports — they stay (dead branches once the catalog is locked).

- [ ] **Step 4: Prune tests that exercised the deleted loaders.** In `test/provider/provider.test.ts` delete these whole test blocks (each is a single `it.instance(...)` call):
  - `"getSmallModel prefers Gemini for Google Vertex"` (~:712)
  - `"Google Vertex: uses REP endpoint for Claude continental multi-regions"` (~:1822)
  - `"Google Vertex Anthropic: uses REP endpoint for continental multi-regions"` (~:1838)
  - `"Google Vertex: keeps regional Claude endpoints unchanged"` (~:1854)
  - `"cloudflare-ai-gateway loads with env variables"` (~:1870)
  - `"cloudflare-ai-gateway forwards config metadata options"` (~:1881)

  Keep `"Google Vertex: retains baseURL for custom proxy"` (~:1766) and `"Google Vertex: supports OpenAI compatible models"` (~:1794) — they use config-declared providers (`vertex-proxy`, `vertex-openai`) loaded via the env path, list-only, no loader needed. Then in the test `"getModel returns model for valid provider/model"` (~:300) delete the two lines that would trigger a runtime npm install of the now-unbundled `@ai-sdk/anthropic`:
```ts
    const language = yield* provider.getLanguage(model)
    expect(language).toBeDefined()
```

- [ ] **Step 5: Delete the dead SDK-bound test files.** These must go NOW, not later: `amazon-bedrock.test.ts` calls `Provider.use.getLanguage` on bedrock models, which after Steps 1–3 falls into the runtime `Npm.add` install path and fails; `cf-ai-gateway-e2e.test.ts` exercises the deleted `cloudflare-ai-gateway` chain; `gitlab-duo.test.ts` is already fully commented out (`export {}`).
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
rm test/provider/amazon-bedrock.test.ts test/provider/cf-ai-gateway-e2e.test.ts test/provider/gitlab-duo.test.ts
```

- [ ] **Step 6: Verify.**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
grep -n 'import("' src/provider/provider.ts
```
Expected output: exactly one match — the `@ai-sdk/openai-compatible` line in BUNDLED_PROVIDERS. (`resolveSDK`'s `import(importSpec)` has no literal quote and does not match.)
```bash
bun run typecheck
```
Expected: exit 0, no errors (`tsgo --noEmit`; `noUnusedLocals` is off in `@tsconfig/bun`, so no unused-symbol failures).
```bash
bun test test/provider/
```
Expected: all remaining tests pass (provider, transform, digitalocean, header-timeout, model-status), 0 fail.

- [ ] **Step 7: Commit.**
```bash
git add packages/opencode/src/provider/provider.ts packages/opencode/test/provider
git commit -m "refactor(provider): trim bundled SDKs to @ai-sdk/openai-compatible"
```

### Task P2: Remove the GitLab workflow path from session/llm.ts

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/session/llm.ts` (import :13; imports :21-23; `isWorkflow` :105-113; workflow block :115-206)

**Interfaces:**
- Consumes: `LLMRequestPrep.prepare` (`src/session/llm/request.ts:35` — keeps its `isWorkflow: boolean` field; we pass `false`).
- Produces: no import of `gitlab-ai-provider` anywhere in `packages/opencode/src`.

- [ ] **Step 1: Remove imports.** Delete these four lines from the import header:
```ts
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
```
```ts
import { EventV2 } from "@opencode-ai/core/event"
import { Wildcard } from "@/util/wildcard"
import { SessionID } from "@/session/schema"
```
(All three of the latter are used only inside the workflow block deleted below. `EventV2Bridge`, `Permission`, `PermissionV1` imports stay — still used at :41, :69-70, :80-81, :397-398. Leave the `const perm = yield* Permission.Service` / `const events = yield* EventV2Bridge.Service` acquisitions at :80-81 untouched; `noUnusedLocals` is off, so unused locals do not fail typecheck.)

- [ ] **Step 2: Hardcode `isWorkflow: false`.** Replace:
```ts
      const isWorkflow = language instanceof GitLabWorkflowLanguageModel
      const prepared = yield* LLMRequestPrep.prepare({
        ...input,
        provider: item,
        auth: info,
        plugin,
        flags,
        isWorkflow,
      })
```
with:
```ts
      const prepared = yield* LLMRequestPrep.prepare({
        ...input,
        provider: item,
        auth: info,
        plugin,
        flags,
        isWorkflow: false,
      })
```

- [ ] **Step 3: Delete the workflow wiring block.** Delete the comment:
```ts
      // Wire up toolExecutor for DWS workflow models so that tool calls
      // from the workflow service are executed via opencode's tool system
      // and results sent back over the WebSocket.
```
…but KEEP the line `const bridge = yield* EffectBridge.make()` (it is used later at ~:282 `bridge.fork(...)`). Then delete the entire `if (language instanceof GitLabWorkflowLanguageModel) { … }` statement — it starts right after the `bridge` line and its closing brace is the `      }` directly above `const tracer = cfg.experimental?.openTelemetry`. The end of the deleted region looks like:
```ts
          } finally {
            if (unsub) await bridge.promise(unsub)
          }
        })
      }
```

- [ ] **Step 4: Verify.**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
grep -rn 'from "gitlab-ai-provider"\|import("gitlab-ai-provider")\|GitLabWorkflow' src/
```
Expected: no output. (Do NOT grep for the bare string `gitlab-ai-provider` — `src/provider/transform.ts:1701` and `:1758` keep `case "gitlab-ai-provider":` switch labels, which are npm-name strings, not imports.)
```bash
bun run typecheck
```
Expected: exit 0.

- [ ] **Step 5: Commit.**
```bash
git add packages/opencode/src/session/llm.ts
git commit -m "refactor(session): drop GitLab workflow model support"
```

### Task P3: package.json dependency cleanup

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/package.json` (dependencies block, ~:58-147)

**Interfaces:** none (build-metadata only). Keep `"@ai-sdk/provider"` (type-only imports in `provider.ts:12`, `transform.ts:3`, `tool/tool.ts:4`, `tool/registry.ts:22`, `tool/json-schema.ts:1`, `session/prompt.ts:14`), keep `"@ai-sdk/openai-compatible"`, keep `"ai"`. Do NOT touch `@gitlab/opencode-gitlab-auth`, `opencode-gitlab-auth`, `opencode-poe-auth` — those are imported by the plugin surface and are removed by the plugin-trim section.

- [ ] **Step 1: Remove the dependencies.** In `packages/opencode/package.json` `"dependencies"`, delete exactly these 23 entries (leave everything else, including `"@ai-sdk/openai-compatible"`, `"@ai-sdk/provider"`, and `"ai"`):
```
"@ai-sdk/alibaba", "@ai-sdk/amazon-bedrock", "@ai-sdk/anthropic", "@ai-sdk/azure",
"@ai-sdk/cerebras", "@ai-sdk/cohere", "@ai-sdk/deepinfra", "@ai-sdk/gateway",
"@ai-sdk/google", "@ai-sdk/google-vertex", "@ai-sdk/groq", "@ai-sdk/mistral",
"@ai-sdk/openai", "@ai-sdk/perplexity", "@ai-sdk/togetherai", "@ai-sdk/vercel",
"@ai-sdk/xai", "@openrouter/ai-sdk-provider", "@aws-sdk/credential-providers",
"ai-gateway-provider", "gitlab-ai-provider", "google-auth-library", "venice-ai-sdk-provider"
```

- [ ] **Step 2: Verify no import site survives.** Grep for import forms only — `transform.ts` keeps `case "@openrouter/ai-sdk-provider":` / `case "ai-gateway-provider":` / `case "gitlab-ai-provider":` / `case "venice-ai-sdk-provider":` switch labels on npm-name strings, which must NOT count as hits:
```bash
cd /Users/mac/Project/oa-cli
grep -rn 'from "@ai-sdk/\|import("@ai-sdk/\|from "gitlab-ai-provider"\|from "venice-ai-sdk-provider"\|from "ai-gateway-provider\|from "@openrouter/ai-sdk-provider"\|from "@aws-sdk/credential-providers"\|from "google-auth-library"\|import("gitlab-ai-provider")\|import("google-auth-library")\|import("@aws-sdk/credential-providers")\|import("ai-gateway-provider' packages/opencode/src packages/opencode/test
```
Expected output: exactly 7 lines —
```
packages/opencode/src/provider/provider.ts:12:import { type LanguageModelV3 } from "@ai-sdk/provider"
packages/opencode/src/provider/provider.ts:<n>:  "@ai-sdk/openai-compatible": () => import("@ai-sdk/openai-compatible").then((m) => m.createOpenAICompatible),
packages/opencode/src/provider/transform.ts:3:import type { JSONSchema7 } from "@ai-sdk/provider"
packages/opencode/src/tool/json-schema.ts:1:import type { JSONSchema7 } from "@ai-sdk/provider"
packages/opencode/src/tool/tool.ts:4:import type { JSONSchema7 } from "@ai-sdk/provider"
packages/opencode/src/tool/registry.ts:22:import type { JSONSchema7, JSONSchema7Definition } from "@ai-sdk/provider"
packages/opencode/src/session/prompt.ts:14:import type { JSONSchema7 } from "@ai-sdk/provider"
```
Any other hit means a missed cleanup — fix before continuing.

- [ ] **Step 3: Reinstall + typecheck + test.**
```bash
cd /Users/mac/Project/oa-cli && bun install
cd packages/opencode && bun run typecheck && bun test test/provider/
```
Expected: `bun install` rewrites the lockfile (`bun.lock`); typecheck exit 0; all tests in `test/provider/` pass.

- [ ] **Step 4: Commit.**
```bash
git add packages/opencode/package.json bun.lock
git commit -m "chore(deps): remove unused provider SDK dependencies from opencode package"
```

### Task P4: Rebrand outbound headers (6 Referer sites + brand strings)

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/provider/provider.ts` (post-P1 the sites live in the `llmgateway`, `openrouter`, `nvidia`, `vercel`, `zenmux`, `cerebras`, `kilo`, `cloudflare-workers-ai`, `snowflake-cortex` loaders; anchor by content, not line number)

**Interfaces:** none — header/string literals only.

- [ ] **Step 1: Apply nine content-anchored edits** (each `old_string` is unique because it includes the loader key or a distinctive header):

1. `llmgateway`:
```ts
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
            "X-Source": "opencode",
          },
```
→
```ts
          headers: {
            "HTTP-Referer": "https://openagentic.id/",
            "X-Title": "OA-cli",
            "X-Source": "OA-cli",
          },
```
2. `openrouter` (include the key line for uniqueness):
```ts
    openrouter: () =>
      Effect.succeed({
        autoload: false,
        options: {
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
          },
        },
      }),
```
→ same block with `"HTTP-Referer": "https://openagentic.id/",` and `"X-Title": "OA-cli",`.
3. `nvidia`:
```ts
          headers: {
            "HTTP-Referer": "https://opencode.ai/",
            "X-Title": "opencode",
            "X-BILLING-INVOKE-ORIGIN": "OpenCode",
          },
```
→
```ts
          headers: {
            "HTTP-Referer": "https://openagentic.id/",
            "X-Title": "OA-cli",
            "X-BILLING-INVOKE-ORIGIN": "OA-cli",
          },
```
4. `vercel` (lowercase variant):
```ts
          headers: {
            "http-referer": "https://opencode.ai/",
            "x-title": "opencode",
          },
```
→
```ts
          headers: {
            "http-referer": "https://openagentic.id/",
            "x-title": "OA-cli",
          },
```
5. `zenmux` (include `    zenmux: () =>` key line, same shape as openrouter) → `https://openagentic.id/` / `OA-cli`.
6. `kilo` (include `    kilo: () =>` key line, same shape) → `https://openagentic.id/` / `OA-cli`.
7. `cerebras`:
```ts
            "X-Cerebras-3rd-Party-Integration": "opencode",
```
→
```ts
            "X-Cerebras-3rd-Party-Integration": "OA-cli",
```
8. `cloudflare-workers-ai` User-Agent:
```ts
            "User-Agent": `opencode/${InstallationVersion} cloudflare-workers-ai (${os.platform()} ${os.release()}; ${os.arch()})`,
```
→
```ts
            "User-Agent": `oa-cli/${InstallationVersion} cloudflare-workers-ai (${os.platform()} ${os.release()}; ${os.arch()})`,
```
9. `snowflake-cortex` user-visible error string:
```ts
              `Snowflake Cortex: missing credentials (${missing}). Provide a bearer token (OAuth, JWT, or PAT) via env var, opencode auth, or provider options.`,
```
→
```ts
              `Snowflake Cortex: missing credentials (${missing}). Provide a bearer token (OAuth, JWT, or PAT) via env var, oa-cli auth, or provider options.`,
```

- [ ] **Step 2: Verify.**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
grep -n "opencode.ai/\|opencode auth" src/provider/provider.ts
```
Expected: no output.
```bash
grep -c "openagentic.id/" src/provider/provider.ts
```
Expected: `6` (the six Referer sites; the API base URL literal lives in `openagentic-models.ts` created in P5 — P6 imports it, so provider.ts never gains a seventh).
```bash
bun run typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit.**
```bash
git add packages/opencode/src/provider/provider.ts
git commit -m "chore(provider): rebrand outbound headers to OA-cli/openagentic.id"
```

### Task P5: openagentic models mapper + offline disk cache (TDD)

**Files:**
- Create: `/Users/mac/Project/oa-cli/packages/opencode/src/provider/openagentic-models.ts`
- Test: `/Users/mac/Project/oa-cli/packages/opencode/test/provider/openagentic-models.test.ts`

**Interfaces:**
- Consumes: `Model` type from `@/provider/provider` (type-only, no runtime cycle — `transform.ts` imports provider types only, same pattern), `Global.Path.cache`, `ProviderTransform.variants`, `ModelV2.ID` / `ProviderV2.ID` brands, `optional` schema helper.
- Produces (namespace `OpenagenticModels`):
  - `apiBase(): string` — `(process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id") + "/api/v1"`, resolusi call-time
  - `fromResponse(input: unknown): { models: Record<string, Model>; defaultModelID: string | undefined }`
  - `fetchModels(input: { apiKey?: string; baseURL?: string; cache?: string }): Promise<{ models: Record<string, Model>; defaultModelID: string | undefined }>`
  - `cacheFile(): string` → `path.join(Global.Path.cache, "openagentic-models.json")`

- [ ] **Step 1: Write the failing test.** Create `test/provider/openagentic-models.test.ts`:
```ts
import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { OpenagenticModels } from "@/provider/openagentic-models"

const fixture = {
  data: [
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      provider: "anthropic",
      context_limit: 200000,
      default: true,
    },
    { id: "gpt-5-codex", provider: "openai" },
  ],
}

describe("OpenagenticModels.fromResponse", () => {
  test("maps the API response into internal models", () => {
    const { models, defaultModelID } = OpenagenticModels.fromResponse(fixture)
    expect(Object.keys(models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])

    const sonnet = models["claude-sonnet-4-5"]
    expect(sonnet.name).toBe("Claude Sonnet 4.5")
    expect(String(sonnet.providerID)).toBe("openagentic")
    expect(sonnet.family).toBe("anthropic")
    expect(sonnet.api).toEqual({
      id: "claude-sonnet-4-5",
      url: "https://openagentic.id/api/v1",
      npm: "@ai-sdk/openai-compatible",
    })
    expect(sonnet.limit.context).toBe(200000)
    expect(sonnet.options.default).toBe(true)
    expect(defaultModelID).toBe("claude-sonnet-4-5")

    const codex = models["gpt-5-codex"]
    expect(codex.name).toBe("gpt-5-codex") // name falls back to id
    expect(codex.limit.context).toBe(128000) // context_limit fallback
    expect(codex.options.default).toBeUndefined()
  })

  test("falls back to the first model when the server flags none as default", () => {
    const { models, defaultModelID } = OpenagenticModels.fromResponse({ data: [{ id: "a" }, { id: "b" }] })
    expect(defaultModelID).toBe("a")
    expect(models["a"].options.default).toBe(true)
    expect(models["b"].options.default).toBeUndefined()
  })

  test("returns empty on malformed responses", () => {
    expect(OpenagenticModels.fromResponse({ nope: true }).models).toEqual({})
    expect(OpenagenticModels.fromResponse("garbage").models).toEqual({})
  })
})

describe("OpenagenticModels.fetchModels", () => {
  test("fetches live models with the API key and writes the cache file", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const cache = path.join(dir, "openagentic-models.json")
    let seenAuth: string | null = null
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        seenAuth = req.headers.get("authorization")
        if (new URL(req.url).pathname === "/api/v1/models") return Response.json(fixture)
        return new Response("not found", { status: 404 })
      },
    })
    try {
      const result = await OpenagenticModels.fetchModels({
        apiKey: "test-key",
        baseURL: `http://127.0.0.1:${server.port}/api/v1`,
        cache,
      })
      expect(seenAuth).toBe("Bearer test-key")
      expect(Object.keys(result.models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])
      expect(result.defaultModelID).toBe("claude-sonnet-4-5")
      expect(JSON.parse(await readFile(cache, "utf8"))).toEqual(fixture)
    } finally {
      server.stop(true)
    }
  })

  test("serves cached models when the API is unreachable", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const cache = path.join(dir, "openagentic-models.json")
    await writeFile(cache, JSON.stringify(fixture))
    const result = await OpenagenticModels.fetchModels({
      apiKey: "test-key",
      baseURL: "http://127.0.0.1:9", // nothing listens here
      cache,
    })
    expect(Object.keys(result.models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])
    expect(result.defaultModelID).toBe("claude-sonnet-4-5")
  })

  test("serves cached models when the API returns garbage", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const cache = path.join(dir, "openagentic-models.json")
    await writeFile(cache, JSON.stringify(fixture))
    const server = Bun.serve({
      port: 0,
      fetch: () => Response.json({ nope: true }),
    })
    try {
      const result = await OpenagenticModels.fetchModels({
        baseURL: `http://127.0.0.1:${server.port}/api/v1`,
        cache,
      })
      expect(Object.keys(result.models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])
    } finally {
      server.stop(true)
    }
  })

  test("returns an empty result when the API fails and the cache is empty", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oa-models-"))
    const result = await OpenagenticModels.fetchModels({
      baseURL: "http://127.0.0.1:9",
      cache: path.join(dir, "missing.json"),
    })
    expect(result.models).toEqual({})
    expect(result.defaultModelID).toBeUndefined()
  })
})
```
Run it and watch it fail (module does not exist yet):
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
bun test test/provider/openagentic-models.test.ts
```
Expected: failure resolving `@/provider/openagentic-models`.

- [ ] **Step 2: Implement the module.** Create `src/provider/openagentic-models.ts`:
```ts
import path from "path"
import { mkdir, readFile, writeFile } from "fs/promises"
import { Option, Schema } from "effect"
import { Global } from "@opencode-ai/core/global"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { optional } from "@opencode-ai/core/schema"
import { ProviderTransform } from "./transform"
import type { Model } from "./provider"

export const PROVIDER_ID = "openagentic"
export function apiBase(): string {
  return (process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id") + "/api/v1"
}

const DEFAULT_CONTEXT_LIMIT = 128_000
const DEFAULT_OUTPUT_LIMIT = 32_768
const FETCH_TIMEOUT_MS = 10_000

export const ApiModel = Schema.Struct({
  id: Schema.String,
  name: optional(Schema.String),
  provider: optional(Schema.String),
  context_limit: optional(Schema.Finite),
  default: optional(Schema.Boolean),
})
export type ApiModel = Schema.Schema.Type<typeof ApiModel>

export const ModelsResponse = Schema.Struct({
  data: Schema.Array(ApiModel),
})
export type ModelsResponse = Schema.Schema.Type<typeof ModelsResponse>

const decode = Schema.decodeUnknownOption(ModelsResponse)

export function cacheFile() {
  return path.join(Global.Path.cache, "openagentic-models.json")
}

export function fromResponse(input: unknown): {
  models: Record<string, Model>
  defaultModelID: string | undefined
} {
  const decoded = decode(input)
  if (Option.isNone(decoded)) return { models: {}, defaultModelID: undefined }
  const data = decoded.value.data
  const defaultModelID = (data.find((item) => item.default === true) ?? data[0])?.id
  const models: Record<string, Model> = {}
  for (const item of data) {
    const model: Model = {
      id: ModelV2.ID.make(item.id),
      providerID: ProviderV2.ID.make(PROVIDER_ID),
      name: item.name ?? item.id,
      family: item.provider ?? "",
      api: {
        id: item.id,
        url: apiBase(),
        npm: "@ai-sdk/openai-compatible",
      },
      status: "active",
      headers: {},
      options: item.id === defaultModelID ? { default: true } : {},
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: {
        context: item.context_limit ?? DEFAULT_CONTEXT_LIMIT,
        output: DEFAULT_OUTPUT_LIMIT,
      },
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolcall: true,
        input: { text: true, audio: false, image: true, video: false, pdf: true },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
        interleaved: false,
      },
      release_date: "",
      variants: {},
    }
    model.variants = ProviderTransform.variants(model)
    models[item.id] = model
  }
  return { models, defaultModelID }
}

export async function fetchModels(input: {
  apiKey?: string
  baseURL?: string
  cache?: string
}): Promise<{ models: Record<string, Model>; defaultModelID: string | undefined }> {
  const base = (input.baseURL ?? apiBase()).replace(/\/+$/, "")
  const file = input.cache ?? cacheFile()
  try {
    const res = await fetch(`${base}/models`, {
      headers: {
        Accept: "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`GET ${base}/models failed: ${res.status}`)
    const json = await res.json()
    const result = fromResponse(json)
    // A 200 that decodes to zero models is treated as a failure so a stale
    // disk cache still serves — never let a bad response wipe the model list.
    if (Object.keys(result.models).length === 0) throw new Error(`GET ${base}/models returned no models`)
    await mkdir(path.dirname(file), { recursive: true }).catch(() => {})
    await writeFile(file, JSON.stringify(json)).catch(() => {})
    return result
  } catch {
    const cached = await readFile(file, "utf8")
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => undefined)
    if (cached === undefined) return { models: {}, defaultModelID: undefined }
    return fromResponse(cached)
  }
}

export * as OpenagenticModels from "./openagentic-models"
```
(The trailing self re-export mirrors `provider.ts:2006` (`export * as Provider from "./provider"`). `ProviderTransform` is a value import but `transform.ts` imports `provider.ts` type-only (`import type * as Provider from "./provider"`), so there is no runtime cycle. `import { Option, Schema } from "effect"` + `Schema.decodeUnknownOption` is the exact idiom of `src/config/tui-migrate.ts:4,13`.)

- [ ] **Step 3: Run the tests.**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
bun test test/provider/openagentic-models.test.ts
```
Expected: `7 pass, 0 fail`.
```bash
bun run typecheck
```
Expected: exit 0.

- [ ] **Step 4: Commit.**
```bash
git add packages/opencode/src/provider/openagentic-models.ts packages/opencode/test/provider/openagentic-models.test.ts
git commit -m "feat(provider): add openagentic models mapper with offline cache"
```

### Task P6: Wire the `openagentic` custom loader and generalize model discovery

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/provider/provider.ts` (imports ~:28; `custom(dep)` — insert after the `opencode` case; gitlab discovery block ~:1592-1604, directly above the `for (const [id, provider] of Object.entries(providers))` cleanup loop)
- Test: `/Users/mac/Project/oa-cli/packages/opencode/test/provider/provider.test.ts` (append integration test)

**Interfaces:**
- Consumes: `OpenagenticModels.fetchModels`, `dep.env()` (`OPENAGENTIC_API_KEY` escape hatch), `dep.auth("openagentic")` (Auth key `"openagentic"`, `{ type: "api", key }` written by `OpenagenticAuth.login()` from the auth section).
- Produces: a `CustomLoader` for id `"openagentic"` returning `{ autoload: true, options: { baseURL: "https://openagentic.id/api/v1" }, discoverModels }`; a generic discovery loop that runs every registered `discoverModels()` (replacing the gitlab-only block).

- [ ] **Step 1: Write the failing integration test.** In `test/provider/provider.test.ts`, change the first line's `bun:test` import from `import { afterEach, expect, test } from "bun:test"` to `import { afterAll, afterEach, expect, test } from "bun:test"`, then append at the end of the file:
```ts
// --- openagentic live discovery -------------------------------------------

// The server deliberately flags gpt-5-codex as default: the id-sort heuristic
// in sort() would pick claude-sonnet-4-5 ("claude-sonnet-4" sits later in the
// priority list and the comparator is desc), so the flag is observable.
const openagenticFixture = {
  data: [
    {
      id: "claude-sonnet-4-5",
      name: "Claude Sonnet 4.5",
      provider: "anthropic",
      context_limit: 200000,
    },
    { id: "gpt-5-codex", name: "GPT-5 Codex", provider: "openai", default: true },
  ],
}

const openagenticServer = Bun.serve({
  port: 0,
  fetch(req) {
    if (new URL(req.url).pathname === "/models") return Response.json(openagenticFixture)
    return new Response("not found", { status: 404 })
  },
})
afterAll(() => {
  openagenticServer.stop(true)
})

const openagenticConfig = () => ({
  provider: {
    openagentic: {
      name: "OpenAgentic",
      npm: "@ai-sdk/openai-compatible",
      options: {
        apiKey: "test-key",
        baseURL: `http://127.0.0.1:${openagenticServer.port}`,
      },
    },
  },
})

it.instance(
  "openagentic discovers models from the live models endpoint",
  Effect.gen(function* () {
    const providers = yield* list
    const openagentic = providers[ProviderV2.ID.make("openagentic")]
    expect(openagentic).toBeDefined()
    expect(Object.keys(openagentic.models).sort()).toEqual(["claude-sonnet-4-5", "gpt-5-codex"])
    expect(openagentic.models["gpt-5-codex"].options.default).toBe(true)
    expect(openagentic.models["claude-sonnet-4-5"].api.npm).toBe("@ai-sdk/openai-compatible")
  }),
  { config: openagenticConfig },
)
```
(`it.instance` accepts a `config` thunk — `InstanceOptions.config` is `Partial<ConfigV1.Info> | (() => Partial<ConfigV1.Info>)` in `test/lib/effect.ts:15`; the thunk defers reading `openagenticServer.port`.)

Run and watch it fail (no loader yet, so no discovered models — the provider is deleted by the empty-models cleanup):
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
bun test test/provider/provider.test.ts -t "openagentic discovers"
```
Expected: 1 fail (`openagentic` undefined).

- [ ] **Step 2: Import the module in provider.ts.** After `import { ProviderTransform } from "./transform"` add:
```ts
import { OpenagenticModels } from "./openagentic-models"
```

- [ ] **Step 3: Add the `openagentic` case to `custom(dep)`.** Insert directly after the closing `}),` of the `opencode: Effect.fnUntraced(...)` case (before `openai: () =>`):
```ts
    openagentic: Effect.fnUntraced(function* (input: Info) {
      const env = yield* dep.env()
      const auth = yield* dep.auth(input.id)
      const apiKey = env["OPENAGENTIC_API_KEY"] ?? (auth?.type === "api" ? auth.key : undefined)
      const baseURL =
        typeof input.options?.baseURL === "string" && input.options.baseURL !== ""
          ? input.options.baseURL
          : OpenagenticModels.apiBase()
      return {
        autoload: true,
        options: {
          baseURL: OpenagenticModels.apiBase(),
        },
        async discoverModels(): Promise<Record<string, Model>> {
          const result = await OpenagenticModels.fetchModels({ apiKey, baseURL })
          return result.models
        },
      }
    }),
```
(`baseURL` honors a config override for discovery — used by the test and any future proxy setup; a config `options.baseURL` also wins for chat because the config re-apply loop at ~:1583 merges config options over loader options last. The chat-completions key itself flows through the existing `provider.key` / `options.apiKey` machinery in `resolveSDK` (~:1715), no change needed there. The disk cache defaults to `Global.Path.cache/openagentic-models.json` inside `fetchModels`.)

- [ ] **Step 4: Generalize the discovery block.** Replace the gitlab-only block:
```ts
        const gitlab = ProviderV2.ID.make("gitlab")
        if (discoveryLoaders[gitlab] && providers[gitlab] && isProviderAllowed(gitlab)) {
          yield* Effect.promise(async () => {
            try {
              const discovered = await discoveryLoaders[gitlab]()
              for (const [modelID, model] of Object.entries(discovered)) {
                if (!providers[gitlab].models[modelID]) {
                  providers[gitlab].models[modelID] = model
                }
              }
            } catch (e) {}
          })
        }
```
with:
```ts
        for (const [id, discover] of Object.entries(discoveryLoaders)) {
          const providerID = ProviderV2.ID.make(id)
          if (!providers[providerID] || !isProviderAllowed(providerID)) continue
          yield* Effect.promise(async () => {
            try {
              const discovered = await discover()
              for (const [modelID, model] of Object.entries(discovered)) {
                if (!providers[providerID].models[modelID]) {
                  providers[providerID].models[modelID] = model
                }
              }
            } catch (e) {}
          })
        }
```
(This runs before the empty-models cleanup loop, so a catalog `openagentic` entry with zero static models survives once discovery — live or cached — returns models; with no network AND an empty cache the provider is dropped and the caller sees `NoProvidersError`, which the TUI section renders as the retry screen per spec §8.)

- [ ] **Step 5: Run tests.**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
bun test test/provider/provider.test.ts
```
Expected: all pass, including `"openagentic discovers models from the live models endpoint"`.
```bash
bun run typecheck
```
Expected: exit 0.

- [ ] **Step 6: Commit.**
```bash
git add packages/opencode/src/provider/provider.ts packages/opencode/test/provider/provider.test.ts
git commit -m "feat(provider): wire openagentic provider with live model discovery"
```

### Task P7: Default model resolves to the server-flagged default (TDD)

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/provider/provider.ts` (`defaultModelIDs` ~:1090; `defaultModel` ~:1942-1975)
- Test: `/Users/mac/Project/oa-cli/packages/opencode/test/provider/default-model.test.ts` (create), `/Users/mac/Project/oa-cli/packages/opencode/test/provider/provider.test.ts` (append one integration test)

**Interfaces:**
- Consumes: `Model.options["default"] === true` flag set by `OpenagenticModels.fromResponse` (exactly one model carries it).
- Produces: `defaultModelIDs` and `defaultModel()` prefer the flagged model; the user's recent-model preference (`Global.Path.state/model.json`) and explicit `cfg.model` still win — the flag only replaces the heuristic `sort(...)` fallback. Config-schema/HTTP handlers (`server/routes/instance/httpapi/handlers/config.ts:28`, `.../provider.ts:56`) consume `defaultModelIDs` unchanged.

- [ ] **Step 1: Write the failing unit test.** Create `test/provider/default-model.test.ts`:
```ts
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
```
Run and watch the first test fail (current implementation ignores the flag and picks `zzz-model` by sort order):
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
bun test test/provider/default-model.test.ts
```
Expected: `1 pass, 1 fail`.

- [ ] **Step 2: Patch `defaultModelIDs`.** Replace:
```ts
export function defaultModelIDs<T extends { models: Record<string, { id: string }> }>(providers: Record<string, T>) {
  return mapValues(providers, (item) => sort(Object.values(item.models))[0].id)
}
```
with:
```ts
export function defaultModelIDs<
  T extends { models: Record<string, { id: string; options?: Record<string, unknown> }> },
>(providers: Record<string, T>) {
  return mapValues(providers, (item) => {
    const flagged = Object.values(item.models).find((model) => model.options?.["default"] === true)
    return flagged?.id ?? sort(Object.values(item.models))[0].id
  })
}
```

- [ ] **Step 3: Patch `defaultModel()`.** In the `defaultModel` Effect (after the `recent` loop, in the fallback section), replace:
```ts
      const configured = Object.keys(cfg.provider ?? {})
      const provider = Object.values(s.providers).find((p) => configured.length === 0 || configured.includes(p.id))
      if (!provider) return yield* new NoProvidersError()
      const [model] = sort(Object.values(provider.models))
```
with:
```ts
      const configured = Object.keys(cfg.provider ?? {})
      const provider = Object.values(s.providers).find((p) => configured.length === 0 || configured.includes(p.id))
      if (!provider) return yield* new NoProvidersError()
      const flagged = Object.values(provider.models).find((m) => m.options?.["default"] === true)
      if (flagged) return { providerID: provider.id, modelID: flagged.id }
      const [model] = sort(Object.values(provider.models))
```
(`cfg.model` and the recent-model preference above are checked first, so a user's choice still wins — the server flag only replaces the id-sort heuristic.)

- [ ] **Step 4: Add the integration test.** Append to `test/provider/provider.test.ts` (after the P6 test; reuses `openagenticConfig`). This is a real discriminator: without the flag, `sort()` returns `claude-sonnet-4-5` (its priority-list match `"claude-sonnet-4"` outranks `"gpt-5"` under the desc comparator — verified against `remeda.sortBy`), while the server flags `gpt-5-codex`:
```ts
it.instance(
  "defaultModel resolves openagentic's server-flagged default",
  Effect.gen(function* () {
    const def = yield* Provider.use.defaultModel()
    expect(String(def.providerID)).toBe("openagentic")
    expect(String(def.modelID)).toBe("gpt-5-codex")
  }),
  { config: openagenticConfig },
)
```

- [ ] **Step 5: Run all area tests.**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode
bun test test/provider/default-model.test.ts test/provider/openagentic-models.test.ts test/provider/provider.test.ts
bun run typecheck
```
Expected: all pass (`default-model` 2 pass; `openagentic-models` 7 pass; `provider.test.ts` fully green including both openagentic integration tests); typecheck exit 0.

- [ ] **Step 6: Commit.**
```bash
git add packages/opencode/src/provider/provider.ts packages/opencode/test/provider/default-model.test.ts packages/opencode/test/provider/provider.test.ts
git commit -m "feat(provider): resolve default model from server default flag"
```
---

## Area L — Layar login TUI + re-gate 401

### Task L1: Util deteksi error auth 401/invalid_key (TDD)

**Files:**
- Create: `/Users/mac/Project/oa-cli/packages/tui/src/util/auth-error.ts`
- Test: `/Users/mac/Project/oa-cli/packages/tui/test/util/auth-error.test.ts`

**Interfaces:**
- Consumes: bentuk error `session.error` dari server — objek `{ name: string; data: unknown }` hasil `NamedError.toObject()` (lihat `packages/core/src/util/error.ts:5` dan `packages/core/src/v1/session.ts:49-62`: `ProviderAuthError`, `APIError` dengan `data.statusCode`/`data.responseBody`).
- Produces: `isAuthFailure(error: unknown): boolean` — dipakai Task L5 untuk re-gate.

- [ ] **Step 1: Tulis failing test**

Buat `/Users/mac/Project/oa-cli/packages/tui/test/util/auth-error.test.ts`:

```ts
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
```

Jalankan (harus GAGAL — module belum ada):
```bash
cd /Users/mac/Project/oa-cli/packages/tui && bun test test/util/auth-error.test.ts
```
Expected: `error: Cannot find module '../../src/util/auth-error'` — suite gagal karena module belum ada.

- [ ] **Step 2: Implementasi**

Buat `/Users/mac/Project/oa-cli/packages/tui/src/util/auth-error.ts`:

```ts
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
```

Jalankan:
```bash
cd /Users/mac/Project/oa-cli/packages/tui && bun test test/util/auth-error.test.ts
```
Expected: ` 4 pass, 0 fail`.

- [ ] **Step 3: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add packages/tui/src/util/auth-error.ts packages/tui/test/util/auth-error.test.ts && git commit -m "feat(tui): add auth failure detection for 401/invalid_key re-gate"
```

---

### Task L2: Worker RPC `authStatus` + `authLogin`

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/cli/tui/worker.ts` (objek `rpc`, saat ini baris 30-78)

**Interfaces:**
- Consumes: `OpenagenticAuth.login(opts?: { onUrl?: (url: string) => void }): Promise<{ key: string; user: { email: string; name: string; plan: string } }>` dari `packages/opencode/src/auth/openagentic.ts` (sudah ada — hanya mengekspor `login`/`logout` + helper PKCE, TIDAK ada `isAuthenticated`); `Auth.Service.get("openagentic")` (`packages/opencode/src/auth/index.ts:44`, Effect-based) dijalankan lewat `AppRuntime.runPromise` — `AppRuntime` dan `Effect` sudah diimport worker (baris 10-11), `AppLayer` menyediakan `Auth.node` (`packages/opencode/src/effect/app-runtime.ts:63`). Juga `Rpc.emit` (`@/util/rpc`, sudah diimport baris 3) untuk streaming URL fallback ke TUI.
- Produces: RPC `authStatus(): Promise<{ authenticated: boolean }>` dan `authLogin(): Promise<AuthLoginResult>` di mana `AuthLoginResult = { ok: true; user: { email: string; name: string; plan: string } } | { ok: false; error: string }`, plus event RPC `"auth.login.url"` dengan payload `{ url: string }`. PENTING: kedua RPC TIDAK BOLEH throw — `Rpc.listen` (`packages/opencode/src/util/rpc.ts:5-13`) tidak punya error path, method yang throw membuat promise client menggantung selamanya.

- [ ] **Step 1: Tambah import + RPC**

Di `/Users/mac/Project/oa-cli/packages/opencode/src/cli/tui/worker.ts`, tambah dua import (setelah baris 12, `import { disposeAllInstancesAndEmitGlobalDisposed } ...`):

```ts
import { Auth } from "@/auth"
import { OpenagenticAuth } from "@/auth/openagentic"
```

Lalu di dalam `export const rpc = { ... }`, tambahkan dua method setelah method `reload` (sebelum `async shutdown()`):

```ts
  async authStatus(): Promise<{ authenticated: boolean }> {
    if (process.env["OPENAGENTIC_API_KEY"]) return { authenticated: true }
    const authenticated = await AppRuntime.runPromise(
      Effect.gen(function* () {
        const auth = yield* Auth.Service
        return (yield* auth.get("openagentic")) !== undefined
      }),
    ).catch(() => false)
    return { authenticated }
  },
  async authLogin(): Promise<
    { ok: true; user: { email: string; name: string; plan: string } } | { ok: false; error: string }
  > {
    try {
      const result = await OpenagenticAuth.login({
        onUrl: (url) => Rpc.emit("auth.login.url", { url }),
      })
      // Key baru tersimpan di auth.json — reload config + dispose instances supaya
      // provider loader membaca key baru saat request berikutnya.
      await rpc.reload().catch(() => {})
      return { ok: true, user: result.user }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
```

- [ ] **Step 2: Typecheck**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```
Expected: exit 0, tanpa output error.

- [ ] **Step 3: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add packages/opencode/src/cli/tui/worker.ts && git commit -m "feat(opencode): add authStatus/authLogin worker RPCs for TUI login gate"
```

---

### Task L3: Context auth di TUI + plumbing transport dari CLI

**Files:**
- Create: `/Users/mac/Project/oa-cli/packages/tui/src/context/auth.tsx`
- Modify: `/Users/mac/Project/oa-cli/packages/tui/src/app.tsx` (type `TuiInput` baris 142-152; provider tree baris 317-322)
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/tui.ts` (input `run({...})` baris 274-296)

**Interfaces:**
- Consumes: RPC client `client.call("authStatus"|"authLogin", undefined)` + `client.on("auth.login.url", ...)` (Task L2); `createSimpleContext` (`packages/tui/src/context/helper.tsx`).
- Produces: `useAuth(): { state: () => "loading" | "unauthenticated" | "authenticated"; login(onUrl): Promise<AuthLoginResult>; invalidate(): void }`; field baru `TuiInput.auth?: TuiAuth`. Catatan: `tui.ts` TIDAK perlu import type `TuiAuth` — field `auth` di-typecheck struktural lewat `TuiInput` yang sudah diimpor `layer.ts` dari `@opencode-ai/tui` (root export), jadi tidak perlu entri exports baru di `packages/tui/package.json`.

- [ ] **Step 1: Buat context**

Buat `/Users/mac/Project/oa-cli/packages/tui/src/context/auth.tsx`:

```tsx
import { createSignal, onMount } from "solid-js"
import { createSimpleContext } from "./helper"

export type AuthUser = { email: string; name: string; plan: string }

export type AuthLoginResult = { ok: true; user?: AuthUser } | { ok: false; error: string }

export type TuiAuth = {
  status(): Promise<{ authenticated: boolean }>
  login(onUrl: (url: string) => void): Promise<AuthLoginResult>
}

export type AuthState = "loading" | "unauthenticated" | "authenticated"

export const { use: useAuth, provider: AuthProvider } = createSimpleContext({
  name: "Auth",
  init: (props: { auth?: TuiAuth }) => {
    // Tanpa transport auth (mis. test) gate dinonaktifkan.
    const [state, setState] = createSignal<AuthState>(props.auth ? "loading" : "authenticated")

    onMount(() => {
      if (!props.auth) return
      props.auth
        .status()
        .then((result) => setState(result.authenticated ? "authenticated" : "unauthenticated"))
        .catch(() => setState("unauthenticated"))
    })

    return {
      state,
      async login(onUrl: (url: string) => void): Promise<AuthLoginResult> {
        if (!props.auth) return { ok: true }
        const result = await props.auth.login(onUrl)
        if (result.ok) setState("authenticated")
        return result
      },
      invalidate() {
        setState("unauthenticated")
      },
    }
  },
})
```

- [ ] **Step 2: TuiInput + provider tree di app.tsx**

Di `/Users/mac/Project/oa-cli/packages/tui/src/app.tsx`, tambah import (dekat import context lain, mis. setelah baris 40 `import { LocalProvider, useLocal } from "./context/local"`):

```ts
import { AuthProvider, useAuth, type TuiAuth } from "./context/auth"
```

Ubah `TuiInput` (baris 142-152) — tambah satu field:

```ts
export type TuiInput = {
  url: string
  args: Args
  config: TuiConfig.Resolved
  onSnapshot?: () => Promise<string[]>
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
  events?: EventSource
  pluginHost: TuiPluginHost
  auth?: TuiAuth
}
```

Ubah provider tree (baris 317-322), bungkus `<App/>` dengan `AuthProvider`:

```tsx
                                                                  <LocationProvider>
                                                                    <AuthProvider auth={input.auth}>
                                                                      <App
                                                                        onSnapshot={input.onSnapshot}
                                                                        pluginHost={input.pluginHost}
                                                                      />
                                                                    </AuthProvider>
                                                                  </LocationProvider>
```

(`useAuth` baru dipakai Task L5 — aman diimport sekarang: base config `@tsconfig/bun` menyetel `noUnusedLocals: false`, jadi tsgo tidak protes import yang belum dipakai.)

- [ ] **Step 3: Wiring transport di tui.ts**

Di `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/tui.ts`, dalam pemanggilan `run({ ... })` (baris 274-296), tambah field `auth` setelah `events: transport.events,` (baris 286):

```ts
            events: transport.events,
            auth: {
              // async wrapper: Rpc.client.call mengembalikan Promise<ReturnType<method>>
              // (nested Promise untuk method async) — async arrow meng-collapse-nya
              // via Awaited sehingga cocok dengan TuiAuth.status.
              status: async () => client.call("authStatus", undefined),
              login: async (onUrl: (url: string) => void) => {
                const unsubscribe = client.on<{ url: string }>("auth.login.url", (data) => onUrl(data.url))
                try {
                  return await client.call("authLogin", undefined)
                } finally {
                  unsubscribe()
                }
              },
            },
```

- [ ] **Step 4: Typecheck kedua package**
```bash
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck && cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```
Expected: exit 0 keduanya, tanpa output error.

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add packages/tui/src/context/auth.tsx packages/tui/src/app.tsx packages/opencode/src/cli/cmd/tui.ts && git commit -m "feat(tui): add auth gate context and wire worker auth transport"
```

---

### Task L4: Route login `packages/tui/src/routes/login.tsx`

**Files:**
- Create: `/Users/mac/Project/oa-cli/packages/tui/src/routes/login.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task L3), `useTheme` (`../context/theme`), `useExit` (`../context/exit`, signature `(reason?: unknown) => void`), `useKeyboard` (`@opentui/solid` — pola sama seperti `component/error-component.tsx:60`), `Logo` (`../component/logo`), `Toast` (`../ui/toast`, absolute-positioned — HARUS dirender di sini karena Home/Session, satu-satunya mount `<Toast/>` lain, unmount saat gate aktif).
- Produces: komponen `Login()` — layar sesuai mock spec §4: logo, "Selamat datang di OA-cli!", "Login dengan akun openagentic.id untuk mulai.", `[ Enter ] Login dengan Google`, `[ Esc ] Keluar`; state busy "Membuka browser..." + URL fallback; error inline + hint retry. Saat login sukses, cukup return — gate di app.tsx (Task L5) otomatis swap ke Home/Session begitu `auth.state()` jadi `"authenticated"` (JANGAN `route.navigate({ type: "home" })` — itu meng-clobber initial route `--continue`/`--session`).

- [ ] **Step 1: Buat komponen**

Buat `/Users/mac/Project/oa-cli/packages/tui/src/routes/login.tsx`:

```tsx
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { Logo } from "../component/logo"
import { Toast } from "../ui/toast"
import { useTheme } from "../context/theme"
import { useExit } from "../context/exit"
import { useAuth } from "../context/auth"

export function Login() {
  const { theme } = useTheme()
  const exit = useExit()
  const auth = useAuth()

  const [busy, setBusy] = createSignal(false)
  const [url, setUrl] = createSignal<string | undefined>()
  const [error, setError] = createSignal<string | undefined>()

  const start = async () => {
    if (busy()) return
    setBusy(true)
    setError(undefined)
    setUrl(undefined)
    const result = await auth.login((value) => setUrl(value))
    setBusy(false)
    setUrl(undefined)
    // Sukses: auth.state() jadi "authenticated", gate di app.tsx unmount Login.
    if (!result.ok) setError(result.error)
  }

  useKeyboard((evt) => {
    if (evt.name === "return") {
      evt.preventDefault()
      evt.stopPropagation()
      void start()
      return
    }
    if (evt.name === "escape" || (evt.ctrl && evt.name === "c")) {
      evt.preventDefault()
      evt.stopPropagation()
      exit()
    }
  })

  return (
    <box flexGrow={1} alignItems="center" justifyContent="center" paddingLeft={2} paddingRight={2}>
      <box
        border
        borderStyle="rounded"
        borderColor={theme.primary}
        backgroundColor={theme.background}
        flexDirection="column"
        alignItems="center"
        paddingLeft={4}
        paddingRight={4}
        paddingTop={1}
        paddingBottom={1}
        gap={1}
      >
        <Logo />
        <box flexDirection="column" alignItems="center">
          <text attributes={TextAttributes.BOLD} fg={theme.text}>
            Selamat datang di OA-cli!
          </text>
          <text fg={theme.textMuted}>Login dengan akun openagentic.id untuk mulai.</text>
        </box>
        <Show
          when={!busy()}
          fallback={
            <box flexDirection="column" alignItems="center">
              <text fg={theme.textMuted}>Membuka browser...</text>
              <Show when={url()}>
                {(value) => (
                  <box flexDirection="column" alignItems="center">
                    <text fg={theme.textMuted}>Browser tidak terbuka? Buka URL ini:</text>
                    <text fg={theme.primary}>{value()}</text>
                  </box>
                )}
              </Show>
            </box>
          }
        >
          <box flexDirection="column">
            <box flexDirection="row" gap={1}>
              <text attributes={TextAttributes.BOLD} fg={theme.primary}>
                [ Enter ]
              </text>
              <text fg={theme.text}>Login dengan Google</text>
            </box>
            <box flexDirection="row" gap={1}>
              <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
                [ Esc   ]
              </text>
              <text fg={theme.textMuted}>Keluar</text>
            </box>
          </box>
        </Show>
        <Show when={error()}>
          {(message) => (
            <box flexDirection="column" alignItems="center">
              <text fg={theme.error}>{message()}</text>
              <text fg={theme.textMuted}>Tekan Enter untuk coba lagi.</text>
            </box>
          )}
        </Show>
      </box>
      <Toast />
    </box>
  )
}
```

- [ ] **Step 2: Typecheck**
```bash
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck
```
Expected: exit 0.

- [ ] **Step 3: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add packages/tui/src/routes/login.tsx && git commit -m "feat(tui): add login route with browser-open status and fallback URL"
```

---

### Task L5: Gate render di app.tsx + re-gate saat 401

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/tui/src/app.tsx` (hooks App — setelah baris 386 `const clipboard = useClipboard()`; handler `session.error` baris 1018-1029; route Switch baris 1110-1128)

**Interfaces:**
- Consumes: `useAuth()` (L3), `Login` (L4), `isAuthFailure` (L1).
- Produces: TUI merender `<Login/>` selama `state() === "unauthenticated"`, tidak merender apa pun selama `"loading"` (StartupLoading tetap tampil), dan kembali ke gate + toast `"Sesi berakhir — silakan login ulang"` saat `session.error` berisi 401/invalid_key.

- [ ] **Step 1: Import + hook**

Di `/Users/mac/Project/oa-cli/packages/tui/src/app.tsx` tambah import (setelah baris 55 `import { Session } from "./routes/session"`):

```ts
import { Login } from "./routes/login"
import { isAuthFailure } from "./util/auth-error"
```

(Import `useAuth` sudah ada dari Task L3 Step 2: `import { AuthProvider, useAuth, type TuiAuth } from "./context/auth"`.)

Dalam function `App` (setelah baris 386 `const clipboard = useClipboard()`):

```ts
  const auth = useAuth()
```

- [ ] **Step 2: Re-gate 401 di handler session.error**

Ganti handler existing (baris 1018-1029):

```tsx
  event.on("session.error", (evt, { workspace }) => {
    if (workspace !== project.workspace.current()) return
    const error = evt.properties.error
    if (error && typeof error === "object" && error.name === "MessageAbortedError") return
    if (isAuthFailure(error)) {
      auth.invalidate()
      toast.show({
        variant: "error",
        message: "Sesi berakhir — silakan login ulang",
        duration: 5000,
      })
      return
    }
    const message = errorMessage(error)

    toast.show({
      variant: "error",
      message,
      duration: 5000,
    })
  })
```

- [ ] **Step 3: Gate JSX**

Ganti blok existing baris 1110-1128:

```tsx
      <Show when={ready()}>
        <box flexGrow={1} minHeight={0} flexDirection="column">
          <Switch>
            <Match when={route.data.type === "home"}>
              <Home />
            </Match>
            <Match when={route.data.type === "session"}>
              <Show when={route.data.type === "session" ? route.data.sessionID : undefined} keyed>
                {(_) => <Session />}
              </Show>
            </Match>
          </Switch>
          {plugin()}
        </box>
        <box flexShrink={0}>
          <pluginRuntime.Slot name="app_bottom" />
        </box>
        <pluginRuntime.Slot name="app" />
      </Show>
```

dengan:

```tsx
      <Show when={ready()}>
        <Show when={auth.state() === "unauthenticated"}>
          <Login />
        </Show>
        <Show when={auth.state() === "authenticated"}>
          <box flexGrow={1} minHeight={0} flexDirection="column">
            <Switch>
              <Match when={route.data.type === "home"}>
                <Home />
              </Match>
              <Match when={route.data.type === "session"}>
                <Show when={route.data.type === "session" ? route.data.sessionID : undefined} keyed>
                  {(_) => <Session />}
                </Show>
              </Match>
            </Switch>
            {plugin()}
          </box>
          <box flexShrink={0}>
            <pluginRuntime.Slot name="app_bottom" />
          </box>
          <pluginRuntime.Slot name="app" />
        </Show>
      </Show>
```

- [ ] **Step 4: Typecheck + test suite TUI**
```bash
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck && bun run test
```
Expected: typecheck exit 0; `bun run test` (script: `bun test --timeout 30000 --only-failures`) exit 0 tanpa failure tercetak — suite existing (`test/app-lifecycle.test.tsx` dll., yang memanggil `run()` tanpa field `auth`) tetap lolos karena `TuiInput.auth` optional → context default `"authenticated"`.

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add packages/tui/src/app.tsx && git commit -m "feat(tui): gate app behind openagentic login and re-gate on 401"
```

---

### Task L6: Verifikasi — typecheck lintas package + smoke manual gate

**Files:**
- Test only (tanpa perubahan file).

**Interfaces:**
- Consumes: `bun dev` di `packages/opencode` (script: `bun run --conditions=browser ./src/index.ts`, menjalankan TUI + worker); env `OPENCODE_AUTH_CONTENT` (dibaca `Auth.all()` di `packages/opencode/src/auth/index.ts:59` — meng-override isi auth.json tanpa menyentuh file asli); env `OPENAGENTIC_API_KEY` (bypass gate, dicek `authStatus` di worker).

- [ ] **Step 1: Typecheck penuh**
```bash
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck && cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```
Expected: keduanya exit 0.

- [ ] **Step 2: Smoke — tanpa kredensial → layar login**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && OPENCODE_AUTH_CONTENT='{}' bun dev
```
Expected: TUI menampilkan box login: logo, "Selamat datang di OA-cli!", "Login dengan akun openagentic.id untuk mulai.", `[ Enter ] Login dengan Google`, `[ Esc   ] Keluar`. Tekan Enter → teks "Membuka browser..." muncul (dan browser membuka `https://openagentic.id/auth/cli?...`; jika backend belum live, error inline + "Tekan Enter untuk coba lagi." — itu perilaku benar). Tekan Esc → keluar bersih ke shell.

- [ ] **Step 3: Smoke — env key → langsung home**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && OPENCODE_AUTH_CONTENT='{}' OPENAGENTIC_API_KEY=sk-test-dummy bun dev
```
Expected: TUI langsung merender Home (logo + prompt), tanpa layar login. Keluar dengan Ctrl+C.

- [ ] **Step 4: Smoke — re-gate 401 (butuh backend/mock; opsional bila belum live)**
Jalankan dengan API key yang sudah di-revoke (atau mock server yang membalas `401 {"error":"invalid_key"}` pada chat completions), kirim satu prompt. Expected: TUI kembali ke layar login + toast "Sesi berakhir — silakan login ulang". Tidak ada crash/stack trace.
---

## Area T — Single oa-cli theme, wordmarks, window title

All paths relative to repo root `/Users/mac/Project/oa-cli`. Test/typecheck conventions verified against this repo: `packages/tui` and `packages/opencode` both define `"test": "bun test --timeout 30000 --only-failures"` and `"typecheck": "tsgo --noEmit"`; existing theme tests live at `packages/tui/test/theme.test.ts`. `packages/tui/tsconfig.json` sets `noUncheckedIndexedAccess: false`, so `DEFAULT_THEMES["oa-cli"]` indexes as `ThemeJson` without `!`.

### Task T1: Create the `oa-cli` theme asset and register it

**Files:**
- Create: `packages/tui/src/theme/assets/oa-cli.json`
- Modify: `packages/tui/src/theme/index.ts` (import block :2-34, `DEFAULT_THEMES` :130-164)
- Test: `packages/tui/test/theme.test.ts`

**Interfaces:**
- Consumes: `ThemeJson` type (`packages/tui/src/theme/index.ts:120-128`), `resolveTheme(theme: ThemeJson, mode: "dark" | "light"): Theme` (returns `RGBA` slots with `.r/.g/.b` float channels 0-1)
- Produces: `DEFAULT_THEMES["oa-cli"]: ThemeJson` (registry entry other tasks and `theme.tsx` depend on)

- [ ] **Step 1: Write failing test for the new theme.** In `packages/tui/test/theme.test.ts`, change line 4 from `import type { TerminalColors } from "@opentui/core"` to:

```ts
import type { RGBA, TerminalColors } from "@opentui/core"
```

(line 5 already imports `DEFAULT_THEMES` and `resolveTheme` from `../src/theme`). Then append at the end of the file — compare channels rather than any `toHex()` helper, since `.r/.g/.b` floats are the only RGBA accessors this repo relies on:

```ts
function channelHex(color: RGBA) {
  return (
    "#" +
    [color.r, color.g, color.b]
      .map((channel) =>
        Math.round(channel * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  )
}

test("oa-cli theme exists and resolves to the brand palette", () => {
  const theme = DEFAULT_THEMES["oa-cli"]
  expect(theme).toBeDefined()
  const resolved = resolveTheme(theme, "dark")
  expect(channelHex(resolved.primary)).toBe("#f97316")
  expect(channelHex(resolved.secondary)).toBe("#fb923c")
  expect(channelHex(resolved.accent)).toBe("#ff5600")
  expect(channelHex(resolved.background)).toBe("#0c0a09")
  expect(channelHex(resolved.backgroundPanel)).toBe("#1c1917")
  expect(channelHex(resolved.error)).toBe("#ef4444")
  expect(channelHex(resolved.success)).toBe("#10b981")
  expect(channelHex(resolved.warning)).toBe("#f59e0b")
  expect(channelHex(resolved.info)).toBe("#3b82f6")
})
```

Run: `cd /Users/mac/Project/oa-cli/packages/tui && bun test test/theme.test.ts`
Expected: the new test FAILS at `expect(theme).toBeDefined()` (`DEFAULT_THEMES["oa-cli"]` is undefined); the pre-existing tests pass.

- [ ] **Step 2: Create `packages/tui/src/theme/assets/oa-cli.json`** — same schema shape as `opencode.json` (defs + theme), but a single dark-brand palette (flat hex refs, no dark/light variants — `ColorValue` accepts plain refs/hex):

```json
{
  "$schema": "https://openagentic.id/theme.json",
  "defs": {
    "bg": "#0c0a09",
    "panel": "#1c1917",
    "element": "#292524",
    "borderLow": "#292524",
    "borderMid": "#44403c",
    "borderHi": "#57534e",
    "orange": "#f97316",
    "orangeSoft": "#fb923c",
    "orangeHot": "#ff5600",
    "white": "#ffffff",
    "muted": "#a8a29e",
    "mutedDark": "#78716c",
    "red": "#ef4444",
    "green": "#10b981",
    "yellow": "#f59e0b",
    "blue": "#3b82f6"
  },
  "theme": {
    "primary": "orange",
    "secondary": "orangeSoft",
    "accent": "orangeHot",
    "error": "red",
    "warning": "yellow",
    "success": "green",
    "info": "blue",
    "text": "white",
    "textMuted": "muted",
    "selectedListItemText": "bg",
    "background": "bg",
    "backgroundPanel": "panel",
    "backgroundElement": "element",
    "border": "borderMid",
    "borderActive": "borderHi",
    "borderSubtle": "borderLow",
    "diffAdded": "green",
    "diffRemoved": "red",
    "diffContext": "mutedDark",
    "diffHunkHeader": "mutedDark",
    "diffHighlightAdded": "#34d399",
    "diffHighlightRemoved": "#f87171",
    "diffAddedBg": "#132b21",
    "diffRemovedBg": "#2b1513",
    "diffContextBg": "panel",
    "diffLineNumber": "mutedDark",
    "diffAddedLineNumberBg": "#16382b",
    "diffRemovedLineNumberBg": "#381b18",
    "markdownText": "white",
    "markdownHeading": "orange",
    "markdownLink": "orangeSoft",
    "markdownLinkText": "blue",
    "markdownCode": "green",
    "markdownBlockQuote": "yellow",
    "markdownEmph": "yellow",
    "markdownStrong": "orangeSoft",
    "markdownHorizontalRule": "muted",
    "markdownListItem": "orange",
    "markdownListEnumeration": "blue",
    "markdownImage": "orange",
    "markdownImageText": "blue",
    "markdownCodeBlock": "white",
    "syntaxComment": "mutedDark",
    "syntaxKeyword": "orange",
    "syntaxFunction": "orangeSoft",
    "syntaxVariable": "white",
    "syntaxString": "green",
    "syntaxNumber": "yellow",
    "syntaxType": "blue",
    "syntaxOperator": "muted",
    "syntaxPunctuation": "white"
  }
}
```

This covers every required `ThemeColor` slot that `ThemeJson` demands (verified against the `Theme` type at `theme/index.ts:36-91`), plus optional `selectedListItemText` (dark text on the orange selection bar). `backgroundMenu` and `thinkingOpacity` are intentionally omitted (defaults in `resolveTheme`: `backgroundElement` and `0.6`).

- [ ] **Step 3: Register the theme.** In `packages/tui/src/theme/index.ts`, add after line 24 (`import opencode from "./assets/opencode.json" with { type: "json" }`):

```ts
import oaCli from "./assets/oa-cli.json" with { type: "json" }
```

and add to the `DEFAULT_THEMES` object (starts at line 130 pre-edit) after the `opencode,` entry:

```ts
  ["oa-cli"]: oaCli,
```

Run: `cd /Users/mac/Project/oa-cli/packages/tui && bun test test/theme.test.ts`
Expected: all tests pass, including the new `oa-cli theme exists and resolves to the brand palette`.

- [ ] **Step 4: Commit.**
```sh
cd /Users/mac/Project/oa-cli && git add packages/tui/src/theme/assets/oa-cli.json packages/tui/src/theme/index.ts packages/tui/test/theme.test.ts && git commit -m "feat(theme): add oa-cli brand theme asset"
```

### Task T2: Delete all other bundled themes; default everything to "oa-cli"

**Files:**
- Delete: all 33 pre-existing files in `packages/tui/src/theme/assets/` (everything except `oa-cli.json`)
- Modify: `packages/tui/src/theme/index.ts` (import block + `DEFAULT_THEMES`), `packages/tui/src/context/theme.tsx` (the seven `"opencode"` string sites: lines 96, 121, 122, 143, 162, 177, 266)
- Test: `packages/tui/test/theme.test.ts` (lines 11, 17, 18, 36, 41 reference `DEFAULT_THEMES.opencode`)

**Interfaces:**
- Produces: `DEFAULT_THEMES` containing exactly one entry `{ "oa-cli": ThemeJson }`; theme context default/fallback name `"oa-cli"`. Custom-theme discovery (`discoverThemes`, `theme.tsx:37-61`) and the `system` generated theme are intentionally untouched. (`packages/ui/src/theme/default-themes.ts` has its own unrelated `DEFAULT_THEMES` for desktop — do not touch.)

- [ ] **Step 1: Update the test file first** (it currently references the theme being deleted). In `packages/tui/test/theme.test.ts` replace every `DEFAULT_THEMES.opencode` (lines 11, 17, 18, 36, 41) with `DEFAULT_THEMES["oa-cli"]`. Run `cd /Users/mac/Project/oa-cli/packages/tui && bun test test/theme.test.ts` — still green (both themes exist right now).

- [ ] **Step 2: Delete the 33 old asset files:**
```sh
cd /Users/mac/Project/oa-cli/packages/tui/src/theme/assets && rm aura.json ayu.json carbonfox.json catppuccin-frappe.json catppuccin-macchiato.json catppuccin.json cobalt2.json cursor.json dracula.json everforest.json flexoki.json github.json gruvbox.json kanagawa.json lucent-orng.json material.json matrix.json mercury.json monokai.json nightowl.json nord.json one-dark.json opencode.json orng.json osaka-jade.json palenight.json rosepine.json solarized.json synthwave84.json tokyonight.json vercel.json vesper.json zenburn.json && ls
```
Expected output: `oa-cli.json` only.

- [ ] **Step 3: Rewrite the import block and registry** in `packages/tui/src/theme/index.ts`. Delete the 33 original `import <name> from "./assets/<name>.json" with { type: "json" }` lines (`aura` through `zenburn` — everything except line 1 and the `oa-cli` import added in T1), so the file now starts:

```ts
import { SyntaxStyle, RGBA, type TerminalColors } from "@opentui/core"
import oaCli from "./assets/oa-cli.json" with { type: "json" }
```

Then replace the whole `DEFAULT_THEMES` object literal (the `export const DEFAULT_THEMES: Record<string, ThemeJson> = { ... }` block, originally lines 130-164) with:

```ts
export const DEFAULT_THEMES: Record<string, ThemeJson> = {
  ["oa-cli"]: oaCli,
}
```

- [ ] **Step 4: Update defaults in `packages/tui/src/context/theme.tsx`** — seven sites, all `"opencode"` → `"oa-cli"`:
  - line 96: `active: "oa-cli",`
  - line 121: `const active = config.theme ?? kv.get("theme", "oa-cli")`
  - line 122: `draft.active = typeof active === "string" ? active : "oa-cli"`
  - line 143: `.catch(() => setStore("active", "oa-cli"))`
  - line 162: `if (store.active === "system") setStore("active", "oa-cli")`
  - line 177: `if (store.active === "system") setStore("active", "oa-cli")`
  - line 266: `return resolveTheme(store.themes["oa-cli"], store.mode)` (bracket access — the key is hyphenated)

(Note the fallback chain in the `values()` memo, lines 256-267: a user whose saved kv theme was e.g. `"gruvbox"` now silently falls through to `oa-cli` — desired behavior.)

- [ ] **Step 5: Verify.**
```sh
cd /Users/mac/Project/oa-cli/packages/tui && bun test test/theme.test.ts && bun run typecheck
```
Expected: tests pass; typecheck clean. `src/feature-plugins/home/tips-view.tsx:6` (`Object.keys(DEFAULT_THEMES).length`) still typechecks — it is just a count, now 1 (removed entirely in Task T3). Then:
```sh
grep -ri "catppuccin\|dracula\|gruvbox" /Users/mac/Project/oa-cli/packages/tui/src ; echo "exit=$?"
```
Expected: no matches, `exit=1` (verified: no references to deleted theme names exist outside `theme/index.ts` imports and the asset files themselves).

- [ ] **Step 6: Commit.**
```sh
cd /Users/mac/Project/oa-cli && git add -A packages/tui/src/theme packages/tui/src/context/theme.tsx packages/tui/test/theme.test.ts && git commit -m "refactor(theme): single oa-cli theme, drop 33 bundled themes"
```

### Task T3: Remove the theme picker (dialog, command, keybind, tip)

**Files:**
- Delete: `packages/tui/src/component/dialog-theme-list.tsx`
- Modify: `packages/tui/src/app.tsx` (line 47 import; line 123 `appBindingCommands` entry; lines 781-789 command entry), `packages/tui/src/config/keybind.ts` (lines 78, 286), `packages/tui/src/feature-plugins/home/tips-view.tsx` (lines 3, 6, 43, 133, 176)
- Test: `packages/opencode/test/config/tui.test.ts` (lines 444/448 use the `theme_list` keybind)

**Interfaces:**
- Consumes: nothing new. Produces: no `theme.switch` command, no `theme_list` keybind. `theme.switch_mode` and `theme.mode.lock` (dark/light engine) are KEPT per spec ("theme engine dipertahankan").

Reference sites for the picker (verified by grep — this is the complete list):
```
packages/tui/src/app.tsx:47                          import { DialogThemeList } ...
packages/tui/src/app.tsx:123                         "theme.switch", inside the appBindingCommands array
                                                     (gathered at app.tsx:968 via tuiConfig.keybinds.gather("app", appBindingCommands))
packages/tui/src/app.tsx:786                         dialog.replace(() => <DialogThemeList />)   (inside the theme.switch command, lines 781-789)
packages/tui/src/component/dialog-theme-list.tsx:6   the component itself (imported only by app.tsx)
packages/tui/src/config/keybind.ts:78                theme_list: keybind("<leader>t", ...)
packages/tui/src/config/keybind.ts:286               theme_list: "theme.switch"
packages/tui/src/feature-plugins/home/tips-view.tsx:43,133,176   themeList shortcut + "/themes" tip
packages/opencode/test/config/tui.test.ts:444,448    keybind-merge test uses theme_list
packages/sdk/js/src/gen/types.gen.ts:788             generated SDK type (optional field; regenerated in the SDK/codegen task, leave as-is here)
```

- [ ] **Step 1: Update the keybind-merge test first** so it no longer depends on `theme_list`. In `packages/opencode/test/config/tui.test.ts` (test "merges keybind overrides across precedence layers"), change line 444:

```ts
      yield* fs.writeJson(path.join(test.directory, "tui.json"), { keybinds: { session_compact: "ctrl+k" } })
```
and line 448:
```ts
      expect(config.keybinds.get("session.compact")?.[0]?.key).toBe("ctrl+k")
```

Run: `cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/config/tui.test.ts` — expected: passes (`session_compact` → `"session.compact"` mapping exists at `keybind.ts:306`; the keybind itself at `keybind.ts:99`).

- [ ] **Step 2: Delete the dialog and its references.**
```sh
rm /Users/mac/Project/oa-cli/packages/tui/src/component/dialog-theme-list.tsx
```
In `packages/tui/src/app.tsx`:
  - remove line 47:
```ts
import { DialogThemeList } from "./component/dialog-theme-list"
```
  - remove line 123 inside the `appBindingCommands` array (keep the adjacent `"theme.switch_mode",` and `"theme.mode.lock",` entries at lines 124-125):
```ts
  "theme.switch",
```
  - remove the whole command entry at lines 781-789:
```ts
      {
        name: "theme.switch",
        title: "Switch theme",
        slashName: "themes",
        run: () => {
          dialog.replace(() => <DialogThemeList />)
        },
        category: "System",
      },
```
(Keep the adjacent `theme.switch_mode` and `theme.mode.lock` command entries.)

- [ ] **Step 3: Remove the keybind.** In `packages/tui/src/config/keybind.ts` delete line 78:
```ts
  theme_list: keybind("<leader>t", "List available themes"),
```
and line 286 (inside `CommandMap`, which `satisfies BindingCommandMap` — both must go together or typecheck breaks):
```ts
  theme_list: "theme.switch",
```
(Stale `theme_list` overrides in user configs are filtered as unknown keys — covered by the existing test "ignores unknown keybind names without dropping valid overrides from the same file" at `tui.test.ts:453`.)

- [ ] **Step 4: Remove the picker tip.** In `packages/tui/src/feature-plugins/home/tips-view.tsx`:
  - line 3: change `import { DEFAULT_THEMES, useTheme } from "../../context/theme"` → `import { useTheme } from "../../context/theme"`
  - delete line 6: `const themeCount = Object.keys(DEFAULT_THEMES).length`
  - delete line 43 in the `Shortcuts` type: `themeList: TipShortcut`
  - delete line 133 in the shortcuts object: `themeList: useCommandShortcut("theme.switch"),`
  - delete the tip at line 176: `` (shortcuts) => `Use ${commandText("/themes", shortcuts.themeList())} to switch between ${themeCount} built-in themes`, ``

- [ ] **Step 5: Verify no references remain and typecheck.**
```sh
grep -rn "DialogThemeList\|dialog-theme-list\|theme_list\|theme.switch\"" /Users/mac/Project/oa-cli/packages/tui/src /Users/mac/Project/oa-cli/packages/opencode/src
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck && bun test test/config/tui.test.ts
```
Expected: grep hits nothing (the remaining `theme_list` at `packages/sdk/js/src/gen/types.gen.ts:788` is outside these two paths and out of scope here; `"theme.switch_mode"` does not match the `theme.switch\"` pattern); both typechecks clean; test passes.

- [ ] **Step 6: Commit.**
```sh
cd /Users/mac/Project/oa-cli && git add -A packages/tui/src packages/opencode/test/config/tui.test.ts && git commit -m "refactor(tui): remove theme picker dialog, command, and keybind"
```

### Task T4: New "oa-cli" ASCII wordmark (TUI logo, CLI help logo, splash)

**Files:**
- Modify: `packages/tui/src/logo.ts` (the `logo` export at lines 1-4; keep `go` and `marks` untouched), `packages/opencode/src/cli/ui.ts` (wordmark :5-10), `packages/opencode/src/cli/cmd/run/splash.ts` (header comment :3, "OpenCode" :197, resume command :237)
- Test: Create `packages/tui/test/logo.test.ts`

**Interfaces:**
- Consumes: glyph encoding of `logo.ts` — marks `"_^~,"`: `_` = shadow-bg space, `^` = `▀` fg-on-shadow-bg, `~` = `▀` in shadow color, `,` = `▄` in shadow color; plain `█▀▄` and spaces render as-is. Rendered by `packages/tui/src/component/logo.tsx` (left = `textMuted`, right = `text` bold; handles all four marks plus plain chars), `packages/opencode/src/cli/ui.ts:logo()` (ANSI; handles `_ ^ ~` — the new glyphs use only `_`), and `packages/opencode/src/cli/logo.ts` which just re-exports `@opencode-ai/tui/logo`. Other `go` consumers (`splash.ts:21`, `component/bg-pulse-render.ts:2`) are untouched.
- Produces: `logo.left` = "oa-" (muted), `logo.right` = "cli" (bold), each an array of 4 equal-length rows (12 and 9 columns).

- [ ] **Step 1: Failing test for wordmark shape.** Create `packages/tui/test/logo.test.ts`:

```ts
import { expect, test } from "bun:test"
import { logo, marks } from "../src/logo"

test("wordmark halves each have 4 rows of consistent width", () => {
  expect(logo.left).toHaveLength(4)
  expect(logo.right).toHaveLength(4)
  for (const row of logo.left) expect(Array.from(row).length).toBe(Array.from(logo.left[0]).length)
  for (const row of logo.right) expect(Array.from(row).length).toBe(Array.from(logo.right[0]).length)
})

test("wordmark only uses supported glyph characters", () => {
  const allowed = new Set([..."█▀▄ ", ...marks])
  for (const row of [...logo.left, ...logo.right]) {
    for (const char of row) expect(allowed.has(char)).toBe(true)
  }
})

test("wordmark is the oa-cli brand, not opencode", () => {
  // opencode's halves were 19 columns each ("open"/"code"); oa-cli's are 12 ("oa-") and 9 ("cli")
  expect(Array.from(logo.left[1]).length).toBe(12)
  expect(Array.from(logo.right[1]).length).toBe(9)
})
```

Run: `cd /Users/mac/Project/oa-cli/packages/tui && bun test test/logo.test.ts`
Expected: third test FAILS (current widths are 19/19); first two pass.

- [ ] **Step 2: Replace the glyph wordmark.** In `packages/tui/src/logo.ts` replace the `logo` export (lines 1-4) with — left is "oa-" (o, a, hyphen), right is "cli" (c, tall l with foot, dotted i):

```ts
export const logo = {
  left: ["            ", "█▀▀█ ▄▀▀█   ", "█__█ █__█ ▀▀", "▀▀▀▀ ▀▀▀█   "],
  right: ["     ▄   ", "█▀▀▀ █  ▀", "█___ █  █", "▀▀▀▀ ▀▀ ▀"],
}
```

Keep `go` and `marks = "_^~,"` exactly as they are (the `[O]` splash badge and mark set are reused by `splash.ts` and `bg-pulse-render.ts`). Row widths: left rows are all 12 chars, right rows all 9 chars — the test from Step 1 enforces this.

Run: `cd /Users/mac/Project/oa-cli/packages/tui && bun test test/logo.test.ts` — expected: all 3 pass.

- [ ] **Step 3: Replace the plain wordmark in `packages/opencode/src/cli/ui.ts`.** Replace lines 5-10 with the plain-ASCII (marks flattened: `_` → space) composite of the same design — left 12 cols + 1-space gap + right 9 cols = 22 cols per row:

```ts
const wordmark = [
  `                  ▄   `,
  `█▀▀█ ▄▀▀█    █▀▀▀ █  ▀`,
  `█  █ █  █ ▀▀ █    █  █`,
  `▀▀▀▀ ▀▀▀█    ▀▀▀▀ ▀▀ ▀`,
]
```

(The TTY path of `logo()` at :48-104 reads the glyph arrays from `./logo` and needs no change.)

- [ ] **Step 4: Rebrand splash strings in `packages/opencode/src/cli/cmd/run/splash.ts`:**
  - line 3 comment: `// Renders the full opencode entry logo and a compact [O] exit badge, plus` → `// Renders the full OA-cli entry logo and a compact [O] exit badge, plus`
  - line 197: `push(lines, body_left, top, "OpenCode", right, undefined, TextAttributes.BOLD)` → `push(lines, body_left, top, "OA-cli", right, undefined, TextAttributes.BOLD)`
  - line 237: `` `opencode --mini -s ${meta.session_id}` `` → `` `oa-cli --mini -s ${meta.session_id}` ``

- [ ] **Step 5: Verify.**
```sh
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
cd /Users/mac/Project/oa-cli/packages/opencode && bun -e 'const { UI } = await import("./src/cli/ui.ts"); console.log(UI.logo())'
```
Expected: both typechecks clean; the printed block reads visually as "oa-" (dim) "cli" (bright) when run in a terminal (TTY path), or the plain 22-column wordmark when piped. Eyeball the glyphs; tweak block characters only inside the arrays if a letter reads badly (widths must stay 12/9 or update the logo test accordingly).

- [ ] **Step 6: Commit.**
```sh
cd /Users/mac/Project/oa-cli && git add packages/tui/src/logo.ts packages/tui/test/logo.test.ts packages/opencode/src/cli/ui.ts packages/opencode/src/cli/cmd/run/splash.ts && git commit -m "feat(branding): oa-cli ASCII wordmark in TUI logo, CLI help, and splash"
```

### Task T5: Brand the mini-UI fallback palette and crash-screen palette

**Files:**
- Modify: `packages/opencode/src/cli/cmd/run/theme.ts` (`seed` :584-592, `fallbackSplashLeft/Right` :602-603), `packages/tui/src/component/error-component.tsx` (comment :16-17, dark palette :31-41)

**Interfaces:**
- Consumes: `RGBA.fromIndex(index: number, fallback?: RGBA)`, `rgba(hex)` helper (`run/theme.ts:98`), `RGBA.defaultForeground` (all three already used at :584-592). `resolveRunTheme()` still derives the live palette from the terminal; only the no-detection fallback changes. `RUN_THEME_FALLBACK` (:605-654) derives everything else from `seed` — no other edits there.
- Produces: `RUN_THEME_FALLBACK` and crash-screen colors matching the contract palette.

- [ ] **Step 1: Replace `seed` in `packages/opencode/src/cli/cmd/run/theme.ts` (lines 584-592):**

```ts
const seed = {
  highlight: RGBA.fromIndex(208, rgba("#f97316")),
  muted: RGBA.fromIndex(248, rgba("#a8a29e")),
  text: RGBA.defaultForeground(rgba("#ffffff")),
  panel: rgba("#1c1917"),
  success: RGBA.fromIndex(2, rgba("#10b981")),
  warning: RGBA.fromIndex(3, rgba("#f59e0b")),
  error: RGBA.fromIndex(1, rgba("#ef4444")),
}
```

(208 is the xterm-256 orange nearest `#f97316`; 248 the gray nearest `#a8a29e`.)

- [ ] **Step 2: Rebrand the fallback splash colors (lines 602-603):**

```ts
const fallbackSplashLeft = RGBA.fromIndex(208)
const fallbackSplashRight = RGBA.fromIndex(231)
```

(orange left half, near-white right half, replacing the blue/teal 67/110; `fallbackSplashIndexed` at :601 and `splashShadow` usage at :635-636 are untouched.)

- [ ] **Step 3: Update the crash-screen fallback in `packages/tui/src/component/error-component.tsx`.** Change the comment at lines 16-17 to:

```ts
  // Safe fallback palette per mode (mirrors theme/assets/oa-cli.json) since the
  // theme context may be the thing that crashed.
```

and replace the dark branch object (lines 31-41) with:

```ts
    : {
        bg: "#0c0a09",
        element: "#292524",
        borderSubtle: "#44403c",
        text: "#ffffff",
        muted: "#a8a29e",
        primary: "#f97316",
        onPrimary: "#0c0a09",
        error: "#ef4444",
        success: "#10b981",
      }
```

(Leave the light branch at :20-30 as-is; the crash screen can still render on light terminals.)

- [ ] **Step 4: Verify and commit.**
```sh
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck
cd /Users/mac/Project/oa-cli && git add packages/opencode/src/cli/cmd/run/theme.ts packages/tui/src/component/error-component.tsx && git commit -m "feat(branding): oa-cli fallback palettes for mini-UI and crash screen"
```

### Task T6: Window title "OC | " → "OA | "

**Files:**
- Modify: `packages/tui/src/app.tsx` (title effect, four call sites at lines 457, 464, 469, 474)

**Interfaces:**
- Consumes: `renderer.setTerminalTitle(title: string)` from `@opentui/core`.

- [ ] **Step 1: Edit the title effect** in `packages/tui/src/app.tsx`:
  - line 457: `renderer.setTerminalTitle("OpenCode")` → `renderer.setTerminalTitle("OA-cli")`
  - line 464: `renderer.setTerminalTitle("OpenCode")` → `renderer.setTerminalTitle("OA-cli")`
  - line 469: `` renderer.setTerminalTitle(`OC | ${title}`) `` → `` renderer.setTerminalTitle(`OA | ${title}`) ``
  - line 474: `` renderer.setTerminalTitle(`OC | ${route.data.id}`) `` → `` renderer.setTerminalTitle(`OA | ${route.data.id}`) ``

(Line 454 references `Flag.OPENCODE_DISABLE_TERMINAL_TITLE` — env-var renaming is Phase 2 / the flags task; do not touch it here. The `setTerminalTitle("")` call at :887 clears the title and stays as-is.)

- [ ] **Step 2: Verify and commit.**
```sh
grep -n "OC | \|OpenCode" /Users/mac/Project/oa-cli/packages/tui/src/app.tsx
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck
cd /Users/mac/Project/oa-cli && git add packages/tui/src/app.tsx && git commit -m "feat(branding): OA window title prefix"
```
Expected: grep prints exactly one remaining hit — the update toast at app.tsx:1073 (`Successfully updated to OpenCode v...`), which belongs to the brand-strings task, not this one. No `setTerminalTitle` lines match. Typecheck clean.

### Task T7: Area verification (typecheck, grep sweep, manual smoke)

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck of both packages:**
```sh
cd /Users/mac/Project/oa-cli/packages/tui && bun run typecheck && cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```
Expected: both exit 0.

- [ ] **Step 2: Theme residue sweep:**
```sh
grep -ri "catppuccin\|dracula\|gruvbox" /Users/mac/Project/oa-cli/packages/tui/src ; echo "exit=$?"
grep -rn "DialogThemeList\|theme_list" /Users/mac/Project/oa-cli/packages/tui/src ; echo "exit=$?"
ls /Users/mac/Project/oa-cli/packages/tui/src/theme/assets/
```
Expected: both greps print `exit=1` (no matches); `ls` prints exactly `oa-cli.json`.

- [ ] **Step 3: Run the tui test suite** (theme, logo, config, keymap all touched indirectly):
```sh
cd /Users/mac/Project/oa-cli/packages/tui && bun test --timeout 30000
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/config/tui.test.ts
```
Expected: no failures (pre-existing unrelated failures, if any, must match a baseline run taken before this area started).

- [ ] **Step 4 (manual smoke, no commit): Launch the TUI and confirm the look.**
```sh
cd /Users/mac/Project/oa-cli && bun dev
```
(`dev` is the root package.json script: `bun run --cwd packages/opencode --conditions=browser src/index.ts`.) Confirm: home screen shows the "oa-" + "cli" wordmark, dark stone background `#0c0a09` with orange `#f97316` accents; terminal tab title shows "OA-cli"; command palette has no "Switch theme" entry and `/themes` autocompletes to nothing; "Switch to light/dark mode" still present and harmless (palette is mode-invariant). Exit and confirm the exit splash shows `oa-cli --mini -s <id>` as the continue command.

- [ ] **Step 5: Commit any verification-driven fixups** (only if Steps 1-4 forced edits):
```sh
cd /Users/mac/Project/oa-cli && git add -A packages/tui packages/opencode && git commit -m "fix(branding): oa-cli theme/wordmark verification fixups"
```
---

## Area R — Rename command to `oa-cli`, cut opencode phone-home, string sweep

> Prerequisite for every task: `cd /Users/mac/Project/oa-cli && bun install` (idempotent — dependencies are already vendored in `node_modules`, this just confirms the lockfile is satisfied before touching anything).
> Scope guard (Fase 1): `OPENCODE_*` env vars, `@opencode-ai/*` package names, `~/.config/opencode` paths, `.opencode/` project dirs, and `opencode.json`/`opencode.jsonc` config filenames stay unchanged — those are Fase 2. Only user-visible strings, network endpoints, binary/artifact names, and the yargs surface change here.

### Task R1: Rename binary + script name to `oa-cli`

**Files:**
- Modify `/Users/mac/Project/oa-cli/packages/opencode/package.json` (bin map, line 18-20)
- Rename `/Users/mac/Project/oa-cli/packages/opencode/bin/opencode` → `/Users/mac/Project/oa-cli/packages/opencode/bin/oa-cli` + edit internals
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/index.ts` (`show()` line 35-43, `.scriptName` line 47)

**Interfaces:**
- Consumes: nothing new.
- Produces: npm bin entry `oa-cli` → `./bin/oa-cli`; launcher resolves platform packages named `oa-cli-<platform>-<arch>` and cached sibling `.oa-cli`; yargs usage prints `oa-cli <cmd>`.

- [ ] **Step 1: Install deps and take a baseline**
```bash
cd /Users/mac/Project/oa-cli && bun install
bun run --cwd packages/opencode typecheck
```
Expected: install completes; typecheck exits 0 (baseline green before touching anything).

- [ ] **Step 2: Rename the launcher file and update package.json**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && git mv bin/opencode bin/oa-cli
```
In `packages/opencode/package.json` replace:
```json
  "bin": {
    "opencode": "./bin/opencode"
  },
```
with:
```json
  "bin": {
    "oa-cli": "./bin/oa-cli"
  },
```
Do NOT change `"name": "opencode"` — `packages/web/package.json` depends on `"opencode": "workspace:*"` and the workspace graph would break; the artifact name is decoupled from `pkg.name` in Task R2 instead.

- [ ] **Step 3: Update launcher internals in `bin/oa-cli`**
Replace (line 73-74):
```js
const base = "opencode-" + platform + "-" + arch
const binary = platform === "windows" ? "opencode.exe" : "opencode"
```
with:
```js
const base = "oa-cli-" + platform + "-" + arch
const binary = platform === "windows" ? "oa-cli.exe" : "oa-cli"
```
Replace (line 52):
```js
const cached = path.join(scriptDir, ".opencode")
```
with:
```js
const cached = path.join(scriptDir, ".oa-cli")
```
Replace the error string (lines 191-196):
```js
  console.error(
    "It seems that your package manager failed to install the right version of the opencode CLI for your platform. You can try manually installing " +
```
with:
```js
  console.error(
    "It seems that your package manager failed to install the right version of the OA-cli binary for your platform. You can try manually installing " +
```
Leave `process.env.OPENCODE_BIN_PATH` (line 46) as-is — env rename is Fase 2.

- [ ] **Step 4: Update `src/index.ts` script name and help-prefix check**
Replace (lines 35-43):
```ts
function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("opencode ")) {
```
with:
```ts
function show(out: string) {
  const text = out.trimStart()
  if (!text.startsWith("oa-cli ")) {
```
Replace (line 47):
```ts
  .scriptName("opencode")
```
with:
```ts
  .scriptName("oa-cli")
```
Leave the middleware env vars (`OPENCODE_PRINT_LOGS`, `OPENCODE=1`, `OPENCODE_PID`) unchanged (Fase 2).

- [ ] **Step 5: Verify**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun run --conditions=browser src/index.ts --help 2>&1 | head -20
```
Expected: usage lines read `oa-cli acp`, `oa-cli mcp`, … (no `opencode <cmd>` lines). Note: `bun test test/cli/help` will FAIL until snapshots are regenerated in Task R7 — that is expected and deferred there.
```bash
bun run --cwd /Users/mac/Project/oa-cli/packages/opencode typecheck
```
Expected: exit 0.

- [ ] **Step 6: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add -A && git commit -m "feat(cli): rename command and launcher binary to oa-cli"
```

### Task R2: Build script produces `oa-cli` artifacts

**Files:**
- Modify `/Users/mac/Project/oa-cli/packages/opencode/script/build.ts` (lines 145-156, 182-184, 202-204)

**Interfaces:**
- Consumes: `Script.version`, `Script.channel` from `@opencode-ai/script` (unchanged).
- Produces: dist layout `dist/oa-cli-<os>-<arch>[-baseline][-musl]/bin/oa-cli`; compiled binary user-agent `oa-cli/<version>`; npm sub-package names `oa-cli-<os>-<arch>` (matches launcher `base` from R1 and install-script `$APP-$target` from R3).

- [ ] **Step 1: Decouple artifact name from pkg.name**
After line 18 (`import pkg from "../package.json"`) add:
```ts
// Artifact/binary name for OA-cli. Decoupled from pkg.name ("opencode") so the
// workspace dependency graph is untouched in Fase 1.
const app = "oa-cli"
```
Replace (lines 145-156):
```ts
for (const item of targets) {
  const name = [
    pkg.name,
```
with:
```ts
for (const item of targets) {
  const name = [
    app,
```
Replace (line 182-184):
```ts
      target: name.replace(pkg.name, "bun") as any,
      outfile: `dist/${name}/bin/opencode`,
      execArgv: [`--user-agent=opencode/${Script.version}`, "--use-system-ca", "--"],
```
with:
```ts
      target: name.replace(app, "bun") as any,
      outfile: `dist/${name}/bin/oa-cli`,
      execArgv: [`--user-agent=oa-cli/${Script.version}`, "--use-system-ca", "--"],
```
Replace (line 203):
```ts
    const binaryPath = `dist/${name}/bin/opencode`
```
with:
```ts
    const binaryPath = `dist/${name}/bin/oa-cli`
```
(`OPENCODE_VERSION` / `OPENCODE_CHANNEL` / `OPENCODE_MODELS_DEV` defines stay — internal identifiers, Fase 2.)

- [ ] **Step 2: Verify with a single-target local build**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun run script/build.ts --single --skip-install --skip-embed-web-ui
```
Expected output includes `building oa-cli-darwin-arm64`, `Running smoke test: dist/oa-cli-darwin-arm64/bin/oa-cli --version`, `Smoke test passed: <version>`. (Note: `script/generate.ts` fetches the models.dev snapshot at build start — network required, existing behavior.)
```bash
ls /Users/mac/Project/oa-cli/packages/opencode/dist/oa-cli-darwin-arm64/bin/
```
Expected: `oa-cli` (plus workers). No `opencode` file anywhere under `dist/`.

- [ ] **Step 3: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add -A && git commit -m "feat(build): emit oa-cli artifacts with oa-cli user-agent"
```

### Task R3: Install script → `oa-cli`, releases from `Wahidila/oa-cli`

**Files:**
- Modify `/Users/mac/Project/oa-cli/install` (lines 3, 11-26, 68, 168, 184-204, 221-235, 278, 327-352, 369-371, 446-460)

**Interfaces:**
- Consumes: GitHub Releases at `https://github.com/Wahidila/oa-cli/releases` with assets named `oa-cli-<target>.zip|.tar.gz` (produced by R2 release flow).
- Produces: binary at `~/.oa-cli/bin/oa-cli`, PATH entry, served from `https://openagentic.id/cli/install`.

- [ ] **Step 1: Apply the rename edits**
Line 3: `APP=opencode` → `APP=oa-cli`
Usage block (lines 11-26), replace:
```bash
OpenCode Installer
```
with `OA-cli Installer`, and the examples:
```bash
Examples:
    curl -fsSL https://openagentic.id/cli/install | bash
    curl -fsSL https://openagentic.id/cli/install | bash -s -- --version 1.0.180
    ./install --binary /path/to/oa-cli
```
Line 68: `INSTALL_DIR=$HOME/.opencode/bin` → `INSTALL_DIR=$HOME/.oa-cli/bin`
Release URLs (lines 184-201) — replace every `anomalyco/opencode` with `Wahidila/oa-cli`:
```bash
        url="https://github.com/Wahidila/oa-cli/releases/latest/download/$filename"
        specific_version=$(curl -s https://api.github.com/repos/Wahidila/oa-cli/releases/latest | sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p')
```
```bash
        url="https://github.com/Wahidila/oa-cli/releases/download/v${requested_version}/$filename"
```
```bash
        http_status=$(curl -sI -o /dev/null -w "%{http_code}" "https://github.com/Wahidila/oa-cli/releases/tag/v${requested_version}")
        if [ "$http_status" = "404" ]; then
            echo -e "${RED}Error: Release v${requested_version} not found${NC}"
            echo -e "${MUTED}Available releases: https://github.com/Wahidila/oa-cli/releases${NC}"
```
`check_version()` (lines 221-235): `command -v opencode` → `command -v oa-cli`; `opencode_path=$(which opencode)` → `oa_cli_path=$(which oa-cli)`; `installed_version=$(opencode --version ...)` → `installed_version=$(oa-cli --version ...)`
Line 278 + 329: `opencode_install_$$` → `oa_cli_install_$$` (both tmp names)
`download_and_install` (lines 327-346): message `Installing ${NC}oa-cli`, and:
```bash
    mv "$tmp_dir/oa-cli" "$INSTALL_DIR"
    chmod 755 "${INSTALL_DIR}/oa-cli"
```
`install_from_binary` (lines 348-352): `cp "$binary_path" "${INSTALL_DIR}/oa-cli"` and `chmod 755 "${INSTALL_DIR}/oa-cli"`
`add_to_path` (lines 369-371): comment `\n# oa-cli`, message `Successfully added ${NC}oa-cli`
Final banner (lines 446-460) — replace the whole opencode ASCII/outro block with:
```bash
echo -e ""
echo -e "${ORANGE}OA-cli${NC} ${MUTED}— the OpenAgentic coding CLI${NC}"
echo -e ""
echo -e "cd <project>  ${MUTED}# Open directory${NC}"
echo -e "oa-cli        ${MUTED}# Run command${NC}"
echo -e ""
echo -e "${MUTED}For more information visit ${NC}https://openagentic.id"
echo -e ""
```

- [ ] **Step 2: Verify**
```bash
bash -n /Users/mac/Project/oa-cli/install && echo SYNTAX-OK
grep -cin "opencode" /Users/mac/Project/oa-cli/install
```
Expected: `SYNTAX-OK`; grep count `0`.
Local end-to-end (uses the binary built in R2, no network):
```bash
bash /Users/mac/Project/oa-cli/install --binary /Users/mac/Project/oa-cli/packages/opencode/dist/oa-cli-darwin-arm64/bin/oa-cli --no-modify-path
~/.oa-cli/bin/oa-cli --version
```
Expected: install messages mention `oa-cli`; version prints.

- [ ] **Step 3: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add install && git commit -m "feat(install): rebrand install script to oa-cli and Wahidila/oa-cli releases"
```

### Task R4: Installation service — curl-only, version check → `Wahidila/oa-cli`

**Files:**
- Test `/Users/mac/Project/oa-cli/packages/opencode/test/installation/installation.test.ts` (rewrite)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/installation/index.ts` (rewrite)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/upgrade.ts` (choices line 20, strings 9/31/49, choco block 61-66)

**Interfaces:**
- Consumes: `https://api.github.com/repos/Wahidila/oa-cli/releases/latest` (`{ tag_name }`); `https://openagentic.id/cli/install` (bash script body).
- Produces (signatures unchanged, callers `src/cli/upgrade.ts`, `src/cli/cmd/upgrade.ts`, `src/cli/cmd/uninstall.ts` keep compiling):
  - `Installation.method(): Effect<Method>` — now only ever `"curl"` (execPath under `.oa-cli/bin` or `.local/bin`) or `"unknown"`
  - `Installation.latest(method?: Method): Effect<string>` — always GitHub releases, ignores method
  - `Installation.upgrade(method, target): Effect<void, UpgradeFailedError>` — non-curl fails with install-script hint
  - New exported consts: `RELEASE_REPO = "Wahidila/oa-cli"`, `INSTALL_SCRIPT_URL = "https://openagentic.id/cli/install"`
  - `userAgent(client)` → `` `oa-cli/${channel}/${version}/${client}` ``

- [ ] **Step 1 (TDD): Rewrite the test file first**
Replace the entire contents of `test/installation/installation.test.ts` with (keeps the existing `mockHttpClient` / `mockSpawner` / `jsonResponse` / `testLayer` helpers from lines 1-67 verbatim — only imports drop `InstallationChannel` — and replaces the `describe` blocks):
```ts
import { describe, expect } from "bun:test"
import { makeGlobalNode } from "@opencode-ai/core/effect/app-node"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Effect, Layer, Stream } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Installation } from "../../src/installation"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"

const encoder = new TextEncoder()

function mockHttpClient(handler: (request: HttpClientRequest.HttpClientRequest) => Response) {
  const client = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler(request))))
  return Layer.succeed(HttpClient.HttpClient, client)
}

function mockSpawner(
  handler: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string } = () =>
    "",
) {
  const spawner = ChildProcessSpawner.make((command) => {
    const std = ChildProcess.isStandardCommand(command) ? command : undefined
    const result = handler(std?.command ?? "", std?.args ?? [])
    const output = typeof result === "string" ? { code: 0, stdout: result, stderr: "" } : result
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(0),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(output.code)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        stdin: { [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") } as any,
        stdout: output.stdout ? Stream.make(encoder.encode(output.stdout)) : Stream.empty,
        stderr: output.stderr ? Stream.make(encoder.encode(output.stderr)) : Stream.empty,
        all: Stream.empty,
        getInputFd: () => ({ [Symbol.for("effect/Sink/TypeId")]: Symbol.for("effect/Sink/TypeId") }) as any,
        getOutputFd: () => Stream.empty,
        unref: Effect.succeed(Effect.void),
      }),
    )
  })
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner)
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function testLayer(
  httpHandler: (request: HttpClientRequest.HttpClientRequest) => Response,
  spawnHandler?: (cmd: string, args: readonly string[]) => string | { code: number; stdout?: string; stderr?: string },
) {
  const spawnerNode = makeGlobalNode({
    service: ChildProcessSpawner.ChildProcessSpawner,
    layer: mockSpawner(spawnHandler),
    deps: [],
  })
  return LayerNode.compile(Installation.node, [
    [httpClient, mockHttpClient(httpHandler)],
    [CrossSpawnSpawner.node, spawnerNode],
  ])
}

describe("installation", () => {
  describe("latest", () => {
    const githubCalls: string[] = []
    testEffect(
      testLayer((request) => {
        githubCalls.push(request.url)
        return jsonResponse({ tag_name: "v1.2.3" })
      }),
    ).effect("reads release version from Wahidila/oa-cli GitHub releases", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("unknown")
        expect(result).toBe("1.2.3")
        expect(githubCalls).toContain("https://api.github.com/repos/Wahidila/oa-cli/releases/latest")
      }),
    )

    testEffect(testLayer(() => jsonResponse({ tag_name: "v4.0.0-beta.1" }))).effect(
      "strips v prefix from GitHub release tag",
      () =>
        Effect.gen(function* () {
          const result = yield* Installation.use.latest("curl")
          expect(result).toBe("4.0.0-beta.1")
        }),
    )

    const pmCalls: string[] = []
    testEffect(
      testLayer((request) => {
        pmCalls.push(request.url)
        return jsonResponse({ tag_name: "v1.5.0" })
      }),
    ).effect("ignores package-manager methods and always checks GitHub releases", () =>
      Effect.gen(function* () {
        const result = yield* Installation.use.latest("npm")
        expect(result).toBe("1.5.0")
        expect(pmCalls).toContain("https://api.github.com/repos/Wahidila/oa-cli/releases/latest")
      }),
    )
  })

  describe("upgrade", () => {
    testEffect(testLayer(() => jsonResponse({}))).effect(
      "rejects package-manager upgrade methods with an install-script hint",
      () =>
        Effect.gen(function* () {
          const error = yield* Effect.flip(Installation.use.upgrade("npm", "9.9.9"))
          expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
          expect(error.stderr).toContain('does not support the "npm" install method')
          expect(error.stderr).toContain("https://openagentic.id/cli/install")
        }),
    )

    const curlCalls: string[] = []
    testEffect(
      testLayer(
        (request) => {
          curlCalls.push(request.url)
          return new Response("#!/usr/bin/env bash\nexit 0", { status: 200 })
        },
        (cmd, args) => {
          if (cmd === "bash" && args[0] === "--version") return "GNU bash"
          return ""
        },
      ),
    ).effect("fetches the openagentic.id install script for curl upgrades", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("curl", "9.9.9")
        expect(curlCalls).toContain("https://openagentic.id/cli/install")
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install script with token=secret", { status: 200 }),
        (cmd, args) => {
          if (cmd === "bash" && args[0] === "--version") return "GNU bash"
          if (cmd === "bash" || cmd === "sh") return { code: 1, stderr: "script output with token=secret" }
          return ""
        },
      ),
    ).effect("returns sanitized typed errors when the curl install script fails", () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(Installation.use.upgrade("curl", "9.9.9"))
        expect(error).toBeInstanceOf(Installation.UpgradeFailedError)
        expect(error.stderr).toBe("Upgrade failed for curl (exit code 1).")
        expect(error.message).toBe(error.stderr)
        expect(error.stderr).not.toContain("secret")
        expect(error.stderr).not.toContain("script output")
      }),
    )

    testEffect(
      testLayer(
        () => new Response("install script", { status: 200 }),
        (cmd, args) => {
          if (cmd === "bash" && args[0] === "--version") return { code: 1, stderr: "missing" }
          if (cmd === "bash") return { code: 1, stderr: "should not execute installer with bash" }
          if (cmd === "sh") return "ok"
          return ""
        },
      ),
    ).effect("falls back to sh when bash is unavailable during curl upgrade", () =>
      Effect.gen(function* () {
        yield* Installation.use.upgrade("curl", "9.9.9")
      }),
    )
  })
})
```
Run it — it must FAIL against current src (old code hits npm registry / lacks the rejection message):
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/installation/installation.test.ts
```
Expected: failures on "reads release version from Wahidila/oa-cli…", "ignores package-manager methods…", "rejects package-manager upgrade methods…", "fetches the openagentic.id install script…".

- [ ] **Step 2: Rewrite `src/installation/index.ts`**
Full replacement (drops package-manager detection, brew/npm/choco/scoop version lookups, `NpmConfig` and `errorMessage` imports, `run` helper, `getBrewFormula`; everything else identical to current file):
```ts
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Effect, Layer, Schema, Context, Stream } from "effect"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@opencode-ai/core/process"
import path from "path"
import { makeRuntime } from "@opencode-ai/core/effect/runtime"
import semver from "semver"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { InstallationEvent } from "@opencode-ai/schema/installation-event"

// OA-cli ships through exactly one channel: GitHub Releases on Wahidila/oa-cli,
// installed via the openagentic.id install script. The package-manager members
// stay in the Method union so downstream switch statements keep compiling, but
// they are rejected at upgrade time.
export type Method = "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"

export const RELEASE_REPO = "Wahidila/oa-cli"
export const INSTALL_SCRIPT_URL = "https://openagentic.id/cli/install"

export type ReleaseType = "patch" | "minor" | "major"

export const Event = InstallationEvent

export function getReleaseType(current: string, latest: string): ReleaseType {
  const currMajor = semver.major(current)
  const currMinor = semver.minor(current)
  const newMajor = semver.major(latest)
  const newMinor = semver.minor(latest)

  if (newMajor > currMajor) return "major"
  if (newMinor > currMinor) return "minor"
  return "patch"
}

export const Info = Schema.Struct({
  version: Schema.String,
  latest: Schema.String,
}).annotate({ identifier: "InstallationInfo" })
export type Info = Schema.Schema.Type<typeof Info>

export function userAgent(client = "cli") {
  return `oa-cli/${InstallationChannel}/${InstallationVersion}/${client}`
}

export const USER_AGENT = userAgent()

export function isPreview() {
  return InstallationChannel !== "latest"
}

export function isLocal() {
  return InstallationChannel === "local"
}

export class UpgradeFailedError extends Schema.TaggedErrorClass<UpgradeFailedError>()("UpgradeFailedError", {
  stderr: Schema.String,
}) {
  override get message() {
    return this.stderr
  }
}

const GitHubRelease = Schema.Struct({ tag_name: Schema.String })

export interface Interface {
  readonly info: () => Effect.Effect<Info>
  readonly method: () => Effect.Effect<Method>
  readonly latest: (method?: Method) => Effect.Effect<string>
  readonly upgrade: (method: Method, target: string) => Effect.Effect<void, UpgradeFailedError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Installation") {}

export const use = serviceUse(Service)

const layer: Layer.Layer<Service, never, HttpClient.HttpClient | AppProcess.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const httpOk = HttpClient.filterStatusOk(withTransientReadRetry(http))
    const appProcess = yield* AppProcess.Service

    const text = Effect.fnUntraced(
      function* (cmd: string[], opts?: { cwd?: string; env?: Record<string, string> }) {
        const result = yield* appProcess.run(
          ChildProcess.make(cmd[0], cmd.slice(1), {
            cwd: opts?.cwd,
            env: opts?.env,
            extendEnv: true,
          }),
        )
        return result.stdout.toString("utf8")
      },
      Effect.catch(() => Effect.succeed("")),
    )

    const upgradeFailure = (method: Method, result?: { code: number; stdout: string; stderr: string }) => {
      if (result) return `Upgrade failed for ${method} (exit code ${result.code}).`
      return `Upgrade failed for ${method}.`
    }

    const upgradeScriptShell = Effect.fnUntraced(function* () {
      const bashVersion = yield* text(["bash", "--version"])
      if (bashVersion) return "bash"
      return "sh"
    })

    const upgradeCurl = Effect.fnUntraced(
      function* (target: string) {
        const response = yield* httpOk.execute(HttpClientRequest.get(INSTALL_SCRIPT_URL))
        const body = yield* response.text
        const bodyBytes = new TextEncoder().encode(body)
        const shell = yield* upgradeScriptShell()
        const result = yield* appProcess.run(
          ChildProcess.make(shell, [], {
            stdin: Stream.make(bodyBytes),
            env: { VERSION: target },
            extendEnv: true,
          }),
        )
        return {
          code: result.exitCode,
          stdout: result.stdout.toString("utf8"),
          stderr: result.stderr.toString("utf8"),
        }
      },
      Effect.mapError(() => new UpgradeFailedError({ stderr: upgradeFailure("curl") })),
    )

    const result: Interface = {
      info: Effect.fn("Installation.info")(function* () {
        return {
          version: InstallationVersion,
          latest: yield* result.latest(),
        }
      }),
      method: Effect.fn("Installation.method")(function* () {
        if (process.execPath.includes(path.join(".oa-cli", "bin"))) return "curl" as Method
        if (process.execPath.includes(path.join(".local", "bin"))) return "curl" as Method
        return "unknown" as Method
      }),
      latest: Effect.fn("Installation.latest")(function* (_installMethod?: Method) {
        const response = yield* httpOk.execute(
          HttpClientRequest.get(`https://api.github.com/repos/${RELEASE_REPO}/releases/latest`).pipe(
            HttpClientRequest.acceptJson,
          ),
        )
        const data = yield* HttpClientResponse.schemaBodyJson(GitHubRelease)(response)
        return data.tag_name.replace(/^v/, "")
      }, Effect.orDie),
      upgrade: Effect.fn("Installation.upgrade")(function* (m: Method, target: string) {
        if (m !== "curl") {
          return yield* new UpgradeFailedError({
            stderr: `OA-cli does not support the "${m}" install method. Re-install with: curl -fsSL ${INSTALL_SCRIPT_URL} | bash`,
          })
        }
        const upgradeResult = yield* upgradeCurl(target)
        if (upgradeResult.code !== 0) {
          return yield* new UpgradeFailedError({ stderr: upgradeFailure(m, upgradeResult) })
        }
        yield* Effect.logInfo("upgraded", {
          method: m,
          target,
          stdout: upgradeResult.stdout,
          stderr: upgradeResult.stderr,
        })
        yield* text([process.execPath, "--version"])
      }),
    }

    return Service.of(result)
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [httpClient, AppProcess.node] })

const { runPromise } = makeRuntime(Service, AppNodeBuilder.build(node))

export const latest = (...args: Parameters<Interface["latest"]>) => runPromise((s) => s.latest(...args))
export const method = () => runPromise((s) => s.method())
export const upgrade = (...args: Parameters<Interface["upgrade"]>) => runPromise((s) => s.upgrade(...args))

export * as Installation from "."
```

- [ ] **Step 3: Update `src/cli/cmd/upgrade.ts`**
Line 20: `choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],` → `choices: ["curl"],`
Line 9: `describe: "upgrade opencode to the latest or a specific version",` → `describe: "upgrade OA-cli to the latest or a specific version",`
Line 31: `` prompts.log.error(`opencode is installed to ${process.execPath} and may be managed by a package manager`) `` → `` prompts.log.error(`OA-cli is installed to ${process.execPath} and may be managed by a package manager`) ``
Line 49: `` prompts.log.warn(`opencode upgrade skipped: ${target} is already installed`) `` → `` prompts.log.warn(`OA-cli upgrade skipped: ${target} is already installed`) ``
Lines 60-67: delete the choco special-case (comment at line 61 through the closing `}` of the inner if/else), leaving:
```ts
      if (err instanceof Installation.UpgradeFailedError) {
        prompts.log.error(err.stderr)
      } else if (err instanceof Error) prompts.log.error(err.message)
```

- [ ] **Step 4: Verify**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/installation/installation.test.ts
```
Expected: `6 pass, 0 fail`.
```bash
bun run --cwd /Users/mac/Project/oa-cli/packages/opencode typecheck
grep -rn "opencode-ai@\|anomalyco\|formulae.brew.sh\|chocolatey\|ScoopInstaller\|registry.npmjs" /Users/mac/Project/oa-cli/packages/opencode/src/installation/
```
Expected: typecheck exit 0; grep returns nothing.

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add -A && git commit -m "feat(installation): curl-only upgrades via openagentic.id, version check on Wahidila/oa-cli"
```

### Task R5: Hard-disable session share + remove opencode Go upsell

**Files:**
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/share/share-next.ts` (line 23)
- Delete `/Users/mac/Project/oa-cli/packages/opencode/test/share/share-next.test.ts`
- Test `/Users/mac/Project/oa-cli/packages/opencode/test/session/retry.test.ts` (lines 257-346 — three upsell tests)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/session/retry.ts` (lines 10-11, 76-121)

**Interfaces:**
- Produces: `ShareNext` service compiles unchanged but every operation no-ops (`create` returns `{ id: "", url: "", secret: "" }` — existing `disabled` branches already implement this). `SessionRetry.retryable(error, provider): { message } | undefined` — the `action` field is never populated anymore; the `Retryable`/`RetryReason` types stay so `packages/tui/src/routes/session/index.tsx` and `dialog-retry-action.tsx` keep compiling (their upsell paths become dead code, removed by the TUI area / Fase 2).

- [ ] **Step 1 (TDD): Update retry tests first**
In `test/session/retry.test.ts`, replace ALL THREE upsell tests — `"maps free limits to Go upsell action"` (lines 257-281), `"maps Go subscription limits to workspace PAYG upsell"` (lines 283-319), AND `"maps Go subscription limits without limit metadata"` (lines 321-346, it asserts `?.action?.message` and would fail once actions are gone) — with:
```ts
  test("does not upsell on provider usage-limit errors", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Free usage exceeded",
        isRetryable: true,
        statusCode: 429,
        responseBody: JSON.stringify({
          type: "error",
          error: { type: "FreeUsageLimitError", message: "Free usage exceeded" },
        }),
      }).toObject(),
    )

    const retryable = SessionRetry.retryable(error, "openagentic")
    expect(retryable).toEqual({ message: "Free usage exceeded" })
    expect(JSON.stringify(retryable)).not.toContain("opencode.ai")
  })

  test("does not upsell on subscription usage-limit errors", () => {
    const error = Schema.decodeUnknownSync(SessionV1.APIError.Schema)(
      new SessionV1.APIError({
        message: "Subscription quota exceeded. You can continue using free models.",
        isRetryable: true,
        statusCode: 429,
        responseHeaders: { "retry-after": "900" },
        responseBody: JSON.stringify({
          type: "error",
          error: { type: "GoUsageLimitError", message: "Subscription quota exceeded." },
          metadata: { workspace: "wrk_01K6XGM22R6FM8JVABE9XDQXGH" },
        }),
      }).toObject(),
    )

    const retryable = SessionRetry.retryable(error, "openagentic")
    expect(retryable?.action).toBeUndefined()
    expect(JSON.stringify(retryable)).not.toContain("opencode.ai")
  })
```
Run:
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/session/retry.test.ts
```
Expected: both new tests FAIL (current code returns upsell action objects with opencode.ai links). Compile errors on `SessionRetry.GO_UPSELL_MESSAGE` disappear because the deleted tests were the only users.

- [ ] **Step 2: Edit `src/session/retry.ts`**
Delete lines 10-11:
```ts
export const GO_UPSELL_MESSAGE = "Free usage exceeded, subscribe to Go"
export const GO_UPSELL_URL = "https://opencode.ai/go"
```
Inside `retryable()`, delete the whole `if (error.data.responseBody?.includes("FreeUsageLimitError")) { ... }` block (lines 76-88) and the whole `if (error.data.responseBody?.includes("GoUsageLimitError")) { ... }` block (lines 89-121), so the `APIError` branch reads:
```ts
  if (SessionV1.APIError.isInstance(error)) {
    const status = error.data.statusCode
    // 5xx errors are transient server failures and should always be retried,
    // even when the provider SDK doesn't explicitly mark them as retryable.
    if (!error.data.isRetryable && !(status !== undefined && status >= 500)) return undefined
    return { message: error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message }
  }
```
The now-unused helpers `str`/`num` were also used only by the deleted block — check with `grep -n "str(\|num(" src/session/retry.ts`; if `str`/`num` have no remaining callers, delete both functions (keep `parseJSON` — still used at line 138).

- [ ] **Step 3: Hard-disable share**
In `src/share/share-next.ts` replace line 23:
```ts
const disabled = process.env["OPENCODE_DISABLE_SHARE"] === "true" || process.env["OPENCODE_DISABLE_SHARE"] === "1"
```
with:
```ts
// OA-cli Fase 1: session sharing is removed — no data ever leaves the machine.
// Every ShareNext operation early-returns on this flag (see init/create/flush/
// remove below). The opncd.ai fallback in request() is unreachable dead code
// and is deleted together with the service in Fase 2.
const disabled = true as boolean
```
(`as boolean` keeps TS from narrowing to literal `true` and flagging unreachable branches.)
Delete the now-meaningless network test file:
```bash
cd /Users/mac/Project/oa-cli && git rm packages/opencode/test/share/share-next.test.ts
```

- [ ] **Step 4: Verify**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/session/retry.test.ts
```
Expected: all pass (incl. the two new no-upsell tests).
```bash
bun run --cwd /Users/mac/Project/oa-cli/packages/opencode typecheck
grep -rn "GO_UPSELL\|opencode\.ai/go\|opencode\.ai/workspace" /Users/mac/Project/oa-cli/packages/opencode/src/
```
Expected: typecheck exit 0; grep returns nothing under `packages/opencode/src` (TUI-side `GO_URL` in `packages/tui` is out of this task — see R7 acceptance list).

- [ ] **Step 5: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add -A && git commit -m "feat(session): disable share phone-home and remove opencode Go upsell"
```

### Task R6: Delete `github` command, fix MCP OAuth metadata, stub web-UI upstream

**Files:**
- Modify `/Users/mac/Project/oa-cli/packages/opencode/test/cli/github-action.test.ts` (import line 3) and `test/cli/github-remote.test.ts` (import line 2)
- Delete `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/github.ts` and `src/cli/cmd/github.handler.ts` (keep `github.shared.ts` — pure helpers, no network)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/index.ts` (lines 18, 99)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/test/cli/help/help-snapshots.test.ts` (lines 45-66, 71-86)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/mcp/oauth-provider.ts` (lines 43-53)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/server/shared/ui.ts` (rewrite proxy path), `src/server/routes/instance/httpapi/server.ts` (lines 3, 194-204)
- Rewrite `/Users/mac/Project/oa-cli/packages/opencode/test/server/httpapi-ui.test.ts`

**Interfaces:**
- Produces: `serveUIEffect(request, services: { fs: FSUtil.Interface; disableEmbeddedWebUi: boolean })` — `client` parameter removed; serves the embedded UI when present, otherwise 404 JSON. `McpOAuthProvider.clientMetadata` advertises `client_name: "OA-cli"`, `client_uri: "https://openagentic.id"`.

- [ ] **Step 1: Repoint github helper tests, then delete the command**
`test/cli/github-action.test.ts` line 3:
```ts
import { extractResponseText, formatPromptTooLargeError } from "../../src/cli/cmd/github.shared"
```
`test/cli/github-remote.test.ts` line 2:
```ts
import { parseGitHubRemote } from "../../src/cli/cmd/github.shared"
```
Then:
```bash
cd /Users/mac/Project/oa-cli && git rm packages/opencode/src/cli/cmd/github.ts packages/opencode/src/cli/cmd/github.handler.ts
```
In `src/index.ts` delete line 18 (`import { GithubCommand } from "./cli/cmd/github"`) and line 99 (`.command(GithubCommand)`).
In `test/cli/help/help-snapshots.test.ts` delete `"github",` from `TOP_LEVEL` (line 61) and the two entries `["github", "install"],` / `["github", "run"],` from `SUBCOMMANDS` (lines 83-84).
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/cli/github-action.test.ts test/cli/github-remote.test.ts
```
Expected: pass. (This also removes `api.opencode.ai`, `social-cards.sst.dev`, `dev.opencode.ai`, and the `opencode.ai/docs/github` link in one stroke — they only lived in `github.handler.ts`.)

- [ ] **Step 2: MCP OAuth client metadata**
In `src/mcp/oauth-provider.ts` replace (lines 46-47):
```ts
      client_name: "OpenCode",
      client_uri: "https://opencode.ai",
```
with:
```ts
      client_name: "OA-cli",
      client_uri: "https://openagentic.id",
```

- [ ] **Step 3: Remove the `app.opencode.ai` UI proxy**
Replace the entire contents of `src/server/shared/ui.ts` with:
```ts
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Effect } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { createHash } from "node:crypto"

let embeddedUIPromise: Promise<Record<string, string> | null> | undefined

export const csp = (hash = "") =>
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; media-src 'self' data:; connect-src * data:`
export const DEFAULT_CSP = csp()

export function themePreloadHash(body: string) {
  return body.match(/<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(['"])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i)
}

export function cspForHtml(body: string) {
  const match = themePreloadHash(body)
  return csp(match ? createHash("sha256").update(match[2]).digest("base64") : "")
}

export function embeddedUI(disableEmbeddedWebUi: boolean) {
  if (disableEmbeddedWebUi) return Promise.resolve(null)
  return (embeddedUIPromise ??=
    // @ts-expect-error - generated file at build time
    import("opencode-web-ui.gen.ts").then((module) => module.default as Record<string, string>).catch(() => null))
}

function notFound() {
  return HttpServerResponse.jsonUnsafe({ error: "Not Found" }, { status: 404 })
}

function embeddedUIResponse(file: string, body: Uint8Array) {
  const mime = FSUtil.mimeType(file)
  const headers = new Headers({ "content-type": mime })
  if (mime.startsWith("text/html")) {
    headers.set("content-security-policy", cspForHtml(new TextDecoder().decode(body)))
  }
  return HttpServerResponse.raw(body, { headers })
}

export function serveEmbeddedUIEffect(
  requestPath: string,
  fs: FSUtil.Interface,
  embeddedWebUI: Record<string, string>,
) {
  const file = embeddedWebUI[requestPath.replace(/^\//, "")] ?? embeddedWebUI["index.html"] ?? null
  if (!file) return Effect.succeed(notFound())

  return fs.readFile(file).pipe(
    Effect.map((body) => embeddedUIResponse(file, body)),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(notFound())),
  )
}

// OA-cli serves only the UI bundle embedded at build time. The upstream proxy
// to app.opencode.ai was removed — no request ever leaves the local server.
export function serveUIEffect(
  request: HttpServerRequest.HttpServerRequest,
  services: { fs: FSUtil.Interface; disableEmbeddedWebUi: boolean },
) {
  return Effect.gen(function* () {
    const embeddedWebUI = yield* Effect.promise(() => embeddedUI(services.disableEmbeddedWebUi))
    const path = new URL(request.url, "http://localhost").pathname

    if (embeddedWebUI) return yield* serveEmbeddedUIEffect(path, services.fs, embeddedWebUI)

    return HttpServerResponse.jsonUnsafe({ error: "Web UI is not available in this OA-cli build" }, { status: 404 })
  })
}
```
In `src/server/routes/instance/httpapi/server.ts` update the `uiRoute` block (lines 194-204):
```ts
const uiRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const flags = yield* RuntimeFlags.Service
    yield* router.add("*", "/*", (request) =>
      serveUIEffect(request, { fs, disableEmbeddedWebUi: flags.disableEmbeddedWebUi }),
    )
  }),
).pipe(Layer.provide(authOnlyRouterLayer))
```
and on line 3 remove `HttpClient` from the `effect/unstable/http` import list (it was only used by the deleted `const client = yield* HttpClient.HttpClient`; verify with `grep -n "HttpClient" src/server/routes/instance/httpapi/server.ts` → no remaining uses).

- [ ] **Step 4: Rewrite `test/server/httpapi-ui.test.ts`**
Replace the file. Keep: `testStateLayer`, `authConfigLayer`, `restoreEnv`, `fsUtilLayer`, the `app()` helper, both embedded-UI tests, the CSP test, and the preflight test — all verbatim from the current file. Remove: the `httpClient()` mock helper, the `client` option, and the three upstream-proxy tests. Adapt: `uiApp`/`routeOrderingApp` lose their HttpClient layer, the route-ordering test asserts by body instead of proxied URL, and the auth tests expect 404 (auth accepted, no embedded UI) instead of proxied 200:
```ts
import { createHash } from "node:crypto"
import { describe, expect } from "bun:test"
import { Flag } from "@opencode-ai/core/flag/flag"
import { ConfigProvider, Effect, Layer, Option } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { HttpRouter, HttpServer, HttpServerResponse } from "effect/unstable/http"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { ServerAuth } from "../../src/server/auth"
import { authorizationRouterMiddleware } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { serveEmbeddedUIEffect, serveUIEffect } from "../../src/server/shared/ui"
import { testEffect } from "../lib/effect"

const testStateLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const original = {
      OPENCODE_SERVER_PASSWORD: Flag.OPENCODE_SERVER_PASSWORD,
      OPENCODE_SERVER_USERNAME: Flag.OPENCODE_SERVER_USERNAME,
      envPassword: process.env.OPENCODE_SERVER_PASSWORD,
      envUsername: process.env.OPENCODE_SERVER_USERNAME,
    }

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        Flag.OPENCODE_SERVER_PASSWORD = original.OPENCODE_SERVER_PASSWORD
        Flag.OPENCODE_SERVER_USERNAME = original.OPENCODE_SERVER_USERNAME
        restoreEnv("OPENCODE_SERVER_PASSWORD", original.envPassword)
        restoreEnv("OPENCODE_SERVER_USERNAME", original.envUsername)
      }),
    )
  }),
)

const fsUtilLayer = AppNodeBuilder.build(FSUtil.node)
const it = testEffect(Layer.mergeAll(testStateLayer, fsUtilLayer, RuntimeFlags.layer()))

function authConfigLayer(input?: { password?: string; username?: string }) {
  return ServerAuth.Config.configLayer({
    password: input?.password === undefined ? Option.none() : Option.some(input.password),
    username: input?.username ?? "opencode",
  })
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }
  process.env[key] = value
}

function app(input?: { password?: string; username?: string }) {
  const handler = HttpRouter.toWebHandler(
    HttpApiApp.routes.pipe(
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            OPENCODE_SERVER_PASSWORD: input?.password,
            OPENCODE_SERVER_USERNAME: input?.username,
          }),
        ),
      ),
    ),
    { disableLogger: true },
  ).handler
  return {
    request(input: string | URL | Request, init?: RequestInit) {
      return Effect.promise(() =>
        Promise.resolve(
          handler(
            input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
            HttpApiApp.context,
          ),
        ),
      )
    },
  }
}

function uiApp(input?: { password?: string; username?: string; disableEmbeddedWebUi?: boolean }) {
  const handler = HttpRouter.toWebHandler(
    HttpRouter.use((router) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const flags = yield* RuntimeFlags.Service
        yield* router.add("*", "/*", (request) =>
          serveUIEffect(request, { fs, disableEmbeddedWebUi: flags.disableEmbeddedWebUi }),
        )
      }),
    ).pipe(
      Layer.provide(authorizationRouterMiddleware.layer.pipe(Layer.provide(authConfigLayer(input)))),
      Layer.provide([
        fsUtilLayer,
        RuntimeFlags.layer({ disableEmbeddedWebUi: input?.disableEmbeddedWebUi ?? false }),
        HttpServer.layerServices,
      ]),
    ),
    { disableLogger: true },
  ).handler
  return {
    request(input: string | URL | Request, init?: RequestInit) {
      return Effect.promise(() =>
        Promise.resolve(
          handler(
            input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
            HttpApiApp.context,
          ),
        ),
      )
    },
  }
}

function routeOrderingApp() {
  const handler = HttpRouter.toWebHandler(
    HttpRouter.use((router) =>
      Effect.gen(function* () {
        const fs = yield* FSUtil.Service
        const flags = yield* RuntimeFlags.Service
        yield* router.add("GET", "/session/:sessionID", () =>
          Effect.succeed(HttpServerResponse.jsonUnsafe({ error: "session route" }, { status: 404 })),
        )
        yield* router.add("*", "/*", (request) =>
          serveUIEffect(request, { fs, disableEmbeddedWebUi: flags.disableEmbeddedWebUi }),
        )
      }),
    ).pipe(
      Layer.provide([fsUtilLayer, RuntimeFlags.layer({ disableEmbeddedWebUi: true }), HttpServer.layerServices]),
    ),
    { disableLogger: true },
  ).handler
  return {
    request(input: string | URL | Request, init?: RequestInit) {
      return Effect.promise(() =>
        Promise.resolve(
          handler(
            input instanceof Request ? input : new Request(new URL(input, "http://localhost"), init),
            HttpApiApp.context,
          ),
        ),
      )
    },
  }
}

function responseText(response: Response) {
  return Effect.promise(() => response.text())
}

describe("HttpApi UI fallback", () => {
  it.live("returns 404 without proxying when no embedded UI is bundled", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({ disableEmbeddedWebUi: true }).request("/")
      expect(response.status).toBe(404)
      expect(yield* responseText(response)).toContain("Web UI is not available")
    }),
  )

  it.live("keeps matched API routes ahead of the UI fallback", () =>
    Effect.gen(function* () {
      const response = yield* routeOrderingApp().request("/session/ses_nope")
      expect(response.status).toBe(404)
      expect(yield* responseText(response)).toContain("session route")
    }),
  )

  it.live("serves embedded UI assets when Bun can read them but access reports missing", () =>
    Effect.gen(function* () {
      let readPath: string | undefined

      const fs = yield* FSUtil.Service
      const response = yield* serveEmbeddedUIEffect(
        "/assets/app.js",
        {
          ...fs,
          existsSafe: () => Effect.die("embedded UI should not rely on filesystem access checks"),
          readFile: (path) => {
            readPath = path
            return path === "/$bunfs/root/assets/app.js"
              ? Effect.succeed(new TextEncoder().encode("console.log('embedded')"))
              : Effect.die(`unexpected embedded UI path: ${path}`)
          },
        },
        { "assets/app.js": "/$bunfs/root/assets/app.js" },
      ).pipe(Effect.map(HttpServerResponse.toWeb))

      expect(response.status).toBe(200)
      expect(readPath).toBe("/$bunfs/root/assets/app.js")
      expect(response.headers.get("content-type")).toContain("text/javascript")
      expect(yield* responseText(response)).toBe("console.log('embedded')")
    }),
  )

  it.live("allows embedded UI terminal wasm and theme preload CSP", () =>
    Effect.gen(function* () {
      const script = 'document.documentElement.dataset.theme = "dark"'

      const fs = yield* FSUtil.Service
      const response = yield* serveEmbeddedUIEffect(
        "/",
        {
          ...fs,
          readFile: (path) => {
            return path === "/$bunfs/root/index.html"
              ? Effect.succeed(
                  new TextEncoder().encode(
                    `<html><head><script id="oc-theme-preload-script">${script}</script></head></html>`,
                  ),
                )
              : Effect.die(`unexpected embedded UI path: ${path}`)
          },
        },
        { "index.html": "/$bunfs/root/index.html" },
      ).pipe(Effect.map(HttpServerResponse.toWeb))

      const csp = response.headers.get("content-security-policy") ?? ""
      expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
      expect(csp).toContain(`'sha256-${createHash("sha256").update(script).digest("base64")}'`)
      expect(csp).toContain("connect-src * data:")
    }),
  )

  it.live("requires server password for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "secret",
        username: "opencode",
        disableEmbeddedWebUi: true,
      }).request("/")

      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toBe('Basic realm="Secure Area"')
    }),
  )

  it.live("accepts auth token for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "secret",
        username: "opencode",
        disableEmbeddedWebUi: true,
      }).request(`/?auth_token=${btoa("opencode:secret")}`)

      expect(response.status).toBe(404) // auth accepted; no embedded UI in test build
    }),
  )

  it.live("accepts basic auth for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "secret",
        username: "opencode",
        disableEmbeddedWebUi: true,
      }).request("/", {
        headers: { authorization: `Basic ${btoa("opencode:secret")}` },
      })

      expect(response.status).toBe(404)
    }),
  )

  it.live("accepts basic auth passwords containing colons for the web UI", () =>
    Effect.gen(function* () {
      const response = yield* uiApp({
        password: "sec:ret",
        username: "opencode",
        disableEmbeddedWebUi: true,
      }).request("/", {
        headers: { authorization: `Basic ${btoa("opencode:sec:ret")}` },
      })

      expect(response.status).toBe(404)
    }),
  )

  it.live("serves the PWA manifest without auth even when a server password is set", () =>
    Effect.gen(function* () {
      for (const path of ["/site.webmanifest", "/web-app-manifest-192x192.png", "/web-app-manifest-512x512.png"]) {
        const response = yield* uiApp({
          password: "secret",
          username: "opencode",
          disableEmbeddedWebUi: true,
        }).request(path)
        expect(response.status).not.toBe(401)
      }
    }),
  )

  it.live("allows web UI preflight without auth", () =>
    Effect.gen(function* () {
      const response = yield* app({ password: "secret", username: "opencode" }).request("/", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:3000",
          "access-control-request-method": "GET",
        },
      })

      expect(response.status).toBe(204)
      expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
    }),
  )
})
```
(The `"opencode"` basic-auth username here is the server's actual default — Fase 2 concern, left alone.)

- [ ] **Step 5: Verify**
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/server/httpapi-ui.test.ts test/cli/github-action.test.ts test/cli/github-remote.test.ts
bun run --cwd /Users/mac/Project/oa-cli/packages/opencode typecheck
grep -rn "app\.opencode\.ai\|api\.opencode\.ai\|social-cards" /Users/mac/Project/oa-cli/packages/opencode/src/
```
Expected: tests pass, typecheck exit 0, grep empty.

- [ ] **Step 6: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add -A && git commit -m "feat(server): drop github command, opencode OAuth metadata, and app.opencode.ai UI proxy"
```

### Task R7: User-facing string sweep, CLI wordmark, `$schema` URLs, snapshot regen, final grep gate

**Files:**
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/cli/cmd/serve.ts` (:9, :20), `web.ts` (:34), `run.ts` (:128, :192), `tui.ts` (:74, :79), `attach.ts` (:9), `pr.ts` (:10, :74-92, :98, :101-104, :113), `uninstall.ts` (:27, :58, :232), `providers.ts` (:466-468, :474-478), `models.ts` (:23)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/cli/ui.ts` (wordmark lines 5-10, `logo()` lines 48-104, glyphs import line 3)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/session/llm/request.ts` (:18)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/src/config/config.ts` (:232-233, :254, :269, :383), `src/config/tui-migrate.ts` (:11)
- Modify `/Users/mac/Project/oa-cli/packages/opencode/test/config/config.test.ts` (:317)
- Modify `/Users/mac/Project/oa-cli/packages/tui/src/feature-plugins/home/tips-view.tsx` (:170, :236-249, :262-264, :267, :277-278)
- Regenerate `/Users/mac/Project/oa-cli/packages/opencode/test/cli/help/__snapshots__/help-snapshots.test.ts.snap`

**Interfaces:**
- Produces: every yargs `describe` and printed banner in the touched commands says `OA-cli`/`oa-cli`; the CLI banner (`UI.logo()`) reads "OA-cli"; config files are seeded with `"$schema": "https://openagentic.id/config.json"` (filename stays `opencode.json(c)` in Fase 1); LLM request `User-Agent: oa-cli/<version>`.

- [ ] **Step 1: CLI describe/banner strings**
- `serve.ts:9` → `describe: "starts a headless OA-cli server",`; `serve.ts:20` → `` console.log(`oa-cli server listening on http://${server.hostname}:${server.port}`) `` (leave the `OPENCODE_SERVER_PASSWORD` warning text — it names a real env var).
- `web.ts:34` describe → `"start OA-cli server and open web interface"` (same env-var caveat).
- `run.ts:128` → `describe: "run OA-cli with a message",`; `run.ts:192` → `describe: "attach to a running OA-cli server (e.g., http://localhost:4096)",` (leave `:202` — it documents the real `OPENCODE_SERVER_USERNAME` default; leave `:952` `http://opencode.internal` and `:980` `$0: "opencode"` — internal identifiers, Fase 2).
- `tui.ts:74` → `describe: "start OA-cli tui",`; `tui.ts:79` → `describe: "path to start OA-cli in",` (leave `:246` `http://opencode.internal` — internal).
- `attach.ts:9` → `describe: "attach to a running OA-cli server",`.
- `uninstall.ts:27` → `describe: "uninstall OA-cli and remove all related files",`; `uninstall.ts:58` → `prompts.intro("Uninstall OA-cli")`; `uninstall.ts:232` → `prompts.log.success("Thank you for using OA-cli!")` (leave the package-manager uninstall command tables at :132-138/:183-195 — they remove legacy upstream installs and must keep the old names to work).
- `models.ts:23` → `describe: "refresh the models cache",` (models.dev is dead — provider-lock area).
- `providers.ts:466-468`: delete the block
```ts
    if (provider === "opencode") {
      yield* Prompt.log.info("Create an api key at https://opencode.ai/auth")
    }
```
(the `opencode` provider no longer exists after the provider-lock area; the rest of providers.ts is owned by the auth area).
- `providers.ts:474-478`: drop the upstream doc link from the Cloudflare hint (it would trip the final grep gate):
```ts
    if (["cloudflare", "cloudflare-ai-gateway"].includes(provider)) {
      yield* Prompt.log.info(
        "Cloudflare AI Gateway can be configured with CLOUDFLARE_GATEWAY_ID, CLOUDFLARE_ACCOUNT_ID, and CLOUDFLARE_API_TOKEN environment variables.",
      )
    }
```

- [ ] **Step 2: Rebrand the CLI wordmark in `src/cli/ui.ts`**
The help/upgrade/uninstall/web banners render an "opencode" ASCII wordmark. Delete line 3 (`import { logo as glyphs } from "./logo"`) and the `wordmark` array (lines 5-10), then replace the entire `logo()` function (lines 48-104) with:
```ts
export function logo(pad?: string) {
  const p = pad ?? ""
  const title = "OA-cli"
  const subtitle = "the OpenAgentic coding CLI"
  if (!process.stdout.isTTY && !process.stderr.isTTY) {
    return p + title + EOL + p + subtitle
  }
  const reset = "\x1b[0m"
  const primary = "\x1b[38;5;208m\x1b[1m" // brand orange #f97316 (xterm 208)
  const muted = "\x1b[90m"
  return p + primary + title + reset + EOL + p + muted + subtitle + reset
}
```
(`EOL` is already imported at line 1. `src/cli/logo.ts` stays — `src/cli/cmd/run/splash.ts` imports `go` from it; the glyph art it re-exports from `@opencode-ai/tui/logo` is owned by the TUI branding area.)
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun run --conditions=browser src/index.ts 2>&1 | head -4
```
Expected: banner shows `OA-cli` / `the OpenAgentic coding CLI`, no block-glyph "opencode" art.

- [ ] **Step 3: `pr.ts` — spawn `oa-cli`, drop opncd.ai session import**
- Line 10: `describe: "fetch and checkout a GitHub PR branch, then run OA-cli",`
- Delete the whole `if (prInfo?.body) { ... }` block (lines 74-92) that matches `https://opncd.ai/s/...` and runs `opencode import` (share is disabled; `sessionId` stays declared at line 52 as `let sessionId: string | undefined` and simply never set, so the `-s` plumbing below still compiles).
- Line 98: `UI.println("Starting OA-cli...")`
- Lines 101-104: rename var and spawn target:
```ts
    const cliArgs = sessionId ? ["-s", sessionId] : []
    const code = yield* Effect.promise(
      () =>
        Process.spawn(["oa-cli", ...cliArgs], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          cwd: process.cwd(),
        }).exited,
    )
```
- Line 113: `` if (code !== 0) return yield* Effect.die(new Error(`oa-cli exited with code ${code}`)) ``

- [ ] **Step 4: User-Agent + `$schema` URLs**
- `src/session/llm/request.ts:18`: `` const USER_AGENT = `oa-cli/${InstallationVersion}` ``
- `src/config/config.ts` — replace all five occurrences of `https://opencode.ai/config.json` (lines 232, 233, 254, 269, 383 — the last is the remote-config default) with `https://openagentic.id/config.json`. Lines 232-233 become:
```ts
        data.$schema = "https://openagentic.id/config.json"
        const updated = text.replace(/^\s*\{/, '{\n  "$schema": "https://openagentic.id/config.json",')
```
- `src/config/tui-migrate.ts:11`: `const TUI_SCHEMA_URL = "https://openagentic.id/tui.json"`
- `test/config/config.test.ts:317`: `expect(content).toContain('"$schema": "https://openagentic.id/config.json"')`
Run:
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/config/config.test.ts
```
Expected: pass (fixture inputs that still carry the old URL are inert pass-through values).

- [ ] **Step 5: TUI tips sweep (`packages/tui/src/feature-plugins/home/tips-view.tsx`)**
- Line 170: delete the tip `"Run {highlight}/share{/highlight} to create a public opencode.ai link",` (share disabled).
- Line 236: `"Create a plugin to prevent OA-cli from reading sensitive files",`
- Lines 237-245, replace `opencode` command names with `oa-cli` (line 240 `--format json` has no brand string but sits inside the replaced run — keep it identical):
```tsx
  "Use {highlight}oa-cli run{/highlight} for non-interactive scripting",
  "Use {highlight}oa-cli --continue{/highlight} to resume the last session",
  "Use {highlight}oa-cli run -f file.ts{/highlight} to attach files via CLI",
  "Use {highlight}--format json{/highlight} for machine-readable output in scripts",
  "Run {highlight}oa-cli serve{/highlight} for headless API access to OA-cli",
  "Use {highlight}oa-cli run --attach{/highlight} to connect to a running server",
  "Run {highlight}oa-cli upgrade{/highlight} to update to the latest version",
  "Run {highlight}oa-cli auth list{/highlight} to see all configured providers",
  "Run {highlight}oa-cli agent create{/highlight} for guided agent creation",
```
- Lines 246-249: delete all FOUR GitHub-agent tips (`"Use {highlight}/opencode{/highlight} in GitHub issues..."`, `"Run {highlight}opencode github install{/highlight}..."`, `"Comment {highlight}/opencode fix this{/highlight}..."`, `"Comment {highlight}/oc{/highlight} on PR code lines..."`) — the command was deleted in R6.
- Lines 262-264: delete the three share tips (`'Set {highlight}"share": "auto"{/highlight}...'`, `'Set {highlight}"share": "disabled"{/highlight}...'`, `"Run {highlight}/unshare{/highlight}..."`) — sharing is hard-disabled in R5.
- Line 267: `"Run {highlight}oa-cli debug config{/highlight} to troubleshoot configuration",`
- Lines 277-278: delete the docker tip (`"Run {highlight}docker run -it --rm ghcr.io/anomalyco/opencode{/highlight} in a container",` — upstream image) and the OpenCode Zen tip (`"Use {highlight}/connect{/highlight} with OpenCode Zen for curated, tested models",` — upstream service).
- Leave `.opencode/` directory tips and `opencode.json` filename tips untouched (real paths/filenames in Fase 1).

- [ ] **Step 6: Regenerate help snapshots**
In `test/cli/help/help-snapshots.test.ts` line 132, update the snapshot label for readability:
```ts
          expect(normalize(result.stderr)).toMatchSnapshot(`oa-cli ${argv.join(" ")} --help`)
```
Then delete the stale snapshot file and regenerate:
```bash
cd /Users/mac/Project/oa-cli/packages/opencode && rm test/cli/help/__snapshots__/help-snapshots.test.ts.snap && bun test test/cli/help
```
Expected: 1 pass (snapshots written fresh). Sanity-check the new snapshot:
```bash
grep -c "oa-cli" test/cli/help/__snapshots__/help-snapshots.test.ts.snap && grep -cw "opencode [a-z]" test/cli/help/__snapshots__/help-snapshots.test.ts.snap || true
```
Expected: first grep large (>50), second grep `0` (remaining "opencode" hits are only env-var names like `OPENCODE_SERVER_USERNAME`, the quoted `'opencode'` username default, and `opencode.local` mDNS default, all Fase 2).

- [ ] **Step 7: Full verification gate**
```bash
bun run --cwd /Users/mac/Project/oa-cli/packages/opencode typecheck
cd /Users/mac/Project/oa-cli/packages/opencode && bun test test/installation test/session/retry.test.ts test/server/httpapi-ui.test.ts test/config/config.test.ts test/cli/help test/cli/github-action.test.ts test/cli/github-remote.test.ts
bun run --conditions=browser src/index.ts --help 2>&1 | head -5
```
Expected: typecheck 0; all listed tests pass; help shows `oa-cli <command>` usage.
Final phone-home/branding grep:
```bash
cd /Users/mac/Project/oa-cli && grep -rn "opencode\.ai\|opncd\.ai\|console\.opencode\|models\.dev" packages/opencode/src packages/tui/src --include="*.ts" --include="*.tsx"
```
Expected — ONLY these hits remain, each owned elsewhere (fail the task if anything else appears):
- `packages/opencode/src/provider/provider.ts` — `HTTP-Referer: https://opencode.ai/` (6x, lines 461/472/482/493/599/857) + models.dev comments (371, 500) → provider-lock area retargets to openagentic.id
- `packages/opencode/src/cli/cmd/account.ts:18` — `console.opencode.ai` → auth area deletes/replaces `ConsoleCommand`
- `packages/opencode/src/share/share-next.ts:210` — `opncd.ai` fallback, unreachable behind `disabled = true` (deleted with the service in Fase 2)
- `packages/opencode/src/cli/cmd/import.ts:27` — opncd.ai in a comment + dead share importer (Fase 2 prune)
- `packages/opencode/src/session/session.ts:400` — models.dev comment only
- `packages/tui/src/app.tsx:822` (docs link), `packages/tui/src/component/dialog-provider.tsx:378,389`, `packages/tui/src/component/dialog-retry-action.tsx:10` — TUI branding/auth-gate area rewrites these screens
Anything outside this list = missed edit; fix before committing. (The glyph "opencode" wordmark in `@opencode-ai/tui/logo` — used by the TUI splash via `src/cli/cmd/run/splash.ts` — is not caught by this grep and is owned by the TUI branding area.)

- [ ] **Step 8: Commit**
```bash
cd /Users/mac/Project/oa-cli && git add -A && git commit -m "feat(branding): sweep user-facing opencode strings to OA-cli and openagentic.id schema URLs"
```
### Task R8: Sapu kode mati TUI pasca-disable share & upsell

Setelah R5 (hapus upsell `/go`) dan R6 (hard-disable share), sisa kode TUI yang mengonsumsinya jadi mati tapi masih ter-compile. Task ini deletion-only — verifikasi via grep + typecheck.

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/tui/src/routes/session/index.tsx` (blok penanganan `GO_UPSELL_*`)
- Modify: `/Users/mac/Project/oa-cli/packages/tui/src/ui/dialog-retry-action.tsx` (konstanta `GO_URL` + aksi yang memakainya)
- Modify: file registrasi command `/share` di TUI (temukan via grep di Step 1)

**Interfaces:**
- Consumes: hasil R5/R6 (upsell & share sudah mati di sisi `packages/opencode`)
- Produces: `packages/tui` bebas referensi share/upsell — tidak ada command TUI yang menghasilkan URL kosong

- [ ] **Step 1: Inventaris titik referensi**

```bash
cd /Users/mac/Project/oa-cli
grep -rn "GO_UPSELL\|GO_URL" packages/tui/src
grep -rn "\"share\"\|'share'\|/share" packages/tui/src --include="*.tsx" --include="*.ts" -l
```

Expected: daftar berisi `routes/session/index.tsx`, `ui/dialog-retry-action.tsx`, dan 1-3 file registrasi command/keybind share (mis. command palette / commands registry). Catat setiap file.

- [ ] **Step 2: Hapus blok-blok tersebut**

Untuk setiap hit Step 1: hapus (a) blok kondisional `GO_UPSELL_*` di `routes/session/index.tsx` beserta import yang menjadi yatim, (b) `GO_URL` dan action retry yang membukanya di `dialog-retry-action.tsx` (biarkan action retry lain utuh), (c) entri command `/share` dari registry command + keybind terkait + string help yang menyebutnya. Jangan hapus fungsionalitas retry/dialog lain di file yang sama.

- [ ] **Step 3: Verifikasi**

```bash
cd /Users/mac/Project/oa-cli
grep -rn "GO_UPSELL\|GO_URL" packages/tui/src ; echo "exit=$?"
cd packages/tui && bun run typecheck
```

Expected: grep tidak menghasilkan apa pun (`exit=1`), typecheck lulus tanpa error.

- [ ] **Step 4: Commit**

```bash
cd /Users/mac/Project/oa-cli
git add packages/tui
git commit -m "chore(tui): remove dead share command and go-upsell code"
```

---

## Area M — Mock server openagentic + test integrasi e2e + README/NOTICE

### Task M1: Reusable openagentic mock server fixture

**Files:**
- Create: `/Users/mac/Project/oa-cli/packages/opencode/test/fixtures/openagentic-mock.ts`
- Create (test): `/Users/mac/Project/oa-cli/packages/opencode/test/fixtures/openagentic-mock.test.ts`
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/test/preload.ts` (env hygiene — anchor: the "Clear provider and server auth env vars" `delete process.env[...]` block, line 78 `delete process.env["OPENCODE_SERVER_PASSWORD"]`)

**Interfaces:**
- Consumes: nothing from src/ — pure Bun test utility (`Bun.serve`, `node:crypto`). Note: `test/fixtures/` (plural) currently holds only `recordings/`; the Effect test scaffolding lives in `test/fixture/` (singular) — do not confuse the two.
- Produces (other areas MUST align with these — they are the local stand-in for the backend contract in spec §7):
  - `startOpenagenticMock(options?: { corruptState?: boolean }): OpenagenticMock` where `OpenagenticMock = { url: string; requests: { method: string; path: string }[]; failWith(mode: "invalid_key" | "plan_required" | "quota_exceeded" | "rate_limited" | undefined): void; close(): void }`
  - `MOCK_API_KEY = "oa-test-key"`, `MOCK_USER = { email: "test@openagentic.id", name: "Test User", plan: "free" }`, `MOCK_MODELS` (3 models, exactly one `default: true`)
  - Error envelope produced by the mock (and expected from the real backend): `{ error: { code, message, model?, required_plan?, retry_after? } }` with statuses 401 `invalid_key`, 403 `plan_required`, 429 `quota_exceeded`/`rate_limited`
  - **Env contract `OPENAGENTIC_BASE_URL`**: origin only, no trailing slash (e.g. `http://127.0.0.1:49321`), default `https://openagentic.id`. BOTH `packages/opencode/src/auth/openagentic.ts` (auth area) and the openagentic `discoverModels` loader + chat `baseURL` in `packages/opencode/src/provider/provider.ts` (provider-lock area) MUST resolve their base as `process.env["OPENAGENTIC_BASE_URL"] ?? "https://openagentic.id"` (paths appended: `/auth/cli`, `/api/v1/cli/token`, `/api/v1/models`, `/api/v1/chat/completions`). Every test in this area depends on it.

- [ ] **Step 1: Write the failing self-test for the mock**

Create `/Users/mac/Project/oa-cli/packages/opencode/test/fixtures/openagentic-mock.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import { MOCK_API_KEY, MOCK_MODELS, startOpenagenticMock, type OpenagenticMock } from "./openagentic-mock"

let mock: OpenagenticMock | undefined
afterEach(() => {
  mock?.close()
  mock = undefined
})

function pkce() {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

async function authorize(server: OpenagenticMock, challenge: string, state = "test-state") {
  const url = new URL(`${server.url}/auth/cli`)
  url.searchParams.set("redirect_uri", "http://127.0.0.1:59999/callback")
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  const res = await fetch(url, { redirect: "manual" })
  expect(res.status).toBe(302)
  return new URL(res.headers.get("location")!)
}

describe("openagentic mock", () => {
  test("/auth/cli redirects to the loopback with code and echoed state", async () => {
    mock = startOpenagenticMock()
    const { challenge } = pkce()
    const location = await authorize(mock, challenge, "abc123")
    expect(location.origin).toBe("http://127.0.0.1:59999")
    expect(location.pathname).toBe("/callback")
    expect(location.searchParams.get("state")).toBe("abc123")
    expect(location.searchParams.get("code")).toBeTruthy()
  })

  test("/auth/cli rejects non-loopback redirect_uri", async () => {
    mock = startOpenagenticMock()
    const url = new URL(`${mock.url}/auth/cli`)
    url.searchParams.set("redirect_uri", "https://evil.example.com/callback")
    url.searchParams.set("state", "s")
    url.searchParams.set("code_challenge", "c")
    const res = await fetch(url, { redirect: "manual" })
    expect(res.status).toBe(400)
  })

  test("token exchange verifies PKCE and is single-use", async () => {
    mock = startOpenagenticMock()
    const { verifier, challenge } = pkce()
    const location = await authorize(mock, challenge)
    const code = location.searchParams.get("code")!
    const exchange = (body: unknown) =>
      fetch(`${mock!.url}/api/v1/cli/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

    const ok = await exchange({ code, code_verifier: verifier })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({
      api_key: MOCK_API_KEY,
      user: { email: "test@openagentic.id", name: "Test User", plan: "free" },
    })

    const reused = await exchange({ code, code_verifier: verifier })
    expect(reused.status).toBe(400)
    const body = (await reused.json()) as { error: { code: string } }
    expect(body.error.code).toBe("invalid_grant")
  })

  test("token exchange rejects a wrong code_verifier with invalid_grant", async () => {
    mock = startOpenagenticMock()
    const { challenge } = pkce()
    const location = await authorize(mock, challenge)
    const res = await fetch(`${mock.url}/api/v1/cli/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: location.searchParams.get("code"), code_verifier: "not-the-right-verifier" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe("invalid_grant")
  })

  test("/api/v1/models requires the API key and returns exactly one default model", async () => {
    mock = startOpenagenticMock()
    const denied = await fetch(`${mock.url}/api/v1/models`)
    expect(denied.status).toBe(401)

    const res = await fetch(`${mock.url}/api/v1/models`, {
      headers: { authorization: `Bearer ${MOCK_API_KEY}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: typeof MOCK_MODELS }
    expect(body.data).toEqual(MOCK_MODELS)
    expect(body.data.filter((m) => m.default)).toHaveLength(1)
  })

  test("/api/v1/chat/completions streams an OpenAI-compatible completion", async () => {
    mock = startOpenagenticMock()
    const res = await fetch(`${mock.url}/api/v1/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${MOCK_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-5", messages: [{ role: "user", content: "halo" }], stream: true }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    const text = await res.text()
    expect(text).toContain('"content":"Halo dari OpenAgentic!"')
    expect(text.trim().endsWith("data: [DONE]")).toBe(true)
  })

  test("failure modes return the structured error contract", async () => {
    mock = startOpenagenticMock()
    const models = () =>
      fetch(`${mock!.url}/api/v1/models`, { headers: { authorization: `Bearer ${MOCK_API_KEY}` } })

    mock.failWith("invalid_key")
    let res = await models()
    expect(res.status).toBe(401)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_key")

    mock.failWith("plan_required")
    res = await models()
    expect(res.status).toBe(403)
    const plan = (await res.json()) as { error: { code: string; model: string; required_plan: string } }
    expect(plan.error.code).toBe("plan_required")
    expect(plan.error.model).toBe("gpt-5")
    expect(plan.error.required_plan).toBe("pro")

    mock.failWith("quota_exceeded")
    res = await models()
    expect(res.status).toBe(429)
    const quota = (await res.json()) as { error: { code: string; retry_after: number } }
    expect(quota.error.code).toBe("quota_exceeded")
    expect(quota.error.retry_after).toBe(3600)

    mock.failWith(undefined)
    res = await models()
    expect(res.status).toBe(200)
  })
})
```

Run (expected to FAIL — module does not exist yet). Note: tests must be run from `packages/opencode` — the root `bunfig.toml` sets `[test] root = "./do-not-run-tests-from-root"`, and the package-local `bunfig.toml` wires `test/preload.ts`:

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/fixtures/openagentic-mock.test.ts
```

Expected output: `error: Cannot find module './openagentic-mock'`.

- [ ] **Step 2: Implement the mock server**

Create `/Users/mac/Project/oa-cli/packages/opencode/test/fixtures/openagentic-mock.ts`:

```ts
// Local stand-in for the openagentic.id backend (spec §7). Serves the four
// endpoints OA-cli talks to, plus switchable failure modes for the structured
// error contract (§7-8). Point the CLI at it via OPENAGENTIC_BASE_URL.
import { createHash, randomBytes } from "node:crypto"

export const MOCK_API_KEY = "oa-test-key"

export const MOCK_USER = {
  email: "test@openagentic.id",
  name: "Test User",
  plan: "free",
}

export const MOCK_MODELS = [
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", provider: "anthropic", context_limit: 200_000, default: true },
  { id: "gpt-5", name: "GPT-5", provider: "openai", context_limit: 400_000, default: false },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google", context_limit: 1_048_576, default: false },
]

export type FailureMode = "invalid_key" | "plan_required" | "quota_exceeded" | "rate_limited"

export interface OpenagenticMockOptions {
  /** Redirect back to the CLI callback with a wrong `state` (state-mismatch tests). */
  corruptState?: boolean
}

export interface OpenagenticMock {
  /** Origin, e.g. http://127.0.0.1:49321 — assign to process.env.OPENAGENTIC_BASE_URL */
  readonly url: string
  /** Every request received, in order. */
  readonly requests: { method: string; path: string }[]
  /** Force /api/v1/models and /api/v1/chat/completions to return the structured error. Pass undefined to restore. */
  failWith(mode: FailureMode | undefined): void
  close(): void
}

function s256(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function failureResponse(mode: FailureMode) {
  switch (mode) {
    case "invalid_key":
      return json(401, { error: { code: "invalid_key", message: "API key is invalid or has been revoked" } })
    case "plan_required":
      return json(403, {
        error: {
          code: "plan_required",
          message: "Model gpt-5 requires the pro plan",
          model: "gpt-5",
          required_plan: "pro",
        },
      })
    case "quota_exceeded":
      return json(429, { error: { code: "quota_exceeded", message: "Daily quota exceeded", retry_after: 3600 } })
    case "rate_limited":
      return json(429, { error: { code: "rate_limited", message: "Too many requests", retry_after: 30 } })
  }
}

function sseCompletion(model: string) {
  const line = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`
  const chunk = (delta: Record<string, unknown>, finish: string | null = null, usage?: Record<string, number>) => ({
    id: "chatcmpl-mock",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  })
  return (
    line(chunk({ role: "assistant" })) +
    line(chunk({ content: "Halo dari OpenAgentic!" })) +
    line(chunk({}, "stop", { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 })) +
    "data: [DONE]\n\n"
  )
}

export function startOpenagenticMock(options: OpenagenticMockOptions = {}): OpenagenticMock {
  let failure: FailureMode | undefined
  const codes = new Map<string, string>() // authorization code -> code_challenge
  const requests: { method: string; path: string }[] = []

  const authed = (req: Request) => req.headers.get("authorization") === `Bearer ${MOCK_API_KEY}`

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      requests.push({ method: req.method, path: url.pathname })

      if (req.method === "GET" && url.pathname === "/auth/cli") {
        const redirect = url.searchParams.get("redirect_uri")
        const state = url.searchParams.get("state")
        const challenge = url.searchParams.get("code_challenge")
        if (!redirect || !state || !challenge)
          return json(400, {
            error: { code: "invalid_request", message: "redirect_uri, state and code_challenge are required" },
          })
        const target = new URL(redirect)
        if (target.protocol !== "http:" || target.hostname !== "127.0.0.1")
          return json(400, { error: { code: "invalid_request", message: "redirect_uri must be http://127.0.0.1" } })
        const code = randomBytes(16).toString("hex")
        codes.set(code, challenge)
        target.searchParams.set("code", code)
        target.searchParams.set("state", options.corruptState ? "corrupted-state" : state)
        return Response.redirect(target.toString(), 302)
      }

      if (req.method === "POST" && url.pathname === "/api/v1/cli/token") {
        const body = (await req.json().catch(() => ({}))) as { code?: string; code_verifier?: string }
        const challenge = body.code ? codes.get(body.code) : undefined
        if (!body.code || !body.code_verifier || !challenge || s256(body.code_verifier) !== challenge)
          return json(400, {
            error: { code: "invalid_grant", message: "code expired, already used, or PKCE verification failed" },
          })
        codes.delete(body.code)
        return json(200, { api_key: MOCK_API_KEY, user: MOCK_USER })
      }

      if (req.method === "GET" && url.pathname === "/api/v1/models") {
        if (failure) return failureResponse(failure)
        if (!authed(req)) return json(401, { error: { code: "invalid_key", message: "missing or invalid API key" } })
        return json(200, { data: MOCK_MODELS })
      }

      if (req.method === "POST" && url.pathname === "/api/v1/chat/completions") {
        if (failure) return failureResponse(failure)
        if (!authed(req)) return json(401, { error: { code: "invalid_key", message: "missing or invalid API key" } })
        const body = (await req.json().catch(() => ({}))) as { model?: string }
        return new Response(sseCompletion(body.model ?? "claude-sonnet-4-5"), {
          headers: { "content-type": "text/event-stream" },
        })
      }

      return json(404, { error: { code: "not_found", message: url.pathname } })
    },
  })

  return {
    url: `http://127.0.0.1:${server.port}`,
    requests,
    failWith(mode) {
      failure = mode
    },
    close() {
      server.stop(true)
    },
  }
}
```

- [ ] **Step 3: Run the self-test green**

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/fixtures/openagentic-mock.test.ts
```

Expected output (verified against this repo's bun 1.3.14):

```
 7 pass
 0 fail
 32 expect() calls
Ran 7 tests across 1 file.
```

- [ ] **Step 4: Isolate openagentic env vars in the test preload**

In `/Users/mac/Project/oa-cli/packages/opencode/test/preload.ts`, inside the existing "Clear provider and server auth env vars to ensure clean test state" block, insert directly above line 78 `delete process.env["OPENCODE_SERVER_PASSWORD"]`:

```ts
delete process.env["OPENAGENTIC_API_KEY"]
delete process.env["OPENAGENTIC_BASE_URL"]
```

Verify nothing broke:

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/fixtures/openagentic-mock.test.ts
```

Expected: ` 7 pass`, ` 0 fail`.

- [ ] **Step 5: Commit**

```bash
cd /Users/mac/Project/oa-cli && git add packages/opencode/test/fixtures/openagentic-mock.ts packages/opencode/test/fixtures/openagentic-mock.test.ts packages/opencode/test/preload.ts && git commit -m "test: add openagentic mock server fixture

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task M2: Login-flow integration test (OpenagenticAuth against the mock)

**Files:**
- Create (test): `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic-login.test.ts` (dir exists; currently holds only `auth.test.ts`)

**Interfaces:**
- Consumes: `OpenagenticAuth` from `packages/opencode/src/auth/openagentic.ts` (auth area): `login(opts?: { onUrl?: (url: string) => void }): Promise<{ key: string; user: { email: string; name: string; plan: string } }>`, `logout(): Promise<void>`. **Coordination requirement for the auth area:** when `opts.onUrl` is provided, `login()` MUST invoke it with the authorize URL *instead of* launching a real browser (otherwise this test opens the developer's actual browser), and it must read `OPENAGENTIC_BASE_URL` (see Task M1 Produces). Also consumes `Global.Path.data` (`@opencode-ai/core/global`, re-exported via `export * as Global` — same import as `src/auth/index.ts:5`) — XDG-isolated by `test/preload.ts`, so `auth.json` lands in a temp dir.
- Produces: e2e proof of spec §4 flow (gate → browser → callback → token exchange → key stored). This file is an acceptance test for the auth area; it fails until that area lands.

- [ ] **Step 1: Write the login integration tests**

Create `/Users/mac/Project/oa-cli/packages/opencode/test/auth/openagentic-login.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { OpenagenticAuth } from "../../src/auth/openagentic"
import { MOCK_API_KEY, startOpenagenticMock, type OpenagenticMock } from "../fixtures/openagentic-mock"

let mock: OpenagenticMock | undefined
let previousBase: string | undefined

beforeEach(() => {
  previousBase = process.env["OPENAGENTIC_BASE_URL"]
})

afterEach(async () => {
  // keep the process-shared auth.json clean for unrelated tests in the same run
  await OpenagenticAuth.logout().catch(() => {})
  mock?.close()
  mock = undefined
  if (previousBase === undefined) delete process.env["OPENAGENTIC_BASE_URL"]
  else process.env["OPENAGENTIC_BASE_URL"] = previousBase
})

const authFile = () => path.join(Global.Path.data, "auth.json")

// Simulates the user's browser: GET the authorize URL; fetch follows the mock's
// 302 back to the CLI's loopback callback server automatically. Swallow the
// rejection — on the state-mismatch path the callback response is an error page
// and we must not turn that into an unhandled rejection.
const browser = (url: string) => {
  fetch(url).catch(() => {})
}

describe("OpenagenticAuth", () => {
  test("login() completes the PKCE loopback flow, stores the key, and returns the user", async () => {
    mock = startOpenagenticMock()
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    const result = await OpenagenticAuth.login({ onUrl: browser })

    expect(result.key).toBe(MOCK_API_KEY)
    expect(result.user).toEqual({ email: "test@openagentic.id", name: "Test User", plan: "free" })

    const data = (await Bun.file(authFile()).json()) as Record<string, unknown>
    expect(data["openagentic"]).toEqual({ type: "api", key: MOCK_API_KEY })

    // the CLI actually exchanged the code server-side
    expect(mock.requests.some((r) => r.method === "POST" && r.path === "/api/v1/cli/token")).toBe(true)
  })

  test("login() rejects when the callback state does not match", async () => {
    mock = startOpenagenticMock({ corruptState: true })
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    await expect(OpenagenticAuth.login({ onUrl: browser })).rejects.toThrow()
    // no token exchange must happen on state mismatch
    expect(mock.requests.some((r) => r.path === "/api/v1/cli/token")).toBe(false)
  })

  test("logout() removes the stored credential", async () => {
    mock = startOpenagenticMock()
    process.env["OPENAGENTIC_BASE_URL"] = mock.url

    await OpenagenticAuth.login({ onUrl: browser })
    await OpenagenticAuth.logout()

    const data = (await Bun.file(authFile()).json()) as Record<string, unknown>
    expect(data["openagentic"]).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run (failing until the auth area lands, green after)**

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/auth/openagentic-login.test.ts
```

Expected BEFORE `src/auth/openagentic.ts` exists: `error: Cannot find module '../../src/auth/openagentic'`. Expected AFTER: ` 3 pass`, ` 0 fail`. Do not commit until green.

- [ ] **Step 3: Commit**

```bash
cd /Users/mac/Project/oa-cli && git add packages/opencode/test/auth/openagentic-login.test.ts && git commit -m "test: cover openagentic login flow end-to-end against mock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task M3: Model-discovery + chat round-trip integration tests through the provider

**Files:**
- Modify: `/Users/mac/Project/oa-cli/packages/opencode/test/tool/fixtures/models-api.json` (append one `"openagentic"` provider entry at the end of the top-level object — this ~172k-line file is the models database in tests via `OPENCODE_MODELS_PATH` set in `test/preload.ts:38`; today it holds 159 providers keyed by id)
- Create (test): `/Users/mac/Project/oa-cli/packages/opencode/test/provider/openagentic.test.ts`

**Interfaces:**
- Consumes: `Provider.Service` (`packages/opencode/src/provider/provider.ts`) with the provider-lock area's `openagentic` custom loader registered (a `discoverModels` loader — same hook the gitlab loader uses, registered via `result.discoverModels` → `discoveryLoaders` at `provider.ts:1570`; **the provider-lock area must also invoke it during state build for `openagentic`**, mirroring the hardcoded gitlab discovery block at `provider.ts:~1593`). Discovery via `GET {OPENAGENTIC_BASE_URL}/api/v1/models`, chat `baseURL = {OPENAGENTIC_BASE_URL}/api/v1`, auth read from Auth key `"openagentic"` — `OPENCODE_AUTH_CONTENT` env works because `Auth.all` reads it first (`packages/opencode/src/auth/index.ts:59-63`). Test scaffolding mirrors `test/provider/header-timeout.test.ts` exactly: `testEffect` (`test/lib/effect.ts`), `LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, CrossSpawnSpawner.node]))`, `provideTmpdirInstance`/`disposeAllInstances` (`test/fixture/fixture.ts`), and the `Effect.acquireUseRelease` env-swap idiom from that file's `withAuthContent`.
- Produces: acceptance tests for spec §5 (catalog lock + dynamic models + server-side default) and §9.2 (chat round-trip, 401 mid-session). Fails until the provider-lock area lands.

- [ ] **Step 1: Register `openagentic` in the test models database fixture**

The custom-loader loop in `provider.ts` skips providers absent from the database (`provider.ts:1567`: `const data = database[providerID]; if (!data) continue`), and tests load the database from `test/tool/fixtures/models-api.json`. Append the entry textually (do NOT re-serialize the whole file — keep the diff to a few lines):

```bash
cd /Users/mac/Project/oa-cli && bun -e '
const file = "packages/opencode/test/tool/fixtures/models-api.json"
const text = await Bun.file(file).text()
if (text.includes("\"openagentic\"")) { console.log("already present"); process.exit(0) }
const entry = `,
  "openagentic": {
    "id": "openagentic",
    "env": ["OPENAGENTIC_API_KEY"],
    "npm": "@ai-sdk/openai-compatible",
    "api": "https://openagentic.id/api/v1",
    "name": "OpenAgentic",
    "models": {}
  }
}`
await Bun.write(file, text.replace(/\}\s*$/, entry + "\n"))
console.log("added openagentic")
' && bun -e 'JSON.parse(await Bun.file("packages/opencode/test/tool/fixtures/models-api.json").text()); console.log("json valid")'
```

Expected output: `added openagentic` then `json valid`. (`"models": {}` is valid — `ModelsDev.Provider` at `packages/core/src/models-dev.ts:117-124` requires only `name`, `env`, `id`, `models`; the model list comes from discovery. This exact script was dry-run-verified against a copy of the fixture: result parses with 160 providers.)

- [ ] **Step 2: Write the integration tests**

Create `/Users/mac/Project/oa-cli/packages/opencode/test/provider/openagentic.test.ts`:

```ts
import { afterEach, expect } from "bun:test"
import { APICallError, streamText } from "ai"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect } from "effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"
import { MOCK_API_KEY, startOpenagenticMock, type OpenagenticMock } from "../fixtures/openagentic-mock"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, CrossSpawnSpawner.node])),
)

const acquireMock = Effect.acquireRelease(
  Effect.sync(() => startOpenagenticMock()),
  (mock) => Effect.sync(() => mock.close()),
)

// Point the CLI at the mock and pretend the user is logged in. Must wrap
// instance creation: the provider state (and model discovery) is built then.
// Same acquireUseRelease idiom as withAuthContent in header-timeout.test.ts.
const withOpenagenticEnv = <A, E, R>(mock: OpenagenticMock, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = {
        auth: process.env["OPENCODE_AUTH_CONTENT"],
        base: process.env["OPENAGENTIC_BASE_URL"],
      }
      process.env["OPENCODE_AUTH_CONTENT"] = JSON.stringify({ openagentic: { type: "api", key: MOCK_API_KEY } })
      process.env["OPENAGENTIC_BASE_URL"] = mock.url
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous.auth === undefined) delete process.env["OPENCODE_AUTH_CONTENT"]
        else process.env["OPENCODE_AUTH_CONTENT"] = previous.auth
        if (previous.base === undefined) delete process.env["OPENAGENTIC_BASE_URL"]
        else process.env["OPENAGENTIC_BASE_URL"] = previous.base
      }),
  )

it.live("discovers models from /api/v1/models and applies the server-side default", () =>
  Effect.gen(function* () {
    const mock = yield* acquireMock
    yield* withOpenagenticEnv(
      mock,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const info = yield* provider.getProvider(ProviderV2.ID.make("openagentic"))
          expect(Object.keys(info.models).sort()).toEqual(["claude-sonnet-4-5", "gemini-2.5-pro", "gpt-5"])
          const def = yield* provider.defaultModel()
          expect(def).toEqual({ providerID: "openagentic", modelID: "claude-sonnet-4-5" })
        }),
      ),
    )
  }),
)

it.live("chat round-trip through the openagentic provider streams the mock completion", () =>
  Effect.gen(function* () {
    const mock = yield* acquireMock
    yield* withOpenagenticEnv(
      mock,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          const model = yield* provider.getModel(
            ProviderV2.ID.make("openagentic"),
            ModelV2.ID.make("claude-sonnet-4-5"),
          )
          const result = streamText({
            model: yield* provider.getLanguage(model),
            messages: [{ role: "user", content: "halo" }],
          })
          expect(yield* Effect.promise(() => result.text)).toBe("Halo dari OpenAgentic!")
          expect(mock.requests.some((r) => r.method === "POST" && r.path === "/api/v1/chat/completions")).toBe(true)
        }),
      ),
    )
  }),
)

it.live("401 invalid_key mid-session surfaces as an APICallError with the contract body", () =>
  Effect.gen(function* () {
    const mock = yield* acquireMock
    yield* withOpenagenticEnv(
      mock,
      provideTmpdirInstance(() =>
        Effect.gen(function* () {
          const provider = yield* Provider.Service
          // discovery ran while the mock was healthy; now the key gets revoked
          const model = yield* provider.getModel(
            ProviderV2.ID.make("openagentic"),
            ModelV2.ID.make("claude-sonnet-4-5"),
          )
          mock.failWith("invalid_key")
          const result = streamText({
            model: yield* provider.getLanguage(model),
            onError() {},
            messages: [{ role: "user", content: "halo" }],
          })
          const error = yield* Effect.promise(async () => {
            for await (const part of result.fullStream) {
              if (part.type === "error") return part.error
            }
          })
          expect(APICallError.isInstance(error)).toBe(true)
          if (!APICallError.isInstance(error)) throw new Error("Expected APICallError")
          expect(error.statusCode).toBe(401)
          expect(error.responseBody ?? "").toContain("invalid_key")
        }),
      ),
    )
  }),
)
```

- [ ] **Step 3: Run (failing until the provider-lock area lands, green after)**

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/provider/openagentic.test.ts
```

Expected BEFORE the provider-lock area lands: 3 failures (`ModelNotFoundError` for `openagentic/claude-sonnet-4-5`, or empty `info.models`). Expected AFTER: ` 3 pass`, ` 0 fail`. Do not commit until green.

- [ ] **Step 4: Commit**

```bash
cd /Users/mac/Project/oa-cli && git add packages/opencode/test/tool/fixtures/models-api.json packages/opencode/test/provider/openagentic.test.ts && git commit -m "test: cover openagentic model discovery and chat round-trip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task M4: Structured-error-contract tests (401/403/429 → friendly messages)

**Files:**
- Create (test): `/Users/mac/Project/oa-cli/packages/opencode/test/provider/openagentic-errors.test.ts`

**Interfaces:**
- Consumes (**coordination requirement for the error-mapping area** — this exact module/shape must exist): `packages/opencode/src/provider/openagentic-error.ts` exporting namespace `OpenagenticError` with:
  - `type Info = { code: "invalid_key" } | { code: "plan_required"; model?: string; required_plan?: string } | { code: "quota_exceeded"; retry_after?: number } | { code: "rate_limited"; retry_after?: number }`
  - `parse(status: number, body: unknown): Info | undefined` — parses the `{ error: { code, ... } }` envelope; `undefined` for anything off-contract
  - `message(info: Info): string` — the friendly strings from spec §8 (plan_required must mention the model, the plan, and `openagentic.id/pricing`; quota must include reset info when `retry_after` is present; invalid_key must tell the user to log in again)
- Produces: contract tests proving the mock's wire format and the CLI's parser/messages agree — the mock is the contract for the real backend (spec §13).

- [ ] **Step 1: Write the error-mapping tests against live mock responses**

Create `/Users/mac/Project/oa-cli/packages/opencode/test/provider/openagentic-errors.test.ts`:

```ts
import { afterEach, describe, expect, test } from "bun:test"
import { OpenagenticError } from "@/provider/openagentic-error"
import { MOCK_API_KEY, startOpenagenticMock, type FailureMode, type OpenagenticMock } from "../fixtures/openagentic-mock"

let mock: OpenagenticMock | undefined
afterEach(() => {
  mock?.close()
  mock = undefined
})

async function parseFailure(mode: FailureMode) {
  mock = startOpenagenticMock()
  mock.failWith(mode)
  const res = await fetch(`${mock.url}/api/v1/models`, { headers: { authorization: `Bearer ${MOCK_API_KEY}` } })
  return { status: res.status, info: OpenagenticError.parse(res.status, await res.json()) }
}

describe("OpenagenticError", () => {
  test("401 invalid_key parses and maps to a re-login message", async () => {
    const { status, info } = await parseFailure("invalid_key")
    expect(status).toBe(401)
    expect(info?.code).toBe("invalid_key")
    expect(OpenagenticError.message(info!).toLowerCase()).toContain("login")
  })

  test("403 plan_required carries model + required_plan and links pricing", async () => {
    const { status, info } = await parseFailure("plan_required")
    expect(status).toBe(403)
    expect(info).toEqual({ code: "plan_required", model: "gpt-5", required_plan: "pro" })
    const message = OpenagenticError.message(info!)
    expect(message).toContain("gpt-5")
    expect(message).toContain("pro")
    expect(message).toContain("openagentic.id/pricing")
  })

  test("429 quota_exceeded carries retry_after into the message", async () => {
    const { status, info } = await parseFailure("quota_exceeded")
    expect(status).toBe(429)
    expect(info).toEqual({ code: "quota_exceeded", retry_after: 3600 })
    expect(OpenagenticError.message(info!)).toContain("openagentic.id/pricing")
  })

  test("429 rate_limited parses distinctly from quota_exceeded", async () => {
    const { info } = await parseFailure("rate_limited")
    expect(info).toEqual({ code: "rate_limited", retry_after: 30 })
  })

  test("off-contract responses return undefined (no fake friendly messages)", () => {
    expect(OpenagenticError.parse(500, { error: "boom" })).toBeUndefined()
    expect(OpenagenticError.parse(200, { data: [] })).toBeUndefined()
    expect(OpenagenticError.parse(401, "not json shaped")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run (failing until the error-mapping module lands, green after)**

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/provider/openagentic-errors.test.ts
```

Expected BEFORE `src/provider/openagentic-error.ts` exists: `error: Cannot find module '@/provider/openagentic-error'`. Expected AFTER: ` 5 pass`, ` 0 fail`. Do not commit until green.

- [ ] **Step 3: Commit**

```bash
cd /Users/mac/Project/oa-cli && git add packages/opencode/test/provider/openagentic-errors.test.ts && git commit -m "test: cover openagentic structured error contract mapping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task M5: README rewrite (OA-cli, Indonesian), delete translated READMEs, add NOTICE

**Files:**
- Modify (full rewrite): `/Users/mac/Project/oa-cli/README.md`
- Create: `/Users/mac/Project/oa-cli/NOTICE`
- Delete: the 21 translated files `README.ar.md, README.bn.md, README.br.md, README.bs.md, README.da.md, README.de.md, README.es.md, README.fr.md, README.gr.md, README.it.md, README.ja.md, README.ko.md, README.no.md, README.pl.md, README.ru.md, README.th.md, README.tr.md, README.uk.md, README.vi.md, README.zh.md, README.zht.md` plus the now-orphaned `/Users/mac/Project/oa-cli/screenshot-uk.png` (all 22 verified present at repo root; the only non-README references to any of them are hardcoded Windows-path string literals in `packages/app/src/context/file/path.test.ts` that never read the file — safe to delete)
- Do NOT touch: `/Users/mac/Project/oa-cli/LICENSE`

**Interfaces:**
- Consumes: brand contract (product "OA-cli", command `oa-cli`, install URL `https://openagentic.id/cli/install`, release repo `github.com/Wahidila/oa-cli`, env `OPENAGENTIC_API_KEY`).
- Produces: `NOTICE` attribution file; user-facing README. The only "opencode" mentions left in these surfaces are the license attributions (legally required, spec §11).

- [ ] **Step 1: Create NOTICE**

```bash
cd /Users/mac/Project/oa-cli && printf 'OA-cli is based on opencode (https://github.com/anomalyco/opencode), MIT License.\n' > NOTICE && cat NOTICE
```

Expected output: `OA-cli is based on opencode (https://github.com/anomalyco/opencode), MIT License.`

- [ ] **Step 2: Rewrite README.md**

Replace the entire content of `/Users/mac/Project/oa-cli/README.md` with:

````markdown
<h1 align="center">OA-cli</h1>

<p align="center">
  Agentic coding CLI/TUI untuk <a href="https://openagentic.id">openagentic.id</a> — kerjakan kode bersama agen AI langsung dari terminal.
</p>

---

## Instalasi

```bash
curl -fsSL https://openagentic.id/cli/install | bash
```

Binary per-platform juga tersedia di [GitHub Releases](https://github.com/Wahidila/oa-cli/releases).

## Mulai

Jalankan di direktori proyek Anda:

```bash
oa-cli
```

Saat pertama kali dijalankan, OA-cli membuka browser untuk **login dengan akun openagentic.id** (Google). Setelah halaman "Berhasil — kembali ke terminal" muncul, TUI otomatis lanjut dan Anda siap bekerja. Jika browser gagal terbuka, OA-cli mencetak URL login untuk dibuka manual.

Perintah lain yang berguna:

```bash
oa-cli auth login    # login ulang / ganti akun
oa-cli auth logout   # hapus kredensial dari mesin ini
oa-cli run "perbaiki test yang gagal"   # mode non-interaktif (harus sudah login)
```

## Model

Semua model aktif di [openagentic.id](https://openagentic.id) otomatis muncul di model picker — tanpa konfigurasi API key per-provider. Model default ditentukan server; akses model premium dan kuota mengikuti plan akun Anda (lihat [openagentic.id/pricing](https://openagentic.id/pricing)).

## CI / Otomasi

Untuk lingkungan tanpa browser (CI, server), buat API key dari dashboard openagentic.id lalu set:

```bash
export OPENAGENTIC_API_KEY=<api-key-anda>
```

OA-cli akan melewati layar login dan langsung memakai key tersebut.

## Kredensial & Keamanan

- Login memakai OAuth loopback (RFC 8252) dengan PKCE S256 — tanpa client secret.
- API key disimpan lokal di `auth.json` dengan permission `0600`.
- Key berlabel per-perangkat dan bisa dicabut kapan saja dari dashboard openagentic.id.

## Lisensi

MIT — lihat [LICENSE](LICENSE). OA-cli berbasis [opencode](https://github.com/anomalyco/opencode); lihat [NOTICE](NOTICE).
````

- [ ] **Step 3: Delete the translated READMEs and the orphaned screenshot**

```bash
cd /Users/mac/Project/oa-cli && git rm README.??.md README.???.md screenshot-uk.png
```

Expected: 22 `rm '...'` lines (21 READMEs + screenshot). The globs cannot match `README.md` (it has no locale segment; `README.??.md` needs two characters between the dots, `README.???.md` matches only `README.zht.md`). Verify:

```bash
cd /Users/mac/Project/oa-cli && ls README* && git status --short | head -30
```

Expected: `ls` prints only `README.md`; status shows `D` for the 22 files, `M README.md`, and `?? NOTICE`.

- [ ] **Step 4: Verify brand and license constraints**

```bash
cd /Users/mac/Project/oa-cli && git diff --stat -- LICENSE && grep -ni "opencode" README.md NOTICE
```

Expected: no diff output for LICENSE; grep hits ONLY the attribution lines (README "Lisensi" section + the single NOTICE line). Any other "opencode"/"OpenCode" occurrence in README.md is a defect — fix before committing.

- [ ] **Step 5: Commit**

```bash
cd /Users/mac/Project/oa-cli && git add README.md NOTICE && git commit -m "docs: rewrite README for OA-cli, add NOTICE, drop translated READMEs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task M6: Final gate — full relevant suite + typecheck green

**Files:**
- Test only, no source changes. Runs against everything produced by the auth, provider-lock, theme/brand, and this test area.

**Interfaces:**
- Consumes: all Fase-1 tasks landed. This task is last in the overall plan ordering.
- Produces: green evidence for spec §9.2 and §9.4 (integration + regression subset).

- [ ] **Step 1: Run the openagentic integration suite**

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/fixtures/openagentic-mock.test.ts test/auth/openagentic-login.test.ts test/provider/openagentic.test.ts test/provider/openagentic-errors.test.ts
```

Expected: ` 18 pass`, ` 0 fail` (7 + 3 + 3 + 5).

- [ ] **Step 2: Run the regression subset (auth + provider suites)**

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun test --timeout 30000 test/auth test/provider
```

Expected: `0 fail`. Note: pre-existing provider tests that exercise removed multi-provider surfaces (e.g. `test/provider/amazon-bedrock.test.ts`, `digitalocean.test.ts`, `gitlab-duo.test.ts`, `cf-ai-gateway-e2e.test.ts`) may have been updated/deleted by the provider-lock area; a failure here means that area's task list missed a caller — fix there, not by skipping tests.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/mac/Project/oa-cli/packages/opencode && bun run typecheck
```

Expected: `tsgo --noEmit` exits 0 with no diagnostics. Then the monorepo-wide check (root `package.json` script `typecheck` = `bun turbo typecheck`):

```bash
cd /Users/mac/Project/oa-cli && bun turbo typecheck
```

Expected: all tasks successful, exit 0.

- [ ] **Step 4: Commit (only if any fixups were needed)**

If Steps 1–3 required no changes, there is nothing to commit — this task is verification-only. Otherwise commit fixups as:

```bash
cd /Users/mac/Project/oa-cli && git add -A && git commit -m "test: fix fallout from oa-cli phase 1 integration gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```