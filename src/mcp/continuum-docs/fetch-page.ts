import {
	CONTINUUM_DOCS_FETCH_TIMEOUT_MS,
	CONTINUUM_DOCS_MAX_PAGE_BYTES,
	continuumDocMarkdownUrl,
	continuumDocsBaseUrlFromEnv,
	normalizeContinuumDocPath,
} from './config.js';

export type FetchContinuumDocPageOptions = {
	path: string;
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

	const totalChars = body.length;
	const offset = Math.max(0, options.offset ?? 0);
	const limit = options.limit;
	let content = body;
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
		url: `${baseUrl.replace(/\/+$/, '')}/${docPath}`,
		content,
		truncated,
		offset,
		totalChars,
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
