export const CRYPTO_LATEST_SOURCE_IDS = [
	'coindesk',
	'the-block',
	'cointelegraph',
	'decrypt',
	'blockworks',
	'the-defiant',
	'bitcoin-magazine',
	'crypto-potato',
	'crypto-slate',
	'good-morning-crypto',
	'openzeppelin',
] as const;

export type CryptoLatestSourceId = (typeof CRYPTO_LATEST_SOURCE_IDS)[number];

export type CryptoLatestSource = {
	id: CryptoLatestSourceId;
	displayName: string;
	url: string;
};

/** Free public RSS feeds. No API key. Add more outlets here as they are confirmed. */
export const CRYPTO_LATEST_SOURCES: readonly CryptoLatestSource[] = [
	{
		id: 'coindesk',
		displayName: 'CoinDesk',
		url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
	},
	{
		id: 'the-block',
		displayName: 'The Block',
		url: 'https://www.theblock.co/rss.xml',
	},
	{
		id: 'cointelegraph',
		displayName: 'Cointelegraph',
		url: 'https://cointelegraph.com/rss',
	},
	{
		id: 'decrypt',
		displayName: 'Decrypt',
		url: 'https://decrypt.co/feed',
	},
	{
		id: 'blockworks',
		displayName: 'Blockworks',
		url: 'https://blockworks.co/feed',
	},
	{
		id: 'the-defiant',
		displayName: 'The Defiant',
		url: 'https://thedefiant.io/feed',
	},
	{
		id: 'bitcoin-magazine',
		displayName: 'Bitcoin Magazine',
		url: 'https://bitcoinmagazine.com/feed',
	},
	{
		id: 'crypto-potato',
		displayName: 'Crypto Potato',
		url: 'https://cryptopotato.com/feed/',
	},
	{
		id: 'crypto-slate',
		displayName: 'CryptoSlate',
		url: 'https://cryptoslate.com/feed/',
	},
	{
		id: 'good-morning-crypto',
		displayName: 'Good Morning Crypto',
		url: 'https://goodmorningcrypto.substack.com/feed',
	},
	{
		id: 'openzeppelin',
		displayName: 'OpenZeppelin',
		url: 'https://www.openzeppelin.com/news/rss.xml',
	},
];

const BY_ID = new Map(CRYPTO_LATEST_SOURCES.map(source => [source.id, source]));

export function isCryptoLatestSourceId(value: string): value is CryptoLatestSourceId {
	return BY_ID.has(value as CryptoLatestSourceId);
}

export function cryptoLatestSourceById(id: CryptoLatestSourceId): CryptoLatestSource {
	const source = BY_ID.get(id);
	if (!source) {
		throw new Error(`Unknown crypto-latest source: ${id}`);
	}
	return source;
}

export function resolveCryptoLatestSources(
	sourceId?: string,
): {ok: true; sources: readonly CryptoLatestSource[]} | {ok: false; reason: string} {
	if (sourceId === undefined || sourceId === '') {
		return {ok: true, sources: CRYPTO_LATEST_SOURCES};
	}
	if (!isCryptoLatestSourceId(sourceId)) {
		return {
			ok: false,
			reason: `Unknown sourceId "${sourceId}". Use list_crypto_sources for ids: ${CRYPTO_LATEST_SOURCE_IDS.join(', ')}.`,
		};
	}
	return {ok: true, sources: [cryptoLatestSourceById(sourceId)]};
}
