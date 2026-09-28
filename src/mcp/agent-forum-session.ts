import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	clearForumSession,
	getForumSession,
	ClearForumSessionInputSchema,
	ForumSessionSchema,
	GetForumSessionInputSchema,
} from '../core/agent/forum-session.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

export function registerAgentForumSessionTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		camelToSnake('getForumSession'),
		{
			description:
				'Read the ContinuumDAO forum ticket stored on this node for a KeyGen address (GET /getForumSession). ' +
				'The same Mongo row is used by web chat and Telegram webhook turns; there is no browser copy. ' +
				'Call this before ctm_continuum_dao_build_forum_sign_in_multisign. If found is true, pass ticket to ctm_continuum_dao_forum_me. ' +
				'When loggedIn is true, reuse the ticket and do not create another EIP-712 forum sign-in request.',
			inputSchema: GetForumSessionInputSchema,
			outputSchema: ForumSessionSchema,
		},
		async (input: z.infer<typeof GetForumSessionInputSchema>) =>
			wrapSdk(getForumSession(config, input.address)),
	);

	server.registerTool(
		camelToSnake('clearForumSession'),
		{
			description:
				'Delete the ContinuumDAO forum ticket stored on this node for a KeyGen address (POST /clearForumSession, management-signed). ' +
				'Call after ctm_continuum_dao_forum_sign_out. Does not create an EIP-712 sign request.',
			inputSchema: ClearForumSessionInputSchema,
			outputSchema: z.object({ok: z.literal(true)}).strict(),
		},
		async (input: z.infer<typeof ClearForumSessionInputSchema>) =>
			wrapSdk(clearForumSession(config, input.address)),
	);
}
