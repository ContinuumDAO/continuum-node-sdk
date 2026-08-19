import {
	KEY_GEN_ADDRESS_KIND_BITCOIN_TAPROOT,
	KEY_GEN_ADDRESS_KIND_ETHEREUM,
	KEY_GEN_ADDRESS_KIND_NEAR,
	KEY_GEN_ADDRESS_KIND_SOLANA,
	KEY_GEN_ADDRESS_KIND_STELLAR,
	KEY_GEN_ADDRESS_KIND_SUI,
	KEY_GEN_ADDRESS_KIND_TON,
} from '../../config/mpa-wallet.js';

export type FeeAddressKind =
	| typeof KEY_GEN_ADDRESS_KIND_ETHEREUM
	| typeof KEY_GEN_ADDRESS_KIND_SOLANA
	| typeof KEY_GEN_ADDRESS_KIND_NEAR
	| typeof KEY_GEN_ADDRESS_KIND_TON
	| typeof KEY_GEN_ADDRESS_KIND_SUI
	| typeof KEY_GEN_ADDRESS_KIND_STELLAR
	| typeof KEY_GEN_ADDRESS_KIND_BITCOIN_TAPROOT
	| 'bitcoinSegwit';

function pickString(row: Record<string, unknown>, keys: string[]): string {
	for (const key of keys) {
		const v = row[key];
		if (typeof v === 'string' && v.trim()) return v.trim();
	}
	return '';
}

/** Maps a KeyGen result to the MultiSignAgentWallet addressKind (same table as mpc-auth). */
export function feeAddressKindForKeyGen(keyGenResult: Record<string, unknown> | null | undefined): FeeAddressKind {
	if (!keyGenResult) return KEY_GEN_ADDRESS_KIND_ETHEREUM;
	const keyType = pickString(keyGenResult, ['keytype', 'KeyType', 'keyType']).toLowerCase();
	if (keyType === 'bitcoin-taproot') return KEY_GEN_ADDRESS_KIND_BITCOIN_TAPROOT;
	if (keyType === 'ed25519') {
		const sol = pickString(keyGenResult, ['solanaaddress', 'SolanaAddress']);
		const near = pickString(keyGenResult, ['nearaddress', 'NearAddress']);
		const ton = pickString(keyGenResult, ['tonaddress', 'TonAddress']);
		const sui = pickString(keyGenResult, ['suiaddress', 'SuiAddress']);
		const stellar = pickString(keyGenResult, ['sorobanaddress', 'SorobanAddress']);
		const populated = [sol, near, ton, sui, stellar].filter(Boolean);
		if (populated.length === 1) {
			if (near) return KEY_GEN_ADDRESS_KIND_NEAR;
			if (ton) return KEY_GEN_ADDRESS_KIND_TON;
			if (sui) return KEY_GEN_ADDRESS_KIND_SUI;
			if (stellar) return KEY_GEN_ADDRESS_KIND_STELLAR;
		}
		return KEY_GEN_ADDRESS_KIND_SOLANA;
	}
	return KEY_GEN_ADDRESS_KIND_ETHEREUM;
}
