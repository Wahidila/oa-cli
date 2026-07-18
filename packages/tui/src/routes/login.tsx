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
