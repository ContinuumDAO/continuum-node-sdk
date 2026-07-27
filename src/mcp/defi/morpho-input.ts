import {
	fetchMorphoMarketById,
	fetchMorphoMidnightBook,
	fetchMorphoVaultByAddress,
	morphoMidnightAddressesForChain,
} from '@continuumdao/ctm-mpc-defi/protocols/evm/morpho';
import {getAddress, isAddress, zeroAddress, type Address} from 'viem';
import type {SdkResult} from '../../core/result.js';
import type {EnrichedMultisignContext} from './input-adapter.js';

export const MORPHO_VAULT_DEPOSIT_TOOL = 'ctm_morpho_build_vault_deposit_multisign';
export const MORPHO_VAULT_WITHDRAW_TOOL = 'ctm_morpho_build_vault_withdraw_multisign';
export const MORPHO_BLUE_COLLATERAL_DEPOSIT_TOOL =
	'ctm_morpho_build_blue_collateral_deposit_multisign';
export const MORPHO_BLUE_BORROW_TOOL = 'ctm_morpho_build_blue_borrow_multisign';
export const MORPHO_BLUE_REPAY_TOOL = 'ctm_morpho_build_blue_repay_multisign';
export const MORPHO_BLUE_COLLATERAL_WITHDRAW_TOOL =
	'ctm_morpho_build_blue_collateral_withdraw_multisign';
export const MORPHO_MERKL_CLAIM_TOOL = 'ctm_morpho_build_merkl_claim_multisign';
export const MORPHO_MIDNIGHT_LEND_TOOL = 'ctm_morpho_build_midnight_lend_multisign';
export const MORPHO_MIDNIGHT_BORROW_TOOL = 'ctm_morpho_build_midnight_borrow_multisign';
export const MORPHO_MIDNIGHT_REPAY_TOOL = 'ctm_morpho_build_midnight_repay_multisign';

const MORPHO_MULTISIGN_TOOLS = new Set([
	MORPHO_VAULT_DEPOSIT_TOOL,
	MORPHO_VAULT_WITHDRAW_TOOL,
	MORPHO_BLUE_COLLATERAL_DEPOSIT_TOOL,
	MORPHO_BLUE_BORROW_TOOL,
	MORPHO_BLUE_REPAY_TOOL,
	MORPHO_BLUE_COLLATERAL_WITHDRAW_TOOL,
	MORPHO_MERKL_CLAIM_TOOL,
	MORPHO_MIDNIGHT_LEND_TOOL,
	MORPHO_MIDNIGHT_BORROW_TOOL,
	MORPHO_MIDNIGHT_REPAY_TOOL,
]);

const MERKL_DISTRIBUTOR_FALLBACK = '0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae' as Address;

export function isMorphoMultisignTool(toolName: string): boolean {
	return MORPHO_MULTISIGN_TOOLS.has(toolName);
}

function blank(value: unknown): boolean {
	return typeof value !== 'string' || !value.trim();
}

function parseOptionalAddress(raw: unknown): Address | undefined {
	if (blank(raw) || !isAddress(String(raw).trim())) return undefined;
	return getAddress(String(raw).trim());
}

function isNativeUnderlyingHint(raw: unknown): boolean {
	if (typeof raw !== 'string') return false;
	const t = raw.trim().toLowerCase();
	return t === 'eth' || t === 'native' || t === zeroAddress.toLowerCase();
}

async function resolveMarket(toolName: string, chainId: number, raw: Record<string, unknown>) {
	const marketId = String(raw.marketId ?? '').trim();
	if (!marketId) {
		return {ok: false as const, reason: 'marketId is required for Morpho Blue multisign tools.'};
	}
	const market = await fetchMorphoMarketById({chainId, marketId});
	if (!market) {
		return {ok: false as const, reason: `Morpho market not found: ${marketId} on chain ${chainId}.`};
	}
	return {ok: true as const, data: market};
}

