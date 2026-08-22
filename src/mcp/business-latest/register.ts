import { McpServer } from "@modelcontextprotocol/server";
import {
	GetBusinessLatestInputSchema,
	GetBusinessLatestOutputSchema,
	ListBusinessSourcesInputSchema,
	ListBusinessSourcesOutputSchema,
	SearchBusinessLatestInputSchema,
	getBusinessLatest,
	listBusinessSources,
	searchBusinessLatest,
} from '../../core/business-latest/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerBusinessLatestTools(server: McpServer): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_business_sources',
		{
			description:
				'List the free Business Latest RSS sources (BBC Business, CNBC Business, MarketWatch, Forbes Business, Reuters World via Google News, RT Business). No API key.',
			inputSchema: ListBusinessSourcesInputSchema,
			outputSchema: ListBusinessSourcesOutputSchema,
		},
		async () => sdkResultToCallToolResult(listBusinessSources()),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_business_latest',
		{
			description:
				'Fetch latest business headlines from the configured free RSS feeds. Optional sourceId (bbc-business, cnbc-business, marketwatch, forbes-business, reuters-world, rt-business) and limit (1–25, default 8 across selected feeds). No API key. Not an OHLCV source.',
			inputSchema: GetBusinessLatestInputSchema,
			outputSchema: GetBusinessLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getBusinessLatest(input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'search_business_latest',
		{
			description:
				'Search latest Business Latest RSS items by keyword (title/summary). Optional sourceId and limit. No API key. Not an OHLCV source.',
			inputSchema: SearchBusinessLatestInputSchema,
			outputSchema: GetBusinessLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await searchBusinessLatest(input)),
	);
}

export function registerBusinessLatestResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'business_latest_docs',
		'business-latest.md',
		'Business Latest RSS: free BBC, CNBC, MarketWatch, Forbes, Reuters (Google News), and RT feeds.',
	);
}

export function createBusinessLatestMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-business-latest-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerBusinessLatestTools(server);
	registerBusinessLatestResources(server);

	return server;
}
