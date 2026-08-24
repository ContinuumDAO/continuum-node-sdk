/** Token/ticker extraction — mirrors scripts/telegram-search/ticker_extract.py */

export const DEFAULT_TICKER_EXCLUDE = new Set([
	'THE',
	'AND',
	'FOR',
	'NOT',
	'YOU',
	'ALL',
	'NEW',
	'USD',
	'API',
	'CEO',
	'DAO',
	'TVL',
	'APR',
	'APY',
	'EVM',
	'NFT',
	'UTC',
	'GMT',
	'AI',
	'USDT',
	'USDC',
	'FAQ',
	'DM',
	'PM',
	'AM',
	'UK',
	'US',
	'EU',
]);

export type TickerDetectionConfig = {
	minLength: number;
	maxLength: number;
	includeBareCaps: boolean;
	exclude: Set<string>;
};

export const DEFAULT_TICKER_DETECTION: TickerDetectionConfig = {
	minLength: 2,
	maxLength: 10,
	includeBareCaps: true,
	exclude: DEFAULT_TICKER_EXCLUDE,
};

export function normalizeTicker(raw: string): string {
	return raw.trim().replace(/^[$#]+/, '').toUpperCase();
}

function symbolPattern(minLength: number, maxLength: number): string {
	const innerMin = Math.max(0, minLength - 1);
	const innerMax = Math.max(0, maxLength - 1);
	return `[A-Za-z][A-Za-z0-9]{${innerMin},${innerMax}}`;
}

export function extractTickers(
	text: string,
	config: TickerDetectionConfig = DEFAULT_TICKER_DETECTION,
): string[] {
	if (!text) {
		return [];
	}
	const sym = symbolPattern(config.minLength, config.maxLength);
	const found = new Set<string>();

	for (const match of text.matchAll(new RegExp(`\\$(${sym})`, 'g'))) {
		const token = match[1]!.toUpperCase();
		if (token.length >= config.minLength && token.length <= config.maxLength) {
			found.add(token);
		}
	}

	for (const match of text.matchAll(new RegExp(`#(${sym})`, 'g'))) {
		const token = match[1]!.toUpperCase();
		if (token.length >= config.minLength && token.length <= config.maxLength) {
			found.add(token);
		}
	}

	if (config.includeBareCaps) {
		for (const match of text.matchAll(new RegExp(`\\b(${sym})\\b`, 'g'))) {
			const token = match[1]!.toUpperCase();
			if (config.exclude.has(token)) {
				continue;
			}
			if (token.length >= config.minLength && token.length <= config.maxLength) {
				found.add(token);
			}
		}
	}

	return [...found].sort();
}

export function findTickersInMessage(
	text: string,
	allowlist: string[] | null,
	config: TickerDetectionConfig = DEFAULT_TICKER_DETECTION,
): string[] {
	if (allowlist && allowlist.length > 0) {
		const matched = new Set<string>();
		for (const raw of allowlist) {
			const sym = normalizeTicker(raw);
			if (!sym || config.exclude.has(sym)) {
				continue;
			}
			const patterns = [`\\$${sym}\\b`, `#${sym}\\b`];
			if (config.includeBareCaps) {
				patterns.push(`\\b${sym}\\b`);
			}
			for (const pattern of patterns) {
				if (new RegExp(pattern, 'i').test(text)) {
					matched.add(sym);
					break;
				}
			}
		}
		return [...matched].sort();
	}
	return extractTickers(text, config);
}

export function tickerDetectionFromYaml(raw: Record<string, unknown> | undefined): TickerDetectionConfig {
	if (!raw) {
		return DEFAULT_TICKER_DETECTION;
	}
	const excludeRaw = raw.exclude;
	const extraExclude = Array.isArray(excludeRaw)
		? excludeRaw.map((x) => String(x).trim().toUpperCase()).filter(Boolean)
		: [];
	const exclude = new Set([...DEFAULT_TICKER_EXCLUDE, ...extraExclude]);
	return {
		minLength: Number(raw.min_length ?? 2),
		maxLength: Number(raw.max_length ?? 10),
		includeBareCaps: raw.include_bare_caps !== false,
		exclude,
	};
}

export function tickerDetectionForPython(config: TickerDetectionConfig): Record<string, unknown> {
	return {
		min_length: config.minLength,
		max_length: config.maxLength,
		include_bare_caps: config.includeBareCaps,
		exclude: [...config.exclude],
	};
}
