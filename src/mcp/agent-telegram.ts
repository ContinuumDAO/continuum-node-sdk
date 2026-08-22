import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {sendTelegramMessage} from '../core/agent/telegram.js';
import {
	SelectedSigningKeySchema,
	SendTelegramMessageInputSchema,
	SendTelegramMessageResultSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const SEND_TELEGRAM_MESSAGE_OUTPUT_SCHEMA = z
	.object({
		result: SendTelegramMessageResultSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerAgentTelegramTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('sendTelegramMessage'),
		{
			description:
				'Send a Telegram text message to the operator (POST /sendTelegramMessage, management-signed). Uses TELEGRAM_BOT_TOKEN and TELEGRAM_OPERATOR_CHAT_ID (set after the user /start\'s the bot once, or auto-stored on first inbound). Optional webhookName selects that telegram webhook\'s bot token; optional chatIdEnvVar overrides the chat-id Variable. The user must have started the bot at least once — Telegram blocks cold DMs.',
			inputSchema: SendTelegramMessageInputSchema,
			outputSchema: SEND_TELEGRAM_MESSAGE_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof SendTelegramMessageInputSchema>) =>
			wrapSdk(sendTelegramMessage(config, input)),
	);
}
