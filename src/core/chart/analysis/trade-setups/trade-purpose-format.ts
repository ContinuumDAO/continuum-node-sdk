import type {ChartPatternId} from '../../../chart-patterns/types.js';
import type {EntryOffsetMode, PatternEntryPhase} from './pattern-limit-entry.js';

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
	analysisType: 'chart_pattern' | 'key_levels' | 'momentum' | 'candlestick';
	patternId?: ChartPatternId | string;
	entryPhase?: PatternEntryPhase;
	entryOffsetMode?: EntryOffsetMode;
	keyLevelsFraming?: 'bounce' | 'break';
}): string {
	switch (input.analysisType) {
		case 'chart_pattern': {
			const prefix = PATTERN_SETUP_PREFIX[input.patternId as ChartPatternId] ?? 'pat';
			const phase = input.entryPhase === 'post_breakout_retest' ? 'ret' : 'bnc';
			return sanitizeSetupCode(`${prefix}-${phase}`);
		}
		case 'key_levels':
			return input.keyLevelsFraming === 'break' ? 'kl-brk' : 'kl-bnc';
		case 'momentum':
			return 'mom';
		case 'candlestick':
			return 'candle';
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
	symbolShort: string;
	entryBase?: number;
	patternFailureBase?: number;
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
	return 'gmx';
}

export type ParsedTradePurposeMetaCtm1 = {
	protocol: string;
	side: 'long' | 'short';
	setup: string;
	entryEffective?: number;
	patternFailureEffective?: number;
	symbolShort?: string;
	entryBase?: number;
	patternFailureBase?: number;
};

export function parseTradePurposeMetaCtm1(text: string): ParsedTradePurposeMetaCtm1 | null {
	const trimmed = text.trim();
	const pipeIdx = trimmed.indexOf('|');
	const meta = pipeIdx >= 0 ? trimmed.slice(0, trimmed.indexOf(' · ') >= 0 ? trimmed.indexOf(' · ') : trimmed.length) : trimmed;
	if (!meta.startsWith('ctm1|')) {
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
	};
	for (const segment of segments.slice(4)) {
		const eq = segment.indexOf('=');
		if (eq <= 0) {
			continue;
		}
		const key = segment.slice(0, eq);
		const val = Number(segment.slice(eq + 1));
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
