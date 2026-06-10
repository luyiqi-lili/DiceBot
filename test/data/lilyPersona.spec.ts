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
