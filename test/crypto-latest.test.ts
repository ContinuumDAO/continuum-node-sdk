import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	getCryptoLatest,
	listCryptoSources,
	parseRssItems,
	searchCryptoLatest,
} from '../dist/core/crypto-latest/index.js';

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Crypto</title>
    <item>
      <title><![CDATA[Bitcoin ETF inflows hit a weekly high]]></title>
      <link>https://example.com/a</link>
      <pubDate>Wed, 20 Aug 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[Spot <b>BTC</b> products saw net inflows.]]></description>
    </item>
    <item>
      <title>Ethereum staking queue shortens</title>
      <link>https://example.com/b</link>
      <pubDate>Wed, 20 Aug 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Blockworks</title>
  <entry>
    <title>Perp DEX volume cools</title>
    <link href="https://example.com/c"/>
    <updated>2026-08-20T10:00:00Z</updated>
    <summary>Open interest slips.</summary>
  </entry>
</feed>`;

test('parseRssItems reads RSS 2.0 items and strips HTML', () => {
	const items = parseRssItems(rss);
	assert.equal(items.length, 2);
	assert.equal(items[0]?.title, 'Bitcoin ETF inflows hit a weekly high');
	assert.equal(items[0]?.url, 'https://example.com/a');
	assert.equal(items[0]?.publishedAt, '2026-08-20T12:00:00.000Z');
	assert.equal(items[0]?.summary, 'Spot BTC products saw net inflows.');
});

test('parseRssItems reads Atom entries', () => {
	const items = parseRssItems(atom);
	assert.equal(items.length, 1);
	assert.equal(items[0]?.title, 'Perp DEX volume cools');
	assert.equal(items[0]?.url, 'https://example.com/c');
	assert.equal(items[0]?.publishedAt, '2026-08-20T10:00:00.000Z');
});

test('listCryptoSources returns the eleven free feeds', () => {
	const listed = listCryptoSources();
	assert.equal(listed.ok, true);
	if (!listed.ok) {
		return;
	}
	assert.deepEqual(
		listed.data.sources.map(source => source.id),
		[
			'coindesk',
			'the-block',
			'cointelegraph',
			'decrypt',
			'blockworks',
			'the-defiant',
			'bitcoin-magazine',
			'crypto-potato',
			'crypto-slate',
			'good-morning-crypto',
			'openzeppelin',
		],
	);
});

test('getCryptoLatest and searchCryptoLatest use injected fetch', async () => {
	const fetchImpl: typeof fetch = async url => {
		assert.match(String(url), /coindesk\.com/);
		return new Response(rss, {status: 200, headers: {'content-type': 'application/rss+xml'}});
	};
	const latest = await getCryptoLatest({sourceId: 'coindesk', limit: 1}, {fetchImpl});
	assert.equal(latest.ok, true);
	if (!latest.ok) {
		return;
	}
	assert.equal(latest.data.items.length, 1);
	assert.equal(latest.data.items[0]?.sourceId, 'coindesk');
	assert.equal(latest.data.feeds[0]?.ok, true);

	const found = await searchCryptoLatest({query: 'ethereum', sourceId: 'coindesk'}, {fetchImpl});
	assert.equal(found.ok, true);
	if (!found.ok) {
		return;
	}
	assert.equal(found.data.items[0]?.title, 'Ethereum staking queue shortens');
});

test('getCryptoLatest rejects unknown sourceId', async () => {
	const result = await getCryptoLatest({sourceId: 'not-a-source' as 'coindesk'});
	assert.equal(result.ok, false);
});
