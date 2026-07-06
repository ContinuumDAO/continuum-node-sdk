/**
 * Operator-aligned MCP tool group catalog for continuum main `/mcp` (see docs/mcp-deferred-tool-loading.md §6).
 * Optional HTTP endpoints (CMC, TA, VPN) live in optional-endpoint-groups.ts — not deferred on main server.
 */

export const DEFAULT_PINNED_GROUPS = [
	'discovery',
	'node_info',
	'management_signer',
	'defi_discovery',
] as const;

/** Bundles surfaced in list_tool_groups as easy chat entry points (not pinned at init). */
export const RECOMMENDED_CHAT_BUNDLES = ['chart'] as const;

/** Tags applied to all tools in a group for search_continuum_tools. */
export const GROUP_SEARCH_TAGS: Record<string, readonly string[]> = {
	chart: [
		'chart',
		'ohlcv',
		'plot',
		'graph',
		'candlestick',
		'candle',
		'analysis',
		'analyze',
		'trend',
		'fibonacci',
		'drawings',
		'levels',
		'momentum',
		'pattern',
		'price',
	],
	mpc_read: ['multisign', 'sign', 'status', 'pending'],
	group: ['group', 'peers', 'formation'],
};

/** Tools visible at init when their group is pinned (subset of full group). */
export const PINNED_TOOL_NAMES: ReadonlySet<string> = new Set([
	// discovery
	'list_tool_groups',
	'search_continuum_tools',
	'activate_tool_group',
	'deactivate_tool_group',
	// node_info
	'version',
	'get_health',
	'get_connectivity_health',
	'node_id',
	// management_signer
	'get_preferred_management_signer',
	'get_management_signers',
	// defi_discovery
	'list_defi_protocols',
	'load_defi_protocol',
	'unload_defi_protocol',
	'get_defi_protocol_skill',
	'get_defi_protocol_supported_chains',
	'get_defi_protocol_supported_tokens',
	'get_tools_for_protocol',
]);

export const GROUP_DESCRIPTIONS: Record<string, string> = {
	discovery: 'Search and activate Continuum MCP tool bundles',
	node_info: 'Node version, health, connectivity, logs, configured peers',
	management_signer: 'Ed25519 management signer lifecycle and preferred signer',
	group: 'MPC group creation and agreement',
	keygen: 'KeyGen request, agree, list, fetch results, preferred KeyGen',
	keygen_billing: 'Linea MPA wallet, KeyGen/VPN billing multisign builders',
	keygen_messaging: 'KeyGen message threads between nodes',
	registry_chains: 'EVM chain registry (RPC, gas config)',
	registry_address_book: 'Known address book',
	registry_tokens: 'Saved token registry',
	mpc_read: 'MultiSign list, get, status, gas options',
	mpc_agree: 'MultiSign agree, reject, shelve',
	mpc_execute: 'GetSig trigger, broadcast, bump/cancel, tx params',
	mpc_compose: 'Compose, forge, join batch, native/ERC20 transfers',
	agent_config: 'Agent environment variables',
	agent_mcp_servers: 'Agent MCP server catalog and flags',
	agent_skills: 'Agent skills (markdown guidance)',
	agent_cron: 'Scheduled agent cron jobs',
	agent_webhooks: 'Inbound webhooks for agent automation',
	defi_discovery: 'List and load DeFi protocol tool bundles',
	chart:
		'OHLCV charts, analysis, and drawings — call activate_tool_group({ groupId: "chart" }) before use',
};

