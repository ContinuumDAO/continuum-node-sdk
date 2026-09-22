import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	getCryptoSecurityLatest,
	listCryptoSecuritySources,
	searchCryptoSecurity,
} from '../dist/core/crypto-security/index.js';

const quillRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>QuillAudits</title>
    <item>
      <title><![CDATA[MAYAChain $1.7M Slash Subsidy Pool Inflation Exploit (Explained)]]></title>
      <link>https://medium.com/coinmonks/mayachain-1-7m-slash-subsidy-pool-inflation-exploit-explained-1c14160108d7</link>
      <pubDate>Mon, 14 Sep 2026 14:24:28 GMT</pubDate>
      <description><![CDATA[An attacker chained six bugs in MAYAChain’s trade account logic.]]></description>
    </item>
    <item>
      <title><![CDATA[Moonwell $8.7M mMAMO Exchange Rate Inflation Exploit]]></title>
      <link>https://medium.com/p/moonwell</link>
      <pubDate>Tue, 01 Sep 2026 13:53:58 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const immunefiRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>The Immunefi Blog</title>
    <item>
      <title><![CDATA[How to Run a War Room]]></title>
      <link>https://immunefi.com/blog/war-room</link>
      <pubDate>Tue, 16 Sep 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[A playbook for crypto protocols during an active exploit.]]></description>
    </item>
  </channel>
</rss>`;

test('listCryptoSecuritySources returns the seven free feeds', () => {
	const listed = listCryptoSecuritySources();
	assert.equal(listed.ok, true);
	if (!listed.ok) {
		return;
	}
	assert.deepEqual(
		listed.data.sources.map(source => source.id),
		['quillaudits', 'slowmist', 'immunefi', 'blocksec', 'certik', 'rekt', 'trail-of-bits'],
	);
});

test('getCryptoSecurityLatest and searchCryptoSecurity use injected fetch', async () => {
	const fetchImpl: typeof fetch = async url => {
		const href = String(url);
		if (href.includes('quillaudits.medium.com')) {
			return new Response(quillRss, {
				status: 200,
				headers: {'content-type': 'application/rss+xml'},
			});
		}
		if (href.includes('immunefi.com')) {
			return new Response(immunefiRss, {
				status: 200,
				headers: {'content-type': 'application/rss+xml'},
			});
		}
		return new Response('missing', {status: 404, statusText: 'Not Found'});
	};

	const latest = await getCryptoSecurityLatest({limit: 3}, {fetchImpl});
	assert.equal(latest.ok, true);
	if (!latest.ok) {
		return;
	}
	assert.equal(latest.data.items.length, 3);
	assert.equal(latest.data.items[0]?.sourceId, 'immunefi');
	assert.equal(latest.data.feeds.filter(feed => feed.ok).length, 2);

	const quillOnly = await getCryptoSecurityLatest(
		{sourceId: 'quillaudits', limit: 1},
		{fetchImpl},
	);
	assert.equal(quillOnly.ok, true);
	if (!quillOnly.ok) {
		return;
	}
	assert.equal(quillOnly.data.items[0]?.sourceId, 'quillaudits');
	assert.match(quillOnly.data.items[0]?.title ?? '', /MAYAChain/);

	const found = await searchCryptoSecurity({query: 'mayachain'}, {fetchImpl});
	assert.equal(found.ok, true);
	if (!found.ok) {
		return;
	}
	assert.equal(found.data.items.length, 1);
	assert.equal(found.data.items[0]?.sourceId, 'quillaudits');
});

test('getCryptoSecurityLatest rejects unknown sourceId', async () => {
	const result = await getCryptoSecurityLatest({sourceId: 'not-a-source' as 'quillaudits'});
	assert.equal(result.ok, false);
});

test('getCryptoSecurityLatest fails when all feeds fail', async () => {
	const fetchImpl: typeof fetch = async () =>
		new Response('nope', {status: 503, statusText: 'Service Unavailable'});
	const result = await getCryptoSecurityLatest({}, {fetchImpl});
	assert.equal(result.ok, false);
});
