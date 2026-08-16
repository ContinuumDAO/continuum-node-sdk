import type { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {DefiProtocolContext} from '../defi/context.js';
import {getProtocolSkill} from '../defi/catalog-adapter.js';
import {markProtocolLoaded} from '../defi/register-protocol-tools.js';
import type {DeferredToolSession} from './session.js';
import {resolveActivateGroupIds} from './tool-group-map.js';

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

const FOUNDRY_IMPORT_QUERY =
	/\b(foundry|forge|run-latest|compose import|foundry import|forge import|import script)\b/i;

/** Compact suggestion after search_continuum_tools — names the file-import tool for forge/compose. */
export function searchContinuumToolsSuggestion(
	q: string,
	first: {group: string; loaded: boolean} | undefined,
	isGroupActive: (groupId: string) => boolean,
): string | undefined {
	const chartQuery = /\b(chart|ohlcv|plot|graph|candlestick)\b/i.test(q);
	const analysisQuery = /\b(analysis|analyze)\b/i.test(q);
	const foundryImportQuery =
		FOUNDRY_IMPORT_QUERY.test(q) ||
		(/\bimport\b/i.test(q) && /\b(foundry|forge|compose|broadcast|dry-run|dry run)\b/i.test(q));
	if (foundryImportQuery) {
		if (!isGroupActive('mpc_compose')) {
			return (
				'Call activate_tool_group with groupId "mpc_compose" then import_forge_dry_run_multi_sign_request ' +
				'(file import of run-latest.json — not create_forge_multi_sign_request).'
			);
		}
		return (
			'Use import_forge_dry_run_multi_sign_request for Foundry dry-run / Compose file import ' +
			'(not create_forge_multi_sign_request).'
		);
	}
	if (first && !first.loaded) {
		return `Call activate_tool_group with groupId "${first.group}" to enable these tools.`;
	}
	if (analysisQuery && !isGroupActive('chart:analyze')) {
		return 'Call activate_tool_group with groupId "chart:analyze" to enable analyze_* tools.';
	}
	if (chartQuery && !isGroupActive('chart:core')) {
		return 'Call activate_tool_group with groupId "chart:core" (or alias "chart") to enable prepare_chart* tools.';
	}
	return undefined;
}

export function registerDeferredDiscoveryTools(
	server: McpServer,
	_config: NodeSdkConfig,
	session: DeferredToolSession,
	defiContext?: DefiProtocolContext,
): void {
	if (session.isDiscoveryRegistered()) {
		return;
	}

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
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

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'search_continuum_tools',
		{
			description:
				'Search the Continuum tool catalog by keywords (e.g. chart, ohlcv, multisign). Returns compact hits; call activate_tool_group on the hit group id before tools/call. For charts: activate_tool_group({ groupId: "chart:core" }) or alias "chart"; analysis uses chart:analyze; DeFi load defaults to defi:<protocol>:market-data.',
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
			const suggestion = searchContinuumToolsSuggestion(q, first, id =>
				session.isGroupActive(id),
			);
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

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'activate_tool_group',
		{
			description:
				'Mark a tool bundle as loaded for search bookkeeping and host LLM expand. Wire tools/list is static (MCP 2026-07-28); mpc-auth filters what the model sees. Idempotent if already active.',
			inputSchema: z.object({groupId: z.string().min(1)}).strict(),
			outputSchema: ActivateOutputSchema,
		},
		async ({groupId}: {groupId: string}) => {
			const resolvedIds = resolveActivateGroupIds(groupId);
			if (groupId.startsWith('defi:') && defiContext) {
				const parts = groupId.slice('defi:'.length).split(':');
				const protocolId = parts[0] ?? '';
				if (!protocolId) {
					throw new Error(`Unknown tool group: ${groupId}`);
				}
				markProtocolLoaded(defiContext, protocolId);
				const skill = getProtocolSkill(protocolId);
				const toolNames = [...new Set(resolvedIds.flatMap(id => session.activateGroup(id)))].sort();
				const payload = {
					activated: true,
					groupId: resolvedIds[0] ?? groupId,
					requestedGroupId: groupId,
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
			const toolNames = [...new Set(resolvedIds.flatMap(id => session.activateGroup(id)))].sort();
			const known = session.listGroups();
			if (
				toolNames.length === 0 &&
				!resolvedIds.some(id => known.some(g => g.groupId === id))
			) {
				throw new Error(`Unknown tool group: ${groupId}`);
			}
			const payload = {
				activated: true,
				groupId: resolvedIds[0] ?? groupId,
				requestedGroupId: groupId,
				toolNames,
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'deactivate_tool_group',
		{
			description:
				'Mark a tool bundle as unloaded for search bookkeeping (wire tools/list stays static). Pinned groups cannot be deactivated.',
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
			const resolvedIds = resolveActivateGroupIds(groupId);
			// Unloading a bare defi:<protocol> deactivates all packs for that protocol.
			let ids = resolvedIds;
			if (groupId.startsWith('defi:')) {
				const parts = groupId.slice('defi:'.length).split(':');
				if (parts.length === 1 && parts[0]) {
					const proto = parts[0];
					ids = [
						`defi:${proto}:market-data`,
						`defi:${proto}:trading`,
						`defi:${proto}:other`,
					];
				}
			}
			const toolNames = [...new Set(ids.flatMap(id => session.deactivateGroup(id)))].sort();
			const payload = {
				deactivated: toolNames.length > 0,
				groupId: ids[0] ?? groupId,
				requestedGroupId: groupId,
				toolNames,
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	session.markDiscoveryRegistered();
}
