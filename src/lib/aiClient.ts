import type { Env } from '../index';
import {
	callDeepSeekChat,
	getDeepSeekApiKeys,
	type DeepSeekChatOptions,
	type DeepSeekMessage,
} from './deepseekClient';

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

export function hasAIChatProvider(env: Env): boolean {
	const provider = resolveAIProvider(env);
	if (provider === 'deepseek') {
		return getDeepSeekApiKeys(env).length > 0;
	}

	return false;
}
