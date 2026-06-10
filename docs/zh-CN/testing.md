# 测试与审计

English source: [../testing.md](../testing.md)

## 测试目录

```text
test/
  commands/                 命令 handler 单元测试
  lib/                      库和领域逻辑测试
  e2e/external-api.spec.ts  线上 Worker API 测试
  scripts/                  wish 脚本 shell 测试
  helpers/mocks.ts          共享 mock
  index.spec.ts             Worker 入口测试
  routes.spec.ts            路由注册测试
```

## 单元测试

运行全部单元测试：

```bash
npm test -- --run
```

运行单个文件：

```bash
npx vitest run test/commands/item.spec.ts
```

默认单元测试不应调用线上 Worker。

## E2E 测试

```bash
npm run test:e2e
```

需要：

- `WORKER_BASE_URL`
- `EXTERNAL_API_KEY`

E2E 会调用真实外部 API，应显式运行。

## 脚本测试

- `test/scripts/wish-digest-format.sh`
- `test/scripts/wish-execute-cleanup.sh`

用于验证本地 wish 自动化格式和清理行为。

## 类型检查

```bash
npx tsc --noEmit
```

当前既有失败位于：

- `src/commands/act.ts`
- `src/commands/dndAttack.ts`
- `src/lib/coinService.ts`

这些不是文档失败，但会阻止声明项目类型检查干净。

## 依赖审计

```bash
npm audit --audit-level=low
```

当前依赖图仍存在漏洞。涉及依赖升级或发布前应查看 `npm audit` 输出。

## 文档验证

文档扫描应检查 `README.md`、`docs/` 和 `.deepseek/instructions.md` 中的占位词、旧计数和旧标签。

历史文档如果明确标为历史记录，可以有旧名称引用。