/** Static tool name → groupId on continuum main `/mcp` (DeFi protocol tools use defi:<protocolId> via metadata). */
export const TOOL_GROUP_BY_NAME: Record<string, string> = {
	// node_info (pinned subset + extended)
	version: 'node_info',
	get_health: 'node_info',
	get_connectivity_health: 'node_info',
	node_id: 'node_info',
	get_preferred_management_signer: 'management_signer',
	get_management_signers: 'management_signer',
	get_machine_info: 'node_info',
	get_success_rate: 'node_info',
	get_subscriptions: 'node_info',
	get_logs: 'node_info',
	get_configured_node_keys: 'node_info',
	// management_signer
	has_management_signer: 'management_signer',
	list_management_signers_detailed: 'management_signer',
	create_local_management_signer: 'management_signer',
	add_management_signer: 'management_signer',
	set_preferred_management_signer: 'management_signer',
	get_management_signer: 'management_signer',
	// group
	list_group_requests: 'group',
	list_group_results: 'group',
	create_group_request: 'group',
	accept_group_request: 'group',
	// keygen
	create_key_gen_request: 'keygen',
	accept_key_gen_request: 'keygen',
	list_key_gen_requests: 'keygen',
	get_key_gen_request_by_id: 'keygen',
	fetch_key_gen_result: 'keygen',
	get_key_gen_parent_group_id: 'keygen',
	fetch_global_nonce_by_key_gen_id: 'keygen',
	get_preferred_key_gen: 'keygen',
	post_preferred_key_gen: 'keygen',
	// keygen_billing
	register_key_gen_on_linea: 'keygen_billing',
	get_mpa_wallet_status: 'keygen_billing',
	create_mpa_top_up_multi_sign_request: 'keygen_billing',
	create_mpa_sync_billing_multi_sign_request: 'keygen_billing',
	create_mpa_overage_purchase_multi_sign_request: 'keygen_billing',
	register_vpn_on_linea: 'keygen_billing',
	create_mpa_vpn_deposit_multi_sign_request: 'keygen_billing',
	create_mpa_sync_vpn_billing_multi_sign_request: 'keygen_billing',
	get_mpa_vpn_status: 'keygen_billing',
	// registry
	get_chain_registry: 'registry_chains',
	add_to_chain_registry: 'registry_chains',
	remove_from_chain_registry: 'registry_chains',
	get_address_book_registry: 'registry_address_book',
	add_to_address_book_registry: 'registry_address_book',
	remove_from_address_book_registry: 'registry_address_book',
	get_token_registry: 'registry_tokens',
	add_to_token_registry: 'registry_tokens',
	remove_from_token_registry: 'registry_tokens',
	// mpc_read
	get_multi_sign_gas_options: 'mpc_read',
	list_sign_requests: 'mpc_read',
	list_sign_requests_awaiting_join: 'mpc_read',
	get_sign_request_by_id: 'mpc_read',
	get_sign_result_summary: 'mpc_read',
	get_sign_request_status: 'mpc_read',
	list_sign_requests_ready: 'mpc_read',
	wait_for_sign_request_ready: 'mpc_read',
	// mpc_agree
	sign_request_agree: 'mpc_agree',
	shelve_sign_request: 'mpc_agree',
	// mpc_execute
	tx_params_from_get_sign_request_id_data: 'mpc_execute',
	trigger_sign_result: 'mpc_execute',
	broadcast_sign_result: 'mpc_execute',
	bump_or_cancel_sign_result: 'mpc_execute',
	// mpc_compose
	create_compose_multi_sign_request: 'mpc_compose',
	create_forge_multi_sign_request: 'mpc_compose',
	create_joined_multi_sign_request: 'mpc_compose',
	transfer_native_gas: 'mpc_compose',
	transfer_erc20: 'mpc_compose',
	transfer_erc721: 'mpc_compose',
	transfer_ctm_erc20: 'mpc_compose',
	transfer_ctm_erc20_cross_chain: 'mpc_compose',
	// keygen_messaging
	send_key_gen_message: 'keygen_messaging',
	list_key_gen_messages: 'keygen_messaging',
	get_key_gen_message_by_id: 'keygen_messaging',
	get_key_gen_message_thread: 'keygen_messaging',
	mark_key_gen_message_read: 'keygen_messaging',
	multi_mark_key_gen_messages_read: 'keygen_messaging',
	delete_key_gen_message: 'keygen_messaging',
	multi_delete_key_gen_messages: 'keygen_messaging',
	post_key_gen_chart_attachment: 'keygen_messaging',
	get_key_gen_message_attachment: 'keygen_messaging',
	// agent
	list_environment_variables: 'agent_config',
	add_environment_variable: 'agent_config',
	remove_environment_variable: 'agent_config',
	list_mcp_servers: 'agent_mcp_servers',
	resolve_coinmarketcap_mcp_server: 'agent_mcp_servers',
	get_mcp_server: 'agent_mcp_servers',
	add_mcp_server: 'agent_mcp_servers',
	add_mcp_server_from_catalog: 'agent_mcp_servers',
	remove_mcp_server: 'agent_mcp_servers',
	set_mcp_server_flags: 'agent_mcp_servers',
	list_skills: 'agent_skills',
	get_skill: 'agent_skills',
	add_skill: 'agent_skills',
	remove_skill: 'agent_skills',
	list_cron_jobs: 'agent_cron',
	get_cron_job: 'agent_cron',
	list_cron_job_runs: 'agent_cron',
	add_cron_job: 'agent_cron',
	update_cron_job: 'agent_cron',
	activate_cron_job: 'agent_cron',
	deactivate_cron_job: 'agent_cron',
	remove_cron_job: 'agent_cron',
	run_cron_job: 'agent_cron',
	list_webhooks: 'agent_webhooks',
	get_webhook: 'agent_webhooks',
	add_webhook: 'agent_webhooks',
	add_webhook_from_catalog: 'agent_webhooks',
	update_webhook: 'agent_webhooks',
	activate_webhook: 'agent_webhooks',
	deactivate_webhook: 'agent_webhooks',
	remove_webhook: 'agent_webhooks',
	run_webhook: 'agent_webhooks',
	// defi_discovery
	list_defi_protocols: 'defi_discovery',
	load_defi_protocol: 'defi_discovery',
	unload_defi_protocol: 'defi_discovery',
	get_defi_protocol_skill: 'defi_discovery',
	get_defi_protocol_supported_chains: 'defi_discovery',
	get_defi_protocol_supported_tokens: 'defi_discovery',
	get_tools_for_protocol: 'defi_discovery',
	list_tool_groups: 'discovery',
	search_continuum_tools: 'discovery',
	activate_tool_group: 'discovery',
	deactivate_tool_group: 'discovery',
	// chart
	prepare_chart_from_rows: 'chart',
	prepare_chart: 'chart',
	list_chart_analysis_options: 'chart',
	analyze_trend_structure: 'chart',
	analyze_key_levels: 'chart',
	analyze_momentum: 'chart',
	analyze_range_volatility: 'chart',
	analyze_candlestick_patterns: 'chart',
	analyze_chart_patterns: 'chart',
	analyze_time_series_trend: 'chart',
	analyze_time_series_momentum: 'chart',
	analyze_time_series_stats: 'chart',
	list_chart_customization_options: 'chart',
	calculate_key_levels: 'chart',
	calculate_pivot_points: 'chart',
	calculate_fibonacci_range: 'chart',
	calculate_trend_lines: 'chart',
	calculate_chart_pattern_drawings: 'chart',
	apply_chart_pattern_drawings: 'chart',
	apply_chart_drawings: 'chart',
};

