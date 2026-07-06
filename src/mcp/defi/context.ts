import type {McpToolDefinition} from '@continuumdao/ctm-mpc-defi/agent';

export type DefiProtocolContextOptions = {
	/** Protocol ids loaded in this MCP session. */
	loadedProtocols?: Iterable<string>;
};

export class DefiProtocolContext {
	private readonly loadedProtocols = new Set<string>();
	private readonly protocolToolNames = new Map<string, Set<string>>();

	constructor(options: DefiProtocolContextOptions = {}) {
		for (const id of options.loadedProtocols ?? []) {
			this.loadedProtocols.add(id);
		}
	}

	isLoaded(protocolId: string): boolean {
		return this.loadedProtocols.has(protocolId);
	}

	getLoadedProtocols(): string[] {
		return [...this.loadedProtocols].sort();
	}

	markLoaded(protocolId: string, toolNames: readonly string[]): void {
		this.loadedProtocols.add(protocolId);
		this.protocolToolNames.set(protocolId, new Set(toolNames));
	}

	markUnloaded(protocolId: string): string[] {
		this.loadedProtocols.delete(protocolId);
		const names = [...(this.protocolToolNames.get(protocolId) ?? [])];
		this.protocolToolNames.delete(protocolId);
		return names;
	}

	getToolNames(protocolId: string): string[] {
		return [...(this.protocolToolNames.get(protocolId) ?? [])];
	}

	allLoadedToolNames(): string[] {
		const out = new Set<string>();
		for (const names of this.protocolToolNames.values()) {
			for (const n of names) out.add(n);
		}
		return [...out].sort();
	}

	assertToolCallable(tool: McpToolDefinition): void {
		if (!this.isLoaded(tool.protocolId)) {
			throw new Error(
				`Protocol "${tool.protocolId}" is not loaded. Call load_defi_protocol first.`,
			);
		}
	}
}

export type CreateContinuumMcpServerOptions = {
	defiContext?: DefiProtocolContext;
	/** When true, hide deferred bundles from tools/list until activated. Default from MCP_DEFER_LOADING env (on). */
	deferLoading?: boolean;
};
