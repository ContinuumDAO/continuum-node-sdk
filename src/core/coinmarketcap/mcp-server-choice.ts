import type {NodeSdkConfig} from '../../config/schema.js';
import {listMcpServers} from '../agent/mcp-servers.js';
import type {SdkResult} from '../result.js';
import {isCmcApiKeyConfigured} from './api-key.js';

export const CMC_FULL_MCP_SERVER_ID = 'coinmarketcap';
export const CMC_PUBLIC_MCP_SERVER_ID = 'coinmarketcap-public';

export type CoinMarketCapMcpVariant = 'pro' | 'public' | 'none';

export type CoinMarketCapMcpServerChoice = {
	serverId: typeof CMC_FULL_MCP_SERVER_ID | typeof CMC_PUBLIC_MCP_SERVER_ID | null;
	variant: CoinMarketCapMcpVariant;
	apiKeyConfigured: boolean;
	proActive: boolean;
	publicActive: boolean;
	rationale: string;
	/** When set, call agent_load_mcp_server with this serverId for the current chat. */
	agentLoadMcpServer: {serverId: string} | null;
};

export function chooseCoinMarketCapMcpServer(input: {
	activeServerIds: readonly string[];
	apiKeyConfigured: boolean;
}): CoinMarketCapMcpServerChoice {
	const ids = new Set(
		input.activeServerIds.map(id => id.trim().toLowerCase()).filter(Boolean),
	);
	const proActive = ids.has(CMC_FULL_MCP_SERVER_ID);
	const publicActive = ids.has(CMC_PUBLIC_MCP_SERVER_ID);

	// coinmarketcap-public is the built-in continuum server for DEX klines + keyless tools.
	// Pro key in Variables unlocks get_crypto_ohlcv_historical on the SAME server — not a reason to skip public.
	if (publicActive) {
		const rationale = input.apiKeyConfigured
			? proActive
				? 'Load coinmarketcap-public for DEX klines and get_crypto_ohlcv_historical (Pro key in Variables). Catalog coinmarketcap is optional for TA/news — not for Uniswap pool charts.'
				: 'Load coinmarketcap-public. COINMARKETCAP_API_KEY enables get_crypto_ohlcv_historical on this server for CEX OHLCV.'
			: 'Load coinmarketcap-public for keyless CMC tools (DEX klines, market snapshot).';

		return {
			serverId: CMC_PUBLIC_MCP_SERVER_ID,
			variant: 'public',
			apiKeyConfigured: input.apiKeyConfigured,
			proActive,
			publicActive: true,
			rationale,
			agentLoadMcpServer: {serverId: CMC_PUBLIC_MCP_SERVER_ID},
		};
	}

	if (input.apiKeyConfigured && proActive) {
		return {
			serverId: CMC_FULL_MCP_SERVER_ID,
			variant: 'pro',
			apiKeyConfigured: true,
			proActive: true,
			publicActive: false,
			rationale:
				'coinmarketcap-public is not active. Load catalog coinmarketcap (official CMC MCP) for Pro tools, or activate coinmarketcap-public for DEX klines.',
			agentLoadMcpServer: {serverId: CMC_FULL_MCP_SERVER_ID},
		};
	}

	if (proActive && !input.apiKeyConfigured) {
		return {
			serverId: null,
			variant: 'none',
			apiKeyConfigured: false,
			proActive: true,
			publicActive: false,
			rationale:
				'Catalog coinmarketcap is active but COINMARKETCAP_API_KEY is not configured. Add it via add_environment_variable, or activate coinmarketcap-public for keyless tools.',
			agentLoadMcpServer: null,
		};
	}

	return {
		serverId: null,
		variant: 'none',
		apiKeyConfigured: input.apiKeyConfigured,
		proActive,
		publicActive,
		rationale:
			'Neither coinmarketcap nor coinmarketcap-public is active. Call list_mcp_servers; activate via add_mcp_server_from_catalog if needed.',
		agentLoadMcpServer: null,
	};
}

/** Pick coinmarketcap vs coinmarketcap-public from active servers and Variables key. */
export async function resolveCoinMarketCapMcpServer(
	config: NodeSdkConfig,
): Promise<SdkResult<CoinMarketCapMcpServerChoice>> {
	const [serversResult, apiKeyConfigured] = await Promise.all([
		listMcpServers(config),
		isCmcApiKeyConfigured(config),
	]);
	if (!serversResult.ok) {
		return serversResult;
	}
	const active =
		serversResult.data.activeServers ?? serversResult.data.servers ?? [];
	return {
		ok: true,
		data: chooseCoinMarketCapMcpServer({
			activeServerIds: active.map(row => row.id),
			apiKeyConfigured,
		}),
	};
}
