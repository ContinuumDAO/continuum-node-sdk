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

/** Query brands → catalog protocolId (keep in sync with ctm-mpc-defi module ids). */
const DEFI_BRAND_TO_PROTOCOL: ReadonlyArray<{re: RegExp; protocolId: string}> = [
	{re: /\bhyperliquid\b/i, protocolId: 'hyperliquid'},
	{re: /\barcus\b/i, protocolId: 'arcus'},
	{re: /\bgmx\b/i, protocolId: 'gmx'},
	{re: /\baave\b/i, protocolId: 'aave-v4'},
	{re: /\buniswap\b/i, protocolId: 'uniswap-v4'},
];

function protocolIdFromDefiGroup(groupId: string): string | undefined {
	if (!groupId.startsWith('defi:')) {
		return undefined;
	}
	const parts = groupId.slice('defi:'.length).split(':');
	return parts[0]?.trim() || undefined;
}

function protocolIdFromQuery(q: string): string | undefined {
	for (const {re, protocolId} of DEFI_BRAND_TO_PROTOCOL) {
		if (re.test(q)) {
			return protocolId;
		}
	}
	return undefined;
}

function loadDefiSuggestion(protocolId: string): string {
	return (
		`Call load_defi_protocol({ protocolId: "${protocolId}" }) before ctm_* tools — required runtime gate. ` +
		'Do not use activate_tool_group for DeFi. list_defi_protocols to browse; get_defi_protocol_skill after load.'
	);
}

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
		return (
			'Use import_forge_dry_run_multi_sign_request for Foundry dry-run / Compose file import ' +
			'(run-latest.json — not create_forge_multi_sign_request). Call that tool directly.'
		);
	}
	const firstProtocol = first ? protocolIdFromDefiGroup(first.group) : undefined;
	const queryProtocol = protocolIdFromQuery(q);
	const protocolId = firstProtocol ?? queryProtocol;
	if (protocolId && !(firstProtocol && first?.loaded)) {
		return loadDefiSuggestion(protocolId);
	}
	if (first && !first.loaded) {
		return `Group "${first.group}": call those tools directly — they are on static tools/list.`;
	}
	if (analysisQuery && !isGroupActive('chart:analyze')) {
		return (
			'Call analyze_* for JSON. Hosted mpc-auth / Telegram: then apply_* as usual (Mini App / SPA). ' +
			'Raw MCP clients: text only — do not render.'
		);
	}
	if (chartQuery && !isGroupActive('chart:core')) {
		return (
			'Hosted mpc-auth / Telegram: call prepare_chart* as usual (SPA or Open chart Mini App, including live). ' +
			'Raw MCP clients (SSH :8446): do not render or poll live — tell the operator to use node AI Agent or Telegram.'
		);
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
				'List Continuum MCP tool bundles (groupId, toolCount, loaded, pinned). loaded is search bookkeeping only — call Continuum tools directly. DeFi ctm_* tools require load_defi_protocol first (not activate_tool_group).',
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
				'Search Continuum tools by keyword (chart, ohlcv, multisign, peers, hyperliquid). Returns compact hits. Call Continuum tools in the hits directly. DeFi venues: load_defi_protocol({ protocolId }) first, then ctm_* — do not activate_tool_group.',
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
				'Optional mpc-auth host bookkeeping only. Does not add tools to tools/list (already static). External MCP clients can skip this. Do not use this to load DeFi — call load_defi_protocol. Idempotent.',
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
