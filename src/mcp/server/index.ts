import {createCoinMarketCapPublicMcpServer} from '../coinmarketcap-public/register.js';
import {createContinuumMcpServer} from '../register.js';
import {createTaMcpServer} from '../ta/register.js';
import {createVpnMcpServer} from '../vpn.js';
import {nodeSdkConfigFromEnv} from './config-from-env.js';
import {startHttpTransportServer} from './http-transport.js';

async function main(): Promise<void> {
	const config = nodeSdkConfigFromEnv();
	const mainPath = process.env['MCP_HTTP_PATH'] ?? '/mcp';
	const taPath = process.env['MCP_HTTP_TA_PATH'] ?? '/mcp/ta';
	const vpnPath = process.env['MCP_HTTP_VPN_PATH'] ?? '/mcp/vpn';
	const cmcPublicPath = process.env['MCP_HTTP_CMC_PUBLIC_PATH'] ?? '/mcp/cmc-public';

	await startHttpTransportServer([
		{path: mainPath, createServer: () => createContinuumMcpServer(config)},
		{path: taPath, createServer: () => createTaMcpServer()},
		{path: vpnPath, createServer: () => createVpnMcpServer(config)},
		{path: cmcPublicPath, createServer: () => createCoinMarketCapPublicMcpServer()},
	]);
}

main().catch(error => {
	console.error('Fatal error in main():', error);
	process.exit(1);
});
