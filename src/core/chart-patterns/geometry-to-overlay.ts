import type {ChartOverlayInput} from '../chart/overlay-schemas.js';
import type {ChartTime} from '../chart/schemas.js';
import {coerceFiniteNumber, parseChartTime} from '../chart/point-normalize.js';
import {normalizeBarsFromRows} from './swings.js';
import type {ChartPatternHit} from './types.js';

type ChartPatternOverlay = Extract<ChartOverlayInput, {type: 'chart_pattern'}>;

function overlayPointTimeSec(raw: {time: ChartTime; price: number}): number | null {
	const parsed = parseChartTime(raw.time);
	return typeof parsed === 'number' ? parsed : null;
}

function collectOverlayTimeSecs(overlay: ChartPatternOverlay): number[] {
	const out: number[] = [];
	for (const pt of overlay.points) {
		const sec = overlayPointTimeSec(pt);
		if (sec != null) {
			out.push(sec);
		}
	}
	for (const line of overlay.lines) {
		for (const pt of [line.pointA, line.pointB]) {
			const sec = overlayPointTimeSec(pt);
			if (sec != null) {
				out.push(sec);
			}
		}
	}
	for (const mk of overlay.markers ?? []) {
		const sec = overlayPointTimeSec({time: mk.time, price: mk.price});
		if (sec != null) {
			out.push(sec);
		}
	}
	for (const poly of overlay.polylines ?? []) {
		for (const pt of poly.points) {
			const sec = overlayPointTimeSec(pt);
			if (sec != null) {
				out.push(sec);
			}
		}
	}
	return out;
}

/** Agents often paste bar indices (e.g. 139) instead of unix seconds — remap using OHLCV rows. */
export function remapOverlayTimesFromBarIndices(
	overlay: ChartPatternOverlay,
	rawBars: Record<string, unknown>[],
): ChartPatternOverlay {
	const bars = normalizeBarsFromRows(rawBars);
	if (!bars.length) {
		return overlay;
	}
	const overlayTimes = collectOverlayTimeSecs(overlay);
	if (!overlayTimes.length) {
		return overlay;
	}
	const barMinSec = Math.min(...bars.map(b => b.timeSec));
	const maxOverlayTime = Math.max(...overlayTimes);
	if (maxOverlayTime >= 1_000_000 || (barMinSec > 1_000_000 && maxOverlayTime >= barMinSec / 100)) {
		return overlay;
	}

	const remapTime = (time: ChartTime): ChartTime => {
		if (typeof time !== 'number' || !Number.isFinite(time)) {
			return time;
		}
		const idx = Math.round(time);
		if (idx < 0 || idx >= bars.length) {
			return time;
		}
		return bars[idx]!.timeSec;
	};

	return {
		...overlay,
		points: overlay.points.map(pt => ({...pt, time: remapTime(pt.time)})),
		lines: overlay.lines.map(line => ({
			...line,
			pointA: {...line.pointA, time: remapTime(line.pointA.time)},
			pointB: {...line.pointB, time: remapTime(line.pointB.time)},
		})),
		...(overlay.markers?.length
			? {
					markers: overlay.markers.map(mk => ({...mk, time: remapTime(mk.time)})),
				}
			: {}),
		...(overlay.polylines?.length
			? {
					polylines: overlay.polylines.map(poly => ({
						...poly,
						points: poly.points.map(pt => ({...pt, time: remapTime(pt.time)})),
					})),
				}
			: {}),
	};
}

function chartTimeFromSec(timeSec: number): number {
	return timeSec;
}

export function normalizeHorizontalLevelKind(
	kind: string | undefined,
): 'support' | 'resistance' | 'level' | undefined {
	if (kind === 'neckline' || kind === 'level') {
		return 'level';
	}
	if (kind === 'support' || kind === 'resistance') {
		return kind;
	}
	return undefined;
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

function overlayPointFromRaw(
	raw: unknown,
): {time: ChartTime; price: number; label?: string; role?: string} | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const price = coerceFiniteNumber(record.price);
	const time = parseChartTime(record.time ?? record.timeSec);
	if (price == null || time == null) {
		return null;
	}
	return {
		time,
		price,
		...(typeof record.label === 'string' && record.label.trim()
			? {label: record.label.trim()}
			: {}),
		...(typeof record.role === 'string' && record.role.trim() ? {role: record.role.trim()} : {}),
	};
}

