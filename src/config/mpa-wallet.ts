/** MultiSignAgentWallet on Linea Mainnet (59144). */
export const LINEA_MAINNET_DEFAULT_RPC = 'https://linea-rpc.publicnode.com' as const;

export const LINEA_MAINNET_DEFAULT_EXPLORER = 'https://lineascan.build' as const;

export const MPA_WALLET_CONTRACT_CONFIG = {
	chainId: 59144,
	contractAddress: '0x55aD6Df6d8f8824486C3fd3373f1CF29eCecF0A3' as const,
	rpcUrl: LINEA_MAINNET_DEFAULT_RPC,
	blockExplorerUrl: LINEA_MAINNET_DEFAULT_EXPLORER,
} as const;

export const MPA_WALLET_READ_ABI = [
	{
		inputs: [{name: 'keyGen', type: 'address', internalType: 'address'}],
		name: 'isRegistered',
		outputs: [{name: '', type: 'bool', internalType: 'bool'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'keyGen', type: 'address', internalType: 'address'}],
		name: 'getFeeConfigForKeyGen',
		outputs: [
			{name: 'feeToken', type: 'address', internalType: 'address'},
			{name: 'freeNonceAllocation', type: 'uint256', internalType: 'uint256'},
			{name: 'feePerNonce', type: 'uint256', internalType: 'uint256'},
			{name: 'minimumDeposit', type: 'uint256', internalType: 'uint256'},
			{name: 'chainType', type: 'bytes32', internalType: 'bytes32'},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGen', type: 'address', internalType: 'address'},
			{name: 'currentNonce', type: 'uint256', internalType: 'uint256'},
		],
		name: 'getRemainingDeposit',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGen', type: 'address', internalType: 'address'},
			{name: 'currentNonce', type: 'uint256', internalType: 'uint256'},
		],
		name: 'getRemainingNonces',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

export const ERC20_ALLOWANCE_ABI = [
	{
		inputs: [
			{name: 'owner', type: 'address', internalType: 'address'},
			{name: 'spender', type: 'address', internalType: 'address'},
		],
		name: 'allowance',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
] as const;
