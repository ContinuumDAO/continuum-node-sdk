import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';

export type KeyLevelsTradeSetup = {
	status: TradeSetupStatus;
	source: 'nearest_levels';
	framing: 'bounce' | 'break';
	supportRank: number | null;
	resistanceRank: number | null;
	supportPrice: number | null;
	supportLabel: string;
	resistancePrice: number | null;
	resistanceLabel: string;
	lastClose: number;
	side: TradeSetupSide;
	entryPrice: number;
	entryLabel: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	confidence: number;
	unclearReason?: string;
};

type KeyLevel = {
	price: number;
	kind: 'support' | 'resistance';
	strength: number;
};

export function buildKeyLevelsTradeSetup(input: {
	lastClose: number;
	nearestSupport: {price: number; strength: number} | null;
	nearestResistance: {price: number; strength: number} | null;
	levels: KeyLevel[];
	minConfidence?: number;
}): KeyLevelsTradeSetup | null {
	const minConfidence = input.minConfidence ?? 0.35;
	const close = input.lastClose;
	if (!isFiniteTradePrice(close)) {
		return null;
	}
	const supports = input.levels
		.filter(l => l.kind === 'support')
		.sort((a, b) => b.price - a.price);
	const resistances = input.levels
		.filter(l => l.kind === 'resistance')
		.sort((a, b) => a.price - b.price);

	let side: TradeSetupSide = 'neutral';
	let framing: 'bounce' | 'break' = 'bounce';
	let entryPrice = close;
	let entryLabel = 'last close';
	let targetPrice: number | undefined;
	let targetLabel: string | undefined;
	let invalidationPrice: number | undefined;
	let invalidationLabel: string | undefined;
	let confidence = 0.4;
	let status: TradeSetupStatus = 'unclear';
	let unclearReason = 'No actionable support/resistance framing near last close.';

	if (input.nearestSupport && close >= input.nearestSupport.price * 0.998) {
		side = 'long';
		framing = 'bounce';
		entryPrice = input.nearestSupport.price;
		entryLabel = 'support bounce';
		confidence = Math.min(1, input.nearestSupport.strength / 100);
		const nextResistance = resistances.find(r => r.price > close);
		if (nextResistance) {
			targetPrice = nextResistance.price;
			targetLabel = 'next resistance';
		}
		const lowerSupport = supports.find(s => s.price < input.nearestSupport!.price);
		if (lowerSupport) {
			invalidationPrice = lowerSupport.price;
			invalidationLabel = 'lower support';
		} else {
			invalidationPrice = input.nearestSupport.price * 0.99;
			invalidationLabel = 'support break';
		}
		if (confidence >= minConfidence && isFiniteTradePrice(entryPrice)) {
			status = targetPrice != null ? 'clear' : 'unclear';
			if (status === 'unclear') {
				unclearReason = 'Support bounce framing lacks a measured target at next resistance.';
			} else {
				unclearReason = '';
			}
		}
	} else if (input.nearestResistance && close <= input.nearestResistance.price * 1.002) {
		side = 'short';
		framing = 'break';
		entryPrice = input.nearestResistance.price;
		entryLabel = 'resistance rejection';
		confidence = Math.min(1, input.nearestResistance.strength / 100);
		const nextSupport = supports.find(s => s.price < close);
		if (nextSupport) {
			targetPrice = nextSupport.price;
			targetLabel = 'next support';
		}
		const upperResistance = resistances.find(r => r.price > input.nearestResistance!.price);
		if (upperResistance) {
			invalidationPrice = upperResistance.price;
			invalidationLabel = 'upper resistance';
		} else {
			invalidationPrice = input.nearestResistance.price * 1.01;
			invalidationLabel = 'resistance break';
		}
		if (confidence >= minConfidence && isFiniteTradePrice(entryPrice)) {
			status = targetPrice != null ? 'clear' : 'unclear';
			if (status === 'unclear') {
				unclearReason = 'Resistance framing lacks a measured target at next support.';
			} else {
				unclearReason = '';
			}
		}
	}

	const supportRank =
		input.nearestSupport != null
			? supports.findIndex(s => s.price === input.nearestSupport!.price) + 1 || 1
			: null;
	const resistanceRank =
		input.nearestResistance != null
			? resistances.findIndex(r => r.price === input.nearestResistance!.price) + 1 || 1
			: null;

	return {
		status,
		source: 'nearest_levels',
		framing,
		supportRank: supportRank && supportRank > 0 ? supportRank : null,
		resistanceRank: resistanceRank && resistanceRank > 0 ? resistanceRank : null,
		supportPrice: input.nearestSupport?.price ?? null,
		supportLabel: input.nearestSupport ? 'nearest support' : '',
		resistancePrice: input.nearestResistance?.price ?? null,
		resistanceLabel: input.nearestResistance ? 'nearest resistance' : '',
		lastClose: close,
		side,
		entryPrice,
		entryLabel,
		...(targetPrice != null ? {targetPrice, targetLabel} : {}),
		...(invalidationPrice != null ? {invalidationPrice, invalidationLabel} : {}),
		confidence,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function normalizeKeyLevelsTradeSetup(setup: KeyLevelsTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry: isFiniteTradePrice(setup.entryPrice)
			? {price: setup.entryPrice, label: setup.entryLabel}
			: undefined,
		target:
			setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
				? {price: setup.targetPrice, label: setup.targetLabel}
				: undefined,
		invalidation:
			setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
				? {price: setup.invalidationPrice, label: setup.invalidationLabel}
				: undefined,
		unclearReason: setup.unclearReason,
	};
}
