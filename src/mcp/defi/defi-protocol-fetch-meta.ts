import {z} from 'zod';
import {getProtocolSupportAdvisor} from './catalog-adapter.js';
import {defiProtocolFetchOhlcvToolName} from './ohlcv-chart-workflow.js';

export type DefiFetchDataSource =
	| 'protocol_ohlcv'
	| 'coingecko_time_series'
	| 'coinmarketcap_klines';

export type DefiProtocolFetchOptions = {
	protocolId: string;
	supportedChainIds: number[];
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
		hasProtocolOhlcv: z.boolean(),
		fetchOhlcvTool: z.string().optional(),
		dataSource: z.enum(['protocol_ohlcv', 'coingecko_time_series', 'coinmarketcap_klines']),
		fetchDataNotes: z.string(),
		requiresChainSelection: z.boolean(),
	})
	.strict();

const UNISWAP_FETCH_NOTES =
	'Uniswap V4 has no protocol OHLCV or GraphQL price history. For analysis use CoinGecko/CoinMarketCap time series (analyze_time_series_*) or load GMX/Hyperliquid for perp OHLCV. Swaps and quotes use the selected chainId — pick explicitly.';

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

	if (id === 'uniswap-v4') {
		const advisor = getProtocolSupportAdvisor(id);
		const supportedChainIds = advisor ? await advisor.supportedChainIds() : [];
		return {
			protocolId: id,
			supportedChainIds,
			hasProtocolOhlcv: false,
			dataSource: 'coingecko_time_series',
			fetchDataNotes: UNISWAP_FETCH_NOTES,
			requiresChainSelection: true,
		};
	}

	const advisor = getProtocolSupportAdvisor(id);
	if (!advisor && !hasProtocolOhlcv) {
		return null;
	}
	const supportedChainIds = advisor ? await advisor.supportedChainIds() : [];
	let dataSource: DefiFetchDataSource = 'coingecko_time_series';
	let fetchDataNotes = DEFAULT_FETCH_NOTES;
	if (hasProtocolOhlcv) {
		dataSource = 'protocol_ohlcv';
		fetchDataNotes = [
			`Use ${fetchOhlcvTool} with explicit chainId from supportedChainIds.`,
			'Operator must pick a chain before fetching — use protocol.fetch.chain.set UI action or ask which chain.',
			'Run analyze_* on the fetch JSON; prepare_chart_from_rows is optional (only when drawing a chart).',
		].join(' ');
	}

	return {
		protocolId: id,
		supportedChainIds,
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
