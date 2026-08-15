import type {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import {findDocPageByPath, loadContinuumDocsIndex} from './index-store.js';
import {fetchContinuumDocPage, extractContinuumDocTitle} from './fetch-page.js';
import {searchContinuumDocPages} from './search.js';
import {
	GetContinuumDocOutputSchema,
	SearchContinuumDocsOutputSchema,
} from './types.js';

export function registerContinuumDocsTools(server: McpServer): void {
	server.registerTool(
		'search_continuum_docs',
		{
			description:
				'Search official ContinuumDAO product documentation (docs.continuumdao.org). Returns ranked page hits with path, title, section, excerpt, and public URL. Follow with get_continuum_doc for full markdown.',
			inputSchema: z
				.object({
					q: z.string().min(1),
					section: z.string().optional(),
					limit: z.number().int().positive().max(50).optional(),
				})
				.strict(),
			outputSchema: SearchContinuumDocsOutputSchema,
		},
		async ({q, section, limit}: {q: string; section?: string; limit?: number}) => {
			const {index, source} = await loadContinuumDocsIndex();
			const hits = searchContinuumDocPages(index, q, section, limit ?? 20);
			const payload = {
				hits,
				indexSource: source,
				indexGeneratedAt: index.generatedAt,
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);

	server.registerTool(
		'get_continuum_doc',
		{
			description:
				'Fetch one official ContinuumDAO documentation page as markdown from docs.continuumdao.org. Path is from search_continuum_docs (e.g. ContinuumDAO/MPAWallet/Overview). Optional offset/limit slice long pages.',
			inputSchema: z
				.object({
					path: z.string().min(1),
					offset: z.number().int().nonnegative().optional(),
					limit: z.number().int().positive().max(200_000).optional(),
				})
				.strict(),
			outputSchema: GetContinuumDocOutputSchema,
		},
		async ({
			path: docPath,
			offset,
			limit,
		}: {
			path: string;
			offset?: number;
			limit?: number;
		}) => {
			const page = await fetchContinuumDocPage({path: docPath, offset, limit});
			let title: string | undefined;
			try {
				const {index} = await loadContinuumDocsIndex();
				title = findDocPageByPath(index, page.path)?.title;
			} catch {
				// index optional for title when page fetch succeeded
			}
			title ??= extractContinuumDocTitle(page.content);
			const payload = {
				path: page.path,
				url: page.url,
				title,
				content: page.content,
				truncated: page.truncated,
				offset: page.offset,
				totalChars: page.totalChars,
			};
			return {
				content: [{type: 'text' as const, text: JSON.stringify(payload)}],
				structuredContent: payload,
			};
		},
	);
}
