import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
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
import {mcpStructuredContent, sdkResultToCallToolResult} from '../tool-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerTaTools(server: McpServer): void {
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

	const resourcePath = path.join(__dirname, 'resources', 'indicators.md');
	server.registerResource(
		'technical-indicators',
		'docs://technical-indicators',
		{
			description:
				'Technical indicators MCP usage: input profiles, warmup semantics, and examples.',
			mimeType: 'text/markdown',
		},
		async () => {
			const text = await fs.readFile(resourcePath, 'utf8');
			return {
				contents: [
					{
						uri: 'docs://technical-indicators',
						mimeType: 'text/markdown',
						text,
					},
				],
			};
		},
	);

	return server;
}

export {mcpStructuredContent};
