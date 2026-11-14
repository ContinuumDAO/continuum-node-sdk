import assert from 'node:assert/strict';
import {test} from 'node:test';
import {findLibraryFunctions} from '../src/mcp/defi/library-functions.ts';

test('find_library_function reports a DeFi export with arguments and return fields', () => {
	const found = findLibraryFunctions('aerodrome quote', {library: 'defi', limit: 3});
	const hit = found.matches.find(match => match.exportName === 'aerodromeQuote');
	assert.ok(hit, JSON.stringify(found.matches.map(match => match.exportName)));
	assert.equal(hit.library, 'defi');
	assert.equal(hit.package, '@continuumdao/ctm-mpc-defi');
	assert.equal(hit.importPath, 'protocols/evm/aerodrome');
	assert.match(hit.purpose, /quote/i);
	assert.ok(hit.arguments.some(arg => arg.name === 'tokenIn' && arg.required));
	assert.ok(hit.returns.length > 0);
	assert.equal(hit.mcpTool?.startsWith('ctm_'), true);
});

test('find_library_function reports an indicator purpose, arguments, and return kind', () => {
	const found = findLibraryFunctions('rsi', {library: 'market', limit: 3});
	const hit = found.matches.find(match => match.exportName === 'calculateTechnicalIndicator');
	assert.ok(hit, JSON.stringify(found.matches.map(match => match.purpose)));
	assert.equal(hit.importPath, 'ta');
	assert.match(hit.purpose, /rsi/i);
	assert.ok(hit.arguments.some(arg => arg.name === 'indicator' && arg.required));
	assert.ok(hit.arguments.some(arg => arg.name === 'input' && arg.required));
	assert.ok(hit.returns.some(arg => arg.name === 'result'));
});
