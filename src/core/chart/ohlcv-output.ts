import type {SdkResult} from '../result.js';
import {
	ohlcvToPrepareChartInput,
	type OhlcvRow,
	type OhlcvToPrepareChartInputOptions,
} from './ohlcv.js';
import {prepareChart} from './prepare.js';
import type {PrepareChartOutput} from './schemas.js';

/** Map OHLCV rows to a full chart envelope (MCP, scripts, KeyGen). Not for browser bundles. */
export function ohlcvRowsToChartOutput(
	rows: OhlcvRow[],
	options: OhlcvToPrepareChartInputOptions = {},
): SdkResult<PrepareChartOutput> {
	if (!rows.length) {
		return {ok: false, reason: 'At least one OHLCV row is required.'};
	}
	return prepareChart(ohlcvToPrepareChartInput(rows, options));
}
