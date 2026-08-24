/**
 * Operator-aligned MCP tool group catalog for continuum main `/mcp` (see docs/mcp-deferred-tool-loading.md §6).
 * Optional HTTP endpoints (CMC, TA, VPN) live in optional-endpoint-groups.ts — not deferred on main server.
 */

export const DEFAULT_PINNED_GROUPS = [
	'discovery',
	'docs',
	'node_info',
	'management_signer',
	'keygen',
	'agent_telegram',
] as const;

/** Bundles surfaced in list_tool_groups as easy chat entry points (not pinned at init). */
export const RECOMMENDED_CHAT_BUNDLES = ['chart:core', 'defi_discovery', 'social:telegram'] as const;

/**
 * Legacy / shorthand groupIds expanded by activate_tool_group and host LLM filter.
 * `chart` → plot/fetch only (not full analyze/drawings/trade).
 * `defi:<protocol>` (exactly two segments) → market-data pack only — handled in resolveActivateGroupIds.
 */
export const GROUP_ACTIVATE_ALIASES: Record<string, readonly string[]> = {
	chart: ['chart:core'],
	social: ['social:telegram'],
	social_search: ['social:telegram'],
};

/** Tags applied to all tools in a group for search_continuum_tools. */
export const GROUP_SEARCH_TAGS: Record<string, readonly string[]> = {
	discovery: [
		'search tools',
		'tool groups',
		'activate bundle',
		'load tools',
		'discover tools',
		'list bundles',
	],
	docs: [
		'continuumdao docs',
		'documentation',
		'official docs',
		'how to',
		'guide',
		'help',
		'white paper',
		'governance',
		'mpa wallet',
		'ai harness',
		'telegram',
		'mpc node',
		'join network',
		'keygen',
		'c3caller',
		'install node',
		'backup',
		'restore',
		'tokenomics',
		'white paper',
		'ctm',
		'vectm',
	],
	'chart:core': [
		'chart',
		'ohlcv',
		'plot',
		'graph',
		'candlestick',
		'candle',
		'prepare chart',
		'render chart',
		'perp',
	],
	'chart:analyze': [
		'analysis',
		'analyze',
		'trend',
		'momentum',
		'pattern',
		'elliott',
		'wave',
		'fibonacci',
		'levels',
		'indicator',
		'ichimoku',
		'bollinger',
		'macd',
		'obv',
		'rsi',
		'ema',
		'sma',
		'donchian',
		'supertrend',
	],
	'chart:drawings': [
		'drawings',
		'overlay',
		'apply drawings',
		'pattern overlay',
		'trend lines',
		'key levels',
	],
	'chart:trade': [
		'trade',
		'trade ideas',
		'build trade',
		'multisign',
		'consensus trade',
		'tpsl',
	],
	node_info: [
		'version',
		'health',
		'node health',
		'status',
		'connectivity',
		'uptime',
		'logs',
		'machine',
		'node id',
		'peers',
	],
	node_config: [
		'peers',
		'relay',
		'peer ip',
		'mqtt',
		'tls',
		'configured nodes',
		'restart',
		'mosquitto',
	],
	management_signer: ['management', 'signer', 'ed25519', 'preferred signer', 'not keygen'],
	group: [
		'group',
		'groups',
		'group request',
		'peers',
		'formation',
		'mpc group',
		'create group',
		'accept group',
		'list groups',
		'my groups',
	],
	keygen: [
		'keygen',
		'key gen',
		'keygen request',
		'key gen request',
		'mpc key',
		'generate key',
		'preferred keygen',
		'wallet key',
	],
	keygen_billing: [
		'billing',
		'linea',
		'mpa wallet',
		'vpn billing',
		'top up',
		'overage',
		'deposit',
		'pay month',
		'subscription',
		'sync billing',
		'activate month',
	],
	keygen_messaging: [
		'message',
		'messaging',
		'thread',
		'chat',
		'attachment',
		'inbox',
		'keygen message',
		'key gen message',
	],
	registry_chains: [
		'chain',
		'registry',
		'rpc',
		'gas config',
		'evm chain',
		'network',
		'add chain',
		'configure chain',
		'blockchain',
		// Brand names that are also EVM networks — prefer chain registry over DeFi load.
		'hyperliquid',
		'hyperevm',
		'hyperliquid chain',
		'hyperevm chain',
	],
	registry_address_book: ['address book', 'contact', 'contacts', 'saved address', 'known address'],
	registry_tokens: ['token', 'tokens', 'token registry', 'saved token', 'erc20 registry'],
	mpc_read: [
		'multisign',
		'multisign request',
		'sign request',
		'sign requests',
		'status',
		'pending',
		'gas options',
		'ready',
		'sign transaction',
	],
	// Keep agree phrases on sign_request_agree tool tags — not bare "agree" group-wide.
	mpc_agree: ['reject', 'shelve', 'sign request agree', 'multisign approve', 'join agree'],
	mpc_execute: [
		'broadcast',
		'execute',
		'trigger',
		'get sig',
		'bump',
		'cancel',
		'tx params',
		'gas',
	],
	mpc_compose: [
		'compose',
		'forge',
		'foundry import',
		'compose import',
		'import script',
		'run-latest',
		'transfer',
		'native gas',
		'erc20',
		'erc721',
		'joined multisign',
		'swap',
		'send',
		'transaction',
		'create sign request',
		'create multisign',
	],
	agent_config: ['environment variable', 'env var', 'agent config', 'secrets'],
	agent_mcp_servers: [
		'mcp server',
		'mcp catalog',
		'add mcp',
		'remove mcp',
		'coinmarketcap',
		'gdelt',
		'gdelt-cloud',
		'business-latest',
		'business rss',
		'world-affairs',
		'world affairs',
		'financial modeling prep',
		'fmp',
		'alpaca',
		'equibles',
		'edgartools',
		'edgar',
		'sec filings',
		'gecko',
		'mullvad',
		'mullvad-browser',
		'exa',
		'tavily',
		'kagi',
		'serpapi',
		'perplexity',
		'firefox',
		'flags',
	],
	agent_skills: [
		'skill',
		'skills',
		'skill catalog',
		'markdown guidance',
		'agent skill',
		'agent guidance',
		'skill file',
		'markdown skill',
	],
	agent_workspace: [
		'workspace',
		'user folder',
		'user_folder',
		'upload file',
		'download file',
		'list files',
		'write file',
		'foundry evm',
		'agent workspace',
	],
	node_database: [
		'database',
		'backup',
		'restore',
		'bootstrap',
		'mongodb',
		'encrypted backup',
		'management key',
		'added key',
		'database backup',
	],
	agent_cron: ['cron', 'schedule', 'scheduled job', 'cron job', 'every n minutes'],
	agent_webhooks: ['webhook', 'inbound webhook', 'automation trigger', 'webhook catalog'],
	agent_telegram: [
		'telegram',
		'telegram notify',
		'notify telegram',
		'send telegram',
		'telegram message',
		'telegram dm',
	],
	'social:telegram': [
		'social search',
		'telegram search',
		'search telegram',
		'telegram channel',
		'telegram ticker',
		'token mention',
		'public channel',
		'cashtag',
	],
	// No bare protocol brands here — they collide with chain names (e.g. Hyperliquid).
	// Brands live on list_defi_protocols / load_defi_protocol tool tags only.
	defi_discovery: ['defi', 'protocol', 'load protocol', 'list protocols', 'protocol tools'],
};

