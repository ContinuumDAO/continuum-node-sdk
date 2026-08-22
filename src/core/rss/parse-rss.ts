export type ParsedRssItem = {
	title: string;
	url: string;
	publishedAt?: string;
	publishedRaw?: string;
	summary?: string;
};

function decodeXmlEntities(value: string): string {
	return value
		.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
			String.fromCodePoint(Number.parseInt(hex, 16)),
		);
}

function stripTags(value: string): string {
	return decodeXmlEntities(value)
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function tagText(block: string, names: readonly string[]): string | undefined {
	for (const name of names) {
		const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
		const match = re.exec(block);
		if (match?.[1]) {
			const text = stripTags(match[1]);
			if (text) {
				return text;
			}
		}
	}
	return undefined;
}

function linkHref(block: string): string | undefined {
	const href = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(block);
	if (href?.[1]) {
		return decodeXmlEntities(href[1]).trim();
	}
	return tagText(block, ['link', 'guid', 'id']);
}

function toIso(raw: string | undefined): string | undefined {
	if (!raw) {
		return undefined;
	}
	const ms = Date.parse(raw);
	if (!Number.isFinite(ms)) {
		return undefined;
	}
	return new Date(ms).toISOString();
}

function parseBlocks(xml: string, tag: 'item' | 'entry'): ParsedRssItem[] {
	const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
	const items: ParsedRssItem[] = [];
	let match: RegExpExecArray | null;
	while ((match = re.exec(xml)) !== null) {
		const block = match[1] ?? '';
		const title = tagText(block, ['title']);
		const url = linkHref(block);
		if (!title || !url) {
			continue;
		}
		const publishedRaw = tagText(block, [
			'pubDate',
			'published',
			'updated',
			'dc:date',
		]);
		const summary = tagText(block, ['description', 'summary', 'content']);
		items.push({
			title,
			url,
			publishedRaw,
			publishedAt: toIso(publishedRaw),
			summary,
		});
	}
	return items;
}

/** Parse RSS 2.0 `<item>` and Atom `<entry>` blocks. */
export function parseRssItems(xml: string): ParsedRssItem[] {
	const rss = parseBlocks(xml, 'item');
	if (rss.length > 0) {
		return rss;
	}
	return parseBlocks(xml, 'entry');
}
