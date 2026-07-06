import type {ChartOverlayInput} from '../chart/overlay-schemas.js';
import {computeMeasuredMove} from './measured-move.js';
import {
	computePatternVolumeProfile,
	type VolumeProfileBin,
} from './volume-confirmation.js';
import type {
	ChartPatternBarSpan,
	ChartPatternHit,
	ChartPatternPoint,
	MeasuredMove,
	NormalizedBar,
	PatternDrawingElement,
	PatternDrawingElementStyle,
	PatternDrawingSpec,
	VolumeConfirmation,
} from './types.js';

export const PATTERN_OVERLAY_STYLE = {
	structure: {lineStyle: 'solid' as const, lineWidth: 3, color: '#42A5F5'},
	neckline: {lineStyle: 'solid' as const, lineWidth: 2.5, color: '#66BB6A'},
	breakLevel: {lineStyle: 'solid' as const, lineWidth: 2.5, color: '#AB47BC'},
	target: {lineStyle: 'dashed' as const, lineWidth: 2, color: '#FFB300'},
	marker: {lineStyle: 'solid' as const, lineWidth: 3, color: '#FFA726'},
} as const;

function pointByLabel(hit: ChartPatternHit, label: string): ChartPatternPoint | undefined {
	return hit.points.find(p => p.label === label);
}

function levelPrice(hit: ChartPatternHit, kind?: string): number | null {
	const level = hit.levels?.find(
		l => (kind ? l.kind === kind || l.label?.toLowerCase().includes(kind) : true),
	);
	return level?.price ?? null;
}

function clipSegmentToSpan(
	pointA: ChartPatternPoint,
	pointB: ChartPatternPoint,
	span: ChartPatternBarSpan,
): {pointA: ChartPatternPoint; pointB: ChartPatternPoint} {
	const secA = pointA.timeSec;
	const secB = pointB.timeSec;
	if (secA === secB) {
		return {
			pointA: {...pointA, timeSec: span.fromTimeSec},
			pointB: {...pointB, timeSec: span.toTimeSec, price: pointA.price},
		};
	}
	const slope = (pointB.price - pointA.price) / (secB - secA);
	const priceAt = (t: number) => pointA.price + slope * (t - secA);
	return {
		pointA: {timeSec: span.fromTimeSec, price: priceAt(span.fromTimeSec), label: pointA.label, role: pointA.role},
		pointB: {timeSec: span.toTimeSec, price: priceAt(span.toTimeSec), label: pointB.label, role: pointB.role},
	};
}

function segment(
	pointA: ChartPatternPoint,
	pointB: ChartPatternPoint,
	label: string,
	role: string,
	style: PatternDrawingElementStyle = PATTERN_OVERLAY_STYLE.structure,
): PatternDrawingElement {
	return {kind: 'segment', pointA, pointB, label, role, style: {...style}};
}

function level(
	price: number,
	label: string,
	role: string,
	span: ChartPatternBarSpan,
	style: PatternDrawingElementStyle = PATTERN_OVERLAY_STYLE.neckline,
): PatternDrawingElement {
	return {kind: 'level', price, label, role, span, style: {...style}};
}

function marker(pt: ChartPatternPoint, label: string, role: string): PatternDrawingElement {
	return {
		kind: 'marker',
		timeSec: pt.timeSec,
		price: pt.price,
		label,
		role,
		style: {...PATTERN_OVERLAY_STYLE.marker},
	};
}

function polyline(
	points: ChartPatternPoint[],
	label: string,
	role: string,
): PatternDrawingElement {
	return {kind: 'polyline', points, label, role, style: {...PATTERN_OVERLAY_STYLE.structure}};
}

function buildTrendlineBreakoutSpec(hit: ChartPatternHit): PatternDrawingElement[] {
	const span = hit.barSpan;
	const elements: PatternDrawingElement[] = [];
	const trendLine = hit.lines[0];
	if (trendLine) {
		const clipped = clipSegmentToSpan(trendLine.pointA, trendLine.pointB, span);
		elements.push(
			segment(clipped.pointA, clipped.pointB, trendLine.label ?? 'Broken trendline', 'structure'),
		);
	}
	const breakLevel = levelPrice(hit, 'level');
	if (breakLevel != null) {
		elements.push(
			level(breakLevel, 'Break level', 'break_level', span, PATTERN_OVERLAY_STYLE.breakLevel),
		);
	}
	const bo = pointByLabel(hit, 'BO');
	if (bo) {
		elements.push(marker(bo, 'Breakout', 'breakout'));
	}
	const rt = pointByLabel(hit, 'RT');
	if (rt) {
		elements.push(marker(rt, 'Retest', 'retest'));
	}
	return elements;
}

