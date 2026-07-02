import type {ChartV1Payload} from './schemas.js';

export const MAIN_CHART_PANE_ID = 'main';

const MIN_MAIN_PANE_RATIO = 0.35;
const MIN_OSC_PANE_RATIO = 0.14;
const MAX_OSC_PANE_RATIO = 0.22;

export function buildPaneLayout(chart: ChartV1Payload): ChartV1Payload {
	const oscillatorPaneIds = [
		...new Set(
			chart.series
				.map(s => s.paneId)
				.filter((id): id is string => !!id && id !== MAIN_CHART_PANE_ID),
		),
	].sort();

	if (oscillatorPaneIds.length === 0) {
		return {
			...chart,
			panes: [{id: MAIN_CHART_PANE_ID, heightRatio: 1}],
		};
	}

	const oscHeight = Math.min(
		MAX_OSC_PANE_RATIO,
		Math.max(MIN_OSC_PANE_RATIO, 0.55 / oscillatorPaneIds.length),
	);
	const mainHeight = Math.max(
		MIN_MAIN_PANE_RATIO,
		1 - oscHeight * oscillatorPaneIds.length,
	);

	return {
		...chart,
		panes: [
			{id: MAIN_CHART_PANE_ID, heightRatio: mainHeight},
			...oscillatorPaneIds.map(id => ({id, heightRatio: oscHeight})),
		],
	};
}

export function seriesPaneId(series: {paneId?: string}): string {
	return series.paneId ?? MAIN_CHART_PANE_ID;
}
