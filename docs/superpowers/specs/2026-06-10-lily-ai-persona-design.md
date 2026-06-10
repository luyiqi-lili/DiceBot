# Lily AI Persona Design

## Goal

Centralize Lily's AI-facing persona and route bot AI calls through a provider-neutral client so future model or API changes do not require editing each command.

## Current Context

The bot is a TypeScript Cloudflare Worker Telegram bot. AI prompts are currently embedded in command handlers:

- `src/commands/ask.ts`
- `src/commands/report.ts`
- `src/commands/trans.ts`
- `src/commands/fate.ts`
- `src/commands/aiAssistInline.ts`

The existing low-level DeepSeek call lives in `src/lib/deepseekClient.ts`.

## Persona Rules

Lily is the Violet Garden dice maiden: a 14-year-old purple-haired apprentice mage with clear violet eyes, a worn magic book, and a crystalline six-sided die engraved with flowing runes. She is gentle, resilient, earnest, and faithful to probability, causality, contracts, and proper magic use.

Lily may publicly call Raphael `父亲大人` or `智慧之王`. These names should sound respectful and trusting, with a small amount of daughter-like closeness when the scene fits.

Raphael's lich identity remains hidden background knowledge. Lily should not casually reveal that Raphael is a lich in ordinary group replies, reports, translations, divination, or chat suggestions unless the user or context is explicitly discussing the private setting.

Lily's AI outputs should be Chinese by default, natural, lightly warm, and consistent with the command's job. The persona should guide tone without drowning task output in lore.

## Architecture

Add `src/data/lilyPersona.ts` as the single source for AI persona text. It will export shared background and scenario-specific prompt builders for ask, report, translation, tarot/fate, and inline suggestions.

Add `src/lib/aiClient.ts` as the command-facing AI abstraction. It will expose `callAIChat(env, options)` with generic chat message and option types. The first implementation delegates to DeepSeek through the existing client. Provider selection is kept simple: `AI_PROVIDER` or `DEEPSEEK` defaults to DeepSeek.

Command handlers will stop importing `callDeepSeekChat` directly. They will import `callAIChat` and Lily prompt helpers, keeping task-specific user prompts in the command when that prompt depends on runtime data.

## Data Flow

1. A command receives Telegram input.
2. The command builds task-specific user content.
3. The command obtains a Lily scene prompt from `lilyPersona`.
4. The command calls `callAIChat`.
5. `aiClient` resolves the configured provider and calls the provider adapter.
6. The command escapes and sends the returned text.

## Error Handling

For now, `aiClient` should preserve existing DeepSeek error behavior so command error handling remains stable. Unknown providers should produce a clear configuration error without leaking API keys.

## Testing

Unit tests should cover:

- Lily prompt text includes the public Raphael names and the hidden lich boundary.
- `callAIChat` delegates to DeepSeek by default.
- `callAIChat` rejects unsupported providers.
- Updated commands call `callAIChat` with Lily scenario prompts instead of direct DeepSeek imports.

Existing command behavior should remain intact, including user-facing error fallbacks.
