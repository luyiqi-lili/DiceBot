# Wish Automation

## Overview

Users submit ideas with:

```text
/wish 增加每日签到奖励
```

The bot stores meaningful wishes in D1. A local scheduled script summarizes pending wishes every 10 minutes during debugging, sends a Telegram digest, and waits for admin approval. Admin user `8080375150` approves by replying to the digest message with item numbers, such as `1` or `1 3`.

Codex CLI execution runs outside Cloudflare Workers through `scripts/wish-execute.sh`.

## Environment

Set these variables for `scripts/wish-digest.sh`:

```bash
export WORKER_BASE_URL="https://telegram-bot.example.workers.dev"
export EXTERNAL_API_KEY="..."
export BOT_TOKEN="..."
export CHAT_ID="-1002970430696"
export TOPIC_ID="89"
```

Set these variables for `scripts/wish-execute.sh`:

```bash
export WORKER_BASE_URL="https://telegram-bot.example.workers.dev"
export EXTERNAL_API_KEY="..."
export WISH_VERIFY_CMD="npm test -- test/lib/wishCore.spec.ts test/commands/wish.spec.ts test/lib/wishApi.spec.ts"
export BOT_TOKEN="..." # optional: send task status to Telegram
export CHAT_ID="-1002970430696" # optional
export TOPIC_ID="89" # optional
```

## Debug Cron

During debugging, run the digest every 10 minutes:

```cron
*/10 * * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-digest.sh >> /tmp/wish-digest.log 2>&1
```

Run the executor every few minutes if desired:

```cron
*/5 * * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-execute.sh >> /tmp/wish-execute.log 2>&1
```

## Changing To Daily

Replace the digest cron with a daily schedule, for example:

```cron
0 9 * * * cd /home/linux/dicebot/telegram-bot && scripts/wish-digest.sh >> /tmp/wish-digest.log 2>&1
```

## Safety

- Only admin user `8080375150` can approve digest items.
- The executor processes one approved task per run.
- A dirty working tree stops execution.
- Failed verification stops push.
- GitHub Actions deploys after a successful push to `main`.
