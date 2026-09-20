import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {listEnvironmentVariables} from './environment-variables.js';
import {listMcpServers} from './mcp-servers.js';

export const CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID = 'continuumdao-tokenomics';
export const ETHERSCAN_MCP_SERVER_ID = 'etherscan';
export const FOUNDRY_MCP_SERVER_ID = 'foundry';
export const BLOCKSCOUT_MCP_SERVER_ID = 'blockscout';
export const DUNE_MCP_SERVER_ID = 'dune';
export const EDGARTOOLS_MCP_SERVER_ID = 'edgartools';
export const TECHNICAL_INDICATORS_MCP_SERVER_ID = 'technical-indicators';
export const FIREFOX_MCP_SERVER_ID = 'firefox';
export const MULLVAD_BROWSER_MCP_SERVER_ID = 'mullvad-browser';
export const GECKO_MCP_SERVER_ID = 'gecko';
export const AGENT_DEFAULT_SEARCH_MCP_VAR = 'AGENT_DEFAULT_SEARCH_MCP';
/** Set to `off` to suppress empty-chat and first-reply catalog setup hints. */
export const AGENT_CHAT_SETUP_HINTS_VAR = 'AGENT_CHAT_SETUP_HINTS';

export function agentChatSetupHintsEnabled(raw?: string | null): boolean {
	const v = (raw ?? '').trim().toLowerCase();
	if (!v) {
		return true;
	}
	return v !== 'off' && v !== '0' && v !== 'false' && v !== 'disabled';
}

/** Catalog browser MCPs today. A later `*-browser` id also counts. */
export const BROWSER_MCP_SERVER_IDS = [
	FIREFOX_MCP_SERVER_ID,
	MULLVAD_BROWSER_MCP_SERVER_ID,
	GECKO_MCP_SERVER_ID,
] as const;

export function isBrowserMcpServerId(id: string): boolean {
	const n = id.trim().toLowerCase();
	if (!n) {
		return false;
	}
	if ((BROWSER_MCP_SERVER_IDS as readonly string[]).includes(n)) {
		return true;
	}
	return n === 'browser' || n.endsWith('-browser');
}

export const SEARCH_MCP_SERVER_IDS = [
	'duckduckgo',
	'brave-search',
	'google-search',
	'exa',
	'tavily',
	'kagi',
	'serpapi',
	'perplexity',
	FIREFOX_MCP_SERVER_ID,
	MULLVAD_BROWSER_MCP_SERVER_ID,
] as const;

export const CATALOG_MCP_TOOLSET_IDS = [
	'continuumdao-tokenomics',
	'continuum-dao-compose',
	'block-explorer',
	'dune-analytics',
	'sec-filings',
	'agent-defaults',
] as const;

export type CatalogMcpToolsetId = (typeof CATALOG_MCP_TOOLSET_IDS)[number];

const CatalogMcpAvailabilitySchema = z.enum(['active', 'repository', 'missing']);
export type CatalogMcpAvailability = z.infer<typeof CatalogMcpAvailabilitySchema>;

const CatalogMcpRoleSchema = z.enum(['required', 'desirable', 'recommended']);
export type CatalogMcpRole = z.infer<typeof CatalogMcpRoleSchema>;

export const ResolveCatalogMcpEnablementInputSchema = z
	.object({
		toolset: z.enum(CATALOG_MCP_TOOLSET_IDS),
	})
	.strict();

export const CatalogMcpEnablementServerSchema = z
	.object({
		serverId: z.string(),
		role: CatalogMcpRoleSchema,
		availability: CatalogMcpAvailabilitySchema,
		askOperator: z.boolean(),
		enable: z
			.object({
				addFromCatalog: z.object({id: z.string()}).optional(),
				agentLoadMcpServer: z.object({serverId: z.string()}).optional(),
			})
			.strict(),
		note: z.string(),
	})
	.strict();

/** Exact operator wording when availability is missing. Never say pull mpc-config. */
export const CATALOG_MCP_MISSING_OPERATOR_HINT =
	'This template is not in this node’s repository. Ask the operator to update the MPA Wallet code in the Maintenance section, then try Add from repository again.';

export const CatalogMcpEnablementResultSchema = z
	.object({
		toolset: z.enum(CATALOG_MCP_TOOLSET_IDS),
		servers: z.array(CatalogMcpEnablementServerSchema),
		firstReplyHint: z.string().nullable(),
		missingHint: z.string().nullable(),
		guidance: z.string(),
	})
	.strict();

