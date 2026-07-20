import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {MCP_NON_SUBMIT_TOOL_NAMES} from './catalog-adapter.js';
import {
	parseMcpToolInput,
	parseMcpToolOutput,
	parseMultisignBuilderOutput,
} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../config/schema.js';
import {signAndSubmitMultiSignRequest} from '../../core/mpc/sign-request-body.js';
import {sdkResultToCallToolResult} from '../tool-utils.js';
import type {DefiProtocolContext} from './context.js';
import {importDefiHandler} from './import-map.js';
import {
	enrichMultisignContext,
	mapToolFieldsToBuilderArgs,
	normalizeMultisignAgentInput,
	stripEnrichmentKeys,
} from './input-adapter.js';
import {defiMultisignExpiryUnixSeconds} from '@continuumdao/ctm-mpc-defi/core';
import {parseAgentBoolean} from '@continuumdao/ctm-mpc-defi/agent';
import {injectUniswapApiKeyForTool} from './uniswap-api-key.js';
import {injectVeniceApiKeyForTool} from './venice-api-key.js';
import {
	formatTheGraphToolErrorIfRateLimited,
	withTheGraphApiKeyFromNode,
} from './the-graph-api-key.js';
import {
	formatBitqueryToolErrorIfAuth,
	withBitqueryApiKeyFromNode,
} from './bitquery-api-key.js';
import {adaptUniswapQuoteMcpInput, isUniswapQuoteTool} from './uniswap-quote-input.js';
import {
	eip712MultisignEnrichedFields,
	eip712MultisignFollowUp,
	eip712MultisignKeyGenHint,
	shouldStripCustomGasForMultisignBuild,
} from './eip712-multisign.js';
import {
	isUniswapLimitOrderMultisignTool,
	orderDeadlineFromLimitQuote,
} from './uniswap-limit-order-input.js';
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
import {
	isEulerV2MultisignTool,
	mapEulerV2MultisignBuilderArgs,
	mergeEulerV2ParsedWithPrepared,
	prepareEulerV2MultisignValidationInput,
} from './euler-v2-input.js';
const MULTISIGN_KEYGEN_ID_HINT =
	'keyGenId is required (from get_preferred_key_gen or the agent conversation KeyGen). Pass keyGenId + chainId + purposeText + useCustomGas. Do not pass rpcUrl, executorAddress, or keyGen — the server resolves them from the chain registry.';

function toolExpectsMultisignEnrichment(toolName: string): boolean {
	// Submit multisign builders (not quote/prep tools) always enrich keyGenId → keyGen/rpcUrl/…
	return !MCP_NON_SUBMIT_TOOL_NAMES.has(toolName) && toolName.endsWith('_multisign');
}

