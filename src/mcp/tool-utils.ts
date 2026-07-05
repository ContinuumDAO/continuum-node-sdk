import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import {z} from 'zod';
import type {SdkResult} from '../core/result.js';

/**
 * Loose object schema for dynamic MCP tool payloads.
 * Do not use top-level `z.record()` for `outputSchema` — @modelcontextprotocol/sdk
 * `normalizeObjectSchema` only accepts objects, which breaks output validation.
 */
export const MCP_LOOSE_OBJECT_SCHEMA = z.object({}).catchall(z.any());

export function camelToSnake(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
		.toLowerCase();
}

/** Drop undefined keys so MCP output-schema validation stays stable. */
export function mcpStructuredContent(data: unknown): Record<string, unknown> {
	if (Array.isArray(data)) {
		return {items: JSON.parse(JSON.stringify(data)) as unknown[]};
	}
	if (data && typeof data === 'object') {
		return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
	}
	return {value: data};
}

export function sdkResultToCallToolResult<T>(
	result: SdkResult<T>,
): CallToolResult {
	if (!result.ok) {
		return {
			content: [{type: 'text', text: result.reason}],
			isError: true,
		};
	}
	const structuredContent = mcpStructuredContent(result.data);
	return {
		content: [{type: 'text', text: JSON.stringify(structuredContent)}],
		structuredContent,
	};
}

export async function wrapSdk<T>(
	promise: Promise<SdkResult<T>>,
): Promise<CallToolResult> {
	return sdkResultToCallToolResult(await promise);
}
