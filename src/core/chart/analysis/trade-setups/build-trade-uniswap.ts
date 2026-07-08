import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../../../config/schema.js';
import type {SdkResult} from '../../../result.js';
import {resolveTokenFromRegistry} from '../../../registry/tokens.js';
import type {DefiProtocolContext} from '../../../../mcp/defi/context.js';
import {executeDefiMcpTool} from '../../../../mcp/defi/handler.js';
import type {TradeIdea} from './trade-idea.js';
import type {BuildTradeFromTradeIdeaInput} from './build-trade.js';

const UNISWAP_QUOTE_TOOL = 'ctm_uniswap_v4_quote';
const UNISWAP_CREATE_SWAP_TOOL = 'ctm_uniswap_v4_create_swap';
const UNISWAP_BUILD_SWAP_TOOL = 'ctm_uniswap_v4_build_swap_multisign';
const DEFAULT_COLLATERAL_SYMBOL = 'USDC';

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

function swapDeadlineUnix(): number {
	return Math.floor(Date.now() / 1000) + 30 * 60;
}

export async function buildUniswapSpotSwapFromTradeIdea(
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	idea: TradeIdea,
	input: BuildTradeFromTradeIdeaInput,
): Promise<SdkResult<{requestId: string; mappedTool: string}>> {
	if (idea.side !== 'long' && idea.side !== 'short') {
		return {ok: false, reason: 'Trade idea side must be long or short for Uniswap spot swaps.'};
	}
	const symbol = idea.symbol?.trim().toUpperCase();
	if (!symbol) {
		return {ok: false, reason: 'Trade idea is missing symbol for Uniswap mapping.'};
	}
	const sizeUsd = input.sizeUsdHuman?.trim();
	if (!sizeUsd) {
		return {ok: false, reason: 'sizeUsdHuman is required for Uniswap spot swaps.'};
	}
	const chainId = input.chainId || 42161;

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
		return {ok: false, reason: `Invalid sizeUsdHuman ${sizeUsd} for Uniswap quote.`};
	}

	const quoteTool = findDefiTool(UNISWAP_QUOTE_TOOL);
	const createTool = findDefiTool(UNISWAP_CREATE_SWAP_TOOL);
	const buildTool = findDefiTool(UNISWAP_BUILD_SWAP_TOOL);
	if (!quoteTool || !createTool || !buildTool) {
		return {ok: false, reason: 'Uniswap V4 MCP tools are not registered.'};
	}

	const tokenInAddr =
		tokenIn.data.contractAddress === '0x0' ? '0x0000000000000000000000000000000000000000' : tokenIn.data.contractAddress;
	const tokenOutAddr =
		tokenOut.data.contractAddress === '0x0' ? '0x0000000000000000000000000000000000000000' : tokenOut.data.contractAddress;

	const quoteResult = await executeDefiMcpTool(config, defiContext, quoteTool, {
		type: 'EXACT_INPUT',
		amount: amountBase,
		tokenIn: tokenInAddr,
		tokenOut: tokenOutAddr,
		chainId,
		keyGenId: input.keyGenId,
		slippage: input.slippageBps != null ? input.slippageBps / 100 : 0.5,
	});
	if (quoteResult.isError) {
		const text =
			quoteResult.content?.[0]?.type === 'text' ? quoteResult.content[0].text : 'Uniswap quote failed.';
		return {ok: false, reason: text};
	}
	const fullQuote =
		quoteResult.structuredContent && typeof quoteResult.structuredContent === 'object'
			? quoteResult.structuredContent
			: null;
	if (!fullQuote) {
		return {ok: false, reason: 'Uniswap quote returned no structured content.'};
	}

	const deadline = swapDeadlineUnix();
	const createResult = await executeDefiMcpTool(config, defiContext, createTool, {
		fullQuoteFromPermit: fullQuote,
		swapTransactionDeadlineUnix: deadline,
	});
	if (createResult.isError) {
		const text =
			createResult.content?.[0]?.type === 'text' ? createResult.content[0].text : 'Uniswap create_swap failed.';
		return {ok: false, reason: text};
	}
	const createSwap =
		createResult.structuredContent && typeof createResult.structuredContent === 'object'
			? (createResult.structuredContent as Record<string, unknown>)
			: null;
	const swap = createSwap?.swap;
	if (!swap || typeof swap !== 'object') {
		return {ok: false, reason: 'Uniswap create_swap did not return swap calldata.'};
	}

	const buildResult = await executeDefiMcpTool(config, defiContext, buildTool, {
		keyGenId: input.keyGenId,
		chainId,
		purposeText: input.purposeText,
		useCustomGas: input.useCustomGas ?? false,
		tokenIn: tokenInAddr,
		swap,
		createSwapResponse: createSwap,
		fullQuoteSnapshot: fullQuote,
		swapDeadlineUnix: deadline,
	});
	if (buildResult.isError) {
		const text =
			buildResult.content?.[0]?.type === 'text' ? buildResult.content[0].text : 'Uniswap build_swap failed.';
		return {ok: false, reason: text};
	}
	const structured =
		buildResult.structuredContent && typeof buildResult.structuredContent === 'object'
			? (buildResult.structuredContent as Record<string, unknown>)
			: {};
	const requestId = String(structured.requestId ?? '').trim();
	if (!requestId) {
		return {ok: false, reason: 'Uniswap build_swap did not return requestId.'};
	}
	return {ok: true, data: {requestId, mappedTool: UNISWAP_BUILD_SWAP_TOOL}};
}
