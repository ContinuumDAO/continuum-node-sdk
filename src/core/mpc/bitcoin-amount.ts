/** Exact satoshi conversion. 0.1 BTC is 10000000 sats. */

export function bitcoinAmountToSats(amount: string, unit: 'btc' | 'sats'): bigint {
	const trimmed = amount.trim().replace(/,/g, '');
	if (!trimmed) {
		throw new Error('Amount is required.');
	}
	if (unit === 'sats') {
		if (!/^\d+$/.test(trimmed)) {
			throw new Error('Sats must be a whole number.');
		}
		const sats = BigInt(trimmed);
		if (sats <= 0n) {
			throw new Error('Amount must be greater than zero.');
		}
		return sats;
	}
	const normalized = trimmed.startsWith('.') ? `0${trimmed}` : trimmed;
	if (!/^\d+(\.\d{1,8})?$/.test(normalized)) {
		throw new Error('BTC amount must be a decimal with at most 8 places.');
	}
	const [whole, frac = ''] = normalized.split('.');
	const fracPadded = `${frac}00000000`.slice(0, 8);
	const sats = BigInt(whole ?? '0') * 100_000_000n + BigInt(fracPadded);
	if (sats <= 0n) {
		throw new Error('Amount must be greater than zero.');
	}
	return sats;
}

export function satsToBtcString(sats: bigint): string {
	const negative = sats < 0n;
	const value = negative ? -sats : sats;
	const whole = value / 100_000_000n;
	const frac = (value % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
	const text = frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
	return negative ? `-${text}` : text;
}
