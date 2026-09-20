import assert from 'node:assert/strict';
import {test} from 'node:test';
import {getAddress} from 'viem';
import {
	chooseCtmEtherscanFollowUp,
	composeProtocolAddresses,
	decodeCtmMetrics,
	getCtmMetrics,
	getCtmProtocolAddresses,
	getCtmTokenomicsSnapshot,
	getVeCtmLockedForAddresses,
	getVeCtmPosition,
	getVeCtmTokens,
	listCtmOnChainFollowups,
} from '../dist/core/continuumdao-tokenomics/index.js';

const CTM = getAddress('0x2026027054F5beBCEB650aBD62dC623e327658e7');
const VE = getAddress('0x221EC90B3B083A8501A37bdeb7035CeaedF3C31f');
const DAO = getAddress('0x76FF2CB03175900F1D83328C82D27EA9aeaF2355');
const C3 = getAddress('0x58B610a359c870E0fc941139821a51F5aa23f14E');
const DIST = getAddress('0xD836F55ecc0EE45a852460b4243001e642eCca86');
const NP = getAddress('0x1111111111111111111111111111111111111111');
const REWARDS = getAddress('0x2222222222222222222222222222222222222222');
const MSAW = getAddress('0x3333333333333333333333333333333333333333');
const WALLET = getAddress('0x4444444444444444444444444444444444444444');

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: {'content-type': 'application/json'},
	});
}

function mockApiFetch(overrides?: {
	metrics?: Record<string, string>;
	userTokens?: Array<{id: string; locked: string; end: number; votes: string}>;
	pageTokens?: Array<{id: string; locked: string; end: number; votes: string}>;
	total?: number;
}): typeof fetch {
	return async url => {
		const path = new URL(String(url)).pathname;
		if (path === '/metrics') {
			return jsonResponse({
				escrowed: '1000000000000000000',
				totalSupply: '2000000000000000000',
				circulatingSupply: '500000000000000000',
				totalPower: '750000000000000000',
				holders: '12',
				avgLockDuration: '86400',
				...overrides?.metrics,
			});
		}
		if (path === '/protocol/ctm') return jsonResponse({address: CTM});
		if (path === '/protocol/ve') return jsonResponse({address: VE});
		if (path === '/protocol/dao') return jsonResponse({address: DAO});
		if (path === '/protocol/c3gov') return jsonResponse({address: C3});
		if (path === '/protocol/dist') return jsonResponse({address: DIST});
		if (path === '/protocol/networks') {
			return jsonResponse([
				{name: 'ethereum', label: 'Ethereum', chainId: '1', c3governor: C3},
				{name: 'linea', label: 'Linea', chainId: '59144', c3governor: C3},
			]);
		}
		if (path.toLowerCase() === `/user/${WALLET}`.toLowerCase()) {
			return jsonResponse({
				tokens: overrides?.userTokens ?? [
					{id: '7', locked: '1000000000000000000', end: 2_000_000_000, votes: '500000000000000000'},
				],
			});
		}
		if (path.startsWith('/user/')) {
			return jsonResponse({tokens: []});
		}
		if (path === '/tokens') {
			return jsonResponse({
				total: overrides?.total ?? 1,
				tokens: overrides?.pageTokens ?? [
					{id: '7', locked: '1000000000000000000', end: 2_000_000_000, votes: '500000000000000000'},
				],
			});
		}
		return new Response('not found', {status: 404});
	};
}

const onchainDeps = {
	readVotingEscrow: async () => ({
		token: CTM,
		governor: DAO,
		nodeProperties: NP,
		rewards: REWARDS,
		treasury: DAO,
		msaw: MSAW,
	}),
	readNodePropertiesMsaw: async () => MSAW,
	readAccountVoting: async () => ({
		votingPower: 1500000000000000000n,
		delegates: WALLET,
		lastVotedAt: 1_700_000_000,
		lastVotedProposalId: '42',
	}),
	readTokenOwner: async () => WALLET,
	readLocked: async () => ({
		amount: 3000000000000000000n,
		end: 2_000_000_000n,
	}),
};

