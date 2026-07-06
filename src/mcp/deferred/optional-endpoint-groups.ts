/**
 * Tools on optional MCP HTTP endpoints (/mcp/cmc-public, /mcp/ta, /mcp/vpn).
 * Not registered on continuum main `/mcp` — load via hub catalog or direct endpoint only.
 * Inventory script merges these; deferred loading on main server ignores them.
 */

export const OPTIONAL_ENDPOINT_GROUP_DESCRIPTIONS: Record<string, string> = {
	vpn_admin: 'WireGuard admin VPN status, enable, client config download',
	vpn_egress: 'Peer egress VPN exits, sharing, revoke, client config',
	ta: 'Standalone technical indicator math (fast-technical-indicators)',
	'catalog:coinmarketcap-public':
		'Optional CoinMarketCap public API — add via agent MCP catalog (not core continuum)',
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
};

/** Relative paths under src/mcp for optional-endpoint registrars (inventory split). */
export const OPTIONAL_ENDPOINT_SCAN_PREFIXES = [
	'coinmarketcap-public/',
	'ta/',
	'vpn.ts',
] as const;

export function isOptionalEndpointRegistrarPath(file: string): boolean {
	return OPTIONAL_ENDPOINT_SCAN_PREFIXES.some(
		prefix => file === prefix.replace(/\/$/, '') || file.startsWith(prefix),
	);
}
