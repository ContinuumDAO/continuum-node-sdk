import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../result.js';
import {
	BuildForgeDryRunMultiSignPayloadInputSchema,
	CreateForgeDryRunImportInputSchema,
	ImportAndJoinForgeDryRunsInputSchema,
} from './schemas.js';
import {
	buildForgeDryRunMultiSignPayloadCore,
	mirrorForgeDryRunArtifacts,
} from './forge-dry-run-build.js';
import {joinedMultiSignHelperArtifactPath} from '../../evm/forge-dry-run-paths.js';
import {signAndSubmitMultiSignRequest} from './sign-request-body.js';
import {joinMultiSignPayloads} from '../../evm/join-multisign.js';
import {createPublicClientForChain, executorAddressFromKeyGen} from './context.js';
import {fetchKeyGenResult} from '../keygen.js';
import {writeUserFolderFile} from '../agent/user-folder.js';

export async function importForgeDryRunMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<
	SdkResult<{
		requestId: string;
		chainId: string;
		txCount: number;
		dryRunSourcePath: string;
		artifactPath?: string;
		refreshedNonces: boolean;
	}>
> {
	const parsed = CreateForgeDryRunImportInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid forge dry-run import input.'};
	}

	const built = await buildForgeDryRunMultiSignPayloadCore(config, parsed.data);
	if (!built.ok) return built;

	const submitted = await signAndSubmitMultiSignRequest(
		config,
		built.data.bodyForSign,
	);
	if (!submitted.ok) return submitted;

	const artifacts = await mirrorForgeDryRunArtifacts(config, built.data);

	return {
		ok: true,
		data: {
			requestId: submitted.data.requestId,
			chainId: built.data.chainId,
			txCount: built.data.txCount,
			dryRunSourcePath: built.data.dryRunSourcePath,
			artifactPath: artifacts.forgeArtifactPath,
			refreshedNonces: built.data.refreshedNonces,
		},
	};
}

export async function buildForgeDryRunMultiSignPayload(
	config: NodeSdkConfig,
	input: unknown,
): Promise<
	SdkResult<{
		bodyForSign: Record<string, unknown>;
		messageToSign: string;
		chainId: string;
		count: number;
		dryRunSourcePath: string;
		forgeArtifactPath?: string;
		helperArtifactPath: string;
		refreshedNonces: boolean;
	}>
> {
	const parsed = BuildForgeDryRunMultiSignPayloadInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid forge dry-run build input.'};
	}

	const built = await buildForgeDryRunMultiSignPayloadCore(config, parsed.data);
	if (!built.ok) return built;

	const artifacts = await mirrorForgeDryRunArtifacts(config, built.data);
	if (!artifacts.helperArtifactPath) {
		return {
			ok: false,
			reason: 'Built payload but failed to write helper JSON under data/artifacts/multisign/.',
		};
	}

	return {
		ok: true,
		data: {
			bodyForSign: built.data.bodyForSign,
			messageToSign: built.data.payload.messageToSign,
			chainId: built.data.chainId,
			count: built.data.txCount,
			dryRunSourcePath: built.data.dryRunSourcePath,
			forgeArtifactPath: artifacts.forgeArtifactPath,
			helperArtifactPath: artifacts.helperArtifactPath,
			refreshedNonces: built.data.refreshedNonces,
		},
	};
}

export async function importAndJoinForgeDryRunsMultiSignRequest(
	config: NodeSdkConfig,
	input: unknown,
): Promise<
	SdkResult<{
		requestId: string;
		chainId: string;
		txCount: number;
		dryRunSourcePathA: string;
		dryRunSourcePathB: string;
		helperArtifactPath?: string;
		refreshedNonces: boolean;
	}>
> {
	const parsed = ImportAndJoinForgeDryRunsInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid forge dry-run join import input.'};
	}

	const builtA = await buildForgeDryRunMultiSignPayloadCore(config, {
		keyGenId: parsed.data.keyGenId,
		dryRunFilePath: parsed.data.dryRunFilePathA,
		dryRunJson: parsed.data.dryRunJsonA,
		useCustomGas: parsed.data.useCustomGas,
		refreshStaleNonces: parsed.data.refreshStaleNonces,
		purpose: parsed.data.purpose,
	});
	if (!builtA.ok) return builtA;

	const builtB = await buildForgeDryRunMultiSignPayloadCore(config, {
		keyGenId: parsed.data.keyGenId,
		dryRunFilePath: parsed.data.dryRunFilePathB,
		dryRunJson: parsed.data.dryRunJsonB,
		useCustomGas: parsed.data.useCustomGas,
		refreshStaleNonces: parsed.data.refreshStaleNonces,
	});
	if (!builtB.ok) return builtB;

	if (builtA.data.chainId !== builtB.data.chainId) {
		return {
			ok: false,
			reason: `Dry-run chain mismatch: ${builtA.data.chainId} vs ${builtB.data.chainId}.`,
		};
	}

	const kg = await fetchKeyGenResult(config, parsed.data.keyGenId);
	if (!kg.ok) return kg;

	const executor = executorAddressFromKeyGen(kg.data);
	if (!executor) {
		return {ok: false, reason: 'KeyGen has no valid ethereumaddress.'};
	}

	const chainIdNum = Number.parseInt(builtA.data.chainId, 10);
	const ctx = await createPublicClientForChain(config, chainIdNum);
	if (!ctx.ok) return ctx;

	let firstNonce = parsed.data.firstNonce;
	if (firstNonce == null) {
		firstNonce = await ctx.data.publicClient.getTransactionCount({
			address: executor,
			blockTag: 'pending',
		});
	}

	let joined;
	try {
		joined = joinMultiSignPayloads(
			{bodyForSign: builtA.data.bodyForSign},
			{bodyForSign: builtB.data.bodyForSign},
			firstNonce,
			parsed.data.purpose,
		);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {ok: false, reason: msg};
	}

	await mirrorForgeDryRunArtifacts(config, builtA.data);
	await mirrorForgeDryRunArtifacts(config, builtB.data);

	const helperPath = joinedMultiSignHelperArtifactPath(builtA.data.chainId, firstNonce);
	const helperWritten = await writeUserFolderFile(
		config,
		helperPath,
		JSON.stringify(
			{
				endpoint: joined.endpoint,
				bodyForSign: joined.bodyForSign,
				messageToSign: joined.messageToSign,
				chainId: joined.chainId,
				count: joined.count,
			},
			null,
			2,
		),
	);

	const submitted = await signAndSubmitMultiSignRequest(config, joined.bodyForSign);
	if (!submitted.ok) return submitted;

	return {
		ok: true,
		data: {
			requestId: submitted.data.requestId,
			chainId: builtA.data.chainId,
			txCount: joined.count,
			dryRunSourcePathA: builtA.data.dryRunSourcePath,
			dryRunSourcePathB: builtB.data.dryRunSourcePath,
			helperArtifactPath: helperWritten.ok ? helperWritten.data.path : undefined,
			refreshedNonces: builtA.data.refreshedNonces || builtB.data.refreshedNonces,
		},
	};
}
