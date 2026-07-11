import {calculateKeyLevelsFromBars, type KeyLevel} from '../levels/key-levels.js';
import type {SdkResult} from '../../result.js';
import {
	buildKeyLevelFibPairs,
	buildKeyLevelMenu,
	type KeyLevelFibPair,
	type KeyLevelMenuEntry,
} from './key-level-menu-summary.js';

export type KeyLevelAnalysisDataset = {
	close: number;
	levels: KeyLevel[];
	levelMenu: KeyLevelMenuEntry[];
	fibPairs: KeyLevelFibPair[];
	nearestSupportRow: KeyLevelMenuEntry | undefined;
	nearestResistanceRow: KeyLevelMenuEntry | undefined;
};

export function lastCloseFromBars(bars: Record<string, unknown>[]): number | null {
	for (let i = bars.length - 1; i >= 0; i--) {
		const raw = bars[i]?.close ?? bars[i]?.c;
		const close = typeof raw === 'number' ? raw : Number(raw);
		if (Number.isFinite(close)) {
			return close;
		}
	}
	return null;
}

/** Shared swing levels, positional menu, and fib pairs for nearest + fibonacci analyses. */
export function buildKeyLevelAnalysisDataset(
	bars: Record<string, unknown>[],
	options?: {maxLevels?: number},
): SdkResult<KeyLevelAnalysisDataset> {
	if (!bars.length) {
		return {ok: false, reason: 'No OHLCV bars.'};
	}
	const close = lastCloseFromBars(bars);
	if (close == null) {
		return {ok: false, reason: 'Could not read last close from bars.'};
	}
	const levels = calculateKeyLevelsFromBars(bars, {maxLevels: options?.maxLevels ?? 8});
	const levelMenu = buildKeyLevelMenu(levels, close);
	const nearestSupportRow = levelMenu.find(m => m.isNearestSupport);
	const nearestResistanceRow = levelMenu.find(m => m.isNearestResistance);
	const tradeAnchorLevel =
		nearestSupportRow != null
			? nearestSupportRow.levelNumber
			: nearestResistanceRow != null
				? nearestResistanceRow.levelNumber
				: null;
	const fibPairs = buildKeyLevelFibPairs(levelMenu, close, tradeAnchorLevel);
	return {
		ok: true,
		data: {
			close,
			levels,
			levelMenu,
			fibPairs,
			nearestSupportRow,
			nearestResistanceRow,
		},
	};
}