export type CatalogMcpEnablementResult = z.infer<typeof CatalogMcpEnablementResultSchema>;

type ToolsetServerSpec = {
	serverId: string;
	role: CatalogMcpRole;
	askOperator: boolean;
	note: string;
	/** Treat as active if any of these ids is already on the node. */
	anyServerIds?: readonly string[];
	/** Catalog id to add when none of anyServerIds is active. */
	preferredCatalogId?: string;
};

const TOOLSET_SERVERS: Record<CatalogMcpToolsetId, readonly ToolsetServerSpec[]> = {
	'continuumdao-tokenomics': [
		{
			serverId: CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID,
			role: 'required',
			askOperator: false,
			note: 'Live CTM circulating/escrowed/total supply and veCTM reads. No API key. Not the continuum-dao-tokenomics skill.',
		},
		{
			serverId: ETHERSCAN_MCP_SERVER_ID,
			role: 'desirable',
			askOperator: true,
			note: 'Official Etherscan V2 for holder lists and on-chain follow-ups. Needs ETHERSCAN_API_KEY. Do not auto-load.',
		},
	],
	'continuum-dao-compose': [
		{
			serverId: ETHERSCAN_MCP_SERVER_ID,
			role: 'required',
			askOperator: false,
			note: 'Official Etherscan V2 for Linea ABI (chainid 59144 / 59141). Needs ETHERSCAN_API_KEY.',
		},
		{
			serverId: FOUNDRY_MCP_SERVER_ID,
			role: 'required',
			askOperator: false,
			note: 'Foundry forge-script dry-run on a Linea fork. No API key. Never --broadcast from compose.',
		},
	],
	'block-explorer': [
		{
			serverId: ETHERSCAN_MCP_SERVER_ID,
			role: 'desirable',
			askOperator: true,
			note: 'Etherscan-family explorers (etherscan.io, lineascan, basescan, …). Needs ETHERSCAN_API_KEY. Do not add for *.blockscout.com.',
		},
		{
			serverId: BLOCKSCOUT_MCP_SERVER_ID,
			role: 'desirable',
			askOperator: true,
			note: 'Blockscout-hosted chains (*.blockscout.com). Needs BLOCKSCOUT_PRO_API_KEY. Do not add for Etherscan-family hosts.',
		},
	],
	'dune-analytics': [
		{
			serverId: DUNE_MCP_SERVER_ID,
			role: 'required',
			askOperator: false,
			note: 'Dune SQL / on-chain analytics. Needs DUNE_API_KEY. Do not scrape dune.com.',
		},
	],
	'sec-filings': [
		{
			serverId: EDGARTOOLS_MCP_SERVER_ID,
			role: 'required',
			askOperator: false,
			note: 'SEC EDGAR filings (10-K / 10-Q). Catalog id edgartools.',
		},
	],
	'agent-defaults': [
		{
			serverId: CONTINUUMDAO_TOKENOMICS_MCP_SERVER_ID,
			role: 'recommended',
			askOperator: true,
			note: 'No API key. Live CTM supply/veCTM. Add from the repository when the operator wants DAO metrics without a key.',
		},
		{
			serverId: TECHNICAL_INDICATORS_MCP_SERVER_ID,
			role: 'recommended',
			askOperator: true,
			note: 'No API key. Chart/TA overlays on already-fetched OHLCV.',
		},
		{
			serverId: ETHERSCAN_MCP_SERVER_ID,
			role: 'recommended',
			askOperator: true,
			note: 'Official Etherscan V2. Needs ETHERSCAN_API_KEY. Useful default for DAO / explorer work.',
		},
		{
			serverId: FOUNDRY_MCP_SERVER_ID,
			role: 'recommended',
			askOperator: true,
			note: 'No API key. Compose / forge dry-run. Add when the operator drafts on-chain proposals.',
		},
		{
			serverId: MULLVAD_BROWSER_MCP_SERVER_ID,
			role: 'recommended',
			askOperator: true,
			anyServerIds: BROWSER_MCP_SERVER_IDS,
			preferredCatalogId: MULLVAD_BROWSER_MCP_SERVER_ID,
			note: 'Any browser MCP (firefox, mullvad-browser, gecko, or a later *-browser id). AGENT_DEFAULT_SEARCH_MCP is a search preference — it may be a browser, but does not have to be.',
		},
		{
			serverId: 'duckduckgo',
			role: 'recommended',
			askOperator: true,
			anyServerIds: SEARCH_MCP_SERVER_IDS,
			preferredCatalogId: 'duckduckgo',
			note: 'One search path. After a search or browser MCP is AI Ready, set AGENT_DEFAULT_SEARCH_MCP. Do not add every search vendor.',
		},
	],
};

