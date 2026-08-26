import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DiscordRestClient,
	fetchChannelHistory,
	searchGuildMessagesPaginated,
} from '../dist/core/agent/discord-rest-client.js';
import {
	normalizeDiscordSearchMessageForTest,
	resolveDiscordSearchTargetsForTest,
	searchDiscordMessages,
	searchDiscordTickers,
} from '../dist/core/agent/discord-search.js';
import {parseSocialSearchYaml} from '../dist/core/agent/social-search-config.js';
import type {NodeSdkConfig} from '../dist/config/schema.js';

const config = {} as NodeSdkConfig;

const sampleYaml = `
defaults:
  max_results: 50
tickers:
  - ETH
ticker_detection:
  min_length: 2
  max_length: 10
  include_bare_caps: true
  exclude:
    - TVL
telegram:
  max_messages_per_channel: 500
  channels: []
discord:
  max_messages_per_channel: 500
  mention_user_id: "999888777666555444"
  include_nsfw: false
  guilds:
    - guild_id: "100"
      name: Alpha
      channels:
        - channel_id: "200"
          name: general
        - channel_id: "201"
          name: trading
reddit:
  max_posts_per_subreddit: 100
  sort: new
  time_filter: month
  subreddits: []
  comments:
    include_on_search: false
    max_per_post: 10
    max_per_thread: 200
    max_depth: 3
    sort: top
    replace_more_limit: 0
`;

function mockFetch(handlers: Record<string, (url: string) => Response | Promise<Response>>) {
	return (async (input: RequestInfo | URL) => {
		const url = typeof input === 'string' ? input : input.toString();
		for (const [prefix, handler] of Object.entries(handlers)) {
			if (url.includes(prefix)) {
				return handler(url);
			}
		}
		return new Response(JSON.stringify({message: `unexpected url ${url}`}), {status: 404});
	}) as typeof fetch;
}

test('resolveDiscordSearchTargets filters guilds and channels', () => {
	const cfg = parseSocialSearchYaml(sampleYaml);
	const all = resolveDiscordSearchTargetsForTest(undefined, undefined, cfg);
	assert.equal(all.length, 2);
	const oneChannel = resolveDiscordSearchTargetsForTest(undefined, ['201'], cfg);
	assert.deepEqual(oneChannel.map((t) => t.channelId), ['201']);
});

test('normalizeDiscordSearchMessageForTest builds permalink', () => {
	const cfg = parseSocialSearchYaml(sampleYaml);
	const target = resolveDiscordSearchTargetsForTest(undefined, ['200'], cfg)[0]!;
	const row = normalizeDiscordSearchMessageForTest(
		{
			id: '300',
			channel_id: '200',
			content: 'hello $ETH',
			timestamp: '2026-01-15T12:00:00.000000+00:00',
			author: {id: '400', username: 'alice'},
			mentions: [{id: '999888777666555444'}],
		},
		target,
	);
	assert.equal(row.guild_id, '100');
	assert.equal(row.message_id, '300');
	assert.equal(row.url, 'https://discord.com/channels/100/200/300');
	assert.deepEqual(row.mention_user_ids, ['999888777666555444']);
});

test('DiscordRestClient retries 202 indexing then returns messages', async () => {
	let calls = 0;
	const client = new DiscordRestClient({
		token: 'test-token',
		maxRetries: 3,
		fetchImpl: mockFetch({
			'/guilds/100/messages/search': () => {
				calls += 1;
				if (calls === 1) {
					return new Response(
						JSON.stringify({
							message: 'Index not yet available. Try again later',
							code: 110000,
							retry_after: 0,
						}),
						{status: 202},
					);
				}
				return new Response(
					JSON.stringify({
						total_results: 1,
						messages: [
							[
								{
									id: '300',
									channel_id: '200',
									content: 'Uniswap v4 launch',
									timestamp: '2026-01-15T12:00:00.000000+00:00',
								},
							],
						],
					}),
					{status: 200},
				);
			},
		}),
	});

	const result = await searchGuildMessagesPaginated(client, '100', {
		content: 'Uniswap',
		channelIds: ['200'],
		maxResults: 10,
	});
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.messages.length, 1);
		assert.equal(result.messages[0]!.id, '300');
	}
	assert.equal(calls, 2);
});

