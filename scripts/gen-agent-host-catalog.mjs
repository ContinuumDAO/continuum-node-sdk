#!/usr/bin/env node
/**
 * Emit dist/agent-host-catalog.json for external agent hosts (mpc-auth go:embed).
 * Run after `npm run build`. Optionally syncs to ../mpc-auth/node when present.
 */
import {writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildAgentHostCatalogJson} from '../dist/mcp/agent-host-catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distPath = join(root, 'dist', 'agent-host-catalog.json');
const payload = JSON.stringify(buildAgentHostCatalogJson(), null, 2) + '\n';

mkdirSync(dirname(distPath), {recursive: true});
writeFileSync(distPath, payload, 'utf8');
console.log('wrote', distPath);

const mpcAuthPath = join(root, '..', 'mpc-auth', 'node', 'continuum_agent_host_catalog.json');
if (existsSync(join(root, '..', 'mpc-auth', 'node'))) {
	writeFileSync(mpcAuthPath, payload, 'utf8');
	console.log('synced', mpcAuthPath);
}
