#!/usr/bin/env node
/**
 * Inventory MCP tool names from registrar modules and group assignments.
 * Run: node scripts/mcp-tool-inventory.mjs [--defer] [--json] [--all]
 *
 * Default: continuum main `/mcp` tools only (142). Use --all to include optional
 * endpoints (/mcp/cmc-public, /mcp/ta, /mcp/vpn).
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const mcpDir = join(root, 'src', 'mcp');
const defer = process.argv.includes('--defer');
const asJson = process.argv.includes('--json');
const includeAll = process.argv.includes('--all');

const OPTIONAL_SCAN_PREFIXES = [
	'src/mcp/coinmarketcap-public/',
	'src/mcp/ta/',
	'src/mcp/vpn.ts',
];

const PINNED_GROUPS = new Set([
	'discovery',
	'node_info',
	'management_signer',
	'defi_discovery',
]);

const PINNED_TOOLS = new Set([
	'list_tool_groups',
	'search_continuum_tools',
	'activate_tool_group',
	'deactivate_tool_group',
	'version',
	'get_health',
	'get_connectivity_health',
	'node_id',
	'get_preferred_management_signer',
	'get_management_signers',
	'list_defi_protocols',
	'load_defi_protocol',
	'unload_defi_protocol',
	'get_defi_protocol_skill',
	'get_defi_protocol_supported_chains',
	'get_defi_protocol_supported_tokens',
	'get_tools_for_protocol',
]);

/** @type {Map<string, string>} */
const toolToGroup = new Map();

function loadGroupMapFromFile(mapPath) {
	const src = readFileSync(mapPath, 'utf8');
	const re = /^\s*([a-z0-9_]+)\s*:\s*['"]([a-z0-9_:-]+)['"]/gm;
	let m;
	while ((m = re.exec(src)) !== null) {
		toolToGroup.set(m[1], m[2]);
	}
}

function loadGroupMaps() {
	loadGroupMapFromFile(join(root, 'src', 'mcp', 'deferred', 'tool-group-map.ts'));
	loadGroupMapFromFile(
		join(root, 'src', 'mcp', 'deferred', 'optional-endpoint-groups.ts'),
	);
}

/** @param {string} name */
function camelToSnake(name) {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
		.toLowerCase();
}

function isOptionalEndpointFile(file) {
	return OPTIONAL_SCAN_PREFIXES.some(
		prefix => file === prefix || file.startsWith(prefix),
	);
}

function scanTsFiles(dir) {
	const names = [];
	for (const ent of readdirSync(dir)) {
		const p = join(dir, ent);
		if (statSync(p).isDirectory()) {
			names.push(...scanTsFiles(p));
			continue;
		}
		if (!ent.endsWith('.ts')) continue;
		const src = readFileSync(p, 'utf8');
		for (const m of src.matchAll(
			/camelToSnake\('([^']+)'\)|registerTool\(\s*['"]([a-z0-9_]+)['"]/g,
		)) {
			const raw = m[1] ?? m[2];
			if (raw) {
				const name = m[1] ? camelToSnake(m[1]) : raw;
				names.push({name, file: relative(root, p)});
			}
		}
	}
	return names;
}

loadGroupMaps();
const found = scanTsFiles(mcpDir);
const coreFound = found.filter(f => !isOptionalEndpointFile(f.file));
const scoped = includeAll ? found : coreFound;

const byGroup = new Map();
for (const {name, file} of scoped) {
	const group = toolToGroup.get(name) ?? '(unmapped)';
	if (!byGroup.has(group)) byGroup.set(group, []);
	byGroup.get(group).push({name, file});
}

const allNames = [...new Set(scoped.map(f => f.name))].sort();
const coreNames = [...new Set(coreFound.map(f => f.name))].sort();
const optionalNames = [...new Set(found.filter(f => isOptionalEndpointFile(f.file)).map(f => f.name))].sort();

const report = {
	scope: includeAll ? 'all-endpoints' : 'continuum-main',
	coreContinuumTools: coreNames.length,
	optionalEndpointTools: optionalNames.length,
	totalTools: allNames.length,
	deferModeEstimateVisible: defer ? PINNED_TOOLS.size : allNames.length,
	groups: Object.fromEntries(
		[...byGroup.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([g, tools]) => [g, tools.map(t => t.name).sort()]),
	),
	unmapped: allNames.filter(n => !toolToGroup.has(n)),
};

if (asJson) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log(`Scope: ${report.scope}`);
	console.log(`Continuum main /mcp tools: ${report.coreContinuumTools}`);
	console.log(`Optional endpoint tools (CMC, TA, VPN): ${report.optionalEndpointTools}`);
	if (includeAll) {
		console.log(`Total (all endpoints): ${report.totalTools}`);
	}
	if (defer) {
		console.log(`Defer init estimate (pinned on main): ${report.deferModeEstimateVisible}`);
	}
	console.log('\nBy group:');
	for (const [g, tools] of Object.entries(report.groups)) {
		console.log(`  ${g}: ${tools.length}`);
	}
	if (report.unmapped.length) {
		console.log(`\nUnmapped (${report.unmapped.length}): ${report.unmapped.join(', ')}`);
	}
	if (!includeAll) {
		console.log('\nTip: pass --all to include optional /mcp/cmc-public, /mcp/ta, /mcp/vpn tools.');
	}
}
