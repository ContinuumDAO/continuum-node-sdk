import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {NodeSdkConfig} from '../../config/schema.js';
import {
	GetProductBookInputSchema,
	GetProductCandlesInputSchema,
	GetProductCandlesOutputSchema,
	GetProductTickerInputSchema,
	ListProductsInputSchema,
	SearchProductsInputSchema,
	getProductBook,
	getProductCandles,
	getProductTicker,
	listProducts,
	searchProducts,
} from '../../core/coinbase/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {MCP_LOOSE_OBJECT_SCHEMA, sdkResultToCallToolResult} from '../tool-utils.js';

export function registerCoinbasePublicTools(
	server: McpServer,
	config: NodeSdkConfig,
): void {
	server.registerTool(
		'get_product_candles',
		{
			description:
				'Coinbase Advanced Trade spot OHLCV. Pass productId (e.g. BTC-USD) and interval (1m/5m/15m/30m/1h/2h/4h/6h/1d) or granularity. ' +
				'Returns Continuum-normalized candles { time, open, high, low, close, volume? } with dataSource coinbase_candles — ' +
				'pass the full object to prepare_chart_from_rows / analyze_* as toolResult (do not rewrite bars). ' +
				'Keyless public market API by default; optional CDP Variables unlock authenticated routes.',
			inputSchema: GetProductCandlesInputSchema,
			outputSchema: GetProductCandlesOutputSchema,
		},
		async (input) =>
			sdkResultToCallToolResult(await getProductCandles(input, {config})),
	);

	server.registerTool(
		'list_products',
		{
			description:
				'List Coinbase Advanced Trade products (spot by default). Use search_products to find a productId.',
			inputSchema: ListProductsInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await listProducts(input, {config})),
	);

	server.registerTool(
		'search_products',
		{
			description:
				'Search Coinbase spot products by query (e.g. BTC, ETH-USD). Returns matching product_id rows.',
			inputSchema: SearchProductsInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await searchProducts(input, {config})),
	);

	server.registerTool(
		'get_product_ticker',
		{
			description:
				'Recent Coinbase Advanced Trade market trades / last price for a productId (live tick helper).',
			inputSchema: GetProductTickerInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getProductTicker(input, {config})),
	);

	server.registerTool(
		'get_product_book',
		{
			description:
				'Coinbase Advanced Trade spot order book. Returns Continuum NormalizedDepthSnapshot under book ' +
				'(exchangeId coinbase, numeric bids/asks) — not raw pricebook nesting. ' +
				'For averaged walls use continuum analyze_liquidity_depth with depthExchangeId coinbase.',
			inputSchema: GetProductBookInputSchema,
			outputSchema: MCP_LOOSE_OBJECT_SCHEMA,
		},
		async (input) => sdkResultToCallToolResult(await getProductBook(input, {config})),
	);
}

export function registerCoinbasePublicResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'coinbase_public_docs',
		'coinbase-public.md',
		'Coinbase Advanced Trade public MCP: spot OHLCV, products, ticker, order book; optional CDP Variables.',
	);
}

export function createCoinbasePublicMcpServer(config: NodeSdkConfig): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-coinbase-public-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerCoinbasePublicTools(server, config);
	registerCoinbasePublicResources(server);

	return server;
}
