import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	ARKHAM_API_BASE_URL,
	ARKHAM_API_KEY_HEADER,
	arkhamApiRequest,
	listArkhamApiPaths,
	normalizeArkhamPath,
} from '../dist/core/arkham-intel/index.js';

test('normalizeArkhamPath accepts REST paths and rejects URLs or websocket', () => {
	assert.equal(normalizeArkhamPath('/intelligence/address/0xabc').ok, true);
	assert.equal(normalizeArkhamPath('intelligence/search').ok, false);
	assert.equal(normalizeArkhamPath('https://api.arkm.com/intelligence/search').ok, false);
	assert.equal(normalizeArkhamPath('/intelligence/search?q=binance').ok, false);
	assert.equal(normalizeArkhamPath('/ws/v2/streams').ok, false);
});

test('listArkhamApiPaths includes intelligence search and omits websocket', () => {
	const listed = listArkhamApiPaths();
	assert.equal(listed.baseUrl, ARKHAM_API_BASE_URL);
	assert.ok(listed.paths.some(row => row.path === '/intelligence/search'));
	assert.ok(!listed.paths.some(row => row.path.startsWith('/ws')));
});

test('arkhamApiRequest sends API-Key and returns JSON', async () => {
	const fetchImpl: typeof fetch = async (url, init) => {
		assert.equal(String(url), `${ARKHAM_API_BASE_URL}/intelligence/search?query=binance`);
		assert.equal(init?.method, 'GET');
		const headers = new Headers(init?.headers);
		assert.equal(headers.get(ARKHAM_API_KEY_HEADER), 'test-key');
		return new Response(JSON.stringify({results: [{name: 'Binance'}]}), {
			status: 200,
			headers: {'content-type': 'application/json'},
		});
	};

	const result = await arkhamApiRequest(
		{method: 'GET', path: '/intelligence/search', query_params: {query: 'binance'}},
		{fetchImpl, apiKey: 'test-key'},
	);
	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	assert.equal(result.data.status, 200);
	assert.deepEqual(result.data.data, {results: [{name: 'Binance'}]});
});

test('arkhamApiRequest fails without a key and on HTTP errors', async () => {
	const missing = await arkhamApiRequest({path: '/chains'}, {fetchImpl: async () => new Response('nope')});
	assert.equal(missing.ok, false);

	const failed = await arkhamApiRequest(
		{path: '/chains'},
		{
			apiKey: 'test-key',
			fetchImpl: async () =>
				new Response(JSON.stringify({error: 'unauthorized'}), {status: 401}),
		},
	);
	assert.equal(failed.ok, false);
});
