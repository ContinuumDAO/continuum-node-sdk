import {
	aaveV4BorrowHealthGate,
	aaveV4MissingSpokeMessage,
	aaveV4RepayHealthGate,
	aaveV4WithdrawHealthGate,
	ensureAaveV4ChainTokenCache,
	fetchAaveV4ReservesForUnderlying,
	fetchAaveV4SpokesForChain,
	fetchAaveV4UserPositionsForChain,
	findAaveV4ReserveOnSpoke,
	listAaveV4ReservesForUnderlying,
	pickAaveV4ReserveRowForSpoke,
	previewAaveV4BorrowResultingHf,
	previewAaveV4RepayResultingHf,
	previewAaveV4WithdrawResultingHf,
	ensureCoinbaseB20StockCatalog,
	resolveAaveV4UnderlyingAddress,
	type AaveV4HubReserve,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/aave-v4';
import {getAddress, isAddress, zeroAddress, type Address} from 'viem';
import type {SdkResult} from '../../core/result.js';
import type {EnrichedMultisignContext} from './input-adapter.js';
import {prepareWalletWideMerklClaimInput} from './merkl-input.js';

export const AAVE_V4_DEPOSIT_TOOL = 'ctm_aave_v4_build_deposit_multisign';
export const AAVE_V4_WITHDRAW_TOOL = 'ctm_aave_v4_build_withdraw_multisign';
export const AAVE_V4_BORROW_TOOL = 'ctm_aave_v4_build_borrow_multisign';
export const AAVE_V4_REPAY_TOOL = 'ctm_aave_v4_build_repay_multisign';
export const AAVE_V4_MERKL_CLAIM_TOOL = 'ctm_aave_v4_build_merkl_claim_multisign';
export const AAVE_V4_SET_COLLATERAL_TOOL = 'ctm_aave_v4_build_set_collateral_multisign';
export const AAVE_V4_UPDATE_CONDITIONS_TOOL = 'ctm_aave_v4_build_update_conditions_multisign';
export const AAVE_V4_POSITION_MANAGER_TOOL = 'ctm_aave_v4_build_position_manager_multisign';
export const AAVE_V4_LIQUIDATE_TOOL = 'ctm_aave_v4_build_liquidate_multisign';
export const AAVE_V4_PREPARE_ORDER_TOOL = 'ctm_aave_v4_build_prepare_order_multisign';
export const AAVE_V4_SUBMIT_ORDER_TOOL = 'ctm_aave_v4_build_submit_order_multisign';

const AAVE_V4_MULTISIGN_TOOLS = new Set([
	AAVE_V4_DEPOSIT_TOOL,
	AAVE_V4_WITHDRAW_TOOL,
	AAVE_V4_BORROW_TOOL,
	AAVE_V4_REPAY_TOOL,
	AAVE_V4_MERKL_CLAIM_TOOL,
	AAVE_V4_SET_COLLATERAL_TOOL,
	AAVE_V4_UPDATE_CONDITIONS_TOOL,
	AAVE_V4_POSITION_MANAGER_TOOL,
	AAVE_V4_LIQUIDATE_TOOL,
	AAVE_V4_PREPARE_ORDER_TOOL,
	AAVE_V4_SUBMIT_ORDER_TOOL,
]);

const AAVE_V4_SPOKE_ASSET_TOOLS = new Set([
	AAVE_V4_DEPOSIT_TOOL,
	AAVE_V4_WITHDRAW_TOOL,
	AAVE_V4_BORROW_TOOL,
	AAVE_V4_REPAY_TOOL,
	AAVE_V4_SET_COLLATERAL_TOOL,
	AAVE_V4_LIQUIDATE_TOOL,
	AAVE_V4_POSITION_MANAGER_TOOL,
]);

type ResolvedAaveV4Reserve = {
	spoke: Address;
	spokeLabel: string;
	hubName: string;
	reserve: AaveV4HubReserve;
};

export function isAaveV4MultisignTool(toolName: string): boolean {
	return AAVE_V4_MULTISIGN_TOOLS.has(toolName);
}

function blank(value: unknown): boolean {
	return typeof value !== 'string' || !value.trim();
}

function parseOptionalAddress(raw: unknown): Address | undefined {
	if (blank(raw)) return undefined;
	return resolveAaveV4UnderlyingAddress(String(raw).trim()) ?? undefined;
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
	const asset = resolveAaveV4UnderlyingAddress(trimmed);
	if (!asset) {
		return {
			ok: false,
			reason: `Invalid underlying "${trimmed}". Pass an ERC-20 address or a Base bStock ticker (AAPLc, NVDAc, …).`,
		};
	}
	return {
		ok: true,
		data: {asset, isNativeIn: false},
	};
}

async function resolveReserveOnSpoke(args: {
	toolName: string;
	chainId: number;
	spoke: Address;
	asset: Address;
}): Promise<SdkResult<ResolvedAaveV4Reserve>> {
	const spokes = await fetchAaveV4SpokesForChain(args.chainId);
	const spokeRow = spokes.find((s) => s.address.toLowerCase() === args.spoke.toLowerCase());
	if (!spokeRow) {
		return {
			ok: false,
			reason: aaveV4MissingSpokeMessage({
				underlying: args.asset,
				chainId: args.chainId,
				matches: spokes.map((s) => ({
					displayName: s.displayName,
					address: s.address,
					hubNames: s.hubNames,
				})),
			}),
		};
	}
	const found = await findAaveV4ReserveOnSpoke({
		chainId: args.chainId,
		spoke: args.spoke,
		underlying: args.asset,
	});
	if (!found) {
		const matches = await listAaveV4ReservesForUnderlying({
			chainId: args.chainId,
			underlying: args.asset,
		});
		return {
			ok: false,
			reason: aaveV4MissingSpokeMessage({
				underlying: args.asset,
				chainId: args.chainId,
				matches: matches.map((m) => ({
					displayName: m.spoke?.displayName ?? m.hub.name,
					address: m.reserve.spoke?.address ?? '',
					hubNames: [m.hub.name],
				})),
			}),
		};
	}
	if (args.toolName === AAVE_V4_BORROW_TOOL && found.reserve.canBorrow !== true) {
		return {
			ok: false,
			reason:
				`Debt asset ${args.asset} is not borrowable on ${spokeRow.displayName}. ` +
				'On the Coinbase Stocks spoke, equities are collateral-only; borrow USDC.',
		};
	}
	const spokeRaw = found.reserve.spoke?.address?.trim();
	if (!spokeRaw || !isAddress(spokeRaw)) {
		return {ok: false, reason: `No spoke address on the reserve for ${args.asset}.`};
	}
	return {
		ok: true,
		data: {
			spoke: getAddress(spokeRaw),
			spokeLabel: spokeRow.displayName,
			hubName: found.hub.name,
			reserve: found.reserve,
		},
	};
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

/** Require a spoke address and confirm the asset is listed on that spoke. Reject marketId. */
export async function prepareAaveV4MultisignValidationInput(
	toolName: string,
	input: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isAaveV4MultisignTool(toolName)) {
		return {ok: true, data: input};
	}
	if (input.marketId != null && String(input.marketId).trim()) {
		return {
			ok: false,
			reason: 'marketId is not used. Pass spoke (the spoke contract address from ctm_aave_v4_fetch_spokes).',
		};
	}

	if (toolName === AAVE_V4_MERKL_CLAIM_TOOL) {
		return prepareWalletWideMerklClaimInput(input, enriched);
	}
	if (
		toolName === AAVE_V4_UPDATE_CONDITIONS_TOOL ||
		toolName === AAVE_V4_PREPARE_ORDER_TOOL ||
		toolName === AAVE_V4_SUBMIT_ORDER_TOOL
	) {
		return {ok: true, data: input};
	}

	const chainId = enriched.chainId;
	await ensureCoinbaseB20StockCatalog().catch(() => []);
	const spokeRaw = String(input.spoke ?? '').trim();
	if (!spokeRaw || !isAddress(spokeRaw)) {
		const spokes = await fetchAaveV4SpokesForChain(chainId);
		return {
			ok: false,
			reason: aaveV4MissingSpokeMessage({
				underlying: String(input.underlying ?? input.collateralUnderlying ?? 'this action'),
				chainId,
				matches: spokes.map((s) => ({
					displayName: s.displayName,
					address: s.address,
					hubNames: s.hubNames,
				})),
			}),
		};
	}
	const spoke = getAddress(spokeRaw);

	if (toolName === AAVE_V4_POSITION_MANAGER_TOOL) {
		const spokes = await fetchAaveV4SpokesForChain(chainId);
		const row = spokes.find((s) => s.address.toLowerCase() === spoke.toLowerCase());
		if (!row) {
			return {ok: false, reason: `No Aave v4 spoke ${spoke} on chain ${chainId}.`};
		}
		return {
			ok: true,
			data: {...input, spoke, _aaveV4SpokeLabel: row.displayName},
		};
	}

	const cache = await ensureAaveV4ChainTokenCache(chainId);
	const nativeWrappedRaw = cache.nativeWrapped?.trim();
	if (!nativeWrappedRaw || !isAddress(nativeWrappedRaw)) {
		return {
			ok: false,
			reason: `Aave v4 has no wrapped-native token for chainId ${chainId}.`,
		};
	}
	const nativeWrapped = getAddress(nativeWrappedRaw);

	const assetField = toolName === AAVE_V4_LIQUIDATE_TOOL ? input.collateralUnderlying : input.underlying;
	const underlyingResolved = resolveUnderlyingAddress(assetField, nativeWrapped);
	if (!underlyingResolved.ok) return underlyingResolved;

	let isNativeIn = underlyingResolved.data.isNativeIn;
	if (input.isNativeIn === true) isNativeIn = true;
	if (
		toolName === AAVE_V4_DEPOSIT_TOOL &&
		!isNativeIn &&
		underlyingResolved.data.asset.toLowerCase() === nativeWrapped.toLowerCase() &&
		input.depositNative === true
	) {
		isNativeIn = true;
	}

	const reserveResolved = await resolveReserveOnSpoke({
		toolName,
		chainId,
		spoke,
		asset: underlyingResolved.data.asset,
	});
	if (!reserveResolved.ok) return reserveResolved;

	if (toolName === AAVE_V4_LIQUIDATE_TOOL && !blank(input.debtUnderlying)) {
		const debt = resolveUnderlyingAddress(input.debtUnderlying, nativeWrapped);
		if (!debt.ok) return debt;
		const debtReserve = await resolveReserveOnSpoke({
			toolName,
			chainId,
			spoke,
			asset: debt.data.asset,
		});
		if (!debtReserve.ok) return debtReserve;
		input = {...input, debtUnderlying: debt.data.asset};
	}

	const out: Record<string, unknown> = {
		...input,
		...(toolName === AAVE_V4_LIQUIDATE_TOOL
			? {collateralUnderlying: underlyingResolved.data.asset}
			: {underlying: underlyingResolved.data.asset}),
		spoke: reserveResolved.data.spoke,
		_aaveV4SpokeLabel: reserveResolved.data.spokeLabel,
		_aaveV4NativeWrapped: nativeWrapped,
		_aaveV4IsNativeIn: isNativeIn,
		_aaveV4HubName: reserveResolved.data.hubName,
	};

	if (
		toolName === AAVE_V4_WITHDRAW_TOOL ||
		toolName === AAVE_V4_BORROW_TOOL ||
		toolName === AAVE_V4_REPAY_TOOL
	) {
		const health = await validateAaveV4HealthPreflight(toolName, out, enriched, reserveResolved.data);
		if (!health.ok) return health;
	}

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
		_aaveV4SpokeLabel: prepared._aaveV4SpokeLabel,
		isNativeIn:
			parsed.isNativeIn ??
			prepared.isNativeIn ??
			prepared._aaveV4IsNativeIn,
		_aaveV4NativeWrapped: prepared._aaveV4NativeWrapped,
		_aaveV4IsNativeIn: prepared._aaveV4IsNativeIn,
		_aaveV4HubName: prepared._aaveV4HubName,
		to: parsed.to ?? prepared.to,
		data: parsed.data ?? prepared.data,
		valueWei: parsed.valueWei ?? prepared.valueWei,
		claimLeafCount: parsed.claimLeafCount ?? prepared.claimLeafCount,
	};
}

