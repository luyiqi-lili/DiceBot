# 项目文档重写设计

English source: [../../../superpowers/specs/2026-06-10-project-docs-rewrite-design.md](../../../superpowers/specs/2026-06-10-project-docs-rewrite-design.md)

## 目标

基于当前代码实现，将仓库文档重写为一致的项目手册，而不是沿用旧 README 或历史计划中的过期描述。

## 范围

覆盖项目自有 Markdown 文档：

- `README.md`
- `.deepseek/instructions.md`
- `docs/*.md`
- `docs/superpowers/specs/*.md`
- `docs/superpowers/plans/*.md`

`node_modules/` 下的依赖文档不在范围内。

## 文档模型

`README.md` 作为入口，`docs/` 作为详细手册。

README 需要回答项目是什么、请求如何流动、有哪些命令、需要哪些绑定、如何测试/类型检查/开发/部署，以及当前重要风险。

`docs/` 保存聚焦手册：架构、命令、环境、测试、存储，以及各子系统手册。

历史 Superpowers specs/plans 改写为项目可读的实现记录，保留原因和当前状态。

## 事实来源

以 `src/index.ts`、`src/routes.ts`、`wrangler.jsonc`、`src/commands/*`、`src/lib/*`、`scripts/*`、`test/*` 为准。

当 `routes.ts` 和 `index.ts` 不一致时，以 `index.ts` 的运行时行为为准，并记录维护注意事项。

## 已知风险

- `EXTERNAL_API_KEY` 只在配置时保护 `/api/*`。
- `src/web/score.ts` 会记录 `env.TOKEN`。
- `npx tsc --noEmit` 当前失败。
- 依赖审计当前报告漏洞。

## 非目标

不改生产代码、不升级依赖、不改 Cloudflare 配置、不轮换 secret、不做 schema migration。
