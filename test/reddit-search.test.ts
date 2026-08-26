import assert from 'node:assert/strict';
import test from 'node:test';
import {
	GetRedditThreadInputSchema,
	SearchRedditPostsInputSchema,
} from '../dist/schemas/extended.js';

test('SearchRedditPostsInputSchema accepts query and optional subreddits', () => {
	const parsed = SearchRedditPostsInputSchema.parse({
		query: 'Uniswap v4',
		subreddits: ['defi'],
		maxResults: 10,
	});
	assert.equal(parsed.query, 'Uniswap v4');
	assert.deepEqual(parsed.subreddits, ['defi']);
});

test('GetRedditThreadInputSchema requires postId or permalink', () => {
	const ok = GetRedditThreadInputSchema.safeParse({permalink: '/r/defi/comments/abc/title/'});
	assert.equal(ok.success, true);
	const bad = GetRedditThreadInputSchema.safeParse({});
	assert.equal(bad.success, false);
});
