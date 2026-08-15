import {CATALOG_SEARCH_STOPWORDS} from '../deferred/session.js';
import {docUrlWithSection, headingTitleToAnchor} from './markdown-sections.js';
import type {ContinuumDocPage, ContinuumDocsIndex} from './types.js';

export type DocSearchHit = {
	path: string;
	title: string;
	section: string;
	excerpt: string;
	url: string;
	score: number;
	sectionId?: string;
	sectionTitle?: string;
};

export function searchContinuumDocPages(
	index: ContinuumDocsIndex,
	q: string,
	sectionFilter: string | undefined,
	limit: number,
): DocSearchHit[] {
	const tokens = tokenizeQuery(q);
	const sectionNeedle = sectionFilter?.trim().toLowerCase();
	const hits: DocSearchHit[] = [];

	for (const page of index.pages) {
		if (sectionNeedle) {
			const pageSection = page.section.toLowerCase();
			if (pageSection !== sectionNeedle && !pageSection.includes(sectionNeedle)) {
				continue;
			}
		}
		scorePage(page, tokens, hits);
		scorePageSections(page, tokens, hits);
	}

	return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

function tokenizeQuery(q: string): string[] {
	return q
		.toLowerCase()
		.split(/\s+/)
		.map(t => t.replace(/^[\s.,!?;:'"()[\]]+|[\s.,!?;:'"()[\]]+$/g, ''))
		.filter(t => t.length > 0 && !CATALOG_SEARCH_STOPWORDS.has(t));
}

function scorePage(page: ContinuumDocPage, tokens: string[], hits: DocSearchHit[]): void {
	const hay = [
		page.path,
		page.title,
		page.section,
		page.excerpt,
		...page.headings,
		...(page.sections?.flatMap(s => [s.id, s.title, s.excerpt]) ?? []),
	]
		.join(' ')
		.toLowerCase();
	const score = scoreHaystack(hay, page.title.toLowerCase(), page.path.split('/').pop()?.toLowerCase() ?? '', tokens);
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

function scorePageSections(page: ContinuumDocPage, tokens: string[], hits: DocSearchHit[]): void {
	if (!page.sections?.length) {
		return;
	}
	for (const sec of page.sections) {
		const hay = [sec.id, sec.title, sec.excerpt].join(' ').toLowerCase();
		let score = scoreHaystack(hay, sec.title.toLowerCase(), sec.id, tokens);
		if (tokens.length === 1 && tokens[0] === sec.id) {
			score += 15;
		}
		if (score <= 0) {
			continue;
		}
		hits.push({
			path: page.path,
			title: page.title,
			section: page.section,
			excerpt: sec.excerpt || page.excerpt,
			url: docUrlWithSection(page.url, sec.id),
			score,
			sectionId: sec.id,
			sectionTitle: sec.title,
		});
	}
}

function scoreHaystack(
	hay: string,
	title: string,
	pathTail: string,
	tokens: string[],
): number {
	let score = 0;
	for (const t of tokens) {
		if (title === t || pathTail === t) {
			score += 12;
		} else if (headingTitleToAnchor(t) !== '' && hay.includes(headingTitleToAnchor(t))) {
			score += 10;
		} else if (title.includes(t)) {
			score += 5;
		} else if (hay.includes(t)) {
			score += 1;
		}
	}
	return score;
}
