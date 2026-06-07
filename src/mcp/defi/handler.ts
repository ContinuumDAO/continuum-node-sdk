import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {MCP_NON_SUBMIT_TOOL_NAMES} from './catalog-adapter.js';
import {
	parseMcpToolInput,
	parseMcpToolOutput,
} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../config/schema.js';
import {signAndSubmitMultiSignRequest} from '../../core/mpc/sign-request-body.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';
import type {DefiProtocolContext} from './context.js';
import {importDefiHandler} from './import-map.js';
import {
	enrichMultisignContext,
	mapToolFieldsToBuilderArgs,
	stripEnrichmentKeys,
} from './input-adapter.js';
import {injectUniswapApiKeyForTool} from './uniswap-api-key.js';
import {adaptUniswapQuoteMcpInput, isUniswapQuoteTool} from './uniswap-quote-input.js';
import {adaptCurveQuoteMcpInput, isCurveQuoteTool} from './curve-quote-input.js';

export async function executeDefiMcpTool(
	config: NodeSdkConfig,
	defiContext: DefiProtocolContext,
	tool: McpToolDefinition,
	rawInput: unknown,
) {
	try {
		defiContext.assertToolCallable(tool);
	} catch (error) {
		return {
			content: [
				{
					type: 'text' as const,
					text: error instanceof Error ? error.message : String(error),
				},
			],
			isError: true,
		};
	}

	const inputRecord =
		rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
			? (rawInput as Record<string, unknown>)
			: {};

	const uniswapKeyInjection = await injectUniswapApiKeyForTool(
		config,
		tool.name,
		inputRecord,
	);
	if (!uniswapKeyInjection.ok) {
		return uniswapKeyInjection.result;
	}

	let validationInput: unknown = uniswapKeyInjection.input;
	const enrichedInput = uniswapKeyInjection.input;

	if (isUniswapQuoteTool(tool.name)) {
		const adapted = await adaptUniswapQuoteMcpInput(
			config,
			tool.name,
			enrichedInput,
		);
		if (!adapted.ok) {
			return sdkResultToCallToolResult(adapted);
		}
		validationInput = adapted.data;
	} else if (isCurveQuoteTool(tool.name)) {
		const adapted = await adaptCurveQuoteMcpInput(
			config,
			tool.name,
			enrichedInput,
		);
		if (!adapted.ok) {
			return sdkResultToCallToolResult(adapted);
		}
		validationInput = adapted.data;
	} else if (
		!MCP_NON_SUBMIT_TOOL_NAMES.has(tool.name) &&
		typeof enrichedInput.keyGenId === 'string' &&
		enrichedInput.keyGenId.trim()
	) {
		const enriched = await enrichMultisignContext(config, enrichedInput);
		if (!enriched.ok) {
			return sdkResultToCallToolResult(enriched);
		}
		validationInput = {
			...enrichedInput,
			keyGen: enriched.data.keyGen,
			executorAddress: enriched.data.executorAddress,
			chainId: enriched.data.chainId,
			rpcUrl: enriched.data.rpcUrl,
			chainDetail: enriched.data.chainDetail,
			useCustomGas: enriched.data.useCustomGas,
			...(enriched.data.customGasChainDetails
				? {customGasChainDetails: enriched.data.customGasChainDetails}
				: {}),
		};
	}

	let parsed: unknown;
	try {
		parsed = parseMcpToolInput(tool.name as never, validationInput);
	} catch (error) {
		return {
			content: [
				{
					type: 'text' as const,
					text: error instanceof Error ? error.message : 'Invalid tool input.',
				},
			],
			isError: true,
		};
	}

	const parsedInput =
		parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};

	try {
		const handler = await importDefiHandler(
			tool.handler.importPath,
			tool.handler.exportName,
		);

		if (MCP_NON_SUBMIT_TOOL_NAMES.has(tool.name)) {
			const result = await handler(parsedInput);
			const validated = parseMcpToolOutput(tool.name as never, result);
			return {
				content: [{type: 'text' as const, text: JSON.stringify(validated)}],
				structuredContent: validated as Record<string, unknown>,
			};
		}

		const enriched = await enrichMultisignContext(config, parsedInput);
		if (!enriched.ok) {
			return sdkResultToCallToolResult(enriched);
		}

		const protocolFields = mapToolFieldsToBuilderArgs(
			tool.name,
			stripEnrichmentKeys(parsedInput),
		);

		const builderArgs = {
			...protocolFields,
			keyGen: enriched.data.keyGen,
			executorAddress: enriched.data.executorAddress,
			chainId: enriched.data.chainId,
			rpcUrl: enriched.data.rpcUrl,
			chainDetail: enriched.data.chainDetail,
			useCustomGas: enriched.data.useCustomGas,
			...(enriched.data.customGasChainDetails
				? {customGasChainDetails: enriched.data.customGasChainDetails}
				: {}),
		};

		const built = await handler(builderArgs);
		const buildOut = parseMcpToolOutput(tool.name as never, built) as {
			bodyForSign: Record<string, unknown>;
		};

		const submitted = await signAndSubmitMultiSignRequest(
			config,
			buildOut.bodyForSign,
		);
		if (!submitted.ok) {
			return sdkResultToCallToolResult(submitted);
		}

		const payload = {requestId: submitted.data.requestId};
		return {
			content: [{type: 'text' as const, text: JSON.stringify(payload)}],
			structuredContent: payload,
		};
	} catch (error) {
		return {
			content: [
				{
					type: 'text' as const,
					text: error instanceof Error ? error.message : String(error),
				},
			],
			isError: true,
		};
	}
}
