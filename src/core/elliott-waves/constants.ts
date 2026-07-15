/** Frost & Prechter Fibonacci constants — from SmarterSystems ElliottWavesEngine (MIT). */

export const FIB_RETRACE_W2 = [0.786, 0.618, 0.5, 0.382] as const;
export const FIB_RETRACE_W4 = [0.786, 0.618, 0.5, 0.382, 0.236] as const;
export const FIB_EXT_W3 = [4.236, 2.618, 1.618, 1.0] as const;
export const FIB_EXT_W3_INTERMEDIATE = [1.618, 1.0, 0.618] as const;
export const FIB_W5 = [1.618, 1.0, 0.618] as const;
export const FIB_EXT_C = [2.618, 1.618, 1.0, 0.618] as const;

export const THRESHOLDS = {
	/** Log-scale tolerance for Fibonacci level matching (2%). */
	fibToleranceLog: 0.02,
	/** W1 confirmation: retrace must exceed 50% of the move. */
	w1ConfirmationRetrace: 0.5,
	/** Default recovery threshold for confirming extremes (10% log-scale). */
	defaultRecoveryThreshold: 0.1,
	/** W3 length must be >= 98% of W1 length. */
	w3LengthTolerance: 0.98,
	/** Extension multiple for detecting extended waves. */
	extensionMultiple: 1.618,
	/** Minimum bars — absolute floor before hard reject. */
	absoluteMinBars: 50,
	/** Minimum confidence for clear trade setup. */
	minTradeConfidence: 0.45,
} as const;
