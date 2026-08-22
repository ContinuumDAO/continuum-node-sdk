import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	getWorldAffairsLatest,
	listWorldAffairsSources,
	searchWorldAffairsLatest,
} from '../dist/core/world-affairs/index.js';

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>World</title>
    <item>
      <title>Ceasefire talks stall</title>
      <link>https://example.com/w1</link>
      <pubDate>Wed, 20 Aug 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Floods hit coastal cities</title>
      <link>https://example.com/w2</link>
      <pubDate>Wed, 20 Aug 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

test('listWorldAffairsSources includes bias notes on Guardian, NPR, CNN, and RT', () => {
	const listed = listWorldAffairsSources();
	assert.equal(listed.ok, true);
	if (!listed.ok) {
		return;
	}
	assert.deepEqual(
		listed.data.sources.map(source => source.id),
		['bbc-world', 'aljazeera', 'guardian-world', 'dw-world', 'france24', 'npr', 'cnn-world', 'rt-news'],
	);
	const byId = Object.fromEntries(listed.data.sources.map(source => [source.id, source]));
	assert.equal(byId['guardian-world']?.biasNote, 'Left wing bias');
	assert.equal(byId['npr']?.biasNote, 'Some political left wing bias');
	assert.equal(byId['cnn-world']?.biasNote, 'Some political left wing bias');
	assert.equal(byId['rt-news']?.biasNote, 'Potential bias');
	assert.equal(byId['bbc-world']?.biasNote, undefined);
});

test('getWorldAffairsLatest copies biasNote onto items', async () => {
	const fetchImpl: typeof fetch = async () =>
		new Response(rss, {status: 200, headers: {'content-type': 'application/rss+xml'}});
	const latest = await getWorldAffairsLatest(
		{sourceId: 'guardian-world', limit: 1},
		{fetchImpl},
	);
	assert.equal(latest.ok, true);
	if (!latest.ok) {
		return;
	}
	assert.equal(latest.data.items[0]?.biasNote, 'Left wing bias');
	assert.equal(latest.data.feeds[0]?.biasNote, 'Left wing bias');

	const found = await searchWorldAffairsLatest(
		{query: 'floods', sourceId: 'npr'},
		{fetchImpl},
	);
	assert.equal(found.ok, true);
	if (!found.ok) {
		return;
	}
	assert.equal(found.data.items[0]?.title, 'Floods hit coastal cities');
	assert.equal(found.data.items[0]?.biasNote, 'Some political left wing bias');
});
