import { McpServer } from "@modelcontextprotocol/server";
import {
	GetCryptoLatestInputSchema,
	GetCryptoLatestOutputSchema,
	ListCryptoSourcesInputSchema,
	ListCryptoSourcesOutputSchema,
	SearchCryptoLatestInputSchema,
	getCryptoLatest,
	listCryptoSources,
	searchCryptoLatest,
} from '../../core/crypto-latest/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerCryptoLatestTools(server: McpServer): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_crypto_sources',
		{
			description:
				'List the free Crypto Latest RSS sources (CoinDesk, The Block, Cointelegraph, Decrypt, Blockworks, The Defiant, Bitcoin Magazine, Crypto Potato, CryptoSlate, Good Morning Crypto, OpenZeppelin). No API key.',
			inputSchema: ListCryptoSourcesInputSchema,
			outputSchema: ListCryptoSourcesOutputSchema,
		},
		async () => sdkResultToCallToolResult(listCryptoSources()),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_crypto_latest',
		{
			description:
				'Fetch latest cryptocurrency headlines from the configured free RSS feeds. Optional sourceId (coindesk, the-block, cointelegraph, decrypt, blockworks, the-defiant, bitcoin-magazine, crypto-potato, crypto-slate, good-morning-crypto, openzeppelin) and limit (1–25, default 16 across selected feeds). No API key. Not an OHLCV source. Not CryptoPanic.',
			inputSchema: GetCryptoLatestInputSchema,
			outputSchema: GetCryptoLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getCryptoLatest(input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'search_crypto_latest',
		{
			description:
				'Search latest Crypto Latest RSS items by keyword (title/summary). Optional sourceId and limit. No API key. Not an OHLCV source.',
			inputSchema: SearchCryptoLatestInputSchema,
			outputSchema: GetCryptoLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await searchCryptoLatest(input)),
	);
}

export function registerCryptoLatestResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'crypto_latest_docs',
		'crypto-latest.md',
		'Crypto Latest RSS: free CoinDesk, The Block, Cointelegraph, Decrypt, Blockworks, The Defiant, Bitcoin Magazine, Crypto Potato, CryptoSlate, Good Morning Crypto, and OpenZeppelin feeds.',
	);
}

export function createCryptoLatestMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-crypto-latest-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerCryptoLatestTools(server);
	registerCryptoLatestResources(server);

	return server;
}
