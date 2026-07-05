import assert from 'node:assert/strict';
import test from 'node:test';
import {mcpStructuredContent} from '../dist/mcp/tool-utils.js';

test('mcpStructuredContent wraps top-level arrays for MCP object schema', () => {
	const wrapped = mcpStructuredContent([{id: 1, price: 100}]);
	assert.ok(Array.isArray(wrapped.items));
	assert.equal((wrapped.items as {id: number}[])[0]?.id, 1);
});

test('mcpStructuredContent passes through objects', () => {
	const wrapped = mcpStructuredContent({total: 5, tks: []});
	assert.equal(wrapped.total, 5);
});
