/** MultiSignAgentWallet on Linea Mainnet (59144). Must match mpc-auth fee_params.go and continuumdao-node-app. */
export const LINEA_MAINNET_DEFAULT_RPC = 'https://linea-rpc.publicnode.com' as const;

export const LINEA_MAINNET_DEFAULT_EXPLORER = 'https://lineascan.build' as const;

export const KEY_GEN_ADDRESS_KIND_ETHEREUM = 'ethereum' as const;

/** Deposit without month activation (contract sentinel). */
export const MPA_DEPOSIT_ONLY_NONCE = (2n ** 256n - 1n).toString();

export const MPA_WALLET_CONTRACT_CONFIG = {
	chainId: 59144,
	contractAddress: '0x7B651B7a0fa2b0ae56B4A1099F1Ca19De849e39B' as const,
	rpcUrl: LINEA_MAINNET_DEFAULT_RPC,
	blockExplorerUrl: LINEA_MAINNET_DEFAULT_EXPLORER,
} as const;

/** MkII MultiSignAgentWallet read ABI (no billingAddress). */
export const MPA_WALLET_READ_ABI = [
	{
		inputs: [
			{name: 'keyGenId', type: 'string', internalType: 'string'},
			{name: 'addressKind', type: 'string', internalType: 'string'},
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
		],
		name: 'getSubscriptionStatus',
		outputs: [
			{name: 'registered', type: 'bool', internalType: 'bool'},
			{name: 'paidThroughMonth', type: 'uint32', internalType: 'uint32'},
			{name: 'signatureCountAtMonthStart', type: 'uint256', internalType: 'uint256'},
			{name: 'keyGenCreditBalance_', type: 'uint256', internalType: 'uint256'},
			{name: 'monthlyFee', type: 'uint256', internalType: 'uint256'},
			{name: 'freeSignaturesPerMonth', type: 'uint256', internalType: 'uint256'},
			{name: 'overageFeePerSignature', type: 'uint256', internalType: 'uint256'},
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
		],
		name: 'getKeyGenWithdrawAuthority',
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
			{name: 'vpnCreditBalance_', type: 'uint256', internalType: 'uint256'},
			{name: 'vpnMonthlyFee', type: 'uint256', internalType: 'uint256'},
			{name: 'fundedForCurrentMonth', type: 'bool', internalType: 'bool'},
		],
		stateMutability: 'view',
		type: 'function',
	},
	{
		inputs: [
			{name: 'nodeKey', type: 'string', internalType: 'string'},
			{name: 'hostBinding', type: 'bytes32', internalType: 'bytes32'},
		],
		name: 'getVpnWithdrawAuthority',
		outputs: [{name: '', type: 'address', internalType: 'address'}],
		stateMutability: 'view',
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
