import semver from "semver"
import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Installation } from "@/installation"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { GlobalBus } from "@/bus/global"

export async function upgrade() {
  const config = await AppRuntime.runPromise(Config.Service.use((cfg) => cfg.getGlobal()))
  // Default to "notify": on every new release OA-cli pops the "Update available"
  // dialog (one-click update). Opt into fully-silent patch auto-upgrade with
  // `autoupdate: true`, or turn it off entirely with `autoupdate: false`.
  const mode = config.autoupdate ?? "notify"
  if (mode === false || Flag.OPENCODE_DISABLE_AUTOUPDATE) return
  const method = await Installation.method()
  const latest = await Installation.latest(method).catch(() => {})
  if (!latest) return

  if (Flag.OPENCODE_ALWAYS_NOTIFY_UPDATE) {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.UpdateAvailable.type,
        properties: { version: latest },
      },
    })
    return
  }

  // Only act when `latest` is genuinely newer. A bare `=== latest` check would
  // let a yanked release (or a locally-pinned build ahead of the newest tag)
  // present an older version as an "update" and silently downgrade the user.
  // `semver.valid` also guards `local` dev builds (InstallationVersion="local").
  if (!semver.valid(latest) || !semver.valid(InstallationVersion)) return
  if (!semver.gt(latest, InstallationVersion)) return

  // No supported self-update path (binary isn't under ~/.oa-cli/bin or
  // ~/.local/bin — e.g. a manual install). Don't pop a dead-end "Update now"
  // dialog whose only action would fail server-side; leave the user be.
  if (method === "unknown") return

  const kind = Installation.getReleaseType(InstallationVersion, latest)

  if (mode === "notify" || kind !== "patch") {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: Installation.Event.UpdateAvailable.type,
        properties: { version: latest },
      },
    })
    return
  }

  await Installation.upgrade(method, latest)
    .then(() =>
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: latest },
        },
      }),
    )
    .catch(() => {})
}
