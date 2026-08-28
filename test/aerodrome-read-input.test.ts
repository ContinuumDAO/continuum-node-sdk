import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {isAerodromeReadTool} from '../dist/mcp/defi/aerodrome-read-input.js';

describe('isAerodromeReadTool', () => {
	it('covers quote and list reads, not swap submit', () => {
		assert.equal(isAerodromeReadTool('ctm_aerodrome_quote'), true);
		assert.equal(isAerodromeReadTool('ctm_aerodrome_discover_pools'), true);
		assert.equal(isAerodromeReadTool('ctm_aerodrome_fetch_positions'), true);
		assert.equal(isAerodromeReadTool('ctm_aerodrome_build_swap_multisign'), false);
	});
});
