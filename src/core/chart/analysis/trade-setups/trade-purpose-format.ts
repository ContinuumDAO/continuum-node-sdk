import type {ChartPatternId} from '../../../chart-patterns/types.js';
import type {EntryOffsetMode, PatternEntryPhase} from './pattern-limit-entry.js';
import {
	formatChartDataPurposeTokens,
	type TradeChartDataPurposeContext,
} from './chart-data-purpose.js';

export type TradePurposeProtocol = 'gmx' | 'hl' | 'uni';

const SETUP_CODE_MAX_RUNES = 10;

const PATTERN_SETUP_PREFIX: Partial<Record<ChartPatternId, string>> = {
	falling_wedge: 'fw',
	rising_wedge: 'rw',
	ascending_triangle: 'asc',
	descending_triangle: 'desc',
	symmetrical_triangle: 'sym',
	channel_up: 'ch-up',
	channel_down: 'ch-dn',
	double_bottom: 'dbl',
	double_bottom_adam_eve: 'dbl',
	double_top: 'dtp',
	inverse_head_and_shoulders: 'ihs',
	head_and_shoulders: 'hs',
	cup_and_handle: 'cup',
	flag_bullish: 'flag',
	flag_bearish: 'flag',
	pennant_bullish: 'flag',
	pennant_bearish: 'flag',
	trendline_breakout_bullish: 'tl',
	trendline_breakout_retest_bullish: 'tl',
	trendline_breakout_bearish: 'tl',
	trendline_breakout_retest_bearish: 'tl',
};

export function tradeSetupPurposeCode(input: {
	analysisType: 'chart_pattern' | 'key_levels' | 'momentum' | 'candlestick' | 'trend_structure';
	patternId?: ChartPatternId | string;
	entryPhase?: PatternEntryPhase;
	entryOffsetMode?: EntryOffsetMode;
	keyLevelsFraming?: 'bounce' | 'break';
	keyLevelsVariant?: 'bounce' | 'rejection' | 'break_retest' | 'fib_retrace' | 'fib_extension' | 'fib_break_retest';
}): string {
	switch (input.analysisType) {
		case 'chart_pattern': {
			const prefix = PATTERN_SETUP_PREFIX[input.patternId as ChartPatternId] ?? 'pat';
			const phase = input.entryPhase === 'post_breakout_retest' ? 'ret' : 'bnc';
			return sanitizeSetupCode(`${prefix}-${phase}`);
		}
		case 'key_levels':
			if (input.keyLevelsVariant === 'fib_retrace') {
				return 'kl-fib';
			}
			if (input.keyLevelsVariant === 'fib_extension') {
				return 'kl-fib-ext';
			}
			if (input.keyLevelsVariant === 'fib_break_retest') {
				return 'kl-fib-ret';
			}
			if (input.keyLevelsVariant === 'break_retest') {
				return 'kl-ret';
			}
			return input.keyLevelsFraming === 'break' ? 'kl-brk' : 'kl-bnc';
		case 'momentum':
			return 'mom';
		case 'candlestick':
			return 'candle';
		case 'trend_structure':
			return 'trend-ret';
		default:
			return 'trade';
	}
}

function sanitizeSetupCode(code: string): string {
	const cleaned = code.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, SETUP_CODE_MAX_RUNES);
	return cleaned || 'trade';
}

export function formatCompactHumanPrice(price: number): string {
	if (!Number.isFinite(price)) {
		return '';
	}
	const abs = Math.abs(price);
	let formatted: string;
	if (abs >= 1000) {
		formatted = price.toFixed(2);
	} else if (abs >= 1) {
		formatted = price.toFixed(4);
	} else {
		formatted = price.toFixed(6);
	}
	return formatted.replace(/\.?0+$/, '') || '0';
}

export type TradePurposeMetaCtm1Input = {
	protocol: TradePurposeProtocol | string;
	side: 'long' | 'short';
	setup: string;
	entryEffective: number;
	patternFailureEffective?: number;
	takeProfitEffective?: number;
	stopLossEffective?: number;
	symbolShort: string;
	entryBase?: number;
	patternFailureBase?: number;
	chartData?: TradeChartDataPurposeContext;
	/** Coin units (Hyperliquid / Arcus perp). Emitted as sz= before symbol. */
	szHuman?: string;
	/** USD notional (GMX / Uniswap). Emitted as szUsd= before symbol. */
	sizeUsdHuman?: string;
};

