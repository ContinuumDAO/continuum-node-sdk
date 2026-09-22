import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	getCryptoBanterLatest,
	listCryptoBanterSources,
	searchCryptoBanterNewsletters,
} from '../dist/core/crypto-banter-newsletters/index.js';

const insiderRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>The Insider</title>
    <item>
      <title><![CDATA[A $150 Trillion Market Just Opened Up To Crypto]]></title>
      <link>https://theinsiderletter.substack.com/p/a-150-trillion-market</link>
      <pubDate>Mon, 14 Sep 2026 14:56:27 GMT</pubDate>
      <description><![CDATA[THE INSIDER Issue No. 027 | September 14, 2026 By Ran Neuner]]></description>
    </item>
    <item>
      <title><![CDATA[Bitcoin Just Broke A Major Trend]]></title>
      <link>https://theinsiderletter.substack.com/p/bitcoin-just-broke</link>
      <pubDate>Sat, 12 Sep 2026 18:31:21 GMT</pubDate>
      <description><![CDATA[Jamie Coutts cut Bitcoin below half.]]></description>
    </item>
  </channel>
</rss>`;

const gmcRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Good Morning Crypto</title>
    <item>
      <title><![CDATA[SEC White House Meeting Signals A Massive Crypto Shift]]></title>
      <link>https://goodmorningcrypto.substack.com/p/sec-white-house-meeting</link>
      <pubDate>Mon, 21 Sep 2026 12:55:42 GMT</pubDate>
      <description><![CDATA[Bitcoin printed above $85,000. Washington is pulling digital assets onshore.]]></description>
    </item>
  </channel>
</rss>`;

test('listCryptoBanterSources returns the three Substacks', () => {
	const listed = listCryptoBanterSources();
	assert.equal(listed.ok, true);
	if (!listed.ok) {
		return;
	}
	assert.deepEqual(
		listed.data.sources.map(source => source.id),
		['the-insider', 'good-morning-crypto', 'the-daily-candle'],
	);
});

test('getCryptoBanterLatest and searchCryptoBanterNewsletters use injected fetch', async () => {
	const fetchImpl: typeof fetch = async url => {
		const href = String(url);
		if (href.includes('theinsiderletter.substack.com')) {
			return new Response(insiderRss, {
				status: 200,
				headers: {'content-type': 'application/rss+xml'},
			});
		}
		if (href.includes('goodmorningcrypto.substack.com')) {
			return new Response(gmcRss, {
				status: 200,
				headers: {'content-type': 'application/rss+xml'},
			});
		}
		return new Response('missing', {status: 404, statusText: 'Not Found'});
	};

	const latest = await getCryptoBanterLatest({limit: 3}, {fetchImpl});
	assert.equal(latest.ok, true);
	if (!latest.ok) {
		return;
	}
	assert.equal(latest.data.items.length, 3);
	assert.equal(latest.data.items[0]?.sourceId, 'good-morning-crypto');
	assert.equal(latest.data.items[1]?.sourceId, 'the-insider');
	assert.equal(latest.data.feeds.filter(feed => feed.ok).length, 2);

	const insiderOnly = await getCryptoBanterLatest(
		{sourceId: 'the-insider', limit: 1},
		{fetchImpl},
	);
	assert.equal(insiderOnly.ok, true);
	if (!insiderOnly.ok) {
		return;
	}
	assert.equal(insiderOnly.data.items.length, 1);
	assert.equal(insiderOnly.data.items[0]?.title, 'A $150 Trillion Market Just Opened Up To Crypto');

	const found = await searchCryptoBanterNewsletters({query: 'coutts'}, {fetchImpl});
	assert.equal(found.ok, true);
	if (!found.ok) {
		return;
	}
	assert.equal(found.data.items.length, 1);
	assert.equal(found.data.items[0]?.sourceId, 'the-insider');
	assert.match(found.data.items[0]?.title ?? '', /Major Trend/);
});

test('getCryptoBanterLatest rejects unknown sourceId', async () => {
	const result = await getCryptoBanterLatest({sourceId: 'not-a-source' as 'the-insider'});
	assert.equal(result.ok, false);
});

test('getCryptoBanterLatest fails when all feeds fail', async () => {
	const fetchImpl: typeof fetch = async () =>
		new Response('nope', {status: 503, statusText: 'Service Unavailable'});
	const result = await getCryptoBanterLatest({}, {fetchImpl});
	assert.equal(result.ok, false);
});