test('decodeCtmMetrics converts wei and documents circulating formula', () => {
	const decoded = decodeCtmMetrics({
		escrowed: '1000000000000000000',
		totalSupply: '2000000000000000000',
		circulatingSupply: '500000000000000000',
		totalPower: '750000000000000000',
		holders: '12',
		avgLockDuration: '86400',
	});
	assert.equal(decoded.decoded.escrowedCtm, '1');
	assert.equal(decoded.decoded.totalSupplyCtm, '2');
	assert.equal(decoded.decoded.circulatingSupplyCtm, '0.5');
	assert.equal(decoded.decoded.totalPower, '0.75');
	assert.equal(decoded.decoded.holders, 12);
	assert.equal(decoded.decoded.avgLockDurationDays, '1');
	assert.match(decoded.circulatingSupplyFormula, /globalSupply/);
	assert.match(decoded.circulatingSupplyNote, /unlocked CTM/);
	assert.equal(decoded.maxSupplyCtm, '100000000');
});

test('composeProtocolAddresses keeps API CTM canonical and adds VE-derived rows', () => {
	const composed = composeProtocolAddresses(
		{
			ctm: CTM,
			ve: VE,
			dao: DAO,
			c3gov: C3,
			dist: DIST,
			networks: [{name: 'linea', label: 'Linea', chainId: '59144', c3governor: C3}],
		},
		{
			token: CTM,
			governor: DAO,
			nodeProperties: NP,
			rewards: REWARDS,
			treasury: DAO,
			msaw: MSAW,
		},
	);
	const byId = Object.fromEntries(composed.addresses.map(row => [row.id, row]));
	assert.equal(byId.ctm?.source, 'app-api');
	assert.equal(byId.ctm?.address, CTM);
	assert.ok(byId.ctm?.explorers?.some(link => link.chainId === 1 && link.tokenExplorerUrl));
	assert.ok(byId.ctm?.explorers?.some(link => link.chainId === 59144));
	assert.equal(byId.nodeProperties?.address, NP);
	assert.equal(byId.nodeProperties?.source, 'votingEscrow');
	assert.equal(byId.msaw?.source, 'nodeProperties');
	assert.equal(byId.msaw?.explorerUrl, `https://lineascan.build/address/${MSAW}`);
	assert.equal(byId['votingEscrow.token'], undefined);
	assert.equal(composed.warnings.length, 0);
});

test('composeProtocolAddresses surfaces VE token mismatch without overriding API CTM', () => {
	const other = getAddress('0x5555555555555555555555555555555555555555');
	const composed = composeProtocolAddresses(
		{
			ctm: CTM,
			ve: VE,
			dao: DAO,
			c3gov: C3,
			dist: DIST,
			networks: [],
		},
		{token: other},
	);
	const ctm = composed.addresses.find(row => row.id === 'ctm');
	const veToken = composed.addresses.find(row => row.id === 'votingEscrow.token');
	assert.equal(ctm?.address, CTM);
	assert.equal(ctm?.source, 'app-api');
	assert.equal(veToken?.address, other);
	assert.equal(veToken?.source, 'votingEscrow');
	assert.ok(composed.warnings.some(warning => warning.includes('/protocol/ctm')));
});

test('chooseCtmEtherscanFollowUp tells the operator to load etherscan when absent', () => {
	const followUp = chooseCtmEtherscanFollowUp({
		activeServers: [],
		catalogServers: [{id: 'etherscan'}],
		addresses: [{id: 'ctm', address: CTM, chainId: 59144, role: 'CTM', source: 'app-api'}],
	});
	assert.equal(followUp.etherscan.available, false);
	assert.match(followUp.etherscan.note, /etherscan MCP is loaded/);
	assert.deepEqual(followUp.etherscan.enable?.addFromCatalog, {id: 'etherscan'});
	assert.deepEqual(followUp.etherscan.enable?.addEnvironmentVariable, {
		name: 'ETHERSCAN_API_KEY',
	});
	assert.equal(followUp.etherscan.playbooks.some(book => book.id === 'token-info'), true);
	assert.equal(followUp.etherscan.playbooks.every(book => book.unlocked === false), true);
});