export type TradePurposeMetaCtm1 = {
	meta: string;
	includeBases: boolean;
};

export function formatTradePurposeMetaCtm1(input: TradePurposeMetaCtm1Input): TradePurposeMetaCtm1 {
	const proto = normalizeProtocol(input.protocol);
	const side = input.side === 'short' ? 'S' : 'L';
	const setup = sanitizeSetupCode(input.setup);
	const sym = input.symbolShort.trim().toUpperCase().split(/[/\s[\]-]/)[0] ?? '';
	const eE = formatCompactHumanPrice(input.entryEffective);
	const parts = [`ctm1`, proto, side, setup, `eE=${eE}`];
	if (input.patternFailureEffective != null && Number.isFinite(input.patternFailureEffective)) {
		parts.push(`pfE=${formatCompactHumanPrice(input.patternFailureEffective)}`);
	}
	if (input.takeProfitEffective != null && Number.isFinite(input.takeProfitEffective)) {
		parts.push(`tpE=${formatCompactHumanPrice(input.takeProfitEffective)}`);
	}
	if (input.stopLossEffective != null && Number.isFinite(input.stopLossEffective)) {
		parts.push(`slE=${formatCompactHumanPrice(input.stopLossEffective)}`);
	}
	parts.push(...formatChartDataPurposeTokens(input.chartData));
	const szHuman = input.szHuman?.trim();
	if (szHuman) {
		parts.push(`sz=${szHuman}`);
	}
	const sizeUsdHuman = input.sizeUsdHuman?.trim();
	if (sizeUsdHuman) {
		parts.push(`szUsd=${sizeUsdHuman}`);
	}
	parts.push(sym);
	let meta = parts.join('|');
	const withBases = [...parts];
	if (input.entryBase != null && Number.isFinite(input.entryBase)) {
		withBases.splice(withBases.length - 1, 0, `eB=${formatCompactHumanPrice(input.entryBase)}`);
	}
	if (input.patternFailureBase != null && Number.isFinite(input.patternFailureBase)) {
		withBases.splice(withBases.length - 1, 0, `pfB=${formatCompactHumanPrice(input.patternFailureBase)}`);
	}
	const basesMeta = withBases.join('|');
	const includeBases = [...basesMeta].length <= 140 && [...basesMeta].length <= 256;
	if (includeBases && basesMeta !== meta) {
		meta = basesMeta;
	}
	return {meta, includeBases};
}

function normalizeProtocol(protocol: string): string {
	const p = protocol.trim().toLowerCase();
	if (p === 'hyperliquid' || p === 'hl') {
		return 'hl';
	}
	if (p === 'uniswap' || p === 'uni') {
		return 'uni';
	}
	if (p === 'arcus' || p === 'arc') {
		return 'arc';
	}
	return 'gmx';
}

/** Split sign-request Purpose into ctm1 prefix and optional prose suffix (` · ` delimiter). */
export function splitSignRequestPurposeText(text: string): {
	fullText: string;
	ctm1Prefix?: string;
	additionalText?: string;
} {
	const fullText = text.trim();
	if (!fullText) {
		return {fullText: ''};
	}
	const dotIdx = fullText.indexOf(' · ');
	if (dotIdx >= 0) {
		const prefix = fullText.slice(0, dotIdx).trim();
		const additionalText = fullText.slice(dotIdx + 3).trim();
		return {
			fullText,
			...(prefix.startsWith('ctm1|') ? {ctm1Prefix: prefix} : {}),
			...(additionalText ? {additionalText} : {}),
		};
	}
	if (fullText.startsWith('ctm1|')) {
		return {fullText, ctm1Prefix: fullText};
	}
	return {fullText, additionalText: fullText};
}

function formatSizeTokenValue(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed || /[|=]/.test(trimmed)) {
		return null;
	}
	return trimmed;
}

