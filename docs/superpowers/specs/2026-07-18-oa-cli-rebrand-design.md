# Design Doc — OA-cli: Rebrand opencode → Agentic CLI openagentic.id

**Tanggal:** 2026-07-18
**Status:** Draft — menunggu review
**Basis kode:** fork opencode (`anomalyco/opencode` @ `69a8066`, shallow) — full divergence

---

## 1. Ringkasan

**OA-cli** adalah agentic coding CLI/TUI hasil fork penuh dari opencode, di-rebrand total dan terintegrasi eksklusif dengan **openagentic.id**:

- Wajib **login akun openagentic.id** (Google OAuth via browser) saat pertama kali dipakai
- Provider AI **terkunci hanya ke openagentic.id** (`https://openagentic.id/api/v1`, OpenAI-compatible) — sistem multi-provider opencode dicabut
- **Desain penuh mengikuti brand openagentic.id** (dark stone + aksen oranye), satu tema tunggal
- Command terminal: **`oa-cli`**

## 2. Keputusan Terkunci (Decision Log)

| # | Keputusan | Pilihan |
|---|---|---|
| 1 | Strategi fork | **Full divergence** — putus dari upstream, tidak ada rencana merge balik |
| 2 | Pendekatan pengerjaan | **A — Deep Rebrand Bertahap** (Fase 1 fungsional → Fase 2 identitas internal) |
| 3 | Cakupan v1 | **TUI terminal saja** (desktop app & VS Code extension di luar scope) |
| 4 | Nama command | `oa-cli` |
| 5 | Alur login | **Browser otomatis** (OAuth loopback ala `gh auth login`); device-code flow di luar scope v1 |
| 6 | Kredensial | Backend menerbitkan **API key berlabel per-CLI** (bukan access/refresh token) |
| 7 | Daftar model | **Semua model aktif openagentic.id ditampilkan ke semua user** — penegakan akses/plan 100% di server |
| 8 | Tema | **Hanya satu tema `oa-cli`** — 34 tema bawaan (termasuk `opencode`) dan theme picker dihapus |
| 9 | Repo tujuan | GitHub **public**, nama **`oa-cli`** (akun `Wahidila`) — dipakai untuk rilis binary & auto-update |
| 10 | Backend | User adalah owner/dev openagentic.id — endpoint baru bisa dibangun bersamaan |

## 3. Arsitektur

```
┌─────────────────────────────────────────────────────────┐
│  OA-cli (fork opencode)                                 │
│                                                         │
│  ┌───────────┐   ┌──────────────┐   ┌───────────────┐   │
│  │ TUI       │──▶│ Server lokal │──▶│ Provider:     │   │
│  │ (opentui) │   │ (worker)     │   │ openagentic   │   │
│  │ + Login   │   │              │   │ (satu-satunya)│   │
│  │   Gate    │   └──────────────┘   └───────┬───────┘   │
│  └───────────┘                              │           │
└─────────────────────────────────────────────┼───────────┘
                                              ▼
                              ┌───────────────────────────┐
                              │  openagentic.id           │
                              │  • GET  /auth/cli         │
                              │  • POST /api/v1/cli/token │
                              │  • GET  /api/v1/models    │
                              │  • POST /api/v1/chat/…    │
                              └───────────────────────────┘
```

### Fase 1 — Fungsional
1. **Provider lock** — katalog dikunci ke satu provider `openagentic`
2. **Auth gate** — layar login wajib sebelum TUI utama
3. **Rebrand permukaan** — command, logo, tema, string, matikan phone-home
4. **Backend** — endpoint auth CLI di openagentic.id

### Fase 2 — Identitas internal
- Path runtime `~/.config/opencode` dll → `oa-cli` (konstanta tunggal `app` di `packages/core/src/global.ts:10`)
- Env vars `OPENCODE_*` → `OA_*` (terpusat di `packages/core/src/flag/flag.ts`)
- Nama file config `opencode.json` → `oa-cli.json`; URL `$schema` → openagentic.id
- Pangkas package monorepo yang tak dipakai v1: `desktop`, `slack`, `console`, `stats`, `web`, `github`, dan binary eksperimental `lildax` (`packages/cli`)
- Bersihkan sisa penyebutan "opencode" internal

## 4. Alur Auth (Google OAuth via Browser)

