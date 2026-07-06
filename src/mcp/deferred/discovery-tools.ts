import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {DefiProtocolContext} from '../defi/context.js';
import {getProtocolSkill} from '../defi/catalog-adapter.js';
import {markProtocolLoaded} from '../defi/register-protocol-tools.js';
import type {DeferredToolSession} from './session.js';

const ListGroupsOutputSchema = z.object({
	groups: z.array(
		z.object({
			groupId: z.string(),
			description: z.string(),
			toolCount: z.number().int().nonnegative(),
			loaded: z.boolean(),
			pinned: z.boolean(),
			recommended: z.boolean(),
		}),
	),
});

const SearchOutputSchema = z.object({
	hits: z.array(
		z.object({
			name: z.string(),
			shortDescription: z.string(),
			group: z.string(),
			loaded: z.boolean(),
			score: z.number(),
		}),
	),
	suggestion: z.string().optional(),
});

const ActivateOutputSchema = z.object({
	activated: z.boolean(),
	groupId: z.string(),
	toolNames: z.array(z.string()),
	advisoryTools: z.array(z.string()).optional(),
	skillPreview: z.string().optional(),
	skillHint: z.string().optional(),
});

export function registerDeferredDiscoveryTools(
	server: McpServer,
	_config: NodeSdkConfig,
	session: DeferredToolSession,
	defiContext?: DefiProtocolContext,
): void {
	if (session.isDiscoveryRegistered()) {
		return;
	}

	server.registerTool(
		'list_tool_groups',
		{
			description:
				'List Continuum MCP tool bundles (groupId, toolCount, loaded, pinned). Call activate_tool_group before using tools in an unloaded bundle.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListGroupsOutputSchema,
		},
		async () => {
			const groups = session.listGroups();
			const payload = {groups};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'search_continuum_tools',
		{
			description:
				'Search the Continuum tool catalog by keywords (e.g. chart, ohlcv, multisign). Returns compact hits; call activate_tool_group on the group id before tools/call. For charts: search "chart" then activate_tool_group({ groupId: "chart" }).',
			inputSchema: z
				.object({
					q: z.string().min(1),
					group: z.string().optional(),
					limit: z.number().int().positive().max(50).optional(),
				})
				.strict(),
			outputSchema: SearchOutputSchema,
		},
		async ({q, group, limit}: {q: string; group?: string; limit?: number}) => {
			const hits = session.searchTools(q, group, limit ?? 20);
			const first = hits[0];
			const chartQuery = /\b(chart|ohlcv|plot|graph|candlestick|analysis)\b/i.test(q);
			const chartLoaded = session.isGroupActive('chart');
			let suggestion: string | undefined;
			if (first && !first.loaded) {
				suggestion = `Call activate_tool_group with groupId "${first.group}" to enable these tools.`;
			} else if (chartQuery && !chartLoaded) {
				suggestion =
					'Call activate_tool_group with groupId "chart" to enable chart and analysis tools.';
			}
			const payload = {
				hits,
				suggestion,
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'activate_tool_group',
		{
			description:
				'Activate a tool bundle so its tools appear in tools/list and accept tools/call. Idempotent if already active.',
			inputSchema: z.object({groupId: z.string().min(1)}).strict(),
			outputSchema: ActivateOutputSchema,
		},
		async ({groupId}: {groupId: string}) => {
			if (groupId.startsWith('defi:') && defiContext) {
				const protocolId = groupId.slice('defi:'.length);
				markProtocolLoaded(defiContext, protocolId);
				const skill = getProtocolSkill(protocolId);
				const toolNames = session.activateGroup(groupId);
				const payload = {
					activated: true,
					groupId,
					toolNames,
					advisoryTools: [
						'get_defi_protocol_supported_chains',
						'get_defi_protocol_supported_tokens',
						'get_defi_protocol_skill',
					],
					skillPreview: skill?.slice(0, 500),
					skillHint:
						'Call get_defi_protocol_skill for full SKILL.md workflow guidance.',
				};
				return {
					content: [{type: 'text' as const, text: JSON.stringify(payload)}],
					structuredContent: payload,
				};
			}
			const toolNames = session.activateGroup(groupId);
			if (
				toolNames.length === 0 &&
				!session.listGroups().some(g => g.groupId === groupId)
			) {
				throw new Error(`Unknown tool group: ${groupId}`);
			}
			const payload = {activated: true, groupId, toolNames};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'deactivate_tool_group',
		{
			description:
				'Hide tools in a bundle from tools/list. Pinned groups cannot be deactivated.',
			inputSchema: z.object({groupId: z.string().min(1)}).strict(),
			outputSchema: z
				.object({
					deactivated: z.boolean(),
					groupId: z.string(),
					toolNames: z.array(z.string()),
				})
				.strict(),
		},
		async ({groupId}: {groupId: string}) => {
			const toolNames = session.deactivateGroup(groupId);
			const payload = {deactivated: toolNames.length > 0, groupId, toolNames};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	session.markDiscoveryRegistered();
}
