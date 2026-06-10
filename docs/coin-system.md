# Coin And Lottery Systems

Chinese translation: [zh-CN/coin-system.md](zh-CN/coin-system.md)

Economy features are split between CoinDO, LotteryDO, command handlers, and `coinService`.

## Storage

| Store | Role |
|-------|------|
| `COIN_DO` | primary coin ledger, treasury, raw keys such as prayer dates |
| `LOTTERY_DO` | lottery tickets, pool, draw state |
| `COIN_KV` | legacy/supporting binding, not the primary ledger |

## Coin Commands

Handled by `src/commands/coin.ts`.

| Command | Behavior |
|---------|----------|
| `/coin` | Shows caller balance |
| `/coin pray` | Daily coin gain in allowed group topics |
| `/coin send <amount>` | Reply transfer to another user |
| `/coin check` | Admin check |
| `/coin take <amount>` | Admin treasury withdrawal |
| `/coin create <amount>` | Admin mint |
| `/coin remove <amount>` | Admin burn |

Admin allowlists come from `src/lib/liveConfig.ts` and data modules.

## Transfer Fees

User-to-user transfer fee depends on target balance after transfer:

- target balance below 300: no fee
- 300 to 3000: cubic ease-in-out between 0.1% and 0.3%
- 3000 and above: 0.5%

Fees go to `TREASURY_KEY`.

## Prayer

`/coin pray` is restricted to specific chat/thread combinations in code. It records `coin_pray:<userId>` in CoinDO raw storage and pays from treasury, allowing treasury to go negative for this operation.

## Coin Service

`src/lib/coinService.ts` wraps CoinDO endpoints:

- `getBalance`
- `transfer`
- `addToTreasury`
- `takeFromTreasury`
- `getTreasury`
- `sumAllUserBalances`

Known type-check issue: `coinService.ts` currently has `unknown`/`{}` JSON typing errors under `npx tsc --noEmit`.

## Lottery Commands

Handled by `src/commands/lottery.ts`.

| Command | Behavior |
|---------|----------|
| `/lottery` | Shows current lottery status |
| `/lottery buy [NNN]` | Buys a ticket, random number unless 3 digits supplied |
| `/lottery now` | Admin draw |
| `/lottery clean` | Admin cleanup |
| `/lottery list` | Admin ticket list |

Rules from code:

- ticket price: 10 coins
- max tickets per user: 5
- exact match and first-two match prize logic lives in `lottery.ts` and `LotteryDO`

## Files

| File | Purpose |
|------|---------|
| `src/commands/coin.ts` | User/admin coin command handler |
| `src/commands/coinList.ts` | Coin list helpers |
| `src/lib/coinService.ts` | CoinDO service wrapper |
| `src/durableObjects/coin_do.ts` | Coin ledger |
| `src/commands/lottery.ts` | Lottery command handler |
| `src/durableObjects/lottery_do.ts` | Lottery state |
| `src/cron/cron.ts` | Scheduled coin check |

## Tests

Relevant tests:

- `test/commands/coin.spec.ts`
- `test/commands/lottery.spec.ts`