/** Tools visible at init when their group is pinned (subset of full group). */
export const PINNED_TOOL_NAMES: ReadonlySet<string> = new Set([
	// discovery
	'list_tool_groups',
	'search_continuum_tools',
	'activate_tool_group',
	'deactivate_tool_group',
	'list_ohlcv_sources',
	// node_info
	'version',
	'get_health',
	'get_connectivity_health',
	'node_id',
	// management_signer
	'get_preferred_management_signer',
	'get_management_signers',
	// keygen (preferred KeyGen only — not the Ed25519 management signer)
	'get_preferred_key_gen',
	// keygen_billing — always visible so the agent can pay/activate the month
	'get_mpa_wallet_status',
	'create_mpa_sync_billing_multi_sign_request',
	// defi_discovery
	'list_defi_protocols',
	'load_defi_protocol',
	'unload_defi_protocol',
	'get_defi_protocol_skill',
	'get_defi_protocol_supported_chains',
	'get_defi_protocol_supported_tokens',
	'get_tools_for_protocol',
	// docs
	'search_continuum_docs',
	'get_continuum_doc',
	// agent_telegram — notify only (search lives in social:telegram)
	'send_telegram_message',
]);

export const GROUP_DESCRIPTIONS: Record<string, string> = {
	discovery: 'Search Continuum tool bundles. Call Continuum tools directly; DeFi ctm_* needs load_defi_protocol',
	docs: 'Official ContinuumDAO product documentation (docs.continuumdao.org)',
	node_info: 'Node version, health, connectivity, logs, configured peers',
	node_config:
		'Peer/relay IPs, MQTT TLS CA get/set, restart-gate (host compose restart)',
	management_signer: 'Ed25519 management signer lifecycle and preferred signer',
	group:
		'MPC group requests: create/list group requests and agree/accept pending group requests',
	keygen:
		'KeyGen requests: create/list keygen requests, agree/accept pending keygen, fetch results, preferred KeyGen',
	keygen_billing: 'Linea MPA wallet, KeyGen/VPN billing multisign builders',
	keygen_messaging: 'KeyGen message threads between nodes',
	registry_chains: 'EVM chain registry (RPC, gas config)',
	registry_address_book: 'Known address book',
	registry_tokens: 'Saved token registry',
	mpc_read: 'MultiSign / sign requests: list, get, status, gas options',
	mpc_agree: 'Agree to / reject / shelve a pending MultiSign (sign) request',
	mpc_execute: 'Get Sig trigger, broadcast, bump/cancel, tx params',
	mpc_compose: 'Create Multisign / sign requests: compose, forge, join batch, transfers',
	agent_config: 'Agent environment variables',
	agent_mcp_servers: 'Agent MCP server catalog and flags',
	agent_skills: 'Agent skills (markdown guidance) and repository catalog install',
	agent_workspace: 'User folder workspace: list, read, and write files on the node',
	node_database:
		'Encrypted Mongo backup/restore and management private-key file ops (bootstrap + added keys)',
	agent_cron: 'Scheduled agent cron jobs',
	agent_webhooks: 'Inbound webhooks for agent automation',
	agent_telegram: 'Telegram notify — send_telegram_message (bot token; pinned at init)',
	'social:telegram':
		'Public Telegram channel search via Telethon (search_telegram_messages, search_telegram_tickers)',
	defi_discovery: 'List and load DeFi protocols — load_defi_protocol required before ctm_* tools',
	'chart:core':
		'Plot/prepare OHLCV charts (prepare_chart*) — activate chart:core; alias groupId "chart" expands here only',
	'chart:analyze': 'Structured analyze_* OHLCV analysis (JSON, no chart render)',
	'chart:drawings': 'calculate_* / apply_* drawing overlays on an existing chart',
	'chart:trade': 'Trade ideas, build_trade_from_*, submit_trade_from_consensus, Uniswap TPSL monitor',
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
	get_mqtt_tls_public_key: 'node_config',
	set_mqtt_tls_key: 'node_config',
	set_configured_nodes: 'node_config',
	get_maintenance_restart_gate: 'node_config',
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
	claim_node_withdraw_authority: 'keygen_billing',
	unregister_key_gen_on_linea: 'keygen_billing',
	create_mpa_withdraw_multi_sign_request: 'keygen_billing',
	get_ve_ctm_attach_status: 'keygen_billing',
	attach_ve_ctm_to_node: 'keygen_billing',
	request_ve_ctm_detach: 'keygen_billing',
	get_node_withdraw_authority: 'keygen_billing',
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
	create_compose_eip712_multi_sign_request: 'mpc_compose',
	create_forge_multi_sign_request: 'mpc_compose',
	import_forge_dry_run_multi_sign_request: 'mpc_compose',
	build_forge_dry_run_multi_sign_payload: 'mpc_compose',
	import_and_join_forge_dry_runs_multi_sign_request: 'mpc_compose',
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
	add_skill_from_catalog: 'agent_skills',
	remove_skill: 'agent_skills',
	reset_skills_from_defaults: 'agent_skills',
	list_user_folder: 'agent_workspace',
	get_user_folder_file: 'agent_workspace',
	write_user_folder_file: 'agent_workspace',
	list_database_backups: 'node_database',
	check_database: 'node_database',
	request_maintenance_restart_prep: 'node_database',
	backup_database: 'node_database',
	restore_database: 'node_database',
	fetch_database_backup: 'node_database',
	post_database_backup: 'node_database',
	fetch_bootstrap_key: 'node_database',
	post_bootstrap_key: 'node_database',
	remove_bootstrap_key: 'node_database',
	fetch_added_management_key: 'node_database',
	post_added_management_key: 'node_database',
	remove_added_management_key: 'node_database',
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
	send_telegram_message: 'agent_telegram',
	search_telegram_messages: 'social:telegram',
	search_telegram_tickers: 'social:telegram',
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
	list_ohlcv_sources: 'discovery',
	search_continuum_docs: 'docs',
	get_continuum_doc: 'docs',
	// chart packs (slim LLM exposure — do not use bare "chart" as a tool group)
	prepare_chart_from_rows: 'chart:core',
	prepare_chart: 'chart:core',
	list_chart_analysis_options: 'chart:core',
	list_chart_customization_options: 'chart:core',
	analyze_trend_structure: 'chart:analyze',
	analyze_elliott_waves: 'chart:analyze',
	analyze_key_levels: 'chart:analyze',
	analyze_key_level_fibonacci: 'chart:analyze',
	analyze_momentum: 'chart:analyze',
	analyze_liquidity_depth: 'chart:analyze',
	analyze_divergence: 'chart:analyze',
	analyze_range_volatility: 'chart:analyze',
	analyze_bollinger_bands: 'chart:analyze',
	analyze_donchian_breakout: 'chart:analyze',
	analyze_supertrend: 'chart:analyze',
	analyze_ichimoku: 'chart:analyze',
	analyze_z_score: 'chart:analyze',
	analyze_moving_averages: 'chart:analyze',
	analyze_candlestick_patterns: 'chart:analyze',
	analyze_chart_patterns: 'chart:analyze',
	analyze_time_series_trend: 'chart:analyze',
	analyze_time_series_momentum: 'chart:analyze',
	analyze_time_series_stats: 'chart:analyze',
	apply_liquidity_depth_drawings: 'chart:drawings',
	calculate_divergence_drawings: 'chart:drawings',
	apply_divergence_drawings: 'chart:drawings',
	calculate_key_levels: 'chart:drawings',
	calculate_pivot_points: 'chart:drawings',
	calculate_fibonacci_range: 'chart:drawings',
	calculate_trend_lines: 'chart:drawings',
	calculate_chart_pattern_drawings: 'chart:drawings',
	calculate_elliott_wave_drawings: 'chart:drawings',
	apply_chart_pattern_drawings: 'chart:drawings',
	apply_elliott_wave_drawings: 'chart:drawings',
	apply_trend_line_drawings: 'chart:drawings',
	apply_key_level_drawings: 'chart:drawings',
	apply_key_fib_drawings: 'chart:drawings',
	apply_chart_drawings: 'chart:drawings',
	list_trade_ideas: 'chart:trade',
	build_trade_from_trade_idea: 'chart:trade',
	build_trade_from_chart_pattern: 'chart:trade',
	build_trade_from_candlestick: 'chart:trade',
	build_trade_from_key_levels: 'chart:trade',
	build_trade_from_momentum: 'chart:trade',
	build_trade_from_divergence: 'chart:trade',
	evaluate_uniswap_tpsl_monitor: 'chart:trade',
	register_uniswap_tpsl_monitor_cron: 'agent_cron',
	submit_trade_from_consensus: 'chart:trade',
};