function localPeakBefore(bars: NormalizedBar[], endIndex: number, fromIndex: number): NormalizedBar | null {
	let best: NormalizedBar | null = null;
	for (let i = fromIndex; i < endIndex; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}
		if (!best || bar.high > best.high) {
			best = bar;
		}
	}
	return best;
}

function localPeakBetween(bars: NormalizedBar[], fromIndex: number, toIndex: number): NormalizedBar | null {
	let best: NormalizedBar | null = null;
	for (let i = fromIndex; i <= toIndex; i++) {
		const bar = bars[i];
		if (!bar) {
			continue;
		}
		if (!best || bar.high > best.high) {
			best = bar;
		}
	}
	return best;
}

function sampleEveCurve(bars: NormalizedBar[], fromIndex: number, toIndex: number): ChartPatternPoint[] {
	const slice = bars.slice(fromIndex, toIndex + 1);
	if (slice.length < 3) {
		return slice.map(b => ({timeSec: b.timeSec, price: b.low}));
	}
	const count = Math.min(8, Math.max(5, Math.floor(slice.length / 2)));
	const step = (slice.length - 1) / (count - 1);
	const points: ChartPatternPoint[] = [];
	for (let i = 0; i < count; i++) {
		const idx = Math.min(slice.length - 1, Math.round(i * step));
		const bar = slice[idx]!;
		points.push({timeSec: bar.timeSec, price: bar.low, role: 'eve_curve'});
	}
	return points;
}

function buildAdamEveSpec(hit: ChartPatternHit, bars: NormalizedBar[]): PatternDrawingElement[] {
	const span = hit.barSpan;
	const elements: PatternDrawingElement[] = [];
	const adam = pointByLabel(hit, 'Adam');
	const eve = pointByLabel(hit, 'Eve');
	const peak = pointByLabel(hit, 'P');
	if (adam && eve) {
		const adamIdx = bars.findIndex(b => b.timeSec === adam.timeSec);
		const eveIdx = bars.findIndex(b => b.timeSec === eve.timeSec);
		if (adamIdx >= 0) {
			const beforePeak = localPeakBefore(bars, adamIdx, span.fromIndex);
			if (beforePeak) {
				elements.push(
					segment(
						{timeSec: beforePeak.timeSec, price: beforePeak.high},
						adam,
						'Adam leg',
						'adam_v',
					),
				);
			}
			const midPeak = localPeakBetween(bars, adamIdx, eveIdx >= 0 ? eveIdx : span.toIndex);
			if (midPeak) {
				elements.push(
					segment(
						adam,
						{timeSec: midPeak.timeSec, price: midPeak.high},
						'Adam recovery',
						'adam_v',
					),
				);
			}
		}
		if (adamIdx >= 0 && eveIdx >= 0 && eveIdx > adamIdx) {
			elements.push(polyline(sampleEveCurve(bars, adamIdx, eveIdx), 'Eve rounding', 'eve_curve'));
		}
	}
	const neckline = levelPrice(hit, 'neckline') ?? peak?.price;
	if (neckline != null) {
		elements.push(level(neckline, 'Neckline', 'neckline', span));
	}
	return elements;
}

function buildDoubleSpec(hit: ChartPatternHit): PatternDrawingElement[] {
	const span = hit.barSpan;
	const elements: PatternDrawingElement[] = [];
	const isTop = hit.id === 'double_top';
	const p1 = pointByLabel(hit, isTop ? 'T1' : 'B1') ?? pointByLabel(hit, isTop ? 'T1' : 'Adam');
	const p2 = pointByLabel(hit, isTop ? 'T2' : 'B2') ?? pointByLabel(hit, isTop ? 'T2' : 'Eve');
	if (p1) {
		elements.push(marker(p1, isTop ? 'Peak 1' : 'Trough 1', isTop ? 'peak' : 'trough'));
	}
	if (p2) {
		elements.push(marker(p2, isTop ? 'Peak 2' : 'Trough 2', isTop ? 'peak' : 'trough'));
	}
	const neckline = levelPrice(hit, 'neckline');
	if (neckline != null) {
		elements.push(level(neckline, 'Neckline', 'neckline', span));
	}
	return elements;
}