export const TOOL_SEARCH_TAGS: Record<string, readonly string[]> = {
	get_configured_node_keys: ['group', 'peers', 'configured', 'node keys'],
	prepare_chart: ['chart', 'plot', 'ohlcv'],
	prepare_chart_from_rows: ['chart', 'plot', 'ohlcv'],
	list_chart_analysis_options: ['chart', 'analysis'],
};

export function resolveToolGroupId(
	name: string,
	options?: {protocolId?: string},
): string {
	const bare = stripMcpToolServerPrefix(name);
	if (TOOL_GROUP_BY_NAME[bare]) {
		return TOOL_GROUP_BY_NAME[bare];
	}
	if (TOOL_GROUP_BY_NAME[name]) {
		return TOOL_GROUP_BY_NAME[name];
	}
	if (options?.protocolId) {
		return `defi:${options.protocolId}`;
	}
	if (bare.startsWith('ctm_') || name.startsWith('ctm_')) {
		return 'defi:unknown';
	}
	return 'unknown';
}

/** Hub prefixes catalog tools as `{serverId}__{toolName}`. */
export function stripMcpToolServerPrefix(name: string): string {
	const idx = name.indexOf('__');
	if (idx <= 0) {
		return name;
	}
	return name.slice(idx + 2);
}

export function isToolPinnedAtInit(name: string, groupId: string, pinnedGroups: ReadonlySet<string>): boolean {
	if (!pinnedGroups.has(groupId) && groupId !== 'discovery') {
		return false;
	}
	if (groupId === 'discovery') {
		return PINNED_TOOL_NAMES.has(name);
	}
	return PINNED_TOOL_NAMES.has(name);
}

export function parsePinnedGroupsFromEnv(raw: string | undefined): Set<string> {
	if (!raw?.trim()) {
		return new Set(DEFAULT_PINNED_GROUPS);
	}
	return new Set(
		raw
			.split(',')
			.map(s => s.trim())
			.filter(Boolean),
	);
}
