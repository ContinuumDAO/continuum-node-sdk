import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
	CreateComposeInputSchema,
	CreateForgeInputSchema,
	GetMultiSignGasOptionsInputSchema,
	JoinMultiSignRequestsInputSchema,
	TransferC3InputSchema,
	TransferNativeInputSchema,
} from '../dist/core/mpc/schemas.js';
import {parseForgeDestinationChainId} from '../dist/core/mpc/mpc-input-coerce.js';
import {
	joinMultiSignPayloads,
	unwrapMultiSignPayload,
} from '../dist/evm/join-multisign.js';

const KEY_GEN_ID = 'KeyGen202606061714459993c372497';
const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const VAULT = '0x1234567890123456789012345678901234567890';

test('CreateComposeInputSchema coerces agent quirks', () => {
	const parsed = CreateComposeInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		purposeText: 'Deposit USDC',
		useCustomGas: 'false',
		chainId: '0x8453',
		actions: [
			{
				signature: 'approve(address,uint256)',
				to: TOKEN,
				args: [
					{name: 'spender', type: 'address', value: VAULT},
					{name: 'amount', type: 'uint256', value: '1000000'},
				],
			},
			{
				signature: 'deposit(uint256,address)',
				contractAddress: VAULT,
				args: [{name: 'assets', type: 'uint256', value: '1000000'}],
			},
		],
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.purpose, 'Deposit USDC');
	assert.equal(parsed.data.useCustomGas, false);
	assert.equal(parsed.data.chainId, 8453);
	assert.equal(parsed.data.actions[0]?.contractAddress, TOKEN);
});

test('CreateForgeInputSchema coerces chainId and purposeText', () => {
	const parsed = CreateForgeInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		purposeText: 'Forge batch',
		useCustomGas: 'true',
		chainId: 8453,
		broadcast: {
			transactions: [{transaction: {chainId: '8453', to: VAULT}}],
		},
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.purpose, 'Forge batch');
	assert.equal(parsed.data.useCustomGas, true);
	assert.equal(parsed.data.destinationChainID, '8453');
});

test('CreateForgeInputSchema fixes hex chain id typo', () => {
	const parsed = CreateForgeInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		destinationChainID: '0x8453',
		broadcast: {transactions: []},
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.destinationChainID, '8453');
});

test('parseForgeDestinationChainId prefers explicit destination', () => {
	assert.equal(parseForgeDestinationChainId('8453', '1'), 8453);
	assert.equal(parseForgeDestinationChainId('0x8453', undefined), 8453);
	assert.equal(parseForgeDestinationChainId(undefined, '0x8453'), 8453);
});

test('TransferNativeInputSchema coerces chainId and useCustomGas', () => {
	const parsed = TransferNativeInputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		chainId: '0x8453',
		toAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		amountWei: '1000',
		useCustomGas: 'false',
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.chainId, 8453);
	assert.equal(parsed.data.useCustomGas, false);
});

test('TransferC3InputSchema coerces toChainIdStr from hex', () => {
	const parsed = TransferC3InputSchema.safeParse({
		keyGenId: KEY_GEN_ID,
		chainId: 8453,
		tokenAddress: TOKEN,
		toStr: 'recipient',
		amountWei: '1',
		toChainIdStr: '0x2105',
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.toChainIdStr, '8453');
});

test('GetMultiSignGasOptionsInputSchema coerces chainId', () => {
	const parsed = GetMultiSignGasOptionsInputSchema.safeParse({
		chainId: '0x8453',
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.chainId, 8453);
});

const MIN_JOIN_BODY = {
	destinationChainID: '8453',
	destinationAddress: VAULT,
	msgRaw: '0x095ea7b3',
	txNonce: 1,
	txGasLimit: 100000,
	txMaxFeePerGas: 1000000000,
	txMaxPriorityFeePerGas: 100000000,
	keyList: ['0xabc'],
	pubKey: '0xpub',
};

test('JoinMultiSignRequestsInputSchema coerces aliases and JSON-string payloads', () => {
	const parsed = JoinMultiSignRequestsInputSchema.safeParse({
		payload_a: JSON.stringify({bodyForSign: MIN_JOIN_BODY}),
		payload_b: {bodyForSign: MIN_JOIN_BODY},
		startingNonce: '12',
		purposeText: 'Approve then deposit',
	});
	assert.equal(parsed.success, true);
	if (!parsed.success) return;
	assert.equal(parsed.data.firstNonce, 12);
	assert.equal(parsed.data.purpose, 'Approve then deposit');
	assert.deepEqual(
		(parsed.data.payloadA as {bodyForSign: typeof MIN_JOIN_BODY}).bodyForSign,
		MIN_JOIN_BODY,
	);
});

test('joinMultiSignPayloads normalizes 0x8453 chain id typo on both inputs', () => {
	const bodyA = {...MIN_JOIN_BODY, destinationChainID: '0x8453'};
	const bodyB = {...MIN_JOIN_BODY, destinationChainID: '8453'};
	const joined = joinMultiSignPayloads({bodyForSign: bodyA}, {bodyForSign: bodyB}, 5);
	assert.equal(joined.bodyForSign.destinationChainID, '8453');
	assert.equal(joined.count, 2);
});

test('unwrapMultiSignPayload rejects submitted requestId-only payloads', () => {
	assert.throws(
		() => unwrapMultiSignPayload({requestId: 'Sign202605311437369991f054aa2'}),
		/submitted sign request/,
	);
});