### Pengalaman user
```
$ oa-cli
┌──────────────────────────────────────┐
│           [logo OA-cli]              │
│   Selamat datang di OA-cli!          │
│   Login dengan akun openagentic.id   │
│   untuk mulai.                       │
│                                      │
│   [ Enter ] Login dengan Google      │
│   [ Esc   ] Keluar                   │
└──────────────────────────────────────┘
```
Enter → browser terbuka → login Google di openagentic.id → halaman "✓ Berhasil, kembali ke terminal" → TUI lanjut ke Home.

### Mekanika (RFC 8252 — OAuth for native apps)
1. Startup TUI cek kredensial `openagentic` di `auth.json` (`packages/opencode/src/auth/index.ts`, mode 0600). Tidak ada → render **route `login`** baru; layar utama tidak dirender sebelum auth beres (injeksi di `packages/tui/src/app.tsx:1110`). **Pengecualian:** env `OPENAGENTIC_API_KEY` yang terpasang dianggap sudah login (bypass gate — untuk CI/otomasi); validitas key tetap diverifikasi server saat request pertama
2. Enter → CLI listen di `127.0.0.1:<port acak>` → buka browser:
   `https://openagentic.id/auth/cli?redirect_uri=http://127.0.0.1:PORT/callback&state=<acak>&code_challenge=<S256>`
3. Login Google sukses → backend redirect `127.0.0.1:PORT/callback?code=…&state=…`
4. CLI verifikasi `state`, tukar code via `POST /api/v1/cli/token` `{ code, code_verifier }`
5. Backend verifikasi PKCE → terbitkan **API key berlabel** (mis. `OA-cli — MacBook-Roni`, tampil & bisa di-revoke di dashboard) → response `{ api_key, user: { email, name, plan } }`
6. CLI simpan `{ type: "api", key }` di `auth.json` → masuk Home

### Titik reuse kode existing
- Pola device-code login lama: `packages/opencode/src/account/account.ts` (`login()`/`poll()`) — jadi referensi struktur, diganti flow loopback
- Command `auth`: `packages/opencode/src/cli/cmd/providers.ts` — disederhanakan jadi `oa-cli auth login` (trigger flow yang sama) & `oa-cli auth logout`
- Mode non-interaktif (`oa-cli run "…"`) tanpa kredensial → error ramah: *"Belum login. Jalankan `oa-cli` dulu untuk login."*

### Keamanan
- **PKCE S256 + `state`** acak — tanpa client secret (CLI adalah public client)
- `redirect_uri` **divalidasi backend: hanya loopback** (`http://127.0.0.1:*`)
- Authorization code **sekali-pakai, kedaluwarsa 5 menit**
- `auth.json` file mode `0600`
- Revoke key dari dashboard = CLI dapat 401 → otomatis kembali ke layar login

## 5. Provider Lock

Semua permukaan (model picker TUI, server endpoint `provider list`, default model) membaca **satu katalog** — penguncian dilakukan di hulu:

1. **Katalog tunggal compile-time** — ganti isi `packages/core/src/models-dev.ts` (fetch ke models.dev dimatikan total):
   ```ts
   openagentic = {
     id: "openagentic",
     name: "OpenAgentic",
     api: "https://openagentic.id/api/v1",
     npm: "@ai-sdk/openai-compatible",
     env: ["OPENAGENTIC_API_KEY"],   // escape hatch CI/advanced
   }
   ```
2. **Model dinamis** — loader `discoverModels()` di `packages/opencode/src/provider/provider.ts` (meniru pola GitLab loader `:661-700`): `GET https://openagentic.id/api/v1/models` dengan API key user → **semua model aktif** dipetakan ke `Model` internal (id, nama, provider asal, context limit, `default`). Cache lokal (`Global.Path.cache`) sebagai fallback offline.
3. **SDK dipangkas** — `BUNDLED_PROVIDERS` (`provider.ts:107-134`) menyisakan `@ai-sdk/openai-compatible` saja.
4. **Auth surface dibersihkan** — 10 plugin OAuth internal (`packages/opencode/src/plugin/index.ts:65-82`) dihapus; picker multi-provider di command auth dihapus.
5. **Default model** — flag `default: true` dari response `/api/v1/models` (dikontrol server, tanpa rilis ulang CLI); pilihan user terakhir diingat di state lokal (perilaku existing).
6. **Penegakan akses murni server-side** — model premium/kuota/rate limit ditolak server dengan kode error terstruktur; CLI hanya menerjemahkan ke pesan ramah (lihat §8).

