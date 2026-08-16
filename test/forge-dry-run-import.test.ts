import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	CreateForgeDryRunImportInputSchema,
	ImportAndJoinForgeDryRunsInputSchema,
	JoinMultiSignRequestsInputSchema,
} from '../dist/core/mpc/schemas.js';
import {MULTISIGN_FORGE_IMPORT_GAS_GUIDANCE} from '../dist/mcp/mpc-gas-docs.js';
import {
	FORGE_DRY_RUN_SCAN_ROOTS,
	forgeDryRunArtifactPath,
	forgeDryRunHelperArtifactPath,
	isForgeDryRunFilePath,
	joinedMultiSignHelperArtifactPath,
	parseForgeDryRunPath,
} from '../dist/evm/forge-dry-run-paths.js';

const KEY_GEN_ID = 'KeyGen202606061714459993c372497';

test('forge import gas guidance does not block to ask', () => {
	assert.ok(MULTISIGN_FORGE_IMPORT_GAS_GUIDANCE.includes('useCustomGas false'));
	assert.ok(MULTISIGN_FORGE_IMPORT_GAS_GUIDANCE.includes('Do not stop the import'));
});

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
		parseForgeDryRunPath('broadcast/SendUsdcLinea.s.sol/59144/dry-run/run-latest.json'),
		{scriptName: 'SendUsdcLinea.s.sol', chainId: '59144'},
	);
	assert.deepEqual(
		parseForgeDryRunPath('data/artifacts/forge/8453/Deploy.s.sol/run-latest.json'),
		{scriptName: 'Deploy.s.sol', chainId: '8453'},
	);
});

test('FORGE_DRY_RUN_SCAN_ROOTS includes native broadcast and Foundry MCP workspace', () => {
	assert.ok(FORGE_DRY_RUN_SCAN_ROOTS.includes('broadcast'));
	assert.ok(FORGE_DRY_RUN_SCAN_ROOTS.includes('.mcp-foundry-workspace/broadcast'));
	assert.ok(FORGE_DRY_RUN_SCAN_ROOTS.includes('data/artifacts/forge'));
});

test('isForgeDryRunFilePath detects dry-run and artifact files', () => {
	assert.equal(
		isForgeDryRunFilePath(
			'.mcp-foundry-workspace/broadcast/X.s.sol/1/dry-run/run-latest.json',
		),
		true,
	);
	assert.equal(
		isForgeDryRunFilePath('broadcast/SendUsdcLinea.s.sol/59144/dry-run/run-latest.json'),
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
