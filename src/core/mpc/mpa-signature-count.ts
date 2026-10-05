/** Highest usable billable signature count (never eth account nonce). */
export function reconcileKeyGenSignatureCount(
	...counts: Array<number | null | undefined>
): number | null {
	const nums = counts.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0);
	if (nums.length === 0) return null;
	return Math.max(...nums);
}
