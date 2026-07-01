import {z} from 'zod';
import {SelectedSigningKeySchema} from '../../schemas/extended.js';

export const VpnProfileSchema = z.enum(['split', 'full']);

export const VpnObfuscationSchema = z.enum([
	'none',
	'shadowsocks',
	'wg_obfuscator',
	'lwo',
	'udp2raw',
]);

export const VpnUserFolderInputSchema = z
	.object({
		userFolder: z.string().min(1).optional(),
	})
	.strict();

export const SetVpnEnabledInputSchema = VpnUserFolderInputSchema.extend({
	enabled: z.boolean(),
	profile: VpnProfileSchema.optional(),
	obfuscation: VpnObfuscationSchema.optional(),
}).strict();

export const DownloadVpnAdminClientConfigInputSchema = VpnUserFolderInputSchema.extend({
	profile: VpnProfileSchema.optional(),
	obfuscation: VpnObfuscationSchema.optional(),
}).strict();

export const SetVpnEgressSharingInputSchema = z
	.object({
		enabled: z.boolean(),
		obfuscation: VpnObfuscationSchema.optional(),
		defaultRateLimitMbps: z.number().nonnegative().optional(),
	})
	.strict();

export const RevokeVpnEgressPeerInputSchema = z
	.object({
		consumerNodeKey: z.string().min(1),
	})
	.strict();

export const DownloadVpnEgressClientConfigInputSchema = VpnUserFolderInputSchema.extend({
	targetAddress: z.string().min(1),
	obfuscation: VpnObfuscationSchema.optional(),
}).strict();

export const VpnStatusSchema = z
	.object({
		available: z.boolean(),
		installed: z.boolean(),
		active: z.boolean(),
		listenPort: z.number(),
		endpointHost: z.string(),
		profiles: z.array(VpnProfileSchema),
		profile: z.union([VpnProfileSchema, z.literal('')]).optional(),
		obfuscation: VpnObfuscationSchema.optional(),
		clientConfigured: z.boolean(),
		vpnBillingRegistered: z.boolean().optional(),
		vpnBillingMonthActive: z.boolean().optional(),
		message: z.string().optional(),
		lastError: z.string().optional(),
	})
	.strict();

export const VpnEgressStatusSchema = z
	.object({
		available: z.boolean(),
		active: z.boolean(),
		sharingEnabled: z.boolean(),
		listenPort: z.number(),
		endpointHost: z.string(),
		countryCode: z.string(),
		defaultRateLimitMbps: z.number(),
		obfuscation: VpnObfuscationSchema,
		peerCount: z.number().optional(),
		vpnBillingRegistered: z.boolean().optional(),
		vpnBillingMonthActive: z.boolean().optional(),
		message: z.string().optional(),
		lastError: z.string().optional(),
	})
	.strict();

export const VpnEgressExitPeerSchema = z
	.object({
		address: z.string(),
		publicKey: z.string(),
		countryCode: z.string().optional(),
		obfuscation: VpnObfuscationSchema.optional(),
		endpointHost: z.string().optional(),
		listenPort: z.number().optional(),
		defaultRateLimitMbps: z.number().optional(),
		vpnBillingRegistered: z.boolean().optional(),
		vpnBillingMonthActive: z.boolean().optional(),
	})
	.strict();

export const VpnSignedActionOutputSchema = z
	.object({
		result: z.record(z.string(), z.unknown()),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export const VpnDownloadOutputSchema = z
	.object({
		userFolder: z.string(),
		wireGuardPath: z.string(),
		transportPath: z.string().optional(),
		wireGuardFilename: z.string(),
		transportFilename: z.string().optional(),
		setupInstructions: z.string().optional(),
		selectedSigningKey: SelectedSigningKeySchema.optional(),
		signingMessage: z.string(),
	})
	.strict();

export const ListVpnEgressExitsOutputSchema = z
	.object({
		exits: z.array(VpnEgressExitPeerSchema),
	})
	.strict();
