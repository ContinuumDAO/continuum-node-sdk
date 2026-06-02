import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	deleteKeyGenMessage,
	getKeyGenMessageById,
	getKeyGenMessageThread,
	listKeyGenMessages,
	markKeyGenMessageRead,
	multiDeleteKeyGenMessages,
	multiMarkKeyGenMessagesRead,
	sendKeyGenMessage,
} from '../core/keygen-messaging.js';
import {
	DeleteKeyGenMessageInputSchema,
	DeleteKeyGenMessageOutputSchema,
	GetKeyGenMessageByIdQuerySchema,
	GetKeyGenMessageThreadQuerySchema,
	KeyGenMessageSchema,
	KeyGenMessageWithRepliesSchema,
	ListKeyGenMessagesDataSchema,
	ListKeyGenMessagesQuerySchema,
	MarkKeyGenMessageReadInputSchema,
	MarkKeyGenMessageReadOutputSchema,
	MultiDeleteKeyGenMessagesInputSchema,
	MultiDeleteKeyGenMessagesOutputSchema,
	MultiMarkKeyGenMessagesReadInputSchema,
	MultiMarkKeyGenMessagesReadOutputSchema,
	SendKeyGenMessageInputSchema,
	SelectedSigningKeySchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const SEND_KEY_GEN_MESSAGE_OUTPUT_SCHEMA = z
	.object({
		message: KeyGenMessageSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerKeyGenMessagingTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('sendKeyGenMessage'),
		{
			description:
				'Send a KeyGen channel message (POST /sendMessage, management-signed). Orchestration sub-agents: reply with replyTo set to the top-level orchestration message id and a body containing an mpc-task-result v1 fenced block (no @agent required on replies). Top-level orchestration posts need title plus @agent and mpc-orchestrate v1 in the body. Body max 16384 UTF-8 chars; rate limit 6/min per keyGen.',
			inputSchema: SendKeyGenMessageInputSchema,
			outputSchema: SEND_KEY_GEN_MESSAGE_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof SendKeyGenMessageInputSchema>) =>
			wrapSdk(sendKeyGenMessage(config, input)),
	);

	server.registerTool(
		camelToSnake('listKeyGenMessages'),
		{
			description:
				'List KeyGen channel messages (GET /listMessages). Filter by unread, top-level only, time range, or pagination.',
			inputSchema: ListKeyGenMessagesQuerySchema,
			outputSchema: ListKeyGenMessagesDataSchema,
		},
		async (query: z.infer<typeof ListKeyGenMessagesQuerySchema>) =>
			wrapSdk(listKeyGenMessages(config, query)),
	);

	server.registerTool(
		camelToSnake('getKeyGenMessageById'),
		{
			description: 'Get one KeyGen channel message by id (GET /getMessageById).',
			inputSchema: GetKeyGenMessageByIdQuerySchema,
			outputSchema: KeyGenMessageSchema,
		},
		async (query: z.infer<typeof GetKeyGenMessageByIdQuerySchema>) =>
			wrapSdk(getKeyGenMessageById(config, query)),
	);

	server.registerTool(
		camelToSnake('getKeyGenMessageThread'),
		{
			description:
				'Get a top-level KeyGen message and nested replies (GET /getMessageThread, max depth 3). Useful for orchestration threads and task-result tracking.',
			inputSchema: GetKeyGenMessageThreadQuerySchema,
			outputSchema: KeyGenMessageWithRepliesSchema,
		},
		async (query: z.infer<typeof GetKeyGenMessageThreadQuerySchema>) =>
			wrapSdk(getKeyGenMessageThread(config, query)),
	);

	server.registerTool(
		camelToSnake('markKeyGenMessageRead'),
		{
			description:
				'Mark one KeyGen channel message as read for this node (POST /markMessageRead, management-signed). Idempotent. Optional signature is stored on the read receipt.',
			inputSchema: MarkKeyGenMessageReadInputSchema,
			outputSchema: MarkKeyGenMessageReadOutputSchema,
		},
		async (input: z.infer<typeof MarkKeyGenMessageReadInputSchema>) =>
			wrapSdk(markKeyGenMessageRead(config, input)),
	);

	server.registerTool(
		camelToSnake('multiMarkKeyGenMessagesRead'),
		{
			description:
				'Mark multiple KeyGen channel messages as read in one request (POST /multiMarkMessagesRead, management-signed). Returns marked count and notFound ids. For external inbox poll workflows only; orchestration sub-agents should not use this instead of send_key_gen_message.',
			inputSchema: MultiMarkKeyGenMessagesReadInputSchema,
			outputSchema: MultiMarkKeyGenMessagesReadOutputSchema,
		},
		async (input: z.infer<typeof MultiMarkKeyGenMessagesReadInputSchema>) =>
			wrapSdk(multiMarkKeyGenMessagesRead(config, input)),
	);

	server.registerTool(
		camelToSnake('deleteKeyGenMessage'),
		{
			description:
				'Soft-delete a KeyGen message and its reply tree (POST /deleteMessage, management-signed). Only the message originator may delete.',
			inputSchema: DeleteKeyGenMessageInputSchema,
			outputSchema: DeleteKeyGenMessageOutputSchema,
		},
		async (input: z.infer<typeof DeleteKeyGenMessageInputSchema>) =>
			wrapSdk(deleteKeyGenMessage(config, input)),
	);

	server.registerTool(
		camelToSnake('multiDeleteKeyGenMessages'),
		{
			description:
				'Soft-delete multiple KeyGen messages and their reply trees (POST /multiDeleteMessages, management-signed). Non-originator ids are skipped and listed in forbidden.',
			inputSchema: MultiDeleteKeyGenMessagesInputSchema,
			outputSchema: MultiDeleteKeyGenMessagesOutputSchema,
		},
		async (input: z.infer<typeof MultiDeleteKeyGenMessagesInputSchema>) =>
			wrapSdk(multiDeleteKeyGenMessages(config, input)),
	);
}
