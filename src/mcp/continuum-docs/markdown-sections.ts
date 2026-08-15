/** Docsify-style heading anchor (matches ?id= links on docs.continuumdao.org). */
export function headingTitleToAnchor(title: string): string {
	return title
		.replace(/\*\*/g, '')
		.replace(/`/g, '')
		.trim()
		.toLowerCase()
		.replace(/&/g, 'amp')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export type ParsedMarkdownSection = {
	id: string;
	title: string;
	level: number;
	excerpt: string;
};

function sectionExcerpt(lines: string[]): string {
	const text = lines
		.join('\n')
		.replace(/^#+\s.+$/gm, '')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/[*_`>#|-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.slice(0, 300);
}

/** Walk markdown headings and return searchable section metadata. */
export function parseMarkdownSections(markdown: string): ParsedMarkdownSection[] {
	const lines = markdown.split('\n');
	const sections: ParsedMarkdownSection[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^(#{1,6})\s+(.+)/);
		if (!m) {
			continue;
		}
		const level = m[1].length;
		const rawTitle = m[2].trim();
		const title = rawTitle.replace(/\*\*/g, '').trim();
		const id = headingTitleToAnchor(rawTitle);
		if (!id) {
			continue;
		}
		const body: string[] = [];
		for (let j = i + 1; j < lines.length; j++) {
			const next = lines[j].match(/^(#{1,6})\s+/);
			if (next && next[1].length <= level) {
				break;
			}
			body.push(lines[j]);
		}
		sections.push({
			id,
			title,
			level,
			excerpt: sectionExcerpt(body),
		});
	}
	return sections;
}

export function extractMarkdownSection(
	markdown: string,
	sectionId: string,
): {title: string; content: string} | undefined {
	const needle = sectionId.trim().toLowerCase();
	if (!needle) {
		return undefined;
	}
	const lines = markdown.split('\n');
	let start = -1;
	let startLevel = 0;
	let title = '';
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^(#{1,6})\s+(.+)/);
		if (!m) {
			continue;
		}
		const rawTitle = m[2].trim();
		if (headingTitleToAnchor(rawTitle) !== needle) {
			continue;
		}
		start = i;
		startLevel = m[1].length;
		title = rawTitle.replace(/\*\*/g, '').trim();
		break;
	}
	if (start < 0) {
		return undefined;
	}
	const out = [lines[start]];
	for (let i = start + 1; i < lines.length; i++) {
		const next = lines[i].match(/^(#{1,6})\s+/);
		if (next && next[1].length <= startLevel) {
			break;
		}
		out.push(lines[i]);
	}
	return {title, content: out.join('\n')};
}

export function docUrlWithSection(pageUrl: string, sectionId?: string): string {
	const base = pageUrl.replace(/\?.*$/, '');
	if (!sectionId) {
		return base;
	}
	return `${base}?id=${encodeURIComponent(sectionId)}`;
}
