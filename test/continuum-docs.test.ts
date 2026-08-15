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
import {
	extractMarkdownSection,
	headingTitleToAnchor,
	parseMarkdownSections,
} from '../dist/mcp/continuum-docs/markdown-sections.js';
import {searchContinuumDocPages} from '../dist/mcp/continuum-docs/search.js';
import {ContinuumDocsIndexSchema} from '../dist/mcp/continuum-docs/types.js';
import {DEFAULT_PINNED_GROUPS, TOOL_GROUP_BY_NAME} from '../dist/mcp/deferred/tool-group-map.js';

const bundledIndexPath = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'../dist/mcp/docs/search-index.json',
);

test('headingTitleToAnchor matches docsify ids', () => {
	assert.equal(headingTitleToAnchor('Tokenomics'), 'tokenomics');
	assert.equal(headingTitleToAnchor('**Why Have we Built a DAO?**'), 'why-have-we-built-a-dao');
});

test('searchContinuumDocPages finds White Paper tokenomics section', () => {
	const index = ContinuumDocsIndexSchema.parse(
		JSON.parse(readFileSync(bundledIndexPath, 'utf8')),
	);
	const hits = searchContinuumDocPages(index, 'tokenomics', undefined, 5);
	assert.ok(hits.length > 0);
	const top = hits[0];
	assert.equal(top.path, 'ContinuumDAO/WhitePaper');
	assert.equal(top.sectionId, 'tokenomics');
	assert.equal(top.sectionTitle, 'Tokenomics');
	assert.match(top.url, /[?]id=tokenomics/);
});

test('extractMarkdownSection returns Tokenomics block from white paper sample', () => {
	const sample = `# ContinuumDAO White Paper

## Tokenomics

CTM max supply 100 million.

### Allocation

- DAO Treasury - 45%
`;
	const sec = extractMarkdownSection(sample, 'tokenomics');
	assert.ok(sec);
	assert.match(sec.content, /100 million/);
	assert.match(sec.content, /Allocation/);
});

test('fetchContinuumDocPage with sectionId extracts slice', async () => {
	const full = `# Paper\n\n## Tokenomics\n\nCTM supply.\n\n## Other\n\nTail.`;
	const page = await fetchContinuumDocPage({
		path: 'ContinuumDAO/WhitePaper',
		sectionId: 'tokenomics',
		fetchImpl: async () =>
			new Response(full, {
				status: 200,
				headers: {'Content-Type': 'text/markdown'},
			}),
	});
	assert.equal(page.sectionId, 'tokenomics');
	assert.match(page.content, /CTM supply/);
	assert.doesNotMatch(page.content, /\n## Other/);
	assert.match(page.url, /[?]id=tokenomics/);
});

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

test('parseMarkdownSections indexes headings with excerpts', () => {
	const sections = parseMarkdownSections('## Tokenomics\n\nCTM token.\n\n## Other\n\nX.');
	assert.equal(sections.length, 2);
	assert.equal(sections[0].id, 'tokenomics');
	assert.match(sections[0].excerpt, /CTM token/);
});

test('docs tools are pinned in default groups', () => {
	assert.ok(DEFAULT_PINNED_GROUPS.includes('docs'));
	assert.equal(TOOL_GROUP_BY_NAME.search_continuum_docs, 'docs');
	assert.equal(TOOL_GROUP_BY_NAME.get_continuum_doc, 'docs');
});
