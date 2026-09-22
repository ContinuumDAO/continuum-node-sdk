/**
 * Tools on optional MCP HTTP endpoints (/mcp/cmc-public, /mcp/ta, /mcp/vpn, /mcp/business-latest, /mcp/world-affairs, /mcp/crypto-latest, /mcp/crypto-security, /mcp/coin-bureau-newsletters, /mcp/crypto-banter-newsletters, /mcp/arkham-intel, /mcp/continuumdao-tokenomics).
 * Not registered on continuum main `/mcp` — load via hub catalog or direct endpoint only.
 * Inventory script merges these; deferred loading on main server ignores them.
 */

export const OPTIONAL_ENDPOINT_GROUP_DESCRIPTIONS: Record<string, string> = {
	vpn_admin:
		'WireGuard admin VPN status, enable, client config — enable requires node veCTM privilege (get_node_privilege_status), not current-authority NFT ownership',
	vpn_egress:
		'Peer egress VPN exits, sharing, revoke, client config — provider and consumer require the same node veCTM privilege',
	ta: 'Standalone technical indicator math (fast-technical-indicators)',
	'catalog:coinmarketcap-public':
		'Optional CoinMarketCap public API — add via agent MCP catalog (not core continuum)',
	'catalog:coinbase-public':
		'Optional Coinbase Advanced Trade public API — add via agent MCP catalog (not core continuum)',
	'catalog:business-latest':
		'Optional Business Latest RSS — add via agent MCP catalog (not core continuum)',
	'catalog:world-affairs':
		'Optional World Affairs RSS — add via agent MCP catalog (not core continuum)',
	'catalog:crypto-latest':
		'Optional Crypto Latest RSS — add via agent MCP catalog (not core continuum)',
	'catalog:crypto-security':
		'Optional Crypto Security RSS — add via agent MCP catalog (not core continuum)',
	'catalog:coin-bureau-newsletters':
		'Optional Coin Bureau newsletters — add via agent MCP catalog (not core continuum)',
	'catalog:crypto-banter-newsletters':
		'Optional Crypto Banter newsletters — add via agent MCP catalog (not core continuum)',
	'catalog:arkham-intel':
		'Optional Arkham Intel API — add via agent MCP catalog (not core continuum)',
	'catalog:continuumdao-tokenomics':
		'Optional ContinuumDAO tokenomics (app-api circulating supply, addresses, veCTM) — add via agent MCP catalog (not core continuum)',
};

/** @see OPTIONAL_ENDPOINT_GROUP_DESCRIPTIONS */
export const OPTIONAL_ENDPOINT_TOOL_GROUPS: Record<string, string> = {
	// vpn_admin (/mcp/vpn)
	get_vpn_status: 'vpn_admin',
	set_vpn_enabled: 'vpn_admin',
	download_vpn_admin_client_config: 'vpn_admin',
	// vpn_egress
	get_vpn_egress_status: 'vpn_egress',
	list_vpn_egress_exits: 'vpn_egress',
	set_vpn_egress_sharing: 'vpn_egress',
	revoke_vpn_egress_peer: 'vpn_egress',
	download_vpn_egress_client_config: 'vpn_egress',
	// ta (/mcp/ta)
	list_technical_indicators: 'ta',
	calculate_technical_indicator: 'ta',
	// catalog (/mcp/cmc-public or hub coinmarketcap-public)
	get_crypto_ohlcv_historical: 'catalog:coinmarketcap-public',
	get_kline_candles: 'catalog:coinmarketcap-public',
	search_dex_tokens: 'catalog:coinmarketcap-public',
	get_dex_token: 'catalog:coinmarketcap-public',
	get_dex_token_pools: 'catalog:coinmarketcap-public',
	get_dex_pair_quotes: 'catalog:coinmarketcap-public',
	get_simple_price: 'catalog:coinmarketcap-public',
	get_crypto_quotes_latest: 'catalog:coinmarketcap-public',
	get_global_metrics_latest: 'catalog:coinmarketcap-public',
	get_fear_and_greed_latest: 'catalog:coinmarketcap-public',
	get_fear_and_greed_historical: 'catalog:coinmarketcap-public',
	get_cmc100_latest: 'catalog:coinmarketcap-public',
	get_altcoin_season_index_latest: 'catalog:coinmarketcap-public',
	// catalog (/mcp/coinbase-public)
	get_product_candles: 'catalog:coinbase-public',
	list_products: 'catalog:coinbase-public',
	search_products: 'catalog:coinbase-public',
	get_product_ticker: 'catalog:coinbase-public',
	get_product_book: 'catalog:coinbase-public',
	// catalog (/mcp/business-latest)
	list_business_sources: 'catalog:business-latest',
	get_business_latest: 'catalog:business-latest',
	search_business_latest: 'catalog:business-latest',
	// catalog (/mcp/world-affairs)
	list_world_affairs_sources: 'catalog:world-affairs',
	get_world_affairs_latest: 'catalog:world-affairs',
	search_world_affairs_latest: 'catalog:world-affairs',
	// catalog (/mcp/crypto-latest)
	list_crypto_sources: 'catalog:crypto-latest',
	get_crypto_latest: 'catalog:crypto-latest',
	search_crypto_latest: 'catalog:crypto-latest',
	// catalog (/mcp/crypto-security)
	list_crypto_security_sources: 'catalog:crypto-security',
	get_crypto_security_latest: 'catalog:crypto-security',
	search_crypto_security: 'catalog:crypto-security',
	// catalog (/mcp/coin-bureau-newsletters)
	get_coin_bureau_latest: 'catalog:coin-bureau-newsletters',
	search_coin_bureau_newsletters: 'catalog:coin-bureau-newsletters',
	// catalog (/mcp/crypto-banter-newsletters)
	list_crypto_banter_sources: 'catalog:crypto-banter-newsletters',
	get_crypto_banter_latest: 'catalog:crypto-banter-newsletters',
	search_crypto_banter_newsletters: 'catalog:crypto-banter-newsletters',
	// catalog (/mcp/arkham-intel)
	list_arkham_api_paths: 'catalog:arkham-intel',
	arkham_api_request: 'catalog:arkham-intel',
	// catalog (/mcp/continuumdao-tokenomics)
	get_ctm_metrics: 'catalog:continuumdao-tokenomics',
	get_ctm_protocol_addresses: 'catalog:continuumdao-tokenomics',
	get_ve_ctm_position: 'catalog:continuumdao-tokenomics',
	get_ve_ctm_tokens: 'catalog:continuumdao-tokenomics',
	get_ve_ctm_locked_for_addresses: 'catalog:continuumdao-tokenomics',
	get_ctm_tokenomics_snapshot: 'catalog:continuumdao-tokenomics',
	list_ctm_onchain_followups: 'catalog:continuumdao-tokenomics',
};

/** Relative paths under src/mcp for optional-endpoint registrars (inventory split). */
export const OPTIONAL_ENDPOINT_SCAN_PREFIXES = [
	'coinmarketcap-public/',
	'coinbase-public/',
	'business-latest/',
	'world-affairs/',
	'crypto-latest/',
	'crypto-security/',
	'coin-bureau-newsletters/',
	'crypto-banter-newsletters/',
	'arkham-intel/',
	'continuumdao-tokenomics/',
	'ta/',
	'vpn.ts',
] as const;

export function isOptionalEndpointRegistrarPath(file: string): boolean {
	return OPTIONAL_ENDPOINT_SCAN_PREFIXES.some(
		prefix => file === prefix.replace(/\/$/, '') || file.startsWith(prefix),
	);
}
