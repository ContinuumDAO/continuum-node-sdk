import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	VENICE_API_KEY_ENV,
	VENICE_API_KEY_TOOL_NAMES,
	missingVeniceApiKeyCallToolResult,
} from '../dist/mcp/defi/venice-api-key.js';

test('VENICE_API_KEY_TOOL_NAMES includes list_models only', () => {
	assert.ok(VENICE_API_KEY_TOOL_NAMES.has('ctm_venice_list_models'));
	assert.equal(VENICE_API_KEY_TOOL_NAMES.size, 1);
});

test('missingVeniceApiKeyCallToolResult points user to Variables', () => {
	const result = missingVeniceApiKeyCallToolResult();
	assert.equal(result.isError, true);
	const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
	assert.match(text, new RegExp(VENICE_API_KEY_ENV));
	assert.match(text, /Variables/);
	assert.match(text, /do not pass apiKey/i);
});
