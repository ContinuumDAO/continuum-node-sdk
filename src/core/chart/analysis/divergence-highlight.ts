import {kindLabel} from './divergence/detect.js';
import type {DivergenceKind, DivergenceOscillator, DivergencePrimary} from './divergence/types.js';
import type {DivergenceTradeSetup} from './trade-setups/divergence-trade-setup.js';

export type DivergenceHighlight = {
	summary: string;
	primaryKind: DivergenceKind | null;
	oscillator: DivergenceOscillator | null;
	side: 'long' | 'short' | 'neutral';
	status: 'clear' | 'unclear';
	confidence: number;
	conditionalNote: string;
	divergenceCount: number;
	unclearReason?: string;
};

function oscLabel(id: DivergenceOscillator | null): string {
	if (id === 'rsi') {
		return 'RSI';
	}
	if (id === 'stochasticrsi') {
		return 'Stochastic RSI';
	}
	return 'oscillator';
}

export function buildDivergenceHighlight(input: {
	primary: DivergencePrimary | null;
	setup: DivergenceTradeSetup | null;
	divergenceCount: number;
}): DivergenceHighlight {
	const setup = input.setup;
	const side = setup?.side ?? 'neutral';
	const status = setup?.status ?? 'unclear';
	const confidence = setup?.confidence ?? 0.35;
	const conditionalNote =
		setup?.conditionalNote ?? 'No RSI/Stochastic RSI divergence detected — no trade bias.';

	let summary: string;
	if (input.primary) {
		const kind = kindLabel(input.primary.kind);
		const osc = oscLabel(input.primary.oscillator);
		const bias =
			side === 'long' ? 'supports long' : side === 'short' ? 'supports short' : 'neutral';
		summary = `${kind} ${osc} divergence — ${bias} (confidence ${confidence.toFixed(2)}). ${input.divergenceCount} hit(s) on session.`;
	} else {
		summary = `No divergence detected (${input.divergenceCount} hits). Neutral bias.`;
	}

	return {
		summary,
		primaryKind: input.primary?.kind ?? null,
		oscillator: input.primary?.oscillator ?? null,
		side,
		status,
		confidence,
		conditionalNote,
		divergenceCount: input.divergenceCount,
		...(setup?.unclearReason ? {unclearReason: setup.unclearReason} : {}),
	};
}
