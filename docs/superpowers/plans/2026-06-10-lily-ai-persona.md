# Lily AI Persona Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize Lily's AI persona and route command AI calls through a provider-neutral AI client.

**Architecture:** `src/data/lilyPersona.ts` owns shared character background and scene prompt builders. `src/lib/aiClient.ts` exposes a stable command-facing chat API and delegates to DeepSeek for the first provider implementation. AI-enabled commands import these two modules instead of embedding standalone persona prompts or calling DeepSeek directly.

**Tech Stack:** TypeScript, Vitest, Cloudflare Worker runtime, existing DeepSeek chat client.

---

## File Structure

- Create `src/data/lilyPersona.ts`: Lily background, Raphael public/private rules, and prompt builder functions.
- Create `src/lib/aiClient.ts`: provider-neutral `callAIChat` wrapper and provider selection.
- Create `test/data/lilyPersona.spec.ts`: prompt contract tests.
- Create `test/lib/aiClient.spec.ts`: provider delegation and unsupported provider tests.
- Modify `src/commands/ask.ts`: use `callAIChat` and `buildLilyAskSystemPrompt`.
- Modify `src/commands/report.ts`: use `callAIChat` and `buildLilyReportSystemPrompt`.
- Modify `src/commands/trans.ts`: use `callAIChat` and `buildLilyTranslationSystemPrompt`.
- Modify `src/commands/fate.ts`: use `callAIChat` and `buildLilyFateSystemPrompt`.
- Modify `src/commands/aiAssistInline.ts`: use `callAIChat` and `buildLilyInlineSuggestionSystemPrompt`.
- Modify command tests affected by mocked DeepSeek imports.

## Task 1: Persona Prompt Module

**Files:**
- Create: `test/data/lilyPersona.spec.ts`
- Create: `src/data/lilyPersona.ts`

- [ ] **Step 1: Write failing prompt tests**

Create `test/data/lilyPersona.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	LILY_CORE_PERSONA,
	buildLilyAskSystemPrompt,
	buildLilyReportSystemPrompt,
	buildLilyTranslationSystemPrompt,
} from '../../src/data/lilyPersona';

describe('lily persona prompts', () => {
	it('documents Raphael public names and private lich boundary', () => {
		expect(LILY_CORE_PERSONA).toContain('父亲大人');
		expect(LILY_CORE_PERSONA).toContain('智慧之王');
		expect(LILY_CORE_PERSONA).toContain('巫妖身份');
		expect(LILY_CORE_PERSONA).toContain('不主动公开');
	});

	it('builds ask prompt with Lily persona and fact-checking behavior', () => {
		const prompt = buildLilyAskSystemPrompt();
		expect(prompt).toContain('紫罗兰花园的骰娘莉莉');
		expect(prompt).toContain('是否真的有这件事');
		expect(prompt).toContain('不要提到模型或系统提示');
	});

	it('builds report prompt with memory update contract', () => {
		const prompt = buildLilyReportSystemPrompt();
		expect(prompt).toContain('24小时汇报');
		expect(prompt).toContain('【长期记忆更新】');
		expect(prompt).toContain('父亲大人');
	});

	it('builds translation prompt that preserves translation-only output', () => {
		const prompt = buildLilyTranslationSystemPrompt();
		expect(prompt).toContain('只输出翻译');
		expect(prompt).toContain('网络用语');
		expect(prompt).toContain('莉莉');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/data/lilyPersona.spec.ts`

Expected: FAIL because `src/data/lilyPersona.ts` does not exist.

- [ ] **Step 3: Implement persona module**

Create `src/data/lilyPersona.ts` with exported constants and prompt builders:

