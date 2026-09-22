import { McpServer } from "@modelcontextprotocol/server";
import {
	GetCryptoBanterLatestInputSchema,
	GetCryptoBanterLatestOutputSchema,
	ListCryptoBanterSourcesInputSchema,
	ListCryptoBanterSourcesOutputSchema,
	SearchCryptoBanterNewslettersInputSchema,
	getCryptoBanterLatest,
	listCryptoBanterSources,
	searchCryptoBanterNewsletters,
} from '../../core/crypto-banter-newsletters/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerCryptoBanterNewsletterTools(server: McpServer): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_crypto_banter_sources',
		{
			description:
				'List the Crypto Banter Substack RSS sources (The Insider, Good Morning Crypto, The Daily Candle). No API key.',
			inputSchema: ListCryptoBanterSourcesInputSchema,
			outputSchema: ListCryptoBanterSourcesOutputSchema,
		},
		async () => sdkResultToCallToolResult(listCryptoBanterSources()),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_crypto_banter_latest',
		{
			description:
				'Fetch the latest Crypto Banter newsletters from the three public Substack RSS feeds. Optional sourceId (the-insider, good-morning-crypto, the-daily-candle) and limit (1–25, default 8 across selected feeds). No API key. Returns title, URL, date, and a short summary — not the full issue body. Not an OHLCV source. Not crypto-latest.',
			inputSchema: GetCryptoBanterLatestInputSchema,
			outputSchema: GetCryptoBanterLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getCryptoBanterLatest(input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'search_crypto_banter_newsletters',
		{
			description:
				'Search latest Crypto Banter newsletter titles and summaries by keyword. Optional sourceId (the-insider, good-morning-crypto, the-daily-candle) and limit. No API key. Not an OHLCV source.',
			inputSchema: SearchCryptoBanterNewslettersInputSchema,
			outputSchema: GetCryptoBanterLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await searchCryptoBanterNewsletters(input)),
	);
}

export function registerCryptoBanterNewsletterResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'crypto_banter_newsletters_docs',
		'crypto-banter-newsletters.md',
		'Crypto Banter newsletters: The Insider, Good Morning Crypto, and The Daily Candle Substack RSS.',
	);
}

export function createCryptoBanterNewslettersMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-crypto-banter-newsletters-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerCryptoBanterNewsletterTools(server);
	registerCryptoBanterNewsletterResources(server);

	return server;
}
