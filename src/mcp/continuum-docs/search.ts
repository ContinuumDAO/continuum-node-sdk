import {CATALOG_SEARCH_STOPWORDS} from '../deferred/session.js';
import type {ContinuumDocPage, ContinuumDocsIndex} from './types.js';

export function searchContinuumDocPages(
	index: ContinuumDocsIndex,
	q: string,
	sectionFilter: string | undefined,
	limit: number,
): Array<{
	path: string;
	title: string;
	section: string;
	excerpt: string;
	url: string;
	score: number;
}> {
	const tokens = q
		.toLowerCase()
		.split(/\s+/)
		.map(t => t.replace(/^[\s.,!?;:'"()[\]]+|[\s.,!?;:'"()[\]]+$/g, ''))
		.filter(t => t.length > 0 && !CATALOG_SEARCH_STOPWORDS.has(t));
	const sectionNeedle = sectionFilter?.trim().toLowerCase();
	const hits: Array<{
		path: string;
		title: string;
		section: string;
		excerpt: string;
		url: string;
		score: number;
	}> = [];

	for (const page of index.pages) {
		if (sectionNeedle) {
			const section = page.section.toLowerCase();
			if (section !== sectionNeedle && !section.includes(sectionNeedle)) {
				continue;
			}
		}
		const score = scoreDocPage(page, tokens);
		if (score > 0) {
			hits.push({
				path: page.path,
				title: page.title,
				section: page.section,
				excerpt: page.excerpt,
				url: page.url,
				score,
			});
		}
	}

	return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function scoreDocPage(page: ContinuumDocPage, tokens: string[]): number {
	const hay = [
		page.path,
		page.title,
		page.section,
		page.excerpt,
		...page.headings,
	]
		.join(' ')
		.toLowerCase();
	let score = 0;
	for (const t of tokens) {
		const pathTail = page.path.split('/').pop()?.toLowerCase() ?? '';
		if (page.title.toLowerCase() === t) {
			score += 12;
		} else if (pathTail === t) {
			score += 8;
		} else if (page.title.toLowerCase().includes(t)) {
			score += 5;
		} else if (hay.includes(t)) {
			score += 1;
		}
	}
	return score;
}
