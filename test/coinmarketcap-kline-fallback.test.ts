import assert from 'node:assert/strict';
import test from 'node:test';
import {getKlineCandles} from '../dist/core/coinmarketcap/public-api.js';

test('getKlineCandles fails fast when keyless data is too stale for lookbackDays', async () => {
	const result = await getKlineCandles({
		platform: 'ethereum',
		address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
		interval: '1h',
		lookbackDays: 7,
	});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /too stale/i);
		assert.match(result.reason, /Ask the operator/i);
		assert.match(result.reason, /Do not retry/i);
	}
});
