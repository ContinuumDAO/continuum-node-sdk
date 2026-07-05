import type {ChartOverlayInput} from '../chart/overlay-schemas.js';
import type {ChartPatternHit} from './types.js';

function chartTimeFromSec(timeSec: number): number {
	return timeSec;
}

export function chartPatternHitToOverlay(hit: ChartPatternHit): Extract<ChartOverlayInput, {type: 'chart_pattern'}> {
	return {
		type: 'chart_pattern',
		patternName: hit.name,
		patternId: hit.id,
		points: hit.points.map(p => ({
			time: chartTimeFromSec(p.timeSec),
			price: p.price,
			...(p.label ? {label: p.label} : {}),
			...(p.role ? {role: p.role} : {}),
		})),
		lines: hit.lines.map(line => ({
			pointA: {time: chartTimeFromSec(line.pointA.timeSec), price: line.pointA.price},
			pointB: {time: chartTimeFromSec(line.pointB.timeSec), price: line.pointB.price},
			...(line.label ? {label: line.label} : {}),
			...(line.kind ? {kind: line.kind} : {}),
		})),
		levels: hit.levels?.map(level => ({
			price: level.price,
			...(level.label ? {label: level.label} : {}),
			...(level.kind ? {kind: level.kind} : {}),
		})),
	};
}

export function chartPatternHitToTrendLines(hit: ChartPatternHit): Array<{
	kind: 'support' | 'resistance';
	pointA: {time: number; price: number};
	pointB: {time: number; price: number};
	label?: string;
}> {
	return hit.lines.map(line => ({
		kind:
			line.kind === 'support' || line.kind === 'boundary'
				? 'support'
				: 'resistance',
		pointA: {time: line.pointA.timeSec, price: line.pointA.price},
		pointB: {time: line.pointB.timeSec, price: line.pointB.price},
		...(line.label ? {label: line.label} : {}),
	}));
}

export function chartPatternHitToHorizontalLevels(hit: ChartPatternHit): Array<{
	price: number;
	label?: string;
	kind?: 'support' | 'resistance' | 'level';
}> {
	return (hit.levels ?? []).map(level => {
		const out: {price: number; label?: string; kind?: 'support' | 'resistance' | 'level'} = {
			price: level.price,
		};
		if (level.label) {
			out.label = level.label;
		}
		if (level.kind === 'neckline') {
			out.kind = 'level';
		} else if (level.kind === 'support' || level.kind === 'resistance' || level.kind === 'level') {
			out.kind = level.kind;
		}
		return out;
	});
}
