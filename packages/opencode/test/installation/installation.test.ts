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
