import { describe, expect, it, vi } from 'vitest';
import { handleGithubTokenHealthApi } from '../../src/lib/selfEvolution';

describe('Worker GitHub token health endpoint', () => {
	it('reports read and merge capability from a read-only repository lookup', async () => {
		const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			permissions: { pull: true, push: true, admin: false },
		}), { status: 200 }));
		const response = await handleGithubTokenHealthApi(new Request('https://worker/api/evolution/github-auth'), {
			GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'secret-token',
		}, { fetchFn });

		expect(await response.json()).toMatchObject({
			authenticated: true, repositoryAccessible: true,
			permissions: { pull: true, push: true, admin: false },
			canReadPullRequests: true, canMergePullRequests: true,
		});
		expect(fetchFn).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo', expect.objectContaining({
			headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
		}));
	});

	it('fails closed when GitHub rejects the Worker token', async () => {
		const response = await handleGithubTokenHealthApi(new Request('https://worker/api/evolution/github-auth'), {
			GITHUB_REPOSITORY: 'owner/repo', GITHUB_TOKEN: 'secret-token',
		}, { fetchFn: vi.fn().mockResolvedValue(new Response('', { status: 401 })) });
		expect(await response.json()).toEqual({ authenticated: false, repositoryAccessible: false, error: 'github_http_401' });
	});
});
