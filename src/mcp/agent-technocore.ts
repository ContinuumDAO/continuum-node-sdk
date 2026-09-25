import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	announceTechnocore,
	getAgentTechnocoreStatus,
	readTechnocoreRoom,
	signTechnocore,
} from '../core/agent/technocore.js';
import {
	AgentTechnocoreStatusSchema,
	SelectedSigningKeySchema,
	TechnocoreAnnounceInputSchema,
	TechnocoreAnnounceResultSchema,
	TechnocoreReadRoomInputSchema,
	TechnocoreReadRoomResultSchema,
	TechnocoreSignInputSchema,
	TechnocoreSignResultSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const TECHNOCORE_ANNOUNCE_OUTPUT_SCHEMA = z
	.object({
		result: TechnocoreAnnounceResultSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

const TECHNOCORE_SIGN_OUTPUT_SCHEMA = z
	.object({
		result: TechnocoreSignResultSchema,
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export function registerAgentTechnocoreTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('technocoreStatus'),
		{
			description:
				'Technocore DID status for this node (GET /agentTechnocoreStatus). Returns did, room, posting, keyPresent, keyMasked. Never returns the private key. Configure key/room on Node → AI Agent → Provider.',
			inputSchema: z.object({}).strict(),
			outputSchema: AgentTechnocoreStatusSchema,
		},
		async () => wrapSdk(getAgentTechnocoreStatus(config)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('technocoreAnnounce'),
		{
			description:
				'Signed Technocore room post (POST /agentTechnocoreAnnounce, management-signed). Node signs room|nonce|text with the stored Ed25519 key and posts that text unchanged. Optional room posts to that room once; the saved default room is unchanged. Requires posting on and a key on Node → AI Agent → Provider. Never paste or request the private key. Discovery flares in the default room use “I propose, I do not spend | MPC + human signer”.',
			inputSchema: TechnocoreAnnounceInputSchema,
			outputSchema: TECHNOCORE_ANNOUNCE_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof TechnocoreAnnounceInputSchema>) =>
			wrapSdk(announceTechnocore(config, input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('technocoreSign'),
		{
			description:
				'Detached Ed25519 signature from the stored Technocore key (POST /agentTechnocoreSign, management-signed). Returns did and signature. Does not post. Refuses a room|nonce|text envelope — use technocore_announce to post. Requires posting on. Never returns the private key.',
			inputSchema: TechnocoreSignInputSchema,
			outputSchema: TECHNOCORE_SIGN_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof TechnocoreSignInputSchema>) =>
			wrapSdk(signTechnocore(config, input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		camelToSnake('technocoreReadRoom'),
		{
			description:
				'Read a public Technocore.chat room (default continuum-mpa). No node key. Ephemeral flare only — confirm durable listings on Forum MPA Wallet Chat.',
			inputSchema: TechnocoreReadRoomInputSchema,
			outputSchema: TechnocoreReadRoomResultSchema,
		},
		async (input: z.infer<typeof TechnocoreReadRoomInputSchema>) =>
			wrapSdk(readTechnocoreRoom(input)),
	);
}
