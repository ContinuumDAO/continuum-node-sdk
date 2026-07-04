import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	missingCmcApiKeyReason,
	resolveCmcApiKey,
} from '../../core/coinmarketcap/api-key.js';
import {
	getAltcoinSeasonIndexLatest,
	getCmc100Latest,
	getCryptoOhlcvHistorical,
	getCryptoQuotesLatest,
	getDexPairQuotes,
	getDexToken,
	getDexTokenPools,
	getFearAndGreedHistorical,
	getFearAndGreedLatest,
	getGlobalMetricsLatest,
	getKlineCandles,
	getSimplePrice,
	searchDexTokens,
	GetAltcoinSeasonIndexLatestInputSchema,
	GetCmc100LatestInputSchema,
	GetCryptoOhlcvHistoricalInputSchema,
	GetCryptoOhlcvHistoricalOutputSchema,
	GetCryptoQuotesLatestInputSchema,
	GetDexPairQuotesInputSchema,
	GetDexTokenInputSchema,
	GetDexTokenPoolsInputSchema,
	GetFearAndGreedHistoricalInputSchema,
	GetFearAndGreedLatestInputSchema,
	GetGlobalMetricsLatestInputSchema,
	GetKlineCandlesInputSchema,
	GetKlineCandlesOutputSchema,
	GetSimplePriceInputSchema,
	SearchDexTokensInputSchema,
} from '../../core/coinmarketcap/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {MCP_LOOSE_OBJECT_SCHEMA, sdkResultToCallToolResult} from '../tool-utils.js';

export function registerCoinMarketCapPublicTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		'get_crypto_ohlcv_historical',
		{
			description:
				'CEX aggregate OHLCV candlesticks from CoinMarketCap Pro API (/v2/cryptocurrency/ohlcv/historical). Requires COINMARKETCAP_API_KEY in Node → AI Agent → Variables (add_environment_variable). Pass CMC id (1=BTC, 1027=ETH), timePeriod (hourly/daily/weekly/monthly), optional count and interval. Returns quotes[] in result for prepare_chart_from_rows / analyze_*.',
			inputSchema: GetCryptoOhlcvHistoricalInputSchema,
			outputSchema: GetCryptoOhlcvHistoricalOutputSchema,
		},
		async (input) => {
			const apiKey = await resolveCmcApiKey(config);
			if (!apiKey) {
				return sdkResultToCallToolResult({ok: false, reason: missingCmcApiKeyReason()});
			}
			return sdkResultToCallToolResult(
				await getCryptoOhlcvHistorical(input, {apiKey}),
			);
		},
	);

	server.registerTool(
		'get_kline_candles',
		{
			description:
				'DEX OHLCV candlesticks from CoinMarketCap keyless API. Pass platform (e.g. ethereum) and pool or token address. Returns chart-ready candles with time (Unix sec), OHLC, volume. Use with prepare_chart_from_rows.',
			inputSchema: GetKlineCandlesInputSchema,
			outputSchema: GetKlineCandlesOutputSchema,
		},
		async (input) => sdkResultToCallToolResult(await getKlineCandles(input)),
	);

	server.registerTool(
		'search_dex_tokens',
		{
			description:
				'Search DEX tokens by keyword (name, symbol, address) via CoinMarketCap keyless API. Returns matching tokens across chains.',
			inputSchema: SearchDexTokensInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await searchDexTokens(input)),
	);

	server.registerTool(
		'get_dex_token',
		{
			description:
				'DEX token detail (price, liquidity, market cap, links) by platform and contract address. CoinMarketCap keyless API.',
			inputSchema: GetDexTokenInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getDexToken(input)),
	);

	server.registerTool(
		'get_dex_token_pools',
		{
			description:
				'List liquidity pools for a DEX token (Uniswap v3/v4, etc.) by platform and token address. Use pool addr for get_kline_candles.',
			inputSchema: GetDexTokenPoolsInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getDexTokenPools(input)),
	);

	server.registerTool(
		'get_dex_pair_quotes',
		{
			description:
				'Latest DEX pair quote by network_id (1 = Ethereum) and pool contract address. CoinMarketCap keyless API.',
			inputSchema: GetDexPairQuotesInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getDexPairQuotes(input)),
	);

	server.registerTool(
		'get_simple_price',
		{
			description:
				'CEX spot prices by CoinMarketCap cryptocurrency ids (comma-separated). Example ids: 1=BTC, 1027=ETH. Keyless API.',
			inputSchema: GetSimplePriceInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getSimplePrice(input)),
	);

	server.registerTool(
		'get_crypto_quotes_latest',
		{
			description:
				'Latest CEX market quotes for one or more CoinMarketCap ids (comma-separated). Keyless API.',
			inputSchema: GetCryptoQuotesLatestInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getCryptoQuotesLatest(input)),
	);

	server.registerTool(
		'get_global_metrics_latest',
		{
			description:
				'Global crypto market snapshot: total market cap, 24h volume, BTC/ETH dominance, DeFi metrics. CoinMarketCap keyless API. Optional convert (default USD).',
			inputSchema: GetGlobalMetricsLatestInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getGlobalMetricsLatest(input)),
	);

	server.registerTool(
		'get_fear_and_greed_latest',
		{
			description:
				'Latest CMC Crypto Fear and Greed Index (0–100) with classification (Extreme Fear, Greed, etc.). Keyless API.',
			inputSchema: GetFearAndGreedLatestInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getFearAndGreedLatest(input)),
	);

	server.registerTool(
		'get_fear_and_greed_historical',
		{
			description:
				'Historical CMC Fear and Greed readings. Optional start (1-based offset) and limit (max 500). Keyless API.',
			inputSchema: GetFearAndGreedHistoricalInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getFearAndGreedHistorical(input)),
	);

	server.registerTool(
		'get_cmc100_latest',
		{
			description:
				'Latest CoinMarketCap 100 index value, 24h change, and constituent weights. Keyless API.',
			inputSchema: GetCmc100LatestInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getCmc100Latest(input)),
	);

	server.registerTool(
		'get_altcoin_season_index_latest',
		{
			description:
				'Latest CMC Altcoin Season Index (0–100; above 75 suggests alt season). Keyless API.',
			inputSchema: GetAltcoinSeasonIndexLatestInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getAltcoinSeasonIndexLatest(input)),
	);
}

export function registerCoinMarketCapPublicResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'coinmarketcap_public_docs',
		'coinmarketcap-public.md',
		'CoinMarketCap keyless public API MCP tools: DEX OHLCV, market snapshot, token search, pools, CEX quotes.',
	);
}

export function createCoinMarketCapPublicMcpServer(config: NodeSdkConfig): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-cmc-public-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerCoinMarketCapPublicTools(server, config);
	registerCoinMarketCapPublicResources(server);

	return server;
}
