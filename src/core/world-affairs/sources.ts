export const WORLD_AFFAIRS_SOURCE_IDS = [
	'bbc-world',
	'aljazeera',
	'guardian-world',
	'dw-world',
	'france24',
	'npr',
	'cnn-world',
	'rt-news',
] as const;

export type WorldAffairsSourceId = (typeof WORLD_AFFAIRS_SOURCE_IDS)[number];

export type WorldAffairsSource = {
	id: WorldAffairsSourceId;
	displayName: string;
	url: string;
	biasNote?: string;
};

/** Free public RSS feeds. No API key. */
export const WORLD_AFFAIRS_SOURCES: readonly WorldAffairsSource[] = [
	{
		id: 'bbc-world',
		displayName: 'BBC World',
		url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
	},
	{
		id: 'aljazeera',
		displayName: 'Al Jazeera',
		url: 'https://www.aljazeera.com/xml/rss/all.xml',
	},
	{
		id: 'guardian-world',
		displayName: 'The Guardian World',
		url: 'https://www.theguardian.com/world/rss',
		biasNote: 'Left wing bias',
	},
	{
		id: 'dw-world',
		displayName: 'DW World',
		url: 'https://rss.dw.com/xml/rss-en-world',
	},
	{
		id: 'france24',
		displayName: 'France 24',
		url: 'https://www.france24.com/en/rss',
	},
	{
		id: 'npr',
		displayName: 'NPR News',
		url: 'https://feeds.npr.org/1001/rss.xml',
		biasNote: 'Some political left wing bias',
	},
	{
		id: 'cnn-world',
		displayName: 'CNN World',
		url: 'http://rss.cnn.com/rss/edition_world.rss',
		biasNote: 'Some political left wing bias',
	},
	{
		id: 'rt-news',
		displayName: 'RT News',
		url: 'https://www.rt.com/rss/news',
		biasNote: 'Potential bias',
	},
];

const BY_ID = new Map(WORLD_AFFAIRS_SOURCES.map(source => [source.id, source]));

export function isWorldAffairsSourceId(value: string): value is WorldAffairsSourceId {
	return BY_ID.has(value as WorldAffairsSourceId);
}

export function worldAffairsSourceById(id: WorldAffairsSourceId): WorldAffairsSource {
	const source = BY_ID.get(id);
	if (!source) {
		throw new Error(`Unknown world-affairs source: ${id}`);
	}
	return source;
}

export function resolveWorldAffairsSources(
	sourceId?: string,
): {ok: true; sources: readonly WorldAffairsSource[]} | {ok: false; reason: string} {
	if (sourceId === undefined || sourceId === '') {
		return {ok: true, sources: WORLD_AFFAIRS_SOURCES};
	}
	if (!isWorldAffairsSourceId(sourceId)) {
		return {
			ok: false,
			reason: `Unknown sourceId "${sourceId}". Use list_world_affairs_sources for ids: ${WORLD_AFFAIRS_SOURCE_IDS.join(', ')}.`,
		};
	}
	return {ok: true, sources: [worldAffairsSourceById(sourceId)]};
}
