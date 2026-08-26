import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {searchDiscordMessages, searchDiscordTickers} from '../core/agent/discord-search.js';
import {
	SearchDiscordMessagesInputSchema,
	SearchDiscordMessagesResultSchema,
	SearchDiscordTickersInputSchema,
	SearchDiscordTickersResultSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerAgentDiscordSearchTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('searchDiscordMessages'),
		{
			description:
				'Search Discord guild channels for messages matching a text query or user mention (Discord REST guild search). Uses bundled social-search.yaml unless guilds/channels override. Requires DISCORD_BOT_TOKEN and bot invited with Read Message History + MESSAGE_CONTENT intent. Returns full messages, most recent first.',
			inputSchema: SearchDiscordMessagesInputSchema,
			outputSchema: SearchDiscordMessagesResultSchema,
		},
		async (input: z.infer<typeof SearchDiscordMessagesInputSchema>) =>
			wrapSdk(searchDiscordMessages(config, input)),
	);

	server.registerTool(
		camelToSnake('searchDiscordTickers'),
		{
			description:
				'Scan Discord guild channels for token/ticker mentions ($ETH, #UNI, bare caps). YAML tickers allowlist when set; empty allowlist returns any detected ticker. Requires DISCORD_BOT_TOKEN. Returns full messages with matched_tickers, most recent first.',
			inputSchema: SearchDiscordTickersInputSchema,
			outputSchema: SearchDiscordTickersResultSchema,
		},
		async (input: z.infer<typeof SearchDiscordTickersInputSchema>) =>
			wrapSdk(searchDiscordTickers(config, input)),
	);
}
