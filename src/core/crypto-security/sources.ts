export const CRYPTO_SECURITY_SOURCE_IDS = [
	'quillaudits',
	'slowmist',
	'immunefi',
	'blocksec',
	'certik',
	'rekt',
	'trail-of-bits',
] as const;

export type CryptoSecuritySourceId = (typeof CRYPTO_SECURITY_SOURCE_IDS)[number];

export type CryptoSecuritySource = {
	id: CryptoSecuritySourceId;
	displayName: string;
	url: string;
};

/** Free public RSS feeds. No API key. Add more outlets here as they are confirmed. */
export const CRYPTO_SECURITY_SOURCES: readonly CryptoSecuritySource[] = [
	{
		id: 'quillaudits',
		displayName: 'QuillAudits',
		url: 'https://quillaudits.medium.com/feed',
	},
	{
		id: 'slowmist',
		displayName: 'SlowMist',
		url: 'https://slowmist.medium.com/feed',
	},
	{
		id: 'immunefi',
		displayName: 'Immunefi',
		url: 'https://immunefi.com/blog/rss/',
	},
	{
		id: 'blocksec',
		displayName: 'BlockSec',
		url: 'https://blocksecteam.medium.com/feed',
	},
	{
		id: 'certik',
		displayName: 'CertiK',
		url: 'https://certik.medium.com/feed',
	},
	{
		id: 'rekt',
		displayName: 'Rekt',
		url: 'https://www.rekt.news/rss/feed.xml',
	},
	{
		id: 'trail-of-bits',
		displayName: 'Trail of Bits',
		url: 'https://blog.trailofbits.com/feed/',
	},
];

const BY_ID = new Map(CRYPTO_SECURITY_SOURCES.map(source => [source.id, source]));

export function isCryptoSecuritySourceId(value: string): value is CryptoSecuritySourceId {
	return BY_ID.has(value as CryptoSecuritySourceId);
}

export function cryptoSecuritySourceById(id: CryptoSecuritySourceId): CryptoSecuritySource {
	const source = BY_ID.get(id);
	if (!source) {
		throw new Error(`Unknown crypto-security source: ${id}`);
	}
	return source;
}

export function resolveCryptoSecuritySources(
	sourceId?: string,
): {ok: true; sources: readonly CryptoSecuritySource[]} | {ok: false; reason: string} {
	if (sourceId === undefined || sourceId === '') {
		return {ok: true, sources: CRYPTO_SECURITY_SOURCES};
	}
	if (!isCryptoSecuritySourceId(sourceId)) {
		return {
			ok: false,
			reason: `Unknown sourceId "${sourceId}". Use list_crypto_security_sources for ids: ${CRYPTO_SECURITY_SOURCE_IDS.join(', ')}.`,
		};
	}
	return {ok: true, sources: [cryptoSecuritySourceById(sourceId)]};
}