export const TOOL_SEARCH_TAGS: Record<string, readonly string[]> = {
	// discovery
	search_continuum_tools: ['search tools', 'find tools', 'tool search', 'what tools'],
	list_tool_groups: ['tool groups', 'list bundles', 'available bundles'],
	list_ohlcv_sources: [
		'ohlcv',
		'ohlcv sources',
		'chart sources',
		'data source',
		'catalog mcp',
		'coingecko',
		'binance',
		'alpaca',
		'fmp',
		'equibles',
	],
	activate_tool_group: ['activate bundle', 'load tools', 'enable group'],
	deactivate_tool_group: ['deactivate bundle', 'unload tools', 'disable group'],

	// official product docs
	search_continuum_docs: [
		'continuumdao docs',
		'official documentation',
		'search docs',
		'how to',
		'guide',
		'help',
		'tokenomics',
		'white paper',
		'provision node',
		'create mpc node',
		'install node',
		'agent provision',
	],
	get_continuum_doc: [
		'read doc',
		'fetch documentation',
		'get documentation page',
		'official docs',
		'white paper section',
		'tokenomics',
	],

	// preferred key / signer
	get_preferred_key_gen: [
		'keygen',
		'key gen',
		'preferred keygen',
		'mpc key',
		'default keygen',
		'which keygen',
	],
	post_preferred_key_gen: ['set preferred keygen', 'preferred keygen', 'default keygen'],
	get_preferred_management_signer: [
		'management',
		'ed25519',
		'signer',
		'preferred signer',
		'not keygen',
	],
	set_preferred_management_signer: [
		'preferred signer',
		'set preferred signer',
		'management signer',
		'not keygen',
	],
	get_configured_node_keys: ['group', 'peers', 'configured', 'node keys'],
	get_mqtt_tls_public_key: ['mqtt', 'tls', 'ca cert', 'relay', 'invite'],
	set_mqtt_tls_key: ['mqtt', 'tls', 'set mqtt key', 'peer', 'ca cert'],
	set_configured_nodes: ['relay', 'peer ip', 'configured nodes', 'peers'],
	get_maintenance_restart_gate: ['restart', 'compose', 'drain', 'maintenance'],

	// node health / info
	get_health: ['health', 'node health', 'status', 'is node ok', 'readiness'],
	get_connectivity_health: ['connectivity', 'latency', 'peer health', 'ping'],
	get_logs: ['logs', 'node logs', 'errors'],
	node_id: ['node id', 'my node', 'public key'],
	version: ['version', 'node version'],
	get_machine_info: ['machine', 'cpu', 'memory', 'disk', 'vps'],

	// chart entry + trade builds (multisign kept here, not on chart group)
	prepare_chart: ['chart', 'plot', 'ohlcv', 'candlestick'],
	prepare_chart_from_rows: ['chart', 'plot', 'ohlcv', 'candlestick'],
	list_chart_analysis_options: ['chart', 'analysis', 'analysis options'],
	list_chart_customization_options: ['chart', 'indicators', 'customization', 'overlays'],
	list_trade_ideas: ['chart', 'trade', 'trade ideas'],
	build_trade_from_trade_idea: ['chart', 'trade', 'multisign', 'build trade'],
	build_trade_from_chart_pattern: ['chart', 'trade', 'multisign', 'chart pattern trade'],
	build_trade_from_candlestick: ['chart', 'trade', 'multisign', 'candlestick trade'],
	build_trade_from_key_levels: ['chart', 'trade', 'multisign', 'key levels trade'],
	build_trade_from_momentum: ['chart', 'trade', 'multisign', 'momentum trade'],
	build_trade_from_divergence: ['chart', 'trade', 'multisign', 'divergence trade'],
	submit_trade_from_consensus: ['consensus trade', 'submit trade', 'cron trade'],
	evaluate_uniswap_tpsl_monitor: [
		'tpsl',
		'take profit',
		'stop loss',
		'uniswap monitor',
	],

	// registries
	get_chain_registry: ['chain', 'chains', 'rpc', 'gas', 'registry', 'hyperliquid', 'hyperevm'],
	add_to_chain_registry: [
		'chain',
		'add chain',
		'rpc',
		'registry',
		'configure chain',
		'hyperliquid',
		'hyperevm',
		'hyperliquid chain',
	],
	remove_from_chain_registry: ['chain', 'remove chain', 'registry'],
	get_address_book_registry: [
		'address book',
		'contacts',
		'contact',
		'saved address',
		'saved contacts',
	],
	add_to_address_book_registry: ['address book', 'add contact', 'save address'],
	remove_from_address_book_registry: ['address book', 'remove contact', 'delete address'],
	get_token_registry: ['token', 'tokens', 'registry', 'saved token'],
	add_to_token_registry: ['token', 'add token', 'registry'],
	remove_from_token_registry: ['token', 'remove token', 'registry'],

	// group requests (newGroupRequest / agree)
	list_group_requests: [
		'group',
		'groups',
		'group request',
		'group requests',
		'peers',
		'pending group',
		'list groups',
		'list group requests',
	],
	list_group_results: ['group', 'groups', 'group result', 'formed group', 'list groups'],
	create_group_request: [
		'group',
		'groups',
		'group request',
		'create group',
		'form group',
		'new group request',
		'peers',
	],
	accept_group_request: [
		'group',
		'groups',
		'accept group',
		'join group',
		'agree',
		'agree to group',
		'agree to group request',
		'agree group request',
		'accept group request',
	],

	// keygen requests
	list_key_gen_requests: [
		'keygen request',
		'key gen request',
		'keygen requests',
		'list keygen',
		'pending keygen',
	],
	create_key_gen_request: [
		'keygen request',
		'key gen request',
		'create keygen',
		'new keygen',
		'generate key',
		'start keygen',
	],
	accept_key_gen_request: [
		'agree',
		'agree to keygen',
		'agree to key gen',
		'agree to keygen request',
		'agree to key gen request',
		'accept keygen',
		'accept key gen request',
		'join keygen',
	],
	get_key_gen_request_by_id: ['keygen request', 'get keygen', 'key gen request'],
	fetch_key_gen_result: [
		'keygen result',
		'ethereum address',
		'executor address',
		'wallet address',
	],

	// MultiSign / sign requests (read vs agree)
	list_sign_requests: [
		'sign request',
		'sign requests',
		'multisign request',
		'multi sign request',
		'list sign requests',
		'pending sign',
		'live sign',
	],
	list_sign_requests_awaiting_join: [
		'sign request',
		'awaiting join',
		'join tab',
		'pending agree',
		'needs agreement',
		'local agreement pending',
		'agree pending',
	],
	get_sign_request_by_id: ['sign request', 'get sign request', 'sign request detail'],
	get_sign_request_status: ['sign request status', 'lifecycle', 'ready to broadcast'],
	list_sign_requests_ready: ['ready for get sig', 'quorum ready', 'ready to sign'],
	get_sign_result_summary: ['sign result', 'ready to broadcast', 'get sig done'],
	get_multi_sign_gas_options: ['gas options', 'custom gas', 'fee speed', 'get sig fee'],
	wait_for_sign_request_ready: ['wait ready', 'poll sign ready'],
	sign_request_agree: [
		'agree',
		'agree to sign',
		'agree to sign request',
		'agree to multisign',
		'agree sign request',
		'accept sign request',
		'reject sign request',
		'reject multisign',
		'approve sign request',
		'multisign approve',
		'join agree',
	],
	shelve_sign_request: ['shelve', 'shelve sign request', 'pause sign request'],

	// execute
	trigger_sign_result: ['get sig', 'trigger sign', 'mpc signing', 'trigger get sig'],
	broadcast_sign_result: ['broadcast', 'execute on chain', 'send transaction', 'execute sign'],
	bump_or_cancel_sign_result: ['bump gas', 'cancel stuck', 'replace transaction'],
	tx_params_from_get_sign_request_id_data: ['tx params', 'transaction params'],

	// compose / transfers
	transfer_native_gas: ['transfer', 'send eth', 'send gas', 'native transfer', 'top up gas'],
	transfer_erc20: ['transfer', 'send token', 'send erc20', 'erc20 transfer'],
	transfer_erc721: ['transfer', 'send nft', 'erc721', 'nft transfer'],
	transfer_ctm_erc20: ['transfer', 'send ctm', 'ctm transfer'],
	transfer_ctm_erc20_cross_chain: [
		'transfer',
		'bridge ctm',
		'cross chain ctm',
		'c3transfer',
	],
	create_compose_multi_sign_request: [
		'compose',
		'batch multisign',
		'create multisign',
		'create sign request',
		'sign request',
	],
	create_compose_eip712_multi_sign_request: [
		'compose',
		'eip712',
		'typed data',
		'batch signatures',
		'create multisign',
		'create sign request',
	],
	create_forge_multi_sign_request: [
		'forge',
		'foundry',
		'broadcast json',
		'inline broadcast json',
		'create multisign',
		'create sign request',
	],
	import_forge_dry_run_multi_sign_request: [
		'forge',
		'foundry',
		'foundry import',
		'compose import',
		'import script',
		'dry run',
		'run-latest',
		'broadcast import',
		'create multisign',
		'create sign request',
	],
	build_forge_dry_run_multi_sign_payload: [
		'forge',
		'foundry',
		'dry run',
		'build payload',
		'helper json',
		'multisign',
	],
	import_and_join_forge_dry_runs_multi_sign_request: [
		'forge',
		'foundry',
		'dry run',
		'join',
		'batch multisign',
		'create sign request',
	],
	create_joined_multi_sign_request: [
		'join multisign',
		'batch join',
		'joined multisign',
		'create sign request',
	],

	// defi discovery
	list_defi_protocols: [
		'defi',
		'protocol',
		'protocols',
		'list protocols',
		'available protocols',
		'what protocols',
		// Brands on list/load tools only (not group-wide).
		'uniswap',
		'aave',
		'gmx',
		'hyperliquid',
		'arcus',
	],
	load_defi_protocol: [
		'defi',
		'protocol',
		'load protocol',
		'load defi',
		'enable protocol',
		'activate protocol',
		'defi tools',
		'uniswap',
		'aave',
		'gmx',
		'hyperliquid',
		'arcus',
	],
	unload_defi_protocol: ['defi', 'protocol', 'unload protocol'],
	get_defi_protocol_skill: ['defi skill', 'protocol skill', 'skill md'],
	get_defi_protocol_supported_chains: ['protocol chains', 'defi chains'],
	get_defi_protocol_supported_tokens: ['protocol tokens', 'defi tokens'],
	get_tools_for_protocol: ['protocol tools', 'defi tools list'],

	// agent cron / skills / webhooks / config
	list_cron_jobs: ['cron', 'scheduled jobs', 'list cron'],
	add_cron_job: ['cron', 'schedule job', 'create cron', 'every n minutes'],
	run_cron_job: ['run cron', 'trigger cron'],
	update_cron_job: ['update cron', 'edit cron'],
	activate_cron_job: ['activate cron', 'enable cron'],
	deactivate_cron_job: ['deactivate cron', 'disable cron'],
	list_skills: ['skills', 'agent skills', 'list skills'],
	get_skill: ['skill', 'get skill', 'read skill'],
	add_skill: ['add skill', 'create skill', 'skill markdown'],
	add_skill_from_catalog: [
		'skill catalog',
		'catalog skill',
		'install skill',
		'add skill from catalog',
	],
	remove_skill: ['remove skill', 'delete skill'],
	list_user_folder: ['workspace', 'user folder', 'list files', 'browse files'],
	get_user_folder_file: ['workspace', 'user folder', 'read file', 'download file'],
	write_user_folder_file: ['workspace', 'user folder', 'upload file', 'write file'],
	list_webhooks: ['webhooks', 'inbound webhook', 'list webhooks'],
	send_telegram_message: [
		'telegram',
		'send telegram',
		'notify telegram',
		'telegram notify',
		'telegram message',
	],
	search_telegram_messages: [
		'telegram search',
		'search telegram',
		'telegram channel search',
		'telegram messages',
	],
	search_telegram_tickers: [
		'telegram ticker',
		'token mention',
		'cashtag',
		'telegram token',
		'$ ticker',
	],
	add_webhook: ['add webhook', 'create webhook'],
	add_webhook_from_catalog: ['webhook catalog', 'catalog webhook'],
	list_environment_variables: ['env var', 'environment variables', 'secrets'],
	add_environment_variable: ['env var', 'add secret', 'set variable'],
	remove_environment_variable: ['env var', 'remove secret'],
	list_mcp_servers: ['mcp server', 'list mcp', 'mcp catalog'],
	add_mcp_server: ['add mcp', 'mcp server'],
	add_mcp_server_from_catalog: ['mcp catalog', 'catalog mcp'],

	// keygen messaging
	send_key_gen_message: ['keygen message', 'send message', 'message peers'],
	list_key_gen_messages: ['keygen message', 'inbox', 'list messages'],
	get_key_gen_message_thread: ['message thread', 'conversation'],
};

