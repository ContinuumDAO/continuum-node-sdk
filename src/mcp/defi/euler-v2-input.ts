import {
	ensureEulerV2ChainAssetCache,
	fetchEulerVaultUnderlyingMeta,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/euler-v2';
import {getAddress, isAddress, zeroAddress, type Address} from 'viem';
import type {NodeSdkConfig} from '../../config/schema.js';
import type {SdkResult} from '../../core/result.js';
import type {EnrichedMultisignContext} from './input-adapter.js';
import {lookupRegistryTokenDecimals} from './token-decimals.js';

export const EULER_V2_ISOLATED_LEND_TOOL = 'ctm_euler_v2_build_isolated_lend_multisign';
export const EULER_V2_COLLATERAL_DEPOSIT_TOOL =
	'ctm_euler_v2_build_collateral_deposit_multisign';

const EULER_V2_MULTISIGN_TOOLS = new Set([
	EULER_V2_ISOLATED_LEND_TOOL,
	'ctm_euler_v2_build_isolated_borrow_multisign',
	'ctm_euler_v2_build_vault_withdraw_multisign',
	'ctm_euler_v2_build_borrow_repay_multisign',
	EULER_V2_COLLATERAL_DEPOSIT_TOOL,
	'ctm_euler_v2_build_collateral_withdraw_multisign',
]);

export function isEulerV2MultisignTool(toolName: string): boolean {
	return EULER_V2_MULTISIGN_TOOLS.has(toolName);
}

function parseOptionalAddress(raw: unknown): Address | undefined {
	if (typeof raw !== 'string' || !raw.trim() || !isAddress(raw.trim())) {
		return undefined;
	}
	return getAddress(raw.trim());
}

function isNativeUnderlyingHint(raw: unknown): boolean {
	if (typeof raw !== 'string') return false;
	const t = raw.trim().toLowerCase();
	return t === 'eth' || t === 'native' || t === zeroAddress.toLowerCase();
}

export async function prepareEulerV2MultisignValidationInput(
	config: NodeSdkConfig,
	toolName: string,
	input: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isEulerV2MultisignTool(toolName)) {
		return {ok: false, reason: 'Not an Euler v2 multisign tool.'};
	}

	const out: Record<string, unknown> = {...input};
	const chainId = enriched.chainId;
	const cache = await ensureEulerV2ChainAssetCache(chainId);
	const nativeWrapped = cache.nativeWrapped ? getAddress(cache.nativeWrapped) : undefined;

	if (toolName === EULER_V2_ISOLATED_LEND_TOOL) {
		const evault =
			parseOptionalAddress(input.evaultAddress) ??
			parseOptionalAddress(input.vault);
		if (!evault) {
			return {
				ok: false,
				reason:
					'evaultAddress (or vault) is required — copy evaultAddress from ctm_euler_v2_fetch_lend_vaults.',
			};
		}
		let underlying =
			parseOptionalAddress(input.underlyingAddress) ??
			parseOptionalAddress(input.underlying);
		let underlyingDecimals: number | undefined =
			typeof input.underlyingDecimals === 'number'
				? input.underlyingDecimals
				: undefined;

		if (!underlying) {
			const meta = await fetchEulerVaultUnderlyingMeta({
				chainId,
				rpcUrl: enriched.rpcUrl,
				evault,
			});
			underlying = meta.asset;
			underlyingDecimals = meta.decimals;
		}

		const registryDec = underlying
			? await lookupRegistryTokenDecimals(config, chainId, underlying)
			: undefined;
		if (registryDec != null) underlyingDecimals = registryDec;

		let isNativeIn = !!input.isNativeIn;
		if (isNativeUnderlyingHint(input.underlyingAddress ?? input.underlying)) {
			if (!nativeWrapped) {
				return {ok: false, reason: 'nativeWrapped required for native ETH deposit on this chain.'};
			}
			underlying = nativeWrapped;
			isNativeIn = true;
		}

		out.evault = evault;
		out.underlying = underlying;
		out.isNativeIn = isNativeIn;
		out.nativeWrapped = nativeWrapped ?? underlying;
		out.receiver = enriched.executorAddress;
		out.vaultMarketLabel = String(input.marketName ?? input.vaultName ?? 'Euler vault').trim();
		if (underlyingDecimals != null) out._underlyingRegistryDecimals = underlyingDecimals;
		return {ok: true, data: out};
	}

	if (toolName === EULER_V2_COLLATERAL_DEPOSIT_TOOL) {
		const vault =
			parseOptionalAddress(input.collateralEvaultAddress) ??
			parseOptionalAddress(input.vault);
		const collateral =
			parseOptionalAddress(input.collateralTokenAddress) ??
			parseOptionalAddress(input.collateralAsset);
		if (!vault) return {ok: false, reason: 'vault (collateral eVault) is required.'};
		if (!collateral) {
			return {ok: false, reason: 'collateralAsset / collateralTokenAddress is required.'};
		}
		const registryDec = await lookupRegistryTokenDecimals(config, chainId, collateral);
		out.vault = vault;
		out.collateralAsset = collateral;
		if (registryDec != null) out._collateralRegistryDecimals = registryDec;
		return {ok: true, data: out};
	}

	// vault → evault for remaining tools that use `vault` field name in builders
	const vaultAddr = parseOptionalAddress(input.evaultAddress) ?? parseOptionalAddress(input.vault);
	if (vaultAddr) out.evault = vaultAddr;

	return {ok: true, data: out};
}

export function mapEulerV2MultisignBuilderArgs(
	toolName: string,
	parsed: Record<string, unknown>,
): Record<string, unknown> {
	const out = {...parsed};
	if (toolName === EULER_V2_ISOLATED_LEND_TOOL) {
		return {
			purposeText: String(parsed.purposeText ?? '').trim(),
			evault: parsed.evault,
			underlying: parsed.underlying,
			isNativeIn: parsed.isNativeIn,
			nativeWrapped: parsed.nativeWrapped,
			amountHuman: parsed.assetAmountHuman ?? parsed.amountHuman,
			receiver: parsed.receiver,
			vaultMarketLabel: parsed.vaultMarketLabel,
			_registryUnderlyingDecimals: parsed._underlyingRegistryDecimals,
		};
	}
	if (out.vault != null && out.evault == null) {
		out.evault = out.vault;
	}
	return out;
}

export function mergeEulerV2ParsedWithPrepared(
	parsed: Record<string, unknown>,
	prepared: Record<string, unknown> | undefined,
): Record<string, unknown> {
	if (!prepared) return parsed;
	return {...parsed, ...prepared};
}
