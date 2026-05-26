/** Convert gwei number to decimal string (avoids scientific notation in viem parseGwei). */
export function gweiToDecimalString(n: number): string {
	if (!Number.isFinite(n)) return '0';
	if (n === 0) return '0';
	const s = String(n);
	if (s.indexOf('e') !== -1 || s.indexOf('E') !== -1) {
		return n.toFixed(9).replace(/\.?0+$/, '') || '0';
	}
	return s;
}
