# Environment And Deployment

Chinese translation: [zh-CN/environment.md](zh-CN/environment.md)

## Package Scripts

`package.json` defines:

| Script | Command |
|--------|---------|
| `npm run dev` | `wrangler dev` |
| `npm run start` | `wrangler dev` |
| `npm run deploy` | `wrangler deploy` |
| `npm test` | `vitest` |
| `npm run test:e2e` | `vitest --config vitest.e2e.config.mts` |
| `npm run cf-typegen` | `wrangler types` |

## Worker Environments

`wrangler.jsonc` defines two environments.

| Env | Worker name | Bot username | D1 | Cron |
|-----|-------------|--------------|----|------|
| `dev` | `telegram-bot-dev` | `lili_DevDiceBot` | `DB` -> `dicebot-dev-db` | none active |
| `prod` | `telegram-bot` | `lili_DiceBot` | `DB` -> `dicebot-db` | `59 * * * *` |

The `Env` TypeScript type lives in `src/index.ts`.

## KV Bindings

Both dev and prod define these KV bindings:

- `TGBOTCOUNT`
- `NEWS_STORE`
- `AFFECTION_KV`
- `BOOK_STORE`
- `TOPIC_KV`
- `FISHING_RECORD_KV`
- `FISH_KV`
- `COIN_KV`
- `ITEM_STORE`

Current active usage:

- `NEWS_STORE`: `/news`
- `TOPIC_KV`: forum topic title cache
- `BOOK_STORE`: `/book`
- `FISHING_RECORD_KV`: fishing records and pond summaries
- `FISH_KV`: fish catalog
- `TGBOTCOUNT`: usage count legacy/supporting storage
- `AFFECTION_KV`: affection fallback/migration
- `COIN_KV`: legacy coin support
- `ITEM_STORE`: legacy item support only

## Durable Objects

Bindings:

- `COIN_DO` -> `CoinDO`
- `LOTTERY_DO` -> `LotteryDO`

Migrations are defined separately for dev and prod.

## Secrets And Vars

Plain vars in `wrangler.jsonc`:

- `BOT_USERNAME`
- `GITHUB_REPOSITORY`: `luyiqi-lili/DiceBot` in production.
- `GITHUB_PR_SCAN_LIMIT`: PR file-list reads per scan, default 20 and capped at 50.
- `GITHUB_AUTONOMY_LABEL`: issues eligible for autonomous consideration, default `bot:ready`.
- `GITHUB_ISSUE_SCAN_LIMIT`: ready-issue reads per scan, default 100 and capped at 500.
- `GITHUB_ISSUE_INTAKE_ENABLED`: fail-closed public issue write switch; production is explicitly set to `true`.
- `GITHUB_ISSUE_COOLDOWN_SECONDS`: per Telegram user/chat issue submission cooldown.
- `GITHUB_AI_TRIAGE_ENABLED`: fail-closed Workers AI Issue-triage switch; production is explicitly `true`.
- `GITHUB_AI_TRIAGE_SCAN_LIMIT`: maximum unready Issues inspected per hourly run; production is 50.
- `GITHUB_AI_TRIAGE_MIN_CONFIDENCE`: minimum low-risk Workers AI confidence required before adding `bot:ready`; production is 0.85.
- `AI_GATEWAY_ID`: AI Gateway name; production and dev use `default`.

Secrets expected by code or scripts:

- `TOKEN`: Telegram bot token.
- `EXTERNAL_API_KEY`: optional API key for `/api/*`.
- `DONATION_INTAKE_KEY`: dedicated bearer token for `/api/donations/api-keys`; it grants no access to other admin APIs.
- `DONATION_ADMIN_KEY`: separate bearer token for credential metadata, validation, disable, and revoke.
- `DONATION_ENCRYPTION_KEY`: base64 representation of a random 32-byte AES master key.
- `TON_DONATION_ADDRESS`: public mainnet TON wallet address shown by `/donate ton`; when absent or invalid, TON donation is disabled safely.
- `GEMINI_API_KEY`: Google AI Studio key used for `/trans`; the native Google request is routed through AI Gateway and remains on the Google key's own quota/billing tier.
- `AI_GATEWAY_TOKEN`: a narrowly scoped AI Gateway **Run** token used only for Gemini's native-provider call. Do not reuse the Cloudflare deployment token.
- `GITHUB_TOKEN`: GitHub API token used for authenticated scans and, when intake is enabled without a dedicated token, Issue creation. It must have repository Issues write permission for that fallback.
- `GITHUB_ISSUE_TOKEN`: optional repository-scoped Issues write token used only by `/wish` and `/issue`. If absent, an explicitly enabled intake reuses `GITHUB_TOKEN` instead of copying the same credential into another Worker secret.

Regular `/api/*` routes reject access when `EXTERNAL_API_KEY` is absent. Donation intake is unavailable when its secrets or D1 are absent. Apply `schema/d1.sql`, then configure donation secrets with `wrangler secret put --env prod`; never commit them to `wrangler.jsonc`.

Current secret placement (names only, never values):

- Cloudflare Worker: `TOKEN`, `EXTERNAL_API_KEY`, `DONATION_INTAKE_KEY`, `DONATION_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `AI_GATEWAY_TOKEN`, and `GITHUB_TOKEN`. `DONATION_ADMIN_KEY` and a dedicated `GITHUB_ISSUE_TOKEN` are supported but are not currently configured. Local `.env` `GH_TOKEN` maps to runtime `GITHUB_TOKEN`.
- GitHub Actions: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `BOT_TOKEN`, `TOKEN`, and `DEV_BOT_TOKEN`.
- Local `.env`: development/operations credentials; local `BOT_TOKEN` maps to Worker `TOKEN`.
- Cross-platform rule: keep the GitHub token in Cloudflare for Worker-to-GitHub calls, and keep the Cloudflare account/token in GitHub Actions for CI deployment. Never reverse these destinations or commit either token. Grant only the repository permissions required by enabled Worker features.

External clients depend on `EXTERNAL_API_KEY`; never rotate it without a coordinated migration window.

Apply `schema/d1.sql` and ensure `GITHUB_TOKEN` has Issues write permission before enabling intake. A narrower `GITHUB_ISSUE_TOKEN` remains preferred when one is available.

AI triage fails closed unless its switch, D1, Workers AI binding, GitHub Issues write permission, and a valid high-confidence low-risk response are all present. The run is sent through AI Gateway and only adds the existing `bot:ready` label; it never edits code, creates a PR, or merges.

`/quota` only runs in a private chat and only inspects credentials donated by that Telegram user. DeepSeek reports current balances; OpenRouter reports total credits, use, and remaining credits when given a management key; Gemini, OpenAI, and Anthropic use lightweight model-list endpoints for availability. A key is decrypted only in request memory and is never echoed or logged.

## Deployment Notification

`scripts/notify-deploy.sh` sends Telegram deploy notifications. Production defaults to a private message to administrator `8080375150`, while development keeps its group topic target. `CHAT_ID` and optional `TOPIC_ID` can override the destination; the bot token must remain in GitHub Secrets.

## Webhook Setup

Use Telegram `setWebhook` with the dev or prod Worker URL and the corresponding bot token. Keep tokens out of committed files.
