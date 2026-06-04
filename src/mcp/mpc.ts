import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import type {NodeSdkConfig} from '../config/schema.js';
import {getMultiSignGasOptions} from '../core/mpc/gas-options.js';
import {registerKeyGenOnLinea} from '../core/mpc/register-keygen.js';
import {
	getMpaWalletStatus,
	createMpaTopUpMultiSignRequest,
} from '../core/mpc/mpa-top-up.js';
import {transferNativeGas} from '../core/mpc/transfer-native.js';
import {
	transferErc20,
	transferErc721,
	transferCtmErc20,
	transferCtmErc20CrossChain,
} from '../core/mpc/transfer-tokens.js';
import {createComposeMultiSignRequest} from '../core/mpc/compose-request.js';
import {createForgeMultiSignRequest} from '../core/mpc/forge-request.js';
import {createJoinedMultiSignRequest} from '../core/mpc/join-multisign-request.js';
import {
	listSignRequestsReady,
	waitForSignRequestReady,
} from '../core/mpc/list-ready.js';
import {triggerSignResult} from '../core/mpc/trigger-sign-result.js';
import {getSignResultSummary} from '../core/mpc/get-sign-result-summary.js';
import {
	summarizeSignRequestForAgent,
	summarizeSignRequestsForAgent,
	summarizeSignResultForAgent,
} from '../core/mpc/sign-result-summary.js';
import {broadcastSignResult} from '../core/mpc/broadcast-sign-result.js';
import {bumpOrCancelSignResult} from '../core/mpc/bump-sign-result.js';
import {mpcGetSignResultById} from '../core/mpc/client.js';
import {DEFAULT_MANAGEMENT_SIGNING} from '../core/management-signer.js';
import {nodeId} from '../core/general.js';
import {
	getSignRequestById,
	listSignRequests,
	listSignRequestsAwaitingJoin,
	shelveSignRequest,
	signRequestAgree,
} from '../core/mpc/sign-request-lifecycle.js';
import {
	getSignRequestStatus,
	txParamsFromGetSignRequestIdData,
} from '../core/mpc/sign-request-utils.js';
import {
	BroadcastSignResultInputSchema,
	BroadcastSignResultOutputSchema,
	BumpSignResultInputSchema,
	CreateComposeInputSchema,
	CreateForgeInputSchema,
	JoinMultiSignRequestsInputSchema,
	CreateMultiSignRequestResultSchema,
	GetSignRequestByIdInputSchema,
	GetSignRequestStatusInputSchema,
	SignRequestExecuteStatusSchema,
	ListReadyInputSchema,
	ListSignRequestsInputSchema,
	MpaTopUpInputSchema,
	MpaWalletStatusSchema,
	ProposalTxParamsSchema,
	RegisterKeyGenInputSchema,
	ShelveSignRequestInputSchema,
	SignRequestAgreeInputSchema,
	TransferC3InputSchema,
	TransferErc20InputSchema,
	TransferErc721InputSchema,
	TransferNativeInputSchema,
	TriggerSignResultInputSchema,
	TriggerSignResultOutputSchema,
	TxParamsFromGetSignRequestIdDataInputSchema,
	GetMultiSignGasOptionsInputSchema,
	GetMultiSignGasOptionsOutputSchema,
	GetSignResultSummaryInputSchema,
	SignRequestSummarySchema,
	SignRequestJoinAgreementCheckSchema,
	SignResultSummarySchema,
	WaitReadyInputSchema,
	KeyGenIdSchema,
} from '../core/mpc/schemas.js';
import {camelToSnake, sdkResultToCallToolResult, wrapSdk} from './tool-utils.js';
import {
	MULTISIGN_CREATE_GAS_GUIDANCE,
	TRIGGER_SIGN_GAS_GUIDANCE,
	BROADCAST_SIGN_RESULT_GUIDANCE,
} from './mpc-gas-docs.js';

async function localNodeIdForSummaries(
	config: NodeSdkConfig,
): Promise<string | undefined> {
	const self = await nodeId(config);
	return self.ok ? self.data.nodeId : undefined;
}

