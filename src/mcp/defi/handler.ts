import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';
import {
	CONTINUUM_DAO_GOVERNANCE_API,
	proposalCatalogCanonical,
	proposalCatalogDocument,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/continuum-dao';
import {MCP_NON_SUBMIT_TOOL_NAMES} from './catalog-adapter.js';
import {
	parseMcpToolInput,
	parseMcpToolOutput,
	parseMultisignBuilderOutput,
} from '@continuumdao/ctm-mpc-defi/agent';
import type {NodeSdkConfig} from '../../config/schema.js';
import {signAndSubmitMultiSignRequest} from '../../core/mpc/sign-request-body.js';
import {
	assertAgentCanSignManagementRequests,
	getManagementSigners,
	resolveManagementSignerOption,
	signManagementMessage,
} from '../../core/management-signer.js';
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
import {adaptAerodromeReadMcpInput, isAerodromeReadTool} from './aerodrome-read-input.js';
import {adaptCompoundV3ReadMcpInput, isCompoundV3ReadTool} from './compound-v3-input.js';
import {adaptTrueoReadMcpInput, isTrueoReadTool} from './trueo-input.js';
import {adaptMerklRewardsReadMcpInput, isMerklRewardsReadTool} from './merkl-input.js';
import {
	adaptContinuumDaoSimulateProposalMcpInput,
	isContinuumDaoProposalDraftTool,
} from './continuum-dao-input.js';
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
import {
	clearNodeForumSessionAfterSignOut,
	gateForumSignIn,
	gateForumWriteInput,
} from './forum-session-apply.js';
import {
	FORUM_SIGN_IN_MULTISIGN_TOOL,
	forumSignInNodeKeyPresent,
	isForumTicketWriteTool,
	withForumSignInNodeKey,
} from './forum-session-gate.js';
import {nodeId} from '../../core/general.js';
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

async function signDefaultEd25519Utf8(
	config: NodeSdkConfig,
	message: string,
): Promise<{signature: string; publicKey: string}> {
	const signers = await getManagementSigners(config);
	if (!signers.ok) {
		throw new Error(signers.reason);
	}
	const selected = await resolveManagementSignerOption(config, signers.data.signingOptions);
	if (!selected.ok) {
		throw new Error(selected.reason);
	}
	const deps = {
		keyRoot: config.node.mpcConfigPath,
		toMcpApiError: (reason: string) => new Error(reason),
	};
	await assertAgentCanSignManagementRequests(config, deps);
	const signature = await signManagementMessage(selected.data, message, {
		...deps,
		assertAgentCanSignManagementRequests: async () => undefined,
		config,
	});
	return {signature, publicKey: selected.data.value};
}

async function postProposalCatalog(
	config: NodeSdkConfig,
	payload: Record<string, unknown>,
	canonical: string,
): Promise<void> {
	const auth = await signDefaultEd25519Utf8(config, canonical);
	const res = await fetch(`${CONTINUUM_DAO_GOVERNANCE_API}/proposals/create`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			...payload,
			auth: {method: 'ed25519', signature: auth.signature, publicKey: auth.publicKey},
		}),
	});
	if (!res.ok) {
		throw new Error(`proposals/create: ${res.status} ${await res.text()}`);
	}
}

