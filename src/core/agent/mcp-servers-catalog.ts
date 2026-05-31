import type {AddMcpServerInput} from '../../schemas/extended.js';

/** Bundled optional MCP catalog (keep in sync with mpc-config agent_llm_config/MCP_servers.json). */
export const BUNDLED_MCP_SERVER_TEMPLATES: readonly AddMcpServerInput[] = [
	{
		id: 'duckduckgo',
		displayName: 'DuckDuckGo search',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', 'duckduckgo-mcp-server'],
		initialLoad: false,
	},
	{
		id: 'foundry',
		displayName: 'Foundry (Forge, Cast, Anvil)',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@pranesh.asp/foundry-mcp-server'],
		useUserFolder: true,
		runtime: {
			requireCommands: ['npx', 'forge', 'cast', 'anvil', 'heimdall'],
		},
		initialLoad: false,
	},
	{
		id: 'etherscan',
		displayName: 'Etherscan',
		transport: 'http',
		url: 'https://mcp.etherscan.io/mcp',
		apiKeyEnvVar: 'ETHERSCAN_API_KEY',
		initialLoad: false,
	},
	{
		id: 'coingecko',
		displayName: 'CoinGecko (public)',
		transport: 'http',
		url: 'https://mcp.api.coingecko.com/mcp',
		initialLoad: false,
	},
	{
		id: 'coingecko-pro',
		displayName: 'CoinGecko Pro',
		transport: 'http',
		url: 'https://mcp.pro-api.coingecko.com/mcp',
		apiKeyEnvVar: 'COINGECKO_API_KEY',
		apiKeyHeader: 'x-cg-pro-api-key',
		initialLoad: false,
	},
	{
		id: 'x',
		displayName: 'X (Twitter)',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@iflow-mcp/datawhisker-x-mcp-server'],
		envVars: [
			'TWITTER_API_KEY',
			'TWITTER_API_SECRET',
			'TWITTER_ACCESS_TOKEN',
			'TWITTER_ACCESS_SECRET',
		],
		initialLoad: false,
	},
] as const;
