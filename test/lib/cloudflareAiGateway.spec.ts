import { describe, expect, it, vi } from 'vitest';
import { ollamaGatewayInferenceHeaders } from '../../src/lib/cloudflareAiGateway';

describe('Ollama AI Gateway inference headers', () => {
	it('adds the Secrets Store credential only for its matching donation secret id', async () => {
		const get = vi.fn(async () => 'ollama-donated-secret');
		const headers = await ollamaGatewayInferenceHeaders({
			AI_GATEWAY_TOKEN: 'gateway-token',
			OLLAMA_DONATED_KEY: { get },
			OLLAMA_DONATED_SECRET_ID: 'secret-id',
		}, 'donation-alias', 'secret-id');

		expect(headers).toMatchObject({
			Authorization: 'Bearer ollama-donated-secret',
			'cf-aig-authorization': 'Bearer gateway-token',
			'cf-aig-byok-alias': 'donation-alias',
			'cf-aig-collect-log-payload': 'false',
		});
		expect(get).toHaveBeenCalledOnce();
	});

	it('does not read the bound credential for another donation', async () => {
		const get = vi.fn(async () => 'must-not-be-read');
		const headers = await ollamaGatewayInferenceHeaders({
			AI_GATEWAY_TOKEN: 'gateway-token',
			OLLAMA_DONATED_KEY: { get },
			OLLAMA_DONATED_SECRET_ID: 'bound-secret-id',
		}, 'another-alias', 'another-secret-id');

		expect(headers.Authorization).toBeUndefined();
		expect(get).not.toHaveBeenCalled();
	});
});
