import {CONTINUUM_DOCS_PAGE_CACHE_TTL_MS} from './config.js';

type CachedPage = {body: string; atMs: number};

const pageCache = new Map<string, CachedPage>();

export function clearContinuumDocsPageCacheForTests(): void {
	pageCache.clear();
}

export function readContinuumDocsPageCache(
	url: string,
	nowMs = Date.now(),
	ttlMs = CONTINUUM_DOCS_PAGE_CACHE_TTL_MS,
): string | undefined {
	const hit = pageCache.get(url);
	if (!hit) {
		return undefined;
	}
	if (nowMs - hit.atMs >= ttlMs) {
		pageCache.delete(url);
		return undefined;
	}
	return hit.body;
}

export function writeContinuumDocsPageCache(url: string, body: string, nowMs = Date.now()): void {
	pageCache.set(url, {body, atMs: nowMs});
}
