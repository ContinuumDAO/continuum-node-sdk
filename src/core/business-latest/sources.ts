export const BUSINESS_LATEST_SOURCE_IDS = [
	'bbc-business',
	'cnbc-business',
	'marketwatch',
	'forbes-business',
	'reuters-world',
	'rt-business',
] as const;

export type BusinessLatestSourceId = (typeof BUSINESS_LATEST_SOURCE_IDS)[number];

export type BusinessLatestSource = {
	id: BusinessLatestSourceId;
	displayName: string;
	url: string;
};

/** Free public RSS feeds. No API key. */
export const BUSINESS_LATEST_SOURCES: readonly BusinessLatestSource[] = [
	{
		id: 'bbc-business',
		displayName: 'BBC Business',
		url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
	},
	{
		id: 'cnbc-business',
		displayName: 'CNBC Business',
		url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664',
	},
	{
		id: 'marketwatch',
		displayName: 'MarketWatch Top Stories',
		url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
	},
	{
		id: 'forbes-business',
		displayName: 'Forbes Business',
		url: 'https://www.forbes.com/business/feed/',
	},
	{
		id: 'reuters-world',
		displayName: 'Reuters World (via Google News)',
		url: 'https://news.google.com/rss/search?q=site:reuters.com+world&hl=en-US&gl=US&ceid=US:en',
	},
	{
		id: 'rt-business',
		displayName: 'RT Business',
		url: 'https://www.rt.com/rss/business',
	},
];

const BY_ID = new Map(BUSINESS_LATEST_SOURCES.map(source => [source.id, source]));

export function isBusinessLatestSourceId(value: string): value is BusinessLatestSourceId {
	return BY_ID.has(value as BusinessLatestSourceId);
}

export function businessLatestSourceById(
	id: BusinessLatestSourceId,
): BusinessLatestSource {
	const source = BY_ID.get(id);
	if (!source) {
		throw new Error(`Unknown business-latest source: ${id}`);
	}
	return source;
}

export function resolveBusinessLatestSources(
	sourceId?: string,
): {ok: true; sources: readonly BusinessLatestSource[]} | {ok: false; reason: string} {
	if (sourceId === undefined || sourceId === '') {
		return {ok: true, sources: BUSINESS_LATEST_SOURCES};
	}
	if (!isBusinessLatestSourceId(sourceId)) {
		return {
			ok: false,
			reason: `Unknown sourceId "${sourceId}". Use list_business_sources for ids: ${BUSINESS_LATEST_SOURCE_IDS.join(', ')}.`,
		};
	}
	return {ok: true, sources: [businessLatestSourceById(sourceId)]};
}
