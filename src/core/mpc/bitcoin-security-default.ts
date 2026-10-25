import {z} from 'zod';
import type {NodeSdkConfig} from '../../config/schema.js';
import {managementGet, managementPost} from '../../api/management-api.js';
import type {SdkResult} from '../result.js';
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
