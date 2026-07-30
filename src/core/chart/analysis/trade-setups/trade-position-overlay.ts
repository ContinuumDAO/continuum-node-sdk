import type {ChartTradePositionOverlay} from '../../overlay-schemas.js';
import {
	DEFAULT_ASSUMED_LEVERAGE,
	tradeLevelsLiquidationAndRatio,
} from './trade-ratio.js';
import {isFiniteTradePrice} from './shared.js';

export type TradeSetupLevelsSource = {
	side?: string;
	status?: string;
	triggerPrice?: number;
	entryPrice?: number;
	targetPrice?: number;
	invalidationPrice?: number;
	entry?: {price?: number};
	target?: {price?: number};
	invalidation?: {price?: number};
};

export function tradePositionOverlayFromLevels(input: {
	side: 'long' | 'short';
	entry: number;
	target: number;
	invalidation: number;
	leverage?: number;
	omitTradeRatio?: boolean;
	protocolId?: string | null;
	includeLiquidation?: boolean;
}): ChartTradePositionOverlay | null {
	if (input.omitTradeRatio) {
		return null;
	}
	if (
		!isFiniteTradePrice(input.entry) ||
		!isFiniteTradePrice(input.target) ||
		!isFiniteTradePrice(input.invalidation)
	) {
		return null;
	}
	if (input.side === 'long') {
		if (!(input.target > input.entry && input.entry > input.invalidation)) {
			return null;
		}
	} else if (!(input.target < input.entry && input.entry < input.invalidation)) {
		return null;
	}
	const ratio = tradeLevelsLiquidationAndRatio({
		side: input.side,
		entry: input.entry,
		target: input.target,
		invalidation: input.invalidation,
		leverage: input.leverage ?? DEFAULT_ASSUMED_LEVERAGE,
		protocolId: input.protocolId,
		includeLiquidation: input.includeLiquidation,
	});
	return {
		type: 'trade_position',
		side: input.side,
		entry: input.entry,
		target: input.target,
		invalidation: input.invalidation,
		...(ratio.liquidationPrice != null ? {liquidation: ratio.liquidationPrice} : {}),
		...(ratio.tradeRatio != null ? {tradeRatio: ratio.tradeRatio} : {}),
		showTradeRatio: true,
		id: 'trade_position',
	};
}

function levelPrice(
	direct: number | undefined,
	nested: {price?: number} | undefined,
	fallback?: number,
): number | undefined {
	if (isFiniteTradePrice(direct)) {
		return direct;
	}
	if (nested && isFiniteTradePrice(nested.price)) {
		return nested.price;
	}
	if (isFiniteTradePrice(fallback)) {
		return fallback;
	}
	return undefined;
}

export function tradePositionOverlayFromTradeSetup(
	setup: TradeSetupLevelsSource | null | undefined,
	options?: {
		leverage?: number;
		omitTradeRatio?: boolean;
		protocolId?: string | null;
		includeLiquidation?: boolean;
	},
): ChartTradePositionOverlay | null {
	if (!setup || options?.omitTradeRatio) {
		return null;
	}
	const side = setup.side === 'long' || setup.side === 'short' ? setup.side : null;
	if (!side) {
		return null;
	}
	const entry = levelPrice(setup.triggerPrice, setup.entry, setup.entryPrice);
	const target = levelPrice(setup.targetPrice, setup.target);
	const invalidation = levelPrice(setup.invalidationPrice, setup.invalidation);
	if (entry == null || target == null || invalidation == null) {
		return null;
	}
	return tradePositionOverlayFromLevels({
		side,
		entry,
		target,
		invalidation,
		leverage: options?.leverage,
		omitTradeRatio: options?.omitTradeRatio,
		protocolId: options?.protocolId,
		includeLiquidation: options?.includeLiquidation,
	});
}

/** Pull a trade-setup-like object from analyze_* analysis payloads. */
export function tradeSetupFromAnalysis(
	analysis: Record<string, unknown> | null | undefined,
): TradeSetupLevelsSource | null {
	if (!analysis) {
		return null;
	}
	const keys = [
		'chartPatternTradeSetup',
		'trendStructureTradeSetup',
		'elliottWaveTradeSetup',
		'keyLevelsTradeSetup',
		'keyLevelFibTradeSetup',
		'momentumTradeSetup',
		'divergenceTradeSetup',
		'rangeVolatilityTradeSetup',
		'bollingerTradeSetup',
		'donchianTradeSetup',
		'supertrendTradeSetup',
		'ichimokuTradeSetup',
		'zScoreTradeSetup',
		'movingAveragesTradeSetup',
		'candlestickTradeSetup',
	];
	for (const key of keys) {
		const raw = analysis[key];
		if (raw && typeof raw === 'object') {
			return raw as TradeSetupLevelsSource;
		}
	}
	for (const [key, raw] of Object.entries(analysis)) {
		if (key.endsWith('TradeSetup') && raw && typeof raw === 'object') {
			return raw as TradeSetupLevelsSource;
		}
	}
	return null;
}
