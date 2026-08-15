import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {
	normalizeContinuumDocPath,
	continuumDocMarkdownUrl,
} from '../dist/mcp/continuum-docs/config.js';
import {fetchContinuumDocPage, extractContinuumDocTitle} from '../dist/mcp/continuum-docs/fetch-page.js';
import {
	clearContinuumDocsIndexCacheForTests,
	loadContinuumDocsIndex,
} from '../dist/mcp/continuum-docs/index-store.js';
import {searchContinuumDocPages} from '../dist/mcp/continuum-docs/search.js';
import {ContinuumDocsIndexSchema} from '../dist/mcp/continuum-docs/types.js';
import {DEFAULT_PINNED_GROUPS, TOOL_GROUP_BY_NAME} from '../dist/mcp/deferred/tool-group-map.js';

const bundledIndexPath = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../dist/mcp/docs/search-index.json',
);

test('normalizeContinuumDocPath strips slash and .md suffix', () => {
	assert.equal(
		normalizeContinuumDocPath('/ContinuumDAO/MPAWallet/Overview.md'),
		'ContinuumDAO/MPAWallet/Overview',
	);
});

test('normalizeContinuumDocPath rejects traversal', () => {
	assert.throws(() => normalizeContinuumDocPath('../secret'));
});

test('continuumDocMarkdownUrl builds raw markdown URL', () => {
	assert.equal(
		continuumDocMarkdownUrl(
			'https://docs.continuumdao.org',
			'ContinuumDAO/Introduction',
		),
		'https://docs.continuumdao.org/ContinuumDAO/Introduction.md',
	);
});

test('searchContinuumDocPages ranks telegram harness page', () => {
	const index = ContinuumDocsIndexSchema.parse(
		JSON.parse(readFileSync(bundledIndexPath, 'utf8')),
	);
	const hits = searchContinuumDocPages(index, 'telegram mini app', undefined, 5);
	assert.ok(hits.length > 0);
	assert.match(hits[0].path, /TelegramMiniApp/);
	assert.ok(hits[0].score > 0);
});

test('loadContinuumDocsIndex uses live fetch then caches', async () => {
	clearContinuumDocsIndexCacheForTests();
	const bundled = ContinuumDocsIndexSchema.parse(
		JSON.parse(readFileSync(bundledIndexPath, 'utf8')),
	);
	let liveCalls = 0;
	const {index, source} = await loadContinuumDocsIndex({
		ttlMs: 60_000,
		nowMs: 1_000,
		fetchLive: async () => {
			liveCalls++;
			return bundled;
		},
		readBundled: async () => bundled,
	});
	assert.equal(source, 'live');
	assert.equal(index.pages.length, bundled.pages.length);
	assert.equal(liveCalls, 1);
	const again = await loadContinuumDocsIndex({
		ttlMs: 60_000,
		nowMs: 2_000,
		fetchLive: async () => {
			liveCalls++;
			return bundled;
		},
		readBundled: async () => bundled,
	});
	assert.equal(again.source, 'live');
	assert.equal(liveCalls, 1);
});

test('loadContinuumDocsIndex falls back to bundled when live fails', async () => {
	clearContinuumDocsIndexCacheForTests();
	const bundled = ContinuumDocsIndexSchema.parse(
		JSON.parse(readFileSync(bundledIndexPath, 'utf8')),
	);
	const {source} = await loadContinuumDocsIndex({
		ttlMs: 60_000,
		nowMs: 5_000,
		fetchLive: async () => {
			throw new Error('offline');
		},
		readBundled: async () => bundled,
	});
	assert.equal(source, 'bundled');
});

test('fetchContinuumDocPage slices offset and limit', async () => {
	const body = '# Title\n\nHello world from docs.';
	const page = await fetchContinuumDocPage({
		path: 'ContinuumDAO/Introduction',
		offset: 2,
		limit: 5,
		baseUrl: 'https://docs.continuumdao.org',
		fetchImpl: async () =>
			new Response(body, {
				status: 200,
				headers: {'Content-Type': 'text/markdown'},
			}),
	});
	assert.equal(page.content, 'Title');
	assert.equal(page.truncated, true);
	assert.equal(page.totalChars, body.length);
});

test('extractContinuumDocTitle reads first heading', () => {
	assert.equal(extractContinuumDocTitle('# Hello\n\nbody'), 'Hello');
});

test('docs tools are pinned in default groups', () => {
	assert.ok(DEFAULT_PINNED_GROUPS.includes('docs'));
	assert.equal(TOOL_GROUP_BY_NAME.search_continuum_docs, 'docs');
	assert.equal(TOOL_GROUP_BY_NAME.get_continuum_doc, 'docs');
});
