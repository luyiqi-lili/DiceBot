# AI Routing And Donated Credentials

Chinese translation: [zh-CN/ai-routing.md](zh-CN/ai-routing.md)

This page is the source of truth for the active AI paths. The free-model seed catalog in `src/lib/modelRouting.ts` is a recommendation API; it is not the runtime route used by `/trans`.

## Active Features

| Feature | Route order | Purpose |
|---------|-------------|---------|
| `/trans` | donated Gemini → donated Ollama Cloud small model → Workers AI 3B | Translation |
| Hourly GitHub Issue gate | donated Ollama Cloud large model → Workers AI 70B | Decide whether one statically eligible Issue may receive `bot:ready` |

Every inference goes through Cloudflare AI Gateway. There is no direct provider fallback. `/ask`, `/report`, and inline AI chat are not active.

## Models

Translation currently requests:

- Gemini: `gemini-3.5-flash-lite`.
- Ollama Cloud: first available preferred model in `gpt-oss:20b`, `nemotron-3-nano:4b`, `qwen3.5:9b`, `qwen3.5:4b`, `qwen3.5:2b`, `qwen3.5:0.8b`; otherwise the largest discovered model at or below 20B.
- Workers AI: `@cf/meta/llama-3.2-3b-instruct`.

Issue triage currently requests:

- Ollama Cloud: first available preferred model in `qwen3.5:397b`, `qwen3.5`, `gpt-oss:120b`, `nemotron-3-super:120b`, `mistral-large-3`, `deepseek-v4-flash`; otherwise the largest discovered model at or above 70B.
- Workers AI: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

Ollama choices come from each credential's last successful `/api/tags` validation. A model name in this preference list is not a guarantee that every donor account can access it.

## Project Cost Classes

These classes are routing policy, not a guarantee of a provider's future pricing:

| Class | Project interpretation | Current examples | Automatic use |
|-------|------------------------|------------------|---------------|
| Completely free | Small/free-tier capacity used for low-cost translation | Gemini free-tier keys, Ollama Cloud small models, Workers AI 3B | Translation |
| Free but limited | Account or monthly quota is limited; reserve it for larger reasoning | Ollama Cloud large models, Workers AI 70B | Issue gate |
| Paid | No free allowance is assumed | DeepSeek, OpenAI, Anthropic, OpenRouter donations | Disabled by default |

The D1 credential row classifies Google as `completely_free`, Ollama Cloud as `free_limited`, and other providers as `paid`. At the feature level, `/status` presents a usable Ollama small-model pool under “completely free” and its large-model pool under “free but limited.”

The Gemini 2.5 models in `FREE_MODEL_SEEDS` power `/api/ai/route` recommendations. Active translation is deliberately pinned separately to `gemini-3.5-flash-lite`.

## Donation Lifecycle

1. A donor privately sends `/donatetoken <provider> <usage-policy> <token>`.
2. The bot must delete the source Telegram message before doing any lookup or write; deletion failure rejects the donation.
3. The key is written to Cloudflare AI Gateway Secrets Store and attached to a per-donation Provider Key alias.
4. D1 records only an irreversible fingerprint, pseudonymous donor label, Gateway alias/Secret/Store ids, provider, cost class, consent, health, and cached model metadata.
5. Intake immediately performs the supported read-only validation. `validation_only` remains excluded from shared inference even when healthy; only `shared_inference + healthy + active` can route.
6. Multiple eligible aliases use separate D1-backed round-robin cursors for Gemini translation, Ollama translation, and Ollama Issue triage.
7. `/revoketoken ... confirm` deletes the Gateway secret before marking D1 metadata revoked. Failure to delete fails closed.

Supported donation names are `gemini`, `ollama`, `deepseek`, `openai`, `anthropic`, and `openrouter`. Google and Ollama validate by listing models through Gateway. A newly managed DeepSeek alias is marked with the supported premium model catalog because the bot cannot read the managed key back; only a legacy encrypted DeepSeek record can use the direct balance endpoint. Validation is not yet implemented for OpenAI, Anthropic, or OpenRouter.

`DONATION_ENCRYPTION_KEY` remains required even though new keys are not encrypted into D1: it produces the HMAC-based donor label and permits controlled migration of legacy ciphertext.

## Ollama Cloud Provider

Ollama Cloud is registered as an account-level Cloudflare AI Gateway custom provider:

- Gateway slug used by Worker bindings: `custom-ollama-cloud`.
- Account custom-provider slug: `ollama-cloud`.
- Base URL: `https://ollama.com`.
- Model discovery: `GET /api/tags`.
- Inference: `POST /api/chat`.

Provider credentials stay in AI Gateway. The Worker sends only the Provider Key alias and cannot retrieve the original donated key value.

## Commands And APIs

- `/status`: public, read-only service readiness and aggregate pool counts. It never reveals donors, fingerprints, aliases, or key values.
- `/quota`: private; shows only the caller's cached health/model metadata and any supported balance result.
- `/revoketoken`: private; lists and revokes only the caller's donations.
- `POST /api/donations/api-keys`: protected intake.
- `GET /api/donations/api-keys`, `POST .../:id/validate`, `POST .../:id/status`: protected admin operations; unavailable when `DONATION_ADMIN_KEY` is absent.
- `POST .../:id/migrate`: one-record legacy migration; accepts the admin, intake, or Gateway management bearer.

## Production Configuration

Read-only production inspection on 2026-07-30 confirmed:

- `AI_GATEWAY_ID=default` is a plain Worker var and the Workers AI `AI` binding is configured.
- Run access, Gateway management, account id, donation intake, donor pseudonymization, Telegram, external API, and GitHub secrets are present.
- The enabled account custom provider `ollama-cloud` points to `https://ollama.com`.
- `DONATION_ADMIN_KEY`, dedicated `GITHUB_ISSUE_TOKEN`, `TON_DONATION_ADDRESS`, and `GEMINI_API_KEY` are not configured.
- Legacy `GOOGLE_API_KEY`, `GOOGLE_API_KEYS`, `DEEPSEEK_API_KEY`, and `SILICONFLOW_API_KEY` secrets still exist, but active AI routing does not consume them.

Only secret names are documented. Values must never be printed, logged, committed, or copied back out of Cloudflare.

## Failure Behavior

- Missing Gateway Run configuration makes both AI features unavailable rather than calling providers directly.
- One failed donated alias is skipped so another eligible alias or the next provider can run.
- Paid providers are not an automatic fallback.
- Gateway request payload logging is disabled for donated-key calls.
- Exact Ollama remaining quota is not exposed by this implementation; health and accessible models are the available signal.

