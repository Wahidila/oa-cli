<h1 align="center">OA-cli</h1>

<p align="center">
  Agentic coding CLI/TUI untuk <a href="https://openagentic.id">openagentic.id</a> — kerjakan kode bersama agen AI langsung dari terminal.
</p>

---

## Instalasi

### macOS / Linux

```bash
curl -fsSL https://openagentic.id/cli/install | bash
```

Perintah ini otomatis mendeteksi OS/arsitektur, mengunduh binary terbaru, dan memasangnya ke `~/.oa-cli/bin`.

### Windows (PowerShell)

```powershell
irm https://openagentic.id/cli/install.ps1 | iex
```

Memasang `oa-cli.exe` ke `%LOCALAPPDATA%\oa-cli\bin` dan menambahkannya ke `PATH`. Buka terminal baru setelahnya.

> Pakai **Git Bash** atau **WSL**? Perintah `curl … | bash` di bagian macOS/Linux juga jalan di Windows.

### Manual (semua platform)

Unduh binary untuk platform Anda dari [GitHub Releases](https://github.com/Wahidila/oa-cli/releases/latest), ekstrak, lalu letakkan di `PATH`:

| Platform | File rilis | Binary |
|---|---|---|
| macOS (Apple Silicon) | `oa-cli-darwin-arm64.zip` | `oa-cli` |
| macOS (Intel) | `oa-cli-darwin-x64.zip` | `oa-cli` |
| Linux (x64) | `oa-cli-linux-x64.tar.gz` | `oa-cli` |
| Linux (ARM64) | `oa-cli-linux-arm64.tar.gz` | `oa-cli` |
| Windows (x64) | `oa-cli-windows-x64.zip` | `oa-cli.exe` |
| Windows (ARM64) | `oa-cli-windows-arm64.zip` | `oa-cli.exe` |

CPU lama tanpa AVX2? Pakai varian `-baseline`. Linux dengan musl (mis. Alpine)? Pakai varian `-musl`.

Cek instalasi: `oa-cli --version`

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
