import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	ContinuumDocsHttpError,
	fetchContinuumDocsUrl,
	isTransientContinuumDocsFetchError,
} from '../dist/mcp/continuum-docs/http-fetch.js';
import {fetchContinuumDocPage} from '../dist/mcp/continuum-docs/fetch-page.js';
import {clearContinuumDocsPageCacheForTests} from '../dist/mcp/continuum-docs/page-cache.js';

test('isTransientContinuumDocsFetchError covers abort and 503, not 404', () => {
	const abort = new Error('This operation was aborted');
	abort.name = 'AbortError';
	assert.equal(isTransientContinuumDocsFetchError(abort), true);
	assert.equal(isTransientContinuumDocsFetchError(new ContinuumDocsHttpError(503, 'u')), true);
	assert.equal(isTransientContinuumDocsFetchError(new ContinuumDocsHttpError(429, 'u')), true);
	assert.equal(isTransientContinuumDocsFetchError(new ContinuumDocsHttpError(404, 'u')), false);
	assert.equal(isTransientContinuumDocsFetchError(new Error('section "x" not found')), false);
});

test('fetchContinuumDocsUrl retries abort then succeeds', async () => {
	let calls = 0;
	const waits: number[] = [];
	const res = await fetchContinuumDocsUrl('https://docs.example/page.md', {
		timeoutMs: 50,
		attempts: 3,
		retryDelaysMs: [1, 2],
		sleepImpl: async ms => {
			waits.push(ms);
		},
		fetchImpl: async () => {
			calls += 1;
			if (calls < 3) {
				const err = new Error('This operation was aborted');
				err.name = 'AbortError';
				throw err;
			}
			return new Response('# ok', {status: 200});
		},
	});
	assert.equal(calls, 3);
	assert.deepEqual(waits, [1, 2]);
	assert.equal(await res.text(), '# ok');
});

test('fetchContinuumDocsUrl does not retry HTTP 404', async () => {
	let calls = 0;
	await assert.rejects(
		() =>
			fetchContinuumDocsUrl('https://docs.example/missing.md', {
				attempts: 3,
				fetchImpl: async () => {
					calls += 1;
					return new Response('no', {status: 404});
				},
			}),
		(err: unknown) => err instanceof ContinuumDocsHttpError && err.status === 404,
	);
	assert.equal(calls, 1);
});

test('fetchContinuumDocPage caches Constitution.md across sectionIds', async () => {
	clearContinuumDocsPageCacheForTests();
	let calls = 0;
	const full = `# Constitution\n\n## Mission & Vision\n\nPublic goods.\n\n## ContinuumDAO Proposals and Voting\n\nTreasury transfers funds.\n`;
	const fetchImpl = async () => {
		calls += 1;
		return new Response(full, {status: 200, headers: {'Content-Type': 'text/markdown'}});
	};
	const mission = await fetchContinuumDocPage({
		path: 'ContinuumDAO/Governance/Constitution',
		sectionId: 'mission-amp-vision',
		baseUrl: 'https://docs.example',
		fetchImpl,
	});
	const voting = await fetchContinuumDocPage({
		path: 'ContinuumDAO/Governance/Constitution',
		sectionId: 'continuumdao-proposals-and-voting',
		baseUrl: 'https://docs.example',
		fetchImpl,
	});
	assert.equal(calls, 1);
	assert.match(mission.content, /Public goods/);
	assert.match(voting.content, /Treasury transfers/);
	clearContinuumDocsPageCacheForTests();
});
