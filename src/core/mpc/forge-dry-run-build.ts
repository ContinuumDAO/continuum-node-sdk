import {getAddress} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {
	parseDryRunFileToSignRequestPayload,
	type ChainFeeConfig,
	type FoundryDryRunFile,
	type SignRequestPayload,
} from '../../evm/forge-broadcast.js';
import {fetchChainFeeParams} from '../../evm/chain-fees.js';
import {
	forgeDryRunArtifactPath,
	forgeDryRunHelperArtifactPath,
	parseForgeDryRunPath,
} from '../../evm/forge-dry-run-paths.js';
import {getUserFolderFile, writeUserFolderFile} from '../agent/user-folder.js';
import {fetchKeyGenResult} from '../keygen.js';
import {createPublicClientForChain} from './context.js';
import {getClientIdFromKeyGenResult} from '../../evm/rpc-utils.js';
import type {ChainDetailRow} from './types.js';

export const ANVIL_SIMULATION_CHAIN_ID = '364865';

export type ForgeDryRunBuildInput = {
	keyGenId: string;
	dryRunFilePath?: string;
	dryRunJson?: string;
	useCustomGas?: boolean;
	startingNonce?: number;
	refreshStaleNonces?: boolean;
	purpose?: string;
};

export type ForgeDryRunBuildResult = {
	payload: SignRequestPayload;
	bodyForSign: Record<string, unknown>;
	chainId: string;
	txCount: number;
	dryRunSourcePath: string;
	dryRunJson: string;
	refreshedNonces: boolean;
	scriptName: string;
};

function chainDetailForParse(
	chainDetail: ChainDetailRow,
	useCustomGas: boolean,
): ChainFeeConfig | undefined {
	if (!useCustomGas) return undefined;
	return {
		legacy: Boolean(chainDetail.legacy),
		gasLimit: chainDetail.gasLimit,
		gasPrice: chainDetail.gasPrice,
		baseFeeMultiplier: chainDetail.baseFeeMultiplier,
		gasMultiplier: chainDetail.gasMultiplier,
	};
}

export function parseFileFirstNonce(raw: unknown): number {
	if (raw == null) return 0;
	if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
	const text = String(raw).trim();
	if (!text) return 0;
	const parsed = text.startsWith('0x') || text.startsWith('0X')
		? Number.parseInt(text, 16)
		: Number.parseInt(text, 10);
	return Number.isFinite(parsed) ? parsed : 0;
}

export function validateDryRunFile(json: string): SdkResult<FoundryDryRunFile> {
	let parsed: FoundryDryRunFile;
	try {
		parsed = JSON.parse(json) as FoundryDryRunFile;
	} catch {
		return {
			ok: false,
			reason:
				'Invalid dry-run JSON. Use broadcast/<script>/<chainId>/dry-run/run-latest.json from forge script (with --rpc-url and --sender).',
		};
	}
	const chainId = parsed?.chain;
	if (
		chainId == null ||
		!Array.isArray(parsed?.transactions) ||
		parsed.transactions.length === 0
	) {
		return {
			ok: false,
			reason: 'Invalid or empty dry-run file. Need .chain and .transactions[].',
		};
	}
	const chainIdStr = String(chainId).trim();
	if (chainIdStr === ANVIL_SIMULATION_CHAIN_ID) {
		return {
			ok: false,
			reason:
				'Dry-run file has simulation chain ID 364865. Re-run forge script with --rpc-url for the target chain.',
		};
	}
	const firstTx = parsed.transactions[0]?.transaction;
	const sender = firstTx?.from?.trim();
	if (!sender) {
		return {
			ok: false,
			reason: 'Dry-run file has no sender (from) in the first transaction.',
		};
	}
	return {ok: true, data: parsed};
}

export async function loadForgeDryRunJson(
	config: NodeSdkConfig,
	dryRunFilePath?: string,
	dryRunJson?: string,
): Promise<SdkResult<{json: string; sourcePath: string}>> {
	const pathTrimmed = dryRunFilePath?.trim();
	let json = dryRunJson?.trim() ?? '';
	let sourcePath = pathTrimmed ?? '';

	if (!json) {
		if (!pathTrimmed) {
			return {ok: false, reason: 'Provide dryRunFilePath or dryRunJson.'};
		}
		const file = await getUserFolderFile(config, pathTrimmed);
		if (!file.ok) return file;
		json = file.data.content;
		sourcePath = file.data.path;
	}

	return {ok: true, data: {json, sourcePath}};
}

function scriptNameFromSourcePath(sourcePath: string): string {
	const pathMeta = parseForgeDryRunPath(sourcePath);
	return (
		pathMeta.scriptName ??
		sourcePath.split('/').find(part => part.endsWith('.s.sol')) ??
		'script'
	);
}

