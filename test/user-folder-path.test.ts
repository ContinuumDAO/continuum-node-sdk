import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {
	assertUserFolderPath,
	normalizeUserFolderPath,
	userFolderPathError,
} from '../src/core/agent/user-folder-path.ts';

describe('normalizeUserFolderPath', () => {
	test('normalizes slashes and trims', () => {
		assert.equal(normalizeUserFolderPath(' evm\\src\\Foo.sol '), 'evm/src/Foo.sol');
		assert.equal(normalizeUserFolderPath('./data/out.json'), 'data/out.json');
		assert.equal(normalizeUserFolderPath('/evm/script/'), 'evm/script');
	});
});

describe('userFolderPathError', () => {
	test('allows dot for list', () => {
		assert.equal(userFolderPathError('.', {allowDot: true}), null);
		assert.match(userFolderPathError('.', {allowDot: false}) ?? '', /subdirectory/i);
	});

	test('rejects traversal and absolute paths', () => {
		assert.match(userFolderPathError('../etc/passwd') ?? '', /\.\./);
		assert.match(userFolderPathError('evm/../../secret') ?? '', /\.\./);
		assert.equal(userFolderPathError('/etc/passwd'), null);
		assert.match(userFolderPathError('C:\\Windows\\foo') ?? '', /relative/i);
		assert.match(userFolderPathError('~/notes.txt') ?? '', /relative/i);
	});

	test('requires subtree for writes', () => {
		assert.match(userFolderPathError('notes.txt', {requireSubtree: true}) ?? '', /subdirectory/i);
		assert.equal(userFolderPathError('data/notes.txt', {requireSubtree: true}), null);
		assert.equal(
			userFolderPathError('evm/script/Deploy.s.sol', {requireSubtree: true}),
			null,
		);
	});
});

describe('assertUserFolderPath', () => {
	test('returns normalized path', () => {
		assert.deepEqual(assertUserFolderPath('./data/out.json', {requireSubtree: true}), {
			ok: true,
			path: 'data/out.json',
		});
	});
});