export async function prepareMorphoMultisignValidationInput(
	toolName: string,
	input: Record<string, unknown>,
	enriched: EnrichedMultisignContext,
): Promise<SdkResult<Record<string, unknown>>> {
	if (!isMorphoMultisignTool(toolName)) {
		return {ok: false, reason: 'Not a Morpho multisign tool.'};
	}

	const chainId = enriched.chainId;
	const out: Record<string, unknown> = {...input};

	if (toolName === MORPHO_VAULT_DEPOSIT_TOOL) {
		const vault = parseOptionalAddress(input.vaultAddress ?? input.vault);
		if (!vault) return {ok: false, reason: 'vaultAddress is required (from ctm_morpho_fetch_earn_vaults).'};
		const vaultRow = await fetchMorphoVaultByAddress({chainId, vaultAddress: vault});
		if (!vaultRow?.asset?.address) {
			return {ok: false, reason: `Morpho vault not found: ${vault}`};
		}
		if (vaultRow.listed !== true) {
			return {
				ok: false,
				reason: `Morpho vault is not Morpho-listed (curated): ${vault}. Use ctm_morpho_fetch_earn_vaults to discover deposit targets.`,
			};
		}
		const nativeWrapped = parseOptionalAddress(input.nativeWrapped);
		let underlying = parseOptionalAddress(input.underlyingAddress ?? input.underlying);
		let isNativeIn = !!input.isNativeIn;
		if (!underlying) {
			const hint = String(input.underlyingAddress ?? input.underlying ?? '').trim();
			const assetAddr = vaultRow.asset.address?.trim();
			const assetSym = (vaultRow.asset.symbol ?? '').trim();
			if (
				assetAddr &&
				isAddress(assetAddr) &&
				(!hint ||
					hint.toUpperCase() === assetSym.toUpperCase() ||
					hint.toLowerCase() === assetAddr.toLowerCase())
			) {
				underlying = getAddress(assetAddr);
			} else {
				return {
					ok: false,
					reason:
						'underlying must be the vault deposit asset address (use underlyingAddress from ctm_morpho_fetch_earn_vaults).',
				};
			}
		}
		if (isNativeUnderlyingHint(String(input.underlyingAddress ?? input.underlying))) {
			if (!nativeWrapped) {
				return {ok: false, reason: 'nativeWrapped required when underlying is native ETH.'};
			}
			underlying = nativeWrapped;
			isNativeIn = true;
		}
		out.vault = vault;
		out.underlying = underlying;
		out.isNativeIn = isNativeIn;
		out.nativeWrapped = nativeWrapped ?? underlying;
		out.onBehalf = enriched.executorAddress;
		out.receiver = enriched.executorAddress;
		out.vaultMarketLabel = (vaultRow.symbol ?? vaultRow.name ?? 'Morpho vault').trim();
		return {ok: true, data: out};
	}

	if (toolName === MORPHO_VAULT_WITHDRAW_TOOL) {
		const vault = parseOptionalAddress(input.vaultAddress ?? input.vault);
		if (!vault) return {ok: false, reason: 'vaultAddress is required.'};
		const vaultRow = await fetchMorphoVaultByAddress({chainId, vaultAddress: vault});
		out.vault = vault;
		out.receiver = enriched.executorAddress;
		out.vaultShareOwner = enriched.executorAddress;
		out.vaultMarketLabel = (vaultRow?.symbol ?? vaultRow?.name ?? 'Morpho vault').trim();
		return {ok: true, data: out};
	}

	if (
		toolName === MORPHO_BLUE_COLLATERAL_DEPOSIT_TOOL ||
		toolName === MORPHO_BLUE_BORROW_TOOL ||
		toolName === MORPHO_BLUE_REPAY_TOOL ||
		toolName === MORPHO_BLUE_COLLATERAL_WITHDRAW_TOOL
	) {
		const resolved = await resolveMarket(toolName, chainId, input);
		if (!resolved.ok) return resolved;
		const market = resolved.data;
		out.morphoBlue = market.morphoBlueAddress;
		out.marketParams = market.marketParams;
		out.marketLabel = `${market.collateralAsset.symbol ?? 'COL'}/${market.loanAsset.symbol ?? 'LOAN'}`;
		out.onBehalf = enriched.executorAddress;
		out.receiver = enriched.executorAddress;

		if (toolName === MORPHO_BLUE_COLLATERAL_DEPOSIT_TOOL) {
			const collateral = parseOptionalAddress(input.collateralToken);
			if (!collateral) return {ok: false, reason: 'collateralToken is required.'};
			const nativeWrapped = parseOptionalAddress(input.nativeWrapped);
			if (isNativeUnderlyingHint(String(input.collateralToken)) && nativeWrapped) {
				out.collateralToken = nativeWrapped;
				out.isNativeIn = true;
				out.nativeWrapped = nativeWrapped;
			} else {
				out.collateralToken = collateral;
			}
		}
		if (toolName === MORPHO_BLUE_BORROW_TOOL || toolName === MORPHO_BLUE_REPAY_TOOL) {
			const loan = parseOptionalAddress(input.loanToken) ?? market.marketParams.loanToken;
			out.loanToken = loan;
		}
		if (toolName === MORPHO_BLUE_COLLATERAL_WITHDRAW_TOOL) {
			out.collateralDecimals =
				typeof input.collateralDecimals === 'number'
					? input.collateralDecimals
					: (market.collateralAsset.decimals ?? 18);
		}
		return {ok: true, data: out};
	}

	if (toolName === MORPHO_MERKL_CLAIM_TOOL) {
		const claimData = String(input.claimData ?? '').trim();
		if (!claimData.startsWith('0x')) {
			return {ok: false, reason: 'claimData must be hex calldata (0x…).'};
		}
		out.to = parseOptionalAddress(input.distributor) ?? MERKL_DISTRIBUTOR_FALLBACK;
		out.data = claimData as `0x${string}`;
		out.valueWei = BigInt(String(input.valueWei ?? '0'));
		out.claimLeafCount = typeof input.claimLeafCount === 'number' ? input.claimLeafCount : 1;
		return {ok: true, data: out};
	}

	if (
		toolName === MORPHO_MIDNIGHT_LEND_TOOL ||
		toolName === MORPHO_MIDNIGHT_BORROW_TOOL ||
		toolName === MORPHO_MIDNIGHT_REPAY_TOOL
	) {
		const marketId = String(input.marketId ?? '').trim();
		if (!marketId) {
			return {ok: false, reason: 'marketId is required for Morpho Midnight multisign tools.'};
		}
		const book = await fetchMorphoMidnightBook(marketId);
		const known = morphoMidnightAddressesForChain(chainId);
		const midnight =
			parseOptionalAddress(input.midnight) ??
			(book?.midnight ? getAddress(book.midnight) : undefined) ??
			known?.midnight;
		const bundles = parseOptionalAddress(input.bundles) ?? known?.bundles;
		if (!midnight || !bundles) {
			return {
				ok: false,
				reason: `Morpho Midnight addresses unknown for chain ${chainId}.`,
			};
		}
		out.marketId = marketId;
		out.midnight = midnight;
		out.bundles = bundles;
		out.marketLabel =
			String(input.marketLabel ?? '').trim() ||
			(book
				? `Midnight ${book.loanToken.slice(0, 6)}… · ${new Date(book.maturity * 1000).toISOString().slice(0, 10)}`
				: `Midnight ${marketId.slice(0, 10)}…`);
		out.taker = enriched.executorAddress;
		out.onBehalf = enriched.executorAddress;
		out.receiver = enriched.executorAddress;
		out.collateralReceiver = enriched.executorAddress;
		if (toolName === MORPHO_MIDNIGHT_LEND_TOOL) {
			out.loanToken =
				parseOptionalAddress(input.loanToken) ??
				(book?.loanToken ? getAddress(book.loanToken) : undefined);
		}
		if (toolName === MORPHO_MIDNIGHT_BORROW_TOOL) {
			const collateral =
				parseOptionalAddress(input.collateralToken) ??
				(book?.collaterals[0]?.token ? getAddress(book.collaterals[0].token) : undefined);
			if (!collateral) {
				return {ok: false, reason: 'collateralToken is required for Midnight borrow.'};
			}
			out.collateralToken = collateral;
			out.loanToken =
				parseOptionalAddress(input.loanToken) ??
				(book?.loanToken ? getAddress(book.loanToken) : undefined);
			const nativeWrapped = parseOptionalAddress(input.nativeWrapped);
			if (isNativeUnderlyingHint(String(input.collateralToken)) && nativeWrapped) {
				out.collateralToken = nativeWrapped;
				out.isNativeIn = true;
				out.nativeWrapped = nativeWrapped;
			}
		}
		if (toolName === MORPHO_MIDNIGHT_REPAY_TOOL) {
			out.loanToken =
				parseOptionalAddress(input.loanToken) ??
				(book?.loanToken ? getAddress(book.loanToken) : undefined);
		}
		return {ok: true, data: out};
	}

	return {ok: true, data: out};
}

