import {promises as fs} from 'node:fs';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import type {NodeSdkConfig} from '../config/schema.js';
import {
	buildManagementCanonicalJson,
	buildManagementUnsignedBody,
} from '../api/canonical-json.js';
import {
	fetchEd25519ManagementNonce,
	fetchEIP191ManagementNonce,
	managementGet,
	managementPost,
} from '../api/management-api.js';
import {
	resolveKeyPathForPublicKey,
	resolveSignerPublicKey,
	signUtf8Message,
	readPublicKeyHex,
	readPublicKeyHexFromPrivateKeyPath,
} from '../api/management-key.js';
import {discoverBootstrapKey, discoverKeys, resolveKeyPath} from '../config/keys.js';
import {addedKeysDir, MANAGEMENT_KEYS_DIR} from '../config/paths.js';
import {nodeId} from './general.js';
import type {SdkEmptyResult, SdkResult} from './result.js';
import {
	type ManagementKeyEntry,
	type ManagementKeyResult,
	type SignedManagementBody,
} from './schemas.js';
import {EdDSAPubKeySchema} from '../schemas/extended.js';
import type {
	ManagementKeyOption,
	ManagementSigningMethod,
	EIP191ManagementSigning,
	SelectedSigningKey,
} from '../schemas/extended.js';
import {DEFAULT_MANAGEMENT_SIGNING} from '../schemas/extended.js';

export type {ManagementKeyEntry, ManagementKeyResult, SignedManagementBody} from './schemas.js';
export type {
	ManagementKeyOption,
	ManagementSigningMethod,
	Ed25519ManagementSigning,
	EIP191ManagementSigning,
} from '../schemas/extended.js';
export {DEFAULT_MANAGEMENT_SIGNING} from '../schemas/extended.js';

export type ManagementKeysResult = {
	readonly managementKeys: ManagementKeyEntry[];
	readonly signingOptions: ManagementKeyOption[];
};

type AllowedKeyApiEntry = {
	publicKey?: string;
	label?: string;
	deleted?: boolean;
	removedPublicKey?: string;
};

type PreferredSignerData = {
	publicKeyHex?: string;
};

type LocalManagementKeyEntry = {
	fileName: string;
	publicKeyRaw: string;
	publicKeyHex?: string;
};

type ToMcpApiError = (message: string, data?: unknown) => Error;

export type BuiltManagementPostRequest = {
	readonly path: string;
	readonly unsignedBody: Record<string, unknown>;
	readonly canonicalJson: string;
	readonly selectedSigningKey?: ManagementKeyOption;
};

export type BuildManagementPostContext = {
	readonly nodeKey: string;
	readonly selectedSigningKey?: ManagementKeyOption;
};

export type ManagementSigningContext = {
	nonce: number;
	nodeKey: string;
	publicKey?: string;
};

export type ManagementSignEd25519Options = {
	publicKey?: string;
	nonce?: number;
	keyPath?: string;
};

export type ManagementSignResult = {
	body: SignedManagementBody;
	canonicalJson: string;
};

function sdkError(reason: string, data?: unknown): Error {
	const error = new Error(reason);
	if (data !== undefined) {
		(error as Error & {data?: unknown}).data = data;
	}
	return error;
}

