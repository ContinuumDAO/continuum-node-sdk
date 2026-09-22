export const COIN_BUREAU_ARCHIVE_URL = 'https://coinbureau.com/newsletters';
export const COIN_BUREAU_SITEMAP_URL =
	'https://coinbureau.com/server-sitemap-newsletters.xml';

export type ParsedCoinBureauNewsletter = {
	slug: string;
	title: string;
	url: string;
	publishedAt?: string;
	publishedRaw?: string;
	summary?: string;
	source: 'archive' | 'sitemap';
};

function decodeHtmlEntities(value: string): string {
	return value
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
	return decodeHtmlEntities(value)
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const MONTHS: Record<string, number> = {
	january: 0,
	february: 1,
	march: 2,
	april: 3,
	may: 4,
	june: 5,
	july: 6,
	august: 7,
	september: 8,
	october: 9,
	november: 10,
	december: 11,
};

export function parseCardDate(raw: string): string | undefined {
	const cleaned = raw.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1').replace(/\s+/g, ' ').trim();
	if (!cleaned) {
		return undefined;
	}
	const named = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})$/i.exec(
		cleaned,
	);
	if (named) {
		const month = MONTHS[(named[1] ?? '').toLowerCase()];
		const day = Number(named[2]);
		const year = Number(named[3]);
		if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) {
			return undefined;
		}
		return new Date(Date.UTC(year, month, day)).toISOString();
	}
	const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(cleaned);
	if (isoDate) {
		return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}T00:00:00.000Z`;
	}
	const ms = Date.parse(cleaned);
	if (!Number.isFinite(ms)) {
		return undefined;
	}
	return new Date(ms).toISOString();
}

export function titleFromSlug(slug: string): string {
	return slug
		.split('-')
		.filter(Boolean)
		.map(word => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

export function newsletterUrl(slug: string): string {
	return `https://coinbureau.com/newsletters/${slug}`;
}

export function parseArchiveHtml(html: string): ParsedCoinBureauNewsletter[] {
	const items: ParsedCoinBureauNewsletter[] = [];
	const seen = new Set<string>();
	const cardRe =
		/href="\/newsletters\/([^"/?#]+)"[\s\S]{0,8000}?<h3\b[^>]*>([\s\S]*?)<\/h3>[\s\S]{0,2000}?<p\b[^>]*card-description[^>]*>([\s\S]*?)<\/p>[\s\S]{0,1200}?<span\b[^>]*card-date[^>]*>([\s\S]*?)<\/span>/gi;
	let match: RegExpExecArray | null;
	while ((match = cardRe.exec(html)) !== null) {
		const slug = (match[1] ?? '').trim();
		const title = stripTags(match[2] ?? '');
		const summary = stripTags(match[3] ?? '');
		const publishedRaw = stripTags(match[4] ?? '');
		if (!slug || !title || seen.has(slug)) {
			continue;
		}
		seen.add(slug);
		items.push({
			slug,
			title,
			url: newsletterUrl(slug),
			publishedAt: parseCardDate(publishedRaw),
			publishedRaw: publishedRaw || undefined,
			summary: summary || undefined,
			source: 'archive',
		});
	}
	return items;
}

export function parseNewsletterSitemap(xml: string): ParsedCoinBureauNewsletter[] {
	const items: ParsedCoinBureauNewsletter[] = [];
	const seen = new Set<string>();
	const urlRe =
		/<url>\s*<loc>\s*(https:\/\/(?:www\.)?coinbureau\.com\/newsletters\/([^<\s]+))\s*<\/loc>\s*<lastmod>\s*([^<]+)\s*<\/lastmod>/gi;
	let match: RegExpExecArray | null;
	while ((match = urlRe.exec(xml)) !== null) {
		const loc = decodeHtmlEntities((match[1] ?? '').trim()).replace(/\/$/, '');
		const slug = decodeURIComponent((match[2] ?? '').trim()).replace(/\/$/, '');
		const lastmod = (match[3] ?? '').trim();
		if (!slug || slug === 'newsletters' || seen.has(slug)) {
			continue;
		}
		if (!/^https:\/\/(?:www\.)?coinbureau\.com\/newsletters\/[^/]+$/i.test(loc)) {
			continue;
		}
		seen.add(slug);
		items.push({
			slug,
			title: titleFromSlug(slug),
			url: newsletterUrl(slug),
			publishedAt: parseCardDate(lastmod) ?? (lastmod || undefined),
			publishedRaw: lastmod || undefined,
			source: 'sitemap',
		});
	}
	return items;
}

export function mergeNewsletters(
	archive: readonly ParsedCoinBureauNewsletter[],
	sitemap: readonly ParsedCoinBureauNewsletter[],
): ParsedCoinBureauNewsletter[] {
	const bySlug = new Map<string, ParsedCoinBureauNewsletter>();
	for (const item of sitemap) {
		bySlug.set(item.slug, item);
	}
	for (const item of archive) {
		bySlug.set(item.slug, item);
	}
	return [...bySlug.values()].sort((a, b) => {
		const aMs = a.publishedAt ? Date.parse(a.publishedAt) : Number.NaN;
		const bMs = b.publishedAt ? Date.parse(b.publishedAt) : Number.NaN;
		if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
			return bMs - aMs;
		}
		if (a.source !== b.source) {
			return a.source === 'archive' ? -1 : 1;
		}
		return 0;
	});
}