test('chooseCtmEtherscanFollowUp asks for ETHERSCAN_API_KEY when server is active without key', () => {
	const followUp = chooseCtmEtherscanFollowUp({
		activeServers: [{id: 'etherscan', envConfigured: false, apiKeyEnvVar: 'ETHERSCAN_API_KEY'}],
		catalogServers: [],
		addresses: [],
	});
	assert.equal(followUp.etherscan.available, false);
	assert.equal(followUp.etherscan.serverId, 'etherscan');
	assert.match(followUp.etherscan.note, /ETHERSCAN_API_KEY/);
	assert.deepEqual(followUp.etherscan.enable?.addEnvironmentVariable, {
		name: 'ETHERSCAN_API_KEY',
	});
});

test('chooseCtmEtherscanFollowUp unlocks playbooks when etherscan is ready', () => {
	const followUp = chooseCtmEtherscanFollowUp({
		activeServers: [{id: 'etherscan', envConfigured: true}],
		catalogServers: [],
		addresses: [
			{id: 'ctm', address: CTM, chainId: 59144, role: 'CTM', source: 'app-api'},
			{id: 'votingEscrow', address: VE, chainId: 59144, role: 've', source: 'app-api'},
			{id: 'dao', address: DAO, chainId: 59144, role: 'dao', source: 'app-api'},
		],
	});
	assert.equal(followUp.etherscan.available, true);
	assert.equal(followUp.etherscan.serverId, 'etherscan');
	assert.deepEqual(followUp.etherscan.enable?.agentLoadMcpServer, {serverId: 'etherscan'});
	const tokenInfo = followUp.etherscan.playbooks.find(book => book.id === 'token-info');
	assert.equal(tokenInfo?.unlocked, true);
	assert.ok(tokenInfo?.calls.some(call => call.tool === 'etherscan__get_token_info'));
	assert.ok(tokenInfo?.calls.some(call => call.args.chainid === 1));
	assert.ok(tokenInfo?.calls.some(call => call.args.chainid === 59144));
	const topHolders = followUp.etherscan.playbooks.find(book => book.id === 'top-holders');
	assert.equal(topHolders?.then?.tool, 'get_ve_ctm_locked_for_addresses');
	assert.match(topHolders?.then?.note ?? '', /locked\(\)/);
});

