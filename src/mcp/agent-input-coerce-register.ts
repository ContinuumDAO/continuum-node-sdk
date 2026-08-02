import type {McpServer} from '@modelcontextprotocol/server';
import type {ZodTypeAny} from 'zod';
import {wrapZodInputSchemaWithAgentCoerce} from './agent-input-coerce.js';

/**
 * Patch registerTool so Zod 4 input schemas coerce LLM string numbers/bools
 * before MCP Standard Schema validation (agent chat path + direct MCP clients).
 * DeFi tools use fromJsonSchema (no `_zod`) and are softened separately.
 */
export function installAgentInputCoerceOnRegister(server: McpServer): void {
	const originalRegister = server.registerTool.bind(server);
	server.registerTool = ((name: string, config: unknown, handler: unknown) => {
		const cfg = config as {inputSchema?: unknown} | undefined;
		const inputSchema = cfg?.inputSchema;
		if (inputSchema && typeof inputSchema === 'object' && '_zod' in inputSchema) {
			const wrapped = {
				...(cfg as object),
				inputSchema: wrapZodInputSchemaWithAgentCoerce(inputSchema as ZodTypeAny),
			};
			return (originalRegister as (...args: unknown[]) => unknown)(name, wrapped, handler);
		}
		return (originalRegister as (...args: unknown[]) => unknown)(name, config, handler);
	}) as typeof server.registerTool;
}
