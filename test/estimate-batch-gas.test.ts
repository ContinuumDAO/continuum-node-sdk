import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Address, Hex} from 'viem';
import {
	applyEstimateGasHeadroom,
	EVM_BATCH_GAS_DEFAULT_FLOOR,
	EVM_NATIVE_TRANSFER_GAS,
	EvmBatchGasSimulateRevertError,
	estimateEvmBatchGasLimits,
	finalizeEvmLegGasLimit,
	type EvmBatchGasRpc,
} from '../dist/evm/estimate-batch-gas.js';

const ACCOUNT = '0x27d3d9C5aDB1d61C14CB72189401193CE738b034' as Address;
const TOKEN = '0x176211869cA2b568f2A7D4EE941E073a821EE1ff' as Address;
const MPA = '0x4ebd7cCBe32a51d1638cFE90E8eD1c4BdF42f729' as Address;
const APPROVE =
	'0x095ea7b30000000000000000000000004ebd7ccbe32a51d1638cfe90e8ed1c4bdf42f72900000000000000000000000000000000000000000000000000000000000f4240' as Hex;
const DEPOSIT =
	'0x8e27d719000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000000000000000000' as Hex;
const APPROVE_FLOOR = 80_000n;
const DEPOSIT_FLOOR = 280_000n;

function rpc(over: Partial<EvmBatchGasRpc>): EvmBatchGasRpc {
	return {
		simulateSequential: async () => ({kind: 'unsupported'}),
		estimateGas: async () => {
			throw new Error('estimateGas unused');
		},
		...over,
	};
}

test('20% headroom matches Get Sig formula', () => {
	assert.equal(applyEstimateGasHeadroom(210_153n), 252_184n);
});

test('finalize prefers live sim over stored 160k and keeps deposit floor', () => {
	const gas = finalizeEvmLegGasLimit({
		simulatedGasUsed: 210_153n,
		storedProposalGas: 160_000n,
		floor: DEPOSIT_FLOOR,
	});
	assert.equal(gas, 280_000n);
});

test('sequential sim approve+deposit lifts stored 160k off the deposit leg', async () => {
	const result = await estimateEvmBatchGasLimits({
		account: ACCOUNT,
		rpc: rpc({
			simulateSequential: async () => ({kind: 'ok', gasUsed: [46_000n, 210_153n]}),
		}),
		legs: [
			{
				to: TOKEN,
				data: APPROVE,
				floor: APPROVE_FLOOR,
				storedProposalGas: 96_000n,
			},
			{
				to: MPA,
				data: DEPOSIT,
				floor: DEPOSIT_FLOOR,
				storedProposalGas: 160_000n,
			},
		],
	});
	assert.equal(result.source, 'simulate');
	assert.equal(result.simulateSupported, true);
	assert.equal(result.gasLimits[0], 96_000n);
	assert.equal(result.gasLimits[1], 280_000n);
	assert.ok(result.gasLimits[1]! > 160_000n);
});

test('unsupported RPC uses isolated estimate on approve and floor on deposit', async () => {
	const result = await estimateEvmBatchGasLimits({
		account: ACCOUNT,
		rpc: rpc({
			simulateSequential: async () => ({kind: 'unsupported'}),
			estimateGas: async ({data}) => {
				if (data.startsWith('0x095ea7b3')) return 46_000n;
				throw new Error('execution reverted: ERC20: insufficient allowance');
			},
		}),
		legs: [
			{
				to: TOKEN,
				data: APPROVE,
				floor: APPROVE_FLOOR,
				storedProposalGas: 96_000n,
			},
			{
				to: MPA,
				data: DEPOSIT,
				floor: DEPOSIT_FLOOR,
				storedProposalGas: 160_000n,
			},
		],
	});
	assert.equal(result.source, 'mixed');
	assert.equal(result.simulateSupported, false);
	assert.equal(result.gasLimits[0], 96_000n);
	assert.equal(result.gasLimits[1], applyEstimateGasHeadroom(DEPOSIT_FLOOR));
	assert.ok(result.gasLimits[1]! >= 280_000n);
});

test('unsupported RPC with no live estimate uses max(stored, floor, 150k) plus headroom', async () => {
	const result = await estimateEvmBatchGasLimits({
		account: ACCOUNT,
		rpc: rpc({
			estimateGas: async () => {
				throw new Error('revert');
			},
		}),
		legs: [
			{
				to: MPA,
				data: DEPOSIT,
				floor: DEPOSIT_FLOOR,
				storedProposalGas: 160_000n,
			},
		],
	});
	assert.equal(result.source, 'fallback');
	assert.equal(result.gasLimits[0], applyEstimateGasHeadroom(280_000n));
});

test('sim revert is surfaced instead of signing a guess', async () => {
	await assert.rejects(
		() =>
			estimateEvmBatchGasLimits({
				account: ACCOUNT,
				rpc: rpc({
					simulateSequential: async () => ({
						kind: 'revert',
						index: 1,
						message: 'InsufficientCredit',
					}),
				}),
				legs: [
					{to: TOKEN, data: APPROVE},
					{to: MPA, data: DEPOSIT},
				],
			}),
		(err: unknown) => {
			assert.ok(err instanceof EvmBatchGasSimulateRevertError);
			assert.equal(err.index, 1);
			assert.match(err.message, /Transaction 2 reverted/);
			assert.match(err.message, /InsufficientCredit/);
			return true;
		},
	);
});

test('empty calldata stays 21000', async () => {
	const result = await estimateEvmBatchGasLimits({
		account: ACCOUNT,
		rpc: rpc({
			simulateSequential: async () => ({kind: 'ok', gasUsed: [21_000n]}),
		}),
		legs: [{data: '0x', value: 1n, storedProposalGas: 21_000n}],
	});
	assert.equal(result.gasLimits[0], EVM_NATIVE_TRANSFER_GAS);
});

test('default floor is 150k before headroom when nothing else is known', () => {
	assert.equal(finalizeEvmLegGasLimit({}), applyEstimateGasHeadroom(EVM_BATCH_GAS_DEFAULT_FLOOR));
});