function buildHeadShouldersSpec(hit: ChartPatternHit): PatternDrawingElement[] {
	const span = hit.barSpan;
	const elements: PatternDrawingElement[] = [];
	const neck = hit.lines.find(l => l.kind === 'neckline') ?? hit.lines[0];
	if (neck) {
		const clipped = clipSegmentToSpan(neck.pointA, neck.pointB, span);
		elements.push(segment(clipped.pointA, clipped.pointB, 'Neckline', 'neckline', PATTERN_OVERLAY_STYLE.neckline));
	} else {
		const neckline = levelPrice(hit, 'neckline');
		if (neckline != null) {
			elements.push(level(neckline, 'Neckline', 'neckline', span));
		}
	}
	const head = pointByLabel(hit, 'H');
	if (head) {
		elements.push(marker(head, 'Head', 'head'));
	}
	return elements;
}

function buildBoundarySpec(hit: ChartPatternHit): PatternDrawingElement[] {
	const span = hit.barSpan;
	const elements: PatternDrawingElement[] = [];
	for (const line of hit.lines.slice(0, 2)) {
		const clipped = clipSegmentToSpan(line.pointA, line.pointB, span);
		elements.push(
			segment(
				clipped.pointA,
				clipped.pointB,
				line.label ?? 'Boundary',
				'boundary',
			),
		);
	}
	return elements;
}

function buildFlagPennantSpec(hit: ChartPatternHit, bars: NormalizedBar[]): PatternDrawingElement[] {
	const span = hit.barSpan;
	const elements: PatternDrawingElement[] = [];
	const pole = hit.lines.find(l => l.kind === 'flagpole') ?? hit.lines[0];
	if (pole) {
		elements.push(segment(pole.pointA, pole.pointB, pole.label ?? 'Pole', 'flagpole'));
	}
	const slice = bars.slice(span.fromIndex, span.toIndex + 1);
	if (slice.length >= 4) {
		const flagSlice = slice.slice(Math.max(0, slice.length - Math.ceil(slice.length / 2)));
		const tStart = flagSlice[0]!.timeSec;
		const tEnd = flagSlice.at(-1)!.timeSec;
		const upperA = {timeSec: tStart, price: Math.max(...flagSlice.map(b => b.high))};
		const upperB = {timeSec: tEnd, price: flagSlice.at(-1)!.high};
		const lowerA = {timeSec: tStart, price: flagSlice[0]!.low};
		const lowerB = {timeSec: tEnd, price: Math.min(...flagSlice.map(b => b.low))};
		elements.push(segment(upperA, upperB, 'Upper channel', 'boundary'));
		elements.push(segment(lowerA, lowerB, 'Lower channel', 'boundary'));
	}
	return elements;
}

function sampleCupCurve(bars: NormalizedBar[], fromIndex: number, toIndex: number): ChartPatternPoint[] {
	const slice = bars.slice(fromIndex, toIndex + 1);
	if (!slice.length) {
		return [];
	}
	const count = Math.min(8, Math.max(5, Math.floor(slice.length / 3)));
	const step = (slice.length - 1) / (count - 1);
	const points: ChartPatternPoint[] = [];
	for (let i = 0; i < count; i++) {
		const idx = Math.min(slice.length - 1, Math.round(i * step));
		const bar = slice[idx]!;
		points.push({timeSec: bar.timeSec, price: bar.low, role: 'cup'});
	}
	return points;
}

