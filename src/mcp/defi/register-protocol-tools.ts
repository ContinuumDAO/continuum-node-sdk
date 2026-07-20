import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {AnySchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {DefiProtocolContext} from './context.js';
import {executeDefiMcpTool} from './handler.js';
import {MCP_NON_SUBMIT_TOOL_NAMES} from './catalog-adapter.js';
import {MULTISIGN_CREATE_GAS_GUIDANCE} from '../mpc-gas-docs.js';
import {
	UNISWAP_V4_API_KEY_TOOL_NAMES,
	UNISWAP_API_KEY_ENV,
	UNISWAP_API_KEY_SIGNUP_URL,
} from './uniswap-api-key.js';
import {
	VENICE_API_KEY_TOOL_NAMES,
	VENICE_API_KEY_ENV,
	VENICE_API_KEY_SIGNUP_URL,
} from './venice-api-key.js';
import {defiToolInputSchema, defiToolOutputSchema} from './tool-schemas.js';
import {isAaveV4MultisignTool} from './aave-v4-input.js';
import {isMorphoMultisignTool} from './morpho-input.js';
import {isUniswapLimitOrderMultisignTool} from './uniswap-limit-order-input.js';
import {
	HYPERLIQUID_LIMIT_ORDER_MULTISIGN_TOOL,
	HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS,
} from './eip712-multisign.js';
import type {DeferredToolSession} from '../deferred/session.js';

function multisignCreateGuidance(toolName: string): string {
	if (isUniswapLimitOrderMultisignTool(toolName)) {
		return 'Pass keyGenId + chainId 1 + purposeText + fullLimitQuote from a fresh ctm_uniswap_v4_limit_order_quote. EIP-712 only — useCustomGas is not used (do not call get_multi_sign_gas_options for this tool).';
	}
	if (HYPERLIQUID_STATIC_EIP712_MULTISIGN_TOOLS.has(toolName)) {
		return 'Pass keyGenId + chainId + purposeText + tool-specific fields. EIP-712 only — useCustomGas is not used (do not call get_multi_sign_gas_options). trigger_sign_result without txParams; broadcast_sign_result POSTs to Hyperliquid /exchange.';
	}
	if (toolName === HYPERLIQUID_LIMIT_ORDER_MULTISIGN_TOOL) {
		return 'Plain limit (no TP/SL): CoreWriter EVM tx on HyperEVM — call get_multi_sign_gas_options and pass useCustomGas. With takeProfitTriggerPxHuman and/or stopLossTriggerPxHuman: EIP-712 normalTpsl bracket — no useCustomGas, trigger without txParams, broadcast POSTs to /exchange.';
	}
	if (toolName === 'ctm_gmx_build_increase_multisign') {
		return `Pass keyGenId + chainId + purposeText (server resolves keyGen, executorAddress, rpcUrl from get_chain_registry rpcGateway, chainDetail). Do not pass rpcUrl. ${MULTISIGN_CREATE_GAS_GUIDANCE} GMX TP/SL (takeProfitPriceUsdHuman / stopLossPriceUsdHuman) is on-chain classic orders — useCustomGas applies; not EIP-712.`;
	}
	return `Pass keyGenId + chainId + purposeText (server resolves keyGen, executorAddress, rpcUrl from get_chain_registry rpcGateway, chainDetail). Do not pass rpcUrl. ${MULTISIGN_CREATE_GAS_GUIDANCE}`;
}

/** Register every DeFi catalog tool; calls are gated by DefiProtocolContext.load state. */
export function registerAllDefiProtocolTools(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	deferredSession?: DeferredToolSession,
): void {
	const byProtocol = new Map<string, string[]>();
	for (const tool of getMcpToolDefinitions()) {
		registerDefiTool(server, config, defiContext, tool, deferredSession);
		const list = byProtocol.get(tool.protocolId) ?? [];
		list.push(tool.name);
		byProtocol.set(tool.protocolId, list);
	}
	for (const [protocolId, toolNames] of byProtocol) {
		if (defiContext.isLoaded(protocolId)) {
			defiContext.markLoaded(protocolId, toolNames);
			if (deferredSession?.deferLoading) {
				deferredSession.activateGroup(`defi:${protocolId}`);
			}
		}
	}
}

function registerDefiTool(
	server: McpServer,
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	tool: McpToolDefinition,
	deferredSession?: DeferredToolSession,
): void {
	const description = [
		tool.description,
		!MCP_NON_SUBMIT_TOOL_NAMES.has(tool.name) ? multisignCreateGuidance(tool.name) : '',
		UNISWAP_V4_API_KEY_TOOL_NAMES.has(tool.name)
			? `Uses ${UNISWAP_API_KEY_ENV} from Node → AI Agent → Variables (get a key at ${UNISWAP_API_KEY_SIGNUP_URL}). The server injects the API key automatically — do not pass uniswapApiKey. Check configuration with list_environment_variables.${
					tool.name === 'ctm_uniswap_v4_quote'
						? ' Pass keyGenId (preferred KeyGen id) or swapper. Quote defaults match the node app: permit2Disabled true, slippage 0.5, native ETH tokenIn 0x0.'
						: ''
				}`
			: '',
		VENICE_API_KEY_TOOL_NAMES.has(tool.name)
			? `Uses ${VENICE_API_KEY_ENV} from Node → AI Agent → Variables (get a key at ${VENICE_API_KEY_SIGNUP_URL}). The server injects the API key automatically — do not pass apiKey. Check configuration with list_environment_variables.`
			: '',
		tool.name === 'ctm_curve_dao_quote' ||
		tool.name === 'ctm_curve_dao_build_swap_multisign'
			? 'Call get_defi_protocol_skill({ protocolId: "curve-dao" }). Quote: native 0xeeee/0x0. Build: tokenIn is ERC-20 (wrapped native for ETH in). rpcUrl from chain registry — do not pass rpcUrl.'
			: '',
		tool.name === 'ctm_uniswap_v4_quote' ||
		tool.name === 'ctm_uniswap_v4_create_swap' ||
		tool.name === 'ctm_uniswap_v4_build_swap_multisign'
			? 'Call get_defi_protocol_skill({ protocolId: "uniswap-v4" }). Three-step: quote → create_swap → build_swap_multisign. Native ETH tokenIn: 0x0. amount on quote is base units (wei).'
			: '',
		tool.name === 'ctm_uniswap_v4_limit_order_quote' ||
		tool.name === 'ctm_uniswap_v4_build_limit_order_multisign'
			? 'UniswapX limit orders: mainnet (chainId 1) only. limit_order_quote → build_limit_order_multisign (EIP-712, no gas). Re-quote immediately before build when limitPrice or orderDeadline changes — never reuse a stale fullLimitQuote. Pass keyGenId (server resolves swapper). After sign, delivery POSTs to Trade API /v1/order.'
			: '',
		tool.name === 'ctm_uniswap_v4_fetch_limit_orders'
			? 'List open UniswapX limit orders for swapper on Ethereum mainnet. Pass keyGenId or swapper (server resolves swapper from keyGenId).'
			: '',
		tool.name === 'ctm_uniswap_v4_list_lp_pools'
			? 'List standard V4 LP pools for a chain (ETH/USDC etc. at 0.05%, 0.3%, 1% fee tiers). Returns presetId and computed poolReference. Use presetId as poolPreset on lp_create_position or fetch_ohlcv.'
			: '',
		tool.name === 'ctm_uniswap_v4_fetch_ohlcv'
			? 'Pool OHLCV: list_lp_pools → fetch_ohlcv with poolPreset + interval + lookbackDays (subgraph chains). Robinhood (4663): currencyAddress/currencySymbol or existingPool + BITQUERY_API_KEY. Optional THE_GRAPH_API_KEY for subgraph rate limits (not UNISWAP_API_KEY). Full fetch JSON → prepare_chart_from_rows or analyze_*.'
			: '',
		tool.name === 'ctm_uniswap_v4_lp_create_position' ||
		tool.name === 'ctm_uniswap_v4_build_mint_liquidity_multisign'
			? 'LP mint: list_lp_pools → lp_create_position (poolPreset or existingPool) → build_mint_liquidity_multisign. Pass keyGenId (resolves walletAddress). priceBounds/tickBounds + independentToken (base units). Native ETH: 0x0; pass nativeWrapped on build when needed. If create fails, try another preset or pass poolReference manually. After execute: ctm_uniswap_v4_register_position_from_mint_tx.'
			: '',
		tool.name === 'ctm_uniswap_v4_lp_increase' ||
		tool.name === 'ctm_uniswap_v4_build_increase_liquidity_multisign'
			? 'LP increase: lp_increase → build_increase_liquidity_multisign. Requires nftTokenId from lp_list_positions (token registry ERC721 entries only — no blockchain scan). If missing, register via register_position_nft, add_to_token_registry, or app block scan.'
			: '',
		tool.name === 'ctm_uniswap_v4_lp_decrease' ||
		tool.name === 'ctm_uniswap_v4_build_decrease_liquidity_multisign'
			? 'LP decrease: lp_decrease (liquidityPercentageToDecrease 1–100) → build_decrease_liquidity_multisign.'
			: '',
		tool.name === 'ctm_uniswap_v4_lp_collect' ||
		tool.name === 'ctm_uniswap_v4_build_collect_fees_multisign'
			? 'Collect fees: lp_collect → build_collect_fees_multisign. V4 uses zero-liquidity decrease + TAKE_PAIR (no separate staking).'
			: '',
		tool.name === 'ctm_uniswap_v4_lp_list_positions'
			? 'List V4 position NFTs from the node token registry (ERC721 Position Manager entries). Pass keyGenId + chainId — no RPC log scan. Empty list? register_position_nft or register_position_from_mint_tx after mint, add_to_token_registry (ERC721), or use the app Manage tab block scan.'
			: '',
		tool.name === 'ctm_uniswap_v4_register_position_nft'
			? 'Add a known position tokenId to the token registry (management-signed ERC721). Use when lp_list_positions does not show a position you own.'
			: '',
		tool.name === 'ctm_uniswap_v4_register_position_from_mint_tx'
			? 'Parse a completed mint tx receipt and add the new position NFT to the token registry. Call after build_mint_liquidity_multisign executes.'
			: '',
		isAaveV4MultisignTool(tool.name)
			? 'Call get_defi_protocol_skill({ protocolId: "aave-v4" }) for hubs/spokes and lending workflows. Pass underlying + amountHuman + marketId (optional). spoke is auto-resolved. Native ETH: underlying 0x0. Borrow: underlying = debt token; optional collateralUnderlying. Withdraw/borrow run health-factor preview unless skipHealthPreview; borderline risk needs acknowledgeHealthRisk: true.'
			: '',
		isMorphoMultisignTool(tool.name)
			? 'Vault deposit: ctm_morpho_fetch_earn_vaults then build_vault_deposit_multisign — copy vaultAddress + underlyingAddress from the fetch row into the build tool (same field names). See tool input schema for required fields. Do not use create_compose_multi_sign_request.'
			: '',
		tool.name === 'ctm_hyperliquid_build_update_leverage_multisign'
			? 'Set leverage/cross: ctm_hyperliquid_fetch_open_context (leverageLabel) + fetch_markets (maxLeverage). EIP-712 L1 /exchange — not CoreWriter, no useCustomGas. trigger_sign_result without txParams; broadcast_sign_result POSTs signature to Hyperliquid /exchange. isCross true (default) or false for isolated.'
			: '',
		tool.name === 'ctm_hyperliquid_build_bridge_withdraw_multisign'
			? 'Withdraw USDC Hyperliquid → Arbitrum via withdraw3. EIP-712 L1 /exchange — no useCustomGas. trigger_sign_result without txParams; broadcast_sign_result POSTs to /exchange.'
			: '',
		tool.name === 'ctm_hyperliquid_build_limit_order_multisign'
			? 'Plain limit: CoreWriter on HyperEVM (useCustomGas). With takeProfitTriggerPxHuman and/or stopLossTriggerPxHuman: EIP-712 normalTpsl bracket to /exchange (no gas). Re-build if entry/TP/SL params change.'
			: '',
		tool.name === 'ctm_gmx_build_increase_multisign'
			? 'GMX classic increase (market/limit). Optional takeProfitPriceUsdHuman / stopLossPriceUsdHuman attach native on-chain TP/SL decrease orders — still EVM gas + broadcast, not EIP-712.'
			: '',
		tool.prerequisites.length
			? `Prerequisites: ${tool.prerequisites.join('; ')}`
			: '',
		tool.followUp.length ? `Follow-up: ${tool.followUp.join('; ')}` : '',
	]
		.filter(Boolean)
		.join('\n');

	// Cast avoids TS2589 when vendored ctm-mpc-defi Zod types cross package boundaries.
	const schemaSource = tool as unknown as {
		name: string;
		inputZod: AnySchema;
		outputZod: AnySchema;
	};
	registerDefiToolOnServer(server, tool.name, {
		description,
		inputSchema: defiToolInputSchema(schemaSource),
		outputSchema: defiToolOutputSchema(schemaSource),
		handler: input => executeDefiMcpTool(config, defiContext, tool, input),
	});
	if (deferredSession) {
		deferredSession.assignToolGroup(tool.name, `defi:${tool.protocolId}`);
	}
}

type DefiToolRegistration = {
	description: string;
	inputSchema: AnySchema;
	outputSchema: AnySchema;
	handler: (input: unknown) => ReturnType<typeof executeDefiMcpTool>;
};

function registerDefiToolOnServer(
	server: McpServer,
	name: string,
	registration: DefiToolRegistration,
): void {
	server.registerTool(
		name,
		{
			description: registration.description,
			inputSchema: registration.inputSchema,
			outputSchema: registration.outputSchema,
		},
		registration.handler,
	);
}

export function markProtocolLoaded(
	defiContext: DefiProtocolContext,
	protocolId: string,
): string[] {
	const toolNames = getMcpToolDefinitions()
		.filter(t => t.protocolId === protocolId)
		.map(t => t.name);
	if (toolNames.length === 0) {
		throw new Error(`Unknown or empty DeFi protocol: ${protocolId}`);
	}
	defiContext.markLoaded(protocolId, toolNames);
	return toolNames;
}
