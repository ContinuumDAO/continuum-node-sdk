import type {ChartV1Payload} from './schemas.js';

export const MAIN_CHART_PANE_ID = 'main';
export const VOLUME_PANE_ID = 'volume';

const MIN_MAIN_PANE_RATIO = 0.35;
const MIN_VOLUME_PANE_RATIO = 0.12;
const MAX_VOLUME_PANE_RATIO = 0.18;
const MIN_OSC_PANE_RATIO = 0.14;
const MAX_OSC_PANE_RATIO = 0.22;

function subPaneSortOrder(a: string, b: string): number {
	if (a === VOLUME_PANE_ID) {
		return -1;
	}
	if (b === VOLUME_PANE_ID) {
		return 1;
	}
	return a.localeCompare(b);
}

/** Volume histograms get a dedicated pane below price (not overlaid on candles). */
function assignVolumePane(chart: ChartV1Payload): ChartV1Payload {
	const series = chart.series.map(s => {
		if (s.type !== 'histogram' || s.id !== 'volume' || s.paneId) {
			return s;
		}
		return {
			...s,
			paneId: VOLUME_PANE_ID,
			priceScaleId: 'right' as const,
		};
	});
	return series === chart.series ? chart : {...chart, series};
}

export function buildPaneLayout(chart: ChartV1Payload): ChartV1Payload {
	const withVolumePane = assignVolumePane(chart);

	const subPaneIds = [
		...new Set(
			withVolumePane.series
				.map(s => s.paneId)
				.filter((id): id is string => !!id && id !== MAIN_CHART_PANE_ID),
		),
	].sort(subPaneSortOrder);

	if (subPaneIds.length === 0) {
		return {
			...withVolumePane,
			panes: [{id: MAIN_CHART_PANE_ID, heightRatio: 1}],
		};
	}

	const volumePaneCount = subPaneIds.includes(VOLUME_PANE_ID) ? 1 : 0;
	const oscillatorPaneIds = subPaneIds.filter(id => id !== VOLUME_PANE_ID);

	const volumeHeight =
		volumePaneCount > 0
			? Math.min(
					MAX_VOLUME_PANE_RATIO,
					Math.max(MIN_VOLUME_PANE_RATIO, 0.15),
				)
			: 0;
	const oscHeight =
		oscillatorPaneIds.length > 0
			? Math.min(
					MAX_OSC_PANE_RATIO,
					Math.max(
						MIN_OSC_PANE_RATIO,
						0.55 / oscillatorPaneIds.length,
					),
				)
			: 0;
	const mainHeight = Math.max(
		MIN_MAIN_PANE_RATIO,
		1 - volumeHeight - oscHeight * oscillatorPaneIds.length,
	);

	return {
		...withVolumePane,
		panes: [
			{id: MAIN_CHART_PANE_ID, heightRatio: mainHeight},
			...subPaneIds.map(id => ({
				id,
				heightRatio: id === VOLUME_PANE_ID ? volumeHeight : oscHeight,
			})),
		],
	};
}

export function seriesPaneId(series: {paneId?: string}): string {
	return series.paneId ?? MAIN_CHART_PANE_ID;
}
