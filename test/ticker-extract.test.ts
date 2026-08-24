import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
	extractTickers,
	findTickersInMessage,
	normalizeTicker,
} from '../dist/core/agent/ticker-extract.js';

test('normalizeTicker strips cashtag prefix', () => {
	assert.equal(normalizeTicker('$eth'), 'ETH');
	assert.equal(normalizeTicker('#uni'), 'UNI');
});

test('extractTickers finds cashtag hashtag and bare caps', () => {
	const text = 'Long $ETH and #UNI mention plus OP update';
	const found = extractTickers(text);
	assert.ok(found.includes('ETH'));
	assert.ok(found.includes('UNI'));
	assert.ok(found.includes('OP'));
});

test('extractTickers excludes blocklisted bare caps', () => {
	const text = 'THE DAO is not a ticker but TVL is blocked too';
	const found = extractTickers(text);
	assert.ok(!found.includes('THE'));
	assert.ok(!found.includes('TVL'));
});

test('findTickersInMessage allowlist matches prefixed forms', () => {
	const text = 'Buying $ETH today';
	const matched = findTickersInMessage(text, ['ETH']);
	assert.deepEqual(matched, ['ETH']);
});

test('findTickersInMessage open mode returns all detected', () => {
	const text = '$SOL';
	const matched = findTickersInMessage(text, null);
	assert.deepEqual(matched, ['SOL']);
});

test('findTickersInMessage allowlist ignores missing symbols', () => {
	const text = 'Long $SOL only';
	const matched = findTickersInMessage(text, ['ETH']);
	assert.deepEqual(matched, []);
});
