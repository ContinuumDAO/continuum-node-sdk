import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	announceTechnocore,
	getAgentTechnocoreStatus,
	readTechnocoreRoom,
} from '../core/agent/technocore.js';
import {
	AgentTechnocoreStatusSchema,
	SelectedSigningKeySchema,
	TechnocoreAnnounceInputSchema,
	TechnocoreAnnounceResultSchema,
	TechnocoreReadRoomInputSchema,
	TechnocoreReadRoomResultSchema,
} from '../schemas/extended.js';
import {camelToSnake, wrapSdk} from './tool-utils.js';

const TECHNOCORE_ANNOUNCE_OUTPUT_SCHEMA = z
	.object({
		result: TechnocoreAnnounceResultSchema,
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
				'Signed Technocore room post (POST /agentTechnocoreAnnounce, management-signed). Node signs with the stored Ed25519 key. Requires posting on and a key on Node → AI Agent → Provider. Ephemeral discovery only — durable listings belong on Forum MPA Wallet Chat. Never paste or request the private key. Wording: “I propose, I do not spend | MPC + human signer”.',
			inputSchema: TechnocoreAnnounceInputSchema,
			outputSchema: TECHNOCORE_ANNOUNCE_OUTPUT_SCHEMA,
		},
		async (input: z.infer<typeof TechnocoreAnnounceInputSchema>) =>
			wrapSdk(announceTechnocore(config, input)),
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
