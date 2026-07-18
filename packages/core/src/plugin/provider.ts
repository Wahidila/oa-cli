import { AlibabaPlugin } from "./provider/alibaba"
import { AmazonBedrockPlugin } from "./provider/amazon-bedrock"
import { AnthropicPlugin } from "./provider/anthropic"
import { AzureCognitiveServicesPlugin, AzurePlugin } from "./provider/azure"
import { CerebrasPlugin } from "./provider/cerebras"
import { CloudflareAIGatewayPlugin } from "./provider/cloudflare-ai-gateway"
import { CloudflareWorkersAIPlugin } from "./provider/cloudflare-workers-ai"
import { CoherePlugin } from "./provider/cohere"
import { DeepInfraPlugin } from "./provider/deepinfra"
import { DynamicProviderPlugin } from "./provider/dynamic"
import { GatewayPlugin } from "./provider/gateway"
import { GithubCopilotPlugin } from "./provider/github-copilot"
import { GitLabPlugin } from "./provider/gitlab"
import { GooglePlugin } from "./provider/google"
import { GoogleVertexAnthropicPlugin, GoogleVertexPlugin } from "./provider/google-vertex"
import { GroqPlugin } from "./provider/groq"
import { KiloPlugin } from "./provider/kilo"
import { LLMGatewayPlugin } from "./provider/llmgateway"
import { MistralPlugin } from "./provider/mistral"
import { NvidiaPlugin } from "./provider/nvidia"
import { OpenAIPlugin } from "./provider/openai"
import { SnowflakeCortexPlugin } from "./provider/snowflake-cortex"
import { OpenAICompatiblePlugin } from "./provider/openai-compatible"
import { OpenRouterPlugin } from "./provider/openrouter"
import { PerplexityPlugin } from "./provider/perplexity"
import { SapAICorePlugin } from "./provider/sap-ai-core"
import { TogetherAIPlugin } from "./provider/togetherai"
import { VercelPlugin } from "./provider/vercel"
import { VenicePlugin } from "./provider/venice"
import { XAIPlugin } from "./provider/xai"
import { ZenmuxPlugin } from "./provider/zenmux"
import type { PluginInternal } from "./internal"
import type { Scope } from "effect"

export const ProviderPlugins: PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>[] = [
  AlibabaPlugin,
  AmazonBedrockPlugin,
  AnthropicPlugin,
  AzureCognitiveServicesPlugin,
  AzurePlugin,
  CerebrasPlugin,
  CloudflareAIGatewayPlugin,
  CloudflareWorkersAIPlugin,
  CoherePlugin,
  DeepInfraPlugin,
  GatewayPlugin,
  GithubCopilotPlugin,
  GitLabPlugin,
  GooglePlugin,
  GoogleVertexAnthropicPlugin,
  GoogleVertexPlugin,
  GroqPlugin,
  KiloPlugin,
  LLMGatewayPlugin,
  MistralPlugin,
  NvidiaPlugin,
  // OpencodePlugin is intentionally NOT registered here (Fase 1, OA-cli phone-home cut): its
  // effect auto-fetches `${server}/api/config` (default https://console.opencode.ai) on boot
  // whenever a stored "opencode" integration credential exists (e.g. carried over from a
  // stock-opencode data dir). Registering it would make that fetch happen automatically on
  // every instance boot via PluginInternal.boot. The module itself is kept (packages/core/src/
  // plugin/provider/opencode.ts) for Fase-2 pruning and is still covered by
  // test/plugin/provider-opencode.test.ts, which imports it directly.
  SnowflakeCortexPlugin,
  OpenAICompatiblePlugin,
  OpenAIPlugin,
  OpenRouterPlugin,
  PerplexityPlugin,
  SapAICorePlugin,
  TogetherAIPlugin,
  VercelPlugin,
  VenicePlugin,
  XAIPlugin,
  ZenmuxPlugin,
  DynamicProviderPlugin,
]
