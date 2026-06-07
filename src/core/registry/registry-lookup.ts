import type {z} from 'zod';
import type {ChainRegistryEntrySchema, GetTokenRegistryData} from '../../schemas/extended.js';
import type {SdkResult} from '../result.js';

export type ChainRegistryEntry = z.infer<typeof ChainRegistryEntrySchema>;

export type FlatTokenRegistryEntry = {
	readonly chainType: string;
	readonly chainId: string;
	readonly tokenType: string;
	readonly contractAddress: string;
	readonly symbol: string;
	readonly name?: string;
	readonly decimals?: number;
	readonly transferSig?: string;
	/** ERC721: per-contract token id when stored on the node. */
	readonly tokenId?: string;
};

const TOKEN_TYPE_KEYS = ['ERC20', 'ERC721', 'CTMERC20', 'CTMRWA1'] as const;

export function normalizeRegistryNameQuery(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function chainsMatchingName(
	chains: readonly ChainRegistryEntry[],
	query: string,
): ChainRegistryEntry[] {
	const normalizedQuery = normalizeRegistryNameQuery(query);
	if (!normalizedQuery) {
		return [];
	}
	return chains.filter(chain => {
		const chainName = normalizeRegistryNameQuery(chain.chainName);
		return (
			chainName === normalizedQuery ||
			chainName.includes(normalizedQuery) ||
			normalizedQuery.includes(chainName)
		);
	});
}

export function formatConfiguredChains(chains: readonly ChainRegistryEntry[]): string {
	if (chains.length === 0) {
		return '(none)';
	}
	return chains.map(chain => `${chain.chainName} (${chain.chainId})`).join(', ');
}

export function flattenTokenRegistry(
	data: GetTokenRegistryData,
): FlatTokenRegistryEntry[] {
	const out: FlatTokenRegistryEntry[] = [];
	for (const [chainType, entries] of Object.entries(data)) {
		if (!Array.isArray(entries)) {
			continue;
		}
		for (const entry of entries) {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
				continue;
			}
			const record = entry as Record<string, unknown>;
			const chainId = String(record.chainId ?? '').trim();
			if (!chainId) {
				continue;
			}
			for (const tokenType of TOKEN_TYPE_KEYS) {
				const bucket = record[tokenType];
				if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
					continue;
				}
				const bucketRecord = bucket as Record<string, unknown>;
				const contracts = bucketRecord.contracts;
				if (!Array.isArray(contracts)) {
					continue;
				}
				const transferSig =
					typeof bucketRecord.transferSig === 'string'
						? bucketRecord.transferSig
						: undefined;
				for (const contract of contracts) {
					if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
						continue;
					}
					const contractRecord = contract as Record<string, unknown>;
					const contractAddress = String(contractRecord.contractAddress ?? '').trim();
					if (!contractAddress) {
						continue;
					}
					const tokenIdRaw = contractRecord.tokenId;
					const tokenId =
						tokenIdRaw != null && String(tokenIdRaw).trim() !== ''
							? String(tokenIdRaw).trim()
							: undefined;
					out.push({
						chainType,
						chainId,
						tokenType,
						contractAddress,
						symbol: String(contractRecord.symbol ?? '').trim(),
						name:
							typeof contractRecord.name === 'string'
								? contractRecord.name
								: undefined,
						decimals:
							typeof contractRecord.decimals === 'number' &&
							Number.isInteger(contractRecord.decimals) &&
							contractRecord.decimals >= 0
								? contractRecord.decimals
								: undefined,
						transferSig,
						tokenId,
					});
				}
			}
		}
	}
	return out;
}

export function tokensMatchingSymbol(
	tokens: readonly FlatTokenRegistryEntry[],
	symbol: string,
): FlatTokenRegistryEntry[] {
	const normalizedSymbol = symbol.trim().toLowerCase();
	if (!normalizedSymbol) {
		return [];
	}
	return tokens.filter(token => token.symbol.toLowerCase() === normalizedSymbol);
}

export function humanAmountToWei(amount: string, decimals: number): SdkResult<string> {
	const trimmed = amount.trim();
	if (!/^(\d+)?(\.\d+)?$/.test(trimmed) || trimmed === '' || trimmed === '.') {
		return {ok: false, reason: `Invalid amount "${amount}".`};
	}
	const [wholePart = '0', fractionPart = ''] = trimmed.split('.');
	const whole = wholePart === '' ? '0' : wholePart;
	if (fractionPart.length > decimals) {
		return {
			ok: false,
			reason: `Amount "${amount}" has more decimal places than the token supports (${decimals}).`,
		};
	}
	try {
		const wei = BigInt(whole + fractionPart.padEnd(decimals, '0'));
		if (wei <= 0n) {
			return {ok: false, reason: 'Amount must be greater than zero.'};
		}
		return {ok: true, data: wei.toString()};
	} catch {
		return {ok: false, reason: `Invalid amount "${amount}".`};
	}
}