async function runSigned<T>(fn: () => Promise<T>): Promise<SdkResult<T>> {
	try {
		return {ok: true, data: await fn()};
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

export function normalizeEd25519PublicKeyToHex(
	value: string,
	toMcpApiError: ToMcpApiError = sdkError,
): string {
	const trimmed = value.trim();
	const normalizedHex = trimmed.toLowerCase().replace(/^0x/, '');
	if (/^[a-f0-9]{64}$/.test(normalizedHex)) {
		return normalizedHex;
	}
	throw toMcpApiError(
		'Unsupported public key format; expected 64-character hex Ed25519 key',
	);
}

export function buildManagementSigningMessage(
	bodyWithEmptySig: Record<string, unknown>,
): string {
	return JSON.stringify(bodyWithEmptySig);
}

export async function listLocalManagementPublicKeys(
	keyRoot: string,
	toMcpApiError: ToMcpApiError = sdkError,
): Promise<LocalManagementKeyEntry[]> {
	const keyDir = addedKeysDir(keyRoot);
	let entries: string[] = [];
	try {
		entries = await fs.readdir(keyDir);
	} catch {
		entries = [];
	}

	const pubFiles = entries.filter(entry => entry.endsWith('.pub'));
	const results: LocalManagementKeyEntry[] = [];
	for (const pubFile of pubFiles) {
		const fileName = pubFile.slice(0, -4);
		const pubPath = path.join(keyDir, pubFile);
		try {
			const raw = (await fs.readFile(pubPath, 'utf8')).trim();
			let publicKeyHex: string | undefined;
			try {
				publicKeyHex = normalizeEd25519PublicKeyToHex(raw, toMcpApiError);
			} catch {
				publicKeyHex = undefined;
			}
			results.push({fileName, publicKeyRaw: raw, publicKeyHex});
		} catch {
			// ignore unreadable keys
		}
	}

	const bootstrap = discoverBootstrapKey(keyRoot);
	if (bootstrap) {
		const publicKeyHex = readPublicKeyHexFromPrivateKeyPath(bootstrap.path);
		results.push({
			fileName: path.basename(bootstrap.path),
			publicKeyRaw: publicKeyHex ?? '',
			publicKeyHex,
		});
	}

	return results;
}

async function resolvePrivateKeyPathForPublicKey(
	publicKey: string,
	keyRoot: string,
	config?: NodeSdkConfig,
	toMcpApiError?: ToMcpApiError,
): Promise<string> {
	const normalized = publicKey.replace(/^0x/i, '').toLowerCase();
	const managementDir = addedKeysDir(keyRoot);

	if (toMcpApiError) {
		const localKeys = await listLocalManagementPublicKeys(keyRoot, toMcpApiError);
		for (const entry of localKeys) {
			if (entry.publicKeyHex?.toLowerCase() === normalized) {
				return path.join(managementDir, entry.fileName);
			}
		}
	}

	if (config) {
		const keys = discoverKeys(config.node.mpcConfigPath);
		for (const key of keys) {
			const pub = readPublicKeyHexFromPrivateKeyPath(key.path)?.toLowerCase();
			if (pub === normalized) {
				return key.path;
			}
		}

		const defaultPath = resolveKeyPath(
			config.signer.defaultKey,
			config.signer.defaultKeyPath,
			config.node.mpcConfigPath,
		);
		if (defaultPath) {
			const defaultPub = readPublicKeyHexFromPrivateKeyPath(
				defaultPath,
			)?.toLowerCase();
			if (defaultPub === normalized) {
				return defaultPath;
			}
		}
	}

	throw new Error(
		`No local private key found for management public key ${publicKey}`,
	);
}

export async function ensureLocalKeyPairForPublicKey(
	publicKey: string,
	deps: {keyRoot: string; toMcpApiError: ToMcpApiError},
): Promise<{fileName: string; publicKeyPath: string; privateKeyPath: string}> {
	const {keyRoot, toMcpApiError} = deps;
	const keyDir = addedKeysDir(keyRoot);
	const normalizedTarget = normalizeEd25519PublicKeyToHex(
		publicKey,
		toMcpApiError,
	);
	const localKeys = await listLocalManagementPublicKeys(keyRoot, toMcpApiError);
	const match = localKeys.find(k => k.publicKeyHex === normalizedTarget);
	if (!match) {
		throw toMcpApiError(
			'Preferred signer key does not exist locally in added_keys',
			{preferredKey: normalizedTarget, keyDirectory: keyDir},
		);
	}
	const privateKeyPath = path.join(keyDir, match.fileName);
	try {
		await fs.access(privateKeyPath);
	} catch {
		throw toMcpApiError(
			'Preferred signer key does not have a corresponding private key',
			{preferredKey: normalizedTarget, expectedPrivateKeyPath: privateKeyPath},
		);
	}
	return {
		fileName: match.fileName,
		publicKeyPath: path.join(keyDir, `${match.fileName}.pub`),
		privateKeyPath,
	};
}

export async function resolvePreferredManagementKeyOption(
	config: NodeSdkConfig,
	keyOptions: ManagementKeyOption[],
	deps: {
		keyRoot: string;
		toMcpApiError: ToMcpApiError;
	},
): Promise<ManagementKeyOption> {
	const {keyRoot, toMcpApiError} = deps;
	const preferredResult = await getPreferredManagementSigner(config);
	const preferred = preferredResult.ok
		? preferredResult.data.publicKey
		: undefined;
	const failures: Array<{key: string; reason: string}> = [];

	if (preferred) {
		try {
			const normalizedPreferred = normalizeEd25519PublicKeyToHex(
				preferred,
				toMcpApiError,
			);
			const selected = keyOptions.find(
				opt =>
					normalizeEd25519PublicKeyToHex(opt.value, toMcpApiError) ===
					normalizedPreferred,
			);
			if (!selected) {
				throw toMcpApiError(
					'Preferred signer is not in allowed management keys',
					{
						preferredSigner: normalizedPreferred,
						allowedKeys: keyOptions.map(k => k.value),
					},
				);
			}
			await ensureLocalKeyPairForPublicKey(normalizedPreferred, {
				keyRoot,
				toMcpApiError,
			});
			return selected;
		} catch (error) {
			failures.push({
				key: preferred,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	for (const opt of keyOptions) {
		try {
			await ensureLocalKeyPairForPublicKey(opt.value, {
				keyRoot,
				toMcpApiError,
			});
			return opt;
		} catch (error) {
			failures.push({
				key: opt.value,
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}

	throw toMcpApiError(
		'No preferred signer is set, and no allowed management key has a usable local private key',
		{failures},
	);
}

export async function getPrivateKeyStatus(
	option: ManagementKeyOption,
	deps: {keyRoot: string; toMcpApiError: ToMcpApiError},
): Promise<{available: boolean; reason?: string}> {
	try {
		await ensureLocalKeyPairForPublicKey(option.value, deps);
		return {available: true};
	} catch (error) {
		return {
			available: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function assertAgentCanSignManagementRequests(
	config: NodeSdkConfig,
	deps: {
		keyRoot: string;
		toMcpApiError: ToMcpApiError;
	},
): Promise<void> {
	const {keyRoot, toMcpApiError} = deps;
	const signers = await getManagementSigners(config);
	if (!signers.ok) {
		throw toMcpApiError(signers.reason);
	}
	const configuredKeys = signers.data.managementKeys.filter(key => key.isValid);
	if (configuredKeys.length === 0) {
		throw toMcpApiError(
			'No EdDSA management keys are configured. Configure a bootstrap Ed25519 key before agent-signed management requests.',
		);
	}

	if (configuredKeys.length === 1) {
		const bootstrap = configuredKeys[0]!;
		await ensureLocalKeyPairForPublicKey(bootstrap.publicKey, {
			keyRoot,
			toMcpApiError,
		});
	}
}

export async function signManagementMessage(
	option: ManagementKeyOption,
	message: string,
	deps: {
		keyRoot: string;
		toMcpApiError: ToMcpApiError;
		assertAgentCanSignManagementRequests: () => Promise<void>;
		config?: NodeSdkConfig;
	},
): Promise<string> {
	await deps.assertAgentCanSignManagementRequests();
	const keyPath = await resolvePrivateKeyPathForPublicKey(
		option.value,
		deps.keyRoot,
		deps.config,
		deps.toMcpApiError,
	);
	return signUtf8Message(keyPath, message);
}

export async function getManagementSigners(
	config: NodeSdkConfig,
): Promise<SdkResult<ManagementKeysResult>> {
	const result = await managementGet<AllowedKeyApiEntry[]>(
		config,
		'/getAllowedEd25519MgtKeys',
	);
	if (!result.ok) {
		return result;
	}

	const managementKeysList = result.data.map(entry => ({
		publicKey: entry.publicKey ?? entry.removedPublicKey ?? '',
		label: entry.label ?? 'Unknown key',
		isValid: entry.deleted !== true && Boolean(entry.publicKey),
	}));

	const signingOptions: ManagementKeyOption[] = [];
	for (const item of result.data) {
		if (item.deleted === true || !item.publicKey) {
			continue;
		}
		const nonceResult = await fetchEd25519ManagementNonce(config, item.publicKey);
		if (!nonceResult.ok) {
			return nonceResult;
		}
		signingOptions.push({
			id: `eddsa:${item.publicKey}`,
			kind: 'EdDSA',
			value: item.publicKey,
			nonce: nonceResult.data.nonce,
			label: item.label,
		});
	}

	return {
		ok: true,
		data: {managementKeys: managementKeysList, signingOptions},
	};
}

export async function resolveManagementSigningKeyOption(
	config: NodeSdkConfig,
	keyOptions: ManagementKeyOption[],
): Promise<SdkResult<ManagementKeyOption>> {
	return runSigned(async () =>
		resolvePreferredManagementKeyOption(config, keyOptions, {
			keyRoot: config.node.mpcConfigPath,
			toMcpApiError: sdkError,
		}),
	);
}

export async function getManagementSigningContext(
	config: NodeSdkConfig,
	signing: ManagementSigningMethod,
): Promise<SdkResult<ManagementSigningContext>> {
	const nodeIdResult = await nodeId(config);
	if (!nodeIdResult.ok) {
		return nodeIdResult;
	}

	if (signing.kind === 'eip191') {
		const nonceResult = await fetchEIP191ManagementNonce(config);
		if (!nonceResult.ok) {
			return nonceResult;
		}
		return {
			ok: true,
			data: {
				nonce: nonceResult.data.nonce,
				nodeKey: nodeIdResult.data.nodeId,
			},
		};
	}

	const signer = await getPreferredManagementSigner(config);
	if (!signer.ok) {
		return signer;
	}
	const nonceResult = await fetchEd25519ManagementNonce(
		config,
		signer.data.publicKey,
	);
	if (!nonceResult.ok) {
		return nonceResult;
	}
	return {
		ok: true,
		data: {
			nonce: nonceResult.data.nonce,
			nodeKey: nodeIdResult.data.nodeId,
			publicKey: signer.data.publicKey,
		},
	};
}

function validateManagementUnsignedBody(
	unsignedBody: Record<string, unknown>,
): SdkResult<{nonce: number; nodeKey: string}> {
	const nonce = unsignedBody.nonce;
	const nodeKey = unsignedBody.nodeKey;
	const clientSig = unsignedBody.clientSig;
	if (typeof nonce !== 'number' || Number.isNaN(nonce)) {
		return {ok: false, reason: 'Unsigned body missing valid nonce.'};
	}
	if (typeof nodeKey !== 'string' || nodeKey.trim().length === 0) {
		return {ok: false, reason: 'Unsigned body missing nodeKey.'};
	}
	if (
		clientSig !== undefined &&
		clientSig !== null &&
		String(clientSig).trim().length > 0
	) {
		return {ok: false, reason: 'Unsigned body must have an empty clientSig.'};
	}
	return {ok: true, data: {nonce, nodeKey: nodeKey.trim()}};
}

export function buildManagementPostBody(
	signed: SignedManagementBody,
	signing: ManagementSigningMethod,
	canonicalJson: string,
): Record<string, unknown> {
	if (signing.kind === 'eip191') {
		return {...signed, signedMessage: canonicalJson};
	}
	return {...signed};
}

export async function buildManagementPostRequest(
	config: NodeSdkConfig,
	args: {
		path: string;
		buildRequestFields: (
			ctx: BuildManagementPostContext,
		) => Record<string, unknown> | Promise<Record<string, unknown>>;
	},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	return runSigned(async () => {
		const nodeKeyResult = await nodeId(config);
		if (!nodeKeyResult.ok) {
			throw sdkError(nodeKeyResult.reason);
		}

		let selectedSigningKey: ManagementKeyOption | undefined;
		let keyInfo: ManagementSigningContext;

		if (signing.kind === 'ed25519') {
			const signersResult = await getManagementSigners(config);
			if (!signersResult.ok) {
				throw sdkError(signersResult.reason);
			}
			const selectedResult = await resolveManagementSigningKeyOption(
				config,
				signersResult.data.signingOptions,
			);
			if (!selectedResult.ok) {
				throw sdkError(selectedResult.reason);
			}
			selectedSigningKey = selectedResult.data;
			keyInfo = {
				publicKey: selectedSigningKey.value,
				nonce: selectedSigningKey.nonce,
				nodeKey: nodeKeyResult.data.nodeId,
			};
			await assertAgentCanSignManagementRequests(config, {
				keyRoot: config.node.mpcConfigPath,
				toMcpApiError: sdkError,
			});
		} else {
			const ctx = await getManagementSigningContext(config, signing);
			if (!ctx.ok) {
				throw sdkError(ctx.reason);
			}
			keyInfo = ctx.data;
		}

		const requestFields = await args.buildRequestFields({
			nodeKey: nodeKeyResult.data.nodeId,
			selectedSigningKey,
		});
		const unsignedBody = buildManagementUnsignedBody(keyInfo, requestFields);
		const validated = validateManagementUnsignedBody(unsignedBody);
		if (!validated.ok) {
			throw sdkError(validated.reason);
		}
		const canonicalJson = buildManagementCanonicalJson(unsignedBody);

		return {
			path: args.path,
			unsignedBody,
			canonicalJson,
			selectedSigningKey,
		};
	});
}

export async function managementSignEd25519(
	config: NodeSdkConfig,
	unsignedBody: Record<string, unknown>,
	options: ManagementSignEd25519Options = {},
): Promise<SdkResult<ManagementSignResult>> {
	const validated = validateManagementUnsignedBody(unsignedBody);
	if (!validated.ok) {
		return validated;
	}

	let publicKey = options.publicKey;
	if (!publicKey) {
		const clientPk = unsignedBody.clientPk;
		if (typeof clientPk === 'string' && clientPk.trim().length > 0) {
			publicKey = clientPk.trim();
		}
	}
	if (!publicKey) {
		const signer = await getPreferredManagementSigner(config);
		if (!signer.ok) {
			return signer;
		}
		publicKey = signer.data.publicKey;
	}

	const resolvedKeyPath =
		options.keyPath ??
		resolveKeyPathForPublicKey(config, publicKey) ??
		(await resolvePrivateKeyPathForPublicKey(
			publicKey,
			config.node.mpcConfigPath,
			config,
			sdkError,
		).catch(() => undefined));
	if (!resolvedKeyPath) {
		return {
			ok: false,
			reason: `No local private key found for signer ${publicKey}`,
		};
	}

	const canonicalJson = buildManagementCanonicalJson(unsignedBody);
	const signature = signUtf8Message(resolvedKeyPath, canonicalJson);
	const body: SignedManagementBody = {
		...unsignedBody,
		nonce: validated.data.nonce,
		nodeKey: validated.data.nodeKey,
		clientSig: signature,
	};

	return {ok: true, data: {body, canonicalJson}};
}

export async function managementSignEIP191(
	config: NodeSdkConfig,
	signing: EIP191ManagementSigning,
	unsignedBody: Record<string, unknown>,
): Promise<SdkResult<ManagementSignResult>> {
	const validated = validateManagementUnsignedBody(unsignedBody);
	if (!validated.ok) {
		return validated;
	}

	const canonicalJson = buildManagementCanonicalJson(unsignedBody);
	const signature = await signing.signMessage(canonicalJson);
	const body: SignedManagementBody = {
		...unsignedBody,
		nonce: validated.data.nonce,
		nodeKey: validated.data.nodeKey,
		clientSig: signature.trim().replace(/^0x/i, ''),
	};

	return {ok: true, data: {body, canonicalJson}};
}

export async function managementSign(
	config: NodeSdkConfig,
	signing: ManagementSigningMethod,
	unsignedBody: Record<string, unknown>,
	options: ManagementSignEd25519Options = {},
): Promise<SdkResult<Record<string, unknown>>> {
	if (signing.kind === 'eip191') {
		const signed = await managementSignEIP191(config, signing, unsignedBody);
		if (!signed.ok) {
			return signed;
		}
		return {
			ok: true,
			data: buildManagementPostBody(
				signed.data.body,
				signing,
				signed.data.canonicalJson,
			),
		};
	}

	const signed = await managementSignEd25519(config, unsignedBody, options);
	if (!signed.ok) {
		return signed;
	}
	return {
		ok: true,
		data: buildManagementPostBody(
			signed.data.body,
			signing,
			signed.data.canonicalJson,
		),
	};
}

export function toSelectedSigningKey(
	option: ManagementKeyOption,
): SelectedSigningKey {
	return {
		id: option.id,
		kind: option.kind,
		value: option.value,
		nonce: option.nonce,
		label: option.label,
	};
}

export async function getPreferredManagementSigner(
	config: NodeSdkConfig,
): Promise<SdkResult<{publicKey: string}>> {
	const preferred = await managementGet<PreferredSignerData>(
		config,
		'/getPreferredSigner',
	);
	if (!preferred.ok) {
		return preferred;
	}

	let publicKey = preferred.data.publicKeyHex?.replace(/^0x/i, '') ?? '';
	if (!EdDSAPubKeySchema.safeParse(publicKey).success) {
		publicKey = resolveSignerPublicKey(config) ?? '';
	}

	if (!EdDSAPubKeySchema.safeParse(publicKey).success) {
		return {ok: false, reason: 'No valid management signing key available.'};
	}

	return {ok: true, data: {publicKey}};
}

export async function getManagementSigner(
	config: NodeSdkConfig,
): Promise<SdkResult<ManagementKeyResult>> {
	const signer = await getPreferredManagementSigner(config);
	if (!signer.ok) {
		return signer;
	}

	const nonceResult = await fetchEd25519ManagementNonce(
		config,
		signer.data.publicKey,
	);
	if (!nonceResult.ok) {
		return nonceResult;
	}

	const nodeIdResult = await nodeId(config);
	if (!nodeIdResult.ok) {
		return nodeIdResult;
	}

	return {
		ok: true,
		data: {
			publicKey: signer.data.publicKey,
			nonce: nonceResult.data.nonce,
			nodeKey: nodeIdResult.data.nodeId,
		},
	};
}

export async function buildSetPreferredManagementSigner(
	config: NodeSdkConfig,
	publicKey: string,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	const parsedKey = EdDSAPubKeySchema.safeParse(publicKey.replace(/^0x/i, ''));
	if (!parsedKey.success) {
		return {ok: false, reason: 'Invalid management public key.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/setPreferredSigner',
			buildRequestFields: () => ({publicKey: parsedKey.data}),
		},
		signing,
	);
}

export async function setPreferredManagementSigner(
	config: NodeSdkConfig,
	publicKey: string,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkEmptyResult> {
	const built = await buildSetPreferredManagementSigner(config, publicKey, signing);
	if (!built.ok) {
		return built;
	}

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}

	const response = await managementPost<unknown>(
		config,
		built.data.path,
		signed.data,
	);
	if (!response.ok) {
		return response;
	}

	return {ok: true};
}

export async function hasEd25519ManagementSigner(
	config: NodeSdkConfig,
): Promise<SdkResult<{hasEdDSAKey: boolean}>> {
	const result = await managementGet<boolean>(config, '/hasPublicMgtKey');
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: {hasEdDSAKey: Boolean(result.data)}};
}

/** @deprecated Use hasEd25519ManagementSigner */
export const hasManagementSigner = hasEd25519ManagementSigner;

export async function listManagementSignersDetailed(
	config: NodeSdkConfig,
): Promise<
	SdkResult<{
		preferredSigner?: string;
		keys: Array<{
			localFileName?: string;
			kind: 'EdDSA';
			value: string;
			nonce: number;
			label?: string;
			localPrivateKeyAvailable: boolean;
			localPrivateKeyError?: string;
		}>;
	}>
> {
	const [signers, preferred] = await Promise.all([
		getManagementSigners(config),
		getPreferredManagementSigner(config),
	]);
	if (!signers.ok) {
		return signers;
	}
	const preferredSigner = preferred.ok ? preferred.data.publicKey : undefined;
	const keyRoot = config.node.mpcConfigPath;
	const localKeys = await listLocalManagementPublicKeys(keyRoot);
	const localFileByPub = new Map(
		localKeys
			.filter(k => k.publicKeyHex)
			.map(k => [k.publicKeyHex as string, k.fileName] as const),
	);
	const keys = await Promise.all(
		signers.data.signingOptions.map(async key => {
			const privateKeyStatus = await getPrivateKeyStatus(key, {
				keyRoot,
				toMcpApiError: sdkError,
			});
			const normalizedPublic = normalizeEd25519PublicKeyToHex(key.value);
			return {
				...key,
				localFileName: localFileByPub.get(normalizedPublic),
				localPrivateKeyAvailable: privateKeyStatus.available,
				localPrivateKeyError: privateKeyStatus.reason,
			};
		}),
	);
	return {ok: true, data: {preferredSigner, keys}};
}

export async function createManagementSignerKeypair(
	config: NodeSdkConfig,
): Promise<
	SdkResult<{
		success: boolean;
		fileName: string;
		publicKey: string;
		privateKeyPath: string;
		publicKeyPath: string;
	}>
> {
	const signers = await getManagementSigners(config);
	const currentKeyCount = signers.ok ? signers.data.managementKeys.length : 0;
	const fileName = `added_key_${currentKeyCount}`;
	const keyDir = addedKeysDir(config.node.mpcConfigPath);
	await fs.mkdir(keyDir, {recursive: true});

	const privateKeyPath = path.join(keyDir, fileName);
	const publicKeyPath = `${privateKeyPath}.pub`;

	try {
		await fs.access(privateKeyPath);
		return {ok: false, reason: 'Private key file already exists.'};
	} catch {
		// expected
	}

	const {privateKey, publicKey} = generateKeyPairSync('ed25519');
	const privatePem = privateKey.export({format: 'pem', type: 'pkcs8'}).toString();
	const publicJwk = publicKey.export({format: 'jwk'}) as {x?: string};
	if (!publicJwk.x) {
		return {
			ok: false,
			reason: 'Failed to derive Ed25519 raw public key from generated keypair.',
		};
	}
	const newPublicKey = Buffer.from(publicJwk.x, 'base64url').toString('hex');
	const parsed = EdDSAPubKeySchema.safeParse(newPublicKey);
	if (!parsed.success) {
		return {ok: false, reason: 'Generated public key failed validation.'};
	}

	await fs.writeFile(privateKeyPath, privatePem, {mode: 0o600});
	await fs.writeFile(publicKeyPath, `${parsed.data}\n`, {mode: 0o644});

	return {
		ok: true,
		data: {
			success: true,
			fileName,
			publicKey: parsed.data,
			privateKeyPath,
			publicKeyPath,
		},
	};
}

export async function buildAddManagementSigner(
	config: NodeSdkConfig,
	input: {newPublicKey: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<BuiltManagementPostRequest>> {
	let normalizedNewPublicKey: string;
	try {
		normalizedNewPublicKey = normalizeEd25519PublicKeyToHex(input.newPublicKey);
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
	const parsedKey = EdDSAPubKeySchema.safeParse(normalizedNewPublicKey);
	if (!parsedKey.success) {
		return {ok: false, reason: 'Invalid new public key.'};
	}

	return buildManagementPostRequest(
		config,
		{
			path: '/addManagementKey',
			buildRequestFields: ({selectedSigningKey}) => {
				if (!selectedSigningKey) {
					throw sdkError('Ed25519 signing key required to add a management signer.');
				}
				if (
					normalizeEd25519PublicKeyToHex(selectedSigningKey.value) ===
					parsedKey.data
				) {
					throw sdkError(
						'Signer key cannot be the newly created key being added.',
					);
				}
				return {newPublicKey: parsedKey.data};
			},
		},
		signing,
	);
}

export async function addManagementSigner(
	config: NodeSdkConfig,
	input: {newPublicKey: string},
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<
	SdkResult<{
		success: boolean;
		publicKey: string;
		nodeKey: string;
	}>
> {
	let normalizedNewPublicKey: string;
	try {
		normalizedNewPublicKey = normalizeEd25519PublicKeyToHex(input.newPublicKey);
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
	const parsedKey = EdDSAPubKeySchema.safeParse(normalizedNewPublicKey);
	if (!parsedKey.success) {
		return {ok: false, reason: 'Invalid new public key.'};
	}

	const built = await buildAddManagementSigner(config, input, signing);
	if (!built.ok) {
		return built;
	}

	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<null>(config, built.data.path, signed.data);
	if (!posted.ok) {
		return posted;
	}

	return {
		ok: true,
		data: {
			success: true,
			publicKey: parsedKey.data,
			nodeKey: String(built.data.unsignedBody.nodeKey),
		},
	};
}

export {MANAGEMENT_KEYS_DIR, addedKeysDir};
