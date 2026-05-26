import type {ProposalTxParams} from '../../evm/tx-params.js';

export type ChainDetailRow = {
	readonly chainId?: number | string;
	readonly chainName?: string;
	readonly rpcGateway?: string;
	readonly legacy?: boolean | string;
	readonly gasLimit?: number;
	readonly gasMultiplier?: number;
	readonly gasPrice?: number;
	readonly baseFee?: number;
	readonly priorityFee?: number;
	readonly baseFeeMultiplier?: number;
	readonly defaultGetSigFeeSpeed?: string;
	readonly [key: string]: unknown;
};

export type KeyGenResultById = {
	readonly requestid?: string;
	readonly pubkeyhex?: string;
	readonly ethereumaddress?: string;
	readonly keylist?: readonly string[];
	readonly ClientKeys?: Readonly<Record<string, string>>;
	readonly [key: string]: unknown;
};

export type SignRequestDetail = {
	readonly requestid?: string;
	readonly RequestId?: string;
	readonly PubKey?: string;
	readonly MessageHash?: string;
	readonly MessageRaw?: string;
	readonly MessageRawBatch?: readonly string[];
	readonly KeyList?: readonly string[];
	readonly DestinationChainID?: string | number;
	readonly DestinationAddress?: string;
	readonly Purpose?: string;
	readonly KeyGenRequestId?: string;
	readonly status?: string;
	readonly ExtraJSON?: string;
	readonly extraJSON?: string;
	readonly [key: string]: unknown;
};

export type TxParamsFromApi = ProposalTxParams;

export type ComposeActionInput = {
	readonly signature: string;
	readonly contractAddress: string;
	readonly args: readonly {readonly name: string; readonly type: string; readonly value: string}[];
	readonly valueWei?: string;
};

export type BuiltMultiSignProposal = {
	readonly bodyForSign: Record<string, unknown>;
	readonly messageToSign: string;
	readonly chainId: number;
	readonly isBatch: boolean;
};

export type CreateMultiSignRequestResult = {
	readonly requestId: string;
};

export type GetSigFeeSpeedTier = 'slow' | 'normal' | 'fast' | 'advanced';