const TOOLSET_GUIDANCE: Record<CatalogMcpToolsetId, string> = {
	'continuumdao-tokenomics':
		'Add/load required servers, then call continuumdao-tokenomics__get_ctm_metrics. Mention desirable etherscan only; do not auto-load it. Do not dump list_mcp_servers scope catalog. If availability is missing, use missingHint (update the MPA Wallet code in the Maintenance section) — do not say pull mpc-config.',
	'continuum-dao-compose':
		'Both etherscan and foundry are required. If availability is repository, follow enable.addFromCatalog (operator signs) then agent_load_mcp_server. If availability is missing, use missingHint — update the MPA Wallet code in the Maintenance section; do not say pull mpc-config. Do not assume they are already active. Then load skill continuum-dao-compose-proposal.',
	'block-explorer':
		'Pick one family from the explorer host. Both rows are askOperator — do not add etherscan and blockscout together unless asked. Do not scrape explorer HTML. If the chosen family is missing, use missingHint (update the MPA Wallet code in the Maintenance section).',
	'dune-analytics':
		'Add/load dune (DUNE_API_KEY), then use dune__* tools. Continuum DeFi protocol tools are not a Dune substitute. If availability is missing, use missingHint (update the MPA Wallet code in the Maintenance section).',
	'sec-filings':
		'Add/load edgartools, then use its filing tools. Do not scrape sec.gov HTML. If availability is missing, use missingHint (update the MPA Wallet code in the Maintenance section).',
	'agent-defaults':
		'On the first assistant reply of a new conversation only, include firstReplyHint if it is a non-empty string (one sentence). If firstReplyHint is null, say nothing about defaults. Do not enumerate servers[] unless the operator asked which catalog MCPs to add, or a required toolset is missing. If a listed server is missing, use missingHint — update the MPA Wallet code in the Maintenance section; do not say pull mpc-config.',
};

function normalizeId(id: string): string {
	return id.trim().toLowerCase();
}

function idSet(ids: readonly string[]): Set<string> {
	return new Set(ids.map(normalizeId).filter(Boolean));
}

function matchingIds(spec: ToolsetServerSpec): readonly string[] {
	return spec.anyServerIds ?? [spec.serverId];
}

function catalogAddId(
	spec: ToolsetServerSpec,
	catalog: Set<string>,
): string {
	const preferred = spec.preferredCatalogId ?? spec.serverId;
	if (catalog.has(normalizeId(preferred))) {
		return preferred;
	}
	const hit = matchingIds(spec).find((id) => catalog.has(normalizeId(id)));
	return hit ?? preferred;
}

function availabilityFor(
	spec: ToolsetServerSpec,
	active: Set<string>,
	catalog: Set<string>,
): CatalogMcpAvailability {
	if (matchingIds(spec).some((id) => active.has(normalizeId(id)))) {
		return 'active';
	}
	if (
		matchingIds(spec).some((id) => catalog.has(normalizeId(id))) ||
		catalog.has(normalizeId(spec.preferredCatalogId ?? spec.serverId))
	) {
		return 'repository';
	}
	return 'missing';
}

export type AgentDefaultsHintInput = {
	activeServerIds: readonly string[];
	defaultSearchMcp?: string | null;
	setupHints?: string | null;
};

/**
 * One sentence for a new conversation / empty chat. Never a catalog dump.
 * A default browser is any active browser MCP — not AGENT_DEFAULT_SEARCH_MCP
 * being firefox or mullvad-browser (that variable is the search preference).
 * AGENT_CHAT_SETUP_HINTS=off suppresses the hint.
 */
