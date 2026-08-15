import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
	CONTINUUM_DOCS_FETCH_TIMEOUT_MS,
	continuumDocsIndexUrlFromEnv,
} from './config.js';
import {ContinuumDocsIndexSchema, type ContinuumDocsIndex} from './types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let cachedIndex: ContinuumDocsIndex | null = null;
let cachedAtMs = 0;
let cachedSource: 'live' | 'bundled' = 'live';

export function resolveBundledDocsIndexPath(): string {
	return path.join(moduleDir, '..', 'docs', 'search-index.json');
}

async function readBundledDocsIndex(): Promise<ContinuumDocsIndex> {
	const filePath = resolveBundledDocsIndexPath();
	const text = await fs.readFile(filePath, 'utf8');
	return ContinuumDocsIndexSchema.parse(JSON.parse(text));
}

async function fetchLiveDocsIndex(): Promise<ContinuumDocsIndex> {
	const url = continuumDocsIndexUrlFromEnv();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), CONTINUUM_DOCS_FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {Accept: 'application/json'},
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status} fetching ${url}`);
		}
		const json: unknown = await res.json();
		return ContinuumDocsIndexSchema.parse(json);
	} finally {
		clearTimeout(timer);
	}
}

export function clearContinuumDocsIndexCacheForTests(): void {
	cachedIndex = null;
	cachedAtMs = 0;
	cachedSource = 'live';
}

export async function loadContinuumDocsIndex(options?: {
	ttlMs?: number;
	nowMs?: number;
	fetchLive?: () => Promise<ContinuumDocsIndex>;
	readBundled?: () => Promise<ContinuumDocsIndex>;
}): Promise<{index: ContinuumDocsIndex; source: 'live' | 'bundled'}> {
	const ttlMs = options?.ttlMs ?? 60 * 60 * 1000;
	const nowMs = options?.nowMs ?? Date.now();
	if (cachedIndex && nowMs - cachedAtMs < ttlMs) {
		return {index: cachedIndex, source: cachedSource};
	}
	const fetchLive = options?.fetchLive ?? fetchLiveDocsIndex;
	const readBundled = options?.readBundled ?? readBundledDocsIndex;
	try {
		const index = await fetchLive();
		cachedIndex = index;
		cachedAtMs = nowMs;
		cachedSource = 'live';
		return {index, source: 'live'};
	} catch (liveErr) {
		try {
			const index = await readBundled();
			cachedIndex = index;
			cachedAtMs = nowMs;
			cachedSource = 'bundled';
			return {index, source: 'bundled'};
		} catch (bundledErr) {
			const liveMsg = liveErr instanceof Error ? liveErr.message : String(liveErr);
			const bundledMsg =
				bundledErr instanceof Error ? bundledErr.message : String(bundledErr);
			throw new Error(
				`Continuum docs index unavailable (live: ${liveMsg}; bundled: ${bundledMsg})`,
			);
		}
	}
}

export function findDocPageByPath(
	index: ContinuumDocsIndex,
	docPath: string,
): {title: string; url: string} | undefined {
	const page = index.pages.find(p => p.path === docPath);
	if (!page) {
		return undefined;
	}
	return {title: page.title, url: page.url};
}