## 6. Branding & Desain

### Tema `oa-cli` (satu-satunya)
Nilai diekstrak dari CSS produksi openagentic.id:

| Slot | Warna |
|---|---|
| Background | `#0c0a09` (stone-950) |
| Panel/surface | `#1c1917` (stone-900) |
| Primary/aksen | `#f97316` (oranye brand) |
| Aksen sekunder/hover | `#fb923c`, `#ff5600` |
| Teks | `#ffffff`; muted `#a8a29e` (stone-400) |
| Error / Success / Warning / Info | `#ef4444` / `#10b981` / `#f59e0b` / `#3b82f6` |

- 34 file tema di `packages/tui/src/theme/assets/` dihapus, diganti `oa-cli.json`; registry `DEFAULT_THEMES` (`theme/index.ts:130-164`) menyisakan satu entri; referensi default `"opencode"` di `theme.tsx` (baris 96, 122, 143, 266) → `"oa-cli"`
- **Theme picker dihapus** (`dialog-theme-list.tsx`) — tidak ada lagi yang dipilih
- Theme **engine** dipertahankan (komponen bergantung padanya); tema mini-UI (`cli/cmd/run/theme.ts`) disetel ke palet yang sama

### Wordmark & identitas
- Logo ASCII "OA-cli" baru di 3 titik: `packages/tui/src/logo.ts` (layar utama TUI), `packages/opencode/src/cli/ui.ts:5-10` (help CLI), `packages/opencode/src/cli/cmd/run/splash.ts` (mini-UI)
- Window title terminal: `OC |` → `OA |` (`packages/tui/src/app.tsx:452-474`)
- Binary/command: `bin` di `packages/opencode/package.json` → `oa-cli`; `.scriptName("oa-cli")` (`src/index.ts:47`); outfile build (`script/build.ts:183,203`); install script (`install`: `APP=oa-cli`, dir `~/.oa-cli/bin`)
- Semua string user-facing "opencode" → "OA-cli": deskripsi command (`cli/cmd/*.ts`), tips TUI, pesan error/upgrade, dialog help

### Phone-home dialihkan/dimatikan
| Endpoint lama | Nasib |
|---|---|
| `models.dev` (katalog) | ❌ Mati — katalog internal (`OPENCODE_DISABLE_MODELS_FETCH` jadi perilaku permanen) |
| `console.opencode.ai` (account) | 🔁 Diganti endpoint openagentic.id |
| Share sesi (`opncd.ai`) | ❌ Disabled v1 (kandidat fitur openagentic nanti) |
| Auto-update (npm/brew/GitHub opencode) | 🔁 GitHub Releases `Wahidila/oa-cli` + `https://openagentic.id/cli/install` |
| `HTTP-Referer: opencode.ai` (`provider.ts` 6 titik) | 🔁 `openagentic.id` |
| Upsell (`opencode.ai/go`, GitHub app API, social cards) | ❌ Dihapus |
| Telemetry | Tidak ada by default di upstream (OTLP opt-in) — dipertahankan begitu |

## 7. Backend openagentic.id (spesifikasi endpoint baru)

### `GET /auth/cli`
Halaman login varian CLI.
- Query: `redirect_uri` (wajib loopback `http://127.0.0.1:*` — selain itu tolak), `state`, `code_challenge` (S256)
- Sesudah Google login: buat authorization code sekali-pakai (TTL 5 menit, terikat `code_challenge`) → redirect `{redirect_uri}?code=…&state=…`
- Render halaman sukses: "✓ Berhasil — kembali ke terminal"

### `POST /api/v1/cli/token`
- Body: `{ code, code_verifier }`
- Verifikasi: code valid + belum dipakai + `SHA256(code_verifier) == code_challenge`
- Aksi: terbitkan API key berlabel (`OA-cli — {hostname}`), tampil di dashboard, revocable
- Response: `{ api_key, user: { email, name, plan } }`
- Error: `400 invalid_grant` (code kadaluwarsa/dipakai/PKCE gagal)

### `GET /api/v1/models` (penyesuaian)
- Auth: API key
- Response: **semua model aktif** platform dalam envelope OpenAI-compatible:
  `{ "data": [ { "id", "name", "provider", "context_limit", "default" } ] }`
  — `provider` = asal model (mis. anthropic/openai/google), `default: boolean` (tepat satu `true`)

