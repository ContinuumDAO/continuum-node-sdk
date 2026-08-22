import {z} from 'zod';

/** Known catalog MCP servers that return chartable OHLCV (not every MCP server). */
export type OhlcvMcpSourceSpec = {
	serverId: string;
	displayName: string;
	fetchHint: string;
	requiredEnvVars: readonly string[];
	liveProviderId?: string;
};

export const OHLCV_MCP_SOURCE_CATALOG: readonly OhlcvMcpSourceSpec[] = [
	{
		serverId: 'coingecko',
		displayName: 'CoinGecko',
		fetchHint: 'coingecko__execute → coins.ohlc.get',
		requiredEnvVars: [],
		liveProviderId: 'coingecko.simple',
	},
	{
		serverId: 'coingecko-pro',
		displayName: 'CoinGecko Pro',
		fetchHint: 'coingecko-pro__execute → coins.ohlc.get',
		requiredEnvVars: ['COINGECKO_API_KEY'],
		liveProviderId: 'coingecko.simple',
	},
	{
		serverId: 'coinmarketcap-public',
		displayName: 'CoinMarketCap (public)',
		fetchHint: 'coinmarketcap-public__get_kline_candles (keyless); get_crypto_ohlcv_historical if COINMARKETCAP_API_KEY',
		requiredEnvVars: [],
	},
	{
		serverId: 'coinbase-public',
		displayName: 'Coinbase Advanced Trade (public)',
		fetchHint: 'coinbase-public__get_product_candles',
		requiredEnvVars: [],
		liveProviderId: 'coinbase.productTicker',
	},
	{
		serverId: 'binance',
		displayName: 'Binance (public market data)',
		fetchHint: 'binance_get_klines with response_format: "json"',
		requiredEnvVars: [],
		liveProviderId: 'binance.tickerPrice',
	},
	{
		serverId: 'financial-modeling-prep',
		displayName: 'Financial Modeling Prep',
		fetchHint: 'financial-modeling-prep historical / chart tools (keep date)',
		requiredEnvVars: ['FMP_API_KEY'],
		liveProviderId: 'fmp.quote',
	},
	{
		serverId: 'alpaca',
		displayName: 'Alpaca (v2)',
		fetchHint: 'alpaca__get_stock_bars / get_crypto_bars (keep t)',
		requiredEnvVars: ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY'],
		liveProviderId: 'alpaca.latestTrade',
	},
	{
		serverId: 'alphavantage',
		displayName: 'Alpha Vantage',
		fetchHint: 'alphavantage stock / forex / crypto time series (TOOL_LIST / TOOL_CALL)',
		requiredEnvVars: ['ALPHA_VANTAGE_API_KEY'],
	},
	{
		serverId: 'equibles',
		displayName: 'Equibles',
		fetchHint: 'equibles__GetStockPrices (keep date; markdown table or { data: [{ date, open, … }] })',
		requiredEnvVars: ['EQUIBLES_API_KEY'],
	},
] as const;

const OHLCV_MCP_BY_ID = new Map(OHLCV_MCP_SOURCE_CATALOG.map(s => [s.serverId, s]));

export function ohlcvMcpSourceSpec(serverId: string): OhlcvMcpSourceSpec | undefined {
	return OHLCV_MCP_BY_ID.get(serverId.trim().toLowerCase());
}

export const OhlcvMcpSourceRowSchema = z
	.object({
		kind: z.literal('mcp'),
		serverId: z.string(),
		displayName: z.string(),
		availability: z.enum(['active', 'repository']),
		initialLoad: z.boolean(),
		envConfigured: z.boolean().optional(),
		requiredEnvVars: z.array(z.string()),
		fetchHint: z.string(),
		liveProviderId: z.string().optional(),
		enable: z.enum(['agent_load_mcp_server', 'add_mcp_server_from_catalog']),
	})
	.strict();

export const OhlcvDefiSourceRowSchema = z
	.object({
		kind: z.literal('defi'),
		protocolId: z.string(),
		availability: z.enum(['active', 'repository']),
		loaded: z.boolean(),
		fetchHint: z.string(),
		enable: z.literal('load_defi_protocol'),
	})
	.strict();

export const OhlcvSourceRowSchema = z.discriminatedUnion('kind', [
	OhlcvMcpSourceRowSchema,
	OhlcvDefiSourceRowSchema,
]);

export const ListOhlcvSourcesResultSchema = z
	.object({
		active: z.array(OhlcvSourceRowSchema),
		repository: z.array(OhlcvSourceRowSchema),
		note: z.string(),
		mcpListError: z.string().optional(),
	})
	.strict();

export type OhlcvMcpSourceRow = z.infer<typeof OhlcvMcpSourceRowSchema>;
export type OhlcvDefiSourceRow = z.infer<typeof OhlcvDefiSourceRowSchema>;
export type OhlcvSourceRow = z.infer<typeof OhlcvSourceRowSchema>;
export type ListOhlcvSourcesResult = z.infer<typeof ListOhlcvSourcesResultSchema>;

