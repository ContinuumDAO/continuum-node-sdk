import type {RegisteredTool} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {
	GROUP_DESCRIPTIONS,
	GROUP_SEARCH_TAGS,
	PINNED_TOOL_NAMES,
	isToolPinnedAtInit,
	parsePinnedGroupsFromEnv,
	RECOMMENDED_CHAT_BUNDLES,
	resolveToolGroupId,
	TOOL_SEARCH_TAGS,
} from './tool-group-map.js';

export type CatalogEntry = {
	name: string;
	description: string;
	groupId: string;
	tags: string[];
	registered: RegisteredTool;
};

export type DeferredToolSessionOptions = {
	pinnedGroups?: Set<string>;
};

export class DeferredToolSession {
	readonly deferLoading: boolean;
	private readonly pinnedGroups: Set<string>;
	private readonly catalog = new Map<string, CatalogEntry>();
	private readonly activeGroups = new Set<string>();
	private readonly fullActivation = new Set<string>();
	private readonly groupTools = new Map<string, Set<string>>();
	private discoveryRegistered = false;
	private wrapInstalled = false;

	constructor(
		private readonly server: McpServer,
		deferLoading: boolean,
		options: DeferredToolSessionOptions = {},
	) {
		this.deferLoading = deferLoading;
		this.pinnedGroups =
			options.pinnedGroups ?? parsePinnedGroupsFromEnv(process.env['MCP_DEFER_PIN_GROUPS']);
		if (deferLoading) {
			for (const g of this.pinnedGroups) {
				this.activeGroups.add(g);
			}
			this.activeGroups.add('discovery');
		}
	}

	installRegistrationWrapper(): void {
		if (this.wrapInstalled || !this.deferLoading) {
			return;
		}
		this.wrapInstalled = true;
		const original = this.server.registerTool.bind(this.server);
		const session = this;
		this.server.registerTool = ((name, config, handler) => {
			const groupId = resolveToolGroupId(name);
			const registered = original(name, config, handler);
			session.trackTool(name, String(config.description ?? ''), groupId, registered);
			return registered;
		}) as typeof this.server.registerTool;
	}

	trackTool(
		name: string,
		description: string,
		groupId: string,
		registered: RegisteredTool,
		options?: {protocolId?: string; skipVisibility?: boolean},
	): void {
		const resolvedGroup = options?.protocolId
			? resolveToolGroupId(name, {protocolId: options.protocolId})
			: groupId;
		const tags = [
			resolvedGroup,
			...(GROUP_SEARCH_TAGS[resolvedGroup] ?? []),
			...(TOOL_SEARCH_TAGS[name] ?? []),
			...name.split('_'),
		];
		this.catalog.set(name, {
			name,
			description,
			groupId: resolvedGroup,
			tags,
			registered,
		});
		if (!this.groupTools.has(resolvedGroup)) {
			this.groupTools.set(resolvedGroup, new Set());
		}
		this.groupTools.get(resolvedGroup)!.add(name);

		if (!this.deferLoading || options?.skipVisibility) {
			return;
		}
		if (this.shouldBeVisible(name, resolvedGroup)) {
			registered.enable();
		} else {
			registered.disable();
		}
	}

	assignToolGroup(name: string, groupId: string): void {
		const entry = this.catalog.get(name);
		if (!entry || entry.groupId === groupId) {
			return;
		}
		this.groupTools.get(entry.groupId)?.delete(name);
		if (!this.groupTools.has(groupId)) {
			this.groupTools.set(groupId, new Set());
		}
		this.groupTools.get(groupId)!.add(name);
		entry.groupId = groupId;
	}

	private shouldBeVisible(name: string, groupId: string): boolean {
		if (!this.activeGroups.has(groupId)) {
			return false;
		}
		if (this.fullActivation.has(groupId)) {
			return true;
		}
		return isToolPinnedAtInit(name, groupId, this.pinnedGroups);
	}

	applyInitialVisibility(): void {
		if (!this.deferLoading) {
			return;
		}
		for (const entry of this.catalog.values()) {
			if (this.shouldBeVisible(entry.name, entry.groupId)) {
				entry.registered.enable();
			} else {
				entry.registered.disable();
			}
		}
	}

