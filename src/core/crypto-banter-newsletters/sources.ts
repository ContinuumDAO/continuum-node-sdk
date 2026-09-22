export const CRYPTO_BANTER_SOURCE_IDS = [
	'the-insider',
	'good-morning-crypto',
	'the-daily-candle',
] as const;

export type CryptoBanterSourceId = (typeof CRYPTO_BANTER_SOURCE_IDS)[number];

export type CryptoBanterSource = {
	id: CryptoBanterSourceId;
	displayName: string;
	url: string;
};

/** Free public Substack RSS feeds. No API key. */
export const CRYPTO_BANTER_SOURCES: readonly CryptoBanterSource[] = [
	{
		id: 'the-insider',
		displayName: 'The Insider',
		url: 'https://theinsiderletter.substack.com/feed',
	},
	{
		id: 'good-morning-crypto',
		displayName: 'Good Morning Crypto',
		url: 'https://goodmorningcrypto.substack.com/feed',
	},
	{
		id: 'the-daily-candle',
		displayName: 'The Daily Candle',
		url: 'https://dailycandle.substack.com/feed',
	},
];

const BY_ID = new Map(CRYPTO_BANTER_SOURCES.map(source => [source.id, source]));

export function isCryptoBanterSourceId(value: string): value is CryptoBanterSourceId {
	return BY_ID.has(value as CryptoBanterSourceId);
}

export function cryptoBanterSourceById(id: CryptoBanterSourceId): CryptoBanterSource {
	const source = BY_ID.get(id);
	if (!source) {
		throw new Error(`Unknown crypto-banter-newsletters source: ${id}`);
	}
	return source;
}

export function resolveCryptoBanterSources(
	sourceId?: string,
): {ok: true; sources: readonly CryptoBanterSource[]} | {ok: false; reason: string} {
	if (sourceId === undefined || sourceId === '') {
		return {ok: true, sources: CRYPTO_BANTER_SOURCES};
	}
	if (!isCryptoBanterSourceId(sourceId)) {
		return {
			ok: false,
			reason: `Unknown sourceId "${sourceId}". Use list_crypto_banter_sources for ids: ${CRYPTO_BANTER_SOURCE_IDS.join(', ')}.`,
		};
	}
	return {ok: true, sources: [cryptoBanterSourceById(sourceId)]};
}
