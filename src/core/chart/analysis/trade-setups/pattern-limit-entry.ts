import type {ChartPatternId} from '../../../chart-patterns/types.js';
import type {PatternKeyLevelSummary} from '../../../chart-patterns/pattern-menu-summary.js';
import type {TradeSetupSide} from './shared.js';

export const DEFAULT_BREAK_TOLERANCE_PCT = 0.1;
export const DEFAULT_ENTRY_PROXIMITY_PCT = 1;

export type PatternEntryPhase = 'inside_pattern' | 'post_breakout_retest';
export type EntryOffsetMode = 'bounce' | 'retest';
export type PatternPhase = 'inside' | 'broken_above' | 'broken_below';

export type PatternLimitLevels = {
	triggerPrice: number;
	triggerLabel: string;
	invalidationPrice: number;
	invalidationLabel: string;
	entryPhase: PatternEntryPhase;
	entryOffsetMode: EntryOffsetMode;
	limitSide: 'long' | 'short';
};

export type ResolvePatternLimitInput = {
	patternId: ChartPatternId;
	lastClose: number;
	keyLevels: PatternKeyLevelSummary[];
	classificationSide: TradeSetupSide;
	breakTolerancePct?: number;
	entryProximityPct?: number;
};

export type ResolvePatternLimitResult =
	| {ok: true; levels: PatternLimitLevels}
	| {ok: false; unclearReason: string};

function tolPrice(price: number, pct: number): number {
	return Math.abs(price) * (pct / 100);
}

export function patternPhase(
	lastClose: number,
	support: number,
	resistance: number,
	tolerancePct = DEFAULT_BREAK_TOLERANCE_PCT,
): PatternPhase {
	if (!Number.isFinite(lastClose) || !Number.isFinite(support) || !Number.isFinite(resistance)) {
		return 'inside';
	}
	const tol = Math.max(tolPrice(resistance, tolerancePct), tolPrice(support, tolerancePct), 1e-8);
	if (lastClose > resistance + tol) {
		return 'broken_above';
	}
	if (lastClose < support - tol) {
		return 'broken_below';
	}
	return 'inside';
}

export function withinEntryProximity(
	lastClose: number,
	entry: number,
	maxPct = DEFAULT_ENTRY_PROXIMITY_PCT,
): boolean {
	if (!Number.isFinite(lastClose) || !Number.isFinite(entry) || entry === 0) {
		return false;
	}
	return (Math.abs(lastClose - entry) / Math.abs(entry)) * 100 <= maxPct;
}

function levelByLabels(
	levels: PatternKeyLevelSummary[],
	labels: string[],
): PatternKeyLevelSummary | null {
	for (const want of labels) {
		const lower = want.toLowerCase();
		const hit = levels.find(l => l.label.toLowerCase() === lower || l.label.toLowerCase().includes(lower));
		if (hit) {
			return hit;
		}
	}
	return null;
}

function levelMinByHint(levels: PatternKeyLevelSummary[], hints: string[]): PatternKeyLevelSummary | null {
	let best: PatternKeyLevelSummary | null = null;
	for (const level of levels) {
		const label = level.label.toLowerCase();
		if (!hints.some(h => label.includes(h))) {
			continue;
		}
		if (!best || level.price < best.price) {
			best = level;
		}
	}
	return best;
}

function levelMaxByHint(levels: PatternKeyLevelSummary[], hints: string[]): PatternKeyLevelSummary | null {
	let best: PatternKeyLevelSummary | null = null;
	for (const level of levels) {
		const label = level.label.toLowerCase();
		if (!hints.some(h => label.includes(h))) {
			continue;
		}
		if (!best || level.price > best.price) {
			best = level;
		}
	}
	return best;
}

export function boundaryAtRightEdge(levels: PatternKeyLevelSummary[]): {
	support: number;
	resistance: number;
	supportLabel: string;
	resistanceLabel: string;
} | null {
	const s2 = levelByLabels(levels, ['S2', 'support']);
	const r2 = levelByLabels(levels, ['R2', 'resistance']);
	if (s2 && r2) {
		return {
			support: s2.price,
			resistance: r2.price,
			supportLabel: s2.label,
			resistanceLabel: r2.label,
		};
	}
	const flat = levelByLabels(levels, ['flat boundary', 'level']);
	const low = levelMinByHint(levels, ['support', 'trough', 'bottom', 'low', 's1', 's2']);
	const high = levelMaxByHint(levels, ['resistance', 'peak', 'top', 'high', 'r1', 'r2']);
	if (flat && low && high) {
		return {
			support: Math.min(low.price, flat.price),
			resistance: Math.max(high.price, flat.price),
			supportLabel: low.label,
			resistanceLabel: high.label,
		};
	}
	if (low && high && low.price < high.price) {
		return {
			support: low.price,
			resistance: high.price,
			supportLabel: low.label,
			resistanceLabel: high.label,
		};
	}
	return null;
}