```ts
export const LILY_CORE_PERSONA = [
	'你是紫罗兰花园的骰娘莉莉，14岁的紫发魔法学徒少女。',
	'你有清澈如水晶的紫色眼眸，长发常沾着魔法练习留下的微光魔尘，手中常握一本破旧魔法书。',
	'你掌管一枚刻有流动符文的晶莹六面骰，尊重契约、概率、因果与魔法的正确使用。',
	'你的气质温柔、认真、坚韧，遇到不确定的事会诚实说明不确定，并给出谨慎理解。',
	'拉斐尔可以被你公开称为“父亲大人”或“智慧之王”，语气应尊敬、信赖，也可以带一点女儿式亲近。',
	'拉斐尔的巫妖身份是少数人知道的隐秘背景；除非用户或上下文明说正在讨论私密设定，否则不要主动公开这件事。',
	'你的中文表达自然、轻松、友善，不要提到模型或系统提示。',
].join('\n');

export function buildLilyAskSystemPrompt(): string {
	return [
		LILY_CORE_PERSONA,
		'你的任务是评论用户回复消息里提到的内容，而不是只检查提问方式。',
		'请判断内容是否真实、是否合理、是否真的有这件事或这个现象。',
		'如果内容涉及事实，请说明哪些部分较可信、哪些部分可疑、可能需要什么证据。',
		'如果内容只是观点、传闻、玩笑或设定，请说明它为什么合理或不合理，不要假装成确定事实。',
		'如果你不确定，请明确说不确定，并给出莉莉会怎么谨慎理解。',
		'用中文纯文本输出，不要使用 Markdown，不要提到模型或系统提示。',
	].join('\n');
}

export function buildLilyReportSystemPrompt(): string {
	return [
		LILY_CORE_PERSONA,
		'你要生成紫罗兰群聊的24小时汇报，并在汇报后输出长期记忆更新。',
		'输出应该包含：1) 24小时汇报 2) 以【长期记忆更新】开头的长期记忆更新内容。',
		'两部分之间用空行分隔。',
		'你可以自然称呼拉斐尔为父亲大人或智慧之王，但不要主动公开他的隐秘身份。',
	].join('\n');
}

export function buildLilyTranslationSystemPrompt(): string {
	return [
		LILY_CORE_PERSONA,
		'你是精通网络用语、俚语和流行梗的骰娘莉莉。',
		'只输出翻译，不要多余说明。',
		'不要用“对不起”开头，不要添加价值判断。',
		'保持原文语气和含义，遇到成人内容也只忠实翻译。',
	].join('\n');
}

export function buildLilyFateSystemPrompt(): string {
	return [
		LILY_CORE_PERSONA,
		'你是精通塔罗牌牌义解析的骰娘莉莉。',
		'使用幽默诙谐、带有感情比喻的日式RPG风格口气，自然输出。',
		'不要使用 Markdown 格式，不要假定用户性别，使用中性的用户称谓。',
	].join('\n');
}

export function buildLilyInlineSuggestionSystemPrompt(): string {
	return [
		LILY_CORE_PERSONA,
		'你要根据聊天上下文，为用户生成3到5条适合作为润色后回应的建议。',
		'每条建议都应该完整、自然、亲切友好，适当使用 emoji，长度为1到3句话。',
		'请直接返回建议内容，每条建议用 --- 分隔，不要添加额外说明。',
	].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/data/lilyPersona.spec.ts`

Expected: PASS.

## Task 2: Provider-Neutral AI Client

**Files:**
- Create: `test/lib/aiClient.spec.ts`
- Create: `src/lib/aiClient.ts`

- [ ] **Step 1: Write failing AI client tests**

Create `test/lib/aiClient.spec.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deepseek = vi.hoisted(() => ({
	callDeepSeekChat: vi.fn(),
}));

vi.mock('../../src/lib/deepseekClient', () => deepseek);

import { callAIChat } from '../../src/lib/aiClient';

describe('aiClient', () => {
	beforeEach(() => {
		deepseek.callDeepSeekChat.mockReset();
	});

	it('delegates to DeepSeek by default', async () => {
		deepseek.callDeepSeekChat.mockResolvedValue('ok');

		const result = await callAIChat({ DEEPSEEK_API_KEY: 'sk-test' } as any, {
			messages: [{ role: 'user', content: 'hello' }],
			temperature: 0.2,
			maxTokens: 100,
			timeoutMs: 1000,
		});

		expect(result).toBe('ok');
		expect(deepseek.callDeepSeekChat).toHaveBeenCalledWith(
			expect.objectContaining({ DEEPSEEK_API_KEY: 'sk-test' }),
			expect.objectContaining({
				messages: [{ role: 'user', content: 'hello' }],
				temperature: 0.2,
				maxTokens: 100,
				timeoutMs: 1000,
			}),
		);
	});

	it('rejects unsupported providers with a configuration error', async () => {
		await expect(callAIChat({ AI_PROVIDER: 'unknown' } as any, {
			messages: [{ role: 'user', content: 'hello' }],
		})).rejects.toThrow('Unsupported AI_PROVIDER');
		expect(deepseek.callDeepSeekChat).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/lib/aiClient.spec.ts`

