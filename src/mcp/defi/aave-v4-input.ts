import {
	aaveV4BorrowHealthGate,
	aaveV4RepayHealthGate,
	aaveV4WithdrawHealthGate,
	ensureAaveV4ChainTokenCache,
	fetchAaveV4HubsForChain,
	fetchAaveV4ReservesForUnderlying,
	fetchAaveV4UserPositionsForChain,
	findAaveV4HubReserveForChainUnderlying,
	findHubReserveForUnderlying,
	pickAaveV4ReserveRowForSpoke,
	previewAaveV4BorrowResultingHf,
	previewAaveV4RepayResultingHf,
	previewAaveV4WithdrawResultingHf,
	resolveAaveV4HubForUiMarket,
	type AaveV4HubReserve,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/aave-v4';
import {getAddress, isAddress, zeroAddress, type Address} from 'viem';
import type {SdkResult} from '../../core/result.js';
import type {EnrichedMultisignContext} from './input-adapter.js';

export const AAVE_V4_DEPOSIT_TOOL = 'ctm_aave_v4_build_deposit_multisign';
export const AAVE_V4_WITHDRAW_TOOL = 'ctm_aave_v4_build_withdraw_multisign';
export const AAVE_V4_BORROW_TOOL = 'ctm_aave_v4_build_borrow_multisign';
export const AAVE_V4_REPAY_TOOL = 'ctm_aave_v4_build_repay_multisign';

const AAVE_V4_MULTISIGN_TOOLS = new Set([
	AAVE_V4_DEPOSIT_TOOL,
	AAVE_V4_WITHDRAW_TOOL,
	AAVE_V4_BORROW_TOOL,
	AAVE_V4_REPAY_TOOL,
]);

type AaveV4UiMarketId = 'main' | 'core' | 'bluechip';

type ResolvedAaveV4Reserve = {
	spoke: Address;
	hubName: string;
	reserveGraphqlId: string | null;
	liquidationConfig: {
		targetHealthFactor: string;
		healthFactorForMaxBonus: string;
	} | null;
};

export function isAaveV4MultisignTool(toolName: string): boolean {
	return AAVE_V4_MULTISIGN_TOOLS.has(toolName);
}

function blank(value: unknown): boolean {
	return typeof value !== 'string' || !value.trim();
}

function normalizeAaveV4MarketId(raw: unknown): AaveV4UiMarketId {
	const t = String(raw ?? '')
		.trim()
		.toLowerCase();
	if (t === 'core') return 'core';
	if (t === 'bluechip' || t === 'prime' || t === 'institutional') {
		return 'bluechip';
	}
	if (t === 'main' || t === 'plus' || t === 'default') return 'main';
	return 'main';
}

function parseOptionalAddress(raw: unknown): Address | undefined {
	if (blank(raw) || !isAddress(String(raw).trim())) {
		return undefined;
	}
	return getAddress(String(raw).trim());
}

function isNativeUnderlyingHint(raw: unknown): boolean {
	if (typeof raw !== 'string') return false;
	const t = raw.trim().toLowerCase();
	return (
		t === 'eth' ||
		t === 'native' ||
		t === 'native_eth' ||
		t === zeroAddress.toLowerCase()
	);
}

function resolveUnderlyingAddress(
	raw: unknown,
	nativeWrapped: Address,
): SdkResult<{asset: Address; isNativeIn: boolean}> {
	if (blank(raw)) {
		return {ok: false, reason: 'underlying is required for Aave v4 multisign tools.'};
	}
	const trimmed = String(raw).trim();
	if (isNativeUnderlyingHint(trimmed)) {
		return {ok: true, data: {asset: nativeWrapped, isNativeIn: true}};
	}
	if (!isAddress(trimmed)) {
		return {ok: false, reason: `Invalid underlying address: ${trimmed}`};
	}
	return {
		ok: true,
		data: {asset: getAddress(trimmed), isNativeIn: false},
	};
}

function reserveContextFromHubReserve(
	hubName: string,
	reserve: AaveV4HubReserve,
): ResolvedAaveV4Reserve | null {
	const spokeRaw = reserve.spoke?.address?.trim();
	if (!spokeRaw || !isAddress(spokeRaw)) {
		return null;
	}
	return {
		spoke: getAddress(spokeRaw),
		hubName,
		reserveGraphqlId: null,
		liquidationConfig: null,
	};
}

async function resolveReserveContext(args: {
	toolName: string;
	chainId: number;
	marketId: AaveV4UiMarketId;
	asset: Address;
	amountHuman: string;
	collateralUnderlying?: Address;
}): Promise<SdkResult<ResolvedAaveV4Reserve>> {
	const hubs = await fetchAaveV4HubsForChain(args.chainId);
	if (!hubs.length) {
		return {
			ok: false,
			reason: `No Aave v4 hubs found for chainId ${args.chainId}.`,
		};
	}
	const preferHub = resolveAaveV4HubForUiMarket(hubs, args.marketId, args.chainId);
	if (!preferHub) {
		return {
			ok: false,
			reason: `No Aave v4 hub for market "${args.marketId}" on chainId ${args.chainId}.`,
		};
	}

	const isBorrow = args.toolName === AAVE_V4_BORROW_TOOL;
	const hubPickUnderlying = isBorrow
		? (args.collateralUnderlying ?? args.asset)
		: args.asset;

	const found = await findAaveV4HubReserveForChainUnderlying({
		chainId: args.chainId,
		hubs,
		underlying: hubPickUnderlying,
		preferHub,
		debtUnderlying: isBorrow ? args.asset : null,
		debtBorrowAmountHumanForLiquidity: isBorrow ? args.amountHuman : null,
	});
	if (!found) {
		return {
			ok: false,
			reason:
				`Could not resolve Aave v4 market for underlying ${args.asset} on chainId ${args.chainId} ` +
				`(market "${args.marketId}"). Use get_defi_protocol_supported_tokens and pick a listed asset.`,
		};
	}

	const actionReserve = isBorrow
		? findHubReserveForUnderlying(found.hubReserves, args.asset)
		: found.reserve;
	if (!actionReserve) {
		return {
			ok: false,
			reason: isBorrow
				? `Debt asset ${args.asset} is not borrowable in the resolved hub (${found.hub.name}).`
				: `Asset ${args.asset} is not listed in the resolved hub (${found.hub.name}).`,
		};
	}

	const fromHub = reserveContextFromHubReserve(found.hub.name, actionReserve);
	if (!fromHub) {
		return {
			ok: false,
			reason: `No spoke address on the resolved reserve for ${args.asset}.`,
		};
	}
	return {ok: true, data: fromHub};
}

async function userHasBorrowDebtOnSpoke(args: {
	user: Address;
	chainId: number;
	spoke: Address;
}): Promise<boolean> {
	const positions = await fetchAaveV4UserPositionsForChain({
		user: args.user,
		chainId: args.chainId,
	});
	const want = args.spoke.toLowerCase();
	for (const p of positions) {
		const addr = (p.spoke?.address ?? '').trim();
		if (!addr || !isAddress(addr)) continue;
		if (getAddress(addr).toLowerCase() !== want) continue;
		const debt = parseFloat(p.totalDebt?.current?.value ?? '0');
		if (Number.isFinite(debt) && debt > 0) return true;
	}
	return false;
}

function healthGateFailure(
	gate: {outcome: string; reason?: string},
	acknowledgeHealthRisk: boolean,
): SdkResult<never> | null {
	if (gate.outcome === 'allow') return null;
	if (gate.outcome === 'confirm') {
		if (acknowledgeHealthRisk) return null;
		return {
			ok: false,
			reason:
				(gate.reason ?? 'Health factor risk requires acknowledgment.') +
				' Set acknowledgeHealthRisk: true after explaining the risk to the user.',
		};
	}
	return {
		ok: false,
		reason: gate.reason ?? 'Health factor preview blocked this action.',
	};
}

async function validateAaveV4HealthPreflight(
	toolName: string,
	input: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
	resolved: ResolvedAaveV4Reserve,
): Promise<SdkResult<Record<string, unknown>>> {
	if (input.skipHealthPreview === true) {
		return {ok: true, data: input};
	}
	if (
		toolName !== AAVE_V4_WITHDRAW_TOOL &&
		toolName !== AAVE_V4_BORROW_TOOL &&
		toolName !== AAVE_V4_REPAY_TOOL
	) {
		return {ok: true, data: input};
	}

	const user = getAddress(enriched.executorAddress);
	const spoke = resolved.spoke;
	const underlying = getAddress(String(input.underlying));
	const amountHuman = String(input.amountHuman ?? '').trim();
	const acknowledgeHealthRisk = input.acknowledgeHealthRisk === true;

	const rows = await fetchAaveV4ReservesForUnderlying({
		chainId: enriched.chainId,
		underlying,
		user,
	});
	const row = pickAaveV4ReserveRowForSpoke(rows, spoke);
	if (!row?.id) {
		return {ok: true, data: input};
	}

	const liq = row.spoke?.liquidationConfig ?? null;

	if (toolName === AAVE_V4_WITHDRAW_TOOL) {
		const preview = await previewAaveV4WithdrawResultingHf({
			user,
			reserveId: row.id,
			amountExactHuman: amountHuman,
		});
		if (preview.error) {
			return {ok: false, reason: preview.error};
		}
		const hasBorrowDebt = await userHasBorrowDebtOnSpoke({
			user,
			chainId: enriched.chainId,
			spoke,
		});
		const gate = aaveV4WithdrawHealthGate({
			resultingHealthFactor: preview.resultingHf,
			hasBorrowDebt,
			liquidationConfig: liq,
		});
		const blocked = healthGateFailure(gate, acknowledgeHealthRisk);
		if (blocked) return blocked;
	}

	if (toolName === AAVE_V4_BORROW_TOOL) {
		const preview = await previewAaveV4BorrowResultingHf({
			user,
			reserveGraphqlId: row.id,
			amountExactHuman: amountHuman,
		});
		if (preview.error) {
			return {ok: false, reason: preview.error};
		}
		const gate = aaveV4BorrowHealthGate({
			resultingHealthFactor: preview.resultingHf,
			liquidationConfig: liq,
		});
		const blocked = healthGateFailure(gate, acknowledgeHealthRisk);
		if (blocked) return blocked;
	}

	if (toolName === AAVE_V4_REPAY_TOOL) {
		const preview = await previewAaveV4RepayResultingHf({
			user,
			reserveGraphqlId: row.id,
			amountExactHuman: amountHuman,
		});
		if (preview.error) {
			return {ok: false, reason: preview.error};
		}
		const gate = aaveV4RepayHealthGate({
			resultingHealthFactor: preview.resultingHf,
			liquidationConfig: liq,
			strict: false,
		});
		const blocked = healthGateFailure(gate, acknowledgeHealthRisk);
		if (blocked) return blocked;
	}

	return {ok: true, data: input};
}

/**
 * Resolve spoke/underlying before Zod validation so agents are not required to
 * guess deployment addresses (e.g. WETH on Ethereum is listed under Core, not Plus).
 */
export async function prepareAaveV4MultisignValidationInput(
	toolName: string,
	input: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isAaveV4MultisignTool(toolName)) {
		return {ok: true, data: input};
	}

	const chainId = enriched.chainId;
	const cache = await ensureAaveV4ChainTokenCache(chainId);
	const nativeWrappedRaw = cache.nativeWrapped?.trim();
	if (!nativeWrappedRaw || !isAddress(nativeWrappedRaw)) {
		return {
			ok: false,
			reason: `Aave v4 has no wrapped-native token for chainId ${chainId}.`,
		};
	}
	const nativeWrapped = getAddress(nativeWrappedRaw);

	const underlyingResolved = resolveUnderlyingAddress(
		input.underlying,
		nativeWrapped,
	);
	if (!underlyingResolved.ok) return underlyingResolved;

	let isNativeIn = underlyingResolved.data.isNativeIn;
	if (input.isNativeIn === true) {
		isNativeIn = true;
	}
	if (
		toolName === AAVE_V4_DEPOSIT_TOOL &&
		!isNativeIn &&
		underlyingResolved.data.asset.toLowerCase() === nativeWrapped.toLowerCase() &&
		input.depositNative === true
	) {
		isNativeIn = true;
	}

	const marketId = normalizeAaveV4MarketId(input.marketId ?? 'main');
	const amountHuman = String(input.amountHuman ?? '').trim();
	const collateralUnderlying = parseOptionalAddress(input.collateralUnderlying);

	const reserveResolved = await resolveReserveContext({
		toolName,
		chainId,
		marketId,
		asset: underlyingResolved.data.asset,
		amountHuman,
		collateralUnderlying,
	});
	if (!reserveResolved.ok) return reserveResolved;

	const out: Record<string, unknown> = {
		...input,
		underlying: underlyingResolved.data.asset,
		spoke: reserveResolved.data.spoke,
		marketId,
		_aaveV4NativeWrapped: nativeWrapped,
		_aaveV4IsNativeIn: isNativeIn,
		_aaveV4HubName: reserveResolved.data.hubName,
	};

	const health = await validateAaveV4HealthPreflight(
		toolName,
		out,
		enriched,
		reserveResolved.data,
	);
	if (!health.ok) return health;

	return {ok: true, data: out};
}

