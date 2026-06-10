# Bilingual Documentation Design

Chinese translation: [../../zh-CN/superpowers/specs/2026-06-10-bilingual-docs-design.md](../../zh-CN/superpowers/specs/2026-06-10-bilingual-docs-design.md)

## Goal

Organize project documentation with English as the canonical source and Chinese as a parallel translation copy.

## Approved Approach

Use the existing English files in place and add a Chinese mirror:

- `README.md` remains the English entry point.
- `README.zh-CN.md` is the Chinese entry point.
- `docs/*.md` remain English canonical manuals.
- `docs/zh-CN/*.md` are Chinese translations with matching filenames.
- `docs/superpowers/*` remain English implementation records.
- `docs/zh-CN/superpowers/*` mirrors those records in Chinese.

## Link Rules

Every English user-facing doc should link to its Chinese translation near the top:

```markdown
Chinese translation: [中文](...)
```

Every Chinese translation should link back to the English source near the top:

```markdown
English source: [...]
```

English files are the source of truth. Chinese files should preserve meaning and structure but may use idiomatic Chinese wording.

## Scope

Translate the project-owned documentation created by the documentation rewrite:

- `README.md`
- `docs/architecture.md`
- `docs/commands.md`
- `docs/environment.md`
- `docs/storage.md`
- `docs/testing.md`
- `docs/web-games.md`
- `docs/dnd-design.md`
- `docs/item-system.md`
- `docs/coin-system.md`
- `docs/fish-system.md`
- `docs/affection-system.md`
- `docs/wish-automation.md`
- `docs/superpowers/specs/*.md`
- `docs/superpowers/plans/*.md`

Do not translate dependency docs in `node_modules`.

## Non-Goals

- No production code changes.
- No rewrite of English technical content beyond adding cross-language links.
- No machine-generated translation markers.
- No duplicated English directory under `docs/en/`.

## Verification

After implementation:

- Confirm every English doc has a corresponding Chinese file.
- Confirm every Chinese file links back to the English source.
- Run the documentation stale-text scan.
- Run `npm test -- --run`.