function flatResistance(levels: PatternKeyLevelSummary[]): PatternKeyLevelSummary | null {
	return (
		levelByLabels(levels, ['flat boundary', 'resistance']) ??
		levelMaxByHint(levels, ['resistance', 'r1', 'r2'])
	);
}

function flatSupport(levels: PatternKeyLevelSummary[]): PatternKeyLevelSummary | null {
	return (
		levelByLabels(levels, ['flat boundary', 'support']) ??
		levelMinByHint(levels, ['support', 's1', 's2'])
	);
}

function necklineLevel(levels: PatternKeyLevelSummary[]): PatternKeyLevelSummary | null {
	return levelByLabels(levels, ['neckline', 'rim', 'level', 'break']);
}

function troughLevel(levels: PatternKeyLevelSummary[]): PatternKeyLevelSummary | null {
	return (
		levelMinByHint(levels, ['trough', 'bottom', 'v', 'cup', 'handle', 'head', 'adam', 'eve']) ??
		levelMinByHint(levels, ['low', 'support'])
	);
}

function peakLevel(levels: PatternKeyLevelSummary[]): PatternKeyLevelSummary | null {
	return (
		levelMaxByHint(levels, ['peak', 'top', 't1', 't2', 'head']) ??
		levelMaxByHint(levels, ['high', 'resistance'])
	);
}

function flagLow(levels: PatternKeyLevelSummary[]): PatternKeyLevelSummary | null {
	return levelMinByHint(levels, ['f0', 'f1', 'flag', 'support', 's2']);
}

function flagHigh(levels: PatternKeyLevelSummary[]): PatternKeyLevelSummary | null {
	return levelMaxByHint(levels, ['f0', 'f1', 'flag', 'resistance', 'r2']);
}

function okLevels(
	trigger: {price: number; label: string},
	invalidation: {price: number; label: string},
	entryPhase: PatternEntryPhase,
	entryOffsetMode: EntryOffsetMode,
	limitSide: 'long' | 'short',
): ResolvePatternLimitResult {
	if (limitSide === 'long' && invalidation.price > trigger.price) {
		return {ok: false, unclearReason: 'Invalidation must sit below entry for long setups.'};
	}
	if (limitSide === 'short' && invalidation.price < trigger.price) {
		return {ok: false, unclearReason: 'Invalidation must sit above entry for short setups.'};
	}
	return {
		ok: true,
		levels: {
			triggerPrice: trigger.price,
			triggerLabel: trigger.label,
			invalidationPrice: invalidation.price,
			invalidationLabel: invalidation.label,
			entryPhase,
			entryOffsetMode,
			limitSide,
		},
	};
}

function boundaryLong(
	support: {price: number; label: string},
	resistance: {price: number; label: string},
	phase: PatternPhase,
	proximityPct: number,
	lastClose: number,
	requireBreakoutOnly: boolean,
): ResolvePatternLimitResult {
	if (requireBreakoutOnly) {
		if (phase === 'inside') {
			return {ok: false, unclearReason: 'Price still inside pattern — no trade until breakout.'};
		}
		if (phase !== 'broken_above') {
			return {ok: false, unclearReason: 'No bullish breakout above upper boundary.'};
		}
		const entry = {price: resistance.price, label: `${resistance.label} retest`};
		const inv = {price: support.price, label: `${support.label} pattern fail`};
		return okLevels(entry, inv, 'post_breakout_retest', 'retest', 'long');
	}
	if (phase === 'broken_above') {
		const entry = {price: resistance.price, label: `${resistance.label} retest`};
		const inv = {price: support.price, label: `${support.label} pattern fail`};
		return okLevels(entry, inv, 'post_breakout_retest', 'retest', 'long');
	}
	const entry = {price: support.price, label: `${support.label} bounce`};
	const inv = {price: support.price, label: `${support.label} pattern fail`};
	if (!withinEntryProximity(lastClose, entry.price, proximityPct)) {
		return {ok: false, unclearReason: `Price not within ${proximityPct}% of support entry.`};
	}
	return okLevels(entry, inv, 'inside_pattern', 'bounce', 'long');
}

