import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	CreateForgeDryRunImportInputSchema,
	ImportAndJoinForgeDryRunsInputSchema,
	JoinMultiSignRequestsInputSchema,
} from '../dist/core/mpc/schemas.js';
import {
	forgeDryRunArtifactPath,
	forgeDryRunHelperArtifactPath,
	isForgeDryRunFilePath,
	joinedMultiSignHelperArtifactPath,
	parseForgeDryRunPath,
} from '../dist/evm/forge-dry-run-paths.js';

const KEY_GEN_ID = 'KeyGen202606061714459993c372497';

test('CreateForgeDryRunImportInputSchema requires exactly one dry-run source', () => {
	const missing = CreateForgeDryRunImportInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
	});
	assert.equal(missing.success, false);

	const both = CreateForgeDryRunImportInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		dryRunFilePath: '.mcp-foundry-workspace/broadcast/Foo.s.sol/59141/dry-run/run-latest.json',
		dryRunJson: '{}',
	});
	assert.equal(both.success, false);

	const parsed = CreateForgeDryRunImportInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		dryRunFilePath:
			'.mcp-foundry-workspace/broadcast/Foo.s.sol/59141/dry-run/run-latest.json',
		refreshStaleNonces: 'true',
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.refreshStaleNonces, true);
});

test('parseForgeDryRunPath reads broadcast and artifact layouts', () => {
	assert.deepEqual(
		parseForgeDryRunPath(
			'.mcp-foundry-workspace/broadcast/Deploy.s.sol/59141/dry-run/run-latest.json',
		),
		{scriptName: 'Deploy.s.sol', chainId: '59141'},
	);
	assert.deepEqual(
		parseForgeDryRunPath('data/artifacts/forge/8453/Deploy.s.sol/run-latest.json'),
		{scriptName: 'Deploy.s.sol', chainId: '8453'},
	);
});

test('isForgeDryRunFilePath detects dry-run and artifact files', () => {
	assert.equal(
		isForgeDryRunFilePath(
			'.mcp-foundry-workspace/broadcast/X.s.sol/1/dry-run/run-latest.json',
		),
		true,
	);
	assert.equal(
		isForgeDryRunFilePath('data/artifacts/forge/1/X.s.sol/run-latest.json'),
		true,
	);
	assert.equal(isForgeDryRunFilePath('plans/foo.md'), false);
});

test('forgeDryRunArtifactPath builds stable mirror path', () => {
	assert.equal(
		forgeDryRunArtifactPath('59141', 'Deploy.s.sol'),
		'data/artifacts/forge/59141/Deploy.s.sol/run-latest.json',
	);
});

test('helper artifact paths for multisign chaining', () => {
	assert.equal(
		forgeDryRunHelperArtifactPath('8453', 'Batch.s.sol'),
		'data/artifacts/multisign/forge-dry-run/8453/Batch.s.sol/helper.json',
	);
	assert.equal(
		joinedMultiSignHelperArtifactPath('8453', 12),
		'data/artifacts/multisign/joined/8453/helper-n12.json',
	);
});

test('JoinMultiSignRequestsInputSchema accepts user_folder file paths', () => {
	const parsed = JoinMultiSignRequestsInputSchema.safeParse({
		payloadAFilePath: 'data/artifacts/multisign/forge-dry-run/8453/A.s.sol/helper.json',
		payloadBFilePath: 'data/artifacts/multisign/forge-dry-run/8453/B.s.sol/helper.json',
		firstNonce: 3,
	});
	assert.equal(parsed.success, true);
});

test('ImportAndJoinForgeDryRunsInputSchema requires A/B dry-run sources', () => {
	const ok = ImportAndJoinForgeDryRunsInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		dryRunFilePathA: '.mcp-foundry-workspace/broadcast/A.s.sol/1/dry-run/run-latest.json',
		dryRunFilePathB: '.mcp-foundry-workspace/broadcast/B.s.sol/1/dry-run/run-latest.json',
		firstNonce: 0,
	});
	assert.equal(ok.success, true);

	const bad = ImportAndJoinForgeDryRunsInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		dryRunFilePathA: 'a.json',
		dryRunJsonA: '{}',
		dryRunFilePathB: 'b.json',
	});
	assert.equal(bad.success, false);
});