/** DeFi protocol tool pack within `defi:<protocolId>:<pack>`. */
export type DefiProtocolPack = 'market-data' | 'trading' | 'other';

export function classifyDefiToolPack(toolName: string): DefiProtocolPack {
	const n = stripMcpToolServerPrefix(toolName).toLowerCase();
	if (n.includes('continuum_dao')) {
		return 'trading';
	}
	if (
		(n.includes('build_') && n.includes('multisign')) ||
		n.includes('create_swap') ||
		n.includes('_place_') ||
		n.includes('cancel_order') ||
		n.includes('_close_position') ||
		n.includes('close_position')
	) {
		return 'trading';
	}
	if (
		n.includes('fetch_ohlcv') ||
		n.includes('fetch_markets') ||
		n.includes('fetch_open_context') ||
		n.includes('search_markets') ||
		n.includes('market_snapshot') ||
		n.includes('fetch_open_orders') ||
		n.includes('fetch_positions') ||
		n.includes('usd_class_balances') ||
		n.includes('fetch_vaults') ||
		n.includes('user_vault_equities') ||
		(n.includes('_quote') && !n.includes('build'))
	) {
		return 'market-data';
	}
	return 'other';
}

export function defiProtocolPackGroupId(
	protocolId: string,
	pack: DefiProtocolPack = 'market-data',
): string {
	return `defi:${protocolId.trim()}:${pack}`;
}

/** Expand activate_tool_group aliases to concrete pack ids. */
export function resolveActivateGroupIds(groupId: string): string[] {
	const id = groupId.trim();
	if (!id) {
		return [];
	}
	const aliased = GROUP_ACTIVATE_ALIASES[id];
	if (aliased) {
		return [...aliased];
	}
	// defi:<protocol> (no pack) → market-data only
	if (id.startsWith('defi:')) {
		const parts = id.split(':');
		if (parts.length === 2 && parts[1]) {
			return [defiProtocolPackGroupId(parts[1], 'market-data')];
		}
	}
	return [id];
}

export function isChartFamilyGroupId(groupId: string): boolean {
	return groupId === 'chart' || groupId.startsWith('chart:');
}

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
		return defiProtocolPackGroupId(options.protocolId, classifyDefiToolPack(bare));
	}
	if (bare.startsWith('ctm_') || name.startsWith('ctm_')) {
		return 'defi:unknown:other';
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
