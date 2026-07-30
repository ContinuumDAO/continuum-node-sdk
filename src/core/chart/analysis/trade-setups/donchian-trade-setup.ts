import type {EntryOffsetMode} from './pattern-limit-entry.js';
import type {TradeSetupSide, TradeSetupStatus} from './shared.js';
import {isFiniteTradePrice} from './shared.js';
import {tradeDeskConfig, tradeDeskDefaultPcts} from './trade-desk-defaults.js';

export const DEFAULT_DONCHIAN_PERIOD = 20;
export const DEFAULT_DONCHIAN_ENTRY_MODE = 'retest' as const;
export const DEFAULT_DONCHIAN_BREAK_LOOKBACK = 30;
/** Target = entry ± (multiple × ATR). Desk: universal.donchianTargetAtrMultiple. */
export const DEFAULT_DONCHIAN_TARGET_ATR_MULTIPLE = 3;

export type DonchianEntryMode = 'retest' | 'immediate';

export type DonchianTradeSetup = {
	status: TradeSetupStatus;
	source: 'donchian_breakout';
	entryMode: DonchianEntryMode;
	lastClose: number;
	upper: number;
	middle: number;
	lower: number;
	priorUpper: number;
	priorLower: number;
	channelWidth: number;
	period: number;
	entryProximityPct: number;
	entryOffsetMode: EntryOffsetMode;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	/** ATR at last bar used for target distance (entry ± multiple × ATR). */
	atrAtLastBar?: number;
	/** Desk multiple for ATR target (default 3). */
	targetAtrMultiple: number;
	setupPurposeCode: string;
	invalidated: boolean;
	side: TradeSetupSide;
	brokeOnLastBar: boolean;
	breakBarIndex?: number;
	entryPrice?: number;
	entryLabel?: string;
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
	conditionalNote: string;
	confidence: number;
	unclearReason?: string;
	/** Nested when primary mode is retest. */
	immediateAlternative?: DonchianTradeSetup | null;
	/** Nested when primary mode is immediate. */
	breakRetestAlternative?: DonchianTradeSetup | null;
};

export type DonchianChannelPoint = {
	upper: number;
	middle: number;
	lower: number;
};

function withinPriceProximity(
	lastClose: number,
	entryPrice: number,
	proximityPct: number,
): boolean {
	if (!isFiniteTradePrice(lastClose) || !isFiniteTradePrice(entryPrice) || entryPrice === 0) {
		return false;
	}
	return (Math.abs(lastClose - entryPrice) / Math.abs(entryPrice)) * 100 <= proximityPct;
}

function resolveTargetAtrMultiple(raw: number | undefined): number {
	if (raw != null && Number.isFinite(raw) && raw > 0) {
		return raw;
	}
	return DEFAULT_DONCHIAN_TARGET_ATR_MULTIPLE;
}

/** Target = breakout entry ± (multiple × ATR); invalidation = Donchian mid. */
function donchianTargetAndInvalidation(input: {
	side: TradeSetupSide;
	status: TradeSetupStatus;
	entryPrice: number | undefined;
	middle: number;
	atr: number | null | undefined;
	targetAtrMultiple: number;
}): {
	targetPrice?: number;
	targetLabel?: string;
	invalidationPrice?: number;
	invalidationLabel?: string;
} {
	if (input.status !== 'clear' || (input.side !== 'long' && input.side !== 'short')) {
		return {};
	}
	const invalidationPrice = isFiniteTradePrice(input.middle) ? input.middle : undefined;
	const invalidationLabel =
		invalidationPrice != null ? 'Donchian mid-channel' : undefined;
	const atr = input.atr;
	const multiple = input.targetAtrMultiple;
	let targetPrice: number | undefined;
	let targetLabel: string | undefined;
	if (
		input.entryPrice != null &&
		isFiniteTradePrice(input.entryPrice) &&
		atr != null &&
		Number.isFinite(atr) &&
		atr > 0
	) {
		const distance = multiple * atr;
		targetPrice =
			input.side === 'long' ? input.entryPrice + distance : input.entryPrice - distance;
		targetLabel =
			input.side === 'long'
				? `entry + ${multiple}× ATR`
				: `entry - ${multiple}× ATR`;
	}
	return {
		...(targetPrice != null && targetLabel ? {targetPrice, targetLabel} : {}),
		...(invalidationPrice != null && invalidationLabel
			? {invalidationPrice, invalidationLabel}
			: {}),
	};
}

