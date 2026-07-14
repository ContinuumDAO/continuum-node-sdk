/**
 * Chain IDs with Uniswap V4 OHLCV (The Graph subgraph and/or Bitquery).
 * Keep aligned with `uniswapV4OhlcvSupportedChainIds()` in ctm-mpc-defi.
 */
export const UNISWAP_V4_OHLCV_SUPPORTED_CHAIN_IDS: readonly number[] = [
	1, 10, 56, 130, 137, 4663, 8453, 42161, 43114, 81457,
];

export function uniswapV4OhlcvSupportedChainIds(): readonly number[] {
	return UNISWAP_V4_OHLCV_SUPPORTED_CHAIN_IDS;
}