/** Zod parse strips server-only keys; merge them back before builder mapping. */
export function mergeAaveV4ParsedWithPrepared(
	parsed: Record<string, unknown>,
	prepared: Record<string, unknown> | undefined,
): Record<string, unknown> {
	if (!prepared) return parsed;
	return {
		...parsed,
		spoke: parsed.spoke ?? prepared.spoke,
		marketId: parsed.marketId ?? prepared.marketId,
		isNativeIn:
			parsed.isNativeIn ??
			prepared.isNativeIn ??
			prepared._aaveV4IsNativeIn,
		_aaveV4NativeWrapped: prepared._aaveV4NativeWrapped,
		_aaveV4IsNativeIn: prepared._aaveV4IsNativeIn,
		_aaveV4HubName: prepared._aaveV4HubName,
	};
}

/** Map MCP tool fields to ctm-mpc-defi builder arg names. */
export function mapAaveV4MultisignBuilderArgs(
	toolName: string,
	fields: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
): Record<string, unknown> {
	const market = normalizeAaveV4MarketId(fields.marketId ?? 'main');
	const spoke = String(fields.spoke ?? '').trim();
	const underlying = String(fields.underlying ?? '').trim();
	const amountHuman = String(fields.amountHuman ?? '').trim();
	const nativeWrapped = String(fields._aaveV4NativeWrapped ?? '').trim();
	const isNativeIn = Boolean(fields._aaveV4IsNativeIn ?? fields.isNativeIn);
	const onBehalfOf = enriched.executorAddress;

	const common = {
		spoke,
		amountHuman,
		onBehalfOf,
		purposeText: String(fields.purposeText ?? '').trim(),
	};

	if (toolName === AAVE_V4_DEPOSIT_TOOL) {
		return {
			...common,
			market,
			asset: underlying,
			nativeWrapped,
			isNativeIn,
			enableAsCollateralAfterSupply: fields.enableAsCollateralAfterSupply,
		};
	}

	if (toolName === AAVE_V4_WITHDRAW_TOOL || toolName === AAVE_V4_BORROW_TOOL) {
		return {
			...common,
			underlying,
			marketLabel: market,
		};
	}

	if (toolName === AAVE_V4_REPAY_TOOL) {
		return {
			...common,
			underlying,
			market,
		};
	}

	return fields;
}
