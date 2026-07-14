import {z} from 'zod';
import {uniswapV4OhlcvSupportedChainIds} from './uniswap-v4-ohlcv-chains.js';
import {getProtocolSupportAdvisor} from './catalog-adapter.js';
import {defiProtocolFetchOhlcvToolName} from './ohlcv-chart-workflow.js';

export type DefiFetchDataSource =
	| 'protocol_ohlcv'
	| 'coingecko_time_series'
	| 'coinmarketcap_klines';

export type DefiProtocolFetchOptions = {
	protocolId: string;
	supportedChainIds: number[];
	/** Subset of supportedChainIds where protocol-native OHLCV fetch works (e.g. Uniswap V4 subgraph). */
	ohlcvSupportedChainIds?: number[];
	hasProtocolOhlcv: boolean;
	fetchOhlcvTool?: string;
	dataSource: DefiFetchDataSource;
	fetchDataNotes: string;
	requiresChainSelection: boolean;
};

export const defiProtocolFetchOptionsSchema = z
	.object({
		protocolId: z.string(),
		supportedChainIds: z.array(z.number()),
		ohlcvSupportedChainIds: z.array(z.number()).optional(),
		hasProtocolOhlcv: z.boolean(),
		fetchOhlcvTool: z.string().optional(),
		dataSource: z.enum(['protocol_ohlcv', 'coingecko_time_series', 'coinmarketcap_klines']),
		fetchDataNotes: z.string(),
		requiresChainSelection: z.boolean(),
	})
	.strict();

function formatUniswapOhlcvFetchNotes(ohlcvChainIds: readonly number[]): string {
	const chainList = ohlcvChainIds.join(', ');
	return [
		`OHLCV works on ohlcvSupportedChainIds (${ohlcvChainIds.length} chains: ${chainList}).`,
		'Most chains use a pinned Uniswap V4 The Graph subgraph; Robinhood Chain (4663) uses Bitquery (set BITQUERY_API_KEY).',
		'Swap/LP/quote tools work on all supportedChainIds (~20+); do not assume OHLCV exists on every supported chain.',
		'Use ctm_uniswap_v4_fetch_ohlcv with chainId from ohlcvSupportedChainIds. Subgraph: poolPreset from list_lp_pools. Robinhood: currencyAddress, currencySymbol, or existingPool token addresses.',
		'Optional THE_GRAPH_API_KEY for subgraph gateway rate limits — not UNISWAP_API_KEY. Sub-hour intervals use swap bucketing on subgraph chains; ≥1h uses subgraph (native or aggregated).',
		'On unsupported chains use CoinGecko/CMC time series from fetch options.',
	].join(' ');
}

const DEFAULT_FETCH_NOTES =
	'Call get_defi_protocol_supported_chains and intersect with get_chain_registry. Pass chainId on every fetch_ohlcv / protocol read — do not assume Arbitrum. Analysis does not require prepare_chart.';

export async function resolveDefiProtocolFetchOptions(
	protocolId: string,
): Promise<DefiProtocolFetchOptions | null> {
	const id = protocolId.trim();
	if (!id) {
		return null;
	}
	const fetchOhlcvTool = defiProtocolFetchOhlcvToolName(id);
	const hasProtocolOhlcv = fetchOhlcvTool != null;

	const advisor = getProtocolSupportAdvisor(id);
	if (!advisor && !hasProtocolOhlcv) {
		return null;
	}
	const supportedChainIds = advisor ? await advisor.supportedChainIds() : [];
	let ohlcvSupportedChainIds: number[] | undefined;
	let dataSource: DefiFetchDataSource = 'coingecko_time_series';
	let fetchDataNotes = DEFAULT_FETCH_NOTES;
	if (hasProtocolOhlcv) {
		dataSource = 'protocol_ohlcv';
		if (id === 'uniswap-v4') {
			const ohlcvChains = uniswapV4OhlcvSupportedChainIds();
			ohlcvSupportedChainIds = [...ohlcvChains];
			fetchDataNotes = formatUniswapOhlcvFetchNotes(ohlcvChains);
		} else {
			fetchDataNotes = [
				`Use ${fetchOhlcvTool} with explicit chainId from supportedChainIds.`,
				'Operator must pick a chain before fetching — use protocol.fetch.chain.set UI action or ask which chain.',
				'Run analyze_* on the fetch JSON; prepare_chart_from_rows is optional (only when drawing a chart).',
			].join(' ');
		}
	}

	return {
		protocolId: id,
		supportedChainIds,
		...(ohlcvSupportedChainIds ? {ohlcvSupportedChainIds} : {}),
		hasProtocolOhlcv,
		...(fetchOhlcvTool ? {fetchOhlcvTool} : {}),
		dataSource,
		fetchDataNotes,
		requiresChainSelection: supportedChainIds.length > 1 || id === 'uniswap-v4',
	};
}

/** @deprecated Use resolveDefiProtocolFetchOptions */
export const resolveDefiProtocolChartOptions = resolveDefiProtocolFetchOptions;

/** Trade-build protocol aliases → DeFi protocol id for chain lookup. */
export function tradeBuildProtocolToDefiId(protocolId: string): string {
	switch (protocolId.trim().toLowerCase()) {
		case 'hyperliquid':
			return 'hyperliquid';
		case 'gmx':
			return 'gmx';
		case 'uniswap':
			return 'uniswap-v4';
		default:
			return protocolId.trim();
	}
}
