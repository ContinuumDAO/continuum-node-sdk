import { McpServer } from "@modelcontextprotocol/server";
import {
	GetCoinBureauLatestInputSchema,
	GetCoinBureauLatestOutputSchema,
	SearchCoinBureauNewslettersInputSchema,
	getCoinBureauLatest,
	searchCoinBureauNewsletters,
} from '../../core/coin-bureau-newsletters/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerCoinBureauNewsletterTools(server: McpServer): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_coin_bureau_latest',
		{
			description:
				'Fetch the latest Coin Bureau weekly newsletters (title, URL, date, archive blurb). Optional limit (1–25, default 8). Parses the public archive listing and newsletter sitemap — Coin Bureau has no RSS. No API key. Not an OHLCV source. Not crypto-latest.',
			inputSchema: GetCoinBureauLatestInputSchema,
			outputSchema: GetCoinBureauLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getCoinBureauLatest(input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'search_coin_bureau_newsletters',
		{
			description:
				'Search Coin Bureau newsletter titles and archive blurbs by keyword. Optional limit (1–25, default 8). No API key. Does not return full issue bodies.',
			inputSchema: SearchCoinBureauNewslettersInputSchema,
			outputSchema: GetCoinBureauLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await searchCoinBureauNewsletters(input)),
	);
}

export function registerCoinBureauNewsletterResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'coin_bureau_newsletters_docs',
		'coin-bureau-newsletters.md',
		'Coin Bureau weekly newsletters: archive listing plus sitemap (no public RSS).',
	);
}

export function createCoinBureauNewslettersMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-coin-bureau-newsletters-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerCoinBureauNewsletterTools(server);
	registerCoinBureauNewsletterResources(server);

	return server;
}
