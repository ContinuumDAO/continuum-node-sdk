/**
 * Chain IDs with a pinned Uniswap V4 subgraph on The Graph (OHLCV fetch).
 * Keep aligned with `UNISWAP_V4_SUBGRAPH_ID_BY_CHAIN_ID` in ctm-mpc-defi.
 */
export const UNISWAP_V4_OHLCV_SUPPORTED_CHAIN_IDS: readonly number[] = [
	1, 10, 56, 130, 137, 8453, 42161, 43114, 81457,
];

export function uniswapV4OhlcvSupportedChainIds(): readonly number[] {
	return UNISWAP_V4_OHLCV_SUPPORTED_CHAIN_IDS;
}
