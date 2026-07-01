import type {InputProfile} from './schemas.js';
import type {TaSeriesInput} from './schemas.js';

export interface NormalizedSeries {
	values?: number[];
	open?: number[];
	high?: number[];
	low?: number[];
	close?: number[];
	volume?: number[];
	candles?: Array<{
		open: number;
		high: number;
		low: number;
		close: number;
		volume?: number;
	}>;
	range?: {high: number; low: number; trend?: 'up' | 'down'};
	lineA?: number[];
	lineB?: number[];
	prices?: number[];
	swingPoints?: number[];
	inputLength: number;
}

export function maxSeriesLength(): number {
	const raw = process.env.TA_MCP_MAX_SERIES_LENGTH;
	if (raw === undefined || raw === '') {
		return 50_000;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 50_000;
}

function assertMaxLength(label: string, length: number, max: number): void {
	if (length > max) {
		throw new Error(
			`${label} length ${length} exceeds TA_MCP_MAX_SERIES_LENGTH (${max})`,
		);
	}
}

function assertEqualLengths(
	fields: Array<{name: string; values: number[]}>,
): void {
	if (fields.length === 0) {
		return;
	}
	const expected = fields[0]!.values.length;
	const parts = fields.map(f => `${f.name}=${f.values.length}`).join(', ');
	for (const field of fields) {
		if (field.values.length !== expected) {
			throw new Error(
				`Array length mismatch (expected equal lengths, got ${parts})`,
			);
		}
	}
}

function deriveFromCandles(candles: NonNullable<TaSeriesInput['candles']>) {
	return {
		open: candles.map(c => c.open),
		high: candles.map(c => c.high),
		low: candles.map(c => c.low),
		close: candles.map(c => c.close),
		volume: candles.every(c => c.volume !== undefined)
			? candles.map(c => c.volume!)
			: undefined,
		candles,
		inputLength: candles.length,
	};
}

function requireField<T>(
	value: T | undefined,
	profile: InputProfile,
	field: string,
	indicatorId: string,
): T {
	if (value === undefined) {
		throw new Error(
			`${indicatorId} requires inputProfile "${profile}" — provide ${field}. Call list_technical_indicators for requirements.`,
		);
	}
	return value;
}

export function normalizeInput(
	indicatorId: string,
	profile: InputProfile,
	input: TaSeriesInput,
): NormalizedSeries {
	const max = maxSeriesLength();

	if (input.candles && input.candles.length > 0) {
		const derived = deriveFromCandles(input.candles);
		assertMaxLength('candles', derived.inputLength, max);
		return mergeWithExplicit(input, derived, profile, indicatorId, max);
	}

	switch (profile) {
		case 'close_series': {
			const values = requireField(
				input.values ?? input.close,
				profile,
				'values or close (or candles)',
				indicatorId,
			);
			assertMaxLength('values', values.length, max);
			return {values, inputLength: values.length};
		}
		case 'ohl_series': {
			const high = requireField(input.high, profile, 'high', indicatorId);
			const low = requireField(input.low, profile, 'low', indicatorId);
			assertEqualLengths([
				{name: 'high', values: high},
				{name: 'low', values: low},
			]);
			assertMaxLength('high', high.length, max);
			return {high, low, inputLength: high.length};
		}
		case 'ohlc_series': {
			const high = requireField(input.high, profile, 'high', indicatorId);
			const low = requireField(input.low, profile, 'low', indicatorId);
			const close = requireField(input.close, profile, 'close', indicatorId);
			assertEqualLengths([
				{name: 'high', values: high},
				{name: 'low', values: low},
				{name: 'close', values: close},
			]);
			assertMaxLength('high', high.length, max);
			return {high, low, close, inputLength: high.length};
		}
		case 'hlcv_series': {
			const high = requireField(input.high, profile, 'high', indicatorId);
			const low = requireField(input.low, profile, 'low', indicatorId);
			const close = requireField(input.close, profile, 'close', indicatorId);
			const volume = requireField(input.volume, profile, 'volume', indicatorId);
			assertEqualLengths([
				{name: 'high', values: high},
				{name: 'low', values: low},
				{name: 'close', values: close},
				{name: 'volume', values: volume},
			]);
			assertMaxLength('high', high.length, max);
			return {high, low, close, volume, inputLength: high.length};
		}
		case 'close_volume_series': {
			const close = requireField(input.close ?? input.values, profile, 'close or values', indicatorId);
			const volume = requireField(input.volume, profile, 'volume', indicatorId);
			assertEqualLengths([
				{name: 'close', values: close},
				{name: 'volume', values: volume},
			]);
			assertMaxLength('close', close.length, max);
			return {close, volume, inputLength: close.length};
		}
		case 'ohlcv_series': {
			const open = requireField(input.open, profile, 'open', indicatorId);
			const high = requireField(input.high, profile, 'high', indicatorId);
			const low = requireField(input.low, profile, 'low', indicatorId);
			const close = requireField(input.close, profile, 'close', indicatorId);
			const volume = requireField(input.volume, profile, 'volume', indicatorId);
			assertEqualLengths([
				{name: 'open', values: open},
				{name: 'high', values: high},
				{name: 'low', values: low},
				{name: 'close', values: close},
				{name: 'volume', values: volume},
			]);
			assertMaxLength('open', open.length, max);
			return {open, high, low, close, volume, inputLength: open.length};
		}
		case 'candle_objects': {
			throw new Error(
				`${indicatorId} requires inputProfile "candle_objects" — provide candles[]. Call list_technical_indicators for requirements.`,
			);
		}
		case 'range_scalar': {
			const range = requireField(input.range, profile, 'range { high, low }', indicatorId);
			return {range, inputLength: 1};
		}
		case 'dual_series': {
			const lineA = requireField(
				input.valuesA,
				profile,
				'valuesA',
				indicatorId,
			);
			const lineB = requireField(
				input.valuesB,
				profile,
				'valuesB',
				indicatorId,
			);
			assertEqualLengths([
				{name: 'valuesA', values: lineA},
				{name: 'valuesB', values: lineB},
			]);
			assertMaxLength('valuesA', lineA.length, max);
			return {lineA, lineB, inputLength: lineA.length};
		}
		case 'special':
			return normalizeSpecial(indicatorId, input, max);
		default:
			throw new Error(`Unsupported input profile: ${profile}`);
	}
}

function mergeWithExplicit(
	input: TaSeriesInput,
	derived: NormalizedSeries,
	profile: InputProfile,
	indicatorId: string,
	max: number,
): NormalizedSeries {
	const merged: TaSeriesInput = {
		...input,
		open: input.open ?? derived.open,
		high: input.high ?? derived.high,
		low: input.low ?? derived.low,
		close: input.close ?? derived.close,
		volume: input.volume ?? derived.volume,
		values: input.values ?? input.close ?? derived.close,
		candles: derived.candles,
	};
	const withoutCandles = {...merged, candles: undefined};
	switch (profile) {
		case 'candle_objects':
			return {
				candles: derived.candles,
				inputLength: derived.inputLength,
			};
		case 'close_series':
		case 'ohl_series':
		case 'ohlc_series':
		case 'hlcv_series':
		case 'close_volume_series':
		case 'ohlcv_series':
		case 'range_scalar':
		case 'dual_series':
			return normalizeInput(indicatorId, profile, withoutCandles);
		case 'special':
			return normalizeSpecial(indicatorId, merged, max);
		default:
			return normalizeInput(indicatorId, profile, withoutCandles);
	}
}

function normalizeSpecial(
	indicatorId: string,
	input: TaSeriesInput,
	max: number,
): NormalizedSeries {
	if (indicatorId === 'renko') {
		const candles = input.candles;
		if (!candles || candles.length === 0) {
			throw new Error(
				'renko requires candles[] (or derive from explicit OHLC arrays via candles)',
			);
		}
		assertMaxLength('candles', candles.length, max);
		return {candles, inputLength: candles.length};
	}
	if (indicatorId === 'fibonacciProjection') {
		const prices = requireField(
			input.values ?? input.close,
			'special',
			'values or close as prices',
			indicatorId,
		);
		const swingPoints = requireField(
			input.swingPoints,
			'special',
			'swingPoints',
			indicatorId,
		);
		assertMaxLength('values', prices.length, max);
		return {prices, swingPoints, inputLength: prices.length};
	}
	throw new Error(`Special input handling is not defined for ${indicatorId}`);
}
