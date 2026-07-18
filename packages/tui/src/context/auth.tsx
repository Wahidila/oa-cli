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
