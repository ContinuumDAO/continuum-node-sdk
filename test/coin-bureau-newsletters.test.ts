import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	getCoinBureauLatest,
	parseArchiveHtml,
	parseCardDate,
	parseNewsletterSitemap,
	searchCoinBureauNewsletters,
	titleFromSlug,
} from '../dist/core/coin-bureau-newsletters/index.js';

const archiveHtml = `<!DOCTYPE html><html><body>
<a class="border" aria-label="Read more: Hold My Beer" href="/newsletters/hold-my-beer">
  <h3 class="font-normal text-cb-newsletter-card-title">Hold My Beer</h3>
  <p class="font-normal text-cb-newsletter-card-description">In this week&#x27;s newsletter, we break down how to build lasting wealth in crypto.</p>
  <span class="font-normal text-cb-newsletter-card-date">September 21st, 2026</span>
</a>
<a class="border" aria-label="Read more: Hike or Hold?" href="/newsletters/hike-or-hold">
  <h3 class="font-normal text-cb-newsletter-card-title">Hike or Hold?</h3>
  <p class="font-normal text-cb-newsletter-card-description">The Fed decision and what it means for BTC.</p>
  <span class="font-normal text-cb-newsletter-card-date">September 14th, 2026</span>
</a>
</body></html>`;

const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://coinbureau.com/newsletters/warsh-hits-the-brakes</loc><lastmod>2026-08-31T08:15:44.463Z</lastmod></url>
<url><loc>https://coinbureau.com/newsletters/hike-or-hold</loc><lastmod>2026-07-08T05:37:59.899Z</lastmod></url>
</urlset>`;

test('parseCardDate understands ordinal newsletter dates', () => {
	assert.equal(parseCardDate('September 21st, 2026'), '2026-09-21T00:00:00.000Z');
	assert.equal(parseCardDate('2026-08-31T08:15:44.463Z'), '2026-08-31T08:15:44.463Z');
});

test('titleFromSlug title-cases newsletter slugs', () => {
	assert.equal(titleFromSlug('hold-my-beer'), 'Hold My Beer');
});

test('parseArchiveHtml reads newsletter cards', () => {
	const items = parseArchiveHtml(archiveHtml);
	assert.equal(items.length, 2);
	assert.equal(items[0]?.slug, 'hold-my-beer');
	assert.equal(items[0]?.title, 'Hold My Beer');
	assert.equal(items[0]?.url, 'https://coinbureau.com/newsletters/hold-my-beer');
	assert.equal(items[0]?.publishedAt, '2026-09-21T00:00:00.000Z');
	assert.equal(
		items[0]?.summary,
		"In this week's newsletter, we break down how to build lasting wealth in crypto.",
	);
});

test('parseNewsletterSitemap reads loc and lastmod', () => {
	const items = parseNewsletterSitemap(sitemapXml);
	assert.equal(items.length, 2);
	assert.equal(items[0]?.slug, 'warsh-hits-the-brakes');
	assert.equal(items[0]?.title, 'Warsh Hits The Brakes');
	assert.equal(items[0]?.publishedAt, '2026-08-31T08:15:44.463Z');
});

test('getCoinBureauLatest merges archive over stale sitemap and sorts newest first', async () => {
	const fetchImpl: typeof fetch = async url => {
		const href = String(url);
		if (href.includes('server-sitemap-newsletters.xml')) {
			return new Response(sitemapXml, {
				status: 200,
				headers: {'content-type': 'application/xml'},
			});
		}
		assert.match(href, /\/newsletters$/);
		return new Response(archiveHtml, {
			status: 200,
			headers: {'content-type': 'text/html'},
		});
	};

	const latest = await getCoinBureauLatest({limit: 3}, {fetchImpl});
	assert.equal(latest.ok, true);
	if (!latest.ok) {
		return;
	}
	assert.equal(latest.data.archiveOk, true);
	assert.equal(latest.data.sitemapOk, true);
	assert.equal(latest.data.items.length, 3);
	assert.deepEqual(
		latest.data.items.map(item => item.slug),
		['hold-my-beer', 'hike-or-hold', 'warsh-hits-the-brakes'],
	);
	assert.equal(latest.data.items[1]?.title, 'Hike or Hold?');
	assert.equal(latest.data.items[1]?.publishedAt, '2026-09-14T00:00:00.000Z');

	const found = await searchCoinBureauNewsletters({query: 'wealth'}, {fetchImpl});
	assert.equal(found.ok, true);
	if (!found.ok) {
		return;
	}
	assert.equal(found.data.items.length, 1);
	assert.equal(found.data.items[0]?.slug, 'hold-my-beer');
});

test('getCoinBureauLatest fails when both sources are empty', async () => {
	const fetchImpl: typeof fetch = async () =>
		new Response('nope', {status: 503, statusText: 'Service Unavailable'});
	const result = await getCoinBureauLatest({}, {fetchImpl});
	assert.equal(result.ok, false);
});
