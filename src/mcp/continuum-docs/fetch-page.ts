import {
	CONTINUUM_DOCS_FETCH_TIMEOUT_MS,
	CONTINUUM_DOCS_MAX_PAGE_BYTES,
	continuumDocMarkdownUrl,
	continuumDocsBaseUrlFromEnv,
	normalizeContinuumDocPath,
} from './config.js';
import {docUrlWithSection, extractMarkdownSection} from './markdown-sections.js';

export type FetchContinuumDocPageOptions = {
	path: string;
	sectionId?: string;
	offset?: number;
	limit?: number;
	baseUrl?: string;
	fetchImpl?: typeof fetch;
};

export type FetchContinuumDocPageResult = {
	path: string;
	url: string;
	content: string;
	truncated: boolean;
	offset: number;
	totalChars: number;
	sectionId?: string;
	sectionTitle?: string;
};

export async function fetchContinuumDocPage(
	options: FetchContinuumDocPageOptions,
): Promise<FetchContinuumDocPageResult> {
	const docPath = normalizeContinuumDocPath(options.path);
	const baseUrl = options.baseUrl ?? continuumDocsBaseUrlFromEnv();
	const url = continuumDocMarkdownUrl(baseUrl, docPath);
	const fetchImpl = options.fetchImpl ?? fetch;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), CONTINUUM_DOCS_FETCH_TIMEOUT_MS);
	let body: string;
	try {
		const res = await fetchImpl(url, {
			signal: controller.signal,
			headers: {Accept: 'text/markdown, text/plain, */*'},
		});
		if (!res.ok) {
			throw new Error(`HTTP ${res.status} fetching ${url}`);
		}
		const buf = await res.arrayBuffer();
		if (buf.byteLength > CONTINUUM_DOCS_MAX_PAGE_BYTES) {
			throw new Error(`doc exceeds ${CONTINUUM_DOCS_MAX_PAGE_BYTES} bytes`);
		}
		body = new TextDecoder('utf8').decode(buf);
	} finally {
		clearTimeout(timer);
	}

	const publicUrl = `${baseUrl.replace(/\/+$/, '')}/${docPath}`;
	let sectionId: string | undefined;
	let sectionTitle: string | undefined;
	let working = body;

	if (options.sectionId?.trim()) {
		const extracted = extractMarkdownSection(body, options.sectionId);
		if (!extracted) {
			throw new Error(
				`section ${JSON.stringify(options.sectionId)} not found in ${docPath}; use search_continuum_docs for sectionId`,
			);
		}
		sectionId = options.sectionId.trim().toLowerCase();
		sectionTitle = extracted.title;
		working = extracted.content;
	}

	const totalChars = working.length;
	const offset = Math.max(0, options.offset ?? 0);
	const limit = options.limit;
	let content = working;
	let truncated = false;
	if (offset > 0) {
		content = content.slice(offset);
	}
	if (limit !== undefined && limit >= 0 && content.length > limit) {
		content = content.slice(0, limit);
		truncated = true;
	}
	if (offset + content.length < totalChars) {
		truncated = true;
	}

	return {
		path: docPath,
		url: docUrlWithSection(publicUrl, sectionId),
		content,
		truncated,
		offset,
		totalChars,
		sectionId,
		sectionTitle,
	};
}

export function extractContinuumDocTitle(markdown: string): string | undefined {
	for (const line of markdown.split('\n')) {
		const m = line.match(/^#\s+(.+)/);
		if (m) {
			return m[1].trim();
		}
	}
	return undefined;
}
