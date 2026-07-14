import assert from 'node:assert/strict';
import {test} from 'node:test';
import {resolveDefiProtocolFetchOptions} from '../dist/mcp/defi/defi-protocol-fetch-meta.js';

test('uniswap-v4 fetch options expose ohlcvSupportedChainIds subset', async () => {
	const options = await resolveDefiProtocolFetchOptions('uniswap-v4');
	assert.ok(options);
	assert.equal(options!.hasProtocolOhlcv, true);
	assert.equal(options!.fetchOhlcvTool, 'ctm_uniswap_v4_fetch_ohlcv');
	assert.deepEqual(options!.ohlcvSupportedChainIds, [
		1, 10, 56, 130, 137, 4663, 8453, 42161, 43114, 81457,
	]);
	assert.ok(options!.supportedChainIds.length > options!.ohlcvSupportedChainIds!.length);
	assert.match(options!.fetchDataNotes, /ohlcvSupportedChainIds/);
	assert.match(options!.fetchDataNotes, /10 chains/);
	assert.match(options!.fetchDataNotes, /43114/);
	assert.match(options!.fetchDataNotes, /4663/);
	assert.match(options!.fetchDataNotes, /Bitquery/);
});
