import { McpServer } from "@modelcontextprotocol/server";
import {
	GetCryptoSecurityLatestInputSchema,
	GetCryptoSecurityLatestOutputSchema,
	ListCryptoSecuritySourcesInputSchema,
	ListCryptoSecuritySourcesOutputSchema,
	SearchCryptoSecurityInputSchema,
	getCryptoSecurityLatest,
	listCryptoSecuritySources,
	searchCryptoSecurity,
} from '../../core/crypto-security/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerCryptoSecurityTools(server: McpServer): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_crypto_security_sources',
		{
			description:
				'List the free Crypto Security RSS sources (QuillAudits, SlowMist, Immunefi, BlockSec, CertiK, Rekt, Trail of Bits). No API key.',
			inputSchema: ListCryptoSecuritySourcesInputSchema,
			outputSchema: ListCryptoSecuritySourcesOutputSchema,
		},
		async () => sdkResultToCallToolResult(listCryptoSecuritySources()),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_crypto_security_latest',
		{
			description:
				'Fetch latest crypto security write-ups and hack analyses from the configured free RSS feeds. Optional sourceId (quillaudits, slowmist, immunefi, blocksec, certik, rekt, trail-of-bits) and limit (1–25, default 16 across selected feeds). No API key. Returns title, URL, date, and a short summary. Not an OHLCV source. Not crypto-latest.',
			inputSchema: GetCryptoSecurityLatestInputSchema,
			outputSchema: GetCryptoSecurityLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getCryptoSecurityLatest(input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'search_crypto_security',
		{
			description:
				'Search latest Crypto Security RSS items by keyword (title/summary). Optional sourceId (quillaudits, slowmist, immunefi, blocksec, certik, rekt, trail-of-bits) and limit. No API key. Not an OHLCV source.',
			inputSchema: SearchCryptoSecurityInputSchema,
			outputSchema: GetCryptoSecurityLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await searchCryptoSecurity(input)),
	);
}

export function registerCryptoSecurityResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'crypto_security_docs',
		'crypto-security.md',
		'Crypto Security RSS: free QuillAudits, SlowMist, Immunefi, BlockSec, CertiK, Rekt, and Trail of Bits feeds.',
	);
}

export function createCryptoSecurityMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-crypto-security-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerCryptoSecurityTools(server);
	registerCryptoSecurityResources(server);

	return server;
}