export type ParsedTradePurposeMetaCtm1 = {
	protocol: string;
	side: 'long' | 'short';
	setup: string;
	entryEffective?: number;
	patternFailureEffective?: number;
	takeProfitEffective?: number;
	stopLossEffective?: number;
	symbolShort?: string;
	entryBase?: number;
	patternFailureBase?: number;
	/** Coin units from sz= token. */
	szHuman?: string;
	/** USD notional from szUsd= token. */
	sizeUsdHuman?: string;
	/** Prose after ` · ` when parsing full Purpose text. */
	additionalText?: string;
};

export function parseTradePurposeMetaCtm1(text: string): ParsedTradePurposeMetaCtm1 | null {
	const split = splitSignRequestPurposeText(text.trim());
	const meta = split.ctm1Prefix;
	if (!meta?.startsWith('ctm1|')) {
		return null;
	}
	const segments = meta.split('|');
	if (segments.length < 6) {
		return null;
	}
	const sideToken = segments[2];
	const side = sideToken === 'S' ? 'short' : sideToken === 'L' ? 'long' : null;
	if (!side) {
		return null;
	}
	const out: ParsedTradePurposeMetaCtm1 = {
		protocol: segments[1] ?? '',
		side,
		setup: segments[3] ?? '',
		symbolShort: segments.at(-1),
		...(split.additionalText ? {additionalText: split.additionalText} : {}),
	};
	for (const segment of segments.slice(4)) {
		const eq = segment.indexOf('=');
		if (eq <= 0) {
			continue;
		}
		const key = segment.slice(0, eq);
		const rawVal = segment.slice(eq + 1);
		if (key === 'ds' || key === 'iv' || key === 'n') {
			continue;
		}
		if (key === 'sz') {
			const sz = formatSizeTokenValue(rawVal);
			if (sz) {
				out.szHuman = sz;
			}
			continue;
		}
		if (key === 'szUsd') {
			const szUsd = formatSizeTokenValue(rawVal);
			if (szUsd) {
				out.sizeUsdHuman = szUsd;
			}
			continue;
		}
		const val = Number(rawVal);
		if (!Number.isFinite(val)) {
			continue;
		}
		switch (key) {
			case 'eE':
				out.entryEffective = val;
				break;
			case 'pfE':
				out.patternFailureEffective = val;
				break;
			case 'tpE':
				out.takeProfitEffective = val;
				break;
			case 'slE':
				out.stopLossEffective = val;
				break;
			case 'eB':
				out.entryBase = val;
				break;
			case 'pfB':
				out.patternFailureBase = val;
				break;
		}
	}
	return out;
}

export type ResolveTradePurposeTextInput = TradePurposeMetaCtm1Input & {
	purposeText: string;
};

/** Compose ctm1 meta + optional additional suffix unless purposeText is already a full ctm1 string. */
export function resolveTradePurposeTextForBuild(
	input: ResolveTradePurposeTextInput,
): {text: string; error?: string} {
	const purposeTrim = input.purposeText.trim();
	if (purposeTrim.startsWith('ctm1|')) {
		return composeTradePurposeText(purposeTrim, undefined, '');
	}
	const {meta} = formatTradePurposeMetaCtm1(input);
	return composeTradePurposeText(meta, purposeTrim || undefined);
}

export function composeTradePurposeText(
	meta: string,
	additional?: string,
	defaultSuffix = 'agent UI',
	maxRunes = 256,
): {text: string; error?: string} {
	const base = meta.trim();
	let suffix = additional?.trim() ?? '';
	if (!suffix) {
		suffix = defaultSuffix.trim();
	}
	if (suffix && /[|=]/.test(suffix)) {
		return {text: '', error: 'Purpose suffix must not contain | or = characters.'};
	}
	let out = base;
	if (suffix) {
		out = base ? `${base} · ${suffix}` : suffix;
	}
	if (!out) {
		return {text: '', error: 'Purpose text is required.'};
	}
	if ([...out].length > maxRunes) {
		return {text: '', error: `Purpose text exceeds ${maxRunes} runes.`};
	}
	return {text: out};
}
