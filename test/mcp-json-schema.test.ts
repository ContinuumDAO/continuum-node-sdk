import assert from 'node:assert/strict';
import {test} from 'node:test';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {getMcpToolDefinitions} from '@continuumdao/ctm-mpc-defi/agent';
import {defiToolInputSchema} from '../dist/mcp/defi/tool-schemas.js';
import {
	isBooleanJsonSchema,
	isNumericJsonSchema,
	softenAgentScalarJsonSchema,
} from '../dist/mcp/defi/mcp-json-schema.js';

test('isNumericJsonSchema detects integer and allOf number shapes', () => {
	assert.equal(isNumericJsonSchema({type: 'integer', exclusiveMinimum: 0}), true);
	assert.equal(
		isNumericJsonSchema({
			allOf: [{type: 'number'}, {type: 'integer', exclusiveMinimum: 0}],
		}),
		true,
	);
	assert.equal(isNumericJsonSchema({type: 'string'}), false);
	assert.equal(
		isNumericJsonSchema({
			type: 'object',
			properties: {x: {type: 'integer'}},
		}),
		false,
	);
	assert.equal(isBooleanJsonSchema({type: 'boolean'}), true);
	assert.equal(isBooleanJsonSchema({type: 'integer'}), false);
});

test('softenAgentScalarJsonSchema softens hyperliquid fetch_ohlcv time fields', () => {
	const tool = getMcpToolDefinitions().find(t => t.name === 'ctm_hyperliquid_fetch_ohlcv');
	assert.ok(tool);
	const reg = defiToolInputSchema({
		name: tool.name,
		inputZod: tool.inputZod,
		outputZod: tool.outputZod,
	});
	const raw = zodToJsonSchema(reg as never, {
		$refStrategy: 'none',
		target: 'jsonSchema7',
	}) as Record<string, unknown>;
	const soft = softenAgentScalarJsonSchema(raw) as {
		properties: Record<string, {anyOf?: unknown[]}>;
	};
	for (const key of ['startTimeMs', 'endTimeMs', 'lookbackDays', 'chainId']) {
		const prop = soft.properties[key];
		assert.ok(prop, `missing ${key}`);
		assert.ok(Array.isArray(prop.anyOf), `${key} should be anyOf number|string`);
		assert.ok(
			prop.anyOf!.some(
				(b: unknown) =>
					typeof b === 'object' &&
					b != null &&
					(b as {type?: string}).type === 'string',
			),
			`${key} anyOf must include string`,
		);
	}
});

test('softenAgentScalarJsonSchema softens boolean fields', () => {
	const tool = getMcpToolDefinitions().find(t => t.name === 'ctm_uniswap_v4_list_lp_pools');
	assert.ok(tool);
	const reg = defiToolInputSchema({
		name: tool.name,
		inputZod: tool.inputZod,
		outputZod: tool.outputZod,
	});
	const raw = zodToJsonSchema(reg as never, {
		$refStrategy: 'none',
		target: 'jsonSchema7',
	}) as Record<string, unknown>;
	const soft = softenAgentScalarJsonSchema(raw) as {
		properties: Record<string, {anyOf?: unknown[]}>;
	};
	const prop = soft.properties.permissioned;
	assert.ok(Array.isArray(prop?.anyOf), 'permissioned should be anyOf boolean|string');
});
