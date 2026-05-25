import {promises as fs} from 'node:fs';
import path from 'node:path';
import {generateKeyPairSync} from 'node:crypto';
import type {NodeSdkConfig} from '../config/schema.js';
import {buildDetOpsCanonicalJson} from '../api/canonical-json.js';
import {
	fetchPublicMgtKeyNonce,
	managementGet,
	managementPost,
} from '../api/management-api.js';
import {
	resolveKeyPathForPublicKey,
	resolveSignerPublicKey,
	signUtf8Message,
	readPublicKeyHex,
} from '../api/management-key.js';
import {discoverKeys, resolveKeyPath} from '../config/keys.js';
import {MPA_HOME_DIR, MANAGEMENT_KEYS_DIR} from '../config/paths.js';
import {nodeId} from './general.js';
import type {SdkEmptyResult, SdkResult} from './result.js';
import {
	AllowedKeyApiEntrySchema,
	ManagementKeyEntrySchema,
	ManagementKeysResponseSchema,
	NonceDataSchema,
	PreferredSignerResponseSchema,
	type ManagementKeyEntry,
	type ManagementKeyResult,
	type SignedManagementBody,
} from './schemas.js';
import {EdDSAPubKeySchema, NodeIdSchema, NonceSchema} from '../schemas/extended.js';
import type {ManagementKeyOption, SelectedSigningKey} from '../schemas/extended.js';

export type {ManagementKeyEntry} from './schemas.js';
export type {ManagementKeyOption} from '../schemas/extended.js';

type LocalManagementKeyEntry = {
	fileName: string;
	publicKeyRaw: string;
	publicKeyHex?: string;
};

type ToMcpApiError = (message: string, data?: unknown) => Error;
type MgtGet = <T>(
	route: string,
	params?: Record<string, string>,
) => Promise<T>;

export type SignedManagementRequest = {
	selectedSigningKey: ManagementKeyOption;
	unsignedBody: Record<string, unknown>;
	signingMessage: string;
	signature: string;
	body: Record<string, unknown>;
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

function mgtGetAdapter(config: NodeSdkConfig) {
	return async <T>(
		cfg: NodeSdkConfig,
		route: string,
		params?: Record<string, string | number | boolean | null | undefined>,
	): Promise<SdkResult<T>> => {
		const search = new URLSearchParams();
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value !== null && value !== undefined) {
					search.set(key, String(value));
				}
			}
		}
		const query = search.toString();
		const fullPath = query.length > 0 ? `${route}?${query}` : route;
		return managementGet<T>(cfg, fullPath);
	};
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

export async function getPreferredSignerPublicKeyHex(deps: {
	mgtGET: MgtGet;
	toMcpApiError: ToMcpApiError;
}): Promise<string | undefined> {
	const {mgtGET, toMcpApiError} = deps;
	try {
		const raw = await mgtGET<unknown>('/getPreferredSigner');
		if (typeof raw === 'string') {
			const s = raw.trim();
			return s ? normalizeEd25519PublicKeyToHex(s, toMcpApiError) : undefined;
		}
		if (raw && typeof raw === 'object') {
			const obj = raw as Record<string, unknown>;
			const candidate = [obj.publicKeyHex, obj.publicKey, obj.key].find(
				v => typeof v === 'string',
			) as string | undefined;
			if (!candidate || candidate.trim().length === 0) {
				return undefined;
			}
			return normalizeEd25519PublicKeyToHex(candidate, toMcpApiError);
		}
		return undefined;
	} catch {
		return undefined;
	}
}

