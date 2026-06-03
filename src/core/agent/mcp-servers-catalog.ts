import type {AddMcpServerInput} from '../../schemas/extended.js';

/**
 * Bundled optional MCP catalog (keep in sync with mpc-config agent_llm_config.defaults/MCP_servers.json).
 *
 * When adding another MCP server template, always wire secrets through agent Variables — never inline
 * values in this catalog or in MCP_servers.json on disk:
 * - HTTP auth: `apiKeyEnvVar` (+ optional `apiKeyHeader`); never `apiKey`.
 * - STDIO secrets: `envVars` (all listed names required before load) and/or optional `apiKeyEnvVar`
 *   (injected when set; does not block load if unset). Operators set values via POST /addEnvironmentVariable
 *   (Node UI → AI Agent → Variables).
 * The AI agent must not see Variable values — only names in listings (`apiKeyEnvVar`, `envVars`,
 * `envConfigured`). Do not add MCP tools that return secret values to the agent.
 */
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
		id: 'finance-news',
		displayName: 'Finance News RSS',
		transport: 'stdio',
		command: 'uv',
		args: [
			'run',
			'--with',
			'git+https://github.com/jvenkatasandeep/finance-news-mcp',
			'fastmcp',
			'run',
			'https://github.com/jvenkatasandeep/finance-news-mcp/raw/main/main.py',
		],
		runtime: {
			requireCommands: ['uv'],
		},
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
		id: 'dune',
		displayName: 'Dune Analytics',
		transport: 'http',
		url: 'https://api.dune.com/mcp/v1',
		apiKeyEnvVar: 'DUNE_API_KEY',
		apiKeyHeader: 'x-dune-api-key',
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
		id: 'binance',
		displayName: 'Binance (public market data)',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@snjyor/binance-mcp@latest'],
		apiKeyEnvVar: 'BINANCE_API_KEY',
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
