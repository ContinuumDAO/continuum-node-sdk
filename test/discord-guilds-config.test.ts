import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {
	listDiscordSearchTargets,
	parseSocialSearchYaml,
} from '../dist/core/agent/social-search-config.js';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);
const yamlPath = path.join(repoRoot, 'src', 'mcp', 'resources', 'social-search.yaml');

test('parseSocialSearchYaml loads discord guild defaults', () => {
	const text = readFileSync(yamlPath, 'utf8');
	const cfg = parseSocialSearchYaml(text);
	assert.equal(cfg.discord.maxMessagesPerChannel, 500);
	assert.equal(cfg.discord.guilds[0]!.guildId, '000000000000000000');
	assert.equal(cfg.discord.guilds[0]!.channels[0]!.channelId, '000000000000000000');
});

test('listDiscordSearchTargets from inline yaml', () => {
	const cfg = parseSocialSearchYaml(`
defaults:
  max_results: 10
tickers: []
telegram:
  max_messages_per_channel: 100
  channels: []
discord:
  max_messages_per_channel: 100
  mention_user_id: "123456789012345678"
  include_nsfw: true
  guilds:
    - guild_id: "111"
      name: test-guild
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
	assert.equal(cfg.discord.mentionUserId, '123456789012345678');
	const targets = listDiscordSearchTargets(cfg);
	assert.deepEqual(targets, [
		{
			guildId: '111',
			guildName: 'test-guild',
			channelId: '222',
			channelName: 'general',
		},
	]);
});
