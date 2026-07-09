import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {parseMcpToolInput} from '@continuumdao/ctm-mpc-defi/agent';
import {chainDetailFromRegistry} from '../dist/mcp/defi/input-adapter.js';

describe('chainDetailFromRegistry', () => {
	it('omits null baseFee and priorityFee from registry rows', () => {
		const row = chainDetailFromRegistry({
			chainId: '999',
			chainName: 'Hyperliquid',
			rpcGateway: 'https://rpc.example',
			legacy: false,
			testnet: false,
			gasLimit: 500_000,
			baseFee: null,
			priorityFee: null,
		});
		assert.equal('baseFee' in row, false);
		assert.equal('priorityFee' in row, false);
		assert.equal(row.gasLimit, 500_000);
		assert.equal(row.legacy, false);
	});

	it('allows parseMcpToolInput when chainDetail omits null fee fields', () => {
		const chainDetail = chainDetailFromRegistry({
			chainId: '999',
			chainName: 'Hyperliquid',
			rpcGateway: 'https://rpc.example',
			legacy: false,
			testnet: false,
			gasLimit: 500_000,
			baseFee: null,
			priorityFee: null,
		});
		const input = parseMcpToolInput('ctm_hyperliquid_build_limit_order_multisign', {
			keyGen: {pubkeyhex: 'aa'.repeat(32)},
			purposeText: 'HL limit',
			useCustomGas: true,
			chainId: 999,
			rpcUrl: 'https://rpc.example',
			executorAddress: '0x' + '11'.repeat(20),
			chainDetail,
			coin: 'ETH',
			isBuy: true,
			limitPxHuman: '3000',
			szHuman: '0.1',
		});
		assert.equal((input as {useCustomGas?: boolean}).useCustomGas, true);
	});
});
