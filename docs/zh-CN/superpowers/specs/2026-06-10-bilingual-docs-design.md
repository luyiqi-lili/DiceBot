# 双语文档设计

English source: [../../../superpowers/specs/2026-06-10-bilingual-docs-design.md](../../../superpowers/specs/2026-06-10-bilingual-docs-design.md)

## 目标

将项目文档组织为英文主文档和中文平行翻译。

## 已批准方案

- `README.md` 保持英文入口。
- `README.zh-CN.md` 作为中文入口。
- `docs/*.md` 保持英文主手册。
- `docs/zh-CN/*.md` 作为中文翻译。
- `docs/superpowers/*` 保持英文实现记录。
- `docs/zh-CN/superpowers/*` 镜像中文记录。

## 链接规则

英文文档顶部链接中文翻译；中文文档顶部链接英文来源。

英文文件是事实来源。中文文件应保留结构和语义，但采用自然中文表达。

## 非目标

不改生产代码、不移动英文文档、不新增 `docs/en/`。
