/**
 * Browser-safe @continuumdao/continuum-node-sdk surface for Next.js client bundles.
 * No node:fs / node:crypto / management-signer imports.
 */
export {
	buildAttachVeCtmMultiSignBody,
	buildClaimNodeWithdrawAuthorityMultiSignBody,
	buildRequestVeCtmDetachMultiSignBody,
	claimNodeWithdrawAuthorityBrowser,
	getVeCtmAttachStatus,
	isVeCtmLiveOnFeeContract,
	encodeNodeInfoTupleValue,
	buildNodeAuthorityClaimTypedData,
	ATTACH_VECTM_SIGNATURE,
	VECTM_NODE_INFO_TUPLE,
	type VeCtmNodeInfo,
} from './core/mpc/mpa-authority-vectm-browser.js';

export {buildMultiSignProposalBody} from './evm/proposal-body.js';

export {
	applyEstimateGasHeadroom,
	gasLimitFromEstimateAndChainConfig,
} from './evm/tx-params.js';
export {
	estimateEvmBatchGasLimits,
	estimateEvmBatchGasLimitsWithClient,
	EvmBatchGasSimulateRevertError,
	finalizeEvmLegGasLimit,
	clearEvmSimulateSupportCache,
	EVM_BATCH_GAS_DEFAULT_FLOOR,
	EVM_NATIVE_TRANSFER_GAS,
	type EvmBatchGasLeg,
	type EvmBatchGasRpc,
	type EstimateEvmBatchGasResult,
} from './evm/estimate-batch-gas.js';
export {resolveGetSigLegGasFloor} from './evm/get-sig-protocol-gas-floor.js';
export {
	MPA_COMPOSE_BATCH_FALLBACK_GAS,
	mpaComposeBatchFallbackGasRaw,
	mpaSignatureFromCalldata,
	composeSignatureFromSignatureText,
} from './evm/mpa-batch-gas-floors.js';

export {
	fetchKeyGenResult,
	fetchGlobalNonceByKeyGenId,
	getKeyGenParentGroupId,
} from './core/keygen-read.js';

export {
	getChainRegistry,
	resolveChainRegistryEntry,
	resolveChainRegistryByQuery,
} from './core/registry/networks-read.js';

export type {NodeSdkConfig} from './config/schema.js';
export type {SdkResult} from './core/result.js';