function buildCupHandleSpec(hit: ChartPatternHit, bars: NormalizedBar[]): PatternDrawingElement[] {
	const span = hit.barSpan;
	const elements: PatternDrawingElement[] = [];
	const leftRim = hit.points.find(p => p.role === 'left_rim' || p.label === 'A');
	const rightRim = hit.points.find(p => p.role === 'right_rim' || p.label === 'C');
	const cupLow = hit.points.find(p => p.role === 'cup_bottom' || p.label === 'B');
	if (leftRim && rightRim) {
		const cupPoints = sampleCupCurve(
			bars,
			bars.findIndex(b => b.timeSec === leftRim.timeSec),
			bars.findIndex(b => b.timeSec === rightRim.timeSec),
		);
		if (cupPoints.length >= 3) {
			elements.push(polyline(cupPoints, 'Cup', 'cup'));
		}
	} else if (cupLow) {
		const cupIdx = bars.findIndex(b => b.timeSec === cupLow.timeSec);
		if (cupIdx >= 0) {
			elements.push(
				polyline(
					sampleCupCurve(bars, span.fromIndex, cupIdx + Math.floor((span.toIndex - span.fromIndex) / 2)),
					'Cup',
					'cup',
				),
			);
		}
	}
	const rim = levelPrice(hit, 'neckline') ?? leftRim?.price ?? rightRim?.price;
	if (rim != null) {
		elements.push(level(rim, 'Rim / neckline', 'neckline', span));
	}
	const handle = hit.points.find(p => p.role === 'handle_low' || p.label === 'D');
	if (handle && rightRim) {
		elements.push(segment(rightRim, handle, 'Handle', 'handle', PATTERN_OVERLAY_STYLE.neckline));
	}
	return elements;
}

export function buildPatternDrawingSpec(hit: ChartPatternHit, bars: NormalizedBar[]): PatternDrawingSpec {
	let elements: PatternDrawingElement[] = [];
	const legend: string[] = [];

	switch (hit.id) {
		case 'trendline_breakout_bullish':
		case 'trendline_breakout_bearish':
		case 'trendline_breakout_retest_bullish':
		case 'trendline_breakout_retest_bearish':
			elements = buildTrendlineBreakoutSpec(hit);
			legend.push('Broken trendline', 'Break level', 'Breakout marker');
			if (hit.id.includes('retest')) {
				legend.push('Retest marker');
			}
			break;
		case 'double_bottom_adam_eve':
			elements = buildAdamEveSpec(hit, bars);
			legend.push('Adam V-shape', 'Eve rounding curve', 'Neckline');
			break;
		case 'double_top':
		case 'double_bottom':
			elements = buildDoubleSpec(hit);
			legend.push('Peak/trough markers', 'Neckline');
			break;
		case 'head_and_shoulders':
		case 'inverse_head_and_shoulders':
			elements = buildHeadShouldersSpec(hit);
			legend.push('Neckline', 'Head marker');
			break;
		case 'ascending_triangle':
		case 'descending_triangle':
		case 'symmetrical_triangle':
		case 'rising_wedge':
		case 'falling_wedge':
		case 'channel_up':
		case 'channel_down':
			elements = buildBoundarySpec(hit);
			legend.push('Upper/lower boundaries (clipped to pattern span)');
			break;
		case 'flag_bullish':
		case 'flag_bearish':
		case 'pennant_bullish':
		case 'pennant_bearish':
			elements = buildFlagPennantSpec(hit, bars);
			legend.push('Flagpole', 'Channel boundaries');
			break;
		case 'cup_and_handle':
			elements = buildCupHandleSpec(hit, bars);
			legend.push('Cup curve', 'Rim neckline', 'Handle');
			break;
		default:
			elements = buildBoundarySpec(hit);
			legend.push('Pattern structure');
	}

	return {
		version: 1,
		patternId: hit.id,
		barSpan: hit.barSpan,
		elements,
		legend,
	};
}

export type DrawingSpecToOverlayOptions = {
	measuredMove?: MeasuredMove | null;
	volumeConfirmation?: VolumeConfirmation;
	showVolumeConfirmation?: boolean;
	showVolumeProfile?: boolean;
	bars?: NormalizedBar[];
	rawBars?: Record<string, unknown>[];
};

function chartTimeFromSec(timeSec: number): number {
	return timeSec;
}

type ChartPatternOverlayInput = Extract<ChartOverlayInput, {type: 'chart_pattern'}>;

