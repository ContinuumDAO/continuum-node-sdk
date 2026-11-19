import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseGwei, serializeTransaction} from 'viem';
import {resolveEip1559FeeWei} from '../dist/evm/eip1559-fee-wei.js';
import {medianPriorityWeiFromFeeHistory} from '../dist/evm/chain-fees.js';

test('a sub-gwei base fee with no priority does not invent a 1 gwei tip', () => {
	const fee = resolveEip1559FeeWei(0.02038, 0);
	assert.equal(fee.maxPriorityFeePerGas, 0n);
	assert.ok(fee.maxFeePerGas > 0n);
	assert.ok(fee.maxPriorityFeePerGas <= fee.maxFeePerGas);
	serializeTransaction({
		type: 'eip1559',
		to: '0x2d8FCf2A4F8ECe5b6232d63A4c62b23641b7e611',
		data: '0x',
		value: 1980000000000000n,
		gas: 21000n,
		maxFeePerGas: fee.maxFeePerGas,
		maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
		nonce: 0,
		chainId: 999,
	});
});

test('a reported tip stays under the cap', () => {
	const fee = resolveEip1559FeeWei(20, 1);
	assert.equal(fee.maxPriorityFeePerGas, parseGwei('1'));
	assert.ok(fee.maxFeePerGas >= fee.maxPriorityFeePerGas);
});

test('the tip is the 50th percentile of the latest block that included transactions', () => {
	const latestMedian = medianPriorityWeiFromFeeHistory([['0x1'], null, ['0x5f5e100']]);
	assert.equal(latestMedian, 100000000n);
	assert.equal(medianPriorityWeiFromFeeHistory([null, ['0x0']]), 0n);
	assert.equal(medianPriorityWeiFromFeeHistory([null, null]), undefined);
});

test('missing base and priority falls back to a 1 gwei tip under a 2 gwei cap', () => {
	const fee = resolveEip1559FeeWei(0, 0);
	assert.equal(fee.maxPriorityFeePerGas, parseGwei('1'));
	assert.equal(fee.maxFeePerGas, parseGwei('2'));
});
