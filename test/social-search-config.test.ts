import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
	channelUsernames,
	listDiscordSearchTargets,
	parseLegacyTelegramChannelsYaml,
	parseSocialSearchYaml,
	subredditNames,
} from '../dist/core/agent/social-search-config.js';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
const yamlPath = path.join(repoRoot, 'src', 'mcp', 'resources', 'social-search.yaml');

test('parseSocialSearchYaml loads bundled unified config', () => {
	const text = readFileSync(yamlPath, 'utf8');
	const cfg = parseSocialSearchYaml(text);
	assert.equal(cfg.defaults.maxResults, 50);
	assert.equal(cfg.telegram.maxMessagesPerChannel, 500);
	assert.equal(cfg.discord.maxMessagesPerChannel, 500);
	assert.equal(cfg.reddit.maxPostsPerSubreddit, 100);
	assert.ok(cfg.tickers.includes('ETH'));
	assert.deepEqual(channelUsernames(cfg), ['defillama', 'uniswap', 'ethereum']);
	assert.deepEqual(subredditNames(cfg), ['ethereum', 'defi', 'CryptoCurrency']);
	assert.equal(cfg.discord.guilds[0]!.guildId, '000000000000000000');
	assert.equal(cfg.reddit.comments.maxPerPost, 10);
	assert.equal(cfg.tickerDetection.minLength, 2);
	assert.ok(cfg.tickerDetection.exclude.has('TVL'));
});

test('parseSocialSearchYaml reddit subreddit overrides', () => {
	const cfg = parseSocialSearchYaml(`
defaults:
  max_results: 10
tickers: []
reddit:
  max_posts_per_subreddit: 25
  sort: top
  time_filter: week
  subreddits:
    - name: defi
      sort: new
    - name: ethereum
      sort: top
      time_filter: month
`);
	assert.equal(cfg.reddit.subreddits[0]!.sort, 'new');
	assert.equal(cfg.reddit.subreddits[1]!.timeFilter, 'month');
});

test('parseLegacyTelegramChannelsYaml preserves telegram slice', () => {
	const cfg = parseLegacyTelegramChannelsYaml(`
defaults:
  max_results: 10
  max_messages_per_channel: 100
tickers: []
channels:
  - username: testchan
`);
	assert.equal(cfg.telegram.maxMessagesPerChannel, 100);
	assert.deepEqual(channelUsernames(cfg), ['testchan']);
	assert.deepEqual(listDiscordSearchTargets(cfg), []);
	assert.deepEqual(subredditNames(cfg), []);
});

test('listDiscordSearchTargets expands guild channels', () => {
	const cfg = parseSocialSearchYaml(`
defaults:
  max_results: 10
tickers: []
telegram:
  max_messages_per_channel: 100
  channels: []
discord:
  max_messages_per_channel: 100
  mention_user_id: "123"
  include_nsfw: true
  guilds:
    - guild_id: "111"
      name: g
      channels:
        - channel_id: "222"
          name: general
reddit:
  max_posts_per_subreddit: 10
  sort: new
  time_filter: month
  subreddits: []
  comments:
    include_on_search: false
    max_per_post: 5
    max_per_thread: 50
    max_depth: 1
    sort: top
    replace_more_limit: 0
`);
	assert.deepEqual(listDiscordSearchTargets(cfg), [
		{guildId: '111', guildName: 'g', channelId: '222', channelName: 'general'},
	]);
});
