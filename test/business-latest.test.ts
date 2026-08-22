import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	getBusinessLatest,
	listBusinessSources,
	parseRssItems,
	searchBusinessLatest,
} from '../dist/core/business-latest/index.js';

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Business</title>
    <item>
      <title><![CDATA[Markets rally on rate-cut bets]]></title>
      <link>https://example.com/a</link>
      <pubDate>Wed, 20 Aug 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[Stocks <b>rose</b> after comments from the Fed.]]></description>
    </item>
    <item>
      <title>Oil slips as demand cools</title>
      <link>https://example.com/b</link>
      <pubDate>Wed, 20 Aug 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Forbes Business</title>
  <entry>
    <title>Private credit tightens</title>
    <link href="https://example.com/c"/>
    <updated>2026-08-20T10:00:00Z</updated>
    <summary>Lenders pull back.</summary>
  </entry>
</feed>`;

test('parseRssItems reads RSS 2.0 items and strips HTML', () => {
	const items = parseRssItems(rss);
	assert.equal(items.length, 2);
	assert.equal(items[0]?.title, 'Markets rally on rate-cut bets');
	assert.equal(items[0]?.url, 'https://example.com/a');
	assert.equal(items[0]?.publishedAt, '2026-08-20T12:00:00.000Z');
	assert.equal(items[0]?.summary, 'Stocks rose after comments from the Fed.');
});

test('parseRssItems reads Atom entries', () => {
	const items = parseRssItems(atom);
	assert.equal(items.length, 1);
	assert.equal(items[0]?.title, 'Private credit tightens');
	assert.equal(items[0]?.url, 'https://example.com/c');
	assert.equal(items[0]?.publishedAt, '2026-08-20T10:00:00.000Z');
});

test('listBusinessSources returns the five free feeds', () => {
	const listed = listBusinessSources();
	assert.equal(listed.ok, true);
	if (!listed.ok) {
		return;
	}
	assert.deepEqual(
		listed.data.sources.map(source => source.id),
		['bbc-business', 'cnbc-business', 'marketwatch', 'forbes-business', 'reuters-world'],
	);
});

test('getBusinessLatest and searchBusinessLatest use injected fetch', async () => {
	const fetchImpl: typeof fetch = async url => {
		assert.match(String(url), /feeds\.bbci\.co\.uk/);
		return new Response(rss, {status: 200, headers: {'content-type': 'application/rss+xml'}});
	};
	const latest = await getBusinessLatest(
		{sourceId: 'bbc-business', limit: 1},
		{fetchImpl},
	);
	assert.equal(latest.ok, true);
	if (!latest.ok) {
		return;
	}
	assert.equal(latest.data.items.length, 1);
	assert.equal(latest.data.items[0]?.sourceId, 'bbc-business');
	assert.equal(latest.data.feeds[0]?.ok, true);

	const found = await searchBusinessLatest({query: 'oil', sourceId: 'bbc-business'}, {fetchImpl});
	assert.equal(found.ok, true);
	if (!found.ok) {
		return;
	}
	assert.equal(found.data.items[0]?.title, 'Oil slips as demand cools');
});

test('getBusinessLatest rejects unknown sourceId', async () => {
	const result = await getBusinessLatest({sourceId: 'not-a-source' as 'bbc-business'});
	assert.equal(result.ok, false);
});
