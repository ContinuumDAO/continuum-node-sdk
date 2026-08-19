/** MultiSignAgentWallet on Linea Sepolia (59141) for testing. Must match mpc-auth fee_params.go and continuumdao-node-app. Restore mainnet after. */
export const LINEA_MAINNET_DEFAULT_RPC = 'https://linea-rpc.publicnode.com' as const;

export const LINEA_MAINNET_DEFAULT_EXPLORER = 'https://lineascan.build' as const;

export const LINEA_SEPOLIA_DEFAULT_RPC = 'https://linea-sepolia-rpc.publicnode.com' as const;

export const LINEA_SEPOLIA_DEFAULT_EXPLORER = 'https://sepolia.lineascan.build' as const;

export const KEY_GEN_ADDRESS_KIND_ETHEREUM = 'ethereum' as const;
export const KEY_GEN_ADDRESS_KIND_SOLANA = 'solana' as const;
export const KEY_GEN_ADDRESS_KIND_NEAR = 'near' as const;
export const KEY_GEN_ADDRESS_KIND_TON = 'ton' as const;
export const KEY_GEN_ADDRESS_KIND_SUI = 'sui' as const;
export const KEY_GEN_ADDRESS_KIND_STELLAR = 'stellar' as const;
export const KEY_GEN_ADDRESS_KIND_BITCOIN_SEGWIT = 'bitcoinSegwit' as const;
export const KEY_GEN_ADDRESS_KIND_BITCOIN_TAPROOT = 'bitcoinTaproot' as const;

/** @deprecated Deposit no longer takes a nonce; kept for in-flight MkII requests. */
export const MPA_DEPOSIT_ONLY_NONCE = (2n ** 256n - 1n).toString();

export const MPA_WALLET_CONTRACT_CONFIG = {
	chainId: 59141,
	contractAddress: '0x05FB84Be0749636C9f7d49d83317347Ce49B9A87' as const,
	rpcUrl: LINEA_SEPOLIA_DEFAULT_RPC,
	blockExplorerUrl: LINEA_SEPOLIA_DEFAULT_EXPLORER,
	chainName: 'Linea Sepolia',
} as const;

/** Node-scoped MultiSignAgentWallet read ABI (views take nodeKey). */
export const MPA_WALLET_READ_ABI = [
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'nodeKey', type: 'string', internalType: 'string'},
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
			{name: 'nodeKey', type: 'string', internalType: 'string'},
		],
		name: 'getSubscriptionStatus',
		outputs: [
			{name: 'registered', type: 'bool', internalType: 'bool'},
			{name: 'registeredAt', type: 'uint64', internalType: 'uint64'},
			{name: 'paidThroughMonth', type: 'uint32', internalType: 'uint32'},
			{name: 'signatureCountAtMonthStart', type: 'uint256', internalType: 'uint256'},
			{name: 'nodeCreditBalance_', type: 'uint256', internalType: 'uint256'},
			{name: 'fundedForCurrentMonth', type: 'bool', internalType: 'bool'},
			{name: 'purchasedOverageSignatures', type: 'uint256', internalType: 'uint256'},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'nodeKey', type: 'string', internalType: 'string'},
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
			{name: 'nodeKey', type: 'string', internalType: 'string'},
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
		],
		name: 'getRequiredMinimumTopUpCtm',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'nodeKey', type: 'string', internalType: 'string'}],
		name: 'getNodeCtmCreditBalance',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'ctmPaymentsPaused',
		outputs: [{name: '', type: 'bool', internalType: 'bool'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'ctmPerFeeToken',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'nodeKey', type: 'string', internalType: 'string'}],
		name: 'getNodeWithdrawAuthority',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'nodeKey', type: 'string', internalType: 'string'}],
		name: 'getPendingNodeWithdrawAuthority',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'nodeKey', type: 'string', internalType: 'string'},
			{name: 'hostBinding', type: 'bytes32', internalType: 'bytes32'},
		],
		name: 'getVpnSubscriptionStatus',
		outputs: [
			{name: 'registered', type: 'bool', internalType: 'bool'},
			{name: 'paidThroughMonth', type: 'uint32', internalType: 'uint32'},
			{name: 'nodeCreditBalance_', type: 'uint256', internalType: 'uint256'},
			{name: 'vpnMonthlyFee', type: 'uint256', internalType: 'uint256'},
			{name: 'fundedForCurrentMonth', type: 'bool', internalType: 'bool'},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'getActiveRates',
		outputs: [
			{name: 'monthlyFee', type: 'uint256', internalType: 'uint256'},
			{name: 'freeSignaturesPerMonth', type: 'uint256', internalType: 'uint256'},
			{name: 'overageFeePerSignature', type: 'uint256', internalType: 'uint256'},
			{name: 'vpnMonthlyFee', type: 'uint256', internalType: 'uint256'},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'nodeKey', type: 'string', internalType: 'string'}],
		name: 'getNodeCreditBalance',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'nodeKey', type: 'string', internalType: 'string'},
			{name: 'token', type: 'address', internalType: 'address'},
		],
		name: 'getNodeCreditBalance',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
			{name: 'nodeKey', type: 'string', internalType: 'string'},
		],
		name: 'qualifiesForVeCtmWaiver',
		outputs: [{name: '', type: 'bool', internalType: 'bool'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'nodeId', type: 'bytes32', internalType: 'bytes32'}],
		name: 'qualifiesForNodeTrial',
		outputs: [{name: '', type: 'bool', internalType: 'bool'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'addressKind', type: 'string', internalType: 'string'}],
		name: 'isAddressKindAllowed',
		outputs: [{name: '', type: 'bool', internalType: 'bool'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'nodeKey', type: 'string', internalType: 'string'}],
		name: 'nodeIdOfNodeKey',
		outputs: [{name: '', type: 'bytes32', internalType: 'bytes32'}],
		stateMutability: 'pure',
		type: 'function',
	},
	{
		inputs: [],
		name: 'FEE_TOKEN',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'ctm',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'nodeProperties',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'rewards',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 've',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [],
		name: 'feeTokenCount',
		outputs: [{name: '', type: 'uint256', internalType: 'uint256'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'index', type: 'uint256', internalType: 'uint256'}],
		name: 'feeTokenAt',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [{name: 'token', type: 'address', internalType: 'address'}],
		name: 'isSupportedFeeToken',
		outputs: [{name: '', type: 'bool', internalType: 'bool'}],
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
