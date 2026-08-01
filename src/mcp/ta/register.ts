import { McpServer } from "@modelcontextprotocol/server";
import {z} from 'zod';
import {
	calculateTechnicalIndicator,
	listTechnicalIndicators,
} from '../../core/ta/calculate.js';
import {
	CalculateTechnicalIndicatorInputSchema,
	CalculateTechnicalIndicatorOutputSchema,
	ListTechnicalIndicatorsOutputSchema,
} from '../../core/ta/schemas.js';
import {registerMcpMarkdownResource} from '../mcp-resources.js';
import {mcpStructuredContent, sdkResultToCallToolResult} from '../tool-utils.js';

export function registerTaTools(server: McpServer): void {
	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'list_technical_indicators',
		{
			description:
				'List technical indicators available via calculate_technical_indicator: id, category, inputProfile, defaultParams, outputKind. Call this before computing.',
			inputSchema: z.object({}).strict(),
			outputSchema: ListTechnicalIndicatorsOutputSchema,
		},
		async () => sdkResultToCallToolResult(listTechnicalIndicators()),
	);

	/* @mcp-codemod-error Could not verify `inputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. | Could not verify `outputSchema` is a schema object. Raw shapes are deprecated in v2 — pass a Standard Schema object (e.g. z.object({ … })); no change is needed if it already is one. */
	server.registerTool(
		'calculate_technical_indicator',
		{
			description:
				'Compute one technical indicator from time series or OHLC(V) arrays. Use list_technical_indicators for inputProfile requirements. Supports params (period, stdDev, etc.), options.trimWarmup, options.maxPoints.',
			inputSchema: CalculateTechnicalIndicatorInputSchema,
			outputSchema: CalculateTechnicalIndicatorOutputSchema,
		},
		async (input: z.infer<typeof CalculateTechnicalIndicatorInputSchema>) =>
			sdkResultToCallToolResult(calculateTechnicalIndicator(input)),
	);
}

export function registerTaResources(server: McpServer): void {
	registerMcpMarkdownResource(
		server,
		'technical_indicators_docs',
		'technical-indicators.md',
		'Technical indicators: input profiles, warmup semantics, and examples.',
	);
}

export function createTaMcpServer(): McpServer {
	const server = new McpServer(
		{
			name: 'continuum-ta-mcp',
			version: '1.0.0',
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	registerTaTools(server);
	registerTaResources(server);

	return server;
}

export {mcpStructuredContent};
