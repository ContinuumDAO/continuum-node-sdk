import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createTaMcpServer} from '../ta/register.js';

async function main(): Promise<void> {
	// MCP 2026-07-28 only — refuse legacy initialize clients.
	await serveStdio(() => createTaMcpServer(), {legacy: 'reject'});
}

main().catch(error => {
	console.error('Fatal error in ta-mcp main():', error);
	process.exit(1);
});