function multisignAgentDefaults(
	input: Record<string, unknown>,
	stripCustomGas = false,
): {
	purposeText?: string;
	useCustomGas: boolean;
} {
	const purposeText = String(input.purposeText ?? input.purpose ?? '').trim();
	return {
		...(purposeText ? {purposeText} : {}),
		useCustomGas: stripCustomGas
			? false
			: parseAgentBoolean(input.useCustomGas, false),
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

	const veniceKeyInjection = await injectVeniceApiKeyForTool(
		config,
		tool.name,
		uniswapKeyInjection.input,
	);
	if (!veniceKeyInjection.ok) {
		return veniceKeyInjection.result;
	}

	let validationInput: unknown = veniceKeyInjection.input;
	let aavePreparedFields: Record<string, unknown> | undefined;
	let morphoPreparedFields: Record<string, unknown> | undefined;
	let eulerPreparedFields: Record<string, unknown> | undefined;
	const enrichedInput = veniceKeyInjection.input;

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
		const multisignInput = normalizeMultisignAgentInput(enrichedInput);
		const keyGenId =
			typeof multisignInput.keyGenId === 'string' && multisignInput.keyGenId.trim()
				? multisignInput.keyGenId.trim()
				: '';
		if (!keyGenId) {
			const eip712Hint = eip712MultisignKeyGenHint(tool.name);
			return sdkResultToCallToolResult({
				ok: false,
				reason: eip712Hint ?? MULTISIGN_KEYGEN_ID_HINT,
			});
		}
		const stripCustomGas = shouldStripCustomGasForMultisignBuild(tool.name, multisignInput);
		const enriched = await enrichMultisignContext(
			config,
			stripCustomGas ? {...multisignInput, useCustomGas: false} : multisignInput,
		);
		if (!enriched.ok) {
			return sdkResultToCallToolResult(enriched);
		}
		const enrichedFields = stripCustomGas
			? eip712MultisignEnrichedFields(enriched.data)
			: {
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
		const agentDefaults = multisignAgentDefaults(multisignInput, stripCustomGas);
		if (isAaveV4MultisignTool(tool.name)) {
			const prepared = await prepareAaveV4MultisignValidationInput(
				tool.name,
				multisignInput,
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
				multisignInput,
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
		} else if (isEulerV2MultisignTool(tool.name)) {
			const prepared = await prepareEulerV2MultisignValidationInput(
				config,
				tool.name,
				multisignInput,
				enriched.data,
			);
			if (!prepared.ok) {
				return sdkResultToCallToolResult(prepared);
			}
			eulerPreparedFields = prepared.data;
			validationInput = {
				...agentDefaults,
				...prepared.data,
				...enrichedFields,
			};
		} else {
			validationInput = {
				...agentDefaults,
				...multisignInput,
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
			const result = await withTheGraphApiKeyFromNode(config, tool.name, async () =>
				withBitqueryApiKeyFromNode(config, tool.name, async () => handler(parsedInput)),
			);
			const validated = parseMcpToolOutput(tool.name as never, result);
			return {
				content: [{type: 'text' as const, text: JSON.stringify(validated)}],
				structuredContent: validated as Record<string, unknown>,
			};
		}

		const stripCustomGas = shouldStripCustomGasForMultisignBuild(tool.name, parsedInput);
		const enriched = await enrichMultisignContext(
			config,
			stripCustomGas ? {...parsedInput, useCustomGas: false} : parsedInput,
		);
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
				: isEulerV2MultisignTool(tool.name)
					? mapEulerV2MultisignBuilderArgs(
							tool.name,
							mergeEulerV2ParsedWithPrepared(parsedInput, eulerPreparedFields),
						)
					: mapToolFieldsToBuilderArgs(
							tool.name,
							stripEnrichmentKeys(parsedInput),
						);

		const purposeText = String(parsedInput.purposeText ?? '').trim();
		const limitOrderQuoteDeadline = isUniswapLimitOrderMultisignTool(tool.name)
			? orderDeadlineFromLimitQuote(parsedInput.fullLimitQuote)
			: undefined;
		const explicitExpiry =
			typeof parsedInput.expiryDate === 'number' && parsedInput.expiryDate > 0
				? parsedInput.expiryDate
				: limitOrderQuoteDeadline;
		const expiryDate = defiMultisignExpiryUnixSeconds(tool.protocolId, explicitExpiry);
		const builderArgs = {
			...protocolFields,
			keyGen: enriched.data.keyGen,
			executorAddress: enriched.data.executorAddress,
			chainId: enriched.data.chainId,
			rpcUrl: enriched.data.rpcUrl,
			chainDetail: enriched.data.chainDetail,
			...(stripCustomGas
				? {}
				: {
						useCustomGas: enriched.data.useCustomGas,
						...(enriched.data.customGasChainDetails
							? {customGasChainDetails: enriched.data.customGasChainDetails}
							: {}),
					}),
			purposeText,
			...(expiryDate != null ? {expiryDate} : {}),
		};

		const built = await handler(builderArgs);
		const buildOut = parseMultisignBuilderOutput(built);
		if (expiryDate != null && buildOut.bodyForSign.expiryDate == null) {
			buildOut.bodyForSign.expiryDate = expiryDate;
		}

		const submitted = await signAndSubmitMultiSignRequest(
			config,
			buildOut.bodyForSign,
		);
		if (!submitted.ok) {
			return sdkResultToCallToolResult(submitted);
		}

		const lifecycleFollowUp =
			'Do not call this build tool again. Join agreement may take days — do not poll wait_for_sign_request_ready. When ready: sign_request_agree → trigger_sign_result → broadcast_sign_result.';
		const eip712FollowUp = eip712MultisignFollowUp(tool.name, buildOut.bodyForSign);
		const payload: Record<string, unknown> = {
			requestId: submitted.data.requestId,
			status: 'submitted',
			followUp:
				eip712FollowUp ??
				(tool.name === 'ctm_uniswap_v4_build_mint_liquidity_multisign'
					? `${lifecycleFollowUp} After execute: ctm_uniswap_v4_register_position_from_mint_tx with the mint tx hash.`
					: lifecycleFollowUp),
		};
		if (tool.name === 'ctm_cctp_build_burn_multisign') {
			try {
				const cctpFeeSummaryFromBodyForSign = (await importDefiHandler(
					'protocols/evm/circle-cctp',
					'cctpFeeSummaryFromBodyForSign',
				)) as (body: Record<string, unknown>) => Record<string, unknown> | null;
				const fees = cctpFeeSummaryFromBodyForSign(buildOut.bodyForSign);
				if (fees) {
					payload.fees = fees;
				}
			} catch {
				// Non-fatal: requestId is still the success signal.
			}
		}
		return {
			content: [{type: 'text' as const, text: JSON.stringify(payload)}],
			structuredContent: payload,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const graphHint = formatTheGraphToolErrorIfRateLimited(tool.name, message);
		const bitqueryHint = formatBitqueryToolErrorIfAuth(tool.name, message);
		const multisignRetryHint = MCP_NON_SUBMIT_TOOL_NAMES.has(tool.name)
			? ''
			: ' If unsure whether a request was already created, call list_sign_requests before retrying this build tool.';
		return {
			content: [
				{
					type: 'text' as const,
					text: (graphHint ?? bitqueryHint ?? message + multisignRetryHint),
				},
			],
			isError: true,
		};
	}
}
