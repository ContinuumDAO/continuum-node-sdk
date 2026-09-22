import type {SdkResult} from '../result.js';
import {parseRssItems} from '../rss/parse-rss.js';
import type {
	CryptoBanterNewsletterItem,
	GetCryptoBanterLatestInput,
	GetCryptoBanterLatestOutput,
	ListCryptoBanterSourcesOutput,
	SearchCryptoBanterNewslettersInput,
} from './schemas.js';
import {
	CRYPTO_BANTER_SOURCES,
	resolveCryptoBanterSources,
	type CryptoBanterSource,
} from './sources.js';

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 8;
const SUMMARY_MAX = 500;
const USER_AGENT =
	'ContinuumCryptoBanterNewsletters/1.0 (+https://github.com/ContinuumDAO/continuum-node-sdk)';

export type CryptoBanterFetchDeps = {
	fetchImpl?: typeof fetch;
};

type LoadedItem = CryptoBanterNewsletterItem & {searchText: string};

function clipSummary(text: string | undefined): string | undefined {
	if (!text) {
		return undefined;
	}
	if (text.length <= SUMMARY_MAX) {
		return text;
	}
	return `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

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

function limitItems(items: LoadedItem[], limit: number): LoadedItem[] {
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

function toOutputItem(item: LoadedItem): CryptoBanterNewsletterItem {
	const {searchText: _searchText, ...rest} = item;
	return rest;
}

async function loadSources(
	sources: readonly CryptoBanterSource[],
	limit: number,
	fetchImpl: typeof fetch,
): Promise<{items: LoadedItem[]; feeds: GetCryptoBanterLatestOutput['feeds']}> {
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
					items: [] as LoadedItem[],
				};
			}
			const parsed = parseRssItems(fetched.xml).map(item => ({
				sourceId: source.id,
				sourceName: source.displayName,
				title: item.title,
				url: item.url,
				publishedAt: item.publishedAt,
				publishedRaw: item.publishedRaw,
				summary: clipSummary(item.summary),
				searchText: `${item.title} ${item.summary ?? ''}`.toLowerCase(),
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

export function listCryptoBanterSources(): SdkResult<ListCryptoBanterSourcesOutput> {
	return {
		ok: true,
		data: {
			sources: CRYPTO_BANTER_SOURCES.map(source => ({
				id: source.id,
				displayName: source.displayName,
				url: source.url,
			})),
		},
	};
}

export async function getCryptoBanterLatest(
	input: GetCryptoBanterLatestInput,
	deps: CryptoBanterFetchDeps = {},
): Promise<SdkResult<GetCryptoBanterLatestOutput>> {
	const resolved = resolveCryptoBanterSources(input.sourceId);
	if (!resolved.ok) {
		return resolved;
	}
	const limit = input.limit ?? DEFAULT_LIMIT;
	const loaded = await loadSources(resolved.sources, limit, deps.fetchImpl ?? fetch);
	if (loaded.feeds.every(feed => !feed.ok) && loaded.items.length === 0) {
		return {
			ok: false,
			reason: loaded.feeds
				.map(feed => `${feed.sourceId}: ${feed.reason ?? 'failed'}`)
				.join('; '),
		};
	}
	return {
		ok: true,
		data: {
			items: loaded.items.map(toOutputItem),
			feeds: loaded.feeds,
		},
	};
}

export async function searchCryptoBanterNewsletters(
	input: SearchCryptoBanterNewslettersInput,
	deps: CryptoBanterFetchDeps = {},
): Promise<SdkResult<GetCryptoBanterLatestOutput>> {
	const resolved = resolveCryptoBanterSources(input.sourceId);
	if (!resolved.ok) {
		return resolved;
	}
	const loaded = await loadSources(resolved.sources, 25, deps.fetchImpl ?? fetch);
	if (loaded.feeds.every(feed => !feed.ok) && loaded.items.length === 0) {
		return {
			ok: false,
			reason: loaded.feeds
				.map(feed => `${feed.sourceId}: ${feed.reason ?? 'failed'}`)
				.join('; '),
		};
	}
	const needle = input.query.trim().toLowerCase();
	const matched = loaded.items.filter(item => item.searchText.includes(needle));
	const limit = input.limit ?? DEFAULT_LIMIT;
	return {
		ok: true,
		data: {
			items: matched.slice(0, limit).map(toOutputItem),
			feeds: loaded.feeds,
		},
	};
}
