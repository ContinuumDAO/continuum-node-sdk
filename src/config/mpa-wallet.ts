/** MultiSignAgentWallet on Linea Mainnet (59144). */
export const LINEA_MAINNET_DEFAULT_RPC = 'https://linea-rpc.publicnode.com' as const;

export const LINEA_MAINNET_DEFAULT_EXPLORER = 'https://lineascan.build' as const;

export const KEY_GEN_ADDRESS_KIND_ETHEREUM = 'ethereum' as const;

export const MPA_WALLET_CONTRACT_CONFIG = {
	chainId: 59144,
	contractAddress: '0x55aD6Df6d8f8824486C3fd3373f1CF29eCecF0A3' as const,
	rpcUrl: LINEA_MAINNET_DEFAULT_RPC,
	blockExplorerUrl: LINEA_MAINNET_DEFAULT_EXPLORER,
} as const;

export const MPA_WALLET_READ_ABI = [
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'billingAddress', type: 'address', internalType: 'address'},
		],
		name: 'isKeyGenRegistered',
		outputs: [{name: '', type: 'bool', internalType: 'bool'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'billingAddress', type: 'address', internalType: 'address'},
		],
		name: 'getSubscriptionStatus',
		outputs: [
			{name: 'registered', type: 'bool', internalType: 'bool'},
			{name: 'nodeKeyHash', type: 'bytes32', internalType: 'bytes32'},
			{name: 'paidThroughMonth', type: 'uint32', internalType: 'uint32'},
			{name: 'signatureCountAtMonthStart', type: 'uint256', internalType: 'uint256'},
			{name: 'nodeCreditBalance_', type: 'uint256', internalType: 'uint256'},
			{name: 'monthlyFee', type: 'uint256', internalType: 'uint256'},
			{name: 'freeSignaturesPerMonth', type: 'uint256', internalType: 'uint256'},
			{name: 'overageFeePerSignature', type: 'uint256', internalType: 'uint256'},
			{name: 'fundedForCurrentMonth', type: 'bool', internalType: 'bool'},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'billingAddress', type: 'address', internalType: 'address'},
			{name: 'currentSignatureCount', type: 'uint256', internalType: 'uint256'},
		],
		name: 'getRemainingNonces',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'billingAddress', type: 'address', internalType: 'address'},
		],
		name: 'getRequiredMinimumTopUp',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'nodeKey', type: 'string', internalType: 'string'},
			{name: 'amount', type: 'uint256', internalType: 'uint256'},
			{name: 'globalNonceAtActivation', type: 'uint256', internalType: 'uint256'},
		],
		name: 'deposit',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
	{
		inputs: [],
		name: 'FEE_TOKEN',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
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
