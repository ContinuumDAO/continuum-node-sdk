import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {managementGet, managementPost} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
import {getPreferredKeyGen} from '../keygen.js';
import {
	DEFAULT_MANAGEMENT_SIGNING,
	type ManagementSigningMethod,
} from '../../schemas/extended.js';
import {
	buildManagementPostRequest,
	managementSign,
} from '../management-signer.js';

export const BitcoinSecurityDefaultSchema = z
	.object({
		enabled: z.boolean(),
		set: z.boolean(),
	})
	.strict();

export const SetBitcoinSecurityDefaultInputSchema = z
	.object({
		enabled: z.boolean(),
	})
	.strict();

export const BitcoinSecurityAvailabilitySchema = z
	.object({
		available: z.boolean(),
		network: z.string().optional(),
		providerNodeKey: z.string().optional(),
		providerLabel: z.string().optional(),
		message: z.string().optional(),
	})
	.strict();

export const BitcoinCoreStatusSchema = z
	.object({
		freeBytes: z.number(),
		requiredBytes: z.number(),
		canInstall: z.boolean(),
		diskError: z.string().optional(),
		diskMessage: z.string().optional(),
		localInstalled: z.boolean(),
		localRunning: z.boolean(),
		network: z.string(),
		activeSource: z.string(),
		externalUrl: z.string().optional(),
		externalUser: z.string().optional(),
		externalPasswordSet: z.boolean(),
		blocks: z.number(),
		headers: z.number(),
		verificationProgress: z.number(),
		synced: z.boolean(),
		chain: z.string(),
		error: z.string().optional(),
		image: z.string(),
	})
	.strict();

export const GetBitcoinSecurityAvailabilityInputSchema = z
	.object({
		network: z.enum(['mainnet', 'testnet', 'signet']).optional(),
		keyGenId: z.string().min(1).optional(),
	})
	.strict();

const BITCOIN_CORE_STATUS_PATH = '/getBitcoinCoreStatus';

/** GET /getBitcoinCoreStatus on the local management API. */
export async function getBitcoinCoreStatus(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof BitcoinCoreStatusSchema>>> {
	const raw = await managementGet<unknown>(config, BITCOIN_CORE_STATUS_PATH);
	if (!raw.ok) return raw;
	const parsed = BitcoinCoreStatusSchema.safeParse(raw.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid getBitcoinCoreStatus response.'};
	}
	return {ok: true, data: parsed.data};
}

/**
 * GET /getBitcoinSecurityAvailability for a KeyGen.
 * Omitting keyGenId uses the preferred KeyGen. Omitting network uses mainnet.
 */
export async function getBitcoinSecurityAvailabilityForKeyGen(
	config: NodeSdkConfig,
	input: z.infer<typeof GetBitcoinSecurityAvailabilityInputSchema>,
): Promise<SdkResult<z.infer<typeof BitcoinSecurityAvailabilitySchema>>> {
	const network = input.network ?? 'mainnet';
	let keyGenId = input.keyGenId?.trim() ?? '';
	if (!keyGenId) {
		const preferred = await getPreferredKeyGen(config);
		if (!preferred.ok) return preferred;
		keyGenId = preferred.data.keyGenId.trim();
	}
	if (!keyGenId) {
		return {ok: false, reason: 'No KeyGen is selected. Pass keyGenId.'};
	}
	return getBitcoinSecurityAvailability(config, {network, keyGenId});
}

export async function getBitcoinSecurityAvailability(
	config: NodeSdkConfig,
	input: {network: string; keyGenId: string},
): Promise<SdkResult<z.infer<typeof BitcoinSecurityAvailabilitySchema>>> {
	const network = input.network.trim();
	const keyGenId = input.keyGenId.trim();
	if (!network || !keyGenId) {
		return {ok: false, reason: 'A signing group and Bitcoin network are required.'};
	}
	const path = `/getBitcoinSecurityAvailability?network=${encodeURIComponent(network)}&keyGenId=${encodeURIComponent(keyGenId)}`;
	const raw = await managementGet<unknown>(config, path, {timeoutMs: 25_000});
	if (!raw.ok) return raw;
	const parsed = BitcoinSecurityAvailabilitySchema.safeParse(raw.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid getBitcoinSecurityAvailability response.'};
	}
	return {ok: true, data: parsed.data};
}

export async function getBitcoinSecurityDefault(
	config: NodeSdkConfig,
): Promise<SdkResult<z.infer<typeof BitcoinSecurityDefaultSchema>>> {
	const raw = await managementGet<unknown>(config, '/getBitcoinSecurityDefault');
	if (!raw.ok) return raw;
	const parsed = BitcoinSecurityDefaultSchema.safeParse(raw.data);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid getBitcoinSecurityDefault response.'};
	}
	return {ok: true, data: parsed.data};
}

export async function setBitcoinSecurityDefault(
	config: NodeSdkConfig,
	input: unknown,
	signing: ManagementSigningMethod = DEFAULT_MANAGEMENT_SIGNING,
): Promise<SdkResult<{enabled: boolean}>> {
	const parsed = SetBitcoinSecurityDefaultInputSchema.safeParse(input);
	if (!parsed.success) {
		return {ok: false, reason: 'Invalid Bitcoin security default input.'};
	}
	const built = await buildManagementPostRequest(
		config,
		{
			path: '/setBitcoinSecurityDefault',
			buildRequestFields: () => ({enabled: parsed.data.enabled}),
		},
		signing,
	);
	if (!built.ok) return built;
	const signed = await managementSign(config, signing, built.data.unsignedBody);
	if (!signed.ok) return signed;
	const posted = await managementPost<unknown>(config, built.data.path, signed.data);
	if (!posted.ok) return posted;
	return {ok: true, data: {enabled: parsed.data.enabled}};
}
