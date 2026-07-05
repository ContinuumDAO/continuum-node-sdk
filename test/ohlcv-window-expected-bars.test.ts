import assert from 'node:assert/strict';
import {test} from 'node:test';
import {expectedBarCountFromWindow} from '../dist/core/chart/ohlcv-window.js';

test('expectedBarCountFromWindow derives bars from start/end and interval', () => {
	const count = expectedBarCountFromWindow({
		startTimeMs: 0,
		endTimeMs: 7 * 86_400_000,
		intervalSec: 3600,
	});
	assert.equal(count, 168);
});
