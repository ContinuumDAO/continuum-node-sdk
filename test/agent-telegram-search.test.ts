import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
	channelUsernames,
	parseTelegramChannelsYaml,
} from '../dist/core/agent/telegram-channels-config.js';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
const yamlPath = path.join(
	repoRoot,
	'src',
	'mcp',
	'resources',
	'telegram-channels.yaml',
);

test('parseTelegramChannelsYaml loads bundled defaults', () => {
	const text = readFileSync(yamlPath, 'utf8');
	const cfg = parseTelegramChannelsYaml(text);
	assert.equal(cfg.defaults.maxResults, 50);
	assert.equal(cfg.defaults.maxMessagesPerChannel, 500);
	assert.ok(cfg.tickers.includes('ETH'));
	assert.deepEqual(channelUsernames(cfg), ['defillama', 'uniswap', 'ethereum']);
	assert.equal(cfg.tickerDetection.minLength, 2);
	assert.ok(cfg.tickerDetection.exclude.has('TVL'));
});

test('parseTelegramChannelsYaml empty tickers list', () => {
	const cfg = parseTelegramChannelsYaml(`
defaults:
  max_results: 10
  max_messages_per_channel: 100
tickers: []
channels:
  - username: testchan
`);
	assert.deepEqual(cfg.tickers, []);
	assert.deepEqual(channelUsernames(cfg), ['testchan']);
});