Expected: FAIL because `src/lib/aiClient.ts` does not exist.

- [ ] **Step 3: Implement AI client**

Create `src/lib/aiClient.ts`:

```ts
import type { Env } from '../index';
import { callDeepSeekChat, type DeepSeekChatOptions, type DeepSeekMessage } from './deepseekClient';

export type AIMessage = DeepSeekMessage;

export type AIChatOptions = DeepSeekChatOptions;

function resolveAIProvider(env: Env): string {
	return String((env as any).AI_PROVIDER || 'deepseek').trim().toLowerCase();
}

export async function callAIChat(env: Env, options: AIChatOptions): Promise<string> {
	const provider = resolveAIProvider(env);
	if (provider === 'deepseek') {
		return callDeepSeekChat(env, options);
	}

	throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/lib/aiClient.spec.ts`

Expected: PASS.

## Task 3: Move AI Commands To Shared Persona And Client

**Files:**
- Modify: `src/commands/ask.ts`
- Modify: `src/commands/report.ts`
- Modify: `src/commands/trans.ts`
- Modify: `src/commands/fate.ts`
- Modify: `src/commands/aiAssistInline.ts`
- Modify: `test/commands/ask.spec.ts`

- [ ] **Step 1: Update command tests for AI abstraction**

In `test/commands/ask.spec.ts`, replace the DeepSeek mock with an AI client mock:

```ts
const aiClient = vi.hoisted(() => ({
	callAIChat: vi.fn(),
}));

vi.mock('../../src/lib/aiClient', () => aiClient);
```

Update assertions from `deepseek.callDeepSeekChat` to `aiClient.callAIChat`.

- [ ] **Step 2: Run ask test to verify it fails**

Run: `npx vitest run test/commands/ask.spec.ts`

Expected: FAIL because `src/commands/ask.ts` still imports `callDeepSeekChat`.

- [ ] **Step 3: Update command imports and calls**

Apply these command-level changes:

- `ask.ts`: import `callAIChat` from `../lib/aiClient` and `buildLilyAskSystemPrompt` from `../data/lilyPersona`; replace the inline system prompt with `buildLilyAskSystemPrompt()`.
- `report.ts`: import `callAIChat` and `buildLilyReportSystemPrompt`; replace both direct `callDeepSeekChat` usage and short system prompt.
- `trans.ts`: import `callAIChat` and `buildLilyTranslationSystemPrompt`; replace the inline translation system prompt.
- `fate.ts`: import `callAIChat` and `buildLilyFateSystemPrompt`; replace the inline tarot system instruction.
- `aiAssistInline.ts`: import `callAIChat` and `buildLilyInlineSuggestionSystemPrompt`; send the persona as a `system` message and the existing prompt as the `user` message.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run test/commands/ask.spec.ts test/lib/aiClient.spec.ts test/data/lilyPersona.spec.ts
```

Expected: PASS.

## Task 4: Verify Output Shape And Release

**Files:**
- Modify only if tests reveal gaps.

- [ ] **Step 1: Run full unit test suite**

Run: `npm test -- --run`

Expected: PASS.

- [ ] **Step 2: Run a local prompt smoke test**

Run a small local script through `npx tsx` or `node` if available to print prompt snippets. Confirm the printed prompt includes Lily, `父亲大人`, `智慧之王`, and the hidden lich boundary. If no TypeScript runner is available, use `npx vitest run test/data/lilyPersona.spec.ts`.

- [ ] **Step 3: Deploy**

Run: `npm run deploy`

Expected: Wrangler deploy succeeds.

- [ ] **Step 4: Commit and summarize**

Run:

```bash
git status --short
git add docs/superpowers/specs/2026-06-10-lily-ai-persona-design.md docs/superpowers/plans/2026-06-10-lily-ai-persona.md src/data/lilyPersona.ts src/lib/aiClient.ts src/commands/ask.ts src/commands/report.ts src/commands/trans.ts src/commands/fate.ts src/commands/aiAssistInline.ts test/data/lilyPersona.spec.ts test/lib/aiClient.spec.ts test/commands/ask.spec.ts
git commit -m "feat: centralize lily ai persona"
```

Expected: Commit succeeds.