test('getCtmProtocolAddresses uses live API plus mocked VotingEscrow views', async () => {
	const result = await getCtmProtocolAddresses({
		fetchImpl: mockApiFetch(),
		...onchainDeps,
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	const ids = result.data.addresses.map(row => row.id);
	assert.ok(ids.includes('ctm'));
	assert.ok(ids.includes('nodeProperties'));
	assert.ok(ids.includes('msaw'));
	assert.equal(
		result.data.addresses.find(row => row.id === 'ctm')?.tokenExplorerUrl,
		`https://lineascan.build/token/${CTM}`,
	);
});

test('getCtmMetrics attaches locked etherscan follow-up when the server is absent', async () => {
	const result = await getCtmMetrics(undefined, {
		fetchImpl: mockApiFetch(),
		...onchainDeps,
		listMcpServersFn: async scope =>
			scope === 'active'
				? {ok: true, data: {scope: 'active', activeServers: []}}
				: {ok: true, data: {scope: 'catalog', availableCatalog: [{id: 'etherscan'}]}},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.decoded.holders, 12);
	assert.equal(result.data.onChainFollowUp.etherscan.available, false);
	assert.match(result.data.onChainFollowUp.etherscan.note, /further on-chain tools/i);
});

test('listCtmOnChainFollowups is ready when etherscan is active with a key', async () => {
	const result = await listCtmOnChainFollowups(undefined, {
		fetchImpl: mockApiFetch(),
		...onchainDeps,
		listMcpServersFn: async scope =>
			scope === 'active'
				? {
						ok: true,
						data: {
							scope: 'active',
							activeServers: [{id: 'etherscan', envConfigured: true}],
						},
					}
				: {ok: true, data: {scope: 'catalog', availableCatalog: []}},
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.etherscan.available, true);
	assert.ok(result.data.etherscan.playbooks.some(book => book.id === 'verify-contracts'));
});

test('getVeCtmPosition adds Lineascan NFT and wallet links', async () => {
	const result = await getVeCtmPosition(
		{address: WALLET},
		{fetchImpl: mockApiFetch(), ...onchainDeps},
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.explorerUrl, `https://lineascan.build/address/${WALLET}`);
	assert.equal(result.data.tokens[0]?.explorerUrl, `https://lineascan.build/token/${VE}?a=7`);
	assert.equal(result.data.tokens[0]?.lockedCtm, '3');
	assert.equal(result.data.tokens[0]?.locked, '3000000000000000000');
	assert.equal(result.data.lockedTotalCtm, '3');
	assert.equal(result.data.tokens[0]?.unlocksAt, '2033-05-18T03:33:20.000Z');
	assert.equal(result.data.tokens[0]?.unlocked, false);
	assert.equal(result.data.votingPowerCtm, '1.5');
	assert.equal(result.data.lastVoted.at, 1_700_000_000);
	assert.equal(result.data.lastVoted.proposalId, '42');
	assert.equal(result.data.lastVoted.atIso, '2023-11-14T22:13:20.000Z');
});

test('getVeCtmTokens includes owner voting power, unlock time, and last vote', async () => {
	const result = await getVeCtmTokens(
		{page: 0},
		{fetchImpl: mockApiFetch(), ...onchainDeps},
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.tokens[0]?.owner?.address, WALLET);
	assert.equal(result.data.tokens[0]?.owner?.votingPowerCtm, '1.5');
	assert.equal(result.data.tokens[0]?.owner?.lastVoted.proposalId, '42');
	assert.equal(result.data.tokens[0]?.lockedCtm, '3');
	assert.equal(result.data.tokens[0]?.unlocksAt, '2033-05-18T03:33:20.000Z');
});

test('getVeCtmLockedForAddresses sums VotingEscrow.locked per holder address', async () => {
	const emptyHolder = getAddress('0x5555555555555555555555555555555555555555');
	const result = await getVeCtmLockedForAddresses(
		{addresses: [WALLET, emptyHolder]},
		{fetchImpl: mockApiFetch(), ...onchainDeps},
	);
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.equal(result.data.addresses.length, 2);
	assert.equal(result.data.addresses[0]?.address, WALLET);
	assert.equal(result.data.addresses[0]?.lockedTotal, '3000000000000000000');
	assert.equal(result.data.addresses[0]?.lockedTotalCtm, '3');
	assert.equal(result.data.addresses[0]?.tokenCount, 1);
	assert.equal(result.data.addresses[0]?.tokens[0]?.lockedCtm, '3');
	assert.equal(result.data.addresses[1]?.address, emptyHolder);
	assert.equal(result.data.addresses[1]?.lockedTotal, '0');
	assert.equal(result.data.addresses[1]?.tokenCount, 0);
	assert.match(result.data.addresses[1]?.note ?? '', /No veCTM NFTs/);
});

test('getCtmTokenomicsSnapshot includes allocation note and addresses', async () => {
	const result = await getCtmTokenomicsSnapshot(undefined, {
		fetchImpl: mockApiFetch(),
		...onchainDeps,
		listMcpServersFn: async () => ({
			ok: true,
			data: {scope: 'active', activeServers: []},
		}),
	});
	assert.equal(result.ok, true);
	if (!result.ok) return;
	assert.match(result.data.allocationNote, /Treasury 45%/);
	assert.ok(result.data.addresses.some(row => row.id === 'ctm'));
	assert.ok(result.data.addresses.some(row => row.id === 'nodeProperties'));
});
