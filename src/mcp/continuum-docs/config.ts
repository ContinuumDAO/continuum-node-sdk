export const DEFAULT_CONTINUUM_DOCS_INDEX_URL =
	'https://docs.continuumdao.org/search-index.json';
export const DEFAULT_CONTINUUM_DOCS_BASE_URL = 'https://docs.continuumdao.org';

export const CONTINUUM_DOCS_INDEX_TTL_MS = 60 * 60 * 1000;
export const CONTINUUM_DOCS_FETCH_TIMEOUT_MS = 15_000;
export const CONTINUUM_DOCS_MAX_PAGE_BYTES = 512_000;

export function continuumDocsIndexUrlFromEnv(): string {
	const raw = process.env['CONTINUUM_DOCS_INDEX_URL']?.trim();
	return raw || DEFAULT_CONTINUUM_DOCS_INDEX_URL;
}

export function continuumDocsBaseUrlFromEnv(): string {
	const raw = process.env['CONTINUUM_DOCS_BASE_URL']?.trim();
	return raw || DEFAULT_CONTINUUM_DOCS_BASE_URL;
}

/** Normalize doc path: no leading slash, no .md suffix, reject traversal. */
export function normalizeContinuumDocPath(raw: string): string {
	let path = raw.trim().replace(/\\/g, '/');
	if (path.startsWith('/')) {
		path = path.slice(1);
	}
	if (path.toLowerCase().endsWith('.md')) {
		path = path.slice(0, -3);
	}
	if (!path || path.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(path)) {
		throw new Error(`invalid doc path: ${raw}`);
	}
	return path;
}

export function continuumDocPublicUrl(baseUrl: string, path: string): string {
	const base = baseUrl.replace(/\/+$/, '');
	return `${base}/${path}`;
}

export function continuumDocMarkdownUrl(baseUrl: string, path: string): string {
	return `${continuumDocPublicUrl(baseUrl, path)}.md`;
}
