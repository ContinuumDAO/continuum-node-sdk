/** Vendor-neutral `{ bars }` envelopes with Alpaca-style `t`/`o`/`c` rows or `1Day`-style timeframes. */

export type AlpacaBarsEnvelope = {
	symbol: string;
	rows: unknown[];
	interval?: string;
};

function firstAlpacaStyleBar(rows: unknown[]): Record<string, unknown> | null {
	const first = rows[0];
	if (!first || typeof first !== 'object' || Array.isArray(first)) {
		return null;
	}
	const row = first as Record<string, unknown>;
	const hasVendorT = row.t != null;
	const hasShorthand = row.o != null && row.c != null;
	if (!hasVendorT && !hasShorthand) {
		return null;
	}
	return row;
}

export function looksLikeAlpacaTimeframe(raw: string): boolean {
	return /^\d+(min|hour|day|week|month)$/i.test(raw.trim());
}

function symbolFromBar(row: Record<string, unknown> | null): string {
	if (!row) {
		return '';
	}
	const raw = row.S ?? row.symbol;
	return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Read `{ symbol, timeframe, bars: […] }` or `{ bars: { TICKER: […] } }` from a fetch payload.
 * Ignores Continuum-normalized `{ time, open, close }` rows that lack `t` / `o`+`c`.
 */
export function alpacaBarsEnvelopeFromRecord(
	record: Record<string, unknown>,
): AlpacaBarsEnvelope | null {
	const intervalRaw = record.timeframe ?? record.interval;
	const interval = typeof intervalRaw === 'string' ? intervalRaw.trim() : '';
	const alpacaTf = interval ? looksLikeAlpacaTimeframe(interval) : false;

	if (Array.isArray(record.bars) && record.bars.length > 0) {
		const first = firstAlpacaStyleBar(record.bars);
		if (!first && !alpacaTf) {
			return null;
		}
		const symbolRaw = record.symbol;
		const symbol =
			(typeof symbolRaw === 'string' ? symbolRaw.trim() : '') || symbolFromBar(first);
		if (!symbol) {
			return null;
		}
		return {symbol, rows: record.bars, ...(interval ? {interval} : {})};
	}

	if (record.bars && typeof record.bars === 'object' && !Array.isArray(record.bars)) {
		const map = record.bars as Record<string, unknown>;
		for (const [key, value] of Object.entries(map)) {
			if (!Array.isArray(value) || value.length === 0) {
				continue;
			}
			const first = firstAlpacaStyleBar(value);
			if (!first && !alpacaTf) {
				continue;
			}
			const symbolRaw = record.symbol;
			const symbol =
				(typeof symbolRaw === 'string' ? symbolRaw.trim() : '') || key.trim();
			if (!symbol) {
				continue;
			}
			return {symbol, rows: value, ...(interval ? {interval} : {})};
		}
	}

	return null;
}
