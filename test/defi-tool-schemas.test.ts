import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import {normalizeObjectSchema} from '@modelcontextprotocol/sdk/server/zod-compat.js';
import {toJsonSchemaCompat} from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import {
	defiToolInputSchema,
	unwrapZodEffectsToObject,
} from '../dist/mcp/defi/tool-schemas.js';

function registrationJsonSchema(toolName: string): Record<string, unknown> {
	const tool = getMcpToolDefinitions().find(t => t.name === toolName);
	assert.ok(tool, `missing tool ${toolName}`);
	const reg = defiToolInputSchema({
		name: tool.name,
		inputZod: tool.inputZod,
		outputZod: tool.outputZod,
	});
	const obj = normalizeObjectSchema(reg);
	assert.ok(obj, `normalizeObjectSchema failed for ${toolName}`);
	return toJsonSchemaCompat(obj, {strictUnions: true, pipeStrategy: 'input'});
}

test('defiToolInputSchema exposes morpho vault deposit fields to MCP tools/list', () => {
	const json = registrationJsonSchema('ctm_morpho_build_vault_deposit_multisign');
	const props = json.properties as Record<string, unknown>;
	assert.ok(props.vaultAddress, 'vaultAddress missing from tools/list schema');
	assert.ok(props.underlyingAddress, 'underlyingAddress missing');
	assert.ok(props.purposeText, 'purposeText missing');
	assert.ok(props.keyGenId, 'keyGenId missing');
	assert.ok(
		(json.required as string[] | undefined)?.includes('vaultAddress'),
		'vaultAddress should be required',
	);
});

test('defiToolInputSchema exposes lido submit fields (refine-wrapped multisign)', () => {
	const json = registrationJsonSchema('ctm_lido_build_submit_multisign');
	const props = json.properties as Record<string, unknown>;
	assert.ok(props.valueWei, 'valueWei missing');
	assert.ok(props.purposeText, 'purposeText missing');
});

test('unwrapZodEffectsToObject reaches object through preprocess and refine', () => {
	const tool = getMcpToolDefinitions().find(
		t => t.name === 'ctm_morpho_build_vault_deposit_multisign',
	);
	assert.ok(tool);
	const inner = unwrapZodEffectsToObject(tool.inputZod);
	assert.ok(inner);
	assert.ok('vaultAddress' in inner.shape);
});

test('defiToolInputSchema accepts string lookbackDays on hyperliquid fetch_ohlcv', () => {
	const tool = getMcpToolDefinitions().find(t => t.name === 'ctm_hyperliquid_fetch_ohlcv');
	assert.ok(tool);
	const reg = defiToolInputSchema({
		name: tool.name,
		inputZod: tool.inputZod,
		outputZod: tool.outputZod,
	});
	const parsed = (reg as {parse: (v: unknown) => unknown}).parse({
		coin: 'ETH',
		interval: '1h',
		lookbackDays: '30',
	});
	assert.deepEqual((parsed as {lookbackDays?: number}).lookbackDays, 30);
	assert.equal((parsed as {chainId?: number}).chainId, 999);
});

function parseDefiToolInput(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
	const tool = getMcpToolDefinitions().find(t => t.name === toolName);
	assert.ok(tool, `missing tool ${toolName}`);
	const reg = defiToolInputSchema({
		name: tool.name,
		inputZod: tool.inputZod,
		outputZod: tool.outputZod,
	});
	return (reg as {parse: (v: unknown) => unknown}).parse(input) as Record<string, unknown>;
}

test('defiToolInputSchema accepts string limit on morpho fetch_earn_vaults', () => {
	const parsed = parseDefiToolInput('ctm_morpho_fetch_earn_vaults', {
		chainId: '8453',
		limit: '25',
	});
	assert.equal(parsed.limit, 25);
	assert.equal(parsed.chainId, 8453);
});

test('defiToolInputSchema accepts string limit on gmx fetch_ohlcv', () => {
	const parsed = parseDefiToolInput('ctm_gmx_fetch_ohlcv', {
		chainId: '42161',
		symbol: 'ETH',
		limit: '100',
	});
	assert.equal(parsed.limit, 100);
	assert.equal(parsed.chainId, 42161);
});

test('defiToolInputSchema accepts string oid on hyperliquid build_cancel_multisign', () => {
	const parsed = parseDefiToolInput('ctm_hyperliquid_build_cancel_multisign', {
		keyGenId: 'kg-test',
		purposeText: 'Cancel ETH limit order',
		chainId: '999',
		coin: 'ETH',
		oid: '123456789',
	});
	assert.equal(parsed.oid, 123456789);
});

test('defiToolInputSchema accepts string urnIndex on sky lockstake draw', () => {
	const parsed = parseDefiToolInput('ctm_sky_build_lockstake_draw_multisign', {
		keyGenId: 'kg-test',
		purposeText: 'Draw USDS',
		chainId: '1',
		usdsAmountHuman: '100',
		urnIndex: '2',
	});
	assert.equal(parsed.urnIndex, 2);
});
