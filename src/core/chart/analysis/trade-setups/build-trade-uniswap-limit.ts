import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../../../config/schema.js';
import type {SdkResult} from '../../../result.js';
import {resolveTokenFromRegistry} from '../../../registry/tokens.js';
import type {DefiProtocolContext} from '../../../../mcp/defi/context.js';
import {executeDefiMcpTool} from '../../../../mcp/defi/handler.js';
import type {TradeIdea} from './trade-idea.js';
import type {BuildTradeFromTradeIdeaInput} from './build-trade.js';
import {formatHumanPrice, validateBuildTradePrices} from './build-trade.js';

const UNISWAP_LIMIT_QUOTE_TOOL = 'ctm_uniswap_v4_limit_order_quote';
const UNISWAP_BUILD_LIMIT_TOOL = 'ctm_uniswap_v4_build_limit_order_multisign';
const DEFAULT_COLLATERAL_SYMBOL = 'USDC';
const MAINNET_CHAIN_ID = 1;
const DEFAULT_ORDER_TTL_SEC = 7 * 24 * 60 * 60;

function findDefiTool(toolName: string) {
	return getMcpToolDefinitions().find(tool => tool.name === toolName) ?? null;
}

function humanToBaseUnits(human: string, decimals: number): string | null {
	const trimmed = human.trim();
	if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
		return null;
	}
	const [whole, frac = ''] = trimmed.split('.');
	const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
	const combined = `${whole}${fracPadded}`.replace(/^0+/, '') || '0';
	try {
		return BigInt(combined).toString();
	} catch {
		return null;
	}
}

function limitPriceFromEntry(entry: number): string {
	return formatHumanPrice(entry);
}

export async function buildUniswapLimitOrderFromTradeIdea(
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): Promise<SdkResult<{requestId: string; mappedTool: string}>> {
	const chainId = input.chainId || MAINNET_CHAIN_ID;
	if (chainId !== MAINNET_CHAIN_ID) {
		return {
			ok: false,
			reason: `UniswapX limit orders require Ethereum mainnet (chainId ${MAINNET_CHAIN_ID}). Got ${chainId}.`,
		};
	}
	if (idea.side !== 'long' && idea.side !== 'short') {
		return {ok: false, reason: 'Trade idea side must be long or short for Uniswap limit orders.'};
	}
	const validated = validateBuildTradePrices(idea, input);
	if (!validated.ok) {
		return validated;
	}
	const symbol = idea.symbol?.trim().toUpperCase();
	if (!symbol) {
		return {ok: false, reason: 'Trade idea is missing symbol for Uniswap mapping.'};
	}
	const sizeUsd = input.sizeUsdHuman?.trim();
	if (!sizeUsd) {
		return {ok: false, reason: 'sizeUsdHuman is required for Uniswap limit orders.'};
	}

	const tokenOut = await resolveTokenFromRegistry(config, {
		chainId,
		tokenSymbol: idea.side === 'long' ? symbol : DEFAULT_COLLATERAL_SYMBOL,
	});
	if (!tokenOut.ok) {
		return tokenOut;
	}
	const tokenIn = await resolveTokenFromRegistry(config, {
		chainId,
		tokenSymbol: idea.side === 'long' ? DEFAULT_COLLATERAL_SYMBOL : symbol,
	});
	if (!tokenIn.ok) {
		return tokenIn;
	}

	const inDecimals = idea.side === 'long' ? 6 : 18;
	const amountBase = humanToBaseUnits(sizeUsd, inDecimals);
	if (!amountBase) {
		return {ok: false, reason: `Invalid sizeUsdHuman ${sizeUsd} for Uniswap limit quote.`};
	}

	const quoteTool = findDefiTool(UNISWAP_LIMIT_QUOTE_TOOL);
	const buildTool = findDefiTool(UNISWAP_BUILD_LIMIT_TOOL);
	if (!quoteTool || !buildTool) {
		return {ok: false, reason: 'Uniswap V4 limit order MCP tools are not registered.'};
	}

	const tokenInAddr =
		tokenIn.data.contractAddress === '0x0' ? '0x0000000000000000000000000000000000000000' : tokenIn.data.contractAddress;
	const tokenOutAddr =
		tokenOut.data.contractAddress === '0x0' ? '0x0000000000000000000000000000000000000000' : tokenOut.data.contractAddress;

	const orderDeadline =
		input.expiryDate != null && input.expiryDate > 0
			? Math.floor(input.expiryDate)
			: Math.floor(Date.now() / 1000) + DEFAULT_ORDER_TTL_SEC;

	const quoteResult = await executeDefiMcpTool(config, defiContext, quoteTool, {
		type: 'EXACT_INPUT',
		amount: amountBase,
		limitPrice: limitPriceFromEntry(validated.data!.entry),
		tokenIn: tokenInAddr,
		tokenOut: tokenOutAddr,
		chainId,
		orderDeadline,
		keyGenId: input.keyGenId,
	});
	if (quoteResult.isError) {
		const text =
			quoteResult.content?.[0]?.type === 'text' ? quoteResult.content[0].text : 'Uniswap limit quote failed.';
		return {ok: false, reason: text};
	}
	const fullLimitQuote =
		quoteResult.structuredContent && typeof quoteResult.structuredContent === 'object'
			? quoteResult.structuredContent
			: null;
	if (!fullLimitQuote) {
		return {ok: false, reason: 'Uniswap limit quote returned no structured content.'};
	}

	const buildResult = await executeDefiMcpTool(config, defiContext, buildTool, {
		keyGenId: input.keyGenId,
		chainId,
		purposeText: input.purposeText,
		fullLimitQuote,
		...(input.expiryDate != null && input.expiryDate > 0 ? {expiryDate: Math.floor(input.expiryDate)} : {}),
	});
	if (buildResult.isError) {
		const text =
			buildResult.content?.[0]?.type === 'text' ? buildResult.content[0].text : 'Uniswap build_limit_order failed.';
		return {ok: false, reason: text};
	}
	const structured =
		buildResult.structuredContent && typeof buildResult.structuredContent === 'object'
			? (buildResult.structuredContent as Record<string, unknown>)
			: {};
	const requestId = String(structured.requestId ?? '').trim();
	if (!requestId) {
		return {ok: false, reason: 'Uniswap build_limit_order did not return requestId.'};
	}
	return {ok: true, data: {requestId, mappedTool: UNISWAP_BUILD_LIMIT_TOOL}};
}