function boundaryShort(
	support: {price: number; label: string},
	resistance: {price: number; label: string},
	phase: PatternPhase,
	proximityPct: number,
	lastClose: number,
	requireBreakoutOnly: boolean,
): ResolvePatternLimitResult {
	if (requireBreakoutOnly) {
		if (phase === 'inside') {
			return {ok: false, unclearReason: 'Price still inside pattern — no trade until breakout.'};
		}
		if (phase !== 'broken_below') {
			return {ok: false, unclearReason: 'No bearish breakout below lower boundary.'};
		}
		const entry = {price: support.price, label: `${support.label} retest`};
		const inv = {price: resistance.price, label: `${resistance.label} pattern fail`};
		return okLevels(entry, inv, 'post_breakout_retest', 'retest', 'short');
	}
	if (phase === 'broken_below') {
		const entry = {price: support.price, label: `${support.label} retest`};
		const inv = {price: resistance.price, label: `${resistance.label} pattern fail`};
		return okLevels(entry, inv, 'post_breakout_retest', 'retest', 'short');
	}
	const entry = {price: resistance.price, label: `${resistance.label} bounce`};
	const inv = {price: resistance.price, label: `${resistance.label} pattern fail`};
	if (!withinEntryProximity(lastClose, entry.price, proximityPct)) {
		return {ok: false, unclearReason: `Price not within ${proximityPct}% of resistance entry.`};
	}
	return okLevels(entry, inv, 'inside_pattern', 'bounce', 'short');
}