export function registerMpcTools(server: McpServer, config: NodeSdkConfig): void {
	server.registerTool(
		camelToSnake('getMultiSignGasOptions'),
		{
			description:
				'Resolve Custom Gas Config and Get Sig fee tier choices for a chain and/or sign request. Use before creating multiSignRequest (useCustomGas true|false) and before trigger_sign_result (feeSpeedTier). Returns chainRegistryCustomGas, defaultGetSigFeeSpeed, proposalUsedCustomGas when requestId is set, and guidance for create/trigger inputs.',
			inputSchema: GetMultiSignGasOptionsInputSchema,
			outputSchema: GetMultiSignGasOptionsOutputSchema,
		},
		async input => wrapSdk(getMultiSignGasOptions(config, input)),
	);

	server.registerTool(
		camelToSnake('registerKeyGenOnLinea'),
		{
			description: `Register KeyGen with MultiSignAgentWallet on Linea (59144). ${MULTISIGN_CREATE_GAS_GUIDANCE}`,
			inputSchema: RegisterKeyGenInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(registerKeyGenOnLinea(config, input)),
	);

	server.registerTool(
		camelToSnake('getMpaWalletStatus'),
		{
			description: 'Read MPA wallet registration and signing credits for a KeyGen.',
			inputSchema: z.object({keyGenId: KeyGenIdSchema}).strict(),
			outputSchema: MpaWalletStatusSchema,
		},
		async ({keyGenId}: {keyGenId: string}) =>
			wrapSdk(getMpaWalletStatus(config, {keyGenId})),
	);

	server.registerTool(
		camelToSnake('createMpaTopUpMultiSignRequest'),
		{
			description:
				`Create batch multiSignRequest (approve + deposit) to top up MPA credits on Linea. Fee token must be on KeyGen executor. ${MULTISIGN_CREATE_GAS_GUIDANCE}`,
			inputSchema: MpaTopUpInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(createMpaTopUpMultiSignRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('transferNativeGas'),
		{
			description:
				`Send native chain currency (ETH or gas token) to an EVM address via POST /multiSignRequest. Use for gas/top-ups, not ERC-20/721 tokens. Resolve keyGenId with get_preferred_key_gen; recipient via toContactName (address book name, preferred) or toAddress; chainId with get_chain_registry (chain must have rpcGateway). amountWei is the value in wei as a decimal string. Executor must hold enough native balance for value plus gas. ${MULTISIGN_CREATE_GAS_GUIDANCE} Returns { requestId }.`,
			inputSchema: TransferNativeInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferNativeGas(config, input)),
	);

	server.registerTool(
		camelToSnake('transferErc20'),
		{
			description:
				`Send standard ERC-20 tokens via POST /multiSignRequest (transfer(address,uint256)). Preferred tool for sends to named contacts on named chains. Use chainName from get_chain_registry instead of guessing chainId; toContactName instead of toAddress; tokenSymbol instead of tokenAddress; amount instead of amountWei when decimals are in the registry. ${MULTISIGN_CREATE_GAS_GUIDANCE} Returns { requestId } — use this value directly.`,
			inputSchema: TransferErc20InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferErc20(config, input)),
	);

	server.registerTool(
		camelToSnake('transferErc721'),
		{
			description:
				`Send an ERC-721 NFT via POST /multiSignRequest (transferFrom(address,address,uint256)). Resolve keyGenId with get_preferred_key_gen; token contract and tokenId from get_token_registry (tokenType ERC721); recipient via toContactName (preferred) or toAddress; chainId from get_chain_registry. fromAddress defaults to the KeyGen executor when omitted. ${MULTISIGN_CREATE_GAS_GUIDANCE} Returns { requestId }.`,
			inputSchema: TransferErc721InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferErc721(config, input)),
	);

	server.registerTool(
		camelToSnake('transferCtmErc20'),
		{
			description:
				`Send same-chain Continuum CTM ERC-20 tokens via POST /multiSignRequest (transfer(address,uint256)). Use when get_token_registry lists tokenType CTMERC20; for standard ERC20 use transfer_erc20 instead. Same inputs as transfer_erc20: resolve keyGenId, toAddress, tokenAddress, decimals, and chainId from registry tools; amountWei in smallest units as a decimal string. ${MULTISIGN_CREATE_GAS_GUIDANCE} Returns { requestId }.`,
			inputSchema: TransferErc20InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferCtmErc20(config, input)),
	);

	server.registerTool(
		camelToSnake('transferCtmErc20CrossChain'),
		{
			description:
				`Move Continuum CTM tokens cross-chain via POST /multiSignRequest (c3transfer(string,uint256,string)). Use for bridging CTM tokens to another chain, not same-chain sends (use transfer_ctm_erc20 or transfer_erc20). toStr is the destination address or identifier; toChainIdStr is the destination chain id as a string; amountWei in smallest units. Resolve token and source chain from get_token_registry and get_chain_registry. ${MULTISIGN_CREATE_GAS_GUIDANCE} Returns { requestId }.`,
			inputSchema: TransferC3InputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(transferCtmErc20CrossChain(config, input)),
	);

	server.registerTool(
		camelToSnake('createComposeMultiSignRequest'),
		{
			description: `Create multiSignRequest from compose actions (single or batch). ${MULTISIGN_CREATE_GAS_GUIDANCE}`,
			inputSchema: CreateComposeInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(createComposeMultiSignRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('createForgeMultiSignRequest'),
		{
			description: `Create multiSignRequest from Foundry broadcast JSON. ${MULTISIGN_CREATE_GAS_GUIDANCE}`,
			inputSchema: CreateForgeInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(createForgeMultiSignRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('createJoinedMultiSignRequest'),
		{
			description:
				`Join two multiSignRequest payloads (compose, Foundry, or prior join helper output) into one batch POST /multiSignRequest on the same chain. Reassigns nonces consecutively from firstNonce; gas/fees are preserved from each input. Both inputs must use the same keyList/pubKey. Chain longer sequences by feeding prior join output as payloadA or payloadB. ${MULTISIGN_CREATE_GAS_GUIDANCE} Returns { requestId }.`,
			inputSchema: JoinMultiSignRequestsInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(createJoinedMultiSignRequest(config, input)),
	);

	server.registerTool(
		camelToSnake('listSignRequests'),
		{
			description:
				'List sign requests with optional filter and pagination (default pagesize 20, max 50). filter: all, live, pending, success, blocked, shelved. For Join-tab Accept/Reject discovery use list_sign_requests_awaiting_join instead — new requests are usually status live, not pending. Summaries include localAgreementPending when node id is available. Join agreement uses ClientSigs, not SigList.',
			inputSchema: ListSignRequestsInputSchema,
			outputSchema: z
				.object({
					requests: z.array(SignRequestSummarySchema),
					total: z.number().optional(),
				})
				.strict(),
		},
		async input => {
			const result = await listSignRequests(config, input);
			if (!result.ok) {
				return sdkResultToCallToolResult(result);
			}
			const localNodeId = await localNodeIdForSummaries(config);
			return sdkResultToCallToolResult({
				ok: true,
				data: {
					requests: summarizeSignRequestsForAgent(
						result.data.requests,
						localNodeId,
					),
					total: result.data.total,
				},
			});
		},
	);

	server.registerTool(
		camelToSnake('listSignRequestsAwaitingJoin'),
		{
			description:
				'List sign requests on the Join tab awaiting Accept/Reject (same as the node app: merges listSignRequests live + pending, keeps rows where this node is in KeyList). Check joinAgreementChecks.localAgreementPending or summary.localAgreementPending — true means call sign_request_agree. Join agreement is tracked in ClientSigs, not SigList.',
			inputSchema: z.object({}).strict(),
			outputSchema: z
				.object({
					localNodeId: z.string(),
					requests: z.array(SignRequestSummarySchema),
					joinAgreementChecks: z.array(SignRequestJoinAgreementCheckSchema),
				})
				.strict(),
		},
		async () => {
			const result = await listSignRequestsAwaitingJoin(config);
			if (!result.ok) {
				return sdkResultToCallToolResult(result);
			}
			return sdkResultToCallToolResult({
				ok: true,
				data: {
					localNodeId: result.data.localNodeId,
					requests: summarizeSignRequestsForAgent(
						result.data.requests,
						result.data.localNodeId,
					),
					joinAgreementChecks: result.data.joinAgreementChecks,
				},
			});
		},
	);

	server.registerTool(
		camelToSnake('getSignRequestById'),
		{
			description:
				'Fetch a sign request by ID. Default compact summary (no messageRaw). Set compact:false for full record; txParams:true returns tx params only.',
			inputSchema: GetSignRequestByIdInputSchema,
		},
		async input => {
			const parsed = GetSignRequestByIdInputSchema.safeParse(input);
			if (!parsed.success) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: 'Invalid get sign request by id input.',
				});
			}
			if (parsed.data.txParams) {
				const detail = await getSignRequestById(config, parsed.data);
				if (!detail.ok) {
					return sdkResultToCallToolResult(detail);
				}
				const txParams = txParamsFromGetSignRequestIdData(detail.data);
				if (txParams == null) {
					return sdkResultToCallToolResult({
						ok: false,
						reason: 'Could not parse tx params from sign request detail.',
					});
				}
				return sdkResultToCallToolResult({ok: true, data: txParams});
			}
			const detail = await getSignRequestById(config, parsed.data);
			if (!detail.ok) {
				return sdkResultToCallToolResult(detail);
			}
			if (parsed.data.compact === false) {
				return sdkResultToCallToolResult({
					ok: true,
					data: detail.data as Record<string, unknown>,
				});
			}
			const localNodeId = await localNodeIdForSummaries(config);
			return sdkResultToCallToolResult({
				ok: true,
				data: summarizeSignRequestForAgent(
					detail.data as Record<string, unknown>,
					localNodeId,
				),
			});
		},
	);

	server.registerTool(
		camelToSnake('getSignResultSummary'),
		{
			description:
				'Compact sign-result readiness for broadcast. executedOnChain false + readyToBroadcast true means Get Sig done but not yet broadcast — call broadcast_sign_result. lifecycleStatus on the sign request is separate (quorum agreed).',
			inputSchema: GetSignResultSummaryInputSchema,
			outputSchema: z
				.object({
					requestId: z.string(),
					signResultSummary: SignResultSummarySchema,
				})
				.strict(),
		},
		async input => wrapSdk(getSignResultSummary(config, input)),
	);

	server.registerTool(
		camelToSnake('signRequestAgree'),
		{
			description:
				'Agree to or reject a multi-agree sign request (Ed25519 management signing). Before calling: ask the user "Any thoughts to attach?" and wait for their reply — pass their answer in thoughts (max 256 chars) or omit/empty if they decline. Do not call without that prompt.',
			inputSchema: SignRequestAgreeInputSchema,
			outputSchema: z.object({message: z.string()}).strict(),
		},
		async input =>
			wrapSdk(signRequestAgree(config, input, DEFAULT_MANAGEMENT_SIGNING)),
	);

	server.registerTool(
		camelToSnake('shelveSignRequest'),
		{
			description:
				'Shelve a sign request (originator only; Ed25519 management signing). Before Get Sig: POST /shelveSignRequest. After Get Sig when a signature exists: POST /updateSignResultStatusById with status shelved (matches node app Shelve button). Idempotent when already shelved.',
			inputSchema: ShelveSignRequestInputSchema,
			outputSchema: z.object({message: z.string()}).strict(),
		},
		async ({requestId}: {requestId: string}) =>
			wrapSdk(
				shelveSignRequest(config, {requestId}, DEFAULT_MANAGEMENT_SIGNING),
			),
	);

	server.registerTool(
		camelToSnake('txParamsFromGetSignRequestIdData'),
		{
			description:
				'Parse tx params from GET /getSignRequestById data for a sign request.',
			inputSchema: TxParamsFromGetSignRequestIdDataInputSchema,
			outputSchema: z.object({txParams: ProposalTxParamsSchema}).strict(),
		},
		async input => {
			const detail = await getSignRequestById(config, input);
			if (!detail.ok) {
				return sdkResultToCallToolResult(detail);
			}
			const txParams = txParamsFromGetSignRequestIdData(detail.data);
			if (txParams == null) {
				return sdkResultToCallToolResult({
					ok: false,
					reason: 'Could not parse tx params from sign request detail.',
				});
			}
			return sdkResultToCallToolResult({ok: true, data: {txParams}});
		},
	);

	server.registerTool(
		camelToSnake('getSignRequestStatus'),
		{
			description:
				'Combined lifecycle + Execute readiness for a sign request. lifecycleStatus "success" means MPC quorum agreed — NOT on-chain executed. Check executedOnChain and readyToBroadcast before broadcast_sign_result.',
			inputSchema: GetSignRequestStatusInputSchema,
			outputSchema: SignRequestExecuteStatusSchema,
		},
		async ({requestId}: {requestId: string}) => {
			const detail = await getSignRequestById(config, {requestId});
			if (!detail.ok) {
				return sdkResultToCallToolResult(detail);
			}
			const reqSummary = summarizeSignRequestForAgent(
				detail.data as Record<string, unknown>,
			);
			const signResult = await mpcGetSignResultById(config, requestId);
			const signResultSummary = signResult.ok
				? summarizeSignResultForAgent(signResult.data)
				: null;
			const executedOnChain = Boolean(signResultSummary?.executedOnChain);
			const readyToBroadcast = Boolean(signResultSummary?.readyToBroadcast);
			const transactionHashes = signResultSummary?.transactionHashes;
			return sdkResultToCallToolResult({
				ok: true,
				data: {
					requestId,
					lifecycleStatus: getSignRequestStatus(
						detail.data as Record<string, unknown>,
					),
					getSigTriggered: Boolean(reqSummary.getSigTriggered),
					signResultAvailable: signResult.ok,
					hasSignature: Boolean(signResultSummary?.hasSignature),
					executedOnChain,
					readyToBroadcast,
					readyToExecute: readyToBroadcast,
					signResultStatus:
						typeof signResultSummary?.signResultStatus === 'string'
							? signResultSummary.signResultStatus
							: undefined,
					...(Array.isArray(transactionHashes) && transactionHashes.length > 0
						? {transactionHashes}
						: {}),
					destinationChainId:
						typeof reqSummary.destinationChainId === 'string'
							? reqSummary.destinationChainId
							: undefined,
				},
			});
		},
	);

	server.registerTool(
		camelToSnake('listSignRequestsReady'),
		{
			description:
				'List sign requests ready for Get Sig / Execute (compact summaries). Prefer get_sign_result_summary + broadcast_sign_result for Execute.',
			inputSchema: ListReadyInputSchema,
			outputSchema: z.object({requests: z.array(SignRequestSummarySchema)}).strict(),
		},
		async input => {
			const result = await listSignRequestsReady(config, input);
			if (!result.ok) {
				return sdkResultToCallToolResult(result);
			}
			return sdkResultToCallToolResult({
				ok: true,
				data: {requests: summarizeSignRequestsForAgent(result.data.requests)},
			});
		},
	);

	server.registerTool(
		camelToSnake('waitForSignRequestReady'),
		{
			description: 'Poll until a sign request appears in the ready list.',
			inputSchema: WaitReadyInputSchema,
			outputSchema: z
				.object({
					ready: z.boolean(),
					detail: SignRequestSummarySchema.optional(),
				})
				.strict(),
		},
		async input => {
			const result = await waitForSignRequestReady(config, input);
			if (!result.ok) {
				return sdkResultToCallToolResult(result);
			}
			const detail = result.data.detail;
			return sdkResultToCallToolResult({
				ok: true,
				data: {
					ready: result.data.ready,
					...(detail != null && typeof detail === 'object'
						? {
								detail: summarizeSignRequestForAgent(
									detail as Record<string, unknown>,
								),
							}
						: {}),
				},
			});
		},
	);

	server.registerTool(
		camelToSnake('triggerSignResult'),
		{
			description:
				`Get Sig: trigger MPC signing via POST /triggerSignRequestById with fresh nonce/gas (does not broadcast). Originator-only — before calling, get_sign_request_by_id and confirm the Purpose map key equals node_id on this node; if they differ, this node agreed but cannot Get Sig (use sign_request_agree on peers; trigger only on the originator). Requires MPC quorum reached (list_sign_requests_ready or wait_for_sign_request_ready). Signs with Ed25519 management key, posts trigger, polls getSignResultById up to ~2 minutes. ${TRIGGER_SIGN_GAS_GUIDANCE} Returns { requestId, signResultSummary }; then broadcast_sign_result to execute on-chain.`,
			inputSchema: TriggerSignResultInputSchema,
			outputSchema: TriggerSignResultOutputSchema,
		},
		async input => wrapSdk(triggerSignResult(config, input)),
	);

	server.registerTool(
		camelToSnake('broadcastSignResult'),
		{
			description: `Execute: broadcast signed tx(s) and mark sign result executed. ${BROADCAST_SIGN_RESULT_GUIDANCE}`,
			inputSchema: BroadcastSignResultInputSchema,
			outputSchema: BroadcastSignResultOutputSchema,
		},
		async input => wrapSdk(broadcastSignResult(config, input)),
	);

	server.registerTool(
		camelToSnake('bumpOrCancelSignResult'),
		{
			description:
				'Bump or cancel stuck pending txs by creating a new multiSignRequest.',
			inputSchema: BumpSignResultInputSchema,
			outputSchema: CreateMultiSignRequestResultSchema,
		},
		async input => wrapSdk(bumpOrCancelSignResult(config, input)),
	);
}
