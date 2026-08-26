import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	searchTelegramMessages,
	searchTelegramTickers,
} from '../core/agent/telegram-search.js';
import {
	SearchTelegramMessagesInputSchema,
	SearchTelegramMessagesResultSchema,
	SearchTelegramTickersInputSchema,
	SearchTelegramTickersResultSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerAgentTelegramSearchTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('searchTelegramMessages'),
		{
			description:
				'Search public Telegram channels for messages matching a text query (Telethon MTProto). Uses bundled social-search.yaml unless channels override. Requires TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_SESSION_PATH. Returns full messages, most recent first.',
			inputSchema: SearchTelegramMessagesInputSchema,
			outputSchema: SearchTelegramMessagesResultSchema,
		},
		async (input: z.infer<typeof SearchTelegramMessagesInputSchema>) =>
			wrapSdk(searchTelegramMessages(config, input)),
	);

	server.registerTool(
		camelToSnake('searchTelegramTickers'),
		{
			description:
				'Scan public Telegram channels for token/ticker mentions ($ETH, #UNI, bare caps). YAML tickers allowlist when set; empty allowlist returns any detected ticker. Requires Telethon session env vars. Returns full messages with matched_tickers, most recent first.',
			inputSchema: SearchTelegramTickersInputSchema,
			outputSchema: SearchTelegramTickersResultSchema,
		},
		async (input: z.infer<typeof SearchTelegramTickersInputSchema>) =>
			wrapSdk(searchTelegramTickers(config, input)),
	);
}