function baseSetupFields(input: {
	lastClose: number;
	upper: number;
	middle: number;
	lower: number;
	priorUpper: number;
	priorLower: number;
	period: number;
	entryMode: DonchianEntryMode;
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	atrAtLastBar?: number;
	targetAtrMultiple: number;
}): Omit<
	DonchianTradeSetup,
	| 'status'
	| 'setupPurposeCode'
	| 'invalidated'
	| 'side'
	| 'brokeOnLastBar'
	| 'conditionalNote'
	| 'confidence'
	| 'entryOffsetMode'
	| 'immediateAlternative'
	| 'breakRetestAlternative'
> {
	const channelWidth = input.upper - input.lower;
	return {
		source: 'donchian_breakout',
		entryMode: input.entryMode,
		lastClose: input.lastClose,
		upper: input.upper,
		middle: input.middle,
		lower: input.lower,
		priorUpper: input.priorUpper,
		priorLower: input.priorLower,
		channelWidth,
		period: input.period,
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
		targetAtrMultiple: input.targetAtrMultiple,
		...(input.atrAtLastBar != null && Number.isFinite(input.atrAtLastBar) && input.atrAtLastBar > 0
			? {atrAtLastBar: input.atrAtLastBar}
			: {}),
	};
}

export function buildImmediateDonchianSetup(input: {
	lastClose: number;
	prevClose: number;
	upper: number;
	middle: number;
	lower: number;
	priorUpper: number;
	priorLower: number;
	period: number;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	atr?: number | null;
	targetAtrMultiple?: number;
}): DonchianTradeSetup | null {
	const {
		lastClose,
		prevClose,
		upper,
		middle,
		lower,
		priorUpper,
		priorLower,
		period,
	} = input;
	if (
		![lastClose, prevClose, upper, middle, lower, priorUpper, priorLower].every(isFiniteTradePrice) ||
		upper <= lower ||
		priorUpper <= priorLower
	) {
		return null;
	}

	const desk = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	});
	const targetAtrMultiple = resolveTargetAtrMultiple(input.targetAtrMultiple);
	const atr =
		input.atr != null && Number.isFinite(input.atr) && input.atr > 0 ? input.atr : undefined;
	const base = baseSetupFields({
		lastClose,
		upper,
		middle,
		lower,
		priorUpper,
		priorLower,
		period,
		entryMode: 'immediate',
		entryProximityPct: desk.entryProximityPct,
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		atrAtLastBar: atr,
		targetAtrMultiple,
	});

	const brokeLong = prevClose <= priorUpper && lastClose > priorUpper;
	const brokeShort = prevClose >= priorLower && lastClose < priorLower;
	const holdingLong = lastClose > priorUpper;
	const holdingShort = lastClose < priorLower;

	let side: TradeSetupSide = 'neutral';
	let brokeOnLastBar = false;
	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.4;
	let conditionalNote = 'No Donchian channel breakout — price inside prior channel.';
	let unclearReason = 'No immediate Donchian breakout on the latest bar.';

	if (brokeLong || (holdingLong && !holdingShort)) {
		side = 'long';
		brokeOnLastBar = brokeLong;
		conditionalNote = brokeLong
			? 'Fresh bullish Donchian breakout above prior channel high.'
			: 'Price holding above prior Donchian high — continuation long.';
		const nearEntry = withinPriceProximity(lastClose, priorUpper, desk.entryProximityPct);
		if (brokeLong || nearEntry) {
			status = 'clear';
			unclearReason = '';
			confidence = brokeLong ? 0.58 : 0.5;
		} else {
			unclearReason = `Price extended beyond prior high — not within ${desk.entryProximityPct}% of breakout entry.`;
		}
	} else if (brokeShort || holdingShort) {
		side = 'short';
		brokeOnLastBar = brokeShort;
		conditionalNote = brokeShort
			? 'Fresh bearish Donchian breakout below prior channel low.'
			: 'Price holding below prior Donchian low — continuation short.';
		const nearEntry = withinPriceProximity(lastClose, priorLower, desk.entryProximityPct);
		if (brokeShort || nearEntry) {
			status = 'clear';
			unclearReason = '';
			confidence = brokeShort ? 0.58 : 0.5;
		} else {
			unclearReason = `Price extended beyond prior low — not within ${desk.entryProximityPct}% of breakout entry.`;
		}
	}

	const entryPrice =
		status === 'clear' && side === 'long'
			? priorUpper
			: status === 'clear' && side === 'short'
				? priorLower
				: undefined;
	const entryLabel =
		side === 'long' ? 'prior Donchian high' : side === 'short' ? 'prior Donchian low' : undefined;
	const levels = donchianTargetAndInvalidation({
		side,
		status,
		entryPrice,
		middle,
		atr,
		targetAtrMultiple,
	});

	return {
		...base,
		status,
		setupPurposeCode: 'dc-brk',
		invalidated: false,
		side,
		brokeOnLastBar,
		entryOffsetMode: 'bounce',
		conditionalNote,
		confidence,
		...(entryPrice != null && entryLabel ? {entryPrice, entryLabel} : {}),
		...levels,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function buildRetestDonchianSetup(input: {
	closes: number[];
	channels: Array<DonchianChannelPoint | null>;
	lastClose: number;
	upper: number;
	middle: number;
	lower: number;
	priorUpper: number;
	priorLower: number;
	period: number;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	atr?: number | null;
	targetAtrMultiple?: number;
	lookback?: number;
}): DonchianTradeSetup | null {
	const {closes, channels, lastClose, upper, middle, lower, priorUpper, priorLower, period} =
		input;
	if (
		![lastClose, upper, middle, lower, priorUpper, priorLower].every(isFiniteTradePrice) ||
		closes.length < 3 ||
		channels.length !== closes.length
	) {
		return null;
	}

	const desk = tradeDeskConfig({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	});
	const targetAtrMultiple = resolveTargetAtrMultiple(input.targetAtrMultiple);
	const atr =
		input.atr != null && Number.isFinite(input.atr) && input.atr > 0 ? input.atr : undefined;
	const lookback = input.lookback ?? DEFAULT_DONCHIAN_BREAK_LOOKBACK;
	const lastIndex = closes.length - 1;
	const start = Math.max(period, lastIndex - lookback + 1);

	let breakIndex = -1;
	let side: TradeSetupSide = 'neutral';
	let brokenBand = 0;

	for (let i = start; i <= lastIndex; i++) {
		const prior = channels[i - 1];
		const prevClose = closes[i - 1];
		const curClose = closes[i];
		if (
			prior == null ||
			prevClose == null ||
			curClose == null ||
			!isFiniteTradePrice(prior.upper) ||
			!isFiniteTradePrice(prior.lower)
		) {
			continue;
		}
		if (prevClose <= prior.upper && curClose > prior.upper) {
			breakIndex = i;
			side = 'long';
			brokenBand = prior.upper;
		} else if (prevClose >= prior.lower && curClose < prior.lower) {
			breakIndex = i;
			side = 'short';
			brokenBand = prior.lower;
		}
	}

	const base = baseSetupFields({
		lastClose,
		upper,
		middle,
		lower,
		priorUpper,
		priorLower,
		period,
		entryMode: 'retest',
		entryProximityPct: desk.entryProximityPct,
		entryOffsetPct: desk.entryOffsetPct,
		invalidationOffsetPct: desk.invalidationOffsetPct,
		atrAtLastBar: atr,
		targetAtrMultiple,
	});

	if (breakIndex < 0 || side === 'neutral') {
		return {
			...base,
			status: 'unclear',
			setupPurposeCode: 'dc-ret',
			invalidated: false,
			side: 'neutral',
			brokeOnLastBar: false,
			entryOffsetMode: 'retest',
			conditionalNote: 'No recent Donchian breakout to retest.',
			confidence: 0.35,
			unclearReason: 'No channel break found in lookback — wait for breakout then retest.',
		};
	}

	const brokeOnLastBar = breakIndex === lastIndex;
	const nearBand = withinPriceProximity(lastClose, brokenBand, desk.entryProximityPct);
	let invalidated = false;
	if (side === 'long' && lastClose < brokenBand) {
		invalidated = true;
	} else if (side === 'short' && lastClose > brokenBand) {
		invalidated = true;
	}

	let status: TradeSetupStatus = 'unclear';
	let confidence = 0.42;
	let conditionalNote =
		side === 'long'
			? 'Bullish Donchian break occurred — wait for retest of broken high.'
			: 'Bearish Donchian break occurred — wait for retest of broken low.';
	let unclearReason = conditionalNote;

	if (invalidated) {
		status = 'unclear';
		conditionalNote =
			side === 'long'
				? 'Retest failed — price closed back below broken Donchian high.'
				: 'Retest failed — price closed back above broken Donchian low.';
		unclearReason = conditionalNote;
	} else if (!brokeOnLastBar && nearBand) {
		status = 'clear';
		unclearReason = '';
		confidence = 0.56;
		conditionalNote =
			side === 'long'
				? 'Post-breakout retest of Donchian high — long entry.'
				: 'Post-breakout retest of Donchian low — short entry.';
	} else if (brokeOnLastBar) {
		unclearReason = 'Fresh breakout on last bar — wait for pullback retest of the broken band.';
		conditionalNote = unclearReason;
	} else {
		unclearReason = `Price not within ${desk.entryProximityPct}% of broken band for retest entry.`;
		conditionalNote = unclearReason;
	}

	const entryPrice = status === 'clear' ? brokenBand : undefined;
	const entryLabel =
		side === 'long' ? 'broken Donchian high' : side === 'short' ? 'broken Donchian low' : undefined;
	const levels = donchianTargetAndInvalidation({
		side,
		status,
		entryPrice,
		middle,
		atr,
		targetAtrMultiple,
	});

	return {
		...base,
		status,
		setupPurposeCode: 'dc-ret',
		invalidated,
		side,
		brokeOnLastBar,
		breakBarIndex: breakIndex,
		entryOffsetMode: 'retest',
		conditionalNote,
		confidence,
		...(entryPrice != null && entryLabel ? {entryPrice, entryLabel} : {}),
		...levels,
		...(unclearReason ? {unclearReason} : {}),
	};
}

export function buildDonchianTradeSetup(input: {
	closes: number[];
	channels: Array<DonchianChannelPoint | null>;
	period: number;
	entryMode?: DonchianEntryMode;
	entryProximityPct?: number;
	entryOffsetPct?: number;
	invalidationOffsetPct?: number;
	atr?: number | null;
	targetAtrMultiple?: number;
}): DonchianTradeSetup | null {
	const {closes, channels, period} = input;
	if (closes.length < period + 1 || channels.length !== closes.length) {
		return null;
	}
	const lastIndex = closes.length - 1;
	const lastClose = closes[lastIndex]!;
	const prevClose = closes[lastIndex - 1]!;
	const current = channels[lastIndex];
	const prior = channels[lastIndex - 1];
	if (current == null || prior == null) {
		return null;
	}

	const entryMode = input.entryMode ?? DEFAULT_DONCHIAN_ENTRY_MODE;
	const deskPcts = tradeDeskDefaultPcts({
		entryProximityPct: input.entryProximityPct,
		entryOffsetPct: input.entryOffsetPct,
		invalidationOffsetPct: input.invalidationOffsetPct,
	});
	const atrLevels = {
		atr: input.atr,
		targetAtrMultiple: resolveTargetAtrMultiple(input.targetAtrMultiple),
	};

	const immediate = buildImmediateDonchianSetup({
		lastClose,
		prevClose,
		upper: current.upper,
		middle: current.middle,
		lower: current.lower,
		priorUpper: prior.upper,
		priorLower: prior.lower,
		period,
		...deskPcts,
		...atrLevels,
	});
	const retest = buildRetestDonchianSetup({
		closes,
		channels,
		lastClose,
		upper: current.upper,
		middle: current.middle,
		lower: current.lower,
		priorUpper: prior.upper,
		priorLower: prior.lower,
		period,
		...deskPcts,
		...atrLevels,
	});

	if (entryMode === 'immediate') {
		if (!immediate) {
			return retest;
		}
		return {
			...immediate,
			breakRetestAlternative: retest,
			immediateAlternative: null,
		};
	}

	if (!retest) {
		return immediate;
	}
	return {
		...retest,
		immediateAlternative: immediate,
		breakRetestAlternative: null,
	};
}

export type DonchianTradeIdeaContext = {
	period: number;
	entryMode: DonchianEntryMode;
	setupPurposeCode: string;
	channelWidth: number;
	upper: number;
	middle: number;
	lower: number;
	priorUpper: number;
	priorLower: number;
	invalidated: boolean;
	entryProximityPct: number;
	entryOffsetPct: number;
	invalidationOffsetPct: number;
	atrAtLastBar?: number;
	targetAtrMultiple: number;
};

export function donchianTradeIdeaContextFromSetup(
	setup: DonchianTradeSetup,
): DonchianTradeIdeaContext {
	return {
		period: setup.period,
		entryMode: setup.entryMode,
		setupPurposeCode: setup.setupPurposeCode,
		channelWidth: setup.channelWidth,
		upper: setup.upper,
		middle: setup.middle,
		lower: setup.lower,
		priorUpper: setup.priorUpper,
		priorLower: setup.priorLower,
		invalidated: setup.invalidated,
		entryProximityPct: setup.entryProximityPct,
		entryOffsetPct: setup.entryOffsetPct,
		invalidationOffsetPct: setup.invalidationOffsetPct,
		targetAtrMultiple: setup.targetAtrMultiple,
		...(setup.atrAtLastBar != null ? {atrAtLastBar: setup.atrAtLastBar} : {}),
	};
}

export function normalizeDonchianTradeSetup(setup: DonchianTradeSetup) {
	return {
		status: setup.status,
		side: setup.side,
		confidence: setup.confidence,
		lastClose: setup.lastClose,
		entry:
			setup.status === 'clear' &&
			setup.side !== 'neutral' &&
			setup.entryPrice != null &&
			isFiniteTradePrice(setup.entryPrice)
				? {price: setup.entryPrice, label: setup.entryLabel ?? 'Donchian entry'}
				: undefined,
		...(setup.targetPrice != null && isFiniteTradePrice(setup.targetPrice)
			? {target: {price: setup.targetPrice, label: setup.targetLabel ?? 'Donchian target'}}
			: {}),
		...(setup.invalidationPrice != null && isFiniteTradePrice(setup.invalidationPrice)
			? {
					invalidation: {
						price: setup.invalidationPrice,
						label: setup.invalidationLabel ?? 'Donchian invalidation',
					},
				}
			: {}),
		unclearReason: setup.unclearReason,
	};
}
