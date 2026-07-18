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