test('fetchChannelHistory paginates with before cursor', async () => {
	let calls = 0;
	const client = new DiscordRestClient({
		token: 'test-token',
		fetchImpl: mockFetch({
			'/channels/200/messages': (url) => {
				calls += 1;
				if (!url.includes('before=')) {
					return new Response(
						JSON.stringify(
							Array.from({length: 100}, (_, index) => ({
								id: String(400 - index),
								channel_id: '200',
								content: `msg-${400 - index}`,
								timestamp: '2026-01-14T12:00:00+00:00',
							})),
						),
						{status: 200},
					);
				}
				return new Response(
					JSON.stringify([
						{id: '299', channel_id: '200', content: 'older', timestamp: '2026-01-12T12:00:00+00:00'},
					]),
					{status: 200},
				);
			},
		}),
	});

	const result = await fetchChannelHistory(client, '200', 101);
	assert.equal(result.ok, true);
	if (result.ok) {
		assert.equal(result.messages.length, 101);
		assert.equal(result.messages[0]!.id, '400');
		assert.equal(result.messages[100]!.id, '299');
	}
	assert.equal(calls, 2);
});

test('searchDiscordMessages uses guild search API', async () => {
	const originalToken = process.env.DISCORD_BOT_TOKEN;
	process.env.DISCORD_BOT_TOKEN = 'test-token';

	const originalFetch = globalThis.fetch;
	globalThis.fetch = mockFetch({
		'/guilds/000000000000000000/messages/search': () =>
			new Response(
				JSON.stringify({
					total_results: 1,
					messages: [
						[
							{
								id: '300',
								channel_id: '000000000000000000',
								content: 'mentioning Uniswap',
								timestamp: '2026-01-15T12:00:00.000000+00:00',
								author: {id: '400', username: 'bob'},
							},
						],
					],
				}),
				{status: 200},
			),
	});

	try {
		const result = await searchDiscordMessages(config, {
			query: 'Uniswap',
			maxResults: 5,
		});
		assert.equal(result.ok, true);
		if (result.ok) {
			assert.equal(result.data.messages.length, 1);
			assert.equal(result.data.messages[0]!.content, 'mentioning Uniswap');
			assert.equal(result.data.messages[0]!.author_username, 'bob');
		}
	} finally {
		process.env.DISCORD_BOT_TOKEN = originalToken;
		globalThis.fetch = originalFetch;
	}
});

test('searchDiscordMessages mentionUserId passes mentions query param', async () => {
	const originalToken = process.env.DISCORD_BOT_TOKEN;
	process.env.DISCORD_BOT_TOKEN = 'test-token';
	const originalFetch = globalThis.fetch;

	let searchUrl = '';
	globalThis.fetch = mockFetch({
		'/guilds/000000000000000000/messages/search': (url) => {
			searchUrl = url;
			return new Response(JSON.stringify({total_results: 0, messages: []}), {status: 200});
		},
	});

	try {
		const result = await searchDiscordMessages(config, {
			mentionUserId: '999888777666555444',
		});
		assert.equal(result.ok, true);
		assert.ok(searchUrl.includes('mentions=999888777666555444'));
	} finally {
		process.env.DISCORD_BOT_TOKEN = originalToken;
		globalThis.fetch = originalFetch;
	}
});

test('searchDiscordTickers scans channel history for tickers', async () => {
	const originalToken = process.env.DISCORD_BOT_TOKEN;
	process.env.DISCORD_BOT_TOKEN = 'test-token';
	const originalFetch = globalThis.fetch;

	globalThis.fetch = mockFetch({
		'/channels/000000000000000000/messages': () =>
			new Response(
				JSON.stringify([
					{
						id: '301',
						channel_id: '000000000000000000',
						content: 'Buying $ETH today',
						timestamp: '2026-01-15T12:00:00.000000+00:00',
					},
					{
						id: '300',
						channel_id: '000000000000000000',
						content: 'no tickers here',
						timestamp: '2026-01-14T12:00:00+00:00',
					},
				]),
				{status: 200},
			),
	});

	try {
		const result = await searchDiscordTickers(config, {
			tickers: ['ETH'],
			maxResults: 10,
			maxMessagesPerChannel: 100,
		});
		assert.equal(result.ok, true);
		if (result.ok) {
			assert.equal(result.data.messages.length, 1);
			assert.deepEqual(result.data.messages[0]!.matched_tickers, ['ETH']);
		}
	} finally {
		process.env.DISCORD_BOT_TOKEN = originalToken;
		globalThis.fetch = originalFetch;
	}
});

test('searchDiscordMessages requires query or mentionUserId', async () => {
	const result = await searchDiscordMessages(config, {});
	assert.equal(result.ok, false);
	if (!result.ok) {
		assert.match(result.reason, /query and\/or mentionUserId/i);
	}
});