export function drawingSpecToOverlay(
	spec: PatternDrawingSpec,
	hit: ChartPatternHit,
	options: DrawingSpecToOverlayOptions = {},
): ChartPatternOverlayInput {
	const measuredMove = options.measuredMove ?? computeMeasuredMove(hit, options.bars ?? []);
	const lines: Extract<ChartOverlayInput, {type: 'chart_pattern'}>['lines'] = [];
	const levels: NonNullable<Extract<ChartOverlayInput, {type: 'chart_pattern'}>['levels']> = [];
	const markers: Array<{time: number; price: number; label?: string; role?: string}> = [];
	type PatternOverlay = ChartPatternOverlayInput;
	const polylines: NonNullable<PatternOverlay['polylines']> = [];

	for (const el of spec.elements) {
		switch (el.kind) {
			case 'segment':
				lines.push({
					pointA: {time: chartTimeFromSec(el.pointA.timeSec), price: el.pointA.price},
					pointB: {time: chartTimeFromSec(el.pointB.timeSec), price: el.pointB.price},
					...(el.label ? {label: el.label} : {}),
					kind: el.role === 'neckline' ? 'neckline' : el.role === 'flagpole' ? 'flagpole' : 'boundary',
				});
				break;
			case 'level':
				levels.push({
					price: el.price,
					...(el.label ? {label: el.label} : {}),
					kind: el.role === 'break_level' ? 'level' : 'neckline',
				});
				break;
			case 'marker':
				markers.push({
					time: chartTimeFromSec(el.timeSec),
					price: el.price,
					...(el.label ? {label: el.label} : {}),
					...(el.role ? {role: el.role} : {}),
				});
				break;
			case 'polyline':
				polylines.push({
					points: el.points.map(p => ({
						time: chartTimeFromSec(p.timeSec),
						price: p.price,
						...(p.label ? {label: p.label} : {}),
						...(p.role ? {role: p.role} : {}),
					})),
					...(el.label ? {label: el.label} : {}),
					...(el.role ? {role: el.role} : {}),
					style: el.style
						? {
								...(el.style.lineWidth != null ? {lineWidth: el.style.lineWidth} : {}),
								...(el.style.lineStyle ? {lineStyle: el.style.lineStyle} : {}),
								...(el.style.color ? {color: el.style.color} : {}),
							}
						: undefined,
				});
				break;
			case 'target':
				levels.push({
					price: el.price,
					label: el.label ?? 'Target (measured move)',
					kind: 'level',
				});
				break;
		}
	}

	if (measuredMove) {
		const targetLabel =
			measuredMove.status === 'projected'
				? 'Target (on break)'
				: 'Target (measured move)';
		levels.push({
			price: measuredMove.targetPrice,
			label: targetLabel,
			kind: 'level',
			role: 'measured_move',
		});
	}

	const span = spec.barSpan;
	const overlay: PatternOverlay = {
		type: 'chart_pattern',
		patternName: hit.name,
		patternId: hit.id,
		points: [],
		lines,
		...(levels.length ? {levels} : {}),
		clipToBarSpan: {fromTimeSec: span.fromTimeSec, toTimeSec: span.toTimeSec},
		...(markers.length ? {markers} : {}),
		...(polylines.length ? {polylines} : {}),
		style: {...PATTERN_OVERLAY_STYLE.structure},
		pointStyle: {...PATTERN_OVERLAY_STYLE.marker},
	};

	const showVol = options.showVolumeConfirmation !== false;
	const vol = options.volumeConfirmation;
	if (showVol && vol && vol.status !== 'unavailable' && vol.events.length) {
		overlay.barHighlights = vol.events.map(e => ({
			fromTimeSec: e.timeSec,
			toTimeSec: e.timeSec,
			role: e.role,
			verdict: e.verdict,
			label: `${e.role} ${e.ratioToBaseline.toFixed(1)}×`,
		}));
	}

	const showProfile = options.showVolumeProfile !== false;
	if (
		showProfile &&
		options.bars?.length &&
		options.rawBars?.length
	) {
		const profile = computePatternVolumeProfile(hit, options.bars, options.rawBars);
		if (profile) {
			overlay.volumeProfile = profile as {
				bins: VolumeProfileBin[];
				pocPrice: number;
				barSpan: ChartPatternBarSpan;
			};
		}
	}

	return overlay;
}
