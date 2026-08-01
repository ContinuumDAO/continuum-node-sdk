import assert from 'node:assert/strict';
import {test} from 'node:test';
import {z} from 'zod';
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
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
	const obj = unwrapZodEffectsToObject(reg);
	assert.ok(obj, `unwrapZodEffectsToObject failed for ${toolName}`);
	return z.toJSONSchema(obj, {unrepresentable: 'any'}) as Record<string, unknown>;
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
	assert.ok(props.keyGenId, 'keyGenId missing');
});
