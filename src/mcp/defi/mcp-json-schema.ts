/**
 * MCP server v2 validates tools/call args against published JSON Schema *before*
 * Zod runs. zod-to-json-schema emits type:number/integer/boolean for coerced Zod
 * fields, so LLM string scalars ("30", "true") fail validation. Soften those
 * nodes to also accept strings; executeDefiMcpTool still coerces via Zod.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isNumericType(type: unknown): boolean {
	if (type === 'number' || type === 'integer') {
		return true;
	}
	if (Array.isArray(type)) {
		return type.length > 0 && type.every(t => t === 'number' || t === 'integer');
	}
	return false;
}

/** True when this schema node only constrains numbers (possibly via allOf). */
export function isNumericJsonSchema(schema: unknown): boolean {
	if (!isPlainObject(schema)) {
		return false;
	}
	if (schema.anyOf != null || schema.oneOf != null || schema.enum != null) {
		return false;
	}
	if (isNumericType(schema.type)) {
		return true;
	}
	const allOf = schema.allOf;
	if (!Array.isArray(allOf) || allOf.length === 0) {
		return false;
	}
	let sawNumeric = false;
	for (const part of allOf) {
		if (!isPlainObject(part)) {
			return false;
		}
		if (part.properties != null || part.items != null || part.anyOf != null) {
			return false;
		}
		if (part.type == null) {
			continue;
		}
		if (!isNumericType(part.type)) {
			return false;
		}
		sawNumeric = true;
	}
	return sawNumeric;
}

export function isBooleanJsonSchema(schema: unknown): boolean {
	if (!isPlainObject(schema)) {
		return false;
	}
	if (schema.anyOf != null || schema.oneOf != null || schema.enum != null) {
		return false;
	}
	return schema.type === 'boolean';
}

/**
 * Deep-clone a JSON Schema tree, wrapping pure number/integer/boolean nodes so
 * LLM string scalars pass MCP input validation.
 */
export function allowNumericStringsInJsonSchema(schema: unknown): unknown {
	return softenAgentScalarJsonSchema(schema);
}

export function softenAgentScalarJsonSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return schema.map(softenAgentScalarJsonSchema);
	}
	if (!isPlainObject(schema)) {
		return schema;
	}

	// Wrap leaf scalar schemas before descending into allOf fragments.
	if (isNumericJsonSchema(schema) || isBooleanJsonSchema(schema)) {
		return {
			anyOf: [schema, {type: 'string'}],
		};
	}

	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) {
		if (
			key === 'properties' ||
			key === 'patternProperties' ||
			key === 'definitions' ||
			key === '$defs'
		) {
			if (isPlainObject(value)) {
				const mapped: Record<string, unknown> = {};
				for (const [prop, propSchema] of Object.entries(value)) {
					mapped[prop] = softenAgentScalarJsonSchema(propSchema);
				}
				out[key] = mapped;
			} else {
				out[key] = value;
			}
			continue;
		}
		if (key === 'items' || key === 'additionalProperties' || key === 'not') {
			out[key] = softenAgentScalarJsonSchema(value);
			continue;
		}
		if (key === 'anyOf' || key === 'allOf' || key === 'oneOf') {
			out[key] = softenAgentScalarJsonSchema(value);
			continue;
		}
		out[key] = value;
	}
	return out;
}

/**
 * OHLCV/session wrappers attach `meta` (sessionBind, ohlcvSummary, …) onto
 * structuredContent. zod-to-json-schema emits additionalProperties:false, so MCP
 * v2 output validation rejects those enrichments. Allow extras on object nodes;
 * declared properties are still type-checked.
 */
export function allowAdditionalPropertiesInJsonSchema(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return schema.map(allowAdditionalPropertiesInJsonSchema);
	}
	if (!isPlainObject(schema)) {
		return schema;
	}

	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) {
		if (
			key === 'properties' ||
			key === 'patternProperties' ||
			key === 'definitions' ||
			key === '$defs'
		) {
			if (isPlainObject(value)) {
				const mapped: Record<string, unknown> = {};
				for (const [prop, propSchema] of Object.entries(value)) {
					mapped[prop] = allowAdditionalPropertiesInJsonSchema(propSchema);
				}
				out[key] = mapped;
			} else {
				out[key] = value;
			}
			continue;
		}
		if (key === 'items' || key === 'not') {
			out[key] = allowAdditionalPropertiesInJsonSchema(value);
			continue;
		}
		if (key === 'anyOf' || key === 'allOf' || key === 'oneOf') {
			out[key] = allowAdditionalPropertiesInJsonSchema(value);
			continue;
		}
		if (key === 'additionalProperties') {
			// Replaced below for object schemas; keep schema-valued forms if present.
			if (isPlainObject(value) || Array.isArray(value)) {
				out[key] = allowAdditionalPropertiesInJsonSchema(value);
			} else {
				out[key] = value;
			}
			continue;
		}
		out[key] = value;
	}

	const hasObjectShape =
		out.type === 'object' ||
		isPlainObject(out.properties) ||
		out.additionalProperties !== undefined;
	if (hasObjectShape && out.additionalProperties === false) {
		out.additionalProperties = true;
	} else if (hasObjectShape && out.additionalProperties === undefined && isPlainObject(out.properties)) {
		out.additionalProperties = true;
	}
	return out;
}
