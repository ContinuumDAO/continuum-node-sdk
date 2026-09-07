import {AAVE_V4_SPOKE_SUPPLY_DEFAULT_GAS_UNITS, isAaveV4DepositEvmSignRequest} from '@continuumdao/ctm-mpc-defi/protocols/evm/aave-v4';
import {
	CCTP_DEPOSIT_FOR_BURN_FALLBACK_GAS,
	isCctpBurnEvmSignRequest,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/circle-cctp';
import {CURVE_ROUTER_EXCHANGE_DEFAULT_GAS_UNITS, isCurveDaoSwapEvmSignRequest} from '@continuumdao/ctm-mpc-defi/protocols/evm/curve-dao';
import {ETHENA_SUSDE_DEPOSIT_GET_SIG_GAS_FALLBACK, isEthenaSusdeDepositBatchStep} from '@continuumdao/ctm-mpc-defi/protocols/evm/ethena';
import {isLidoBatchStepEvmSignRequest, LIDO_REQUEST_WITHDRAWALS_FALLBACK_GAS_UNITS} from '@continuumdao/ctm-mpc-defi/protocols/evm/lido';
import {
	isSkyLockstakeIsolationEstimateGasFragileBatchStep,
	SKY_LOCKSTAKE_MULTICALL_FALLBACK_GAS,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/sky';
import {
	isUniswapV4LiquidityEvmSignRequest,
	isUniswapV4SwapEvmSignRequest,
	UNISWAP_UNIVERSAL_ROUTER_DEFAULT_GAS_UNITS,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/uniswap-v4';
import {getSignatureTextForDetail} from '../core/mpc/sign-request-utils.js';
import {
	composeSignatureFromSignatureText,
	mpaComposeBatchFallbackGasRaw,
	mpaSignatureFromCalldata,
} from './mpa-batch-gas-floors.js';

/**
 * Raw protocol/selector floor for Get Sig (no 20% headroom). Used only when sequential
 * sim / isolated estimateGas cannot produce a live number, or as a minimum under a live number.
 */
export function resolveGetSigLegGasFloor(
	detail: Record<string, unknown>,
	index: number,
	dataHex?: string | null,
): bigint | null {
	const fromText = mpaComposeBatchFallbackGasRaw(
		composeSignatureFromSignatureText(getSignatureTextForDetail(detail, index) ?? null),
	);
	const fromData = mpaComposeBatchFallbackGasRaw(mpaSignatureFromCalldata(dataHex));
	const mpa =
		fromText != null && fromData != null ? (fromText > fromData ? fromText : fromData) : (fromText ?? fromData);
	if (mpa != null) return mpa;

	if (isLidoBatchStepEvmSignRequest(detail, index)) return LIDO_REQUEST_WITHDRAWALS_FALLBACK_GAS_UNITS;
	if (isEthenaSusdeDepositBatchStep(detail, index)) return ETHENA_SUSDE_DEPOSIT_GET_SIG_GAS_FALLBACK;
	if (isSkyLockstakeIsolationEstimateGasFragileBatchStep(detail, index)) {
		return SKY_LOCKSTAKE_MULTICALL_FALLBACK_GAS;
	}
	if (isCctpBurnEvmSignRequest(detail, index)) return CCTP_DEPOSIT_FOR_BURN_FALLBACK_GAS;
	if (isCurveDaoSwapEvmSignRequest(detail, index)) return CURVE_ROUTER_EXCHANGE_DEFAULT_GAS_UNITS;
	if (isAaveV4DepositEvmSignRequest(detail, index)) return AAVE_V4_SPOKE_SUPPLY_DEFAULT_GAS_UNITS;
	if (isUniswapV4SwapEvmSignRequest(detail, index) || isUniswapV4LiquidityEvmSignRequest(detail, index)) {
		return UNISWAP_UNIVERSAL_ROUTER_DEFAULT_GAS_UNITS;
	}
	return null;
}