export async function listLocalManagementPublicKeys(
	keyRoot: string,
	toMcpApiError: ToMcpApiError = sdkError,
): Promise<LocalManagementKeyEntry[]> {
	const keyDir = path.join(keyRoot, 'management_keys');
	let entries: string[] = [];
	try {
		entries = await fs.readdir(keyDir);
	} catch {
		return [];
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
	return results;
}

async function resolvePrivateKeyPathForPublicKey(
	publicKey: string,
	keyRoot: string,
	config?: NodeSdkConfig,
	toMcpApiError?: ToMcpApiError,
): Promise<string> {
	const normalized = publicKey.replace(/^0x/i, '').toLowerCase();
	const managementDir = path.join(keyRoot, 'management_keys');

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
			const pub = readPublicKeyHex(key.path)?.toLowerCase();
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
			const defaultPub = readPublicKeyHex(defaultPath)?.toLowerCase();
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
	const keyDir = path.join(keyRoot, 'management_keys');
	const normalizedTarget = normalizeEd25519PublicKeyToHex(
		publicKey,
		toMcpApiError,
	);
	const localKeys = await listLocalManagementPublicKeys(keyRoot, toMcpApiError);
	const match = localKeys.find(k => k.publicKeyHex === normalizedTarget);
	if (!match) {
		throw toMcpApiError(
			'Preferred signer key does not exist locally in management_keys',
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
	keyOptions: ManagementKeyOption[],
	deps: {
		keyRoot: string;
		toMcpApiError: ToMcpApiError;
		mgtGET: MgtGet;
	},
): Promise<ManagementKeyOption> {
	const {keyRoot, toMcpApiError, mgtGET} = deps;
	const preferred = await getPreferredSignerPublicKeyHex({mgtGET, toMcpApiError});
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

export async function assertAgentCanSignManagementRequests(deps: {
	keyRoot: string;
	mgtGET: MgtGet;
	toMcpApiError: ToMcpApiError;
}): Promise<void> {
	const {keyRoot, mgtGET, toMcpApiError} = deps;
	const configuredKeys = await mgtGET<Array<{publicKey: string; label: string}>>(
		'/getAllowedEd25519MgtKeys',
	);
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

export async function fetchManagementKeyOptions(
	config: NodeSdkConfig,
): Promise<SdkResult<ManagementKeyOption[]>> {
	const keys = await managementGet<Array<{publicKey: string; label: string}>>(
		config,
		'/getAllowedEd25519MgtKeys',
	);
	if (!keys.ok) {
		return keys;
	}

	const options: ManagementKeyOption[] = [];
	for (const item of keys.data) {
		const nonceResult = await fetchPublicMgtKeyNonce(config, item.publicKey);
		if (!nonceResult.ok) {
			return nonceResult;
		}
		options.push({
			id: `eddsa:${item.publicKey}`,
			kind: 'EdDSA',
			value: item.publicKey,
			nonce: nonceResult.data.nonce,
			label: item.label,
		});
	}

	return {ok: true, data: options};
}

export async function resolveManagementSigningKeyOption(
	config: NodeSdkConfig,
	keyOptions: ManagementKeyOption[],
): Promise<SdkResult<ManagementKeyOption>> {
	return runSigned(async () => {
		const mgtGET = async <T>(route: string, params?: Record<string, string>) => {
			const result = await mgtGetAdapter(config)(config, route, params);
			if (!result.ok) {
				throw sdkError(result.reason);
			}
			return result.data as T;
		};
		return resolvePreferredManagementKeyOption(keyOptions, {
			keyRoot: MPA_HOME_DIR,
			toMcpApiError: sdkError,
			mgtGET,
		});
	});
}

export async function getPreferredManagementKeyHex(
	config: NodeSdkConfig,
): Promise<SdkResult<{publicKeyHex?: string}>> {
	return runSigned(async () => {
		const mgtGET = async <T>(route: string) => {
			const result = await managementGet<T>(config, route);
			if (!result.ok) {
				throw sdkError(result.reason);
			}
			return result.data;
		};
		const publicKeyHex = await getPreferredSignerPublicKeyHex({
			mgtGET,
			toMcpApiError: sdkError,
		});
		return {publicKeyHex};
	});
}

export async function prepareSignedManagementRequest(
	config: NodeSdkConfig,
	buildUnsignedBody: (ctx: {
		selectedSigningKey: ManagementKeyOption;
	}) => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<SdkResult<SignedManagementRequest>> {
	return runSigned(async () => {
		const keyOptionsResult = await fetchManagementKeyOptions(config);
		if (!keyOptionsResult.ok) {
			throw sdkError(keyOptionsResult.reason);
		}
		const selectedResult = await resolveManagementSigningKeyOption(
			config,
			keyOptionsResult.data,
		);
		if (!selectedResult.ok) {
			throw sdkError(selectedResult.reason);
		}
		const selectedSigningKey = selectedResult.data;
		const unsignedBody = await buildUnsignedBody({selectedSigningKey});
		const signingMessage = buildManagementSigningMessage(unsignedBody);
		const mgtGET = async <T>(route: string) => {
			const result = await managementGet<T>(config, route);
			if (!result.ok) {
				throw sdkError(result.reason);
			}
			return result.data;
		};
		const signature = await signManagementMessage(
			selectedSigningKey,
			signingMessage,
			{
				keyRoot: MPA_HOME_DIR,
				toMcpApiError: sdkError,
				config,
				assertAgentCanSignManagementRequests: async () => {
					await assertAgentCanSignManagementRequests({
						keyRoot: MPA_HOME_DIR,
						mgtGET,
						toMcpApiError: sdkError,
					});
				},
			},
		);
		return {
			selectedSigningKey,
			unsignedBody,
			signingMessage,
			signature,
			body: {...unsignedBody, Sig: signature},
		};
	});
}

export function buildClientSigManagementPostBody(
	unsignedBody: Record<string, unknown>,
	signedMessage: string,
	clientSig: string,
): Record<string, unknown> {
	const {Sig: _sig, ...fields} = unsignedBody;
	void _sig;
	return {...fields, signedMessage, clientSig};
}

function buildTokenRegistrySigningMessage(
	payload: Record<string, unknown>,
): string {
	return JSON.stringify(payload);
}

export async function prepareActionSignedManagementRequest(
	config: NodeSdkConfig,
	buildSigningPayload: (ctx: {
		selectedSigningKey: ManagementKeyOption;
	}) => Record<string, unknown> | Promise<Record<string, unknown>>,
): Promise<
	SdkResult<{
		selectedSigningKey: ManagementKeyOption;
		signingMessage: string;
		signature: string;
	}>
> {
	return runSigned(async () => {
		const keyOptionsResult = await fetchManagementKeyOptions(config);
		if (!keyOptionsResult.ok) {
			throw sdkError(keyOptionsResult.reason);
		}
		const selectedResult = await resolveManagementSigningKeyOption(
			config,
			keyOptionsResult.data,
		);
		if (!selectedResult.ok) {
			throw sdkError(selectedResult.reason);
		}
		const selectedSigningKey = selectedResult.data;
		const signingPayload = await buildSigningPayload({selectedSigningKey});
		const signingMessage = buildTokenRegistrySigningMessage(signingPayload);
		const mgtGET = async <T>(route: string) => {
			const result = await managementGet<T>(config, route);
			if (!result.ok) {
				throw sdkError(result.reason);
			}
			return result.data;
		};
		const signature = await signManagementMessage(
			selectedSigningKey,
			signingMessage,
			{
				keyRoot: MPA_HOME_DIR,
				toMcpApiError: sdkError,
				config,
				assertAgentCanSignManagementRequests: async () => {
					await assertAgentCanSignManagementRequests({
						keyRoot: MPA_HOME_DIR,
						mgtGET,
						toMcpApiError: sdkError,
					});
				},
			},
		);
		return {selectedSigningKey, signingMessage, signature};
	});
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

export async function postSignedManagementRequest(
	config: NodeSdkConfig,
	route: string,
	body: Record<string, unknown>,
): Promise<SdkResult<unknown>> {
	return managementPost<unknown>(config, route, body);
}

export async function listManagementSigners(
	config: NodeSdkConfig,
): Promise<SdkResult<{managementKeys: ManagementKeyEntry[]}>> {
	const result = await managementGet<unknown>(
		config,
		'/getAllowedEd25519MgtKeys',
	);
	if (!result.ok) {
		return result;
	}

	if (!Array.isArray(result.data)) {
		return {ok: false, reason: 'Management keys response failed validation.'};
	}

	const managementKeysList = [];
	for (const entry of result.data) {
		const parsed = AllowedKeyApiEntrySchema.safeParse(entry);
		if (!parsed.success) {
			continue;
		}

		const mapped = {
			publicKey: parsed.data.publicKey ?? parsed.data.removedPublicKey ?? '',
			label: parsed.data.label ?? 'Unknown key',
			isValid: parsed.data.deleted !== true && Boolean(parsed.data.publicKey),
		};
		const validated = ManagementKeyEntrySchema.safeParse(mapped);
		if (validated.success) {
			managementKeysList.push(validated.data);
		}
	}

	const response = ManagementKeysResponseSchema.safeParse({
		managementKeys: managementKeysList,
	});
	if (!response.success) {
		return {ok: false, reason: 'Management keys response failed validation.'};
	}

	return {ok: true, data: response.data};
}

export async function getPreferredManagementSigner(
	config: NodeSdkConfig,
): Promise<SdkResult<ManagementKeyResult>> {
	const preferred = await managementGet<unknown>(
		config,
		'/getPreferredSigner',
	);
	if (!preferred.ok) {
		return preferred;
	}

	const preferredParsed = PreferredSignerResponseSchema.safeParse(
		preferred.data,
	);
	if (!preferredParsed.success) {
		return {ok: false, reason: 'Preferred signer response failed validation.'};
	}

	let publicKey =
		preferredParsed.data.publicKeyHex?.replace(/^0x/i, '') ?? '';
	if (!EdDSAPubKeySchema.safeParse(publicKey).success) {
		publicKey = resolveSignerPublicKey(config) ?? '';
	}

	if (!EdDSAPubKeySchema.safeParse(publicKey).success) {
		return {ok: false, reason: 'No valid management signing key available.'};
	}

	const nonceResult = await fetchPublicMgtKeyNonce(config, publicKey);
	if (!nonceResult.ok) {
		return nonceResult;
	}

	const nonceParsed = NonceDataSchema.safeParse(nonceResult.data);
	if (!nonceParsed.success) {
		return {ok: false, reason: 'Nonce response failed validation.'};
	}

	const nodeIdResult = await nodeId(config);
	if (!nodeIdResult.ok) {
		return nodeIdResult;
	}

	return {
		ok: true,
		data: {
			publicKey,
			nonce: nonceParsed.data.nonce,
			nodeKey: nodeIdResult.data.nodeId,
		},
	};
}

export async function managementSign(
	config: NodeSdkConfig,
	requestFields: Record<string, unknown>,
	keyPath?: string,
): Promise<SdkResult<SignedManagementBody>> {
	const keyInfo = await getPreferredManagementSigner(config);
	if (!keyInfo.ok) {
		return keyInfo;
	}

	const resolvedKeyPath =
		keyPath ?? resolveKeyPathForPublicKey(config, keyInfo.data.publicKey);
	if (!resolvedKeyPath) {
		return {
			ok: false,
			reason: `No local private key found for signer ${keyInfo.data.publicKey}`,
		};
	}

	const unsigned = {
		clientSig: '',
		nonce: keyInfo.data.nonce,
		nodeKey: keyInfo.data.nodeKey,
		...requestFields,
	};
	const canonicalJson = buildDetOpsCanonicalJson(unsigned);
	const signature = signUtf8Message(resolvedKeyPath, canonicalJson);

	return {
		ok: true,
		data: {
			...unsigned,
			clientSig: signature,
		},
	};
}

export async function setPreferredSigner(
	config: NodeSdkConfig,
	publicKey: string,
): Promise<SdkEmptyResult> {
	const parsedKey = EdDSAPubKeySchema.safeParse(publicKey);
	if (!parsedKey.success) {
		return {ok: false, reason: 'Invalid management public key.'};
	}

	const signed = await managementSign(config, {publicKey: parsedKey.data});
	if (!signed.ok) {
		return signed;
	}

	const canonicalJson = buildDetOpsCanonicalJson({
		clientSig: '',
		nonce: signed.data.nonce,
		nodeKey: signed.data.nodeKey,
		publicKey: parsedKey.data,
	});
	const body = {
		nonce: signed.data.nonce,
		publicKey: parsedKey.data,
		signedMessage: canonicalJson,
		clientSig: signed.data.clientSig,
	};
	const response = await managementPost<unknown>(
		config,
		'/setPreferredSigner',
		body,
	);
	if (!response.ok) {
		return response;
	}

	return {ok: true};
}

export async function hasManagementSigner(
	config: NodeSdkConfig,
): Promise<SdkResult<{hasEdDSAKey: boolean}>> {
	const result = await managementGet<boolean>(config, '/hasPublicMgtKey');
	if (!result.ok) {
		return result;
	}
	return {ok: true, data: {hasEdDSAKey: Boolean(result.data)}};
}

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
	const [keyOptions, preferred] = await Promise.all([
		fetchManagementKeyOptions(config),
		getPreferredManagementKeyHex(config),
	]);
	if (!keyOptions.ok) {
		return keyOptions;
	}
	const preferredSigner = preferred.ok ? preferred.data.publicKeyHex : undefined;
	const localKeys = await listLocalManagementPublicKeys(MPA_HOME_DIR);
	const localFileByPub = new Map(
		localKeys
			.filter(k => k.publicKeyHex)
			.map(k => [k.publicKeyHex as string, k.fileName] as const),
	);
	const keys = await Promise.all(
		keyOptions.data.map(async key => {
			const privateKeyStatus = await getPrivateKeyStatus(key, {
				keyRoot: MPA_HOME_DIR,
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
	const configured = await managementGet<Array<{publicKey: string; label: string}>>(
		config,
		'/getAllowedEd25519MgtKeys',
	);
	const currentKeyCount = configured.ok ? configured.data.length : 0;
	const fileName = `added_key_${currentKeyCount}`;
	const keyDir = path.join(MPA_HOME_DIR, 'management_keys');
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

export async function addManagementSigner(
	config: NodeSdkConfig,
	input: {newPublicKey: string},
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

	const signed = await prepareSignedManagementRequest(
		config,
		async ({selectedSigningKey}) => {
			if (
				normalizeEd25519PublicKeyToHex(selectedSigningKey.value) ===
				parsedKey.data
			) {
				throw sdkError(
					'Signer key cannot be the newly created key being added.',
				);
			}
			const nodeKeyResult = await managementGet<string>(config, '/getNodeKey');
			if (!nodeKeyResult.ok) {
				throw sdkError(nodeKeyResult.reason);
			}
			const nodeKeyParsed = NodeIdSchema.safeParse(nodeKeyResult.data);
			if (!nodeKeyParsed.success) {
				throw sdkError('Node ID response failed validation.');
			}
			return {
				newPublicKey: parsedKey.data,
				nodeKey: nodeKeyParsed.data,
				Nonce: selectedSigningKey.nonce,
				Sig: '',
			};
		},
	);
	if (!signed.ok) {
		return signed;
	}

	const posted = await managementPost<null>(
		config,
		'/addManagementKey',
		signed.data.body,
	);
	if (!posted.ok) {
		return posted;
	}

	return {
		ok: true,
		data: {
			success: true,
			publicKey: parsedKey.data,
			nodeKey: String(signed.data.unsignedBody.nodeKey),
		},
	};
}

export async function setPreferredManagementSigner(
	config: NodeSdkConfig,
	input: {publicKeyHex: string},
): Promise<
	SdkResult<{
		success: boolean;
		publicKeyHex: string;
		signerPublicKey: string;
		nodeKey: string;
		Nonce: number;
		signedMessage: string;
		clientSig: string;
		fileName: string;
	}>
> {
	let normalized: string;
	try {
		normalized = normalizeEd25519PublicKeyToHex(input.publicKeyHex);
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
	const parsedKey = EdDSAPubKeySchema.safeParse(normalized);
	if (!parsedKey.success) {
		return {ok: false, reason: 'Invalid public key hex.'};
	}

	const keyOptions = await fetchManagementKeyOptions(config);
	if (!keyOptions.ok) {
		return keyOptions;
	}
	const allowed = keyOptions.data.some(
		k => normalizeEd25519PublicKeyToHex(k.value) === parsedKey.data,
	);
	if (!allowed) {
		return {
			ok: false,
			reason: 'Preferred signer must already be in allowed management keys.',
		};
	}

	let localMatch;
	try {
		localMatch = await ensureLocalKeyPairForPublicKey(parsedKey.data, {
			keyRoot: MPA_HOME_DIR,
			toMcpApiError: sdkError,
		});
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}

	const nodeKeyResult = await managementGet<string>(config, '/getNodeKey');
	if (!nodeKeyResult.ok) {
		return nodeKeyResult;
	}
	const nodeKeyParsed = NodeIdSchema.safeParse(nodeKeyResult.data);
	if (!nodeKeyParsed.success) {
		return {ok: false, reason: 'Node ID response failed validation.'};
	}

	const signed = await prepareSignedManagementRequest(
		config,
		({selectedSigningKey}) => ({
			nodeKey: nodeKeyParsed.data,
			Nonce: selectedSigningKey.nonce,
			publicKey: parsedKey.data,
			Sig: '',
		}),
	);
	if (!signed.ok) {
		return signed;
	}

	const body = buildClientSigManagementPostBody(
		signed.data.unsignedBody,
		signed.data.signingMessage,
		signed.data.signature,
	);
	const posted = await managementPost<string>(config, '/setPreferredSigner', body);
	if (!posted.ok) {
		return posted;
	}

	const nonceParsed = NonceSchema.safeParse(signed.data.unsignedBody.Nonce);
	return {
		ok: true,
		data: {
			success: true,
			publicKeyHex: parsedKey.data,
			signerPublicKey: normalizeEd25519PublicKeyToHex(
				signed.data.selectedSigningKey.value,
			),
			nodeKey: nodeKeyParsed.data,
			Nonce: nonceParsed.success ? nonceParsed.data : signed.data.selectedSigningKey.nonce,
			signedMessage: signed.data.signingMessage,
			clientSig: signed.data.signature,
			fileName: localMatch.fileName,
		},
	};
}

export {MANAGEMENT_KEYS_DIR, MPA_HOME_DIR};