export type OhlcvSourceServerSnapshot = {
	id: string;
	displayName?: string;
	initialLoad?: boolean;
	envConfigured?: boolean;
};

export type OhlcvSourceDefiSnapshot = {
	protocolId: string;
	fetchTool?: string;
};

export type ListOhlcvSourcesInput = {
	activeServers?: readonly OhlcvSourceServerSnapshot[];
	availableCatalog?: readonly OhlcvSourceServerSnapshot[];
	loadedProtocolIds?: readonly string[];
	defiProtocols?: readonly OhlcvSourceDefiSnapshot[];
	mcpListError?: string;
};

const LIST_NOTE =
	'OHLCV inventory only — not the full MCP catalog (use list_mcp_servers for that). ' +
	'Do not auto-load. Ask the operator which source to use. ' +
	'Catalog MCP: add_mcp_server_from_catalog if only in repository, then agent_load_mcp_server after they choose. ' +
	'DeFi venues: load_defi_protocol — not agent_load_mcp_server.';

function mcpRowFromServer(
	server: OhlcvSourceServerSnapshot,
	availability: 'active' | 'repository',
): OhlcvMcpSourceRow | undefined {
	const spec = ohlcvMcpSourceSpec(server.id);
	if (!spec) {
		return undefined;
	}
	const row: OhlcvMcpSourceRow = {
		kind: 'mcp',
		serverId: spec.serverId,
		displayName: server.displayName?.trim() || spec.displayName,
		availability,
		initialLoad: Boolean(server.initialLoad),
		requiredEnvVars: [...spec.requiredEnvVars],
		fetchHint: spec.fetchHint,
		enable:
			availability === 'active' ? 'agent_load_mcp_server' : 'add_mcp_server_from_catalog',
	};
	if (server.envConfigured != null) {
		row.envConfigured = server.envConfigured;
	}
	if (spec.liveProviderId) {
		row.liveProviderId = spec.liveProviderId;
	}
	return row;
}

function defiRow(protocol: OhlcvSourceDefiSnapshot, loaded: boolean): OhlcvDefiSourceRow | undefined {
	const protocolId = protocol.protocolId.trim();
	const fetchTool = protocol.fetchTool?.trim();
	if (!protocolId || !fetchTool) {
		return undefined;
	}
	return {
		kind: 'defi',
		protocolId,
		availability: loaded ? 'active' : 'repository',
		loaded,
		fetchHint: fetchTool,
		enable: 'load_defi_protocol',
	};
}

function sortRows(rows: OhlcvSourceRow[]): OhlcvSourceRow[] {
	return [...rows].sort((a, b) => {
		if (a.kind !== b.kind) {
			return a.kind === 'mcp' ? -1 : 1;
		}
		const aId = a.kind === 'mcp' ? a.serverId : a.protocolId;
		const bId = b.kind === 'mcp' ? b.serverId : b.protocolId;
		return aId.localeCompare(bId);
	});
}

/**
 * Merge node MCP list + DeFi load state into OHLCV-only active vs repository lists.
 * `active` MCP rows are on the node (GET /listMcpServers activeServers).
 * `repository` MCP rows are catalog templates not yet added (availableCatalog).
 * DeFi: loaded protocols are active; other fetch_ohlcv protocols are repository (load_defi_protocol).
 */
export function listOhlcvSources(input: ListOhlcvSourcesInput = {}): ListOhlcvSourcesResult {
	const active: OhlcvSourceRow[] = [];
	const repository: OhlcvSourceRow[] = [];
	const seenMcp = new Set<string>();

	for (const server of input.activeServers ?? []) {
		const row = mcpRowFromServer(server, 'active');
		if (!row || seenMcp.has(row.serverId)) {
			continue;
		}
		seenMcp.add(row.serverId);
		active.push(row);
	}

	for (const server of input.availableCatalog ?? []) {
		const row = mcpRowFromServer(server, 'repository');
		if (!row || seenMcp.has(row.serverId)) {
			continue;
		}
		seenMcp.add(row.serverId);
		repository.push(row);
	}

	const loaded = new Set(
		(input.loadedProtocolIds ?? []).map(id => id.trim()).filter(Boolean),
	);
	for (const protocol of input.defiProtocols ?? []) {
		const isLoaded = loaded.has(protocol.protocolId.trim());
		const row = defiRow(protocol, isLoaded);
		if (!row) {
			continue;
		}
		if (isLoaded) {
			active.push(row);
		} else {
			repository.push(row);
		}
	}

	const result: ListOhlcvSourcesResult = {
		active: sortRows(active),
		repository: sortRows(repository),
		note: LIST_NOTE,
	};
	if (input.mcpListError?.trim()) {
		result.mcpListError = input.mcpListError.trim();
	}
	return result;
}
