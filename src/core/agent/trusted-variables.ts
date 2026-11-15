import type {NodeSdkConfig} from '../../config/schema.js';
import {getEnvironmentVariable} from './environment-variables.js';

/**
 * Reads one agent Variable. The value stays inside the caller that uses it.
 * Nothing in this module writes process.env.
 */
type TrustedVariableReader = (name: string) => Promise<string | undefined>;

let reader: TrustedVariableReader | null = null;

/** Install the process-wide reader. continuum-mcp sets this from the Variables store at startup. */
export function setTrustedVariableReader(next: TrustedVariableReader | null): void {
	reader = next;
}

export async function readTrustedVariable(
	name: string,
	config?: NodeSdkConfig,
): Promise<string | undefined> {
	if (reader) {
		const fromReader = (await reader(name))?.trim();
		if (fromReader) return fromReader;
	}
	if (!config) return undefined;
	const result = await getEnvironmentVariable(config, {name});
	if (!result.ok) return undefined;
	const value = result.data.value.trim();
	return value || undefined;
}