export function resolvePatternLimitLevels(input: ResolvePatternLimitInput): ResolvePatternLimitResult {
	const {
		patternId,
		lastClose,
		keyLevels,
		breakTolerancePct = DEFAULT_BREAK_TOLERANCE_PCT,
		entryProximityPct = DEFAULT_ENTRY_PROXIMITY_PCT,
	} = input;
	const bounds = boundaryAtRightEdge(keyLevels);
	const phase =
		bounds != null
			? patternPhase(lastClose, bounds.support, bounds.resistance, breakTolerancePct)
			: 'inside';

	switch (patternId) {
		case 'falling_wedge': {
			if (!bounds) {
				return {ok: false, unclearReason: 'Missing wedge boundary levels.'};
			}
			return boundaryLong(
				{price: bounds.support, label: bounds.supportLabel},
				{price: bounds.resistance, label: bounds.resistanceLabel},
				phase,
				entryProximityPct,
				lastClose,
				false,
			);
		}
		case 'rising_wedge': {
			if (!bounds) {
				return {ok: false, unclearReason: 'Missing wedge boundary levels.'};
			}
			return boundaryShort(
				{price: bounds.support, label: bounds.supportLabel},
				{price: bounds.resistance, label: bounds.resistanceLabel},
				phase,
				entryProximityPct,
				lastClose,
				false,
			);
		}
		case 'symmetrical_triangle': {
			if (!bounds) {
				return {ok: false, unclearReason: 'Missing triangle boundary levels.'};
			}
			if (phase === 'broken_above') {
				return boundaryLong(
					{price: bounds.support, label: bounds.supportLabel},
					{price: bounds.resistance, label: bounds.resistanceLabel},
					phase,
					entryProximityPct,
					lastClose,
					true,
				);
			}
			if (phase === 'broken_below') {
				return boundaryShort(
					{price: bounds.support, label: bounds.supportLabel},
					{price: bounds.resistance, label: bounds.resistanceLabel},
					phase,
					entryProximityPct,
					lastClose,
					true,
				);
			}
			return {ok: false, unclearReason: 'Symmetrical triangle — no trade until breakout.'};
		}
		case 'ascending_triangle': {
			if (!bounds) {
				return {ok: false, unclearReason: 'Missing triangle boundary levels.'};
			}
			const flat = flatResistance(keyLevels);
			const res = flat ?? {price: bounds.resistance, label: bounds.resistanceLabel};
			const sup = {price: bounds.support, label: bounds.supportLabel};
			if (phase === 'broken_above') {
				return okLevels(
					{price: res.price, label: `${res.label} retest`},
					{price: sup.price, label: `${sup.label} pattern fail`},
					'post_breakout_retest',
					'retest',
					'long',
				);
			}
			const entry = {price: sup.price, label: `${sup.label} bounce`};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of support entry.`};
			}
			return okLevels(
				entry,
				{price: sup.price, label: `${sup.label} pattern fail`},
				'inside_pattern',
				'bounce',
				'long',
			);
		}
		case 'descending_triangle': {
			if (!bounds) {
				return {ok: false, unclearReason: 'Missing triangle boundary levels.'};
			}
			const flat = flatSupport(keyLevels);
			const sup = flat ?? {price: bounds.support, label: bounds.supportLabel};
			const res = {price: bounds.resistance, label: bounds.resistanceLabel};
			if (phase === 'broken_below') {
				return okLevels(
					{price: sup.price, label: `${sup.label} retest`},
					{price: res.price, label: `${res.label} pattern fail`},
					'post_breakout_retest',
					'retest',
					'short',
				);
			}
			const entry = {price: res.price, label: `${res.label} bounce`};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of resistance entry.`};
			}
			return okLevels(
				entry,
				{price: res.price, label: `${res.label} pattern fail`},
				'inside_pattern',
				'bounce',
				'short',
			);
		}
		case 'channel_up': {
			if (!bounds) {
				return {ok: false, unclearReason: 'Missing channel boundary levels.'};
			}
			return boundaryLong(
				{price: bounds.support, label: bounds.supportLabel},
				{price: bounds.resistance, label: bounds.resistanceLabel},
				phase,
				entryProximityPct,
				lastClose,
				false,
			);
		}
		case 'channel_down': {
			if (!bounds) {
				return {ok: false, unclearReason: 'Missing channel boundary levels.'};
			}
			return boundaryShort(
				{price: bounds.support, label: bounds.supportLabel},
				{price: bounds.resistance, label: bounds.resistanceLabel},
				phase,
				entryProximityPct,
				lastClose,
				false,
			);
		}
		case 'double_bottom':
		case 'double_bottom_adam_eve': {
			const neck = necklineLevel(keyLevels);
			const trough = troughLevel(keyLevels);
			if (!neck || !trough) {
				return {ok: false, unclearReason: 'Missing double bottom neckline or trough.'};
			}
			if (lastClose > neck.price + tolPrice(neck.price, breakTolerancePct)) {
				return okLevels(
					{price: neck.price, label: 'neckline retest'},
					{price: trough.price, label: 'trough pattern fail'},
					'post_breakout_retest',
					'retest',
					'long',
				);
			}
			const entry = {price: trough.price, label: 'trough bounce'};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of trough entry.`};
			}
			return okLevels(
				entry,
				{price: trough.price, label: 'trough pattern fail'},
				'inside_pattern',
				'bounce',
				'long',
			);
		}
		case 'double_top': {
			const neck = necklineLevel(keyLevels);
			const peak = peakLevel(keyLevels);
			if (!neck || !peak) {
				return {ok: false, unclearReason: 'Missing double top neckline or peak.'};
			}
			if (lastClose < neck.price - tolPrice(neck.price, breakTolerancePct)) {
				return okLevels(
					{price: neck.price, label: 'neckline retest'},
					{price: peak.price, label: 'peak pattern fail'},
					'post_breakout_retest',
					'retest',
					'short',
				);
			}
			const entry = {price: peak.price, label: 'peak bounce'};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of peak entry.`};
			}
			return okLevels(
				entry,
				{price: peak.price, label: 'peak pattern fail'},
				'inside_pattern',
				'bounce',
				'short',
			);
		}
		case 'inverse_head_and_shoulders': {
			const neck = necklineLevel(keyLevels);
			const head = levelMinByHint(keyLevels, ['head', 'h', 'trough']);
			if (!neck || !head) {
				return {ok: false, unclearReason: 'Missing inverse H&S neckline or head.'};
			}
			if (lastClose > neck.price + tolPrice(neck.price, breakTolerancePct)) {
				return okLevels(
					{price: neck.price, label: 'neckline retest'},
					{price: head.price, label: 'head pattern fail'},
					'post_breakout_retest',
					'retest',
					'long',
				);
			}
			const entry = {price: head.price, label: 'head bounce'};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of head entry.`};
			}
			return okLevels(
				entry,
				{price: head.price, label: 'head pattern fail'},
				'inside_pattern',
				'bounce',
				'long',
			);
		}
		case 'head_and_shoulders': {
			const neck = necklineLevel(keyLevels);
			const head = levelMaxByHint(keyLevels, ['head', 'h', 'peak']);
			if (!neck || !head) {
				return {ok: false, unclearReason: 'Missing H&S neckline or head.'};
			}
			if (lastClose < neck.price - tolPrice(neck.price, breakTolerancePct)) {
				return okLevels(
					{price: neck.price, label: 'neckline retest'},
					{price: head.price, label: 'head pattern fail'},
					'post_breakout_retest',
					'retest',
					'short',
				);
			}
			const entry = {price: head.price, label: 'head bounce'};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of head entry.`};
			}
			return okLevels(
				entry,
				{price: head.price, label: 'head pattern fail'},
				'inside_pattern',
				'bounce',
				'short',
			);
		}
		case 'cup_and_handle': {
			const rim = necklineLevel(keyLevels) ?? levelMaxByHint(keyLevels, ['rim', 'top']);
			const cupLow = levelMinByHint(keyLevels, ['cup', 'bottom', 'handle']);
			const handle = levelMinByHint(keyLevels, ['handle']);
			if (!rim || !cupLow) {
				return {ok: false, unclearReason: 'Missing cup and handle rim or cup low.'};
			}
			const invPrice = handle?.price ?? cupLow.price;
			if (lastClose > rim.price + tolPrice(rim.price, breakTolerancePct)) {
				return okLevels(
					{price: rim.price, label: 'rim retest'},
					{price: invPrice, label: 'cup/handle pattern fail'},
					'post_breakout_retest',
					'retest',
					'long',
				);
			}
			const entry = {price: (handle ?? cupLow).price, label: 'handle bounce'};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of handle entry.`};
			}
			return okLevels(
				entry,
				{price: invPrice, label: 'cup/handle pattern fail'},
				'inside_pattern',
				'bounce',
				'long',
			);
		}
		case 'flag_bullish':
		case 'pennant_bullish': {
			const low = flagLow(keyLevels);
			const high = flagHigh(keyLevels);
			if (!low || !high) {
				return {ok: false, unclearReason: 'Missing flag channel levels.'};
			}
			if (lastClose > high.price + tolPrice(high.price, breakTolerancePct)) {
				return okLevels(
					{price: high.price, label: 'flag upper retest'},
					{price: low.price, label: 'flag low pattern fail'},
					'post_breakout_retest',
					'retest',
					'long',
				);
			}
			const entry = {price: low.price, label: 'flag low bounce'};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of flag support entry.`};
			}
			return okLevels(
				entry,
				{price: low.price, label: 'flag low pattern fail'},
				'inside_pattern',
				'bounce',
				'long',
			);
		}
		case 'flag_bearish':
		case 'pennant_bearish': {
			const low = flagLow(keyLevels);
			const high = flagHigh(keyLevels);
			if (!low || !high) {
				return {ok: false, unclearReason: 'Missing flag channel levels.'};
			}
			if (lastClose < low.price - tolPrice(low.price, breakTolerancePct)) {
				return okLevels(
					{price: low.price, label: 'flag lower retest'},
					{price: high.price, label: 'flag high pattern fail'},
					'post_breakout_retest',
					'retest',
					'short',
				);
			}
			const entry = {price: high.price, label: 'flag upper bounce'};
			if (!withinEntryProximity(lastClose, entry.price, entryProximityPct)) {
				return {ok: false, unclearReason: `Price not within ${entryProximityPct}% of flag resistance entry.`};
			}
			return okLevels(
				entry,
				{price: high.price, label: 'flag high pattern fail'},
				'inside_pattern',
				'bounce',
				'short',
			);
		}
		case 'trendline_breakout_bullish':
		case 'trendline_breakout_retest_bullish': {
			const brk = necklineLevel(keyLevels) ?? levelByLabels(keyLevels, ['BO', 'break']);
			const inv = levelMinByHint(keyLevels, ['low', 'lo', 'support', 'swing']);
			if (!brk) {
				return {ok: false, unclearReason: 'Missing trendline break level.'};
			}
			const invLevel = inv ?? {price: brk.price * 0.98, label: 'below break'};
			return okLevels(
				{price: brk.price, label: 'break retest'},
				{price: Math.min(invLevel.price, brk.price * 0.999), label: invLevel.label},
				'post_breakout_retest',
				'retest',
				'long',
			);
		}
		case 'trendline_breakout_bearish':
		case 'trendline_breakout_retest_bearish': {
			const brk = necklineLevel(keyLevels) ?? levelByLabels(keyLevels, ['BO', 'break']);
			const inv = levelMaxByHint(keyLevels, ['high', 'hi', 'resistance', 'swing']);
			if (!brk) {
				return {ok: false, unclearReason: 'Missing trendline break level.'};
			}
			const invLevel = inv ?? {price: brk.price * 1.02, label: 'above break'};
			return okLevels(
				{price: brk.price, label: 'break retest'},
				{price: Math.max(invLevel.price, brk.price * 1.001), label: invLevel.label},
				'post_breakout_retest',
				'retest',
				'short',
			);
		}
		default:
			return {ok: false, unclearReason: `Unsupported pattern ${patternId} for limit entry rules.`};
	}
}
