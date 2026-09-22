import {createArkhamIntelMcpServer} from '../arkham-intel/register.js';
import {createBusinessLatestMcpServer} from '../business-latest/register.js';
import {createCoinbasePublicMcpServer} from '../coinbase-public/register.js';
import {createCoinMarketCapPublicMcpServer} from '../coinmarketcap-public/register.js';
import {createContinuumDaoTokenomicsMcpServer} from '../continuumdao-tokenomics/register.js';
import {createCoinBureauNewslettersMcpServer} from '../coin-bureau-newsletters/register.js';
import {createCryptoBanterNewslettersMcpServer} from '../crypto-banter-newsletters/register.js';
import {createCryptoLatestMcpServer} from '../crypto-latest/register.js';
import {createCryptoSecurityMcpServer} from '../crypto-security/register.js';
import {createWorldAffairsMcpServer} from '../world-affairs/register.js';
import {DefiProtocolContext} from '../defi/context.js';
import {createContinuumMcpServer} from '../register.js';
import {createTaMcpServer} from '../ta/register.js';
import {createVpnMcpServer} from '../vpn.js';
import {nodeSdkConfigFromEnv} from './config-from-env.js';
import {startHttpTransportServer} from './http-transport.js';
import {mountTelegramSearchInternalRoutes} from './telegram-search-internal.js';

async function main(): Promise<void> {
	const config = nodeSdkConfigFromEnv();
	const mainPath = process.env['MCP_HTTP_PATH'] ?? '/mcp';
	const taPath = process.env['MCP_HTTP_TA_PATH'] ?? '/mcp/ta';
	const vpnPath = process.env['MCP_HTTP_VPN_PATH'] ?? '/mcp/vpn';
	const cmcPublicPath = process.env['MCP_HTTP_CMC_PUBLIC_PATH'] ?? '/mcp/cmc-public';
	const coinbasePublicPath =
		process.env['MCP_HTTP_COINBASE_PUBLIC_PATH'] ?? '/mcp/coinbase-public';
	const businessLatestPath =
		process.env['MCP_HTTP_BUSINESS_LATEST_PATH'] ?? '/mcp/business-latest';
	const worldAffairsPath =
		process.env['MCP_HTTP_WORLD_AFFAIRS_PATH'] ?? '/mcp/world-affairs';
	const cryptoLatestPath =
		process.env['MCP_HTTP_CRYPTO_LATEST_PATH'] ?? '/mcp/crypto-latest';
	const cryptoSecurityPath =
		process.env['MCP_HTTP_CRYPTO_SECURITY_PATH'] ?? '/mcp/crypto-security';
	const coinBureauNewslettersPath =
		process.env['MCP_HTTP_COIN_BUREAU_NEWSLETTERS_PATH'] ??
		'/mcp/coin-bureau-newsletters';
	const cryptoBanterNewslettersPath =
		process.env['MCP_HTTP_CRYPTO_BANTER_NEWSLETTERS_PATH'] ??
		'/mcp/crypto-banter-newsletters';
	const arkhamIntelPath =
		process.env['MCP_HTTP_ARKHAM_INTEL_PATH'] ?? '/mcp/arkham-intel';
	const tokenomicsPath =
		process.env['MCP_HTTP_CONTINUUMDAO_TOKENOMICS_PATH'] ??
		'/mcp/continuumdao-tokenomics';

	// createMcpHandler builds a new McpServer per HTTP request (no Mcp-Session-Id).
	// Share DefiProtocolContext so load_defi_protocol survives into later tools/call.
	const sharedDefiContext = new DefiProtocolContext();

	await startHttpTransportServer(
		[
			{
				path: mainPath,
				createServer: () =>
					createContinuumMcpServer(config, {defiContext: sharedDefiContext}),
			},
			{path: taPath, createServer: () => createTaMcpServer()},
			{path: vpnPath, createServer: () => createVpnMcpServer(config)},
			{path: cmcPublicPath, createServer: () => createCoinMarketCapPublicMcpServer(config)},
			{path: coinbasePublicPath, createServer: () => createCoinbasePublicMcpServer(config)},
			{path: businessLatestPath, createServer: () => createBusinessLatestMcpServer()},
			{path: worldAffairsPath, createServer: () => createWorldAffairsMcpServer()},
			{path: cryptoLatestPath, createServer: () => createCryptoLatestMcpServer()},
			{path: cryptoSecurityPath, createServer: () => createCryptoSecurityMcpServer()},
			{
				path: coinBureauNewslettersPath,
				createServer: () => createCoinBureauNewslettersMcpServer(),
			},
			{
				path: cryptoBanterNewslettersPath,
				createServer: () => createCryptoBanterNewslettersMcpServer(),
			},
			{path: arkhamIntelPath, createServer: () => createArkhamIntelMcpServer(config)},
			{
				path: tokenomicsPath,
				createServer: () => createContinuumDaoTokenomicsMcpServer(config),
			},
		],
		{mountExtraRoutes: mountTelegramSearchInternalRoutes},
	);
}

main().catch(error => {
	console.error('Fatal error in main():', error);
	process.exit(1);
});
