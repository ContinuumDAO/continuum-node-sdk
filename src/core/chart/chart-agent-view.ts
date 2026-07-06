import type {PrepareChartOutput} from './schemas.js';

/** Agent-facing chart payload — omits series point arrays (UI still gets full chart via structuredContent). */
export function slimChartOutputForAgent(output: PrepareChartOutput): Record<string, unknown> {
	const series = output.chart.series.map(s => ({
		id: s.id,
		type: s.type,
		label: s.label,
		pointCount: s.data.length,
		...(s.priceScaleId ? {priceScaleId: s.priceScaleId} : {}),
		...(s.paneId ? {paneId: s.paneId} : {}),
		...(s.overlay != null ? {overlay: s.overlay} : {}),
	}));

	return {
		kind: output.kind,
		agentView: 'slim',
		chart: {
			...(output.chart.title ? {title: output.chart.title} : {}),
			...(output.chart.height != null ? {height: output.chart.height} : {}),
			...(output.chart.panes ? {paneCount: output.chart.panes.length} : {}),
			series,
		},
		...(output.prepareReplay ? {prepareReplay: output.prepareReplay} : {}),
		...(output.live ? {live: output.live} : {}),
		...(output.meta ? {meta: output.meta} : {}),
	};
}
