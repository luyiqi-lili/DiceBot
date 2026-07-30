# 测试与审计

English source: [../testing.md](../testing.md)

## 测试目录

```text
test/
  commands/                 命令 handler 单元测试
  lib/                      库和领域逻辑测试
  e2e/                     线上外部 API 与本地 Wrangler webhook 测试
  scripts/                  wish 脚本 shell 测试
  helpers/mocks.ts          共享 mock
  index.spec.ts             Worker 入口测试
  routes.spec.ts            路由注册测试
```

## 单元测试

本地执行会调用 Wrangler 的命令时，请使用 Node.js 22 或更新版本。CI 当前使用 Node.js 24.x。

运行快速的本地 Node 测试：

```bash
npm run test:unit -- --run
```

运行单个文件：

```bash
npx vitest --config vitest.node.config.mts run test/commands/item.spec.ts
```

`vitest.node.config.mts` 会排除 E2E，以及依赖 Cloudflare Worker runtime、Durable Objects 或 Worker integration binding 的测试；它不应调用线上 Worker。

运行 Cloudflare Workers pool 测试：

```bash
npm test -- --run
```

该命令会读取 `wrangler.jsonc` 的 dev 环境。由于 dev 配置了 `AI` binding，启动时可能建立 Cloudflare 远程 AI 预览，因此需要具有 Workers 预览权限的有效 Cloudflare token。它不是优先的离线单元测试命令。

## E2E 测试

```bash
npm run test:e2e
```

需要：

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`

E2E 会调用真实外部 API，应显式运行。

聚焦的本地 Wrangler webhook 冒烟测试：

```bash
npm run test:e2e:local
```

该测试启动本地 Worker 并发送模拟 Telegram webhook，不会向 Telegram 发送消息。

## 脚本测试

- `test/scripts/wish-digest-format.sh`
- `test/scripts/wish-execute-cleanup.sh`
- `test/scripts/wish-execute-interrupt.sh`
- `test/scripts/wish-execute-retry.sh`

用于验证本地 wish 自动化格式和清理行为。

## 类型检查

```bash
npx tsc --noEmit
```

当前代码库预期通过该检查。

## 依赖审计

```bash
npm audit --audit-level=low
```

截至 2026-07-30，该命令报告 5 个 high 级传递依赖问题：

- `postcss` 的路径穿越/source map 泄露问题。
- Miniflare、Wrangler、`@cloudflare/vitest-pool-workers` 传入的 `sharp`/libvips 问题。

`npm audit fix --force` 会建议破坏性升级到 `@cloudflare/vitest-pool-workers@0.19.0`。不要在无关任务中自动执行；应单独升级 Cloudflare 测试工具链，然后重新运行 Node 测试、Workers pool 测试、类型检查和生产 dry-run。

## 文档验证

文档扫描应检查两份 README、中英文规范 `docs/` 页面和两份 `.deepseek/instructions*` 中的占位词、旧计数和旧标签。

`docs/superpowers/` 与 `docs/zh-CN/superpowers/` 是带日期的设计/实现历史，可以保留当时的名称和命令，不应当作当前运行文档。
