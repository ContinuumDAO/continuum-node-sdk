import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {MCP_NON_SUBMIT_TOOL_NAMES} from './catalog-adapter.js';
import {
	getMcpToolInputSchema,
	parseMcpToolInput,
	parseMcpToolOutput,
	parseMultisignBuilderOutput,
	type McpToolName,
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
import {
	adaptUniswapLiquidityListPositionsMcpInput,
	adaptUniswapLiquidityPrepMcpInput,
	isUniswapLiquidityListPositionsTool,
	isUniswapLiquidityPrepTool,
} from './uniswap-liquidity-input.js';
import {
	isUniswapRegisterPositionFromMintTxTool,
	isUniswapRegisterPositionNftTool,
	listUniswapV4PositionsFromTokenRegistryMcp,
	registerUniswapV4PositionFromMintTxMcp,
	registerUniswapV4PositionNftMcp,
} from './uniswap-liquidity-registry.js';
import {adaptCurveQuoteMcpInput, isCurveQuoteTool} from './curve-quote-input.js';
import {
	isAaveV4MultisignTool,
	mapAaveV4MultisignBuilderArgs,
	mergeAaveV4ParsedWithPrepared,
	prepareAaveV4MultisignValidationInput,
} from './aave-v4-input.js';
import {
	isMorphoMultisignTool,
	mapMorphoMultisignBuilderArgs,
	mergeMorphoParsedWithPrepared,
	prepareMorphoMultisignValidationInput,
} from './morpho-input.js';

const MULTISIGN_KEYGEN_ID_HINT =
	'keyGenId is required (from get_preferred_key_gen or the agent conversation KeyGen). Pass keyGenId + chainId + purposeText + useCustomGas. Do not pass rpcUrl, executorAddress, or keyGen — the server resolves them from the chain registry.';

function toolExpectsMultisignEnrichment(toolName: string): boolean {
	if (MCP_NON_SUBMIT_TOOL_NAMES.has(toolName)) return false;
	try {
		const schema = getMcpToolInputSchema(toolName as McpToolName);
		if (
			schema &&
			typeof schema === 'object' &&
			'shape' in schema &&
			typeof (schema as {shape?: Record<string, unknown>}).shape === 'object'
		) {
			return 'keyGen' in (schema as {shape: Record<string, unknown>}).shape;
		}
	} catch {
		return false;
	}
	return false;
}

function multisignAgentDefaults(input: Record<string, unknown>): {
	purposeText?: string;
	useCustomGas: boolean;
} {
	const purposeText = String(input.purposeText ?? input.purpose ?? '').trim();
	return {
		...(purposeText ? {purposeText} : {}),
		useCustomGas: Boolean(input.useCustomGas ?? false),
	};
}

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
	let aavePreparedFields: Record<string, unknown> | undefined;
	let morphoPreparedFields: Record<string, unknown> | undefined;
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
	} else if (isUniswapLiquidityPrepTool(tool.name)) {
		const adapted = await adaptUniswapLiquidityPrepMcpInput(
			config,
			tool.name,
			enrichedInput,
		);
		if (!adapted.ok) {
			return sdkResultToCallToolResult(adapted);
		}
		validationInput = adapted.data;
	} else if (isUniswapLiquidityListPositionsTool(tool.name)) {
		const adapted = await adaptUniswapLiquidityListPositionsMcpInput(
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
	} else if (toolExpectsMultisignEnrichment(tool.name)) {
		const keyGenId =
			typeof enrichedInput.keyGenId === 'string' && enrichedInput.keyGenId.trim()
				? enrichedInput.keyGenId.trim()
				: '';
		if (!keyGenId) {
			return sdkResultToCallToolResult({
				ok: false,
				reason: MULTISIGN_KEYGEN_ID_HINT,
			});
		}
		const enriched = await enrichMultisignContext(config, enrichedInput);
		if (!enriched.ok) {
			return sdkResultToCallToolResult(enriched);
		}
		const enrichedFields = {
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
		const agentDefaults = multisignAgentDefaults(enrichedInput);
		if (isAaveV4MultisignTool(tool.name)) {
			const prepared = await prepareAaveV4MultisignValidationInput(
				tool.name,
				enrichedInput,
				enriched.data,
			);
			if (!prepared.ok) {
				return sdkResultToCallToolResult(prepared);
			}
			aavePreparedFields = prepared.data;
			validationInput = {
				...agentDefaults,
				...prepared.data,
				...enrichedFields,
			};
		} else if (isMorphoMultisignTool(tool.name)) {
			const prepared = await prepareMorphoMultisignValidationInput(
				tool.name,
				enrichedInput,
				enriched.data,
			);
			if (!prepared.ok) {
				return sdkResultToCallToolResult(prepared);
			}
			morphoPreparedFields = prepared.data;
			validationInput = {
				...agentDefaults,
				...prepared.data,
				...enrichedFields,
			};
		} else {
			validationInput = {
				...agentDefaults,
				...enrichedInput,
				...enrichedFields,
			};
		}
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

	if (isUniswapLiquidityListPositionsTool(tool.name)) {
		const listed = await listUniswapV4PositionsFromTokenRegistryMcp(config, parsedInput);
		if (!listed.ok) {
			return sdkResultToCallToolResult(listed);
		}
		const validated = parseMcpToolOutput(tool.name as never, listed.data);
		return {
			content: [{type: 'text' as const, text: JSON.stringify(validated)}],
			structuredContent: validated as Record<string, unknown>,
		};
	}

	if (isUniswapRegisterPositionNftTool(tool.name)) {
		const registered = await registerUniswapV4PositionNftMcp(config, parsedInput);
		if (!registered.ok) {
			return sdkResultToCallToolResult(registered);
		}
		const validated = parseMcpToolOutput(tool.name as never, registered.data);
		return {
			content: [{type: 'text' as const, text: JSON.stringify(validated)}],
			structuredContent: validated as Record<string, unknown>,
		};
	}

	if (isUniswapRegisterPositionFromMintTxTool(tool.name)) {
		const registered = await registerUniswapV4PositionFromMintTxMcp(config, parsedInput);
		if (!registered.ok) {
			return sdkResultToCallToolResult(registered);
		}
		const validated = parseMcpToolOutput(tool.name as never, registered.data);
		return {
			content: [{type: 'text' as const, text: JSON.stringify(validated)}],
			structuredContent: validated as Record<string, unknown>,
		};
	}

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

		const protocolFields = isAaveV4MultisignTool(tool.name)
			? mapAaveV4MultisignBuilderArgs(
					tool.name,
					mergeAaveV4ParsedWithPrepared(parsedInput, aavePreparedFields),
					enriched.data,
				)
			: isMorphoMultisignTool(tool.name)
				? mapMorphoMultisignBuilderArgs(
						tool.name,
						mergeMorphoParsedWithPrepared(parsedInput, morphoPreparedFields),
					)
				: mapToolFieldsToBuilderArgs(
						tool.name,
						stripEnrichmentKeys(parsedInput),
					);

		const purposeText = String(parsedInput.purposeText ?? '').trim();
		const builderArgs = {
			...protocolFields,
			keyGen: enriched.data.keyGen,
			executorAddress: enriched.data.executorAddress,
			chainId: enriched.data.chainId,
			rpcUrl: enriched.data.rpcUrl,
			chainDetail: enriched.data.chainDetail,
			useCustomGas: enriched.data.useCustomGas,
			purposeText,
			...(enriched.data.customGasChainDetails
				? {customGasChainDetails: enriched.data.customGasChainDetails}
				: {}),
		};

		const built = await handler(builderArgs);
		const buildOut = parseMultisignBuilderOutput(built);

		const submitted = await signAndSubmitMultiSignRequest(
			config,
			buildOut.bodyForSign,
		);
		if (!submitted.ok) {
			return sdkResultToCallToolResult(submitted);
		}

		const payload: Record<string, unknown> = {requestId: submitted.data.requestId};
		if (tool.name === 'ctm_uniswap_v4_build_mint_liquidity_multisign') {
			payload.followUp =
				'After the batch executes, call ctm_uniswap_v4_register_position_from_mint_tx with the mint step transaction hash so agents can list and manage the new position via lp_list_positions.';
		}
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
