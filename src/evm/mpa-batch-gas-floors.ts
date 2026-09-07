function normSig(signature?: string | null): string {
	return signature?.trim().toLowerCase() ?? '';
}

/**
 * Fallback gas when estimateGas reverts because earlier batch legs are not on-chain yet.
 * Linea `deposit(string,uint256)` estimateGas is ~210k; 160k OOGs at Execute.
 */
export const MPA_COMPOSE_BATCH_FALLBACK_GAS: Record<string, bigint> = {
	'register(string,string,string,uint256,string)': 200_000n,
	'attachvectm(string,uint256,(string,string,uint8[4],uint16[8],string,uint256,uint256,string,string,bytes))':
		220_000n,
	'claimnodewithdrawauthority(string,address,bytes,uint256)': 80_000n,
	'approve(address,uint256)': 80_000n,
	'deposit(string,uint256)': 280_000n,
	'depositctm(string,uint256)': 280_000n,
	'syncbilling(string,string,string,uint256)': 220_000n,
};

export function mpaComposeBatchFallbackGasRaw(signature?: string | null): bigint | null {
	return MPA_COMPOSE_BATCH_FALLBACK_GAS[normSig(signature)] ?? null;
}

const MPA_BILLING_SELECTOR_TO_SIGNATURE: Record<string, string> = {
	'0x8e27d719': 'deposit(string,uint256)',
	'0x7f2f3c37': 'depositCtm(string,uint256)',
	'0x88b0c9fa': 'syncBilling(string,string,string,uint256)',
	'0xbd6be1de': 'register(string,string,string,uint256,string)',
};

const ERC20_APPROVE_SELECTOR = '0x095ea7b3';

export function mpaSignatureFromCalldata(dataHex?: string | null): string | null {
	const h = dataHex?.trim().toLowerCase() ?? '';
	if (!h.startsWith('0x') || h.length < 10) return null;
	const sel = h.slice(0, 10);
	if (sel === ERC20_APPROVE_SELECTOR) return 'approve(address,uint256)';
	return MPA_BILLING_SELECTOR_TO_SIGNATURE[sel] ?? null;
}

/** Compose stores `{ signature, names }` JSON in SignatureText / batchMeta.signatureText. */
export function composeSignatureFromSignatureText(signatureText?: string | null): string | null {
	const t = signatureText?.trim();
	if (!t) return null;
	if (t.startsWith('{')) {
		try {
			const parsed = JSON.parse(t) as {signature?: unknown};
			if (typeof parsed.signature === 'string' && parsed.signature.trim()) {
				return parsed.signature.trim();
			}
		} catch {
			/* fall through */
		}
	}
	return t;
}
