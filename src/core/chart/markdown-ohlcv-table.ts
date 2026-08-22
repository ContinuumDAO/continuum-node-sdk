/** Vendor-neutral markdown OHLCV table extraction (Date / Open / High / Low / Close / Volume). */

import {coerceFiniteNumber} from './point-normalize.js';

export type MarkdownOhlcvTableMeta = {
	title?: string;
	label?: string;
};

const HEADER_FIELD: Record<string, 'date' | 'open' | 'high' | 'low' | 'close' | 'volume'> = {
	date: 'date',
	time: 'date',
	timestamp: 'date',
	open: 'open',
	high: 'high',
	low: 'low',
	close: 'close',
	volume: 'volume',
	vol: 'volume',
};

const TICKER_IN_PREAMBLE = /\b(?:prices?|ohlcv|daily)\s+for\s+([A-Z][A-Z0-9.-]{0,9})\b/i;

function normalizeHeaderCell(cell: string): string {
	return cell.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function splitMarkdownRow(line: string): string[] | null {
	const trimmed = line.trim();
	if (!trimmed.includes('|')) {
		return null;
	}
	const parts = trimmed.split('|');
	if (parts.length > 0 && parts[0]!.trim() === '') {
		parts.shift();
	}
	if (parts.length > 0 && parts[parts.length - 1]!.trim() === '') {
		parts.pop();
	}
	if (parts.length < 2) {
		return null;
	}
	return parts.map(part => part.trim());
}

function isSeparatorRow(cells: string[]): boolean {
	return cells.every(cell => {
		const value = cell.replace(/\s/g, '');
		return value === '' || /^:?-+:?$/.test(value);
	});
}

function parseNumericCell(raw: string): number | null {
	const cleaned = raw.replace(/,/g, '').trim();
	if (!cleaned || cleaned === '—' || cleaned === '-') {
		return null;
	}
	return coerceFiniteNumber(cleaned);
}

function headerMap(cells: string[]): Partial<Record<'date' | 'open' | 'high' | 'low' | 'close' | 'volume', number>> | null {
	const map: Partial<Record<'date' | 'open' | 'high' | 'low' | 'close' | 'volume', number>> = {};
	for (let i = 0; i < cells.length; i++) {
		const field = HEADER_FIELD[normalizeHeaderCell(cells[i]!)];
		if (field && map[field] == null) {
			map[field] = i;
		}
	}
	if (
		map.date == null ||
		map.open == null ||
		map.high == null ||
		map.low == null ||
		map.close == null
	) {
		return null;
	}
	return map;
}

/** Pull candle rows from a markdown table with Date + OHLC columns. */
export function extractOhlcvBarsFromMarkdownTable(text: string): Record<string, unknown>[] | null {
	const lines = text.split(/\r?\n/);
	let columns: Partial<Record<'date' | 'open' | 'high' | 'low' | 'close' | 'volume', number>> | null =
		null;
	const bars: Record<string, unknown>[] = [];
	for (const line of lines) {
		const cells = splitMarkdownRow(line);
		if (!cells) {
			if (columns && bars.length > 0) {
				break;
			}
			continue;
		}
		if (!columns) {
			const mapped = headerMap(cells);
			if (mapped) {
				columns = mapped;
			}
			continue;
		}
		if (isSeparatorRow(cells)) {
			continue;
		}
		const date = cells[columns.date!];
		const open = parseNumericCell(cells[columns.open!] ?? '');
		const high = parseNumericCell(cells[columns.high!] ?? '');
		const low = parseNumericCell(cells[columns.low!] ?? '');
		const close = parseNumericCell(cells[columns.close!] ?? '');
		if (!date || open == null || high == null || low == null || close == null) {
			continue;
		}
		const row: Record<string, unknown> = {date, open, high, low, close};
		if (columns.volume != null) {
			const volume = parseNumericCell(cells[columns.volume] ?? '');
			if (volume != null) {
				row.volume = volume;
			}
		}
		bars.push(row);
	}
	return bars.length > 0 ? bars : null;
}

export function metadataFromMarkdownOhlcvTable(text: string): MarkdownOhlcvTableMeta {
	if (!extractOhlcvBarsFromMarkdownTable(text)) {
		return {};
	}
	const match = text.match(TICKER_IN_PREAMBLE);
	const ticker = match?.[1]?.trim().toUpperCase() ?? '';
	if (!ticker) {
		return {};
	}
	return {title: `${ticker} 1D`, label: ticker};
}

/** MCP `{ content: [{ type: "text", text }] }` and other shallow string blobs. */
export function collectMarkdownOhlcvTextBlobs(payload: unknown): string[] {
	const blobs: string[] = [];
	if (typeof payload === 'string' && payload.includes('|')) {
		blobs.push(payload);
		return blobs;
	}
	if (!payload || typeof payload !== 'object') {
		return blobs;
	}
	if (Array.isArray(payload)) {
		for (const item of payload) {
			blobs.push(...collectMarkdownOhlcvTextBlobs(item));
		}
		return blobs;
	}
	const record = payload as Record<string, unknown>;
	const content = record.content;
	if (Array.isArray(content)) {
		for (const item of content) {
			if (item && typeof item === 'object' && !Array.isArray(item)) {
				const text = (item as Record<string, unknown>).text;
				if (typeof text === 'string' && text.includes('|')) {
					blobs.push(text);
				}
			}
		}
	}
	for (const value of Object.values(record)) {
		if (typeof value === 'string' && value.includes('|')) {
			blobs.push(value);
		}
	}
	return blobs;
}