/** Map MCP tool fields to ctm-mpc-defi builder arg names. */
export function mapAaveV4MultisignBuilderArgs(
	toolName: string,
	fields: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
): Record<string, unknown> {
	const spokeLabel = String(fields._aaveV4SpokeLabel ?? '').trim();
	const spoke = String(fields.spoke ?? '').trim();
	const underlying = String(fields.underlying ?? '').trim();
	const amountHuman = String(fields.amountHuman ?? '').trim();
	const nativeWrapped = String(fields._aaveV4NativeWrapped ?? '').trim();
	const isNativeIn = Boolean(fields._aaveV4IsNativeIn ?? fields.isNativeIn);
	const onBehalfOf = enriched.executorAddress;

	const common = {
		spoke,
		spokeLabel,
		amountHuman,
		onBehalfOf,
		purposeText: String(fields.purposeText ?? '').trim(),
	};

	if (toolName === AAVE_V4_DEPOSIT_TOOL) {
		return {
			...common,
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
		};
	}

	if (toolName === AAVE_V4_REPAY_TOOL) {
		return {
			...common,
			underlying,
		};
	}

	if (toolName === AAVE_V4_SET_COLLATERAL_TOOL) {
		return {
			...common,
			underlying,
			usingAsCollateral: fields.usingAsCollateral === true,
		};
	}

	if (toolName === AAVE_V4_LIQUIDATE_TOOL) {
		return {
			...common,
			user: fields.user,
			collateralUnderlying: fields.collateralUnderlying,
			debtUnderlying: fields.debtUnderlying,
			receiveShares: fields.receiveShares,
		};
	}

	if (toolName === AAVE_V4_MERKL_CLAIM_TOOL) {
		return {
			purposeText: String(fields.purposeText ?? '').trim(),
			to: fields.to,
			data: fields.data,
			valueWei: fields.valueWei,
			claimLeafCount: fields.claimLeafCount,
		};
	}

	return fields;
}
