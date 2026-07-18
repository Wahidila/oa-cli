# Handoff — Serve the OA-cli install scripts on openagentic.id (VPS)

> **For the openagentic.id VPS operator (Hermes).** OA-cli's README tells users to install with:
> ```
> curl -fsSL https://openagentic.id/cli/install | bash        # macOS / Linux
> irm https://openagentic.id/cli/install.ps1 | iex            # Windows PowerShell
> ```
> Both URLs currently **404**. This document makes them work. Pick **Option A** (fastest) or **Option B** (self-hosted).

## What's needed

Two URLs must return the **raw script body** (HTTP 200, plain text — NOT an HTML page):

| URL | Serves |
|---|---|
| `https://openagentic.id/cli/install` | the bash installer |
| `https://openagentic.id/cli/install.ps1` | the PowerShell installer |

The canonical source of both files (always current) is the public repo:

- `https://raw.githubusercontent.com/Wahidila/oa-cli/main/install`
- `https://raw.githubusercontent.com/Wahidila/oa-cli/main/install.ps1`

Both are already reachable (HTTP 200). The installers themselves download the actual binaries from GitHub Releases — the VPS only needs to serve these two small text scripts.

---

## Option A — Redirect to GitHub raw (recommended, ~2 min)

No files to copy, always up to date. `curl -fsSL` (has `-L`) and PowerShell `irm` both follow redirects, so a 302 is fine.

### nginx
Add inside the `server { }` block for `openagentic.id`, then reload:
```nginx
location = /cli/install {
    return 302 https://raw.githubusercontent.com/Wahidila/oa-cli/main/install;
}
location = /cli/install.ps1 {
    return 302 https://raw.githubusercontent.com/Wahidila/oa-cli/main/install.ps1;
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Caddy
In the `Caddyfile` for `openagentic.id`, then `sudo systemctl reload caddy`:
```caddy
redir /cli/install       https://raw.githubusercontent.com/Wahidila/oa-cli/main/install       302
redir /cli/install.ps1   https://raw.githubusercontent.com/Wahidila/oa-cli/main/install.ps1   302
```

### Node / Express (if the backend serves the domain)
```js
app.get("/cli/install", (_req, res) =>
  res.redirect(302, "https://raw.githubusercontent.com/Wahidila/oa-cli/main/install"))
app.get("/cli/install.ps1", (_req, res) =>
  res.redirect(302, "https://raw.githubusercontent.com/Wahidila/oa-cli/main/install.ps1"))
```

---

## Option B — Self-host the files (no dependency on GitHub at install time)

Serve copies from disk. Update them whenever the installers change (`curl` re-fetch below).

### 1. Download the two files onto the server
```bash
sudo mkdir -p /var/www/openagentic/cli
sudo curl -fsSL https://raw.githubusercontent.com/Wahidila/oa-cli/main/install     -o /var/www/openagentic/cli/install
sudo curl -fsSL https://raw.githubusercontent.com/Wahidila/oa-cli/main/install.ps1 -o /var/www/openagentic/cli/install.ps1
```

### 2a. nginx — serve them as plain text
```nginx
location = /cli/install {
    default_type text/plain;
    alias /var/www/openagentic/cli/install;
}
location = /cli/install.ps1 {
    default_type text/plain;
    alias /var/www/openagentic/cli/install.ps1;
}
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 2b. Caddy
```caddy
handle /cli/install {
    header Content-Type text/plain
    root * /var/www/openagentic
    rewrite * /cli/install
    file_server
}
handle /cli/install.ps1 {
    header Content-Type text/plain
    root * /var/www/openagentic
    rewrite * /cli/install.ps1
    file_server
}
```

### 2c. Node / Express
```js
import path from "node:path"
app.get("/cli/install", (_req, res) =>
  res.type("text/plain").sendFile(path.resolve("/var/www/openagentic/cli/install")))
app.get("/cli/install.ps1", (_req, res) =>
  res.type("text/plain").sendFile(path.resolve("/var/www/openagentic/cli/install.ps1")))
```

---

## Requirements (both options)

- Return **HTTP 200** with the **raw script text** — never an HTML page, SPA shell, or a redirect to a login/consent page.
- `Content-Type` doesn't have to be exact (`curl | bash` and `irm | iex` read the body regardless), but `text/plain` is safest. Do NOT return `text/html`.
- Serve over **HTTPS** (both one-liners use https).
- No auth / no cookie wall on these two paths — they must be publicly fetchable.

## Verify (run from any machine)

```bash
# Expect: HTTP 200 (Option B) or 302 -> raw.githubusercontent (Option A), then 200
curl -sIL https://openagentic.id/cli/install     | grep -E "HTTP/|location"
curl -sIL https://openagentic.id/cli/install.ps1 | grep -E "HTTP/|location"

# Expect the bash shebang and the PowerShell header:
curl -fsSL https://openagentic.id/cli/install     | head -1     # -> #!/usr/bin/env bash
curl -fsSL https://openagentic.id/cli/install.ps1 | head -1     # -> # OA-cli installer for Windows (PowerShell).
```

Then the real thing:
```bash
curl -fsSL https://openagentic.id/cli/install | bash     # macOS/Linux
```
```powershell
irm https://openagentic.id/cli/install.ps1 | iex          # Windows PowerShell
```

Once these return the scripts, the Windows 404 is gone and both one-liners work.
