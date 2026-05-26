import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {SdkResult} from '../core/result.js';

export function camelToSnake(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
		.toLowerCase();
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
	return {
		content: [{type: 'text', text: JSON.stringify(result.data)}],
		structuredContent: result.data as Record<string, unknown>,
	};
}

export async function wrapSdk<T>(
	promise: Promise<SdkResult<T>>,
): Promise<CallToolResult> {
	return sdkResultToCallToolResult(await promise);
}