function morphoCommonBuilderFields(parsed: Record<string, unknown>): Record<string, unknown> {
	return {
		purposeText: String(parsed.purposeText ?? '').trim(),
	};
}

export function mapMorphoMultisignBuilderArgs(
	toolName: string,
	parsed: Record<string, unknown>,
): Record<string, unknown> {
	if (toolName === MORPHO_VAULT_DEPOSIT_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			vault: parsed.vault,
			underlying: parsed.underlying,
			isNativeIn: parsed.isNativeIn,
			nativeWrapped: parsed.nativeWrapped,
			amountHuman: parsed.amountHuman,
			onBehalf: parsed.onBehalf,
			vaultMarketLabel: parsed.vaultMarketLabel,
		};
	}
	if (toolName === MORPHO_VAULT_WITHDRAW_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			vault: parsed.vault,
			amountHuman: parsed.amountHuman,
			receiver: parsed.receiver,
			vaultShareOwner: parsed.vaultShareOwner,
			vaultMarketLabel: parsed.vaultMarketLabel,
		};
	}
	if (toolName === MORPHO_BLUE_COLLATERAL_DEPOSIT_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			morphoBlue: parsed.morphoBlue,
			marketParams: parsed.marketParams,
			collateralToken: parsed.collateralToken,
			isNativeIn: parsed.isNativeIn,
			nativeWrapped: parsed.nativeWrapped,
			amountHuman: parsed.amountHuman,
			onBehalf: parsed.onBehalf,
			marketLabel: parsed.marketLabel,
		};
	}
	if (toolName === MORPHO_BLUE_BORROW_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			morphoBlue: parsed.morphoBlue,
			marketParams: parsed.marketParams,
			loanToken: parsed.loanToken,
			amountHuman: parsed.amountHuman,
			onBehalf: parsed.onBehalf,
			receiver: parsed.receiver,
			marketLabel: parsed.marketLabel,
		};
	}
	if (toolName === MORPHO_BLUE_REPAY_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			morphoBlue: parsed.morphoBlue,
			marketParams: parsed.marketParams,
			loanToken: parsed.loanToken,
			amountHuman: parsed.amountHuman,
			onBehalf: parsed.onBehalf,
			marketLabel: parsed.marketLabel,
		};
	}
	if (toolName === MORPHO_BLUE_COLLATERAL_WITHDRAW_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			morphoBlue: parsed.morphoBlue,
			marketParams: parsed.marketParams,
			amountHuman: parsed.amountHuman,
			collateralDecimals: parsed.collateralDecimals,
			onBehalf: parsed.onBehalf,
			receiver: parsed.receiver,
			marketLabel: parsed.marketLabel,
		};
	}
	if (toolName === MORPHO_MERKL_CLAIM_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			to: parsed.to,
			data: parsed.data,
			valueWei: parsed.valueWei,
			claimLeafCount: parsed.claimLeafCount,
		};
	}
	if (toolName === MORPHO_MIDNIGHT_LEND_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			marketId: parsed.marketId,
			amountHuman: parsed.amountHuman,
			loanToken: parsed.loanToken,
			slippagePct: parsed.slippagePct,
			midnight: parsed.midnight,
			bundles: parsed.bundles,
			isNativeIn: parsed.isNativeIn,
			nativeWrapped: parsed.nativeWrapped,
			taker: parsed.taker,
			receiver: parsed.receiver,
			marketLabel: parsed.marketLabel,
		};
	}
	if (toolName === MORPHO_MIDNIGHT_BORROW_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			marketId: parsed.marketId,
			borrowAmountHuman: parsed.borrowAmountHuman,
			collateralAmountHuman: parsed.collateralAmountHuman,
			collateralToken: parsed.collateralToken,
			loanToken: parsed.loanToken,
			collateralIndex: parsed.collateralIndex,
			slippagePct: parsed.slippagePct,
			midnight: parsed.midnight,
			bundles: parsed.bundles,
			isNativeIn: parsed.isNativeIn,
			nativeWrapped: parsed.nativeWrapped,
			taker: parsed.taker,
			receiver: parsed.receiver,
			marketLabel: parsed.marketLabel,
		};
	}
	if (toolName === MORPHO_MIDNIGHT_REPAY_TOOL) {
		return {
			...morphoCommonBuilderFields(parsed),
			marketId: parsed.marketId,
			repayAmountHuman: parsed.repayAmountHuman,
			loanToken: parsed.loanToken,
			withdrawAllCollateral: parsed.withdrawAllCollateral,
			midnight: parsed.midnight,
			bundles: parsed.bundles,
			onBehalf: parsed.onBehalf,
			collateralReceiver: parsed.collateralReceiver,
			marketLabel: parsed.marketLabel,
		};
	}
	return parsed;
}

export function mergeMorphoParsedWithPrepared(
	parsed: Record<string, unknown>,
	prepared: Record<string, unknown> | undefined,
): Record<string, unknown> {
	if (!prepared) return parsed;
	return {...parsed, ...prepared};
}