### Kontrak error terstruktur (dipakai CLI untuk pesan ramah)
- `401 invalid_key` — key dicabut/tidak valid
- `403 plan_required` — model di luar plan user (+ `model`, `required_plan`)
- `429 quota_exceeded` / `rate_limited` (+ `retry_after` bila ada)

### Opsional (non-blocker, boleh menyusul)
- `GET /api/v1/me` — `{ email, name, plan, usage: { requests_today, limit } }` untuk status bar TUI

## 8. Penanganan Error di CLI

| Situasi | Perilaku OA-cli |
|---|---|
| Browser gagal terbuka | Cetak URL login untuk dibuka manual |
| Login timeout 5 menit / Esc | Kembali ke layar login, bisa ulang |
| Port loopback bentrok | Coba port acak lain (beberapa attempt) |
| `state` mismatch di callback | Tolak, tampilkan error, tawarkan ulang |
| `401 invalid_key` saat sesi jalan | Layar login muncul: *"Sesi berakhir — silakan login ulang"* |
| `403 plan_required` | *"Model {X} butuh plan {Y} — upgrade di openagentic.id/pricing"* — sesi tidak crash, user tinggal ganti model |
| `429` | Pesan kuota habis + waktu reset (bila dikirim server) + link pricing |
| Offline / API down | Daftar model dari cache; request gagal dengan pesan jelas, bukan stack trace |
| `/api/v1/models` gagal & cache kosong | Error dengan tombol retry di layar |

## 9. Testing

1. **Unit** — katalog terkunci (hanya `openagentic`), penyimpanan/pembacaan `auth.json`, generator PKCE (`verifier`/`challenge`), pemetaan kode error → pesan
2. **Integrasi (mock server lokal)** — meniru `/auth/cli`, `/api/v1/cli/token`, `/api/v1/models`, `/api/v1/chat/completions`; uji alur penuh: start tanpa kredensial → gate login → callback → key tersimpan → daftar model muncul → satu putaran chat sukses; plus kasus 401/403/429
3. **Smoke manual (akun asli)** — login free tier; coba model premium (ditolak ramah); revoke key dari dashboard saat sesi jalan (kembali ke login); `auth logout` → login ulang
4. **Regresi** — subset test suite bawaan yang relevan dengan core/session dijaga hijau

## 10. Distribusi

- Build binary per-platform memakai sistem build bawaan (`packages/opencode/script/build.ts`, bun compile)
- Rilis: **GitHub Releases di `Wahidila/oa-cli` (public)**
- Install: `curl -fsSL https://openagentic.id/cli/install | bash` (adaptasi script `install` upstream, arahkan ke repo rilis baru)
- Auto-update: cek versi ke GitHub Releases repo baru (`installation/index.ts:258` diganti); jalur npm/brew/choco/scoop dinonaktifkan sampai dipublish resmi
- npm `oa-cli` — opsional, menyusul

## 11. Lisensi

- File `LICENSE` MIT asli (Copyright © 2025 opencode) **dipertahankan** — satu-satunya kewajiban hukum
- Tambah `NOTICE`: *"OA-cli is based on opencode (https://github.com/anomalyco/opencode), MIT License."*
- Kode baru © pemilik OA-cli, tetap MIT (repo public)

## 12. Di Luar Scope v1

- Desktop app, VS Code extension, web UI
- Device-code flow (login headless/SSH)
- Fitur share sesi
- `GET /api/v1/me` + tampilan kuota di status bar (nice-to-have)
- Publikasi npm/brew
- Migrasi data user opencode lama (target user = baru)

## 13. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Regresi karena pencabutan multi-provider menyentuh jalur inti | Fase 1 menyentuh file sesedikit mungkin (katalog + loader); test integrasi mock end-to-end sebelum lanjut Fase 2 |
| Endpoint backend belum siap saat CLI dikerjakan | Mock server lokal jadi kontrak; backend & CLI bisa paralel |
| Rename path/env (Fase 2) merusak instalasi dev sendiri | Fase 2 dikerjakan setelah Fase 1 stabil & ada smoke test |
| Upstream shallow clone menyulitkan cherry-pick darurat | Remote `upstream` dipertahankan; bisa `git fetch --deepen` kapan pun |