export function formatAgentDefaultsFirstReplyHint(
	input: AgentDefaultsHintInput,
): string | null {
	if (!agentChatSetupHintsEnabled(input.setupHints)) {
		return null;
	}
	const activeIds = [...idSet(input.activeServerIds)];
	const defaultSearch = (input.defaultSearchMcp ?? '').trim().toLowerCase();
	const hasBrowserMcp = activeIds.some((id) => isBrowserMcpServerId(id));
	const hasSearchMcp = activeIds.some((id) =>
		(SEARCH_MCP_SERVER_IDS as readonly string[]).includes(id),
	);

	if (!hasBrowserMcp) {
		return 'No browser MCP is active. Add one from the repository if you want the agent to open pages.';
	}
	if (!defaultSearch && !hasSearchMcp) {
		return 'No default search MCP is set. After a search or browser MCP is AI Ready, set AGENT_DEFAULT_SEARCH_MCP in AI Agent variables.';
	}
	return null;
}

export function chooseCatalogMcpEnablement(input: {
	toolset: CatalogMcpToolsetId;
	activeServerIds: readonly string[];
	catalogServerIds: readonly string[];
	defaultSearchMcp?: string | null;
	setupHints?: string | null;
}): CatalogMcpEnablementResult {
	const active = idSet(input.activeServerIds);
	const catalog = idSet(input.catalogServerIds);
	const servers = TOOLSET_SERVERS[input.toolset].map((spec) => {
		const availability = availabilityFor(spec, active, catalog);
		const addId = catalogAddId(spec, catalog);
		const loadId =
			availability === 'active'
				? matchingIds(spec).find((id) => active.has(normalizeId(id))) ?? spec.serverId
				: addId;
		return {
			serverId: spec.serverId,
			role: spec.role,
			availability,
			askOperator: spec.askOperator,
			enable: {
				addFromCatalog:
					availability === 'active' ? undefined : {id: addId},
				agentLoadMcpServer: {serverId: loadId},
			},
			note: spec.note,
		};
	});
	const firstReplyHint =
		input.toolset === 'agent-defaults'
			? formatAgentDefaultsFirstReplyHint({
					activeServerIds: input.activeServerIds,
					defaultSearchMcp: input.defaultSearchMcp,
					setupHints: input.setupHints,
				})
			: null;
	const missingHint = servers.some((row) => row.availability === 'missing')
		? CATALOG_MCP_MISSING_OPERATOR_HINT
		: null;
	return {
		toolset: input.toolset,
		servers,
		firstReplyHint,
		missingHint,
		guidance: TOOLSET_GUIDANCE[input.toolset],
	};
}

function idsFromRows(rows: unknown): string[] {
	if (!Array.isArray(rows)) {
		return [];
	}
	const out: string[] = [];
	for (const row of rows) {
		if (!row || typeof row !== 'object') {
			continue;
		}
		const id = (row as {id?: unknown}).id;
		if (typeof id === 'string' && id.trim()) {
			out.push(id.trim());
		}
	}
	return out;
}

export async function resolveCatalogMcpEnablement(
	config: NodeSdkConfig,
	input: z.infer<typeof ResolveCatalogMcpEnablementInputSchema>,
): Promise<SdkResult<CatalogMcpEnablementResult>> {
	const parsed = ResolveCatalogMcpEnablementInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid catalog MCP enablement input.'};
	}

	const [activeListed, catalogListed] = await Promise.all([
		listMcpServers(config, {scope: 'active'}),
		listMcpServers(config, {scope: 'catalog'}),
	]);
	if (!activeListed.ok) {
		return activeListed;
	}

	let defaultSearchMcp: string | null = null;
	let setupHints: string | null = null;
	if (parsed.data.toolset === 'agent-defaults') {
		const env = await listEnvironmentVariables(config);
		if (env.ok) {
			const searchRow = env.data.variables.find(
				(v) => v.name.trim() === AGENT_DEFAULT_SEARCH_MCP_VAR,
			);
			defaultSearchMcp = searchRow?.value?.trim() || null;
			const hintsRow = env.data.variables.find(
				(v) => v.name.trim() === AGENT_CHAT_SETUP_HINTS_VAR,
			);
			setupHints = hintsRow?.value?.trim() || null;
		}
	}

	return {
		ok: true,
		data: chooseCatalogMcpEnablement({
			toolset: parsed.data.toolset,
			activeServerIds: idsFromRows(
				activeListed.data.scope === 'active' ? activeListed.data.activeServers : [],
			),
			catalogServerIds: idsFromRows(
				catalogListed.ok && catalogListed.data.scope === 'catalog'
					? catalogListed.data.availableCatalog
					: [],
			),
			defaultSearchMcp,
			setupHints,
		}),
	};
}