function overlayLineFromRaw(
	raw: unknown,
): Extract<ChartOverlayInput, {type: 'chart_pattern'}>['lines'][number] | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	const record = raw as Record<string, unknown>;
	const pointA = overlayPointFromRaw(record.pointA);
	const pointB = overlayPointFromRaw(record.pointB);
	if (!pointA || !pointB) {
		return null;
	}
	const kind = record.kind;
	return {
		pointA,
		pointB,
		...(typeof record.label === 'string' && record.label.trim() ? {label: record.label.trim()} : {}),
		...(kind === 'support' ||
		kind === 'resistance' ||
		kind === 'neckline' ||
		kind === 'boundary' ||
		kind === 'flagpole'
			? {kind}
			: {}),
	};
}

/** Coerce agent/calculate payloads into a valid chart_pattern overlay (adds type, defaults points). */
export function normalizeChartPatternOverlay(
	raw: unknown,
	pattern?: ChartPatternHit | Record<string, unknown> | null,
): Extract<ChartOverlayInput, {type: 'chart_pattern'}> | undefined {
	if (pattern && typeof pattern === 'object' && 'lines' in pattern && 'name' in pattern) {
		const hit = pattern as ChartPatternHit;
		if (!raw) {
			return chartPatternHitToOverlay(hit);
		}
	}
	if (!raw || typeof raw !== 'object') {
		return undefined;
	}
	const record = raw as Record<string, unknown>;
	if (record.type === 'chart_pattern') {
		const points = Array.isArray(record.points) ? record.points : [];
		const lines = Array.isArray(record.lines) ? record.lines : [];
		const levels = Array.isArray(record.levels) ? record.levels : undefined;
		const markersParsed = Array.isArray(record.markers)
			? record.markers
					.map(mk => {
						if (!mk || typeof mk !== 'object') {
							return null;
						}
						const row = mk as Record<string, unknown>;
						const price = coerceFiniteNumber(row.price);
						const time = parseChartTime(row.time ?? row.timeSec);
						if (price == null || time == null) {
							return null;
						}
						return {
							time,
							price,
							...(typeof row.label === 'string' && row.label.trim() ? {label: row.label.trim()} : {}),
							...(typeof row.role === 'string' && row.role.trim() ? {role: row.role.trim()} : {}),
						};
					})
					.filter((m): m is NonNullable<typeof m> => m != null)
			: undefined;
		const polylinesParsed = Array.isArray(record.polylines)
			? record.polylines
					.map(poly => {
						if (!poly || typeof poly !== 'object') {
							return null;
						}
						const row = poly as Record<string, unknown>;
						const pts = Array.isArray(row.points) ? row.points : [];
						const parsedPoints = pts
							.map(overlayPointFromRaw)
							.filter((p): p is NonNullable<typeof p> => p != null);
						if (parsedPoints.length < 2) {
							return null;
						}
						return {
							points: parsedPoints,
							...(typeof row.label === 'string' && row.label.trim() ? {label: row.label.trim()} : {}),
							...(typeof row.role === 'string' && row.role.trim() ? {role: row.role.trim()} : {}),
						};
					})
					.filter((p): p is NonNullable<typeof p> => p != null)
			: undefined;
		const patternName =
			typeof record.patternName === 'string' && record.patternName.trim()
				? record.patternName.trim()
				: pattern && typeof pattern === 'object' && typeof pattern.name === 'string'
					? pattern.name
					: 'Pattern';
		return {
			type: 'chart_pattern',
			patternName,
			...(typeof record.patternId === 'string'
				? {patternId: record.patternId}
				: pattern && typeof pattern === 'object' && typeof pattern.id === 'string'
					? {patternId: pattern.id}
					: {}),
			points: points
				.map(overlayPointFromRaw)
				.filter((p): p is NonNullable<typeof p> => p != null),
			lines: lines
				.map(overlayLineFromRaw)
				.filter((l): l is NonNullable<typeof l> => l != null),
			...(levels
				? {
						levels: levels
							.map(level => {
								if (!level || typeof level !== 'object') {
									return null;
								}
								const row = level as Record<string, unknown>;
								const price = coerceFiniteNumber(row.price);
								if (price == null) {
									return null;
								}
								const kind = normalizeHorizontalLevelKind(
									typeof row.kind === 'string' ? row.kind : undefined,
								);
								return {
									price,
									...(typeof row.label === 'string' && row.label.trim()
										? {label: row.label.trim()}
										: {}),
									...(kind ? {kind} : {}),
									...(typeof row.role === 'string' && row.role.trim()
										? {role: row.role.trim()}
										: {}),
								};
							})
							.filter((l): l is NonNullable<typeof l> => l != null),
					}
				: {}),
			...(markersParsed?.length ? {markers: markersParsed} : {}),
			...(polylinesParsed?.length ? {polylines: polylinesParsed} : {}),
			...(record.clipToBarSpan && typeof record.clipToBarSpan === 'object'
				? {clipToBarSpan: record.clipToBarSpan as ChartPatternOverlay['clipToBarSpan']}
				: {}),
		};
	}

	const lines = (Array.isArray(record.lines) ? record.lines : [])
		.map(overlayLineFromRaw)
		.filter((l): l is NonNullable<typeof l> => l != null);
	const points = (Array.isArray(record.points) ? record.points : [])
		.map(overlayPointFromRaw)
		.filter((p): p is NonNullable<typeof p> => p != null);
	const levels = Array.isArray(record.levels)
		? record.levels
				.map(level => {
					if (!level || typeof level !== 'object') {
						return null;
					}
					const row = level as Record<string, unknown>;
					const price = coerceFiniteNumber(row.price);
					if (price == null) {
						return null;
					}
					const kind = normalizeHorizontalLevelKind(
						typeof row.kind === 'string' ? row.kind : undefined,
					);
					return {
						price,
						...(typeof row.label === 'string' && row.label.trim()
							? {label: row.label.trim()}
							: {}),
						...(kind ? {kind} : {}),
						...(typeof row.role === 'string' && row.role.trim() ? {role: row.role.trim()} : {}),
					};
				})
				.filter((l): l is NonNullable<typeof l> => l != null)
		: undefined;
	const markers = Array.isArray(record.markers)
		? record.markers
				.map(mk => {
					if (!mk || typeof mk !== 'object') {
						return null;
					}
					const row = mk as Record<string, unknown>;
					const price = coerceFiniteNumber(row.price);
					const time = parseChartTime(row.time ?? row.timeSec);
					if (price == null || time == null) {
						return null;
					}
					return {
						time,
						price,
						...(typeof row.label === 'string' && row.label.trim() ? {label: row.label.trim()} : {}),
						...(typeof row.role === 'string' && row.role.trim() ? {role: row.role.trim()} : {}),
					};
				})
				.filter((m): m is NonNullable<typeof m> => m != null)
		: [];
	const polylines = Array.isArray(record.polylines)
		? record.polylines
				.map(poly => {
					if (!poly || typeof poly !== 'object') {
						return null;
					}
					const row = poly as Record<string, unknown>;
					const points = Array.isArray(row.points) ? row.points : [];
					const parsedPoints = points
						.map(overlayPointFromRaw)
						.filter((p): p is NonNullable<typeof p> => p != null);
					if (parsedPoints.length < 2) {
						return null;
					}
					return {
						points: parsedPoints,
						...(typeof row.label === 'string' && row.label.trim() ? {label: row.label.trim()} : {}),
						...(typeof row.role === 'string' && row.role.trim() ? {role: row.role.trim()} : {}),
					};
				})
				.filter((p): p is NonNullable<typeof p> => p != null)
		: [];

	if (!lines.length && !points.length && !levels?.length && !markers.length && !polylines.length) {
		if (pattern && typeof pattern === 'object' && 'lines' in pattern && 'name' in pattern) {
			return chartPatternHitToOverlay(pattern as ChartPatternHit);
		}
		return undefined;
	}

	const patternName =
		typeof record.patternName === 'string' && record.patternName.trim()
			? record.patternName.trim()
			: pattern && typeof pattern === 'object' && typeof pattern.name === 'string'
				? pattern.name
				: 'Pattern';

	return {
		type: 'chart_pattern',
		patternName,
		...(typeof record.patternId === 'string'
			? {patternId: record.patternId}
			: pattern && typeof pattern === 'object' && typeof pattern.id === 'string'
				? {patternId: pattern.id}
				: {}),
		points,
		lines,
		...(levels?.length ? {levels} : {}),
		...(markers.length ? {markers} : {}),
		...(polylines.length ? {polylines} : {}),
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
		const kind = normalizeHorizontalLevelKind(level.kind);
		if (kind) {
			out.kind = kind;
		}
		return out;
	});
}
