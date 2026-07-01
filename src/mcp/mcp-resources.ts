import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const mcpModuleDir = path.dirname(fileURLToPath(import.meta.url));

/** Resolved path to a markdown file under dist/mcp/resources (copied at build time). */
export function resolveMcpResourcePath(relativePath: string): string {
	return path.join(mcpModuleDir, 'resources', relativePath);
}

export function registerMcpMarkdownResource(
	server: McpServer,
	name: string,
	relativePath: string,
	description: string,
): void {
	const uri = `docs://${relativePath}`;
	server.registerResource(
		name,
		uri,
		{description, mimeType: 'text/markdown'},
		async () => {
			const filePath = resolveMcpResourcePath(relativePath);
			const text = await fs.readFile(filePath, 'utf8');
			return {
				contents: [
					{
						uri,
						mimeType: 'text/markdown',
						text,
					},
				],
			};
		},
	);
}