	activateGroup(groupId: string): string[] {
		this.activeGroups.add(groupId);
		this.fullActivation.add(groupId);
		const names = [...(this.groupTools.get(groupId) ?? [])];
		for (const name of names) {
			const entry = this.catalog.get(name);
			if (entry) {
				entry.registered.enable();
			}
		}
		void this.server.server.sendToolListChanged().catch(() => {});
		return names.sort();
	}

	deactivateGroup(groupId: string): string[] {
		if (this.pinnedGroups.has(groupId) || groupId === 'discovery') {
			return [];
		}
		this.activeGroups.delete(groupId);
		this.fullActivation.delete(groupId);
		const names = [...(this.groupTools.get(groupId) ?? [])];
		for (const name of names) {
			const entry = this.catalog.get(name);
			if (entry) {
				if (this.pinnedGroups.has(groupId)) {
					if (this.shouldBeVisible(name, groupId)) {
						entry.registered.enable();
					} else {
						entry.registered.disable();
					}
				} else {
					entry.registered.disable();
				}
			}
		}
		void this.server.server.sendToolListChanged().catch(() => {});
		return names.sort();
	}

	isGroupActive(groupId: string): boolean {
		return this.activeGroups.has(groupId);
	}

	listGroups(): Array<{
		groupId: string;
		description: string;
		toolCount: number;
		loaded: boolean;
		pinned: boolean;
		recommended: boolean;
	}> {
		const recommended = new Set<string>(RECOMMENDED_CHAT_BUNDLES);
		const out: Array<{
			groupId: string;
			description: string;
			toolCount: number;
			loaded: boolean;
			pinned: boolean;
			recommended: boolean;
		}> = [];
		for (const [groupId, tools] of this.groupTools) {
			if (groupId === 'unknown') continue;
			out.push({
				groupId,
				description: GROUP_DESCRIPTIONS[groupId] ?? groupId,
				toolCount: tools.size,
				loaded: this.activeGroups.has(groupId),
				pinned: this.pinnedGroups.has(groupId) || groupId === 'discovery',
				recommended: recommended.has(groupId),
			});
		}
		return out.sort((a, b) => {
			if (a.recommended !== b.recommended) {
				return a.recommended ? -1 : 1;
			}
			return a.groupId.localeCompare(b.groupId);
		});
	}

	searchTools(q: string, groupFilter: string | undefined, limit: number): Array<{
		name: string;
		shortDescription: string;
		group: string;
		loaded: boolean;
		score: number;
	}> {
		const tokens = q
			.toLowerCase()
			.split(/\s+/)
			.filter(Boolean);
		const hits: Array<{
			name: string;
			shortDescription: string;
			group: string;
			loaded: boolean;
			score: number;
		}> = [];
		for (const entry of this.catalog.values()) {
			if (entry.groupId === 'unknown') continue;
			if (groupFilter) {
				const gf = groupFilter.toLowerCase();
				if (
					entry.groupId !== gf &&
					!entry.groupId.toLowerCase().startsWith(`${gf}:`) &&
					!entry.groupId.toLowerCase().startsWith(gf)
				) {
					continue;
				}
			}
			const hay = [
				entry.name,
				entry.description,
				entry.groupId,
				...entry.tags,
			]
				.join(' ')
				.toLowerCase();
			let score = 0;
			for (const t of tokens) {
				if (entry.name === t) score += 10;
				else if (entry.name.startsWith(t)) score += 5;
				else if (hay.includes(t)) score += 1;
			}
			if (score > 0) {
				hits.push({
					name: entry.name,
					shortDescription: entry.description.slice(0, 160),
					group: entry.groupId,
					loaded: this.activeGroups.has(entry.groupId),
					score,
				});
			}
		}
		return hits.sort((a, b) => b.score - a.score).slice(0, limit);
	}

	getCatalogSize(): number {
		return this.catalog.size;
	}

	getVisibleToolCount(): number {
		let n = 0;
		for (const entry of this.catalog.values()) {
			if (entry.registered.enabled) n++;
		}
		return n;
	}

	markDiscoveryRegistered(): void {
		this.discoveryRegistered = true;
	}

	isDiscoveryRegistered(): boolean {
		return this.discoveryRegistered;
	}
}

export function mcpDeferLoadingFromEnv(): boolean {
	const raw = process.env['MCP_DEFER_LOADING'];
	if (raw === undefined || raw === '') {
		return true;
	}
	const v = raw.trim().toLowerCase();
	if (v === '0' || v === 'false' || v === 'no' || v === 'off') {
		return false;
	}
	return true;
}
