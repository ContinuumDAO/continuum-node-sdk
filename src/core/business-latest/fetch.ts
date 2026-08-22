import type {SdkResult} from '../result.js';
import {parseRssItems} from '../rss/parse-rss.js';
import type {
	BusinessLatestItem,
	GetBusinessLatestInput,
	GetBusinessLatestOutput,
	ListBusinessSourcesOutput,
	SearchBusinessLatestInput,
} from './schemas.js';
import {
	BUSINESS_LATEST_SOURCES,
	resolveBusinessLatestSources,
	type BusinessLatestSource,
} from './sources.js';

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 8;
const USER_AGENT = 'ContinuumBusinessLatest/1.0 (+https://github.com/ContinuumDAO/continuum-node-sdk)';

export type BusinessLatestFetchDeps = {
	fetchImpl?: typeof fetch;
};

async function fetchFeedXml(
	url: string,
	fetchImpl: typeof fetch,
): Promise<{ok: true; xml: string} | {ok: false; reason: string}> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetchImpl(url, {
			method: 'GET',
			headers: {
				Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
				'User-Agent': USER_AGENT,
				'Cache-Control': 'no-cache',
			},
			signal: controller.signal,
			redirect: 'follow',
		});
		const xml = await resp.text();
		if (!resp.ok) {
			return {ok: false, reason: `HTTP ${resp.status} ${resp.statusText}`.trim()};
		}
		if (!xml.trim()) {
			return {ok: false, reason: 'Empty RSS body'};
		}
		return {ok: true, xml};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message};
	} finally {
		clearTimeout(timer);
	}
}

function limitItems(items: BusinessLatestItem[], limit: number): BusinessLatestItem[] {
	return items
		.slice()
		.sort((a, b) => {
			const aMs = a.publishedAt ? Date.parse(a.publishedAt) : Number.NaN;
			const bMs = b.publishedAt ? Date.parse(b.publishedAt) : Number.NaN;
			if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
				return bMs - aMs;
			}
			return 0;
		})
		.slice(0, limit);
}

async function loadSources(
	sources: readonly BusinessLatestSource[],
	limit: number,
	fetchImpl: typeof fetch,
): Promise<GetBusinessLatestOutput> {
	const settled = await Promise.all(
		sources.map(async source => {
			const fetched = await fetchFeedXml(source.url, fetchImpl);
			if (!fetched.ok) {
				return {
					feed: {
						sourceId: source.id,
						sourceName: source.displayName,
						ok: false,
						itemCount: 0,
						reason: fetched.reason,
					},
					items: [] as BusinessLatestItem[],
				};
			}
			const parsed = parseRssItems(fetched.xml).map(item => ({
				sourceId: source.id,
				sourceName: source.displayName,
				title: item.title,
				url: item.url,
				publishedAt: item.publishedAt,
				publishedRaw: item.publishedRaw,
				summary: item.summary,
			}));
			return {
				feed: {
					sourceId: source.id,
					sourceName: source.displayName,
					ok: parsed.length > 0,
					itemCount: parsed.length,
					reason: parsed.length > 0 ? undefined : 'No RSS items parsed',
				},
				items: parsed,
			};
		}),
	);

	return {
		items: limitItems(
			settled.flatMap(row => row.items),
			limit,
		),
		feeds: settled.map(row => row.feed),
	};
}

export function listBusinessSources(): SdkResult<ListBusinessSourcesOutput> {
	return {
		ok: true,
		data: {
			sources: BUSINESS_LATEST_SOURCES.map(source => ({
				id: source.id,
				displayName: source.displayName,
				url: source.url,
			})),
		},
	};
}

export async function getBusinessLatest(
	input: GetBusinessLatestInput,
	deps: BusinessLatestFetchDeps = {},
): Promise<SdkResult<GetBusinessLatestOutput>> {
	const resolved = resolveBusinessLatestSources(input.sourceId);
	if (!resolved.ok) {
		return resolved;
	}
	const limit = input.limit ?? DEFAULT_LIMIT;
	const data = await loadSources(resolved.sources, limit, deps.fetchImpl ?? fetch);
	if (data.feeds.every(feed => !feed.ok) && data.items.length === 0) {
		return {
			ok: false,
			reason: data.feeds
				.map(feed => `${feed.sourceId}: ${feed.reason ?? 'failed'}`)
				.join('; '),
		};
	}
	return {ok: true, data};
}

export async function searchBusinessLatest(
	input: SearchBusinessLatestInput,
	deps: BusinessLatestFetchDeps = {},
): Promise<SdkResult<GetBusinessLatestOutput>> {
	const fetched = await getBusinessLatest(
		{sourceId: input.sourceId, limit: 25},
		deps,
	);
	if (!fetched.ok) {
		return fetched;
	}
	const needle = input.query.trim().toLowerCase();
	const matched = fetched.data.items.filter(item => {
		const hay = `${item.title} ${item.summary ?? ''} ${item.sourceName}`.toLowerCase();
		return hay.includes(needle);
	});
	const limit = input.limit ?? DEFAULT_LIMIT;
	return {
		ok: true,
		data: {
			items: matched.slice(0, limit),
			feeds: fetched.data.feeds,
		},
	};
}
