import type {SdkResult} from '../result.js';
import {
	COIN_BUREAU_ARCHIVE_URL,
	COIN_BUREAU_SITEMAP_URL,
	mergeNewsletters,
	parseArchiveHtml,
	parseNewsletterSitemap,
	type ParsedCoinBureauNewsletter,
} from './parse.js';
import type {
	GetCoinBureauLatestInput,
	GetCoinBureauLatestOutput,
	SearchCoinBureauNewslettersInput,
} from './schemas.js';

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 8;
const USER_AGENT =
	'ContinuumCoinBureauNewsletters/1.0 (+https://github.com/ContinuumDAO/continuum-node-sdk)';

export type CoinBureauFetchDeps = {
	fetchImpl?: typeof fetch;
};

async function fetchText(
	url: string,
	fetchImpl: typeof fetch,
	accept: string,
): Promise<{ok: true; text: string} | {ok: false; reason: string}> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const resp = await fetchImpl(url, {
			method: 'GET',
			headers: {
				Accept: accept,
				'User-Agent': USER_AGENT,
				'Cache-Control': 'no-cache',
			},
			signal: controller.signal,
			redirect: 'follow',
		});
		const text = await resp.text();
		if (!resp.ok) {
			return {ok: false, reason: `HTTP ${resp.status} ${resp.statusText}`.trim()};
		}
		if (!text.trim()) {
			return {ok: false, reason: 'Empty response body'};
		}
		return {ok: true, text};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {ok: false, reason: message};
	} finally {
		clearTimeout(timer);
	}
}

function toOutputItem(item: ParsedCoinBureauNewsletter) {
	return {
		slug: item.slug,
		title: item.title,
		url: item.url,
		publishedAt: item.publishedAt,
		publishedRaw: item.publishedRaw,
		summary: item.summary,
	};
}

async function loadNewsletters(
	fetchImpl: typeof fetch,
): Promise<
	SdkResult<{
		items: ParsedCoinBureauNewsletter[];
		archiveOk: boolean;
		sitemapOk: boolean;
		reason?: string;
	}>
> {
	const [archiveFetched, sitemapFetched] = await Promise.all([
		fetchText(
			COIN_BUREAU_ARCHIVE_URL,
			fetchImpl,
			'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
		),
		fetchText(
			COIN_BUREAU_SITEMAP_URL,
			fetchImpl,
			'application/xml,text/xml;q=0.9,*/*;q=0.8',
		),
	]);

	const archive = archiveFetched.ok ? parseArchiveHtml(archiveFetched.text) : [];
	const sitemap = sitemapFetched.ok ? parseNewsletterSitemap(sitemapFetched.text) : [];
	const items = mergeNewsletters(archive, sitemap);
	const archiveOk = archiveFetched.ok && archive.length > 0;
	const sitemapOk = sitemapFetched.ok && sitemap.length > 0;
	const reasons: string[] = [];
	if (!archiveFetched.ok) {
		reasons.push(`archive: ${archiveFetched.reason}`);
	} else if (archive.length === 0) {
		reasons.push('archive: No newsletter cards parsed');
	}
	if (!sitemapFetched.ok) {
		reasons.push(`sitemap: ${sitemapFetched.reason}`);
	} else if (sitemap.length === 0) {
		reasons.push('sitemap: No newsletter URLs parsed');
	}

	if (items.length === 0) {
		return {ok: false, reason: reasons.join('; ') || 'No newsletters parsed'};
	}
	return {
		ok: true,
		data: {
			items,
			archiveOk,
			sitemapOk,
			reason: reasons.length > 0 ? reasons.join('; ') : undefined,
		},
	};
}

function sliceLatest(
	items: readonly ParsedCoinBureauNewsletter[],
	limit: number,
	archiveOk: boolean,
	sitemapOk: boolean,
	reason?: string,
): GetCoinBureauLatestOutput {
	return {
		items: items.slice(0, limit).map(toOutputItem),
		archiveOk,
		sitemapOk,
		itemCount: items.length,
		reason,
	};
}

export async function getCoinBureauLatest(
	input: GetCoinBureauLatestInput = {},
	deps: CoinBureauFetchDeps = {},
): Promise<SdkResult<GetCoinBureauLatestOutput>> {
	const loaded = await loadNewsletters(deps.fetchImpl ?? fetch);
	if (!loaded.ok) {
		return loaded;
	}
	const limit = input.limit ?? DEFAULT_LIMIT;
	return {
		ok: true,
		data: sliceLatest(
			loaded.data.items,
			limit,
			loaded.data.archiveOk,
			loaded.data.sitemapOk,
			loaded.data.reason,
		),
	};
}

export async function searchCoinBureauNewsletters(
	input: SearchCoinBureauNewslettersInput,
	deps: CoinBureauFetchDeps = {},
): Promise<SdkResult<GetCoinBureauLatestOutput>> {
	const loaded = await loadNewsletters(deps.fetchImpl ?? fetch);
	if (!loaded.ok) {
		return loaded;
	}
	const needle = input.query.trim().toLowerCase();
	const matched = loaded.data.items.filter(item => {
		const hay = `${item.title} ${item.summary ?? ''} ${item.slug}`.toLowerCase();
		return hay.includes(needle);
	});
	const limit = input.limit ?? DEFAULT_LIMIT;
	return {
		ok: true,
		data: sliceLatest(
			matched,
			limit,
			loaded.data.archiveOk,
			loaded.data.sitemapOk,
			loaded.data.reason,
		),
	};
}
