import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createTaMcpServer} from '../ta/register.js';

async function main(): Promise<void> {
	const server = createTaMcpServer();
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch(error => {
	console.error('Fatal error in ta-mcp main():', error);
	process.exit(1);
});
