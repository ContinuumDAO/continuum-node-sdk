import { McpServer } from "@modelcontextprotocol/server";
import {
	GetWorldAffairsLatestInputSchema,
	GetWorldAffairsLatestOutputSchema,
	ListWorldAffairsSourcesInputSchema,
	ListWorldAffairsSourcesOutputSchema,
	SearchWorldAffairsLatestInputSchema,
	getWorldAffairsLatest,
	listWorldAffairsSources,
	searchWorldAffairsLatest,
} from '../../core/world-affairs/index.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';

export function registerWorldAffairsTools(server: McpServer): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_world_affairs_sources',
		{
			description:
				'List the free World Affairs RSS sources (BBC World, Al Jazeera, The Guardian World, DW, France 24, NPR, CNN World, RT News). No API key. Guardian, NPR, CNN, and RT rows include biasNote — treat those outlets accordingly.',
			inputSchema: ListWorldAffairsSourcesInputSchema,
			outputSchema: ListWorldAffairsSourcesOutputSchema,
		},
		async () => sdkResultToCallToolResult(listWorldAffairsSources()),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'get_world_affairs_latest',
		{
			description:
				'Fetch latest world-affairs headlines from the configured free RSS feeds. Optional sourceId (bbc-world, aljazeera, guardian-world, dw-world, france24, npr, cnn-world, rt-news) and limit (1–25, default 8). No API key. Items from The Guardian include biasNote "Left wing bias"; NPR and CNN include "Some political left wing bias"; RT includes "Potential bias". Not an OHLCV source.',
			inputSchema: GetWorldAffairsLatestInputSchema,
			outputSchema: GetWorldAffairsLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await getWorldAffairsLatest(input)),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'search_world_affairs_latest',
		{
			description:
				'Search latest World Affairs RSS items by keyword (title/summary). Optional sourceId and limit. No API key. Preserve biasNote on Guardian / NPR / CNN / RT items. Not an OHLCV source.',
			inputSchema: SearchWorldAffairsLatestInputSchema,
			outputSchema: GetWorldAffairsLatestOutputSchema,
		},
		async input => sdkResultToCallToolResult(await searchWorldAffairsLatest(input)),
	);
}

export function registerWorldAffairsResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'world_affairs_docs',
		'world-affairs.md',
		'World Affairs RSS: free BBC, Al Jazeera, Guardian, DW, France 24, NPR, CNN, and RT feeds, with bias notes.',
	);
}

export function createWorldAffairsMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-world-affairs-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerWorldAffairsTools(server);
	registerWorldAffairsResources(server);

	return server;
}