export async function buildForgeDryRunMultiSignPayloadCore(
	config: NodeSdkConfig,
	input: ForgeDryRunBuildInput,
): Promise<SdkResult<ForgeDryRunBuildResult>> {
	const loaded = await loadForgeDryRunJson(
		config,
		input.dryRunFilePath,
		input.dryRunJson,
	);
	if (!loaded.ok) return loaded;

	const fileCheck = validateDryRunFile(loaded.data.json);
	if (!fileCheck.ok) return fileCheck;
	const dryRunFile = fileCheck.data;

	const chainIdStr = String(dryRunFile.chain).trim();
	const chainIdNum = Number.parseInt(chainIdStr, 10);
	if (!Number.isFinite(chainIdNum) || chainIdNum <= 0) {
		return {ok: false, reason: 'Invalid chain id in dry-run file.'};
	}

	const kg = await fetchKeyGenResult(config, input.keyGenId);
	if (!kg.ok) return kg;

	const ctx = await createPublicClientForChain(config, chainIdNum);
	if (!ctx.ok) return ctx;

	const firstTx = dryRunFile.transactions[0]?.transaction;
	const senderRaw = firstTx?.from?.trim() ?? '';
	let sender: `0x${string}`;
	try {
		sender = getAddress(senderRaw.startsWith('0x') ? senderRaw : `0x${senderRaw}`);
	} catch {
		return {ok: false, reason: 'Dry-run file has invalid sender (from) address.'};
	}

	const pendingNonce = await ctx.data.publicClient.getTransactionCount({
		address: sender,
		blockTag: 'pending',
	});
	const fileFirstNonce = parseFileFirstNonce(firstTx?.nonce);
	const staleNonces = fileFirstNonce < pendingNonce;
	const refreshStaleNonces = input.refreshStaleNonces ?? true;
	if (staleNonces && !refreshStaleNonces) {
		return {
			ok: false,
			reason: `Dry-run nonces are stale (file starts at ${fileFirstNonce}, pending ${pendingNonce}). Re-run forge script or set refreshStaleNonces: true.`,
		};
	}

	const firstNonce =
		input.startingNonce ??
		(staleNonces && refreshStaleNonces ? pendingNonce : fileFirstNonce);

	const feeParams = await fetchChainFeeParams(
		ctx.data.chainDetail.rpcGateway ?? '',
		chainIdStr,
	);
	const payload = parseDryRunFileToSignRequestPayload(loaded.data.json, {
		firstNonce,
		chainDetail: chainDetailForParse(
			ctx.data.chainDetail,
			Boolean(input.useCustomGas),
		),
		feeParams: {
			isEip1559: feeParams.isEip1559,
			baseFeeGwei: feeParams.baseFeeGwei,
			priorityFeeGwei: feeParams.priorityFeeGwei,
			gasPriceGwei: feeParams.gasPriceGwei,
		},
	});
	if (!payload) {
		return {ok: false, reason: 'Could not build multiSign payload from dry-run file.'};
	}

	const keyList = kg.data.keylist ?? [];
	const clientId = getClientIdFromKeyGenResult(kg.data);
	const body = payload.bodyForSign;
	if (keyList.length > 0) body.keyList = keyList;
	if (kg.data.pubkeyhex) body.pubKey = kg.data.pubkeyhex;
	if (input.purpose) body.purpose = input.purpose;
	if (clientId) body.clientId = clientId;

	const scriptName = scriptNameFromSourcePath(loaded.data.sourcePath);

	return {
		ok: true,
		data: {
			payload,
			bodyForSign: body,
			chainId: chainIdStr,
			txCount: payload.count,
			dryRunSourcePath: loaded.data.sourcePath,
			dryRunJson: loaded.data.json,
			refreshedNonces: staleNonces && refreshStaleNonces,
			scriptName,
		},
	};
}

export async function mirrorForgeDryRunArtifacts(
	config: NodeSdkConfig,
	build: ForgeDryRunBuildResult,
): Promise<{forgeArtifactPath?: string; helperArtifactPath?: string}> {
	const out: {forgeArtifactPath?: string; helperArtifactPath?: string} = {};
	const forgePath = forgeDryRunArtifactPath(build.chainId, build.scriptName);
	if (build.dryRunSourcePath !== forgePath) {
		const copied = await writeUserFolderFile(config, forgePath, build.dryRunJson);
		if (copied.ok) out.forgeArtifactPath = copied.data.path;
	} else {
		out.forgeArtifactPath = build.dryRunSourcePath;
	}

	const helperPath = forgeDryRunHelperArtifactPath(build.chainId, build.scriptName);
	const helperPayload = {
		endpoint: build.payload.endpoint,
		bodyForSign: build.bodyForSign,
		messageToSign: build.payload.messageToSign,
		chainId: build.chainId,
		count: build.txCount,
	};
	const helperWritten = await writeUserFolderFile(
		config,
		helperPath,
		JSON.stringify(helperPayload, null, 2),
	);
	if (helperWritten.ok) out.helperArtifactPath = helperWritten.data.path;

	return out;
}