async function withRegisterProposalAuth(
	config: NodeSdkConfig,
	input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const configuration = input.configuration === 1 ? 1 : 0;
	const document = proposalCatalogDocument({
		onchainId: String(input.onchainId ?? ''),
		title: String(input.title ?? ''),
		description: String(input.description ?? ''),
		proposer: String(input.proposer ?? ''),
		forumKey: String(input.forumKey ?? ''),
		type: Number(input.type ?? 0),
		configuration,
		pendingOnChain: true,
		...(configuration === 1
			? {nWinners: Number(input.nWinners ?? 0), options: input.options as never}
			: {actions: input.actions as never}),
	});
	const canonical = proposalCatalogCanonical(document);
	const auth = await signDefaultEd25519Utf8(config, canonical);
	return {
		...document,
		auth: {method: 'ed25519' as const, signature: auth.signature, publicKey: auth.publicKey},
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
	} else if (isAerodromeReadTool(tool.name)) {
		const adapted = await adaptAerodromeReadMcpInput(
			config,
			tool.name,
			enrichedInput,
		);
		if (!adapted.ok) {
			return sdkResultToCallToolResult(adapted);
		}
		validationInput = adapted.data;
	} else if (isCompoundV3ReadTool(tool.name)) {
		const adapted = await adaptCompoundV3ReadMcpInput(
			config,
			tool.name,
			enrichedInput,
		);
		if (!adapted.ok) {
			return sdkResultToCallToolResult(adapted);
		}
		validationInput = adapted.data;
	} else if (isTrueoReadTool(tool.name)) {
		const adapted = await adaptTrueoReadMcpInput(config, tool.name, enrichedInput);
		if (!adapted.ok) {
			return sdkResultToCallToolResult(adapted);
		}
		validationInput = adapted.data;
	} else if (isMerklRewardsReadTool(tool.name)) {
		const adapted = await adaptMerklRewardsReadMcpInput(
			config,
			tool.name,
			enrichedInput,
		);
		if (!adapted.ok) {
			return sdkResultToCallToolResult(adapted);
		}
		validationInput = adapted.data;
	} else if (isContinuumDaoProposalDraftTool(tool.name)) {
		const adapted = await adaptContinuumDaoSimulateProposalMcpInput(
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
		if (tool.name === FORUM_SIGN_IN_MULTISIGN_TOOL) {
			const forumGate = await gateForumSignIn(
				config,
				enriched.data.executorAddress,
				multisignInput.forumUrl,
			);
			if (forumGate.kind === 'error') {
				return sdkResultToCallToolResult({ok: false, reason: forumGate.reason});
			}
			if (forumGate.kind === 'reuse') {
				return {
					content: [{type: 'text' as const, text: JSON.stringify(forumGate.payload)}],
					structuredContent: forumGate.payload,
				};
			}
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
		if (
			tool.name === FORUM_SIGN_IN_MULTISIGN_TOOL &&
			validationInput &&
			typeof validationInput === 'object' &&
			!Array.isArray(validationInput) &&
			!forumSignInNodeKeyPresent(validationInput as Record<string, unknown>)
		) {
			const id = await nodeId(config);
			if (!id.ok) {
				return sdkResultToCallToolResult(id);
			}
			validationInput = withForumSignInNodeKey(
				validationInput as Record<string, unknown>,
				id.data.nodeId,
			);
		}
	}

	if (
		isForumTicketWriteTool(tool.name) &&
		validationInput &&
		typeof validationInput === 'object' &&
		!Array.isArray(validationInput)
	) {
		const forumGate = await gateForumWriteInput(
			config,
			validationInput as Record<string, unknown>,
		);
		if (!forumGate.ok) {
			return sdkResultToCallToolResult(forumGate);
		}
		validationInput = forumGate.input;
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
			const handlerInput =
				tool.name === 'ctm_continuum_dao_register_proposal'
					? await withRegisterProposalAuth(config, parsedInput)
					: parsedInput;
			const result = await withTheGraphApiKeyFromNode(config, tool.name, async () =>
				withBitqueryApiKeyFromNode(config, tool.name, async () => handler(handlerInput)),
			);
			if (
				tool.name === 'ctm_continuum_dao_forum_sign_out' &&
				validationInput &&
				typeof validationInput === 'object' &&
				!Array.isArray(validationInput)
			) {
				const cleared = await clearNodeForumSessionAfterSignOut(
					config,
					validationInput as Record<string, unknown>,
				);
				if (!cleared.ok) {
					return sdkResultToCallToolResult(cleared);
				}
			}
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
		if (buildOut.proposalCatalog) {
			await postProposalCatalog(
				config,
				buildOut.proposalCatalog.payload,
				buildOut.proposalCatalog.canonical,
			);
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
