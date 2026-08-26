import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	getRedditThread,
	searchRedditPosts,
	searchRedditTickers,
} from '../core/agent/reddit-search.js';
import {
	GetRedditThreadInputSchema,
	GetRedditThreadResultSchema,
	SearchRedditPostsInputSchema,
	SearchRedditPostsResultSchema,
	SearchRedditTickersInputSchema,
	SearchRedditTickersResultSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerAgentRedditSearchTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('searchRedditPosts'),
		{
			description:
				'Search public Reddit subreddits for posts matching a text query (PRAW). Uses bundled social-search.yaml unless subreddits override. Requires REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT. Optional includeComments for top-N reply snippets.',
			inputSchema: SearchRedditPostsInputSchema,
			outputSchema: SearchRedditPostsResultSchema,
		},
		async (input: z.infer<typeof SearchRedditPostsInputSchema>) =>
			wrapSdk(searchRedditPosts(config, input)),
	);

	server.registerTool(
		camelToSnake('searchRedditTickers'),
		{
			description:
				'Scan Reddit subreddit listings for token/ticker mentions in title/selftext. YAML tickers allowlist when set; empty allowlist returns any detected ticker. Requires Reddit app env vars.',
			inputSchema: SearchRedditTickersInputSchema,
			outputSchema: SearchRedditTickersResultSchema,
		},
		async (input: z.infer<typeof SearchRedditTickersInputSchema>) =>
			wrapSdk(searchRedditTickers(config, input)),
	);

	server.registerTool(
		camelToSnake('getRedditThread'),
		{
			description:
				'Fetch one Reddit post plus ranked reply context by post_id or permalink. Requires Reddit app env vars. Use after search when deeper thread context is needed.',
			inputSchema: GetRedditThreadInputSchema,
			outputSchema: GetRedditThreadResultSchema,
		},
		async (input: z.infer<typeof GetRedditThreadInputSchema>) =>
			wrapSdk(getRedditThread(config, input)),
	);
}
